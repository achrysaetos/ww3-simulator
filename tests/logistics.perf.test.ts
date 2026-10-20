import { describe, expect, it } from 'vitest';
import type { Formation, NodeId } from '../src/core/types';
import { id, testWorld } from '../src/testkit';
import { logistics, supplyFactor } from '../src/systems/logistics';

const PLENTY = { fuel: 1e7, ammo: 1e7, food: 1e7 };
const DAY = 4; // ticks at the default 6 h

function setup() {
  const t = testWorld([logistics]);
  for (const n of Object.values(t.world.nations)) n.bulk = { ...PLENTY };
  const brigade = (nation: string, node: NodeId, extra: Partial<Formation> = {}) =>
    t.add({
      nation: id.nation(nation), name: `${nation} brigade`, kind: 'maneuver', echelon: 'brigade', node,
      equipment: { [id.platform('t_mbt')]: 90, [id.platform('t_ifv')]: 100, [id.platform('t_inf')]: 60 }, ...extra,
    });
  const drain = (f: Formation, frac: number) => {
    for (const c of ['fuel', 'ammo', 'food'] as const) f.supply[c] = f.supplyCapacity[c] * frac;
  };
  const fill = (f: Formation, c: 'fuel' | 'ammo' | 'food') => f.supply[c] / f.supplyCapacity[c];
  return { ...t, brigade, drain, fill };
}

describe('logistics performance', () => {
  it('steps 3,000 formations across 30 nations within budget, quiet and under churn', () => {
    const t = setup();
    const nations = Object.values(t.world.nations).filter((n) => t.map.nodesOf(n.id).length >= 20).slice(0, 30);
    expect(nations.length).toBe(30);
    const cells = nations.map((n) => t.map.nodesOf(n.id));
    for (const [i, n] of nations.entries()) {
      for (let k = 0; k < 100; k++) t.brigade(n.id, cells[i][(k * 7 + i) % cells[i].length], { name: `${n.id}-${k}` });
      if (i % 2) t.war(n.id, nations[i - 1].id);
    }
    const time = (ticks: number, churn: boolean) => {
      const times: number[] = [];
      for (let k = 0; k < ticks; k++) {
        if (churn)
          for (const [i, n] of nations.entries()) {
            const cell = cells[i][(k * 13) % cells[i].length];
            t.world.control[cell] = t.world.control[cell] === n.id ? nations[i ^ 1].id : n.id;
            t.world.theater.infrastructure[cells[i][(k * 5) % cells[i].length]] = 0.5;
          }
        const s = performance.now();
        t.engine.step(t.world);
        times.push(performance.now() - s);
      }
      return { avg: times.reduce((a, b) => a + b, 0) / times.length, worst: Math.max(...times) };
    };
    const cold = time(1, false);
    const quiet = time(4 * DAY, false);
    const churn = time(4 * DAY, true);
    console.log(`logistics step, 3000 formations / 30 nations: cold ${cold.avg.toFixed(1)} ms; quiet avg ${quiet.avg.toFixed(1)} worst ${quiet.worst.toFixed(1)} ms; churn avg ${churn.avg.toFixed(1)} worst ${churn.worst.toFixed(1)} ms`);
    expect(Object.keys(t.world.slices.logistics.networks).length).toBe(30);
    expect(quiet.avg).toBeLessThan(30);
    expect(churn.avg).toBeLessThan(50);
  });
});

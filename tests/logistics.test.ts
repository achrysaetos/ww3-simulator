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

describe('logistics', () => {
  it('fully resupplies a formation deep in rail-rich friendly territory', () => {
    const t = setup();
    const f = t.brigade('POL', t.nodeAt(52.4, 16.9)); // Poznan
    t.drain(f, 0.3);
    t.engine.run(t.world, 2 * DAY);
    expect(supplyFactor(t.world, f.node, id.nation('POL'))).toBeGreaterThan(0.85);
    expect(t.fill(f, 'fuel')).toBeGreaterThan(0.95);
    expect(t.fill(f, 'ammo')).toBeGreaterThan(0.95);
    expect(t.world.nations[id.nation('POL')].bulk.fuel).toBeLessThan(PLENTY.fuel);
  });

  it('starves a formation 650 km of desert past the railhead', () => {
    const t = setup();
    const north = t.brigade('DZA', t.nodeAt(35.5, 0.5)); // on the coastal rail net
    const deep = t.brigade('DZA', t.nodeAt(27.2, 2.5)); // In Salah; rail ends near 33.5N
    t.drain(north, 0.3);
    t.drain(deep, 0.3);
    t.engine.run(t.world, 2 * DAY);
    const dza = id.nation('DZA');
    expect(supplyFactor(t.world, deep.node, dza)).toBeLessThan(0.2);
    expect(supplyFactor(t.world, north.node, dza)).toBeGreaterThan(0.8);
    expect(t.fill(deep, 'ammo')).toBeLessThan(0.45);
    expect(t.fill(north, 'ammo')).toBeGreaterThan(0.95);
  });

  it('gives an encircled formation nothing, so it runs dry', () => {
    const t = setup();
    const pocket = t.nodeAt(49.5, 33.5);
    expect(t.map.airports[pocket]).toBe(0);
    for (const n of t.map.neighbors(pocket)) t.world.control[n] = id.nation('RUS');
    t.war('UKR', 'RUS');
    const f = t.brigade('UKR', pocket);
    const bulkBefore = t.world.nations[id.nation('UKR')].bulk.food;
    const fuelBefore = f.supply.fuel;
    t.engine.run(t.world, 6 * DAY);
    expect(supplyFactor(t.world, pocket, id.nation('UKR'))).toBe(0);
    expect(f.supply.food).toBe(0);
    expect(f.supply.fuel).toBeLessThan(fuelBefore);
    expect(t.world.nations[id.nation('UKR')].bulk.food).toBe(bulkBefore);
  });

  it('cuts an expeditionary force when the enemy takes the sea lanes', () => {
    const t = setup();
    const usa = id.nation('USA');
    const outpost = 2375 as NodeId; // Icelandic port cell held by a US garrison, no airfield
    expect(t.map.ports[outpost]).toBeGreaterThan(0);
    expect(t.map.airports[outpost]).toBe(0);
    t.world.control[outpost] = usa;
    const f = t.brigade('USA', outpost);
    t.engine.step(t.world);
    const open = supplyFactor(t.world, outpost, usa);
    expect(open).toBeGreaterThan(0.15); // a one-berth port caps it near a third

    t.war('USA', 'RUS');
    for (const n of t.map.nodesWithin(outpost, 2000)) if (t.map.isSea(n)) t.world.theater.seaControl[n] = { nation: id.nation('RUS'), level: 0.95 };
    t.engine.run(t.world, DAY);
    expect(supplyFactor(t.world, outpost, usa)).toBeLessThan(open * 0.2);
    t.drain(f, 0.3);
    t.engine.run(t.world, 2 * DAY);
    expect(t.fill(f, 'ammo')).toBeLessThan(0.36); // the open route would have refilled it past 0.5
  });

  it('supplies forces abroad through allied depots and ports only when they share a bloc', () => {
    const t = setup();
    const lublin = t.nodeAt(51.2, 22.6);
    const f = t.brigade('USA', lublin);
    t.engine.step(t.world);
    expect(supplyFactor(t.world, lublin, f.nation)).toBe(0);

    t.world.nations[id.nation('USA')].blocs = ['NATO'];
    t.world.nations[id.nation('POL')].blocs = ['NATO'];
    t.engine.step(t.world);
    expect(supplyFactor(t.world, lublin, f.nation)).toBeGreaterThan(0.8);
  });

  it('chokes throughput when infrastructure is bombed, then repairs it on friendly ground', () => {
    const t = setup();
    const poznan = t.nodeAt(52.4, 16.9);
    t.brigade('POL', poznan);
    t.engine.step(t.world);
    const intact = supplyFactor(t.world, poznan, id.nation('POL'));

    const hit = t.map.nodesWithin(poznan, 250);
    for (const n of hit) t.world.theater.infrastructure[n] = 0.15;
    t.engine.run(t.world, DAY);
    const bombed = supplyFactor(t.world, poznan, id.nation('POL'));
    expect(bombed).toBeLessThan(intact * 0.3);

    t.engine.run(t.world, 10 * DAY);
    expect(t.world.theater.infrastructure[poznan]).toBeGreaterThan(0.4);
    expect(supplyFactor(t.world, poznan, id.nation('POL'))).toBeGreaterThan(bombed);
  });

  it('does not repair infrastructure on the front line', () => {
    const t = setup();
    const kharkiv = t.nodeAt(50, 36.2); // borders Russian-held cells
    t.war('UKR', 'RUS');
    t.world.theater.infrastructure[kharkiv] = 0.2;
    t.engine.run(t.world, 5 * DAY);
    expect(t.world.theater.infrastructure[kharkiv]).toBe(0.2);
  });

  it('drains national bulk stocks and reports a shortage once', () => {
    const t = setup();
    const pol = t.world.nations[id.nation('POL')];
    pol.bulk.fuel = 50;
    const f = t.brigade('POL', t.nodeAt(52.4, 16.9));
    f.supply.fuel = 0;
    const events: string[] = [];
    t.engine.run(t.world, 4, (_, ev) => ev.forEach((e) => e.type === 'shortage' && e.nation === 'POL' && events.push(e.what)));
    expect(pol.bulk.fuel).toBe(0);
    expect(f.supply.fuel).toBeLessThanOrEqual(50);
    expect(f.supply.fuel / f.supplyCapacity.fuel).toBeLessThan(0.05);
    expect(events).toEqual(['fuel']);
  });

  it('returns damaged platforms to service over days when supplied, not when cut off', () => {
    const t = setup();
    const mbt = id.platform('t_mbt');
    const ok = t.brigade('POL', t.nodeAt(52.4, 16.9), { equipment: { [mbt]: 60 }, damaged: { [mbt]: 30 } });
    const pocket = t.nodeAt(49.5, 33.5);
    for (const n of t.map.neighbors(pocket)) t.world.control[n] = id.nation('RUS');
    t.war('UKR', 'RUS');
    const cut = t.brigade('UKR', pocket, { equipment: { [mbt]: 60 }, damaged: { [mbt]: 30 } });
    t.engine.run(t.world, DAY);
    expect(ok.equipment[mbt]).toBeGreaterThan(60);
    expect(ok.equipment[mbt]).toBeLessThan(70);
    t.engine.run(t.world, 20 * DAY);
    expect(ok.equipment[mbt] + (ok.damaged[mbt] ?? 0)).toBe(90);
    expect(ok.damaged[mbt] ?? 0).toBeLessThan(10);
    expect(cut.equipment[mbt]).toBe(60);
    expect(cut.damaged[mbt]).toBe(30);
  });

  it('rebuilds losses from the national stockpile and reserves, never beyond establishment', () => {
    const t = setup();
    const mbt = id.platform('t_mbt');
    const pol = t.world.nations[id.nation('POL')];
    const f = t.brigade('POL', t.nodeAt(52.4, 16.9), { equipment: { [mbt]: 100 } });
    t.engine.step(t.world);
    const fullCrew = f.personnel;
    f.equipment[mbt] = 40;
    f.personnel = Math.round(fullCrew * 0.4);
    f.order = { posture: 'reserve', issuedTick: t.world.tick };
    pol.stockpile[mbt] = 1000;
    const reserves = pol.reserves;
    t.engine.run(t.world, 30 * DAY);
    expect(f.equipment[mbt]).toBe(100);
    expect(pol.stockpile[mbt]).toBe(940);
    expect(f.personnel).toBe(fullCrew);
    expect(pol.reserves).toBe(reserves - (fullCrew - Math.round(fullCrew * 0.4)));

    const t2 = setup();
    const g = t2.brigade('POL', t2.nodeAt(52.4, 16.9), { equipment: { [mbt]: 100 } });
    t2.engine.step(t2.world);
    g.equipment[mbt] = 40;
    t2.engine.run(t2.world, 10 * DAY);
    expect(g.equipment[mbt]).toBe(40);
  });

  it('rations a cell shared by many formations', () => {
    const t = setup();
    const node = t.nodeAt(52.4, 16.9);
    const one = t.brigade('POL', node);
    t.drain(one, 0);
    const t2 = setup();
    const crowd = Array.from({ length: 40 }, () => t2.brigade('POL', node));
    crowd.forEach((f) => t2.drain(f, 0));
    t.engine.step(t.world);
    t2.engine.step(t2.world);
    expect(t2.fill(crowd[0], 'fuel')).toBeLessThan(t.fill(one, 'fuel') * 0.8);
  });

  it('is deterministic', () => {
    const run = () => {
      const t = setup();
      t.war('UKR', 'RUS');
      t.brigade('UKR', t.nodeAt(50, 36.2), { damaged: { [id.platform('t_mbt')]: 20 } });
      t.brigade('RUS', t.nodeAt(51, 38));
      t.engine.run(t.world, 12);
      return JSON.stringify(t.world);
    };
    expect(run()).toBe(run());
  });

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
    expect(quiet.avg).toBeLessThan(15);
    expect(churn.avg).toBeLessThan(35);
  });
});

import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { NationId, NodeId, PlatformId } from '../src/core/types';
import { applyLandOrder, landCombat, landMovement } from '../src/systems/land';
import { id, testWorld } from '../src/testkit';

const EAST = ['RUS', 'BLR', 'CHN', 'IRN', 'PRK'];
const WEST = ['UKR', 'POL', 'FIN', 'EST', 'LVA', 'LTU', 'ROU', 'DEU', 'FRA', 'GBR', 'TUR', 'IND', 'KOR', 'JPN', 'VNM', 'MNG', 'KAZ', 'GEO', 'AZE'];

/** 3,000 brigades across Europe and Asia, two coalitions at war, a third marching or attacking. */
function bigTheater(count = 3000) {
  const t = testWorld([landMovement, landCombat], 5);
  for (const a of EAST) for (const b of WEST) t.war(a, b);
  for (const n of Object.values(t.world.nations)) n.blocs = EAST.includes(n.id) ? ['EAST'] : WEST.includes(n.id) ? ['WEST'] : [];
  const rng = new Rng(77);
  const cells: NodeId[] = [];
  for (let n = 0; n < t.map.landCount; n++) {
    const lat = t.map.lat[n], lon = t.map.lon[n];
    if (lat > 10 && lat < 70 && lon > -10 && lon < 145 && t.map.owner[n]) cells.push(n as NodeId);
  }
  const ctx = t.engine.context(t.world);
  const equipment: Record<PlatformId, number> = { [id.platform('t_mbt')]: 90, [id.platform('t_ifv')]: 130, [id.platform('t_inf')]: 120, [id.platform('t_spg')]: 18 };
  let ordered = 0;
  for (let i = 0; i < count; i++) {
    const node = rng.pick(cells);
    const f = t.add({ nation: t.map.owner[node] as NationId, name: `b${i}`, kind: i % 5 === 0 ? 'artillery' : 'maneuver', echelon: 'brigade', node, equipment });
    if (i % 3) continue;
    let target = node;
    for (let k = 0; k < 4; k++) {
      const ns = [...t.map.neighbors(target)].filter((n) => !t.map.isSea(n));
      if (ns.length) target = rng.pick(ns);
    }
    if (applyLandOrder(t.world, { type: 'order', nation: f.nation, formation: f.id, order: { posture: 'attack', target } }, ctx) && f.order.path) ordered++;
  }
  return { ...t, ordered };
}

describe('land performance', () => {
  it('steps 3,000 formations across Europe and Asia well under the 50 ms budget', () => {
    const t = bigTheater();
    expect(t.ordered).toBeGreaterThan(300);
    t.engine.run(t.world, 4);
    const times: number[] = [];
    let battles = 0;
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      battles += t.engine.step(t.world).filter((e) => e.type === 'battle').length;
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const median = times[times.length >> 1];
    console.log(`land step, 3000 formations: median ${median.toFixed(1)} ms, max ${times[times.length - 1].toFixed(1)} ms, ${battles} battles over 20 ticks`);
    expect(battles).toBeGreaterThan(0);
    expect(median).toBeLessThan(50);
  });
});

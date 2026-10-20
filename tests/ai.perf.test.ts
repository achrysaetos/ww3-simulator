import { expect, it } from 'vitest';
import type { System } from '../src/core/engine';
import type { FormationKind, NodeId } from '../src/core/types';
import { createAi } from '../src/systems/ai';
import { createDiplomacy } from '../src/systems/diplomacy';
import { id, testWorld } from '../src/testkit';

const KINDS: [FormationKind, string, number][] = [
  ['maneuver', 't_mbt', 30],
  ['maneuver', 't_ifv', 40],
  ['artillery', 't_spg', 18],
  ['air_defense', 't_sam_bn', 6],
  ['missile', 't_tel', 12],
  ['air_wing', 't_fighter', 24],
  ['surface_group', 't_destroyer', 4],
  ['submarine', 't_ssn', 2],
];

const timed = (s: System, ms: { total: number }): System => ({
  ...s,
  step(world, ctx) {
    const t0 = performance.now();
    s.step(world, ctx);
    ms.total += performance.now() - t0;
  },
});

it('diplomacy and AI each stay well inside the 50 ms tick budget with 5,000 formations in a two-bloc war', () => {
  const dip = { total: 0 }, ai = { total: 0 };
  const t = testWorld([timed(createDiplomacy(), dip), timed(createAi(), ai)]);
  const east = ['RUS', 'CHN', 'BLR', 'PRK', 'IRN'];
  const west = ['USA', 'POL', 'DEU', 'FIN', 'EST', 'LVA', 'LTU', 'JPN', 'KOR', 'TWN', 'GBR', 'FRA', 'UKR', 'IND'];
  for (const a of east) for (const b of west) t.war(a, b);
  const nations = [...east, ...west];
  const sea = Array.from({ length: t.map.size - t.map.landCount }, (_, i) => (t.map.landCount + i) as NodeId);
  let k = 0;
  for (let i = 0; i < 5000; i++) {
    const n = nations[i % nations.length];
    const [kind, platform, count] = KINDS[k++ % KINDS.length];
    const own = t.map.nodesOf(id.nation(n));
    const node = kind === 'surface_group' || kind === 'submarine' ? sea[(i * 7919) % sea.length] : own[(i * 104729) % own.length];
    t.add({ nation: id.nation(n), name: `${n}-${i}`, kind, echelon: 'brigade', node, equipment: { [id.platform(platform)]: count } });
  }
  t.engine.step(t.world);
  dip.total = ai.total = 0;
  const ticks = 16;
  t.engine.run(t.world, ticks);
  console.log(`diplomacy ${(dip.total / ticks).toFixed(1)} ms/tick, ai ${(ai.total / ticks).toFixed(1)} ms/tick`);
  expect(dip.total / ticks).toBeLessThan(20);
  expect(ai.total / ticks).toBeLessThan(45);
});

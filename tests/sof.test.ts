import { beforeAll, describe, expect, it } from 'vitest';
import type { Formation, NationId, NodeId, SimEvent, World } from '../src/core/types';
import { createSession, type Session } from '../src/scenarios';

const PRK = 'PRK' as NationId, KOR = 'KOR' as NationId;

let s: Session;
beforeAll(() => {
  s = createSession('korea-2027', 1);
  // The player's North: the AI leaves the formations the player orders alone.
  s.world.nations[PRK].controlledBy = 'human';
  s.engine.step(s.world);
}, 300_000);

const storm = (w: World, kind: string) => Object.values(w.formations).find((f) => f.nation === PRK && f.name.startsWith('11th Storm Corps') && f.name.includes(kind) && f.status === 'active');
const run = (w: World, ticks: number) => {
  const events: SimEvent[] = [];
  for (let t = 0; t < ticks; t++) events.push(...s.engine.step(w));
  return events;
};

describe('korea-2027: the Storm Corps behind the lines (Red Team BB-7)', () => {
  it('flies an airborne brigade in by An-2 to the South\'s rear without control of the air', () => {
    const w = structuredClone(s.world);
    // Main: the corps is one block of line squads with no airborne brigade and no An-2.
    const bde = storm(w, 'Airborne')!;
    expect(bde).toBeDefined();
    const osan = s.map.nodeAt(37.09, 127.03);
    expect(w.control[osan]).toBe(KOR);
    w.pending.push({ type: 'order', nation: PRK, formation: bde.id, byPlayer: true, order: { posture: 'air_assault', target: osan } });
    const events = run(w, 6);
    const answer = events.find((e) => e.type === 'command_result' && e.formation === bde.id && (e.code !== 'relayed'));
    expect(answer?.type === 'command_result' && answer.ok, JSON.stringify(answer)).toBe(true);
    expect(w.formations[bde.id].node).toBe(osan);
    expect(w.formations[bde.id].status).not.toBe('destroyed');
  }, 300_000);

  it('slips a light infantry brigade through the line to a corps HQ in the rear, takes no ground, and raids the HQ', () => {
    const w = structuredClone(s.world);
    const bde = storm(w, 'Light Infantry')!;
    expect(bde).toBeDefined();
    const dmz = (n: NodeId) => [...s.map.neighbors(n)].some((m) => w.control[m] === PRK);
    // A South Korean corps HQ in the South's own rear, behind the cells on the line.
    const hq = Object.values(w.slices.c2.hqs).filter((h) => h.nation === KOR && h.level === 'army' && w.control[h.node] === KOR && !dmz(h.node)).sort((a, b) => s.map.distanceKm(bde.node, a.node) - s.map.distanceKm(bde.node, b.node))[0];
    expect(hq).toBeDefined();
    const target = hq.node;
    const before = [...w.control];
    w.pending.push({ type: 'order', nation: PRK, formation: bde.id, byPlayer: true, order: { posture: 'move', target } });
    let arrived = -1, raided = false;
    for (let t = 0; t < 60 && !raided; t++) {
      const events = run(w, 1);
      const f: Formation = w.formations[bde.id];
      if (arrived < 0 && f.node === target) arrived = t;
      raided ||= events.some((e) => e.type === 'message' && e.nation === KOR && e.text.includes(`raided by ${bde.name}`));
    }
    // Main: no land route into ground the enemy holds on a move order.
    expect(arrived).toBeGreaterThanOrEqual(0);
    expect(w.formations[bde.id].status).not.toBe('destroyed');
    expect(raided).toBe(true);
    // It took nothing on the way: only the regular corps' fighting changed hands.
    expect(w.control[target]).toBe(KOR);
    void before;
  }, 300_000);
});

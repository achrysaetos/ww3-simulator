import { describe, expect, it } from 'vitest';
import type { Formation, NationId, NodeId } from '../src/core/types';
import { createSession } from '../src/scenarios';

const AZE = 'AZE' as NationId;

/** An Azerbaijani brigade near Baku marched west across its own country, ordered once or re-ordered every tick. */
function march(reorder: boolean) {
  const s = createSession('peace-2027', 1);
  const w = s.world, { map } = s.engine;
  w.nations[AZE].controlledBy = 'human';
  const baku = map.nodeAt(40.4, 49.87);
  const f = Object.values(w.formations).filter((x) => x.nation === AZE && x.kind === 'maneuver').sort((a, b) => map.distanceKm(baku, a.node) - map.distanceKm(baku, b.node) || (a.id < b.id ? -1 : 1))[0] as Formation;
  const target = ([...Array(map.landCount).keys()] as NodeId[])
    .filter((n) => w.control[n] === AZE)
    .filter((n) => map.distanceKm(f.node, n) > 150 && map.distanceKm(f.node, n) < 300)
    .sort((a, b) => map.distanceKm(f.node, b) - map.distanceKm(f.node, a) || a - b)[0];
  const order = { type: 'order' as const, nation: AZE, formation: f.id, byPlayer: true, order: { posture: 'move' as const, target } };
  w.pending.push(order);
  const progress: number[] = [];
  for (let t = 0; t < 16; t++) {
    if (reorder && t > 0 && f.node !== target) w.pending.push({ ...order, order: { ...order.order } });
    s.engine.step(w);
    progress.push(Math.round(f.progressKm));
  }
  return { node: f.node, arrived: f.node === target, progress };
}

describe('re-sending the same order (Red Team XP-8)', () => {
  it('keeps the ground already covered, so a re-ordered brigade arrives as one ordered once', () => {
    const once = march(false), again = march(true);
    expect(once.arrived, JSON.stringify(once)).toBe(true);
    // Main: progress drops to 0 on every re-order and the brigade never leaves the first cell.
    expect(again).toEqual(once);
  }, 120_000);
});

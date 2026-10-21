import type { GameMap } from '../../core/map';
import type { World } from '../../core/types';

/** Warhead mass a chokepoint's `hitsToClose` is counted in: a 450 kg-class bomb or cruise-missile warhead (Storm Shadow, Mk 84 class). */
const REFERENCE_WARHEAD_KG = 450;

/** Share of the chokepoint's capacity open, 0..1. */
export function chokepointLevel(world: World, id: string): number {
  return world.theater.chokepoints?.[id] ?? 1;
}

/**
 * Applies `hits` warheads of `warheadKg` that reached chokepoint `id`: each closes 1/hitsToClose of it,
 * scaled by warhead mass against a 450 kg-class warhead. The entry point for any strike system aiming
 * at a bridge, tunnel or isthmus. Returns its open share before and after, or undefined for an unknown id.
 */
export function strikeChokepoint(world: World, map: GameMap, id: string, warheadKg: number, hits: number): { before: number; after: number } | undefined {
  const cp = map.chokepoints.find((c) => c.id === id);
  if (!cp) return undefined;
  const before = chokepointLevel(world, id);
  const after = Math.max(0, before - (hits * warheadKg) / REFERENCE_WARHEAD_KG / cp.hitsToClose);
  (world.theater.chokepoints ??= {})[id] = after;
  return { before, after };
}

/** Engineers rebuild each damaged chokepoint from closed to intact over its `repairDays`. */
export function repairChokepoints(world: World, map: GameMap, dtDays: number): void {
  const levels = world.theater.chokepoints;
  if (!levels) return;
  for (const cp of map.chokepoints) {
    const level = levels[cp.id];
    if (level === undefined) continue;
    const next = level + dtDays / cp.repairDays;
    if (next >= 1) delete levels[cp.id];
    else levels[cp.id] = next;
  }
}

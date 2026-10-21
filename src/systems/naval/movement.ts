import { atWar } from '../../core/engine';
import type { GameMap } from '../../core/map';
import { findPath } from '../../core/path';
import type { Formation, NationId, NodeId, World } from '../../core/types';
import { geography, sameWaters, seaNeighbour } from './geography';
import type { Composition } from './state';
import { MINE_CLOSURE } from './tables';

/** Fraction of transit fuel burn spent per hour holding station (loiter on one shaft, estimate). */
const LOITER_BURN = 0.2;

/** Hostile mines at a node close it to this nation. */
export function minedClosed(world: World, node: number, nation: NationId): boolean {
  const laid = world.slices.naval.mines[node];
  if (!laid) return false;
  let hostile = 0;
  for (const [layer, n] of Object.entries(laid)) if (atWar(world, layer as NationId, nation)) hostile += n;
  return hostile >= MINE_CLOSURE;
}

/**
 * Where a ship ordered to `target` actually goes: the sea node itself, a friendly or neutral
 * port, or (for any other coastal cell, including a hostile port) the sea zone off that coast.
 */
export function navalDestination(world: World, map: GameMap, nation: NationId, target: NodeId): NodeId | undefined {
  if (map.isSea(target)) return target;
  const owner = world.control[target];
  if (geography(map).portZone.has(target) && !atWar(world, owner, nation)) return target;
  return seaNeighbour(map, target);
}

/** Whether `f` can be sent toward `target` at all: a destination exists and open water joins it (orders refuse the rest). */
export function sailable(world: World, map: GameMap, f: Formation, target: NodeId): boolean {
  const dest = navalDestination(world, map, f.nation, target);
  return dest !== undefined && sameWaters(map, f.node, dest);
}

/** A* over sea zones, canals, and the start/end port. Hostile minefields are impassable except as the destination. */
export function seaPath(world: World, map: GameMap, nation: NationId, from: NodeId, to: NodeId): NodeId[] | null {
  const geo = geography(map);
  return findPath(map, from, to, (_a, b, km) => {
    if (map.isSea(b)) return b !== to && minedClosed(world, b, nation) ? Infinity : km;
    if (geo.canalNodes.has(b)) return km;
    return b === to && geo.portZone.has(b) ? km : Infinity;
  }, 50_000);
}

/** Move along order.path at the slowest hull's speed, burning fuel per km so a full load lasts the platform's rated range. */
export function advance(world: World, map: GameMap, f: Formation, comp: Composition): void {
  const hours = world.dtHours;
  const burnPerKm = Number.isFinite(comp.rangeKm) && comp.rangeKm > 0 ? f.supplyCapacity.fuel / comp.rangeKm : 0;
  f.supply.food = Math.max(0, f.supply.food - (f.supplyCapacity.food / comp.enduranceDays) * (hours / 24));
  const path = f.order.path;
  if (!path?.length) {
    f.supply.fuel = Math.max(0, f.supply.fuel - burnPerKm * comp.speedKph * hours * LOITER_BURN);
    return;
  }
  let budget = comp.speedKph * hours;
  if (burnPerKm > 0) budget = Math.min(budget, f.supply.fuel / burnPerKm);
  let moved = 0;
  while (path.length && budget > 1e-9) {
    const need = map.distanceKm(f.node, path[0]) - f.progressKm;
    if (budget >= need) {
      budget -= need;
      moved += need;
      f.node = path.shift()!;
      f.progressKm = 0;
    } else {
      f.progressKm += budget;
      moved += budget;
      budget = 0;
    }
  }
  f.supply.fuel = Math.max(0, f.supply.fuel - moved * burnPerKm);
}

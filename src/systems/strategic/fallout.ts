import type { SimContext } from '../../core/engine';
import { hoursElapsed } from '../../core/engine';
import type { GameMap } from '../../core/map';
import type { NodeId, World } from '../../core/types';
import { cellAreaKm2, nodePopulation, recordDeaths, survivingShare } from './demography';
import { PLUME_SHARES, falloutDose, falloutDoseRate, falloutFatalFraction, falloutDeniesUse, falloutR1, PLUME_COVER } from './effects';

/**
 * Next cell downwind. Prevailing surface-to-mid-troposphere winds: westerlies between 30 and 60 degrees of latitude
 * blow fallout east; trade winds and polar easterlies blow it west.
 */
export function downwind(map: GameMap, node: NodeId): NodeId {
  const lat = Math.abs(map.lat[node]);
  const east = lat >= 30 && lat < 60 ? 1 : -1;
  let best = node, bestScore = -Infinity;
  for (const m of map.neighbors(node)) {
    const dLon = ((map.lon[m] - map.lon[node] + 540) % 360) - 180;
    const score = east * dLon - 0.5 * Math.abs(map.lat[m] - map.lat[node]);
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

/** Lay down local fallout from one surface burst along its plume. */
export function depositFallout(world: World, map: GameMap, node: NodeId, yieldKt: number): void {
  const s = world.slices.strategic;
  const hour = hoursElapsed(world);
  let at = node;
  for (const share of PLUME_SHARES) {
    s.fallout.push({ node: at, r1: falloutR1(yieldKt, share, cellAreaKm2(map, at)), detonationHour: hour });
    at = downwind(map, at);
  }
}

/** Below this cell-average H+1-equivalent rate a deposit no longer matters and is dropped. */
const NEGLIGIBLE_RATE = 1e-4;

/**
 * Advance fallout by one tick: accumulate dose, kill the exposed, publish current dose rates on theater.fallout
 * (cell-average rad/h), and drop spent deposits.
 */
export function stepFallout(world: World, ctx: SimContext): void {
  const s = world.slices.strategic;
  const t0 = hoursElapsed(world), t1 = t0 + world.dtHours;
  const rate: Record<number, number> = {};
  const doseAdded = new Map<number, number>();
  s.fallout = s.fallout.filter((src) => {
    doseAdded.set(src.node, (doseAdded.get(src.node) ?? 0) + falloutDose(src.r1, t0 - src.detonationHour, t1 - src.detonationHour));
    const r = falloutDoseRate(src.r1, t1 - src.detonationHour);
    rate[src.node] = (rate[src.node] ?? 0) + r;
    return r >= NEGLIGIBLE_RATE;
  });
  for (const [node, added] of doseAdded) {
    const before = s.dose[node] ?? 0, after = before + added;
    s.dose[node] = after;
    if (ctx.map.isSea(node as NodeId)) continue;
    const p = nodePopulation(world, ctx.map, node as NodeId);
    // Lethality follows the cumulative dose, so deaths spread over the days the dose builds up.
    const exposed = p.total * PLUME_COVER * survivingShare(world, p, node as NodeId);
    recordDeaths(world, p, node as NodeId, exposed * (falloutFatalFraction(after) - falloutFatalFraction(before)));
  }
  world.theater.fallout = rate;
}

/** Whether fallout currently denies military use of a node (movement, basing, resupply). */
export function falloutDenied(world: World, node: NodeId): boolean {
  return falloutDeniesUse(world.theater.fallout[node] ?? 0);
}

import type { SimContext } from '../../core/engine';
import type { GameMap } from '../../core/map';
import type { NationId, NodeId, World } from '../../core/types';
import { cyberCapability } from '../strategic';
import { accessKey, type AccessStage, type CyberAccess, type CyberSector, type NonKineticState } from './state';
import { ACCESS_DAYS, BUILD_DISCOVERY_MULT, DISCOVERY_PER_DAY, PAYLOAD, PAYLOAD_CELLS } from './tables';

const NEXT: Record<AccessStage, AccessStage> = { none: 'foothold', foothold: 'persistent', persistent: 'persistent' };

export function accessOf(s: NonKineticState, by: NationId, on: NationId, sector: CyberSector): CyberAccess | undefined {
  return s.access[accessKey(by, on, sector)];
}

/** Start or resume an intrusion campaign toward deeper access. */
export function buildAccess(s: NonKineticState, by: NationId, on: NationId, sector: CyberSector): CyberAccess {
  const key = accessKey(by, on, sector);
  const a = (s.access[key] ??= { by, on, sector, stage: 'none', building: true, progressDays: 0, dwellDays: 0 });
  a.building = true;
  return a;
}

/** Move every live intrusion forward a tick: progress toward the next stage, dwell, and the discovery hazard. */
export function stepAccess(world: World, ctx: SimContext, s: NonKineticState): void {
  const dtDays = world.dtHours / 24;
  for (const key of Object.keys(s.access)) {
    const a = s.access[key];
    const def = cyberCapability(a.on);
    const hazard = DISCOVERY_PER_DAY() * (1 + 2 * def) * (a.building ? BUILD_DISCOVERY_MULT() : 1);
    if (ctx.rng.chance(1 - Math.exp(-hazard * dtDays))) {
      // Discovered and evicted: drop one stage, stop building.
      if (a.stage === 'persistent') { a.stage = 'foothold'; a.progressDays = 0; a.dwellDays = 0; a.building = false; }
      else { delete s.access[key]; }
      continue;
    }
    a.dwellDays += dtDays;
    if (!a.building || a.stage === 'persistent') continue;
    const atk = cyberCapability(a.by);
    if (atk <= 0) { delete s.access[key]; continue; }
    const need = a.stage === 'none' ? ACCESS_DAYS.foothold : ACCESS_DAYS.persistent;
    a.progressDays += dtDays * atk;
    if (a.progressDays >= need) {
      a.stage = NEXT[a.stage];
      a.progressDays = 0;
      a.dwellDays = 0;
      a.building = a.stage !== 'persistent';
    }
  }
}

const popCache = new WeakMap<GameMap, Map<NationId, NodeId[]>>();
/** A nation's land cells by descending population share (home cells only). */
function populousCells(map: GameMap, nation: NationId): NodeId[] {
  let byNation = popCache.get(map);
  if (!byNation) {
    byNation = new Map();
    const tmp = new Map<NationId, NodeId[]>();
    for (let n = 0; n < map.landCount; n++) if (map.popShare[n] > 0) (tmp.get(map.owner[n]) ?? tmp.set(map.owner[n], []).get(map.owner[n])!).push(n as NodeId);
    for (const [id, cells] of tmp) byNation.set(id, cells.sort((a, b) => map.popShare[b] - map.popShare[a]));
    popCache.set(map, byNation);
  }
  return byNation.get(nation) ?? [];
}

/**
 * Fire the payload the current access unlocks. Returns the share knocked down (0 without access).
 * A grid payload multiplies infrastructure down once, like a strike, at the target's main load
 * centres it still holds, so the economy's integrity and C2's fibre comms both feel it until
 * repaired. A telecom payload sets a national connectivity outage that recovers over days and that
 * the economy reads (digitalLoss). Firing burns the access.
 */
export function firePayload(world: World, map: GameMap, s: NonKineticState, by: NationId, on: NationId, sector: CyberSector): number {
  const a = accessOf(s, by, on, sector);
  const stage = a?.stage ?? 'none';
  const p = PAYLOAD[sector];
  const hit = p.hit[stage];
  if (hit <= 0) return 0;
  if (sector === 'grid') {
    const cells = populousCells(map, on);
    for (let i = 0, k = 0; i < cells.length && k < PAYLOAD_CELLS(); i++) {
      const c = cells[i];
      if (world.control[c] !== on) continue;
      world.theater.infrastructure[c] *= 1 - hit;
      k++;
    }
  } else {
    const o = (s.outage[on] ??= {});
    o.telecom = Math.max(o.telecom ?? 0, hit);
  }
  if (p.burnsAccess && a) { a.stage = 'none'; a.building = false; a.progressDays = 0; a.dwellDays = 0; }
  return hit;
}

/** Decay telecom outage back toward zero as operators restore service. */
export function recoverOutage(world: World, s: NonKineticState): void {
  const dtDays = world.dtHours / 24;
  for (const on of Object.keys(s.outage) as NationId[]) {
    const o = s.outage[on];
    const next = (o.telecom ?? 0) * Math.exp(-(dtDays / PAYLOAD.telecom.recoverDays) * Math.LN2);
    if (next < 1e-3) delete s.outage[on];
    else o.telecom = next;
  }
}

/** National connectivity lost to the telecom payload now, 0..1. */
export function telecomOutage(s: NonKineticState, nation: NationId): number {
  return s.outage[nation]?.telecom ?? 0;
}

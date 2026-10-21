import type { Catalog } from '../../core/catalog';
import { atWar, type SimContext } from '../../core/engine';
import type { GameMap } from '../../core/map';
import type { Formation, FormationId, NationId, NodeId, PlatformClass, PlatformId, World } from '../../core/types';
import { geography } from '../naval/geography';
import { seaPath } from '../naval/movement';
import { allied, landSlice } from './state';

/**
 * Strategic deployment of land formations across water: a 'move' order to a cell on
 * another land mass. The formation marches to an embarkation port or airfield on its own
 * side, waits there for lift, crosses, and is put down at a friendly port or airfield on
 * the far shore. Sealift is real ships (naval/sealift.ts), exposed to the war at sea;
 * airlift is a national throughput in tons a day. The order itself carries the state: a
 * formation whose 'move' path is spent while its target lies on another land mass is
 * waiting for lift.
 */

const landMassCache = new WeakMap<GameMap, Int32Array>();

/** Connected land masses: cells a formation can walk between. */
export function landMass(map: GameMap): Int32Array {
  let comp = landMassCache.get(map);
  if (comp) return comp;
  comp = new Int32Array(map.landCount).fill(-1);
  let next = 0;
  for (let s = 0; s < map.landCount; s++) {
    if (comp[s] >= 0) continue;
    const stack = [s];
    comp[s] = next;
    while (stack.length) {
      const n = stack.pop()!;
      for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
        const m = map.adj[k];
        if (m < map.landCount && comp[m] < 0) { comp[m] = next; stack.push(m); }
      }
    }
    next++;
  }
  landMassCache.set(map, comp);
  return comp;
}

export const overseas = (map: GameMap, from: NodeId, to: NodeId) => to < map.landCount && from < map.landCount && landMass(map)[from] !== landMass(map)[to];

/** Tracked and heavy vehicles that only ships move in bulk: a C-17 carries one M1 tank (AMC planning factors). */
const HEAVY: ReadonlySet<PlatformClass> = new Set(['mbt', 'ifv', 'sp_artillery', 'engineer']);
/** Deck space of a heavy vehicle in light-vehicle slots: an LMSR stows "58 tanks, 48 other tracked vehicles, plus more than 900 trucks" (MSC fact sheet). */
const HEAVY_SLOTS = 3;
/** Planning weight per vehicle class, tons (estimates: Stryker ~19 t, JLTV ~7 t, M777 ~4 t, HIMARS ~16 t, a loaded 5 t truck ~12 t). */
const VEHICLE_TONS: Partial<Record<PlatformClass, number>> = { apc: 19, recon: 7, atgm: 6, truck: 12, fuel_truck: 15, towed_artillery: 5, shorad: 15, mlrs: 16, sam_medium: 20, sam_long: 25, radar: 10, ew: 10 };
const DEFAULT_VEHICLE_TONS = 10;
/** A soldier with personal kit and the unit's accompanying supplies, tons (estimate). */
const TONS_PER_SOLDIER = 0.15;

const vehicles = (catalog: Catalog, f: Formation) =>
  (Object.entries(f.equipment) as [PlatformId, number][]).filter(([pid, n]) => {
    const p = catalog.platform(pid);
    return n > 0 && p.domain === 'land' && p.class !== 'infantry';
  });

/** A formation with no tracked or heavy vehicles can fly: airborne, air assault, light infantry, Stryker brigades. */
export function airPortable(catalog: Catalog, f: Formation): boolean {
  return vehicles(catalog, f).every(([pid]) => !HEAVY.has(catalog.platform(pid).class));
}

/** Tons a formation puts on aircraft. */
export function airTons(catalog: Catalog, f: Formation): number {
  let t = f.personnel * TONS_PER_SOLDIER;
  for (const [pid, n] of vehicles(catalog, f)) t += n * (VEHICLE_TONS[catalog.platform(pid).class] ?? DEFAULT_VEHICLE_TONS);
  return t;
}

/** Light-vehicle deck slots a formation needs on ships. */
export function deckSlots(catalog: Catalog, f: Formation): number {
  let s = 0;
  for (const [pid, n] of vehicles(catalog, f)) s += n * (HEAVY.has(catalog.platform(pid).class) ? HEAVY_SLOTS : 1);
  return s;
}

/**
 * Air Mobility Command throughput a land deployment can expect: planning payload ~60% of
 * maximum, one sortie per aircraft every two days on an intercontinental route (load,
 * fly, crew rest, return), and about a third of the fleet for the Army while the Air Force
 * deploys itself and munitions flow (estimates from AMC planning practice; MOG limits at
 * the receiving airfields are folded into the same factor).
 */
const PAYLOAD_SHARE = 0.6;
const SORTIES_PER_DAY = 0.5;
const ARMY_SHARE = 0.3;

interface Fleet {
  /** Maximum cargo tons of the ready transport aircraft. */
  tons: number;
  /** Longest unrefuelled combat radius among them, km. */
  radiusKm: number;
}
const fleetMemo = new WeakMap<World, { tick: number; fleets: Map<NationId, Fleet> }>();

/** Each nation's military transport aircraft, read once a tick. */
function fleet(world: World, catalog: Catalog, nation: NationId): Fleet | undefined {
  let memo = fleetMemo.get(world);
  if (!memo || memo.tick !== world.tick) {
    memo = { tick: world.tick, fleets: new Map() };
    for (const f of Object.values(world.formations)) {
      if (f.status !== 'active') continue;
      for (const [pid, n] of Object.entries(f.equipment) as [PlatformId, number][]) {
        const p = catalog.platform(pid);
        if (p.class !== 'transport_aircraft' || n <= 0) continue;
        const fl = memo.fleets.get(f.nation) ?? memo.fleets.set(f.nation, { tons: 0, radiusKm: 0 }).get(f.nation)!;
        fl.tons += n * (p.capacity?.cargoTons ?? 0) * f.readiness;
        fl.radiusKm = Math.max(fl.radiusKm, p.mobility.rangeKm / 2);
      }
    }
    fleetMemo.set(world, memo);
  }
  return memo.fleets.get(nation);
}

/** Tons a day a nation can fly to an overseas theatre for its land forces. */
export function airliftTonsPerDay(world: World, catalog: Catalog, nation: NationId): number {
  return (fleet(world, catalog, nation)?.tons ?? 0) * PAYLOAD_SHARE * SORTIES_PER_DAY * ARMY_SHARE;
}

/** Tons the whole transport fleet lands in one lift, as for an airborne assault. */
export function liftTons(world: World, catalog: Catalog, nation: NationId): number {
  return (fleet(world, catalog, nation)?.tons ?? 0) * PAYLOAD_SHARE;
}

/** Unrefuelled combat radius of the nation's transport fleet, km: how deep it can drop. */
export function transportRadiusKm(world: World, catalog: Catalog, nation: NationId): number {
  return fleet(world, catalog, nation)?.radiusKm ?? 0;
}

export type LiftMode = 'air' | 'sea';

/** How a formation crosses: by air when it can fly and its nation has airlift, otherwise by sea. */
export function liftMode(world: World, catalog: Catalog, f: Formation): LiftMode {
  return airPortable(catalog, f) && airliftTonsPerDay(world, catalog, f.nation) > 0 ? 'air' : 'sea';
}

/** Whether a land formation is standing at its gateway waiting for lift to `order.target`. */
export function awaitingLift(map: GameMap, f: Formation): boolean {
  const { posture, target, path } = f.order;
  return f.status === 'active' && posture === 'move' && target !== undefined && !path?.length && overseas(map, f.node, target);
}

const friendly = (world: World, nation: NationId, n: number) => {
  const c = world.control[n];
  return !!c && allied(world, nation, c);
};

/** Next to hostile ground: no place to unload ships or aircraft. */
function exposed(world: World, map: GameMap, nation: NationId, n: number): boolean {
  for (const m of map.neighbors(n as NodeId)) if (m < map.landCount && world.control[m] && atWar(world, nation, world.control[m])) return true;
  return false;
}

/** A km of road or rail march to the port costs this many km of sea passage: troops and trains are scarcer than hull-days (judgement call). */
const MARCH_KM_WEIGHT = 3;
/** Ports short-listed by great-circle cost before their real sea route is measured. */
const SHORTLIST = 6;

/**
 * Gateway on the near shore: one of the nation's own ports (or airfields) on the formation's
 * land mass, minimising the weighted march to it plus the passage on to the far-shore
 * gateway (by sea lane for ships, great circle for aircraft).
 */
export function embarkation(world: World, map: GameMap, f: Formation, target: NodeId, mode: LiftMode): NodeId | undefined {
  const far = debarkation(world, map, f.nation, target, mode);
  if (far === undefined) return undefined;
  const mass = landMass(map);
  const near: { n: NodeId; km: number }[] = [];
  const consider = (n: number) => {
    if (mass[n] !== mass[f.node] || world.control[n] !== f.nation) return;
    near.push({ n: n as NodeId, km: MARCH_KM_WEIGHT * map.distanceKm(f.node, n as NodeId) + map.distanceKm(n as NodeId, far) });
  };
  if (mode === 'sea') for (const p of geography(map).ports) consider(p.node);
  else for (let n = 0; n < map.landCount; n++) if (map.airports[n]) consider(n);
  near.sort((a, b) => a.km - b.km || a.n - b.n);
  if (mode === 'air' || !world.slices.naval) return near[0]?.n;
  let best: NodeId | undefined, bestKm = Infinity;
  for (const { n } of near.slice(0, SHORTLIST)) {
    const lane = seaPath(world, map, f.nation, n, far);
    if (!lane) continue;
    let km = MARCH_KM_WEIGHT * map.distanceKm(f.node, n);
    for (let i = 0, at: NodeId = n; i < lane.length; at = lane[i++]) km += map.distanceKm(at, lane[i]);
    if (km < bestKm) { bestKm = km; best = n; }
  }
  return best;
}

/** Gateway on the far shore: the friendly, unthreatened port or airfield on the target's land mass nearest the target. */
export function debarkation(world: World, map: GameMap, nation: NationId, target: NodeId, mode: LiftMode): NodeId | undefined {
  const mass = landMass(map);
  let best: NodeId | undefined, bestKm = Infinity;
  const consider = (n: number) => {
    if (mass[n] !== mass[target] || !friendly(world, nation, n) || exposed(world, map, nation, n)) return;
    const km = map.distanceKm(n as NodeId, target);
    if (km < bestKm) { bestKm = km; best = n as NodeId; }
  };
  if (mode === 'sea') for (const p of geography(map).ports) consider(p.node);
  else for (let n = 0; n < map.landCount; n++) if (map.airports[n]) consider(n);
  return best;
}

/**
 * Airlift: each nation's daily tonnage flies its waiting formations in the order they were
 * sent, a formation leaving its airfield once all of it has flown. It is put down at the
 * friendly airfield nearest its target and marches on from there.
 */
export function airlift(world: World, ctx: SimContext, route: (f: Formation, to: NodeId) => NodeId[] | null): void {
  const { map, catalog } = ctx;
  const flown = landSlice(world).airlifted;
  const waiting = new Map<NationId, Formation[]>();
  for (const f of Object.values(world.formations)) {
    if (!awaitingLift(map, f) || !map.airports[f.node] || liftMode(world, catalog, f) !== 'air') continue;
    (waiting.get(f.nation) ?? waiting.set(f.nation, []).get(f.nation)!).push(f);
  }
  for (const id of Object.keys(flown) as FormationId[]) {
    const f = world.formations[id];
    if (!f || !waiting.get(f.nation)?.includes(f)) delete flown[id];
  }
  for (const [nation, queue] of waiting) {
    let credit = (airliftTonsPerDay(world, catalog, nation) * world.dtHours) / 24;
    queue.sort((a, b) => a.order.issuedTick - b.order.issuedTick || (a.id < b.id ? -1 : 1));
    for (const f of queue) {
      if (credit <= 0) break;
      const dest = debarkation(world, map, nation, f.order.target!, 'air');
      if (dest === undefined) continue;
      const need = airTons(catalog, f) - (flown[f.id] ?? 0);
      const lift = Math.min(credit, need);
      credit -= lift;
      flown[f.id] = (flown[f.id] ?? 0) + lift;
      if (lift < need) break;
      delete flown[f.id];
      const target = f.order.target!;
      f.node = dest;
      f.progressKm = 0;
      f.entrenchment = 0;
      const path = dest === target ? null : route(f, target);
      f.order = path ? { posture: 'move', target, path, issuedTick: world.tick } : { posture: 'defend', issuedTick: world.tick };
      ctx.emit({ type: 'message', tick: world.tick, nation, text: `${f.name} airlifted to the theatre` });
    }
  }
}

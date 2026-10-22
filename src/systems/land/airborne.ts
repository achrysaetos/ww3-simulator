import type { Catalog } from '../../core/catalog';
import { atWar, type SimContext } from '../../core/engine';
import type { GameMap } from '../../core/map';
import type { Formation, FormationId, NationId, NodeId, PlatformId, RefusalCode, World } from '../../core/types';
import { AIRFRAME } from '../air/tables';
import { supplyFactor } from '../logistics';
import { detach } from '../naval/orders';
import { allied, canEnter, landSlice } from './state';
import { airTons, liftTons, transportRadiusKm } from './strategic';

/**
 * Airborne and air-assault insertion: a formation trained for it (Formation.airborne) flies
 * from a friendly airfield near it to a cell within the transports' combat radius, under friendly
 * air control, and lands there within the day, paying for the enemy air defence over the drop
 * zone. It fights with what it carried and is supplied by air alone, an airhead, until
 * ground logistics reaches it.
 */

/** Losses to accidents, dispersion and scattered sticks on an unopposed drop (estimate: Market Garden's and Normandy's unopposed drops lost a few per cent). */
const BASE_DROP_LOSS = 0.03;
/**
 * Engagement channels of enemy air defence covering the drop zone that cost the drop 63% of
 * what it lands (estimate): a Buk battalion (~24 channels) takes ~18%, a brigade-sized belt
 * nearly half. At Hostomel in February 2022 Ukrainian SHORAD and MANPADS downed a few of
 * some thirty helicopters and the Il-76 follow-on wave was called off.
 */
const CHANNELS_PER_E_FOLD = 120;
const MAX_DROP_LOSS = 0.9;
/** Enemy fighters within reach of a cell that contest the air over it for slow transports (estimate: two four-ship alert flights). */
const CONTESTING_FIGHTERS = 8;
/**
 * Lifts the transport fleet flies to the drop zone on the first day: the assault echelon and
 * one air-landed follow-on wave (estimate: the Hostomel plan of February 2022 was a helicopter
 * assault followed the same day by Il-76s air-landing two battalions).
 */
const LIFTS = 2;
/**
 * Smallest share of a formation worth dropping on its own: a parachute battalion group of a brigade of about six
 * battalions with its support (Kolwezi 1978 was the 2e REP of the 11e DP; 16 Air Assault's high-readiness echelon
 * is one battlegroup).
 */
const MIN_ASSAULT_ECHELON = 0.15; // param:
/** Furthest a formation moves by road or rail to its departure airfield while the operation is mounted (estimate: one day's move). */
const MARSHAL_KM = 400;
/** Days of fuel, ammunition and food a dropped formation carries, as a share of its capacity (estimate: two to three days' combat load). */
const CARRIED_SHARE = 0.5;
/** Share of capacity a day the transport force can drop to an airhead under friendly air (estimate: Dien Bien Phu and Khe Sanh lived on far less). */
const AIR_RESUPPLY_PER_DAY = 0.25;

/** An enemy air-defence launcher group or fighter squadron: where it stands, how far it reaches, and its weight (engagement channels, or airframes). */
interface Threat {
  node: NodeId;
  reachKm: number;
  weight: number;
}
interface EnemyAir {
  sams: Threat[];
  fighters: Threat[];
  /** Counter-air of the nation and the allies fighting beside it, which contests the same skies. */
  ownFighters: Threat[];
}
const enemyMemo = new WeakMap<World, { tick: number; byNation: Map<NationId, EnemyAir> }>();

/** The air defence and fighters of everyone at war with `nation`, read once a tick. */
function enemyAir(world: World, catalog: Catalog, nation: NationId): EnemyAir {
  let memo = enemyMemo.get(world);
  if (!memo || memo.tick !== world.tick) enemyMemo.set(world, (memo = { tick: world.tick, byNation: new Map() }));
  let air = memo.byNation.get(nation);
  if (air) return air;
  air = { sams: [], fighters: [], ownFighters: [] };
  const enemies = (Object.keys(world.nations) as NationId[]).filter((n) => atWar(world, nation, n));
  const fighting = new Map<NationId, boolean>();
  const beside = (n: NationId) => fighting.get(n) ?? fighting.set(n, n === nation || (allied(world, nation, n) && enemies.some((e) => atWar(world, n, e)))).get(n)!;
  for (const f of Object.values(world.formations)) {
    if ((f.kind !== 'air_defense' && f.kind !== 'air_wing') || f.status !== 'active') continue;
    const enemy = atWar(world, nation, f.nation);
    if (!enemy && !(f.kind === 'air_wing' && beside(f.nation))) continue;
    for (const [pid, n] of Object.entries(f.equipment) as [PlatformId, number][]) {
      const p = catalog.platform(pid);
      if (n <= 0) continue;
      if (f.kind === 'air_wing' && AIRFRAME[p.class]?.role === 'counter_air') (enemy ? air.fighters : air.ownFighters).push({ node: f.node, reachKm: p.mobility.rangeKm, weight: n * f.readiness });
      if (!enemy) continue;
      if (f.kind === 'air_defense' && p.engagementChannels) {
        const reachKm = p.loadout.reduce((r, l) => Math.max(r, catalog.munition(l.munition).rangeKm), 0);
        air.sams.push({ node: f.node, reachKm, weight: n * p.engagementChannels * f.readiness });
      }
    }
  }
  memo.byNation.set(nation, air);
  return air;
}

/** Total weight of the threats that reach the cell. */
function over(map: GameMap, threats: Threat[], node: NodeId): number {
  let w = 0;
  for (const t of threats) if (map.distanceKm(t.node, node) <= t.reachKm) w += t.weight;
  return w;
}

/** Share of a drop on `node` lost before it lands. */
export function dropLoss(world: World, map: GameMap, catalog: Catalog, nation: NationId, node: NodeId): number {
  return Math.min(MAX_DROP_LOSS, BASE_DROP_LOSS + (1 - Math.exp(-over(map, enemyAir(world, catalog, nation).sams, node) / CHANNELS_PER_E_FOLD)));
}

/**
 * Whether the nation's transports can fly over a cell: its side won the air there this tick,
 * or nobody fought for it because fewer enemy fighters than a squadron's alert flights can reach it.
 */
export function friendlyAir(world: World, map: GameMap, catalog: Catalog, nation: NationId, node: NodeId): boolean {
  const air = world.theater.airControl[node];
  if (air) return allied(world, nation, air.nation);
  return over(map, enemyAir(world, catalog, nation).fighters, node) < CONTESTING_FIGHTERS;
}

/** Radius around a field its transports descend and line up through, km (estimate: a C-17 starts its descent ~150 km out). */
const APPROACH_KM = 150; // param:

/**
 * Whether a transport stream can fly into a field day after day: its side won the air there this tick, the enemy
 * holds no air on the approach, and no more enemy fighters reach it on a combat radius than its own side's
 * (Berlin 1948 and the 2003 flow into Iraq ran under friendly fighters; CSIS 2023 puts no US airlift into Taiwan
 * under PLA air superiority).
 */
export function airBridge(world: World, map: GameMap, catalog: Catalog, nation: NationId, node: NodeId): boolean {
  const air = world.theater.airControl[node];
  if (air) return allied(world, nation, air.nation);
  for (const [n, c] of Object.entries(world.theater.airControl)) if (c && atWar(world, nation, c.nation) && map.distanceKm(Number(n) as NodeId, node) <= APPROACH_KM) return false;
  const { fighters, ownFighters } = enemyAir(world, catalog, nation);
  const radius = (ts: Threat[]) => ts.reduce((w, t) => (map.distanceKm(t.node, node) <= t.reachKm / 2 ? w + t.weight : w), 0);
  return radius(fighters) <= radius(ownFighters);
}

/** The friendly airfield nearest the formation that it can mount an operation from, if any is within a day's move. */
export function departure(world: World, map: GameMap, f: Formation): NodeId | undefined {
  let best: NodeId | undefined, bestKm = MARSHAL_KM;
  const near = (n: NodeId) => {
    const holder = world.control[n];
    if (!map.airports[n] || !holder || !allied(world, f.nation, holder)) return;
    const km = map.distanceKm(f.node, n);
    if (km <= bestKm) [best, bestKm] = [n, km];
  };
  for (const n of fieldsNear(map, f.node)) near(n);
  return best;
}

const fieldMemo = new WeakMap<GameMap, Map<NodeId, NodeId[]>>();

/** Airfield cells within a day's move of a cell, which the map fixes once. */
function fieldsNear(map: GameMap, node: NodeId): NodeId[] {
  let byNode = fieldMemo.get(map);
  if (!byNode) fieldMemo.set(map, (byNode = new Map()));
  let fields = byNode.get(node);
  if (!fields) {
    fields = [];
    for (let i = 0; i < map.landCount; i++) if (map.airports[i] && map.distanceKm(node, i as NodeId) <= MARSHAL_KM) fields.push(i as NodeId);
    byNode.set(node, fields);
  }
  return fields;
}

/**
 * Tons the nation has dropped in the last day: the transports that flew them are still on their
 * two lifts, so every drop in a day shares one fleet (Market Garden needed three days of lifts for
 * three divisions because the aircraft were shared).
 */
function liftFlown(world: World, catalog: Catalog, nation: NationId): number {
  let tons = 0;
  for (const [id, tick] of Object.entries(landSlice(world).airheads) as [FormationId, number][]) {
    const f = world.formations[id];
    if (f?.nation === nation && fresh(world, tick)) tons += airTons(catalog, f);
  }
  return tons;
}

/** Share of the formation the transports left today can land: a brigade too big for them drops an assault echelon. */
function dropShare(world: World, catalog: Catalog, f: Formation): number {
  return Math.min(1, (liftTons(world, catalog, f.nation) * LIFTS - liftFlown(world, catalog, f.nation)) / airTons(catalog, f));
}

const fresh = (world: World, landed: number) => (world.tick - landed) * world.dtHours < 24;

/** Why the formation cannot be dropped on `target`, or undefined when it can. */
export function cannotDrop(world: World, map: GameMap, catalog: Catalog, f: Formation, target: NodeId): { code: RefusalCode; reason: string } | undefined {
  if (!f.airborne) return { code: 'wrong_role', reason: 'not an airborne or air-assault formation' };
  if (target >= map.landCount) return { code: 'bad_target', reason: 'no drop zone at sea' };
  if (!canEnter(world, map, f.nation, target)) return { code: 'neutral_territory', reason: 'the drop zone is neutral ground' };
  const from = departure(world, map, f);
  if (from === undefined) return { code: 'no_airfield', reason: 'no friendly airfield within a day’s move' };
  if (map.distanceKm(from, target) > transportRadiusKm(world, catalog, f.nation)) return { code: 'out_of_range', reason: 'beyond the transports’ radius' };
  if (dropShare(world, catalog, f) < MIN_ASSAULT_ECHELON) return { code: 'no_lift', reason: 'not enough airlift left to land its assault echelon today' };
  if (!friendlyAir(world, map, catalog, f.nation, target)) return { code: 'no_air_cover', reason: 'no friendly air control over the drop zone' };
  return undefined;
}

/** Fly the formation, or the assault echelon of it the transports can carry, in and land it, minus what the defence shoots down. */
export function insert(world: World, ctx: SimContext, whole: Formation, target: NodeId): void {
  const { map, catalog } = ctx;
  const share = dropShare(world, catalog, whole);
  const f = share < 1 ? detach(world, ctx, whole, share, 'assault echelon') : whole;
  const loss = dropLoss(world, map, catalog, f.nation, target);
  for (const pid of Object.keys(f.equipment) as PlatformId[]) f.equipment[pid] = Math.round(f.equipment[pid] * (1 - loss));
  f.personnel = Math.round(f.personnel * (1 - loss));
  f.node = target;
  f.entrenchment = 0;
  f.progressKm = 0;
  for (const k of ['fuel', 'ammo', 'food'] as const) f.supply[k] = Math.min(f.supply[k], f.supplyCapacity[k] * CARRIED_SHARE);
  const holder = world.control[target];
  f.order = holder && atWar(world, f.nation, holder) ? { posture: 'attack', target, issuedTick: world.tick } : { posture: 'defend', issuedTick: world.tick };
  landSlice(world).airheads[f.id] = world.tick;
  ctx.emit({ type: 'message', tick: world.tick, nation: f.nation, text: `${f.name} inserted by air, ${Math.round(loss * 100)}% lost on the way in` });
}

/** Whether a formation lives on air drops now: an airhead with friendly air above it, which is fed and not a starving pocket. */
export function airFed(world: World, map: GameMap, catalog: Catalog, f: Formation): boolean {
  return f.id in landSlice(world).airheads && friendlyAir(world, map, catalog, f.nation, f.node);
}

/** Each tick: airheads live on air drops under friendly air; one that ground logistics reaches has linked up. */
export function supplyAirheads(world: World, map: GameMap, catalog: Catalog): void {
  const airheads = landSlice(world).airheads;
  const dtDays = world.dtHours / 24;
  for (const id of Object.keys(airheads) as FormationId[]) {
    const f = world.formations[id];
    // A drop stays on the books for a day after it lands, linked up or not, while its transports fly it.
    if (!f || f.status === 'destroyed' || map.isSea(f.node) || supplyFactor(world, map, f.node, f.nation) > 0) {
      if (!fresh(world, airheads[id])) delete airheads[id];
      continue;
    }
    if (!airFed(world, map, catalog, f)) continue;
    for (const k of ['fuel', 'ammo', 'food'] as const) f.supply[k] = Math.min(f.supplyCapacity[k], f.supply[k] + f.supplyCapacity[k] * AIR_RESUPPLY_PER_DAY * dtDays);
  }
}

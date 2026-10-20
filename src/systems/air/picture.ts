/**
 * The per-tick air picture: who can fly how many sorties from where and how far,
 * and which air defenses are up. Built once per tick, read by every phase.
 */
import type { SimContext } from '../../core/engine';
import type { GameMap } from '../../core/map';
import type { Formation, FormationId, Munition, NationId, NodeId, Platform, PlatformId, World } from '../../core/types';
import { combatRadiusKm } from './combat';
import { AIRFRAME, OFFENSIVE_POSTURES, RECEIVER_ROLES, TUNING, type AirframeProfile } from './tables';

export interface AirGroup {
  f: Formation;
  pid: PlatformId;
  platform: Platform;
  profile: AirframeProfile;
  /** Sorties left to fly this tick. */
  sorties: number;
  radiusKm: number;
  /** Fighter intercept channels left this tick against cruise missiles and drones. */
  interceptLeft: number;
}

export interface Defender {
  f: Formation;
  /** Fire-control channels left this tick, after suppression. */
  channels: number;
  /** Longest interceptor range in the magazine, km. */
  rangeKm: number;
}

export interface AirPicture {
  groups: AirGroup[];
  byFormation: Map<FormationId, AirGroup[]>;
  defenders: Defender[];
  /** Defenders hostile to a nation whose envelope reaches a node, keyed `${node}|${nation}`; geometry is fixed within a tick. */
  defendersInRange: Map<string, Defender[]>;
  /** Active, non-embarked formations by node. */
  atNode: Map<number, Formation[]>;
  /** War relations snapshot for this tick (diplomacy changes between ticks). */
  atWar(a: NationId, b: NationId): boolean;
  /** Best AAM per formation magazine, cached. */
  aamOf(f: Formation): Munition | undefined;
}

const UNLISTED_FIELD_CAPACITY = 0.75;

export const AIR_DEFENSE_KINDS: ReadonlySet<Formation['kind']> = new Set(['air_defense', 'surface_group']);
const INTERCEPTOR_KINDS: ReadonlySet<Munition['kind']> = new Set(['sam', 'abm', 'shorad_missile']);

export function buildPicture(world: World, ctx: SimContext, runway: Record<number, number>): AirPicture {
  const { map, catalog } = ctx;
  const groups: AirGroup[] = [];
  const byFormation = new Map<FormationId, AirGroup[]>();
  const defenders: Defender[] = [];
  const atNode = new Map<number, Formation[]>();
  const dayShare = world.dtHours / 24;

  for (const f of Object.values(world.formations)) {
    if (f.status !== 'active') continue;
    const list = atNode.get(f.node);
    if (list) list.push(f);
    else atNode.set(f.node, [f]);

    if (AIR_DEFENSE_KINDS.has(f.kind)) {
      const d = defenderOf(f, ctx);
      if (d) defenders.push(d);
    }
    if (f.kind !== 'air_wing') continue;

    const base = baseCapacity(world, ctx, f, runway);
    const surge = OFFENSIVE_POSTURES.has(f.order.posture);
    const tempo = f.order.posture === 'reserve' ? 0 : f.readiness * (1 - 0.5 * f.fatigue) * base * dayShare;
    const fg: AirGroup[] = [];
    for (const [pid, n] of Object.entries(f.equipment) as [PlatformId, number][]) {
      const platform = catalog.platform(pid);
      const profile = AIRFRAME[platform.class];
      if (!profile || n <= 0) continue;
      const expected = n * tempo * (surge ? profile.surgePerDay : profile.sustainedPerDay);
      const sorties = Math.floor(expected) + (ctx.rng.chance(expected % 1) ? 1 : 0);
      fg.push({ f, pid, platform, profile, sorties, radiusKm: platform.mobility.rangeKm, interceptLeft: 0 });
    }
    limitByFuel(f, fg, ctx);
    byFormation.set(f.id, fg);
    groups.push(...fg);
  }
  applyTankerSupport(groups, map);
  for (const g of groups) if (g.profile.role === 'counter_air') g.interceptLeft = g.sorties * TUNING.fighterInterceptShare;

  const aamCache = new Map<FormationId, Munition | undefined>();
  const aamOf = (f: Formation) => {
    if (!aamCache.has(f.id)) {
      let best: Munition | undefined;
      for (const [mid, n] of Object.entries(f.magazine)) {
        if (n < 1) continue;
        const m = catalog.munitions.get(mid as Munition['id']);
        if (m?.kind === 'aam' && (!best || (m.pk.aircraft ?? 0) * m.rangeKm > (best.pk.aircraft ?? 0) * best.rangeKm)) best = m;
      }
      aamCache.set(f.id, best);
    }
    return aamCache.get(f.id);
  };
  const enemies = new Map<NationId, Set<NationId>>();
  for (const [key, r] of Object.entries(world.relations)) {
    if (!r.atWar) continue;
    const [a, b] = key.split('|') as NationId[];
    (enemies.get(a) ?? enemies.set(a, new Set()).get(a)!).add(b);
    (enemies.get(b) ?? enemies.set(b, new Set()).get(b)!).add(a);
  }
  const atWar = (a: NationId, b: NationId) => enemies.get(a)?.has(b) ?? false;
  return { groups, byFormation, defenders, defendersInRange: new Map(), atNode, atWar, aamOf };
}

/**
 * Airfield capacity, scaled by infrastructure and runway damage; carriers for embarked
 * wings. The open airport data lists ~700 civil-airport cells and omits most military
 * airbases, so a wing in a cell without one is assumed to fly from an unlisted
 * military field with less ramp, fuel and munitions-handling capacity (estimate).
 */
function baseCapacity(world: World, ctx: SimContext, f: Formation, runway: Record<number, number>): number {
  const { map } = ctx;
  if (map.isSea(f.node)) {
    const host = f.embarkedOn ? world.formations[f.embarkedOn] : undefined;
    return host && host.status !== 'destroyed' ? 1 : 0;
  }
  const infra = world.theater.infrastructure[f.node] ?? 1;
  const rough = Object.keys(f.equipment).every((pid) => AIRFRAME[ctx.catalog.platform(pid as PlatformId).class]?.roughField);
  if (rough) return infra;
  return infra * (runway[f.node] ?? 1) * (map.airports[f.node] > 0 ? 1 : UNLISTED_FIELD_CAPACITY);
}

/** Each sortie burns fuel for the round trip plus time on station; a dry wing flies less. */
function limitByFuel(f: Formation, fg: AirGroup[], ctx: SimContext) {
  const missionKm = f.order.target !== undefined && OFFENSIVE_POSTURES.has(f.order.posture) ? ctx.map.distanceKm(f.node, f.order.target) : 150;
  const burn = (g: AirGroup) => g.platform.mobility.fuelTonsPerHour * ((2 * missionKm) / Math.max(100, g.platform.mobility.speedKph) + TUNING.sortieOverheadHours);
  const need = fg.reduce((s, g) => s + g.sorties * burn(g), 0);
  if (need <= 0) return;
  const share = Math.min(1, f.supply.fuel / need);
  let used = 0;
  for (const g of fg) {
    g.sorties = Math.floor(g.sorties * share);
    used += g.sorties * burn(g);
  }
  f.supply.fuel = Math.max(0, f.supply.fuel - used);
}

/**
 * Tanker sorties within a tanker's own radius of a receiver's base are shared across
 * the nation's receiving sorties on offensive missions (one national tanker pool per
 * region). The ratio extends receivers' combat radius.
 */
function applyTankerSupport(groups: AirGroup[], map: GameMap) {
  const tankers = groups.filter((g) => g.profile.role === 'tanker' && g.sorties > 0);
  if (!tankers.length) return;
  const receivers = groups.filter((g) => RECEIVER_ROLES.has(g.profile.role) && OFFENSIVE_POSTURES.has(g.f.order.posture) && g.sorties > 0);
  const demand = new Map<NationId, number>();
  for (const g of receivers) demand.set(g.f.nation, (demand.get(g.f.nation) ?? 0) + g.sorties);
  for (const g of receivers) {
    let near = 0;
    for (const t of tankers)
      if (t.f.nation === g.f.nation && map.distanceKm(t.f.node, g.f.node) <= t.platform.mobility.rangeKm) near += t.sorties;
    g.radiusKm = combatRadiusKm(g.platform, near / demand.get(g.f.nation)!);
  }
}

function defenderOf(f: Formation, ctx: SimContext): Defender | undefined {
  let channels = 0, rangeKm = 0;
  for (const [pid, n] of Object.entries(f.equipment) as [PlatformId, number][]) {
    const ch = ctx.catalog.platform(pid).engagementChannels;
    if (ch && n > 0) channels += ch * n;
  }
  if (!channels) return undefined;
  for (const [mid, n] of Object.entries(f.magazine)) {
    const m = ctx.catalog.munitions.get(mid as Munition['id']);
    if (m && n >= 1 && INTERCEPTOR_KINDS.has(m.kind)) rangeKm = Math.max(rangeKm, m.rangeKm);
  }
  return rangeKm > 0 ? { f, channels: channels * f.readiness, rangeKm } : undefined;
}

export function nodeDistance(ctx: SimContext, a: NodeId, b: NodeId): number {
  return a === b ? 0 : ctx.map.distanceKm(a, b);
}

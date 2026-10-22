import type { Catalog } from '../../core/catalog';
import type { Formation, FormationId, NationId, Platform, PlatformId, World } from '../../core/types';
import { AIR_ROLES, CAP_AIRBORNE_SHARE, CAP_SHOTS_PER_FIGHTER, HULLS, type HullProfile, isNavalHullClass } from './tables';

export interface NavalLedger {
  missilesFired: number;
  interceptorsFired: number;
  leakers: number;
  torpedoesFired: number;
  hullsSunk: number;
  hullsDamaged: number;
  minesLaid: number;
  minesSwept: number;
  troopsLanded: number;
  troopsLostLanding: number;
  /** Opposed landings attempted (one per lift group putting troops ashore on a hostile coast). */
  assaultLandings: number;
  firstAssaultTick?: number;
}

export interface NavalState {
  /** Mines per sea node by laying nation. */
  mines: Record<number, Record<NationId, number>>;
  /**
   * Sea zones each nation knows hold mines: fields it laid or watched being laid, struck, or hunted.
   * Planners see a field only through these charts (intel/view.ts minefields), never `mines` itself.
   */
  charted: Record<NationId, number[]>;
  /** Space-based ocean surveillance search effort by nation. */
  oceanSurveillance: Record<NationId, number>;
  /** Hostile nations holding a track on each naval formation this tick. Other systems (air, missile) read this to target ships. */
  tracks: Record<FormationId, NationId[]>;
  /** Tick each formation last fired torpedoes or missiles: a firing submarine gives away its position ("flaming datum"). */
  lastFired: Record<FormationId, number>;
  /** Tick each lift group arrived off a hostile beach; its troops are ashore OFFLOAD_HOURS later. */
  offshore: Record<FormationId, number>;
  ledger: Record<NationId, NavalLedger>;
  /** Recent hull losses per fleet, keyed by fleetKey; read through fleetLosses. */
  attrition: Record<string, { hulls: number; tick: number }>;
}

/**
 * Days over which a fleet's losses fade from its commanders' reckoning. The Black Sea Fleet left
 * the western Black Sea in late 2023 after a run of losses and had not returned by 2025 (UK MoD,
 * ISW), so the lesson lasts months. Judgement.
 */
const FLEET_MEMORY_DAYS = 90;

/** A fleet is a nation's naval groups sharing a home port. */
const fleetKey = (nation: NationId, home: number) => `${nation}|${home}`;

/** Hulls the fleet lost (sunk or mission-killed), faded over FLEET_MEMORY_DAYS. */
export function fleetLosses(world: World, nation: NationId, home: number): number {
  const a = world.slices.naval.attrition[fleetKey(nation, home)];
  return a ? a.hulls * Math.exp(-((world.tick - a.tick) * world.dtHours) / 24 / FLEET_MEMORY_DAYS) : 0;
}

export function recordFleetLoss(world: World, f: Formation, hulls: number): void {
  world.slices.naval.attrition[fleetKey(f.nation, f.home)] = { hulls: fleetLosses(world, f.nation, f.home) + hulls, tick: world.tick };
}

declare module '../../core/types' {
  interface Slices {
    naval: NavalState;
  }
}

export const NAVAL_KINDS: ReadonlySet<Formation['kind']> = new Set(['surface_group', 'submarine']);

export function isNavalFormation(f: Formation): boolean {
  return NAVAL_KINDS.has(f.kind);
}

export function chart(world: World, nation: NationId, node: number): void {
  const known = (world.slices.naval.charted ??= {})[nation] ??= [];
  if (!known.includes(node)) known.push(node);
}

export function ledger(world: World, nation: NationId): NavalLedger {
  return (world.slices.naval.ledger[nation] ??= {
    missilesFired: 0, interceptorsFired: 0, leakers: 0, torpedoesFired: 0, hullsSunk: 0, hullsDamaged: 0,
    minesLaid: 0, minesSwept: 0, troopsLanded: 0, troopsLostLanding: 0, assaultLandings: 0,
  });
}

export interface HullStack { pid: PlatformId; platform: Platform; profile: HullProfile; count: number }
export interface AirStack { pid: PlatformId; platform: Platform; count: number }

/** What a naval formation is made of, derived from its equipment. */
export interface Composition {
  hulls: HullStack[];
  aircraft: AirStack[];
  hullCount: number;
  /** Slowest hull, km/h; with every hull mission-killed, half the slowest damaged hull's speed (limping or under tow). */
  speedKph: number;
  /** No operational hulls left, only damaged ones heading for repair. */
  crippled: boolean;
  /** Shortest unrefuelled range among fuel-burning hulls; Infinity if all nuclear. */
  rangeKm: number;
  submerged: boolean;
  /** Loudest/most visible hull sets the group's stealth. */
  stealth: number;
  channels: number;
  pointDefense: number;
  surfaceSearch: number;
  aswSearch: number;
  seaControl: number;
  capShots: number;
  troopLift: number;
  vehicleLift: number;
  enduranceDays: number;
}

export function compose(f: Formation, catalog: Catalog): Composition {
  const hulls: HullStack[] = [];
  const aircraft: AirStack[] = [];
  let speedKph = Infinity, rangeKm = Infinity, stealth = 1, channels = 0, pd = 0, sig = 0;
  let surfaceSearch = 0, aswSearch = 0, seaControl = 0, capShots = 0, troopLift = 0, vehicleLift = 0, endurance = Infinity, hullCount = 0;
  let submerged = true;
  for (const [pid, count] of Object.entries(f.equipment) as [PlatformId, number][]) {
    if (count <= 0) continue;
    const platform = catalog.platform(pid);
    if (isNavalHullClass(platform.class)) {
      const profile = HULLS[platform.class];
      hulls.push({ pid, platform, profile, count });
      hullCount += count;
      speedKph = Math.min(speedKph, platform.mobility.speedKph);
      if (platform.mobility.fuelTonsPerHour > 0) rangeKm = Math.min(rangeKm, platform.mobility.rangeKm);
      stealth = Math.min(stealth, platform.protection.stealth);
      channels += (platform.engagementChannels ?? 0) * count;
      pd += profile.pointDefense * profile.signature * count;
      sig += profile.signature * count;
      surfaceSearch += profile.surfaceSearch * count;
      aswSearch += profile.asw * count;
      seaControl += profile.seaControl * count;
      troopLift += (platform.capacity?.troops ?? 0) * count;
      vehicleLift += (platform.capacity?.vehicles ?? 0) * count;
      endurance = Math.min(endurance, profile.enduranceDays);
      if (platform.domain !== 'subsurface') submerged = false;
    } else if (platform.domain === 'air') {
      aircraft.push({ pid, platform, count });
      const role = AIR_ROLES[platform.class];
      if (role) {
        surfaceSearch += role.surfaceSearch * count;
        aswSearch += role.asw * count;
        if (role.cap) capShots += count * CAP_AIRBORNE_SHARE * CAP_SHOTS_PER_FIGHTER;
      }
      // Carrier aviation is the core of a carrier group's sea control.
      seaControl += 0.05 * count;
    }
  }
  let limp = Infinity;
  if (!hullCount)
    for (const [pid, n] of Object.entries(f.damaged) as [PlatformId, number][]) {
      const p = catalog.platform(pid);
      if (n > 0 && isNavalHullClass(p.class)) limp = Math.min(limp, p.mobility.speedKph / 2);
    }
  const r = f.readiness;
  return {
    hulls, aircraft, hullCount,
    speedKph: hullCount ? speedKph : Number.isFinite(limp) ? limp : 0,
    crippled: !hullCount && Number.isFinite(limp),
    rangeKm,
    submerged: hullCount > 0 && submerged,
    stealth: hullCount ? stealth : 0,
    channels: Math.round(channels * r),
    pointDefense: sig ? pd / sig : 0,
    surfaceSearch: surfaceSearch * r,
    aswSearch: aswSearch * r,
    seaControl: seaControl * r,
    capShots: Math.floor(capShots * r),
    troopLift, vehicleLift,
    enduranceDays: Number.isFinite(endurance) ? endurance : 30,
  };
}

/** Hits needed to sink, scaled by damage-control readiness: a poorly kept crew loses a ship a well-drilled one saves (Moskva 2022 vs Stark 1987). */
export function effectiveHitsToKill(profile: HullProfile, readiness: number): number {
  return profile.hitsToKill * (0.4 + 0.6 * readiness);
}

/** Vehicles a land formation brings aboard: everything except dismounted infantry. */
export function liftDemand(f: Formation, catalog: Catalog): { troops: number; vehicles: number } {
  let vehicles = 0;
  for (const [pid, n] of Object.entries(f.equipment) as [PlatformId, number][]) {
    const p = catalog.platform(pid);
    if (p.class !== 'infantry' && p.domain === 'land') vehicles += n;
  }
  return { troops: f.personnel, vehicles };
}

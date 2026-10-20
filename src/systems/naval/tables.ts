import type { MunitionKind, NationId, PlatformClass } from '../../core/types';

/**
 * Per-hull-class naval facts. `hitsToKill` is in Exocet-equivalent hits (a 165 kg
 * warhead; see `hitWeight`), the unit Hughes uses for staying power.
 * Calibration: Falklands 1982 (Sheffield, 4,800 t, lost to one Exocet; Glamorgan
 * survived one; Atlantic Conveyor sunk by one or two), USS Stark 1987 (frigate
 * survived two), Moskva 2022 (cruiser sunk by two 150 kg Neptunes with poor damage
 * control, reproduced through the readiness term in `effectiveHitsToKill`),
 * Tanker War 1984-88 (large tankers rarely sank from single ASCM hits),
 * and USN/CRS estimates that a supercarrier takes roughly 5-7 large ASCM hits.
 */
export interface HullProfile {
  hitsToKill: number;
  /** ASW search effort per hull (hull sonar, towed array, embarked flight). */
  asw: number;
  /** Surface/air search effort per hull. */
  surfaceSearch: number;
  /** Final-layer kill probability per leaker: CIWS, RAM, guns, decoys (or torpedo evasion for subs). */
  pointDefense: number;
  /** Weight in sea control and blockade strength. */
  seaControl: number;
  /** Days of stores carried; sets food burn so supplyCapacity.food lasts this long. */
  enduranceDays: number;
  /** Relative radar/acoustic signature; bigger ships draw more of an incoming salvo. */
  signature: number;
}

export const NAVAL_HULL_CLASSES = [
  'carrier', 'amphibious', 'cruiser', 'destroyer', 'frigate', 'corvette', 'patrol', 'mine_warfare',
  'replenishment', 'cargo_ship', 'tanker_ship', 'usv', 'ssn', 'ssk', 'ssgn', 'ssbn', 'uuv',
] as const satisfies readonly PlatformClass[];
export type NavalHullClass = (typeof NAVAL_HULL_CLASSES)[number];

// Patrol craft (missile boats, coast guard cutters) carry no hull sonar or towed array: no ASW search.
// Endurance: USN carriers and SSNs ~90 days of stores; destroyers ~45; SSK patrols
// 50-70 days with AIP (estimates from CRS RL32665 and manufacturer data).
export const HULLS: Record<NavalHullClass, HullProfile> = {
  carrier: { hitsToKill: 6, asw: 0.3, surfaceSearch: 1.5, pointDefense: 0.5, seaControl: 4, enduranceDays: 90, signature: 5 },
  amphibious: { hitsToKill: 3, asw: 0, surfaceSearch: 0.5, pointDefense: 0.35, seaControl: 0.3, enduranceDays: 45, signature: 3 },
  cruiser: { hitsToKill: 2.5, asw: 0.5, surfaceSearch: 1.2, pointDefense: 0.4, seaControl: 1.2, enduranceDays: 45, signature: 2 },
  destroyer: { hitsToKill: 2, asw: 0.6, surfaceSearch: 1, pointDefense: 0.4, seaControl: 1, enduranceDays: 45, signature: 1.5 },
  frigate: { hitsToKill: 1.5, asw: 1, surfaceSearch: 0.7, pointDefense: 0.35, seaControl: 0.7, enduranceDays: 40, signature: 1.2 },
  corvette: { hitsToKill: 1, asw: 0.4, surfaceSearch: 0.4, pointDefense: 0.25, seaControl: 0.3, enduranceDays: 15, signature: 0.8 },
  patrol: { hitsToKill: 1, asw: 0, surfaceSearch: 0.3, pointDefense: 0.15, seaControl: 0.15, enduranceDays: 10, signature: 0.6 },
  mine_warfare: { hitsToKill: 1, asw: 0.1, surfaceSearch: 0.2, pointDefense: 0.1, seaControl: 0.1, enduranceDays: 15, signature: 0.6 },
  replenishment: { hitsToKill: 2, asw: 0, surfaceSearch: 0.2, pointDefense: 0.2, seaControl: 0.1, enduranceDays: 60, signature: 3 },
  cargo_ship: { hitsToKill: 2, asw: 0, surfaceSearch: 0.1, pointDefense: 0, seaControl: 0, enduranceDays: 30, signature: 3 },
  tanker_ship: { hitsToKill: 4, asw: 0, surfaceSearch: 0.1, pointDefense: 0, seaControl: 0, enduranceDays: 30, signature: 4 },
  usv: { hitsToKill: 0.5, asw: 0.2, surfaceSearch: 0.1, pointDefense: 0, seaControl: 0.1, enduranceDays: 5, signature: 0.2 },
  // A heavyweight torpedo sinks any submarine; a lightweight one usually does (sub htk < 1).
  ssn: { hitsToKill: 0.8, asw: 0.8, surfaceSearch: 2, pointDefense: 0.3, seaControl: 0.5, enduranceDays: 90, signature: 1 },
  ssk: { hitsToKill: 0.8, asw: 0.5, surfaceSearch: 1.5, pointDefense: 0.3, seaControl: 0.3, enduranceDays: 50, signature: 0.8 },
  ssgn: { hitsToKill: 1, asw: 0.6, surfaceSearch: 1.5, pointDefense: 0.25, seaControl: 0.5, enduranceDays: 90, signature: 1.2 },
  ssbn: { hitsToKill: 1, asw: 0.3, surfaceSearch: 1, pointDefense: 0.3, seaControl: 0, enduranceDays: 90, signature: 1.2 },
  uuv: { hitsToKill: 0.3, asw: 0.3, surfaceSearch: 0.2, pointDefense: 0, seaControl: 0, enduranceDays: 20, signature: 0.1 },
};

export function isNavalHullClass(c: PlatformClass): c is NavalHullClass {
  return c in HULLS;
}

/** Aircraft embarked in or tasked to a naval group, by what they add to the group. */
export interface AirRole { surfaceSearch: number; asw: number; /** Counts toward fleet combat air patrol against subsonic missiles. */ cap: boolean }
export const AIR_ROLES: Partial<Record<PlatformClass, AirRole>> = {
  maritime_patrol: { surfaceSearch: 0.8, asw: 0.8, cap: false },
  asw_helo: { surfaceSearch: 0.2, asw: 0.5, cap: false },
  awacs: { surfaceSearch: 1, asw: 0, cap: false },
  fighter: { surfaceSearch: 0.05, asw: 0, cap: true },
  multirole: { surfaceSearch: 0.05, asw: 0, cap: true },
  attack_aircraft: { surfaceSearch: 0.05, asw: 0, cap: false },
  isr_drone: { surfaceSearch: 0.4, asw: 0, cap: false },
};

// ------------------------------------------------------------- weapons

/** Reference warhead for one "hit": AM39 Exocet, 165 kg. */
export const REFERENCE_WARHEAD_KG = 165;

/** Damage multiplier by munition kind. A heavyweight torpedo breaking a keel is worth about two above-waterline hits of equal warhead (Belgrano 1982, Cheonan 2010). */
export const KIND_DAMAGE: Partial<Record<MunitionKind, number>> = { torpedo: 2, mine: 2, antiship_ballistic: 1.3 };

/** Kinds missile interceptors cannot engage; only point defense, decoys and evasion apply. */
export const NOT_INTERCEPTABLE: ReadonlySet<MunitionKind> = new Set(['torpedo', 'mine']);
/** Below this speed a threat is a boat or torpedo, not a missile: guns, not SAMs, engage it (Ukrainian USVs 2022-24). */
export const MIN_INTERCEPTABLE_MACH = 0.3;

export const INTERCEPTOR_KINDS: ReadonlySet<MunitionKind> = new Set(['sam', 'abm', 'shorad_missile']);
/**
 * Kinds a fleet fires at ships at sea: only weapons with a terminal seeker that can find a
 * moving hull. A GPS/INS land-attack missile or bomb aims at coordinates the ship has left by
 * the time it arrives; the anti-ship Tomahawk needed a new seeker (Maritime Strike Tomahawk,
 * Block Va, first fielded 2023-24 in small numbers, CRS IF11353).
 */
export const ANTISHIP_KINDS: ReadonlySet<MunitionKind> = new Set(['antiship_cruise', 'antiship_ballistic', 'torpedo']);

/** Combat air patrol shots per CAP fighter per salvo and their kill chance against a subsonic sea-skimmer (estimate). */
export const CAP_SHOTS_PER_FIGHTER = 2;
export const CAP_PK = 0.3;
/** Share of embarked fighters airborne on CAP at a time (carrier cycle ops, estimate). */
export const CAP_AIRBORNE_SHARE = 0.25;
/** Share of strike aircraft that can launch per 6 h: about 1.2 sorties/day sustained (Nimitz-class surge ~1.4/day per aircraft, CRS). */
export const SORTIES_PER_HOUR = 0.05;
/** VLS ripple: missiles a launching hull can put in the air per tick. */
export const LAUNCHES_PER_HULL = 8;
/** Torpedoes per attacking submarine per tick (4-6 tubes, one reload). */
export const TORPEDOES_PER_SUB = 6;

/** Crew lost when a hull sinks: Belgrano 1982 ~30%, Sheffield 7%, Moskva disputed; mean estimate. */
export const CREW_LOSS_SUNK = 0.3;

// ------------------------------------------------------------- satellites

/**
 * National space-based ocean surveillance (radar/ELINT satellites, commercial SAR),
 * as search effort against surface ships anywhere. Estimates: USA (NOSS, NRO SAR),
 * CHN (Yaogan ELINT triplets and SAR, ~40+ satellites by 2024), RUS (Liana partly
 * fielded), others commercial/allied imagery. The space system may later own this.
 */
export const OCEAN_SURVEILLANCE: Record<string, number> = {
  USA: 1.2, CHN: 1, RUS: 0.4, FRA: 0.3, GBR: 0.25, JPN: 0.3, IND: 0.25, ISR: 0.2, DEU: 0.15, ITA: 0.15, KOR: 0.1,
};

// ------------------------------------------------------------- mines

/** Hostile mines at or above this count close a sea node to shipping (Haiphong 1972: a few hundred mines shut the port; insurers stop sailings far below that). */
export const MINE_CLOSURE = 10;
/** Per-hull chance of a mine strike per tick is 1 - exp(-mines / MINE_DENSITY): 100 mines ~ 6% per hull per 6 h (Gulf 1991: ~1,300 mines, Tripoli and Princeton struck). */
export const MINE_DENSITY = 1500;
/** Mines cleared per MCM hull per day. Gulf 1991: ~30 coalition MCMVs cleared ~1,200 mines in ~2 months. */
export const SWEEP_PER_HULL_DAY = 0.7;
/** Mines a minelaying hull can put down per tick. */
export const LAY_PER_HULL = 20;

// ------------------------------------------------------------- amphibious

/**
 * Landing-force loss fraction = BASE + OPPOSED * r/(1+r) * (1 - support), r = defender/attacker
 * combat value at the beach. Calibration: Inchon 1950 (light opposition, ~1-2%), Normandy
 * 1944 (~6.5% of 156k with full air and naval superiority), Tarawa 1943 (~25%), Dieppe 1942
 * (~60% with no superiority), CSIS 2023 Taiwan wargame (landing forces cut off and lost at
 * the beach in most iterations).
 */
export const LANDING_BASE_LOSS = 0.02;
export const LANDING_OPPOSED_LOSS = 0.75;
/** Support terms: own sea control of the coast zone and air control over the beach. */
export const LANDING_SEA_SUPPORT = 0.5;
export const LANDING_AIR_SUPPORT = 0.35;

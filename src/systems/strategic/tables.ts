import type { FormationKind, MunitionKind, NationId, NodeId, PlatformClass } from '../../core/types';
import type { GameMap } from '../../core/map';
import { defineParam } from '../../core/params';
import type { NuclearPosture, SatClass } from './state';

const N = (s: string) => s as NationId;

// ---------------------------------------------------------------- missile defense

export interface BmdSystem {
  id: string;
  owner: NationId;
  /** Incoming munition kinds it can engage. */
  engages: readonly MunitionKind[];
  interceptors: number;
  /** Single-shot kill probability per interceptor against one reentry vehicle. */
  pk: number;
  /** Interceptors fired at each RV; there is no time to shoot-look-shoot against an ICBM. */
  shotsPerTarget: number;
  /** Nations whose territory it covers. */
  defends: readonly NationId[];
  /** Where its fire units stand: it covers only targets within radiusKm of this point. Without one it covers the defended nations whole. */
  site?: { lat: number; lon: number; radiusKm: number };
  /** RVs its radars and fire units on station can take on in one tick; the rest of a salvo goes through unengaged. */
  perTick: number;
}

/**
 * Interceptors are counted where they stand, not as a national inventory: a ship in a home port or a battery in
 * Texas defends nothing in Korea. Fire units on station cap how many RVs each layer engages in one tick, so a large
 * salvo saturates it. Engagement capacities are estimates: about two simultaneous engagements per Aegis ship and a
 * dozen per THAAD battery.
 */
export const BMD_SYSTEMS: readonly BmdSystem[] = [
  // 44 GBIs at Fort Greely and Vandenberg (CRS IF10541). Intercept tests since 1999 hit about 55% (Arms Control Association
  // tally, 11 of 20); MDA doctrine fires several GBIs per RV, here 4.
  { id: 'gmd', owner: N('USA'), engages: ['icbm', 'slbm'], interceptors: 44, pk: 0.5, shotsPerTarget: 4, defends: [N('USA')], perTick: 11 },
  // Moscow A-135/A-235: 68 53T6 short-range interceptors (IISS Military Balance 2024). No public test record; pk is an estimate.
  { id: 'a135', owner: N('RUS'), engages: ['icbm', 'slbm', 'irbm', 'mrbm'], interceptors: 68, pk: 0.5, shotsPerTarget: 2, defends: [N('RUS')], site: { lat: 55.75, lon: 37.62, radiusKm: 150 }, perTick: 34 },
  // Aegis BMD in the western Pacific: about 9 BMD-capable destroyers forward-based in Japan with perhaps 8-16 SM-3 each
  // (CRS RL33745, 2025), four of them on BMD station at a time. MDA flight-test record about 80%.
  { id: 'sm3_pacific', owner: N('USA'), engages: ['irbm', 'mrbm'], interceptors: 90, pk: 0.8, shotsPerTarget: 2, defends: [N('JPN'), N('KOR')], site: { lat: 37, lon: 133, radiusKm: 1500 }, perTick: 8 },
  // Aegis BMD in Europe: Aegis Ashore at Deveselu (Romania) and Redzikowo (Poland), 24 SM-3 each, and the four destroyers
  // at Rota (EPAA; CRS RL33745). Ship loads are an estimate.
  { id: 'sm3_europe', owner: N('USA'), engages: ['irbm', 'mrbm'], interceptors: 90, pk: 0.8, shotsPerTarget: 2, defends: [N('POL'), N('ROU'), N('DEU'), N('GBR'), N('FRA'), N('ITA')], site: { lat: 48, lon: 15, radiusKm: 2000 }, perTick: 10 },
  // JMSDF Aegis destroyers, about 8 ships with SM-3 Block IB/IIA; inventory estimated at 50.
  { id: 'sm3_jpn', owner: N('JPN'), engages: ['irbm', 'mrbm'], interceptors: 50, pk: 0.8, shotsPerTarget: 2, defends: [N('JPN')], site: { lat: 36, lon: 137, radiusKm: 1200 }, perTick: 8 },
  // THAAD: one battery of 48 interceptors at Seongju (USFK) and one on Guam; test record 16 of 16 (MDA), pk discounted to
  // 0.85 for combat. A battery defends a few hundred kilometres around it. The other US batteries are not on station.
  { id: 'thaad_kor', owner: N('USA'), engages: ['irbm', 'mrbm', 'srbm'], interceptors: 48, pk: 0.85, shotsPerTarget: 2, defends: [N('KOR')], site: { lat: 35.9, lon: 128.1, radiusKm: 200 }, perTick: 12 },
  { id: 'thaad_guam', owner: N('USA'), engages: ['irbm', 'mrbm', 'srbm'], interceptors: 48, pk: 0.85, shotsPerTarget: 2, defends: [N('USA')], site: { lat: 13.5, lon: 144.8, radiusKm: 200 }, perTick: 12 },
  // Arrow 3 exo-atmospheric interceptor; inventory is not public, about 100 is an estimate.
  { id: 'arrow3', owner: N('ISR'), engages: ['irbm', 'mrbm'], interceptors: 100, pk: 0.85, shotsPerTarget: 2, defends: [N('ISR')], perTick: 12 },
];

/**
 * Share of RVs a defence layer never gets a shot at: decoys and debris it cannot discriminate, tracks lost or handed
 * over late, depressed trajectories. Flight tests run against cooperative targets; planners assume salvo leakage
 * (CRS IF10541; Wilkening, Science & Global Security 2000, on layered-defence leakage). Judgment.
 */
export const BMD_LEAKAGE = defineParam({
  id: 'strategic.BMD_LEAKAGE', value: 0.15, range: [0.05, 0.3], tag: 'judgment',
  source: 'judgment: salvo leakage from discrimination and timing, CRS IF10541', affects: 'share of ballistic RVs that get through missile defence',
});

export function bmdCovers(sys: BmdSystem, map: GameMap, victim: NationId, node: NodeId): boolean {
  if (!sys.defends.includes(victim)) return false;
  if (!sys.site) return true;
  return map.distanceKm(node, map.nodeAt(sys.site.lat, sys.site.lon)) <= sys.site.radiusKm;
}

// ---------------------------------------------------------------- early warning and posture

/**
 * Probability a nation detects a ballistic-missile launch against it in time to act. US: SBIRS + UEWR radars.
 * Russia: EKS Tundra satellites + Voronezh radars (partial satellite coverage). China: new LPAR radars and a nascent
 * satellite layer (DoD China Military Power Report 2023). Estimates.
 */
export const EARLY_WARNING: Record<string, number> = {
  USA: 0.99, RUS: 0.95, CHN: 0.8, GBR: 0.9, FRA: 0.6, JPN: 0.8, ISR: 0.9, IND: 0.5,
};

/** Russia keeps a launch-on-warning option (SIPRI Yearbook 2024); the US keeps ICBMs on alert to preserve it. */
export const DEFAULT_POSTURE: Record<string, NuclearPosture> = { USA: 'launch_on_warning', RUS: 'launch_on_warning' };

// ---------------------------------------------------------------- hardness and dispersion

/**
 * Peak overpressure (psi) that destroys or disables the platform. Silo figure from OTA "MX Missile Basing" (1981);
 * vehicle, ship and aircraft figures from Glasstone & Dolan (1977) ch. 5 damage criteria. Estimates.
 */
const HARDNESS: Partial<Record<PlatformClass, number>> = {
  icbm_silo: 2000,
  icbm_mobile: 10,
  mbt: 30, ifv: 20, apc: 20, sp_artillery: 20,
  ssbn: 200, ssn: 200, ssk: 200, ssgn: 200, uuv: 200,
  carrier: 20, cruiser: 15, destroyer: 15, frigate: 15, corvette: 15, amphibious: 15,
};
const DOMAIN_HARDNESS = { land: 5, air: 3, sea: 12, subsurface: 200, space: Infinity } as const;

export function hardnessPsi(cls: PlatformClass, domain: keyof typeof DOMAIN_HARDNESS): number {
  return HARDNESS[cls] ?? DOMAIN_HARDNESS[domain];
}

/**
 * Area (km^2) a formation of this kind spreads over inside a cell, so an area weapon kills only part of it. A
 * deployed brigade holds a sector of roughly 15x20 km; an air wing on its base is packed into a few km^2. Estimates.
 */
export const DISPERSION_KM2: Record<FormationKind, number> = {
  maneuver: 300, artillery: 100, air_defense: 50, missile: 200, air_wing: 10, surface_group: 100,
  submarine: 1000, strategic: 400, logistics: 100, space: Infinity,
};

/**
 * Ships and submarines tied up at a naval base. A boat alongside is a surfaced hull, as soft as a surface ship
 * (Glasstone & Dolan 1977 table 6.96: severe damage to surfaced submarines and ships at about 10-20 psi), and the
 * piers, dry docks and explosives-handling wharves of a base such as Bangor, Kings Bay, Gadzhiyevo or Vilyuchinsk lie
 * within a few square kilometres. OTA, "The Effects of Nuclear War" (1979), treats SSBNs in port as destroyed by a
 * warhead or two on the base. Area estimate.
 */
export const IN_PORT = { psi: 15, areaKm2: 10 } as const;

/** Silos are point targets: each warhead is aimed at one launcher, so they are resolved silo by silo, not by area. */
export const POINT_TARGET: ReadonlySet<PlatformClass> = new Set(['icbm_silo']);

// ---------------------------------------------------------------- space

/** Share of a constellation in low orbit, where debris lives: recon in LEO, comms split LEO/GEO, navigation in MEO. */
export const DEBRIS_EXPOSURE: Record<SatClass, number> = { recon_satellite: 1, comms_satellite: 0.5, nav_satellite: 0.05 };

/** Kinetic ASAT tests (US 2008, CHN 2007, IND 2019, RUS 2021) all hit on the final attempt; 0.8 allows for combat conditions. */
export const ASAT_PK = 0.8;
/** Tracked fragments per kinetic kill: FY-1C made ~3,500 (2007), Cosmos 1408 ~1,500 (2021). */
export const FRAGMENTS_PER_KILL = 2500;
/** Iridium-Cosmos (2009) left ~2,000 tracked fragments. */
export const FRAGMENTS_PER_COLLISION = 2000;
/**
 * Annual catastrophic-collision probability per exposed satellite per tracked fragment. One accidental catastrophic
 * collision in decades among ~10k satellites and ~30k tracked objects gives ~3e-9; each tracked fragment stands for
 * ~10 lethal untracked ones (ESA Space Environment Report 2024), so 5e-8. Estimate.
 */
export const COLLISION_RATE = 5e-8;
/** LEO debris e-folding life around 800 km altitude, years (NASA ODPO). */
export const DEBRIS_LIFE_YEARS = 10;

// ---------------------------------------------------------------- cyber

/**
 * Offensive and defensive cyber capability, 0..1, from the tiers in IISS "Cyber Capabilities and National Power"
 * (2021): tier 1 USA; tier 2 AUS, CAN, CHN, FRA, ISR, RUS, GBR; tier 3 IND, IDN, IRN, JPN, MYS, PRK, VNM.
 */
const CYBER_TIER: Record<string, 1 | 2 | 3> = {
  USA: 1, AUS: 2, CAN: 2, CHN: 2, FRA: 2, ISR: 2, RUS: 2, GBR: 2, IND: 3, IDN: 3, IRN: 3, JPN: 3, MYS: 3, PRK: 3, VNM: 3,
};
const TIER_SCORE = { 1: 1, 2: 0.7, 3: 0.4 } as const;

export function cyberCapability(nation: NationId): number {
  const tier = CYBER_TIER[nation];
  return tier ? TIER_SCORE[tier] : 0.15;
}

// ---------------------------------------------------------------- nuclear winter

/**
 * Soot (Tg) against global response. Food: year-2 global calorie loss, read off Xia et al. 2022 (Nature Food 3:586)
 * fig. 1 for the 5, 16, 27, 37, 47 and 150 Tg cases (approximate). Cooling: global-mean surface cooling, Coupe et al.
 * 2019 (150 Tg, ~9 C) and Toon et al. 2019 (5-47 Tg).
 */
export const SOOT_RESPONSE: readonly { tg: number; food: number; coolingC: number }[] = [
  { tg: 0, food: 0, coolingC: 0 },
  { tg: 5, food: 0.07, coolingC: 1.5 },
  { tg: 16, food: 0.13, coolingC: 3 },
  { tg: 27, food: 0.2, coolingC: 4 },
  { tg: 37, food: 0.28, coolingC: 4.5 },
  { tg: 47, food: 0.35, coolingC: 5 },
  { tg: 150, food: 0.9, coolingC: 9 },
];
/**
 * Soot per person inside the fire zone. Toon et al. 2008: 100 Hiroshima-size (15 kt) weapons on megacities loft ~5 Tg,
 * i.e. ~0.05 Tg each, against ~170k people inside a 15 kt fire zone at megacity densities: ~0.25 t/person.
 */
export const SOOT_TONS_PER_PERSON = 0.25;
/** Stratospheric soot e-folding time, years (Robock et al. 2007, 150 Tg case). */
export const SOOT_LIFE_YEARS = 6;
/** Lag (e-folding, months) between soot injection and the climate and harvest response: ~95% within the first growing season. Estimate. */
export const CLIMATE_LAG_MONTHS = 2;

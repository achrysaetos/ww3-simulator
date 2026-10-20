/**
 * Domain tables for the air and missile war. Every behavioural difference between
 * platform classes or munition kinds lives here, keyed by class or kind, so the
 * system code reads one row instead of branching.
 */
import type { Munition, MunitionKind, Platform, PlatformClass, Posture, TargetClass } from '../../core/types';

export type AirRole = 'counter_air' | 'strike' | 'bomber' | 'awacs' | 'tanker' | 'ew' | 'isr' | 'helo' | 'transport';

export interface AirframeProfile {
  role: AirRole;
  /** Sorties per mission-capable aircraft per day at surge tempo. */
  surgePerDay: number;
  /** Sorties per mission-capable aircraft per day at sustained tempo. */
  sustainedPerDay: number;
  /** Can fly from a cell without an airport (helicopters, small drones). */
  roughField: boolean;
}

/**
 * Sortie rates: RAND MG-1028 "Sortie generation capacity" and the Gulf War Air Power
 * Survey (1993) give fighter surge 2-3/day and sustained ~1.2-1.5; B-52s from Diego
 * Garcia and Fairford averaged ~0.5/day; B-2s flew 30-44 h round trips from
 * Whiteman (~0.3/day). Attack helicopters 3+/day (short missions). Drones from
 * Ukraine 2022 TB2 usage: ~1/day per airframe.
 */
export const AIRFRAME: Partial<Record<PlatformClass, AirframeProfile>> = {
  fighter: { role: 'counter_air', surgePerDay: 2.5, sustainedPerDay: 1.3, roughField: false },
  multirole: { role: 'counter_air', surgePerDay: 2.2, sustainedPerDay: 1.2, roughField: false },
  attack_aircraft: { role: 'strike', surgePerDay: 2.2, sustainedPerDay: 1.2, roughField: false },
  bomber: { role: 'bomber', surgePerDay: 0.8, sustainedPerDay: 0.5, roughField: false },
  stealth_bomber: { role: 'bomber', surgePerDay: 0.4, sustainedPerDay: 0.3, roughField: false },
  awacs: { role: 'awacs', surgePerDay: 1, sustainedPerDay: 0.8, roughField: false },
  tanker: { role: 'tanker', surgePerDay: 1.5, sustainedPerDay: 1, roughField: false },
  ew_aircraft: { role: 'ew', surgePerDay: 1.5, sustainedPerDay: 1, roughField: false },
  maritime_patrol: { role: 'isr', surgePerDay: 1, sustainedPerDay: 0.7, roughField: false },
  transport_aircraft: { role: 'transport', surgePerDay: 1.5, sustainedPerDay: 1, roughField: false },
  isr_drone: { role: 'isr', surgePerDay: 1, sustainedPerDay: 0.8, roughField: true },
  strike_drone: { role: 'strike', surgePerDay: 1.2, sustainedPerDay: 0.8, roughField: true },
  attack_helo: { role: 'helo', surgePerDay: 3, sustainedPerDay: 2, roughField: true },
  transport_helo: { role: 'transport', surgePerDay: 3, sustainedPerDay: 2, roughField: true },
  asw_helo: { role: 'isr', surgePerDay: 2, sustainedPerDay: 1.5, roughField: true },
};

/** Roles whose sorties carry strike munitions to order.target. */
export const STRIKE_ROLES: ReadonlySet<AirRole> = new Set(['counter_air', 'strike', 'bomber', 'helo']);
/** Roles that take on tanker fuel. */
export const RECEIVER_ROLES: ReadonlySet<AirRole> = new Set(['counter_air', 'strike', 'bomber', 'ew', 'awacs']);
/** Postures that fly counter-air over order.target. */
export const COUNTER_AIR_POSTURES: ReadonlySet<Posture> = new Set(['air_superiority', 'escort', 'patrol']);
export const OFFENSIVE_POSTURES: ReadonlySet<Posture> = new Set(['strike', 'air_superiority', 'escort', 'patrol']);

/**
 * Ground launchers that fire strike munitions from their magazine. Launches per
 * launcher per day: Russia 2022 fired roughly one Iskander per TEL per day across
 * ~50 TELs; Kalibr ships/launchers 2-4; Shahed racks launch ~5 per night (Ukrainian
 * Air Force daily reports 2023-24). Estimates, not doctrine rates.
 */
export const LAUNCHER: Partial<Record<PlatformClass, { launchesPerDay: number }>> = {
  tel_srbm: { launchesPerDay: 1.5 },
  tel_mrbm: { launchesPerDay: 1 },
  tel_irbm: { launchesPerDay: 0.5 },
  cruise_launcher: { launchesPerDay: 3 },
  coastal_asm: { launchesPerDay: 2 },
  loitering_munition_launcher: { launchesPerDay: 5 },
};

/**
 * A one-way-drone row whose ORBAT count is drones staged on rails, not launch
 * trucks (shahed_136: "one drone on its rail", load 1). Its launch rate is set by
 * the site's crews, not by how many drones are staged.
 */
export function isRoundOnRail(p: Platform): boolean {
  return p.class === 'loitering_munition_launcher' && p.loadout.length === 1 && p.loadout[0].count === 1;
}

/**
 * Drones one launch site (an ORBAT launch group) puts up per day at full readiness.
 * Ukrainian Air Force monthly tallies for 2025: ~2,500 (Jan) rising to ~6,300 (Jul)
 * Shahed/Geran plus Gerbera decoys from 6-8 sites, i.e. ~25-35 per site per day on
 * average with single-night surges of 100+ per site (810 drones on 7 Sep 2025).
 * 45 x the groups' 0.65 readiness gives ~30 per site per day (estimate).
 */
export const DRONE_SITE_LAUNCHES_PER_DAY = 45;

/**
 * Rearming from national stocks. A formation's depot restores up to this share of its
 * full load per day (Iskander transloaders, Patriot reload trucks, airbase munitions
 * convoys turning around in 1-2 days; estimate). Guided rounds come out of the
 * national stockpile item by item; the kinds below are mass-produced iron and come
 * out of bulk ammunition tonnage by weight (Russia's FAB-500/1500 plus UMPK kits,
 * ~100+ glide bombs a day in 2024-25 per Ukrainian Air Force reports).
 */
export const REARM_SHARE_PER_DAY = 0.5;
export const BULK_AMMO_KINDS: ReadonlySet<MunitionKind> = new Set(['unguided_bomb', 'glide_bomb', 'rocket']);

/**
 * The ground counter-drone belt: mobile fire groups (machine guns, Gepards,
 * MANPADS), EW jamming and spoofing, and interceptor drones spread across a
 * defending nation's territory. A slow one-way drone flying `km` over defended
 * ground is downed with probability maxKill x (1 - exp(-(1 - difficulty) km / beltKm)).
 * Some always get through (routing around known groups, saturation on mass-raid
 * nights, weather), so the belt alone never exceeds maxKill. Fitted to Ukrainian Air
 * Force 2024-25 reports of ~80-90 % of Shaheds downed or "locationally lost" to EW,
 * of which SAMs and fighters took a minority (estimate; UAF and ISW daily summaries).
 * The same groups also down low, subsonic cruise missiles, far less often (judgment:
 * UAF credits mobile fire groups with a minority of Kh-101/Kalibr kills).
 */
export const COUNTER_DRONE = {
  maxKill: new Map<MunitionKind, number>([['drone_oneway', 0.85], ['loitering', 0.85], ['cruise', 0.3]]),
  beltKm: 100,
  sampleKm: 50,
};

export function beltKillProbability(kind: MunitionKind, overflightKm: number, difficulty: number): number {
  return (COUNTER_DRONE.maxKill.get(kind) ?? 0) * (1 - Math.exp((-(1 - difficulty) * overflightKm) / COUNTER_DRONE.beltKm));
}

/** How a threat behaves for air defense. */
export type ThreatCategory = 'aircraft' | 'air_breathing' | 'ballistic';

/** Category of each strike munition kind as an incoming threat; null = not intercepted by air defense. */
export const THREAT_OF_KIND: Record<MunitionKind, ThreatCategory | null> = {
  srbm: 'ballistic', mrbm: 'ballistic', irbm: 'ballistic', icbm: 'ballistic', slbm: 'ballistic', hgv: 'ballistic',
  antiship_ballistic: 'ballistic',
  cruise: 'air_breathing', antiship_cruise: 'air_breathing', glide_bomb: 'air_breathing', guided_bomb: 'air_breathing',
  loitering: 'air_breathing', drone_oneway: 'air_breathing', arm: 'air_breathing',
  unguided_bomb: null, aam: null, sam: null, abm: null, shorad_missile: null, atgm: null, shell: null,
  guided_shell: null, rocket: null, guided_rocket: null, torpedo: null, mine: null, small_arms: null,
};

/**
 * Which threats each interceptor kind engages. Long-range SAMs (Patriot PAC-2,
 * S-400) do terminal TBM defense; SHORAD missiles cannot catch ballistic reentry
 * vehicles. The catalog's 'abm' kind mixes dedicated exo/upper-tier ABMs (Arrow,
 * THAAD, SM-3: ballistic only) with dual-role hit-to-kill rounds (PAC-3 MSE,
 * Aster 30, Stunner) that also kill aircraft and cruise missiles; an 'abm' with an
 * aircraft pk is the dual-role kind.
 */
const INTERCEPTOR_ENGAGES: Partial<Record<MunitionKind, readonly ThreatCategory[]>> = {
  sam: ['aircraft', 'air_breathing', 'ballistic'],
  abm: ['ballistic'],
  shorad_missile: ['aircraft', 'air_breathing'],
  aam: ['aircraft', 'air_breathing'],
};

/**
 * Medium-range SAMs (NASAMS, IRIS-T SLM, Buk-M1, Kub) have no terminal TBM
 * capability; the ones that do (Patriot PAC-2, S-300/400, HQ-9, Buk-M3, SM-6) all
 * reach 70 km or more against aircraft.
 */
const TBM_CAPABLE_SAM_KM = 70;

export function engages(m: Munition, cat: ThreatCategory): boolean {
  if (m.kind === 'abm' && m.pk.aircraft !== undefined) return true;
  if (m.kind === 'sam' && cat === 'ballistic') return m.rangeKm >= TBM_CAPABLE_SAM_KM;
  return INTERCEPTOR_ENGAGES[m.kind]?.includes(cat) ?? false;
}

/**
 * Share of an interceptor's published range at which it can engage each threat.
 * Low-flying cruise missiles appear at the radar horizon (~40 km for a mast radar
 * vs a 30 m sea-skimmer); Patriot's TBM footprint is ~20-40 km against a 160 km
 * aircraft range (CRS RL31111, MDA fact sheets).
 */
const COVERAGE_SHARE: Record<ThreatCategory, number> = { aircraft: 1, air_breathing: 0.5, ballistic: 0.25 };

/** ABM rounds are built around the ballistic footprint; against air-breathing threats they see what any radar sees. */
export function coverageShare(interceptor: MunitionKind, cat: ThreatCategory): number {
  return interceptor === 'abm' && cat === 'ballistic' ? 1 : COVERAGE_SHARE[cat];
}

/**
 * AAM pk against a non-maneuvering air-breathing target relative to its pk against a
 * fighter. Combat AAM pk vs fighters ~0.46 (Higby 2005); US/UK/Israeli jets downed
 * most of ~170 Shaheds on 13-14 Apr 2024 with AIM-9X/AMRAAM, implying ~0.7-0.9.
 */
export const AAM_VS_DRONE_FACTOR = 1.6;

/** Munition kinds that are not strike weapons (air-to-air, interceptors, naval-only). */
export const NON_STRIKE_KINDS: ReadonlySet<MunitionKind> = new Set(['aam', 'sam', 'abm', 'shorad_missile', 'small_arms', 'torpedo', 'mine', 'arm']);

/** Target classes that move: a strike must find them, not just reach their cell. */
export const MOBILE_TARGETS: ReadonlySet<TargetClass> = new Set(['soft', 'armor', 'infantry']);

/** The target class a platform presents to a strike. */
export const TARGET_OF_CLASS: Record<PlatformClass, TargetClass> = {
  infantry: 'infantry', mbt: 'armor', ifv: 'armor', apc: 'armor', recon: 'armor', sp_artillery: 'armor',
  towed_artillery: 'soft', mlrs: 'soft', atgm: 'infantry', engineer: 'armor', truck: 'soft', fuel_truck: 'soft',
  sam_long: 'soft', sam_medium: 'soft', shorad: 'soft', abm: 'soft', ew: 'soft', radar: 'soft',
  tel_srbm: 'soft', tel_mrbm: 'soft', tel_irbm: 'soft', icbm_silo: 'hardened', icbm_mobile: 'soft', cruise_launcher: 'soft', coastal_asm: 'soft',
  fighter: 'aircraft', multirole: 'aircraft', attack_aircraft: 'aircraft', bomber: 'aircraft', stealth_bomber: 'aircraft',
  awacs: 'aircraft', tanker: 'aircraft', transport_aircraft: 'aircraft', maritime_patrol: 'aircraft', ew_aircraft: 'aircraft',
  isr_drone: 'aircraft', strike_drone: 'aircraft', loitering_munition_launcher: 'soft',
  attack_helo: 'helicopter', transport_helo: 'helicopter', asw_helo: 'helicopter',
  carrier: 'ship', amphibious: 'ship', cruiser: 'ship', destroyer: 'ship', frigate: 'ship', corvette: 'ship', patrol: 'ship',
  mine_warfare: 'ship', replenishment: 'ship', cargo_ship: 'ship', tanker_ship: 'ship', usv: 'ship',
  ssn: 'submarine', ssk: 'submarine', ssgn: 'submarine', ssbn: 'submarine', uuv: 'submarine',
  recon_satellite: 'structure', nav_satellite: 'structure', comms_satellite: 'structure', asat: 'structure',
};

/**
 * Tuning constants with their calibration. All are estimates fitted to the
 * historical anchors named; tests/air.calibration.test.ts re-checks each anchor.
 */
export const TUNING = {
  /** Fire-control cycle (launch, guide, assess) per channel, seconds. Patriot/S-300 engagement timelines ~60-90 s. */
  engagementCycleS: 75,
  /** Cap on engagements per channel per raid (launcher reload, ~30-60 min for Patriot/S-300 crews). */
  maxCycles: 12,
  /**
   * Default spread of a raid's arrivals at the target. Iran's Oct 2024 salvo of ~180
   * MRBMs and Russia's combined strikes arrived in waves over tens of minutes; 10 min
   * is an estimate between a coordinated time-on-target and a staggered wave.
   */
  raidWindowS: 600,
  /** Each tanker sortie refuels ~2 receivers once (KC-135 ~90 t offload vs ~6-8 t per fighter top-up, minus tanker reserve). */
  tankerReceiversPerTanker: 2,
  /** Two refuels per sortie (outbound and recovery) at most roughly doubles combat radius. */
  maxTankerExtension: 1,
  /** Fighter AAM shots per aircraft per BVR volley (standard 2-shot shoot doctrine). */
  shotsPerVolley: 2,
  /** WVR merge duration in hours of engaged combat (Platform.firepower is per hour). */
  wvrHours: 0.25,
  /** The weaker side disengages before the merge below this force ratio. */
  disengageRatio: 0.4,
  /** Share of air-combat and SAM kills that limp home damaged instead of lost (Vietnam/ODS battle-damage records, estimate). */
  damagedShare: 0.2,
  /** Air control is written once a side holds this share of surviving counter-air power. */
  controlShare: 0.6,
  /**
   * Share of sorties that end up inside a covering SAM's engagement envelope with a
   * firing solution, by mission. Fitted so non-stealth strike loses ~1-2 % per sortie
   * to a dense IADS (Linebacker II B-52s 2 %, Yom Kippur IAF ~1 %, ODS day 1 ~0.5 %)
   * and stealth ~0.05 % (F-117: 1 loss in ~2,100 sorties ODS + Allied Force).
   */
  samExposure: { strike: 0.05, counter_air: 0.03 } as Record<string, number>,
  /**
   * Release depth inside the outermost hostile SAM envelope at which a strike sortie
   * takes the full samExposure (Linebacker II and ODS packages flew 100+ km inside
   * layered SAM belts); shallower releases scale down linearly (estimate).
   */
  fullExposureDepthKm: 100,
  /**
   * Multiple of its unit cost at which a commander prices a lost airframe: crew,
   * months to replace (Russia builds ~20-30 Su-34 a year), lost sortie generation.
   * Both air forces over Ukraine in 2023-25 accepted very little SAM exposure,
   * trading cheap bombs for standoff missiles near known batteries (judgment).
   */
  airframeLossAversion: 10,
  /**
   * Share of strikes on a mobile unit aimed at a current position, and the minutes it
   * typically stays put once located. Judgment calls fitted to Ukraine 2023-25, where
   * Russia's thousands of strikes destroyed a few SAM launchers a month (Oryx).
   */
  mobileTargetLocated: 0.5,
  mobileTargetDwellMin: 60,
  /** Interceptor difficulty an aircraft presents (ECM, chaff, terrain masking, maneuver). */
  aircraftEvasion: 0.55,
  aircraftEvasionWithEw: 0.7,
  /** Coverage (channels x visibility) at which an IADS fully denies air control. */
  samDenialChannels: 12,
  maxSamDenial: 0.9,
  /** Strike sorties lost and aborted per unit of enemy air control at the target when unescorted. */
  enemyAirLoss: 0.05,
  enemyAirAbort: 0.5,
  /** Minimum standoff when enemy fighters hold the target's airspace, km. */
  standoffVsFightersKm: 300,
  /**
   * Infrastructure lost per 450 kg-class hit in a 1-degree cell. Russia's 2022-23
   * campaign on Ukraine's grid: ~1,000 missiles and drones cut ~40-50 % of generating
   * capacity concentrated in ~30 cells, i.e. ~0.5 % per hit (estimate).
   */
  structurePerHit: 0.005,
  /** Runway capacity cut per cratering hit, and rapid runway repair per day (USAF RADR: ~8 h to restore a MOS). */
  runwayPerHit: 0.08,
  runwayRepairPerDay: 1,
  /** Share of parked aircraft in hardened shelters (CSIS 2023 notes few shelters in Japan/Guam). */
  shelteredShare: 0.3,
  /** Suppression of a SAM's channels per ARM fired at it, and the cap (ODS: Iraqi radars largely silenced, few destroyed). */
  armSuppressionPerShot: 0.15,
  maxArmSuppression: 0.8,
  /**
   * ARM kill probability is degraded by emission control and shutdown tactics. ODS:
   * ~2,000 HARMs silenced Iraqi radars but destroyed perhaps 100-200, ~5-10 % a shot;
   * 0.1 x a 0.65 catalog pk gives ~6.5 % (estimate).
   */
  armPkFactor: 0.1,
  /** Fatigue gained per day of surge flying and recovered per day standing down; full fatigue halves sortie rate. */
  surgeFatiguePerDay: 0.15,
  restRecoveryPerDay: 0.3,
  /**
   * Cost exchange: a battery spends a round on a weapon only if the round costs at most
   * this multiple of it, or under the floor. Ukraine kept Patriot and NASAMS rounds for
   * missiles and fed IRIS-T, Stingers and guns to Shaheds; nobody fires PAC-3s at
   * USD 40k glide bombs (2023-25 reporting; ratio and floor are estimates).
   */
  interceptorCostRatio: 10,
  interceptorCostFloorUsdM: 0.5,
  /** Share of a defending fighter force's sorties available as an intercept layer vs cruise missiles and drones. */
  fighterInterceptShare: 0.5,
  /** Hours on station or in ingress beyond transit per sortie. */
  sortieOverheadHours: 1,
} as const;

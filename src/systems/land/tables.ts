import type { FormationKind, PlatformClass, TargetClass, Terrain } from '../../core/types';

export interface TerrainProfile {
  /**
   * Defender combat-power multiplier. Dupuy QJM terrain factors (Numbers,
   * Predictions and War, 1979, table 1): flat/open 1.0, rolling/mixed 1.3,
   * wooded 1.4-1.5, rugged/heavily wooded 1.6, mountain ~2; urban from TNDM
   * built-up factors and the 2022-24 record (Mariupol, Bakhmut) where urban
   * defence held at ratios that would collapse an open-field defence.
   */
  defense: number;
  /** Movement cost multiplier vs open road-capable terrain (FM 3-90 / FM 5-33 trafficability estimates). */
  moveCost: number;
  /** Close terrain: armour without infantry suffers (urban, forest, jungle, mountain). */
  closed: boolean;
}

export const TERRAIN: Record<Terrain, TerrainProfile> = {
  plain: { defense: 1.0, moveCost: 1.0, closed: false },
  desert: { defense: 1.0, moveCost: 1.1, closed: false },
  arctic: { defense: 1.3, moveCost: 2.0, closed: false },
  hills: { defense: 1.5, moveCost: 1.5, closed: false },
  forest: { defense: 1.5, moveCost: 1.7, closed: true },
  marsh: { defense: 1.4, moveCost: 2.5, closed: false },
  jungle: { defense: 1.6, moveCost: 3.0, closed: true },
  mountain: { defense: 2.0, moveCost: 3.0, closed: true },
  urban: { defense: 2.0, moveCost: 1.8, closed: true },
};

export const LAND_KINDS: ReadonlySet<FormationKind> = new Set(['maneuver', 'artillery', 'air_defense', 'missile', 'logistics']);

/** How the enemy sees a platform: the target class its firepower table is keyed against. */
export const TARGET_CLASS: Partial<Record<PlatformClass, TargetClass>> = {
  infantry: 'infantry', atgm: 'infantry',
  mbt: 'armor', ifv: 'armor', apc: 'armor', recon: 'armor', sp_artillery: 'armor', engineer: 'armor',
  icbm_silo: 'hardened',
};
export const targetClassOf = (c: PlatformClass): TargetClass => TARGET_CLASS[c] ?? 'soft';

/** Area-fire weapons: Lanchester linear law (kills scale with target density), the rest aimed fire (square law). */
export const INDIRECT_FIRE: ReadonlySet<PlatformClass> = new Set(['sp_artillery', 'towed_artillery', 'mlrs']);

/** Platforms that are not vehicles; in a formation that has vehicles they ride (mechanized/motorized). */
export const DISMOUNTS: ReadonlySet<PlatformClass> = new Set(['infantry', 'atgm']);

/**
 * Engaged hours per day of intense combat across the whole force. Not every
 * platform fires every hour: most of a brigade is out of line of sight, moving
 * or resupplying. Calibrated against the testkit catalog's `firepower` so that a
 * 3:1 assault on an entrenched plains defender costs the attacker ~1-3% of its
 * equipment per day (Ukraine 2022-24 assault rates, Oryx-derived; Dupuy TNDM
 * attacker loss ~1-4%/day for division-level attacks) and the defender ~4-8%.
 */
export const ENGAGED_HOURS_PER_DAY = 3;

/** Target platform count at which area fire reaches nominal effect (~a brigade in a 1-degree cell). Estimate. */
export const AREA_FIRE_REF_DENSITY = 400;
/** Weight of the linear law in aimed fire (0 = pure square, 1 = pure linear). Tuned with ENGAGED_HOURS_PER_DAY. */
export const DIRECT_DENSITY_EXP = 0.5;

/**
 * Close air support multiplier at full air control. Estimate: 1991 GWAPS credits
 * the air campaign with the bulk of Iraqi armour attrition before G-day; in
 * battle CAS roughly doubles a force's effective fire.
 */
export const CAS_BONUS = 1.0;
/** Fire lost under hostile air control (suppression, disrupted resupply and command). */
export const AIR_SUPPRESSION = 0.35;
/** Movement lost under hostile air control: daylight movement in Normandy 1944 was near-impossible for the Germans. */
export const AIR_INTERDICTION = 0.6;

/** Below this ammo fraction a unit rations fire linearly. */
export const AMMO_RATION_BELOW = 0.3;
/** Days of intense combat a basic load lasts (US Army planning: 3-5 days, FM 4-0). */
export const AMMO_DAYS_INTENSE = 3;
/** Fraction of full-operation fuel burn spent per hour of combat (manoeuvre, idling). */
export const COMBAT_FUEL_DUTY = 0.25;

/** Cumulative loss fraction that forces a retreat; Dupuy observed breakpoints 20-40% depending on quality. */
export const RETREAT_LOSS = 0.35;
export const RETREAT_MORALE = 0.3;
export const ROUT_MORALE = 0.12;
export const RALLY_MORALE = 0.4;
/** Share of equipment abandoned by a routed unit as it flees (captured or scuttled). */
export const ROUT_ABANDON = 0.05;

/** Combined-arms penalty: armour-heavy force with too few dismounts in close terrain. */
export const COMBINED_ARMS = { armorShare: 0.5, infantryShare: 0.2, fire: 0.7, vulnerability: 1.4 };

/** Road-march hours per day and average march speed as a share of platform sustained speed (FM 3-21 road march planning: ~150-250 km/day for a mechanized division). */
export const MARCH_HOURS_PER_DAY = 10;
export const MARCH_SPEED_FACTOR = 0.5;
/** Railway strategic movement: up to 3x road-march throughput in own territory with dense rail. */
export const RAIL_BOOST_MAX = 2;
export const RAIL_KM_FULL = 300;
/** Advance into enemy-held ground is slower: reconnaissance, obstacles, demolitions. */
export const HOSTILE_GROUND_COST = 2;
/** Without fuel, vehicles cannot move; troops walk and tow what they can. */
export const NO_FUEL_SPEED = 0.1;

/** Per-day rates. */
export const ENTRENCH_PER_DAY = 0.2;
export const FATIGUE_MARCH_PER_DAY = 0.05;
export const FATIGUE_COMBAT_PER_DAY = 0.15;
export const FATIGUE_RECOVERY_PER_DAY = 0.1;
export const MORALE_RECOVERY_PER_DAY = 0.03;
export const MORALE_ISOLATED_PER_DAY = 0.04;
export const EXPERIENCE_PER_COMBAT_DAY = 0.005;

/** Entrenchment at 1 adds Dupuy's "fortified" posture factor (1.6) on top of terrain. */
export const ENTRENCH_MAX_BONUS = 0.6;

/** Opinion above which a nation lets another's troops through. */
export const ALLIED_OPINION = 50;

/** Daily surrender hazard per day encircled, scaled by (1 - morale). Stalingrad 6th Army held ~70 days; Ilovaisk/Debaltseve pockets collapsed in 1-3 weeks. */
export const SURRENDER_HAZARD_PER_DAY = 0.01;
/** A fresh pocket holds on its basic load for about a week before surrender becomes possible. */
export const SURRENDER_GRACE_DAYS = 7;

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
 * 3:1 assault on an entrenched plains defender costs each side ~2-4% of its
 * equipment per day, the attacker more than twice the defender's personnel
 * (Dupuy TNDM attacker loss ~1-4%/day for division-level attacks; Ukraine
 * 2023-25, where the defender's dug-in advantage outweighed the attacker's mass).
 */
export const ENGAGED_HOURS_PER_DAY = 1.5;

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
/** Gun artillery, which fires rounds at SHELLS_PER_TUBE_DAY rather than spending a basic load. */
export const TUBE_ARTILLERY: ReadonlySet<PlatformClass> = new Set(['sp_artillery', 'towed_artillery']);
/** A complete 152/155 mm round with charge and packaging, tons (matches the industry model's shell weight). */
export const SHELL_TONS = 0.06;
/**
 * Rounds per gun per day of full-intensity combat; holding a line fires a quarter of
 * that (POSITIONAL_INTENSITY). Calibration: Russia fired ~10-20k rounds a day in
 * 2024-25 from roughly 4,000-5,000 guns in theatre, 2-5 a gun a day averaged over
 * quiet and active sectors (RUSI, ISW, Estonian intelligence), so about 3 a day on a
 * held line. A gun's basic load here is only 15-30 rounds (core/forces.ts sizes it
 * from firepower), so higher rates empty it before logistics can refill it.
 */
export const SHELLS_PER_TUBE_DAY = 12;
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

/**
 * Holding-the-line fighting between units in contact that are not assaulting:
 * artillery duels, drone strikes, raids and local counter-attacks. Share of an
 * assault's engaged hours. Estimate, tuned so a quiet 2024-25 Ukrainian front
 * sector costs each side a few tenths of a percent of its strength per day.
 */
export const POSITIONAL_INTENSITY = 0.25;

/**
 * Advance across a contested cell, averaged over the cell's ~100 km width.
 * Attritional assaults gain ATTRITION_KM_PER_DAY per unit of ln(defender loss
 * rate / attacker loss rate): Russian assaults in 2024-25 took ~3,500-5,000 km2
 * a year along a ~1,000 km front (ISW, DeepState), i.e. a few km of depth a
 * year averaged over the front, and 0.1-1 km/day on the active axes.
 */
export const ATTRITION_KM_PER_DAY = 0.15;
export const ATTRITION_MAX_KM_PER_DAY = 1;
/**
 * Against a broken (routed) defender: 10-40 km/day, e.g. Kharkiv September 2022
 * (~50 km in 5 days), Kursk August 2024 (~25-30 km in the first days).
 */
export const BREAKTHROUGH_KM_PER_DAY = 25;
/**
 * Through an empty cell the enemy line next door still covers with drones and
 * artillery: infiltration, not breakthrough. Russia's fastest sustained gains
 * of the war, on the Pokrovsk, Kurakhove and Velyka Novosilka axes in autumn
 * 2024 where Ukrainian lines had thinned, ran 1-4 km/day (ISW, DeepState).
 */
export const COVERED_KM_PER_DAY = 3;

/**
 * Share of a formation's platforms of each class that stand where the enemy can
 * engage them in a ground fight; the rest are in the rear (supply columns,
 * long-range air defence, command). Unlisted classes are fully exposed.
 * Estimate: Oryx counts Russian trucks lost at roughly the tank rate in
 * 2022-24 although formations field 5-10 times more trucks than tanks; tube and
 * rocket artillery fight from 10-30 km behind the line and die mostly to
 * counter-battery fire and drones. Tanks and carriers overwatch and shuttle
 * the dismounts rather than lead (RUSI "Stormbreak", 2023): Oryx counts
 * ~3-5 Russian tanks and ~8-10 other armoured vehicles lost per day in 2024
 * against ~1,000-1,500 personnel casualties (UK MoD).
 */
export const EXPOSURE: Partial<Record<PlatformClass, number>> = {
  mbt: 0.4, ifv: 0.5, apc: 0.5,
  truck: 0.05, fuel_truck: 0.05, engineer: 0.5, recon: 0.8,
  sp_artillery: 0.3, towed_artillery: 0.3, mlrs: 0.25,
  sam_long: 0.05, sam_medium: 0.15, shorad: 0.4, abm: 0.05, ew: 0.2, radar: 0.1,
  tel_srbm: 0.05, tel_mrbm: 0.05, tel_irbm: 0.05, cruise_launcher: 0.05, coastal_asm: 0.05, icbm_mobile: 0.02,
};
export const exposureOf = (c: PlatformClass): number => EXPOSURE[c] ?? 1;

/**
 * Extra fire an assaulting force draws, at full entrenchment, while it crosses
 * observed ground into prepared positions (minefields, pre-registered fires,
 * the drone-watched kill zone), on top of the defender's Dupuy terrain and
 * posture edge. Scales with the defender's entrenchment, so a hasty defence
 * gives little of it. Estimate, calibrated so a 3:1 assault on a fully
 * prepared defence costs the attacker 2-3 times the defender's casualties, the
 * ratio Western estimates give for Russian assaults on Avdiivka, Bakhmut and
 * Pokrovsk in 2023-25 (UK MoD; RUSI "Meatgrinder", 2023).
 */
export const ASSAULT_EXPOSURE = 2;
/**
 * Share of an assaulting force inside the kill zone at once when it attacks a fully
 * prepared line; the rest waits out of drone and artillery reach while its guns fire.
 * Scales with the defender's entrenchment, so a hasty defence faces the whole force.
 * In 2024-25 drone-saturated observation 10-20 km deep made massed mechanised
 * assaults suicidal, and Russia attacked in waves of small infantry groups with most
 * of the force held back (RUSI, Watling and Reynolds, "Tactical Developments During
 * the Third Year of the Russo-Ukrainian War", 2025; ISW). Judgment, calibrated with
 * the front supplied so that Russia loses ~1,000-1,700 men and 5-8 tanks a day
 * (UK MoD, Oryx) while firing 10-20k shells.
 */
export const KILL_ZONE_COMMIT = 0.3;
/**
 * Entrenchment a shaken defender must have dug before it can give up a line for the
 * next one: two and a half days of digging at ENTRENCH_PER_DAY. Below it there is no
 * prepared line to give up. Judgment: Ukrainian withdrawals in 2023-25 came every
 * few days to weeks on an active axis, not continuously (Avdiivka, Vuhledar, Pokrovsk).
 */
export const NEXT_LINE_ENTRENCHMENT = 0.5;
/** Depth given up when a defender falls back to its next prepared line: 2-5 km per withdrawal in 2023-25 (Avdiivka, Vuhledar). */
export const WITHDRAWAL_KM = 3;
/**
 * Local superiority at which an attacker assaults along the whole cell; below
 * it, assault intensity scales down in proportion (attacks on a few axes, the
 * rest of the line held). The 3:1 planning ratio (FM 3-90; Mearsheimer 1989).
 */
export const DELIBERATE_ASSAULT_RATIO = 3;
/**
 * Exposed platforms that can bring direct fire to bear along one cell's
 * ~100 km front: a mechanised brigade (~300 platforms) holds or attacks on
 * roughly 10 km (FM 3-90; Ukrainian brigades held 10-20 km sectors in 2024).
 */
export const FRONTAGE_PLATFORMS = 3000;
/** Front length FRONTAGE_PLATFORMS holds: a 1-degree cell's ~100 km. Smaller cells (islands, city-states) need proportionally fewer. */
export const CELL_FRONT_KM = 100;
/**
 * Share of the gaps in a thin line that a fully dug-in defender closes with its own obstacles,
 * mines and pre-registered fires (FM 3-90 hasty barrier plans), as against a standing fortified
 * belt that closes them all. Judgment: half. With it a thin, dug-in NATO line in baltic-2027 gives
 * up 2-5 cells in three weeks without collapsing, against ~1 at the old 1 km/day cap.
 */
export const HASTY_BARRIER = 0.5;

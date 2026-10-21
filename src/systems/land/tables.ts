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
/**
 * Days of full-intensity combat over which armed platforms other than gun artillery (tanks,
 * IFVs, infantry, mortars, ATGMs) spend their basic load. US planning has a load last 3-5 days
 * of mobile high-intensity combat (FM 4-0), but on a positional front the guns fire most of the
 * tonnage. At 3 days the rest of the army drew twice the shells' tonnage in ukraine-2026 and
 * drained Ukraine's depots by D+180; at 10 it draws about two-thirds of it (judgment).
 */
export const AMMO_DAYS_INTENSE = 10;
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
// param: tag=judgment range=[0.15,0.4] source=UK MoD daily loss estimates 2024-25, fitted
export const POSITIONAL_INTENSITY = 0.25;

/**
 * The front law. Advance across a contested cell, averaged over the cell's width, is the fastest of three ways
 * through (combat.ts advanceKm):
 * - Attrition against a line that holds: ATTRITION_KM_PER_DAY per unit of ln(defender loss rate / attacker loss
 *   rate), at most ATTRITION_MAX_KM_PER_DAY. Russian assaults in 2024-25 took ~3,500-5,000 km2 a year along a
 *   ~1,000 km front (ISW, DeepState): 0.1-1 km/day on the active axes.
 * - Manoeuvre through the gaps of a line too thin for its cell, from COVERED_KM_PER_DAY at parity to
 *   BREAKTHROUGH_KM_PER_DAY at the deliberate-assault ratio: Pokrovsk axis autumn 2024 (1-4 km/day), Kharkiv
 *   September 2022 (50-70 km in about 5 days against a thin, unfortified screen).
 * - Penetration by mass beyond DELIBERATE_ASSAULT_RATIO, reaching breakthrough pace at MASSED_ASSAULT_RATIO, slowed
 *   by a standing belt (BELT_DRAG), a city (URBAN_MANOEUVRE) and a river (RIVER_TEMPO): Kursk August 2024 (25-30 km
 *   in 3-4 days through a fortified, thinly held border), the 1973 Bar Lev crossing (a fortified canal line broken
 *   along its length in a day at ~5:1 or more, then 10-15 km deep), Desert Storm (VII Corps 250 km in 100 hours
 *   against a dug-in, outclassed army), Vovchansk May 2024 (5-10 km in 3-4 days).
 */
// param: tag=estimated range=[0.1,0.3] source=ISW/DeepState 2024-25 area gains
export const ATTRITION_KM_PER_DAY = 0.15;
// param: tag=estimated range=[0.5,2] source=ISW/DeepState 2024-25 active axes
export const ATTRITION_MAX_KM_PER_DAY = 1;
/**
 * Against a broken (routed) defender: 10-40 km/day, e.g. Kharkiv September 2022
 * (~50 km in 5 days), Kursk August 2024 (~25-30 km in the first days).
 */
// param: tag=observed range=[15,40] source=Kharkiv Sep 2022; Kursk Aug 2024; Desert Storm 1991
export const BREAKTHROUGH_KM_PER_DAY = 25;
/**
 * Through an empty cell the enemy line next door still covers with drones and
 * artillery: infiltration, not breakthrough. Russia's fastest sustained gains
 * of the war, on the Pokrovsk, Kurakhove and Velyka Novosilka axes in autumn
 * 2024 where Ukrainian lines had thinned, ran 1-4 km/day (ISW, DeepState).
 */
// param: tag=observed range=[1,4] source=ISW/DeepState Pokrovsk, Kurakhove axes autumn 2024
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
  mbt: 0.35, ifv: 0.5, apc: 0.5,
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
// param: tag=judgment range=[0.2,0.6] source=RUSI Watling & Reynolds 2025; UK MoD, Oryx loss rates
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
// param: tag=observed range=[2.5,3.5] source=FM 3-90; Mearsheimer 1989
export const DELIBERATE_ASSAULT_RATIO = 3;
/**
 * Whole-force odds (every weapon counted, those waiting in depth too) at which an assault on a manned line breaks
 * through at BREAKTHROUGH_KM_PER_DAY on the sector it masses on; from DELIBERATE_ASSAULT_RATIO up the pace rises in
 * proportion. Soviet 1944-45 fronts massed several times the defender on narrow breakthrough sectors and broke a
 * prepared tactical zone in one to three days (Glantz and House, When Titans Clashed, 1995); the Egyptian army
 * crossed the canal and the Bar Lev line along its length on 6 October 1973 with a large local superiority.
 * Estimate: at 6:1 a fortified plain cell is crossed in about a week, at 9:1 in about four days.
 */
// param: tag=estimated range=[6,12] source=Glantz & House 1995; 1973 Bar Lev crossing; Kursk 2024
export const MASSED_ASSAULT_RATIO = 9;
/**
 * Share of a penetration's or an infiltration's pace that a standing belt of minefields, ditches and dragon's teeth
 * takes away. Engineers breach lanes in hours where no garrison covers them (FM 3-90: an obstacle not covered by
 * fire is not an obstacle), and Ukraine went through Russia's fortified, thinly held Kursk border at 8-10 km a day
 * in August 2024 (ISW). Judgment.
 */
// param: tag=judgment range=[0.3,0.8] source=FM 3-90; ISW Kursk Aug 2024
export const BELT_DRAG = 0.6;
/**
 * Share of a manoeuvre or penetration pace kept inside a city cell: every block is a strongpoint that must be
 * cleared, and gaps do not open. Fallujah II (2004) took six weeks at about 6:1 for a city ~10 km across; Mariupol
 * 86 days encircled; Bakhmut about ten months. Judgment for a cell that is part city, part countryside.
 */
// param: tag=judgment range=[0.1,0.4] source=Fallujah 2004; Mariupol 2022; Bakhmut 2022-23
export const URBAN_MANOEUVRE = 0.2;
/**
 * A major river between an attacker and the cell it assaults, with no dry approach held: the defender's combat edge
 * grows by RIVER_DEFENSE (registered fires on the crossing sites, an attacker that crosses a few vehicles at a time)
 * and the attacker's advance runs at RIVER_TEMPO of its pace until it holds ground on the far bank. Ukraine's Krynky
 * bridgehead (November 2023 to July 2024) never grew past a few km; a Russian battalion group lost ~70 vehicles at
 * one Siverskyi Donets crossing at Bilohorivka in May 2022; FM 3-90.12 treats a contested wet-gap crossing as a
 * deliberate operation of its own.
 */
// param: tag=judgment range=[1.2,2] source=FM 3-90.12; Bilohorivka May 2022
export const RIVER_DEFENSE = 1.5;
// param: tag=judgment range=[0.1,0.5] source=FM 3-90.12; Krynky 2023-24
export const RIVER_TEMPO = 0.25;
/**
 * Movement cost of a river edge: over intact bridges the crossing is a bottleneck (RIVER_BRIDGE_COST); with the
 * bridges down, or into enemy-held ground where they are blown, the crossing waits on assault boats and pontoons
 * (RIVER_ASSAULT_COST). A brigade's float-bridge crossing takes most of a day to set up and pass (FM 3-90.12).
 */
// param: tag=judgment range=[1.1,1.5] source=FM 3-90.12
export const RIVER_BRIDGE_COST = 1.3;
// param: tag=judgment range=[2,5] source=FM 3-90.12
export const RIVER_ASSAULT_COST = 3;
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
 * belt that closes them all. Judgment, with attackers that no longer run their magazines dry in
 * three days (AMMO_DAYS_INTENSE): a thin, dug-in NATO line in baltic-2027 gives up a few cells
 * in three weeks without collapsing, against ~1 at the old 1 km/day cap.
 */
// param: tag=judgment range=[0.5,0.9] source=FM 3-90 hasty barrier plans; baltic-2027 fit
export const HASTY_BARRIER = 0.7;

import type { Formation, FormationKind, PlatformClass, PlatformId, TargetClass, Terrain } from '../../core/types';
import { defineParam } from '../../core/params';
import { eraDroneFire, eraKillZoneCommit, eraPositionalIntensity } from '../adaptation/era';

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

/**
 * Area-fire weapons: Lanchester linear law (kills scale with target density), the rest aimed fire (square law).
 * Drone teams are aimed fire: only so many crews can fly over one stretch of front, so they share its frontage.
 */
export const INDIRECT_FIRE: ReadonlySet<PlatformClass> = new Set(['sp_artillery', 'towed_artillery', 'mlrs']);

/**
 * Multiplier on the land fire of drone teams (FPV and Lancet-class loitering munitions). Ukrainian
 * commanders and RUSI put drones behind 60-80% of Russian casualties and destroyed vehicles in 2024-25
 * (Watling and Reynolds, "Tactical Developments During the Third Year of the Russo-Ukrainian War", RUSI,
 * Feb 2025; Ukrainian General Staff statements). These are combatant claims, likely high. At 1, drone teams
 * hold some 45% of a Ukrainian front brigade's anti-personnel fire and 15% of a Russian one's, and Russian
 * counter-drone EW halves Ukraine's (ukraine-2026). Casualty totals keep to their realism bands from 0.3 to 2.
 * The era dial era.STRIKE_COST_RATIO scales it; the drone-versus-counter-drone cycle over a war moves the
 * jamming of drone links instead (src/systems/adaptation).
 */
const DRONE_FIRE_2025 = defineParam({
  id: 'land.DRONE_FIRE', value: 1, range: [0.3, 2], tag: 'contested',
  source: 'RUSI (Watling and Reynolds, Feb 2025); Ukrainian General Staff: drones cause 60-80% of casualties (combatant claims)',
  affects: 'land fire of FPV and loitering-munition teams',
});
/** Drone-team fire under the run's era (era.STRIKE_COST_RATIO); the calibrated value at the default era. */
export const DRONE_FIRE = (): number => eraDroneFire(DRONE_FIRE_2025());
export const fireScaleOf = (c: PlatformClass): number => (c === 'loitering_munition_launcher' ? DRONE_FIRE() : 1);

/**
 * Special-forces platforms. A formation most of whose dismounts are special forces infiltrates: on any
 * order but an attack it slips through and stays behind enemy lines without fighting for ground, is
 * hard to find there, inserts by air without air control, and raids the command posts it finds.
 */
export const SOF_PLATFORMS: ReadonlySet<string> = new Set(['sof_squad']);
export function isSof(f: Formation): boolean {
  let sof = 0, all = 0;
  for (const pid of SOF_PLATFORMS) sof += f.equipment[pid as PlatformId] ?? 0;
  if (sof <= 0) return false;
  for (const pid in f.equipment) if (!SOF_PLATFORMS.has(pid) && pid.includes('squad')) all += f.equipment[pid as PlatformId];
  return sof >= all;
}
/** An infiltrating special-forces formation: behind the lines it avoids battle rather than seeking it. */
export const infiltrating = (f: Formation): boolean => f.order.posture !== 'attack' && isSof(f);
/**
 * Km of march an infiltrator spends per km of enemy-held ground: on foot, by night, round the
 * positions. North Korean infiltration doctrine has light infantry crossing the DMZ and covering
 * 20-40 km a night through the hills (ROK Defense White Paper 2022). Judgment.
 */
export const INFILTRATION_COST = 2;

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
export const ENGAGED_HOURS_PER_DAY = defineParam({ id: 'land.ENGAGED_HOURS_PER_DAY', value: 1.5, range: [1, 2.5], tag: 'judgment',
  source: 'Tuned so a 3:1 assault on a dug-in defender costs 2-4% of equipment a day (Dupuy TNDM attacker loss 1-4%/day; Ukraine 2023-25)',
  affects: 'ground loss rates' });

/** Target platform count at which area fire reaches nominal effect (~a brigade in a 1-degree cell). Estimate. */
export const AREA_FIRE_REF_DENSITY = defineParam({ id: 'land.AREA_FIRE_REF_DENSITY', value: 400, range: [200, 800], tag: 'judgment',
  source: 'Judgment: about a brigade in a 1-degree cell',
  affects: 'area-fire effect vs dispersion' });
/** Weight of the linear law in aimed fire (0 = pure square, 1 = pure linear). Tuned with ENGAGED_HOURS_PER_DAY. */
export const DIRECT_DENSITY_EXP = defineParam({ id: 'land.DIRECT_DENSITY_EXP', value: 0.5, range: [0.25, 0.75], tag: 'judgment',
  source: 'Judgment between Lanchester square (0) and linear (1) laws, tuned with ENGAGED_HOURS_PER_DAY',
  affects: 'aimed-fire losses vs density' });

/**
 * Close air support multiplier at full air control. Estimate: 1991 GWAPS credits
 * the air campaign with the bulk of Iraqi armour attrition before G-day; in
 * battle CAS roughly doubles a force's effective fire.
 */
export const CAS_BONUS = defineParam({ id: 'land.CAS_BONUS', value: 1.0, range: [0.5, 1.5], tag: 'estimated',
  source: '1991 GWAPS: air attrited most Iraqi armour before G-day; CAS roughly doubles effective fire',
  affects: 'ground fire under friendly air control' });
/** Fire lost under hostile air control (suppression, disrupted resupply and command). */
export const AIR_SUPPRESSION = defineParam({ id: 'land.AIR_SUPPRESSION', value: 0.35, range: [0.2, 0.5], tag: 'judgment',
  source: 'Judgment: fire lost to suppression, disrupted resupply and command under hostile air',
  affects: 'ground fire under enemy air control' });
/** Movement lost under hostile air control: daylight movement in Normandy 1944 was near-impossible for the Germans. */
export const AIR_INTERDICTION = defineParam({ id: 'land.AIR_INTERDICTION', value: 0.6, range: [0.4, 0.8], tag: 'estimated',
  source: 'Normandy 1944: German daylight movement near-impossible under Allied air',
  affects: 'movement under enemy air control' });

/** Below this ammo fraction a unit rations fire linearly. */
export const AMMO_RATION_BELOW = 0.3;
/**
 * Days of full-intensity combat over which armed platforms other than gun artillery (tanks,
 * IFVs, infantry, mortars, ATGMs) spend their basic load. US planning has a load last 3-5 days
 * of mobile high-intensity combat (FM 4-0), but on a positional front the guns fire most of the
 * tonnage. At 3 days the rest of the army drew twice the shells' tonnage in ukraine-2026 and
 * drained Ukraine's depots by D+180; at 10 it draws about two-thirds of it (judgment).
 */
export const AMMO_DAYS_INTENSE = defineParam({ id: 'land.AMMO_DAYS_INTENSE', value: 10, range: [3, 15], tag: 'judgment',
  source: 'FM 4-0 basic load lasts 3-5 days of mobile combat; 10 keeps non-gun ammunition at ~2/3 of shell tonnage on a positional front (judgment)',
  affects: 'ammunition burn and depot drain' });
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
export const SHELLS_PER_TUBE_DAY = defineParam({ id: 'land.SHELLS_PER_TUBE_DAY', value: 12, range: [8, 16], tag: 'estimated',
  source: 'Russia fired 10-20k rounds/day from 4-5k guns in 2024-25 (RUSI, ISW, Estonian intelligence)',
  affects: 'artillery fire and shell consumption' });
/** Fraction of full-operation fuel burn spent per hour of combat (manoeuvre, idling). */
export const COMBAT_FUEL_DUTY = 0.25;

/** Cumulative loss fraction that forces a retreat; Dupuy observed breakpoints 20-40% depending on quality. */
export const RETREAT_LOSS = defineParam({ id: 'land.RETREAT_LOSS', value: 0.35, range: [0.2, 0.4], tag: 'observed',
  source: 'Dupuy: unit breakpoints at 20-40% cumulative loss',
  affects: 'when units break off' });
export const RETREAT_MORALE = defineParam({ id: 'land.RETREAT_MORALE', value: 0.3, range: [0.2, 0.4], tag: 'judgment',
  source: 'Judgment: morale at which a unit falls back',
  affects: 'when units break off' });
export const ROUT_MORALE = defineParam({ id: 'land.ROUT_MORALE', value: 0.12, range: [0.06, 0.2], tag: 'judgment',
  source: 'Judgment: morale at which a retreat becomes a rout',
  affects: 'breakthroughs' });
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
export const HOSTILE_GROUND_COST = defineParam({ id: 'land.HOSTILE_GROUND_COST', value: 2, range: [1.5, 3], tag: 'judgment',
  source: 'Judgment: reconnaissance, obstacles and demolitions slow an advance into enemy ground',
  affects: 'advance speed' });
/** Without fuel, vehicles cannot move; troops walk and tow what they can. */
export const NO_FUEL_SPEED = 0.1;
/**
 * Share of its march pace a formation keeps while it breaks contact from a cell the enemy is assaulting: it pulls
 * back by bounds behind a covering force, still under fire. FM 3-90 treats retrograde under pressure as the most
 * dangerous operation; the Avdiivka (February 2024) and Debaltseve (February 2015) withdrawals cost heavily.
 */
export const BREAK_CONTACT_PACE = defineParam({ id: 'land.BREAK_CONTACT_PACE', value: 0.25, range: [0.1, 0.5], tag: 'judgment',
  source: 'FM 3-90 retrograde; Avdiivka 2024',
  affects: 'withdrawal under assault' });

/** Per-day rates. */
export const ENTRENCH_PER_DAY = defineParam({ id: 'land.ENTRENCH_PER_DAY', value: 0.2, range: [0.1, 0.35], tag: 'judgment',
  source: 'Judgment: days to dig a prepared position',
  affects: 'defender advantage over time' });
export const FATIGUE_MARCH_PER_DAY = 0.05;
export const FATIGUE_COMBAT_PER_DAY = 0.15;
export const FATIGUE_RECOVERY_PER_DAY = 0.1;
export const MORALE_RECOVERY_PER_DAY = 0.03;
export const MORALE_ISOLATED_PER_DAY = 0.04;
export const EXPERIENCE_PER_COMBAT_DAY = 0.005;

/** Entrenchment at 1 adds Dupuy's "fortified" posture factor (1.6) on top of terrain. */
export const ENTRENCH_MAX_BONUS = defineParam({ id: 'land.ENTRENCH_MAX_BONUS', value: 0.6, range: [0.4, 0.8], tag: 'estimated',
  source: 'Dupuy fortified posture factor 1.6 on top of terrain',
  affects: 'defender advantage' });

/** Opinion above which a nation lets another's troops through. */
export const ALLIED_OPINION = 50;

/** Daily surrender hazard per day encircled, scaled by (1 - morale). Stalingrad 6th Army held ~70 days; Ilovaisk/Debaltseve pockets collapsed in 1-3 weeks. */
export const SURRENDER_HAZARD_PER_DAY = defineParam({ id: 'land.SURRENDER_HAZARD_PER_DAY', value: 0.01, range: [0.005, 0.03], tag: 'estimated',
  source: 'Stalingrad 6th Army held ~70 days; Ilovaisk/Debaltseve pockets collapsed in 1-3 weeks',
  affects: 'pocket surrender' });
/** A fresh pocket holds on its basic load for about a week before surrender becomes possible. */
export const SURRENDER_GRACE_DAYS = 7;

/**
 * Holding-the-line fighting between units in contact that are not assaulting:
 * artillery duels, drone strikes, raids and local counter-attacks. Share of an
 * assault's engaged hours. Estimate, tuned so a quiet 2024-25 Ukrainian front
 * sector costs each side a few tenths of a percent of its strength per day.
 */
const POSITIONAL_INTENSITY_2025 = defineParam({ id: 'land.POSITIONAL_INTENSITY', value: 0.25, range: [0.15, 0.4], tag: 'judgment',
  source: 'Tuned so a quiet 2024-25 Ukrainian sector costs a few tenths of a percent of strength a day',
  affects: 'positional attrition and shell use' });
/** Positional intensity under the run's era (era.STRIKE_COST_RATIO); the calibrated value at the default era. */
export const POSITIONAL_INTENSITY = (): number => eraPositionalIntensity(POSITIONAL_INTENSITY_2025());

/**
 * The front law. Each pace below is a pace on the sector an attacker assaults, cited from the axes it was observed
 * on. The cell's advance, averaged over its width, is that pace times the share of the cell's front the attacker's
 * platforms in contact fill at FRONTAGE_PLATFORMS density (combat.ts `sector`): a force spread over many cells opens
 * many narrow axes, not many full-width ones. A broken (routed) or absent defender confines nothing, so exploitation
 * runs the cell's full width. The fastest of three ways through a held line wins (combat.ts advanceKm):
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
export const ATTRITION_KM_PER_DAY = defineParam({ id: 'land.ATTRITION_KM_PER_DAY', value: 0.15, range: [0.08, 0.3], tag: 'judgment',
  source: 'Front law, fitted to Ukraine only: Russia took 3,500-5,000 km2/yr on ~1,000 km of front in 2024-25 (ISW, DeepState)',
  affects: 'attritional advance rate' });
export const ATTRITION_MAX_KM_PER_DAY = defineParam({ id: 'land.ATTRITION_MAX_KM_PER_DAY', value: 1, range: [0.5, 2], tag: 'estimated',
  source: '0.1-1 km/day on active axes in 2024-25 (ISW, DeepState)',
  affects: 'attritional advance rate cap' });
/**
 * Against a broken (routed) defender: 10-40 km/day, e.g. Kharkiv September 2022
 * (~50 km in 5 days), Kursk August 2024 (~25-30 km in the first days).
 */
export const BREAKTHROUGH_KM_PER_DAY = defineParam({ id: 'land.BREAKTHROUGH_KM_PER_DAY', value: 25, range: [10, 40], tag: 'observed',
  source: 'Kharkiv Sep 2022 ~50 km in 5 days; Kursk Aug 2024 25-30 km in the first days',
  affects: 'advance against a routed defender' });
/**
 * Through an empty cell the enemy line next door still covers with drones and
 * artillery: infiltration, not breakthrough. Russia's fastest sustained gains
 * of the war, on the Pokrovsk, Kurakhove and Velyka Novosilka axes in autumn
 * 2024 where Ukrainian lines had thinned, ran 1-4 km/day (ISW, DeepState).
 */
export const COVERED_KM_PER_DAY = defineParam({ id: 'land.COVERED_KM_PER_DAY', value: 3, range: [1, 4], tag: 'observed',
  source: 'Pokrovsk, Kurakhove, Velyka Novosilka axes autumn 2024: 1-4 km/day (ISW, DeepState)',
  affects: 'infiltration through thin lines' });

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
  sp_artillery: 0.3, towed_artillery: 0.3, mlrs: 0.25, loitering_munition_launcher: 0.3,
  sam_long: 0.05, sam_medium: 0.15, shorad: 0.4, abm: 0.05, ew: 0.2, radar: 0.1,
  tel_srbm: 0.05, tel_mrbm: 0.05, tel_irbm: 0.05, cruise_launcher: 0.05, coastal_asm: 0.05, icbm_mobile: 0.02,
};
export const exposureOf = (c: PlatformClass): number => EXPOSURE[c] ?? 1;

/**
 * Exposed platforms (EXPOSURE-weighted, as every side total in the combat code) per km of front that a defender needs to
 * watch and cover a cell's whole front with fire, its kill zone. A Soviet-pattern motor-rifle battalion defends up to 5 km
 * (FM 100-2-1, "The Soviet Army: Operations and Tactics", 1984). A brigade here carries 112 exposed platforms at the median
 * for Ukraine and 123 for Russia (ukraine-2026 order of battle at day 0), so a battalion is about 25-30, or ~5-6 per km.
 * Ukrainian brigades holding 10-20 km in 2024-25 give 6-12 per km before the gaps drones watch. A thinner line kills only on
 * the share of the front it covers: one battalion in a 40 km cell does not make the whole cell a kill zone.
 */
export const KILL_ZONE_DENSITY = defineParam({ id: 'land.KILL_ZONE_DENSITY', value: 5, range: [3, 8], tag: 'estimated',
  source: 'FM 100-2-1 (1984): motor-rifle battalion defends up to 5 km; ~25-30 exposed platforms per battalion in this order of battle',
  affects: 'how thin a dug-in line can be and still hold an assault in its kill zone' });
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
export const ASSAULT_EXPOSURE = defineParam({ id: 'land.ASSAULT_EXPOSURE', value: 2, range: [1.5, 3], tag: 'judgment',
  source: 'Tuned so a 3:1 assault on a prepared line costs the attacker 2-3x the defender (UK MoD; RUSI Meatgrinder 2023)',
  affects: 'attacker casualties' });
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
const KILL_ZONE_COMMIT_2025 = defineParam({ id: 'land.KILL_ZONE_COMMIT', value: 0.3, range: [0.15, 0.6], tag: 'judgment',
  source: 'Drone-era small-group assaults (RUSI, Watling and Reynolds 2025); tuned to 1,000-1,700 Russian casualties a day (UK MoD, Oryx)',
  affects: 'assault mass and casualties' });
/** Kill-zone commitment under the run's era (era.TRANSPARENCY); the calibrated value at the default era. */
export const KILL_ZONE_COMMIT = (): number => eraKillZoneCommit(KILL_ZONE_COMMIT_2025());
/**
 * Entrenchment a shaken defender must have dug before it can give up a line for the
 * next one: two and a half days of digging at ENTRENCH_PER_DAY. Below it there is no
 * prepared line to give up. Judgment: Ukrainian withdrawals in 2023-25 came every
 * few days to weeks on an active axis, not continuously (Avdiivka, Vuhledar, Pokrovsk).
 */
export const NEXT_LINE_ENTRENCHMENT = defineParam({ id: 'land.NEXT_LINE_ENTRENCHMENT', value: 0.5, range: [0.3, 0.8], tag: 'judgment',
  source: 'Judgment: Ukrainian withdrawals in 2023-25 came every few days to weeks on an active axis',
  affects: 'defender withdrawals' });
/** Depth given up when a defender falls back to its next prepared line: 2-5 km per withdrawal in 2023-25 (Avdiivka, Vuhledar). */
export const WITHDRAWAL_KM = defineParam({ id: 'land.WITHDRAWAL_KM', value: 3, range: [2, 5], tag: 'observed',
  source: '2-5 km per withdrawal in 2023-25 (Avdiivka, Vuhledar)',
  affects: 'ground given per withdrawal' });
/**
 * Km a day an attacker's gain inside a cell slips back once no unit of its side stands there to hold it. Contest km is
 * averaged over the cell's width, so 0.5 km is about 20 km2 a day of empty ground the defender's patrols walk back
 * into, about the pace one brigade infiltrates a covered cell and far below an unopposed march. Judgment. A plain
 * constant, so the validation sweep draws the same params as before.
 */
export const CONTEST_RECOVERY_KM_PER_DAY = 0.5;
/**
 * Local superiority at which an attacker assaults along the whole cell; below
 * it, assault intensity scales down in proportion (attacks on a few axes, the
 * rest of the line held). The 3:1 planning ratio (FM 3-90; Mearsheimer 1989).
 */
export const DELIBERATE_ASSAULT_RATIO = defineParam({ id: 'land.DELIBERATE_ASSAULT_RATIO', value: 3, range: [2, 4], tag: 'contested',
  source: 'The 3:1 rule (FM 3-90; Mearsheimer 1989) against its critics (Epstein 1989; Dupuy)',
  affects: 'assault intensity and breakthroughs' });
/**
 * Whole-force odds (every weapon counted, those waiting in depth too) at which an assault on a manned line breaks
 * through at BREAKTHROUGH_KM_PER_DAY on the sector it masses on; from DELIBERATE_ASSAULT_RATIO up the pace rises in
 * proportion. Soviet 1944-45 fronts massed several times the defender on narrow breakthrough sectors and broke a
 * prepared tactical zone in one to three days (Glantz and House, When Titans Clashed, 1995); the Egyptian army
 * crossed the canal and the Bar Lev line along its length on 6 October 1973 with a large local superiority.
 * Estimate: at 6:1 a fortified plain cell is crossed in about a week, at 9:1 in about four days.
 */
export const MASSED_ASSAULT_RATIO = defineParam({ id: 'land.MASSED_ASSAULT_RATIO', value: 9, range: [6, 12], tag: 'estimated',
  source: 'Glantz & House 1995; 1973 Bar Lev crossing; Kursk 2024',
  affects: 'penetration of manned lines' });
/**
 * Share of a penetration's or an infiltration's pace that a standing belt of minefields, ditches and dragon's teeth
 * takes away. Engineers breach lanes in hours where no garrison covers them (FM 3-90: an obstacle not covered by
 * fire is not an obstacle), and Ukraine went through Russia's fortified, thinly held Kursk border at 8-10 km a day
 * in August 2024 (ISW). Judgment.
 */
export const BELT_DRAG = defineParam({ id: 'land.BELT_DRAG', value: 0.6, range: [0.3, 0.8], tag: 'judgment',
  source: 'FM 3-90; ISW Kursk Aug 2024',
  affects: 'advance through fortified belts' });
/**
 * Share of a manoeuvre or penetration pace kept inside a city cell: every block is a strongpoint that must be
 * cleared, and gaps do not open. Fallujah II (2004) took six weeks at about 6:1 for a city ~10 km across; Mariupol
 * 86 days encircled; Bakhmut about ten months. Judgment for a cell that is part city, part countryside.
 */
export const URBAN_MANOEUVRE = defineParam({ id: 'land.URBAN_MANOEUVRE', value: 0.2, range: [0.1, 0.4], tag: 'judgment',
  source: 'Fallujah 2004; Mariupol 2022; Bakhmut 2022-23',
  affects: 'advance through cities' });
/**
 * A major river between an attacker and the cell it assaults, with no dry approach held: the defender's combat edge
 * grows by RIVER_DEFENSE (registered fires on the crossing sites, an attacker that crosses a few vehicles at a time)
 * and the attacker's advance runs at RIVER_TEMPO of its pace until it holds ground on the far bank. Ukraine's Krynky
 * bridgehead (November 2023 to July 2024) never grew past a few km; a Russian battalion group lost ~70 vehicles at
 * one Siverskyi Donets crossing at Bilohorivka in May 2022; FM 3-90.12 treats a contested wet-gap crossing as a
 * deliberate operation of its own.
 */
export const RIVER_DEFENSE = defineParam({ id: 'land.RIVER_DEFENSE', value: 1.5, range: [1.2, 2], tag: 'judgment',
  source: 'FM 3-90.12; Bilohorivka May 2022',
  affects: 'defence of river lines' });
export const RIVER_TEMPO = defineParam({ id: 'land.RIVER_TEMPO', value: 0.25, range: [0.1, 0.5], tag: 'judgment',
  source: 'FM 3-90.12; Krynky 2023-24',
  affects: 'advance across rivers' });
/**
 * Movement cost of a river edge: over intact bridges the crossing is a bottleneck (RIVER_BRIDGE_COST); with the
 * bridges down, or into enemy-held ground where they are blown, the crossing waits on assault boats and pontoons
 * (RIVER_ASSAULT_COST). A brigade's float-bridge crossing takes most of a day to set up and pass (FM 3-90.12).
 */
export const RIVER_BRIDGE_COST = defineParam({ id: 'land.RIVER_BRIDGE_COST', value: 1.3, range: [1.1, 1.5], tag: 'judgment',
  source: 'FM 3-90.12 wet-gap crossing; judgment',
  affects: 'march across bridged rivers' });
export const RIVER_ASSAULT_COST = defineParam({ id: 'land.RIVER_ASSAULT_COST', value: 3, range: [2, 5], tag: 'judgment',
  source: 'FM 3-90.12 wet-gap crossing; judgment',
  affects: 'march across unbridged rivers' });
/**
 * Exposed platforms that can bring direct fire to bear along one cell's
 * ~100 km front: a mechanised brigade (~300 platforms) holds or attacks on
 * roughly 10 km (FM 3-90; Ukrainian brigades held 10-20 km sectors in 2024).
 * It sets both how much of a cell's front a defender mans and how wide a sector an assault fills.
 */
export const FRONTAGE_PLATFORMS = defineParam({ id: 'land.FRONTAGE_PLATFORMS', value: 3000, range: [2000, 4500], tag: 'estimated',
  source: 'A mechanised brigade holds ~10 km (FM 3-90); Ukrainian brigades held 10-20 km in 2024',
  affects: 'how thin a line is and how wide an assault is' });
/** Front length FRONTAGE_PLATFORMS holds: a 1-degree cell's ~100 km. Smaller cells (islands, city-states) need proportionally fewer. */
export const CELL_FRONT_KM = 100;
/**
 * Share of the gaps in a thin line that a fully dug-in defender closes with its own obstacles,
 * mines and pre-registered fires (FM 3-90 hasty barrier plans), as against a standing fortified
 * belt that closes them all. Judgment, with attackers that no longer run their magazines dry in
 * three days (AMMO_DAYS_INTENSE): a thin, dug-in NATO line in baltic-2027 gives up a few cells
 * in three weeks without collapsing, against ~1 at the old 1 km/day cap.
 */
export const HASTY_BARRIER = defineParam({ id: 'land.HASTY_BARRIER', value: 0.7, range: [0.5, 0.9], tag: 'judgment',
  source: 'Judgment: FM 3-90 hasty barrier plans; tuned to a thin dug-in NATO line in baltic-2027',
  affects: 'advance through thin lines' });

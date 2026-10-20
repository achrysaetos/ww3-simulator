import type { Kit } from './build';

/*
 * Tables of organization and equipment for recurring US formation types.
 * Sources: FM 3-96 Brigade Combat Team (2021); ATP 3-21.20; Army Techniques
 * Publication 3-04.1 (aviation); CRS IF10571 (BCT types); CRS R46721 (Army
 * modernization); IISS Military Balance 2025 (equipment holdings). Counts are
 * authorized strength; real units run 85-95% operational.
 */

/** Armored BCT, 2016+ three-battalion design: 87 tanks, Bradley IFVs and cavalry Bradleys, 18 Paladins. */
export const US_ABCT: Kit = {
  m1a2_sepv3: 87,
  m2a3_bradley: 131,
  m3a3_bradley: 41,
  m109a7: 18,
  ampv: 120,
  infantry_squad: 54,
  truck: 450,
};

/** Stryker BCT: three infantry battalions, cavalry squadron, 18 towed M777A2. */
export const US_SBCT: Kit = {
  stryker_icv: 135,
  stryker_atgm: 9,
  stryker_rv: 52,
  stryker_mcv: 36,
  m777a2: 18,
  infantry_squad: 81,
  truck: 400,
};

/** Infantry BCT (also airborne and air assault): 81 rifle squads, 12 M119A3 + 6 M777A2. */
export const US_IBCT: Kit = {
  infantry_squad: 81,
  humvee_tow: 24,
  m119a3: 12,
  m777a2: 6,
  jltv: 120,
  truck: 300,
};

/** Combat Aviation Brigade after the 2024-25 aviation restructure: one attack battalion. */
export const US_CAB: Kit = { ah64e: 24, uh60m: 30, hh60m: 12, ch47f: 12, truck: 150 };

/** Patriot battalion: four firing batteries of six launchers. */
export const US_PATRIOT_BN: Kit = { patriot_pac3: 24, truck: 120 };

/** THAAD battery: six launchers, AN/TPY-2 radar (radar folded into the launcher platform). */
export const US_THAAD_BTY: Kit = { thaad_launcher: 6, truck: 40 };

/** HIMARS or MLRS battalion: three batteries of six launchers. */
export const US_HIMARS_BN: Kit = { m142_himars: 18, truck: 90 };
export const US_MLRS_BN: Kit = { m270a2: 18, truck: 90 };

/** Marine infantry regiment: three battalions of 27 rifle squads plus weapons companies. */
export const USMC_INF_REGT: Kit = { infantry_squad: 81, jltv: 90, humvee_tow: 24, truck: 150 };

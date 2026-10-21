/*
 * US Marine Corps after Force Design (tanks divested 2021), 2025-26.
 * Sources: IISS Military Balance 2025 (USMC: F-35B ~130, F-35C ~30, F/A-18C/D ~50, AV-8B
 * being retired 2026; ACV and LAV-25 holdings; HIMARS ~47); marines.mil unit pages;
 * CRS IF12371 (Marine Littoral Regiments); USMC Force Design 2030 annual updates (2024, 2025)
 * for NMESIS fielding to the 3rd and 12th Marine Littoral Regiments. NMESIS launcher counts
 * per regiment are estimates of the first fielded batteries.
 */
import { add, base, forNation } from './build';
import { USMC_INF_REGT } from './templates';

const u = forNation('USA', 'IISS Military Balance 2025; marines.mil unit pages; CRS IF12371');

const pendleton = base('Camp Pendleton, CA', 33.3, -117.35);
const twentynine = base('MCAGCC Twentynine Palms, CA', 34.24, -116.06);
const lejeune = base('Camp Lejeune, NC', 34.68, -77.35);
const okinawa = base('Camp Hansen, Okinawa', 26.5, 127.85);
const schwab = base('Camp Schwab, Okinawa', 26.53, 128.04);
const courtney = base('Camp Courtney, Okinawa', 26.39, 127.86);
const kaneohe = base('MCB Kaneohe Bay, HI', 21.45, -157.77);

const ACTIVE = { readiness: 0.85 };
const RESERVE = { readiness: 0.5 };
const ARTY_REGT = { m777a2: 54, truck: 200 };

export const usaMarines = [
  // I Marine Expeditionary Force
  u('1st Marine Regiment', 'maneuver', 'brigade', pendleton, USMC_INF_REGT, { ...ACTIVE, personnel: 3400 }),
  u('5th Marine Regiment', 'maneuver', 'brigade', pendleton, USMC_INF_REGT, { ...ACTIVE, personnel: 3400 }),
  u('7th Marine Regiment', 'maneuver', 'brigade', twentynine, USMC_INF_REGT, { ...ACTIVE, personnel: 3400 }),
  u('11th Marine Regiment', 'artillery', 'brigade', pendleton, add(ARTY_REGT, { m142_himars: 18 }), { ...ACTIVE, personnel: 2500, extraMagazine: { gmlrs: 432 } }),
  u('1st Marine Division armor and recon (1st LAR Bn, 3rd Assault Amphibian Bn)', 'maneuver', 'brigade', pendleton, { lav25: 56, acv: 90, aav7: 30 }, { ...ACTIVE, personnel: 2000 }),
  u('1st Marine Logistics Group', 'logistics', 'brigade', pendleton, { truck: 1200 }, { ...ACTIVE, personnel: 8000 }),

  // II Marine Expeditionary Force
  u('2nd Marine Regiment', 'maneuver', 'brigade', lejeune, USMC_INF_REGT, { ...ACTIVE, personnel: 3400 }),
  u('6th Marine Regiment', 'maneuver', 'brigade', lejeune, USMC_INF_REGT, { ...ACTIVE, personnel: 3400 }),
  u('10th Marine Regiment', 'artillery', 'brigade', lejeune, add(ARTY_REGT, { m142_himars: 18 }), { ...ACTIVE, personnel: 2500, extraMagazine: { gmlrs: 432 } }),
  u('2nd Marine Division armor and recon (2nd LAR Bn, 2nd Assault Amphibian Bn)', 'maneuver', 'brigade', lejeune, { lav25: 56, acv: 90, aav7: 30 }, { ...ACTIVE, personnel: 2000 }),
  u('2nd Marine Logistics Group', 'logistics', 'brigade', lejeune, { truck: 1200 }, { ...ACTIVE, personnel: 8000 }),

  // III Marine Expeditionary Force
  u('4th Marine Regiment', 'maneuver', 'brigade', schwab, USMC_INF_REGT, { readiness: 0.9, personnel: 3000 }),
  u('12th Marine Littoral Regiment', 'missile', 'brigade', okinawa, { infantry_squad: 27, nmesis: 6, m142_himars: 6, truck: 120 }, { readiness: 0.9, personnel: 2000, extraMagazine: { nsm: 24 } }),
  u('12th Marine Regiment', 'artillery', 'brigade', okinawa, { m777a2: 18, truck: 80 }, { readiness: 0.9, personnel: 1200 }),
  u('3rd Marine Littoral Regiment', 'missile', 'brigade', kaneohe, { infantry_squad: 27, nmesis: 9, m142_himars: 6, truck: 120 }, { readiness: 0.9, personnel: 2000, extraMagazine: { nsm: 36 } }),
  u('3rd Marine Logistics Group', 'logistics', 'brigade', courtney, { truck: 600 }, { readiness: 0.9, personnel: 5000 }),

  // Marine Forces Reserve
  u('23rd Marine Regiment (reserve)', 'maneuver', 'brigade', base('San Bruno, CA', 37.63, -122.41), USMC_INF_REGT, { ...RESERVE, personnel: 3000 }),
  u('24th Marine Regiment (reserve)', 'maneuver', 'brigade', base('Kansas City, MO', 39.1, -94.58), USMC_INF_REGT, { ...RESERVE, personnel: 3000 }),
  u('25th Marine Regiment (reserve)', 'maneuver', 'brigade', base('Fort Devens, MA', 42.54, -71.61), USMC_INF_REGT, { ...RESERVE, personnel: 3000 }),
  u('14th Marine Regiment (reserve)', 'artillery', 'brigade', base('NAS JRB Fort Worth, TX', 32.77, -97.44), { m777a2: 18, m142_himars: 18, truck: 150 }, { ...RESERVE, personnel: 2000, extraMagazine: { gmlrs: 432 } }),

  // Marine aircraft groups
  u('Marine Aircraft Group 11', 'air_wing', 'wing', base('MCAS Miramar, CA', 32.87, -117.14), { f35c: 20, fa18cd: 24, kc130j: 15 }, ACTIVE),
  u('Marine Aircraft Group 13', 'air_wing', 'wing', base('MCAS Yuma, AZ', 32.66, -114.61), { f35b: 50 }, ACTIVE),
  u('Marine Aircraft Group 31', 'air_wing', 'wing', base('MCAS Beaufort, SC', 32.48, -80.72), { f35b: 35, f35c: 10, fa18cd: 12 }, ACTIVE),
  u('Marine Aircraft Group 14', 'air_wing', 'wing', base('MCAS Cherry Point, NC', 34.9, -76.88), { f35b: 16, av8b: 15, kc130j: 15 }, ACTIVE),
  u('Marine Aircraft Group 12', 'air_wing', 'wing', base('MCAS Iwakuni', 34.14, 132.24), { f35b: 32, kc130j: 15 }, { readiness: 0.9 }),
  u('Marine Aircraft Group 36', 'air_wing', 'wing', base('MCAS Futenma, Okinawa', 26.27, 127.75), { mv22b: 24, ch53e: 8, ah1z: 12, uh1y: 9 }, { readiness: 0.9 }),
  u('Marine Aircraft Group 24', 'air_wing', 'wing', kaneohe, { mv22b: 24, ch53e: 8 }, ACTIVE),
  u('Marine Aircraft Group 39', 'air_wing', 'wing', base('MCAS Camp Pendleton, CA', 33.3, -117.35), { ah1z: 30, uh1y: 24 }, ACTIVE),
  u('Marine Aircraft Group 16', 'air_wing', 'wing', base('MCAS Miramar, CA', 32.87, -117.14), { mv22b: 48, ch53k: 16 }, ACTIVE),
  u('Marine Aircraft Group 26', 'air_wing', 'wing', base('MCAS New River, NC', 34.71, -77.44), { mv22b: 48 }, ACTIVE),
  u('Marine Aircraft Group 29', 'air_wing', 'wing', base('MCAS New River, NC', 34.71, -77.44), { ah1z: 30, uh1y: 20, ch53k: 16 }, ACTIVE),
  u('Marine Aircraft Group 41 (reserve)', 'air_wing', 'wing', base('NAS JRB Fort Worth, TX', 32.77, -97.44), { fa18cd: 12, kc130j: 12 }, RESERVE),
];

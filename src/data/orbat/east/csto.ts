import type { OrbatEntry } from '../types';
import { at, merge, mix, unit, type Kit } from './build';

/*
 * Other CSTO members, 2025, at summary level: Kazakhstan, Kyrgyzstan and Tajikistan.
 * Armenia (participation frozen since 2024) is modelled in rest/caucasus-balkans.ts.
 * Totals per IISS Military Balance 2025: Kazakhstan ~350 MBT, land forces ~20,000;
 * Kyrgyzstan ~150 MBT, land forces ~8,500; Tajikistan ~37 MBT, land forces ~7,300.
 * The corps kits hold the equipment parks; personnel is the land forces split evenly.
 * Russian bases in these states are in rus-ground.ts and rus-aerospace.ts.
 */

const CORPS = (tanks: number, ifv: string): Kit => merge(mix(tanks, { t72b: 1 }), { [ifv]: Math.round(tanks * 1.5), '2s3': 12, d30: 24, bm21_grad: 12, infantry_squad: 400, truck: 400 });
const READY = { readiness: 0.5, experience: 0.25 };
const KAZ_CMD = { ...READY, personnel: 5000 };
const KGZ_BDE = { ...READY, personnel: 2800 };
const TJK_BDE = { ...READY, personnel: 3600 };

const kazakhstan: OrbatEntry[] = [
  unit('KAZ', 'Regional Command Astana', 'maneuver', 'corps', at('Astana', 51.17, 71.43), CORPS(90, 'btr82a'), KAZ_CMD),
  unit('KAZ', 'Regional Command East', 'maneuver', 'corps', at('Semey', 50.41, 80.25), CORPS(100, 'bmp2'), KAZ_CMD),
  unit('KAZ', 'Regional Command South', 'maneuver', 'corps', at('Shymkent', 42.32, 69.6), CORPS(90, 'bmp2'), KAZ_CMD),
  unit('KAZ', 'Regional Command West', 'maneuver', 'corps', at('Aktobe', 50.28, 57.21), CORPS(70, 'btr82a'), KAZ_CMD),
  unit('KAZ', '604th Air Base', 'air_wing', 'wing', at('Taldykorgan', 45.12, 78.44), { su30sm: 14, mig29: 12 }, READY),
  unit('KAZ', '610th Air Base', 'air_wing', 'wing', at('Karaganda', 49.67, 73.33), { mig31bm: 12, su30sm: 10 }, READY),
  unit('KAZ', '602nd Air Base', 'air_wing', 'wing', at('Shymkent air', 42.36, 69.48), { su25: 12, su27sm: 20 }, READY),
  unit('KAZ', 'Kazakh Air Defence Brigade', 'air_defense', 'brigade', at('Almaty AD', 43.35, 77.0), { s300pm_launcher: 20, tor_m2: 6 }, READY),
];

const kyrgyzstan: OrbatEntry[] = [
  unit('KGZ', '2nd Motor Rifle Brigade', 'maneuver', 'brigade', at('Bishkek KGZ', 42.87, 74.59), CORPS(50, 'bmp2'), KGZ_BDE),
  unit('KGZ', '8th Motor Rifle Brigade', 'maneuver', 'brigade', at('Tokmok', 42.84, 75.3), CORPS(50, 'bmp2'), KGZ_BDE),
  unit('KGZ', '68th Mountain Brigade', 'maneuver', 'brigade', at('Osh', 40.53, 72.8), CORPS(50, 'btr82a'), KGZ_BDE),
];

const tajikistan: OrbatEntry[] = [
  unit('TJK', '1st Motor Rifle Brigade', 'maneuver', 'brigade', at('Dushanbe TJK', 38.58, 68.75), CORPS(25, 'bmp2'), TJK_BDE),
  unit('TJK', '7th Air Assault Brigade', 'maneuver', 'brigade', at('Kurgan-Tyube', 37.84, 68.78), CORPS(12, 'btr82a'), TJK_BDE),
];

export const csto: OrbatEntry[] = [...kazakhstan, ...kyrgyzstan, ...tajikistan];

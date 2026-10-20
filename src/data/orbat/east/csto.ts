import type { OrbatEntry } from '../types';
import { at, merge, mix, unit, type Kit } from './build';

/*
 * Other CSTO members, 2025, at summary level: Armenia (participation frozen since 2024),
 * Kazakhstan, Kyrgyzstan and Tajikistan. Totals per IISS Military Balance 2025: Armenia
 * ~110 MBT after the 2020 war; Kazakhstan ~350 MBT; Kyrgyzstan ~150; Tajikistan ~37.
 * Russian bases in these states are in rus-ground.ts and rus-aerospace.ts.
 */

const CORPS = (tanks: number, ifv: string): Kit => merge(mix(tanks, { t72b: 1 }), { [ifv]: Math.round(tanks * 1.5), '2s3': 12, d30: 24, bm21_grad: 12, infantry_squad: 400, truck: 400 });
const READY = { readiness: 0.5, experience: 0.25 };

const armenia: OrbatEntry[] = [
  unit('ARM', '1st Army Corps', 'maneuver', 'corps', at('Goris', 40.1, 45.9), CORPS(22, 'bmp2'), { readiness: 0.55, experience: 0.45 }),
  unit('ARM', '2nd Army Corps', 'maneuver', 'corps', at('Yeghegnadzor', 40.1, 45.35), CORPS(22, 'bmp2'), { readiness: 0.55, experience: 0.45 }),
  unit('ARM', '3rd Army Corps', 'maneuver', 'corps', at('Vanadzor', 40.8, 44.49), CORPS(22, 'bmp2'), { readiness: 0.55, experience: 0.45 }),
  unit('ARM', '4th Army Corps', 'maneuver', 'corps', at('Yeraskh', 40.1, 44.8), CORPS(22, 'bmp2'), { readiness: 0.55, experience: 0.45 }),
  unit('ARM', '5th Army Corps', 'maneuver', 'corps', at('Nubarashen, Yerevan', 40.1, 44.55), CORPS(22, 'bmp2'), { readiness: 0.55, experience: 0.45 }),
  unit('ARM', 'Armenian Missile Brigade', 'missile', 'brigade', at('Armavir', 40.15, 44.04), { iskander_m_tel: 4, truck: 20 }, READY),
  unit('ARM', 'Erebuni Air Base', 'air_wing', 'wing', at('Yerevan Erebuni ARM', 40.13, 44.46), { su30sm: 4, su25: 10 }, READY),
];

const kazakhstan: OrbatEntry[] = [
  unit('KAZ', 'Regional Command Astana', 'maneuver', 'corps', at('Astana', 51.17, 71.43), CORPS(90, 'btr82a'), READY),
  unit('KAZ', 'Regional Command East', 'maneuver', 'corps', at('Semey', 50.41, 80.25), CORPS(100, 'bmp2'), READY),
  unit('KAZ', 'Regional Command South', 'maneuver', 'corps', at('Shymkent', 42.32, 69.6), CORPS(90, 'bmp2'), READY),
  unit('KAZ', 'Regional Command West', 'maneuver', 'corps', at('Aktobe', 50.28, 57.21), CORPS(70, 'btr82a'), READY),
  unit('KAZ', '604th Air Base', 'air_wing', 'wing', at('Taldykorgan', 45.12, 78.44), { su30sm: 14, mig29: 12 }, READY),
  unit('KAZ', '610th Air Base', 'air_wing', 'wing', at('Karaganda', 49.67, 73.33), { mig31bm: 12, su30sm: 10 }, READY),
  unit('KAZ', '602nd Air Base', 'air_wing', 'wing', at('Shymkent air', 42.36, 69.48), { su25: 12, su27sm: 20 }, READY),
  unit('KAZ', 'Kazakh Air Defence Brigade', 'air_defense', 'brigade', at('Almaty AD', 43.35, 77.0), { s300pm_launcher: 20, tor_m2: 6 }, READY),
];

const kyrgyzstan: OrbatEntry[] = [
  unit('KGZ', '2nd Motor Rifle Brigade', 'maneuver', 'brigade', at('Bishkek KGZ', 42.87, 74.59), CORPS(50, 'bmp2'), READY),
  unit('KGZ', '8th Motor Rifle Brigade', 'maneuver', 'brigade', at('Tokmok', 42.84, 75.3), CORPS(50, 'bmp2'), READY),
  unit('KGZ', '68th Mountain Brigade', 'maneuver', 'brigade', at('Osh', 40.53, 72.8), CORPS(50, 'btr82a'), READY),
];

const tajikistan: OrbatEntry[] = [
  unit('TJK', '1st Motor Rifle Brigade', 'maneuver', 'brigade', at('Dushanbe TJK', 38.58, 68.75), CORPS(25, 'bmp2'), READY),
  unit('TJK', '7th Air Assault Brigade', 'maneuver', 'brigade', at('Kurgan-Tyube', 37.84, 68.78), CORPS(12, 'btr82a'), READY),
];

export const csto: OrbatEntry[] = [...armenia, ...kazakhstan, ...kyrgyzstan, ...tajikistan];

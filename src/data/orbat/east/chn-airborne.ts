import type { OrbatEntry } from '../types';
import { at, unit, type Kit } from './build';

/*
 * PLA Air Force Airborne Corps (formerly 15th Airborne Corps), reorganised in 2017 into six
 * airborne brigades, a special operations brigade, a support brigade and a transport aviation
 * brigade under a corps HQ at Xiaogan, Hubei. Brigade garrisons follow CASI, "The PLA Airborne
 * Corps" (2020) and are approximate; establishments are estimates summing to IISS Military
 * Balance 2025's ~40,000. IISS lists 180 ZBD-03 airborne IFVs, split here across the brigades.
 */

const CHN = 'CHN';
const AIRBORNE = { readiness: 0.85, experience: 0.3 };
const BRIGADE: Kit = { zbd03: 30, airborne_squad: 220, csk181: 40, pcl181: 6, hj12_team: 18, truck: 150 };

const brigades = [
  ['127th', at('Laohekou', 32.39, 111.67)],
  ['128th', at('Xiaogan', 30.92, 113.92)],
  ['130th', at('Guangshui', 31.62, 113.83)],
  ['131st', at('Huangpi', 30.88, 114.37)],
  ['133rd', at('Kaifeng', 34.8, 114.3)],
  ['134th', at('Yingshan', 30.73, 115.68)],
] as const;

export const chnAirborne: OrbatEntry[] = [
  ...brigades.map(([num, base]) => unit(CHN, `${num} Airborne Brigade (Airborne Corps)`, 'maneuver', 'brigade', base, BRIGADE, { ...AIRBORNE, personnel: 5_500, airborne: true })),
  unit(CHN, 'Airborne Corps Special Operations Brigade', 'maneuver', 'brigade', at('Guangzhou', 23.4, 113.3), { airborne_squad: 150, csk181: 40, truck: 60 }, { readiness: 0.9, experience: 0.35, personnel: 2_500 }),
  unit(CHN, 'Airborne Corps Support Brigade', 'logistics', 'brigade', at('Xiaogan', 30.95, 113.95), { truck: 600 }, { ...AIRBORNE, personnel: 2_500 }),
  unit(CHN, 'Airborne Corps Transport Aviation Brigade', 'logistics', 'wing', at('Wuhan Shanpo', 30.32, 114.4), { y9: 20, z8: 12 }, { ...AIRBORNE, personnel: 2_000 }),
];

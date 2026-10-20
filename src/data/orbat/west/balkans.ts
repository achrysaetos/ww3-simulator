/*
 * Croatia, Slovenia, Albania, North Macedonia and Montenegro, 2025-26.
 * Sources: IISS Military Balance 2025 (Croatia: ~30 M-84A4 after transfers to Ukraine, 89 M2A2
 * ODS Bradley, PzH 2000, Patria AMV, 12 Rafale F3R; Slovenia: Patria-based Svarun, no
 * serviceable MBT; Albania, North Macedonia, Montenegro: light infantry, no MBT or combat
 * aircraft); morh.hr, slovenska-vojska.si, mod.gov.al, army.mk, vojska.me.
 */
import { base, forNation } from './build';

const hr = forNation('HRV', 'IISS Military Balance 2025; morh.hr');
const si = forNation('SVN', 'IISS Military Balance 2025; slovenska-vojska.si');
const al = forNation('ALB', 'IISS Military Balance 2025; mod.gov.al');
const mk = forNation('MKD', 'IISS Military Balance 2025; army.mk');
const me = forNation('MNE', 'IISS Military Balance 2025; vojska.me');

const ACTIVE = { readiness: 0.6 };

export const balkans = [
  hr('Guards Armoured Mechanized Brigade', 'maneuver', 'brigade', base('Vinkovci', 45.29, 18.8), { m84: 30, m2a2_ods: 89, m80a: 40, pzh2000: 12, infantry_squad: 36, truck: 200 }, { ...ACTIVE, personnel: 3500 }),
  hr('Guards Motorized Brigade', 'maneuver', 'brigade', base('Knin', 44.04, 16.2), { patria_amv: 100, infantry_squad: 54, truck: 200 }, { ...ACTIVE, personnel: 3500 }),
  hr('91st Air Force Base', 'air_wing', 'wing', base('Zagreb-Pleso', 45.74, 16.07), { rafale_c: 12 }, ACTIVE),

  si('1st Brigade', 'maneuver', 'brigade', base('Ljubljana', 46.06, 14.51), { patria_amv: 30, infantry_squad: 36, truck: 100 }, { ...ACTIVE, personnel: 2500 }),
  si('72nd Brigade', 'maneuver', 'brigade', base('Maribor', 46.55, 15.65), { infantry_squad: 30, truck: 80 }, { ...ACTIVE, personnel: 2000 }),

  al('Albanian Land Force Infantry Brigade', 'maneuver', 'brigade', base('Zall-Herr, Tirana', 41.39, 19.86), { infantry_squad: 40, truck: 80 }, { readiness: 0.5, personnel: 2500 }),

  mk('Mechanized Infantry Brigade', 'maneuver', 'brigade', base('Kumanovo', 42.13, 21.71), { infantry_squad: 30, stryker_icv: 8, truck: 60 }, { readiness: 0.5, personnel: 2000 }),

  me('Montenegrin Army Infantry Battalion', 'maneuver', 'battalion', base('Danilovgrad', 42.55, 19.11), { infantry_squad: 15, truck: 30 }, { readiness: 0.5, personnel: 800 }),
];

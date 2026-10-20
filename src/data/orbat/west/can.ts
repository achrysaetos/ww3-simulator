/*
 * Canada, 2025-26.
 * Sources: IISS Military Balance 2025 (74 Leopard 2A4/2A4M/2A6M after 8 sent to Ukraine;
 * ~76 CF-188 in service; 12 Halifax-class FFG; 4 Victoria-class SSK); canada.ca unit pages;
 * Operation REASSURANCE fact sheet (Multinational Brigade Latvia, 2025). The Army Reserve
 * line aggregates the ten reserve Canadian Brigade Groups.
 */
import { base, forNation } from './build';

const u = forNation('CAN', 'IISS Military Balance 2025; canada.ca; Operation REASSURANCE');

const CMBG = { lav6: 120, m777a2: 12, infantry_squad: 54, truck: 400 };
const ACTIVE = { readiness: 0.6, personnel: 5000 };

export const can = [
  u('1 Canadian Mechanized Brigade Group', 'maneuver', 'brigade', base('CFB Edmonton', 53.67, -113.47), { ...CMBG, leopard2a6: 20, leopard2a4: 10 }, ACTIVE),
  u('2 Canadian Mechanized Brigade Group', 'maneuver', 'brigade', base('Garrison Petawawa', 45.92, -77.29), CMBG, ACTIVE),
  u('5 Canadian Mechanized Brigade Group', 'maneuver', 'brigade', base('CFB Valcartier', 46.9, -71.5), { ...CMBG, leopard2a4: 20 }, ACTIVE),
  u('Canadian contingent, Multinational Brigade Latvia', 'maneuver', 'battalion', base('Ādaži, Latvia', 57.08, 24.32), { leopard2a4: 14, lav6: 60, m777a2: 4, infantry_squad: 18 }, { readiness: 0.85, personnel: 2000 }),
  u('Combat Training Centre', 'maneuver', 'battalion', base('CFB Gagetown', 45.84, -66.44), { leopard2a4: 10, lav6: 20 }, { readiness: 0.4, personnel: 1500 }),
  u('Canadian Army Reserve (aggregate of 10 Canadian Brigade Groups)', 'maneuver', 'division', base('Ottawa', 45.42, -75.7), { infantry_squad: 200, truck: 300 }, { readiness: 0.3, personnel: 18000 }),
  u('4th Canadian Air Defence Regiment', 'air_defense', 'battalion', base('CFB Moncton', 46.11, -64.68), { stinger_team: 20 }, { readiness: 0.5, personnel: 400 }),

  u('3 Wing (425 and 433 Tactical Fighter Squadrons)', 'air_wing', 'wing', base('CFB Bagotville', 48.33, -70.99), { cf18: 36 }, { readiness: 0.6 }),
  u('4 Wing (401, 409, 410 Squadrons)', 'air_wing', 'wing', base('CFB Cold Lake', 54.4, -110.28), { cf18: 40 }, { readiness: 0.6 }),
  u('14 Wing (CP-140 Aurora)', 'air_wing', 'wing', base('CFB Greenwood', 44.98, -64.92), { cp140: 14 }, { readiness: 0.6 }),
  u('8 Wing (air mobility)', 'logistics', 'wing', base('CFB Trenton', 44.12, -77.53), { c17a: 5, c130j: 17, a330_mrtt: 5 }, { readiness: 0.7 }),

  u('Maritime Forces Atlantic', 'surface_group', 'flotilla', base('CFB Halifax', 44.65, -63.57), { ffg_halifax: 7, ssk_victoria: 1 }, { readiness: 0.55, personnel: 7 * 240 + 50 }),
  u('Maritime Forces Pacific', 'surface_group', 'flotilla', base('CFB Esquimalt', 48.43, -123.44), { ffg_halifax: 5, ssk_victoria: 3 }, { readiness: 0.5, personnel: 5 * 240 + 150 }),
];

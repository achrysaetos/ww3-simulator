/*
 * Poland, 2026 (mid-expansion).
 * Sources: IISS Military Balance 2025 (Leopard 2A4/2A5/2PL, PT-91, M1A1 FEP, K2; F-16C/D 48,
 * FA-50GF 12, MiG-29; 2 Oliver Hazard Perry FFG; 1 Kilo SSK); Polish MoD (gov.pl/web/obrona-
 * narodowa) delivery announcements: 180 K2 (first contract, complete 2025), 116 M1A1 FEP (2023-24),
 * 250 M1A2 SEPv3 (deliveries 2025-26), K239 Chunmoo, K9PL; Wisła Patriot phase I and II.
 * Delivered-by-late-2026 counts for M1A2 SEPv3, second-batch K2, K239, F-35A and Patriot are
 * estimates. WOT brigade list: Wojska Obrony Terytorialnej, 2025.
 */
import { add, base, forNation, type Kit } from './build';

const u = forNation('POL', 'IISS Military Balance 2025; Polish MoD delivery announcements 2023-26');

const ACTIVE = { readiness: 0.7 };
const MECH = (tanks: Kit, ifv: Kit, guns: Kit) => add(tanks, ifv, guns, { infantry_squad: 54, truck: 400 });

export const pol = [
  // 11th Armoured Cavalry Division
  u('10th Armoured Cavalry Brigade', 'maneuver', 'brigade', base('Świętoszów', 51.48, 15.42), MECH({ leopard2a5: 105 }, { bmp1: 90 }, { krab: 24 }), { ...ACTIVE, personnel: 4500 }),
  u('34th Armoured Cavalry Brigade', 'maneuver', 'brigade', base('Żagań', 51.62, 15.32), MECH({ leopard2pl: 58, leopard2a4: 30 }, { bmp1: 90 }, { krab: 24 }), { ...ACTIVE, personnel: 4500 }),
  u('17th Mechanized Brigade', 'maneuver', 'brigade', base('Międzyrzecz', 52.44, 15.58), MECH({ leopard2pl: 58 }, { rosomak: 120 }, { krab: 24 }), { ...ACTIVE, personnel: 4500 }),

  // 12th Mechanized Division
  u('2nd Legions Mechanized Brigade', 'maneuver', 'brigade', base('Złocieniec', 53.53, 16.01), MECH({ pt91: 58 }, { bmp1: 90 }, { '2s1': 24 }), { ...ACTIVE, personnel: 4000 }),
  u('12th Mechanized Brigade', 'maneuver', 'brigade', base('Szczecin', 53.43, 14.55), MECH({ pt91: 58 }, { rosomak: 120 }, { krab: 18 }), { ...ACTIVE, personnel: 4000 }),
  u('7th Coastal Defence Brigade', 'maneuver', 'brigade', base('Słupsk', 54.46, 17.03), { infantry_squad: 54, rosomak: 60, '2s1': 18, truck: 300 }, { ...ACTIVE, personnel: 3500 }),

  // 16th Mechanized Division
  u('9th Armoured Cavalry Brigade', 'maneuver', 'brigade', base('Braniewo', 54.38, 19.83), MECH({ k2_black_panther: 58 }, { bmp1: 90 }, { k9_thunder: 24 }), { readiness: 0.75, personnel: 4500 }),
  u('15th Mechanized Brigade', 'maneuver', 'brigade', base('Giżycko', 54.04, 21.77), MECH({ k2_black_panther: 58 }, { rosomak: 120 }, { k9_thunder: 24 }), { readiness: 0.75, personnel: 4500 }),
  u('20th Mechanized Brigade', 'maneuver', 'brigade', base('Bartoszyce', 54.25, 20.81), MECH({ k2_black_panther: 58 }, { bmp1: 90 }, { k9_thunder: 24 }), { readiness: 0.75, personnel: 4500 }),

  // 18th Mechanized Division
  u('1st Warsaw Armoured Brigade', 'maneuver', 'brigade', base('Wesoła', 52.23, 21.22), MECH({ m1a2_sepv3: 116 }, { bmp1: 90 }, { krab: 24 }), { readiness: 0.75, personnel: 4500 }),
  u('19th Mechanized Brigade', 'maneuver', 'brigade', base('Lublin', 51.25, 22.57), MECH({ m1a2_sepv3: 58, m1a1_fep: 58 }, { rosomak: 120 }, { krab: 24 }), { readiness: 0.75, personnel: 4500 }),
  u('21st Podhale Rifles Brigade', 'maneuver', 'brigade', base('Rzeszów', 50.04, 22.0), MECH({}, { rosomak: 90 }, { krab: 18 }), { ...ACTIVE, personnel: 4000 }),

  // 1st Legions Infantry Division and independent brigades
  u('1st Legions Infantry Division (forming)', 'maneuver', 'division', base('Białystok', 53.13, 23.16), { infantry_squad: 54, rosomak: 60, truck: 200 }, { readiness: 0.5, personnel: 4000 }),
  u('6th Airborne Brigade', 'maneuver', 'brigade', base('Kraków', 50.06, 19.94), { infantry_squad: 54, truck: 150 }, { readiness: 0.8, personnel: 3000 }),
  u('25th Air Cavalry Brigade', 'air_wing', 'brigade', base('Tomaszów Mazowiecki', 51.53, 20.01), { mi24: 16, mi8: 20, infantry_squad: 27 }, { readiness: 0.65, personnel: 2500 }),
  u('Armoured training and reserve (Land Forces Training Centre)', 'maneuver', 'battalion', base('Poznań-Biedrusko', 52.53, 16.95), { k2_black_panther: 26, pt91: 20 }, { readiness: 0.4, personnel: 800 }),

  // Artillery, rocket and missile units
  u('18th Artillery Regiment (HIMARS, Chunmoo)', 'artillery', 'brigade', base('Nowa Dęba', 50.43, 21.75), { m142_himars: 20, k239_chunmoo: 60, truck: 200 }, { ...ACTIVE, personnel: 2000, extraMagazine: { gmlrs: 480, atacms: 24 } }),
  u('23rd Silesian Artillery Regiment', 'artillery', 'brigade', base('Bolesławiec', 51.26, 15.57), { k239_chunmoo: 36, wr40_langusta: 40, krab: 24 }, { ...ACTIVE, personnel: 1500 }),
  u('11th Mazurian Artillery Regiment', 'artillery', 'brigade', base('Węgorzewo', 54.21, 21.74), { k239_chunmoo: 24, k9_thunder: 36, wr40_langusta: 20 }, { ...ACTIVE, personnel: 1500 }),
  u('Naval Strike Missile Unit', 'missile', 'battalion', base('Siemirowice', 54.48, 17.83), { nsm_coastal: 12 }, { readiness: 0.8, personnel: 400, extraMagazine: { nsm: 48 } }),

  // Air defence
  u('3rd Warsaw Air Defence Missile Brigade (Wisła Patriot)', 'air_defense', 'brigade', base('Sochaczew', 52.23, 20.24), { patriot_pac3: 24, truck: 100 }, { readiness: 0.75, personnel: 1500, extraMagazine: { pac3_mse: 96 } }),
  u('Narew short-range air defence (CAMM)', 'air_defense', 'brigade', base('Gdańsk', 54.37, 18.6), { camm_launcher: 24, truck: 60 }, { readiness: 0.7, personnel: 800 }),

  // Air Force
  u('31st Tactical Air Base', 'air_wing', 'wing', base('Poznań-Krzesiny', 52.33, 16.97), { f16c: 32 }, ACTIVE),
  u('32nd Tactical Air Base', 'air_wing', 'wing', base('Łask', 51.55, 19.18), { f16c: 16, f35a: 6 }, ACTIVE),
  u('23rd Tactical Air Base', 'air_wing', 'wing', base('Mińsk Mazowiecki', 52.2, 21.66), { mig29: 12, fa50: 12 }, ACTIVE),
  u('22nd Tactical Air Base', 'air_wing', 'wing', base('Malbork', 54.03, 19.13), { mig29: 6 }, { readiness: 0.5 }),
  u('33rd Transport Aviation Base', 'logistics', 'wing', base('Powidz', 52.38, 17.85), { c130j: 5 }, ACTIVE),

  // Navy
  u('3rd Ship Flotilla', 'surface_group', 'flotilla', base('Gdynia', 54.52, 18.55), { ffg_oliver_hazard_perry: 2 }, { readiness: 0.5, personnel: 2 * 200 }),
  u('Submarine Division (ORP Orzeł)', 'submarine', 'flotilla', base('Gdynia', 54.52, 18.55), { ssk_kilo: 1 }, { readiness: 0.2, personnel: 60 }),

  // Territorial Defence Force
  ...([
    ['1st Podlasie Territorial Defence Brigade', 'Białystok', 53.13, 23.16],
    ['2nd Lublin Territorial Defence Brigade', 'Lublin', 51.25, 22.57],
    ['3rd Podkarpacie Territorial Defence Brigade', 'Rzeszów', 50.04, 22.0],
    ['4th Warmia-Masuria Territorial Defence Brigade', 'Olsztyn', 53.78, 20.49],
    ['5th Masovian Territorial Defence Brigade', 'Ciechanów', 52.88, 20.62],
    ['6th Masovian Territorial Defence Brigade', 'Radom', 51.4, 21.15],
    ['7th Pomeranian Territorial Defence Brigade', 'Gdańsk', 54.37, 18.6],
    ['8th Kuyavia-Pomerania Territorial Defence Brigade', 'Toruń', 53.01, 18.6],
    ['9th Łódź Territorial Defence Brigade', 'Łódź', 51.76, 19.46],
    ['10th Świętokrzyskie Territorial Defence Brigade', 'Kielce', 50.87, 20.63],
    ['11th Lesser Poland Territorial Defence Brigade', 'Kraków', 50.06, 19.94],
    ['12th Greater Poland Territorial Defence Brigade', 'Poznań', 52.41, 16.93],
    ['13th Silesian Territorial Defence Brigade', 'Katowice', 50.26, 19.02],
    ['14th West Pomeranian Territorial Defence Brigade', 'Szczecin', 53.43, 14.55],
    ['15th Opole Territorial Defence Brigade', 'Opole', 50.67, 17.93],
    ['16th Lower Silesian Territorial Defence Brigade', 'Wrocław', 51.11, 17.03],
    ['17th Lubusz Territorial Defence Brigade', 'Zielona Góra', 51.94, 15.51],
    ['18th Warsaw Territorial Defence Brigade', 'Warsaw', 52.23, 21.01],
  ] as const).map(([name, bname, lat, lon]) => u(name, 'maneuver', 'brigade', base(bname, lat, lon), { infantry_squad: 50, truck: 60 }, { readiness: 0.4, personnel: 2500, territorial: true })),
];

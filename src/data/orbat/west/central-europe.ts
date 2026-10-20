/*
 * Czechia, Slovakia, Hungary, Romania and Bulgaria, 2025-26.
 * Sources: IISS Military Balance 2025 (Czechia: 30 T-72M4CZ + 14 Leopard 2A4, 14 Gripen C/D,
 * 16 L-159; Slovakia: 30 T-72M + 15 Leopard 2A4, F-16 Block 70 deliveries; Hungary: 44 Leopard
 * 2A7HU + 12 2A4HU, 14 Gripen C/D, KF41 Lynx; Romania: 54 TR-85M1, ~220 TR-85, ~100 T-55AM,
 * F-16AM/BM, 2 Type 22 + 1 Marasesti, HIMARS, Patriot; Bulgaria: ~90 T-72, MiG-29, Su-25, first
 * F-16 Block 70, 3 Wielingen-class FFG); national MoD unit pages. Romanian F-16 split between
 * bases and Bulgarian F-16 delivered count are estimates.
 */
import { base, forNation } from './build';

const cz = forNation('CZE', 'IISS Military Balance 2025; army.cz');
const sk = forNation('SVK', 'IISS Military Balance 2025; mosr.sk');
const hu = forNation('HUN', 'IISS Military Balance 2025; honvedelem.hu');
const ro = forNation('ROU', 'IISS Military Balance 2025; defense.ro');
const bg = forNation('BGR', 'IISS Military Balance 2025; mod.bg');

const ACTIVE = { readiness: 0.6 };

export const centralEurope = [
  // Czechia
  cz('7th Mechanized Brigade', 'maneuver', 'brigade', base('Hranice', 49.55, 17.73), { t72m4cz: 30, leopard2a4: 14, bmp2: 100, infantry_squad: 54, truck: 250 }, { ...ACTIVE, personnel: 3500 }),
  cz('4th Rapid Deployment Brigade', 'maneuver', 'brigade', base('Žatec', 50.33, 13.55), { pandur2: 107, infantry_squad: 54, truck: 250 }, { readiness: 0.7, personnel: 3500 }),
  cz('13th Artillery Regiment', 'artillery', 'brigade', base('Jince', 49.79, 13.98), { caesar: 52, dana: 24 }, { ...ACTIVE, personnel: 1200 }),
  cz('25th Air Defence Missile Regiment', 'air_defense', 'brigade', base('Strakonice', 49.26, 13.9), { rbs70: 16, spyder: 4 }, { ...ACTIVE, personnel: 800 }),
  cz('Czech contingent, NATO Multinational Battle Group Slovakia', 'maneuver', 'battalion', base('Lešť, Slovakia', 48.37, 19.28), { pandur2: 10, infantry_squad: 9 }, { readiness: 0.8, personnel: 400 }),
  cz('21st Tactical Air Force Base', 'air_wing', 'wing', base('Čáslav', 49.94, 15.38), { gripen_c: 14, l159: 16 }, ACTIVE),

  // Slovakia
  sk('1st Mechanized Brigade', 'maneuver', 'brigade', base('Topoľčany', 48.56, 18.18), { t72: 30, bmp2: 60, infantry_squad: 36, truck: 200 }, { ...ACTIVE, personnel: 3000 }),
  sk('2nd Mechanized Brigade', 'maneuver', 'brigade', base('Prešov', 49.0, 21.24), { leopard2a4: 15, cv90: 20, patria_amv: 40, zuzana2: 16, infantry_squad: 36, truck: 200 }, { ...ACTIVE, personnel: 3000 }),
  sk('Air Force Base Sliač', 'air_wing', 'wing', base('Sliač', 48.64, 19.13), { f16_blk70: 12 }, ACTIVE),

  // Hungary
  hu('25th "Klapka György" Infantry Brigade', 'maneuver', 'brigade', base('Tata', 47.65, 18.32), { leopard2a7: 44, leopard2a4: 12, kf41_lynx: 50, pzh2000: 24, infantry_squad: 36, truck: 250 }, { ...ACTIVE, personnel: 3500 }),
  hu('5th "Bocskai István" Infantry Brigade', 'maneuver', 'brigade', base('Debrecen', 47.53, 21.63), { infantry_squad: 54, maxxpro: 40, truck: 200 }, { ...ACTIVE, personnel: 3500 }),
  hu('12th "Arrabona" Air Defence Missile Regiment', 'air_defense', 'brigade', base('Győr', 47.69, 17.63), { nasams: 6, rbs70: 12 }, { ...ACTIVE, personnel: 600 }),
  hu('59th "Szentgyörgyi Dezső" Air Base', 'air_wing', 'wing', base('Kecskemét', 46.92, 19.75), { gripen_c: 14 }, ACTIVE),

  // Romania
  ro('1st Mechanized Brigade "Argedava"', 'maneuver', 'brigade', base('Bucharest', 44.43, 26.1), { tr85: 60, piranha5: 60, infantry_squad: 54, truck: 200 }, { ...ACTIVE, personnel: 3500 }),
  ro('282nd Armoured Brigade "Unirea Principatelor"', 'maneuver', 'brigade', base('Focșani', 45.7, 27.18), { tr85m1: 54, tr85: 40, piranha5: 30, infantry_squad: 36, truck: 200 }, { ...ACTIVE, personnel: 3500 }),
  ro('9th Mechanized Brigade "Mărășești"', 'maneuver', 'brigade', base('Constanța', 44.17, 28.63), { tr85: 60, piranha5: 40, infantry_squad: 54, truck: 200 }, { ...ACTIVE, personnel: 3500 }),
  ro('15th Mechanized Brigade "Podu Înalt"', 'maneuver', 'brigade', base('Iași', 47.16, 27.59), { tr85: 60, piranha5: 40, infantry_squad: 54, truck: 200 }, { ...ACTIVE, personnel: 3500 }),
  ro('81st Mechanized Brigade "General Grigore Bălan"', 'maneuver', 'brigade', base('Bistrița', 47.13, 24.49), { t55am: 50, piranha5: 40, infantry_squad: 54, truck: 200 }, { ...ACTIVE, personnel: 3500 }),
  ro('18th Infantry Brigade "Banat"', 'maneuver', 'brigade', base('Timișoara', 45.75, 21.23), { t55am: 50, infantry_squad: 54, truck: 150 }, { ...ACTIVE, personnel: 3000 }),
  ro('2nd Infantry Brigade "Rovine"', 'maneuver', 'brigade', base('Craiova', 44.32, 23.8), { infantry_squad: 54, truck: 150 }, { ...ACTIVE, personnel: 3000 }),
  ro('2nd Mountain Troops Brigade "Sarmizegetusa"', 'maneuver', 'brigade', base('Brașov', 45.66, 25.61), { infantry_squad: 54, truck: 150 }, { ...ACTIVE, personnel: 3000 }),
  ro('61st Mountain Troops Brigade "Virgil Bădulescu"', 'maneuver', 'brigade', base('Miercurea Ciuc', 46.36, 25.8), { infantry_squad: 54, truck: 150 }, { ...ACTIVE, personnel: 3000 }),
  ro('8th Multiple Rocket Launcher Brigade (HIMARS)', 'artillery', 'brigade', base('Focșani', 45.7, 27.18), { m142_himars: 18 }, { ...ACTIVE, personnel: 800, extraMagazine: { gmlrs: 216, atacms: 18 } }),
  ro('1st Air Defence Brigade (Patriot)', 'air_defense', 'brigade', base('Capu Midia', 44.34, 28.65), { patriot_pac3: 12 }, { ...ACTIVE, personnel: 800 }),
  ro('86th Air Base', 'air_wing', 'wing', base('Borcea-Fetești', 44.38, 27.73), { f16am: 17 }, ACTIVE),
  ro('71st Air Base', 'air_wing', 'wing', base('Câmpia Turzii', 46.5, 23.89), { f16am: 23 }, ACTIVE),
  ro('Romanian Navy frigate flotilla', 'surface_group', 'flotilla', base('Constanța naval base', 44.17, 28.65), { ffg_type22: 2, ffg_marasesti: 1 }, { readiness: 0.4, personnel: 3 * 220 }),

  // Bulgaria
  bg('2nd Mechanized Brigade', 'maneuver', 'brigade', base('Stara Zagora', 42.42, 25.63), { t72: 30, bmp1: 40, '2s1': 12, infantry_squad: 36, truck: 150 }, { ...ACTIVE, personnel: 2500 }),
  bg('61st Mechanized Brigade', 'maneuver', 'brigade', base('Karlovo', 42.64, 24.8), { t72: 60, bmp1: 40, '2s1': 12, infantry_squad: 36, truck: 150 }, { ...ACTIVE, personnel: 2500 }),
  bg('3rd Air Base', 'air_wing', 'wing', base('Graf Ignatievo', 42.29, 24.71), { mig29: 11, f16_blk70: 8 }, { readiness: 0.5 }),
  bg('22nd Air Base', 'air_wing', 'wing', base('Bezmer', 42.45, 26.35), { su25: 6 }, { readiness: 0.5 }),
  bg('Bulgarian Navy frigates', 'surface_group', 'flotilla', base('Varna naval base', 43.19, 27.92), { ffg_wielingen: 3 }, { readiness: 0.45, personnel: 3 * 160 }),
];

/*
 * Türkiye, 2025-26.
 * Sources: IISS Military Balance 2025 (MBT ~2,238: Leopard 2A4/2A4T1, Leopard 1A3/1A4,
 * M60A3/M60T, M48A5T1/T2; F-16C/D ~240, F-4E 2020 ~30; 16 principal surface combatants incl.
 * Gabya, Barbaros, Yavuz, İstanbul; 12 SSK incl. first Reis class; TCG Anadolu); tsk.tr; Turkish
 * brigade stationing from open-source ORBAT compilations (2024). Brigade-to-tank-type mapping is
 * an estimate; the national totals follow IISS. The S-400 regiment is held inactive.
 */
import { add, base, forNation, type Kit } from './build';

const u = forNation('TUR', 'IISS Military Balance 2025; tsk.tr; open-source ORBAT 2024');

const ACTIVE = { readiness: 0.65, experience: 0.6 };
const ARMD = (tanks: Kit): Kit => add(tanks, { acv15: 60, t155_firtina: 18, infantry_squad: 18, truck: 300 });
const MECH = (tanks: Kit): Kit => add(tanks, { acv15: 100, m110a2: 6, t155_firtina: 12, infantry_squad: 54, truck: 300 });
const CDO: Kit = { infantry_squad: 72, kirpi: 60, truck: 150 };

type Row = readonly [name: string, place: string, lat: number, lon: number, kit: Kit];
const ground: Row[] = [
  // 1st Army (Thrace)
  ['1st Armoured Brigade', 'Hadımköy', 41.15, 28.62, ARMD({ leopard2a4: 120 })],
  ['2nd Armoured Brigade', 'Kartaltepe', 41.0, 28.8, ARMD({ leopard2a4: 100 })],
  ['3rd Armoured Brigade', 'Çerkezköy', 41.29, 28.0, ARMD({ leopard2a4: 96 })],
  ['95th Armoured Brigade', 'Malkara', 40.89, 26.9, ARMD({ leopard1a5: 120 })],
  ['4th Mechanized Infantry Brigade', 'Keşan', 40.86, 26.63, MECH({ leopard1a5: 60 })],
  ['8th Mechanized Infantry Brigade', 'Tekirdağ', 40.98, 27.51, MECH({ m60a3: 60 })],
  ['18th Mechanized Infantry Brigade', 'Çanakkale', 40.15, 26.41, MECH({ m60a3: 60 })],
  ['54th Mechanized Infantry Brigade', 'Edirne', 41.68, 26.56, MECH({ leopard1a5: 60 })],
  ['55th Mechanized Infantry Brigade', 'Süloğlu', 41.77, 26.91, MECH({ leopard1a5: 60 })],
  ['65th Mechanized Infantry Brigade', 'Lüleburgaz', 41.4, 27.36, MECH({ leopard1a5: 60 })],
  ['66th Mechanized Infantry Brigade', 'İstanbul', 41.1, 29.0, MECH({ leopard1a5: 37 })],
  // 2nd Army (south-east)
  ['5th Armoured Brigade', 'Gaziantep', 37.07, 37.38, ARMD({ m60t: 100 })],
  ['20th Armoured Brigade', 'Şanlıurfa', 37.17, 38.8, ARMD({ m60t: 65, m60a3: 40 })],
  ['172nd Armoured Brigade', 'Silopi', 37.25, 42.47, ARMD({ m60a3: 100 })],
  ['39th Mechanized Infantry Brigade', 'İskenderun', 36.59, 36.17, MECH({ m60a3: 60 })],
  ['70th Mechanized Infantry Brigade', 'Mardin', 37.31, 40.74, MECH({ m60a3: 60 })],
  ['2nd Commando Brigade', 'Talas, Kayseri', 38.69, 35.55, CDO],
  ['3rd Commando Brigade', 'Siirt', 37.93, 41.94, CDO],
  ['Hakkari Mountain Commando Brigade', 'Hakkari', 37.57, 43.74, CDO],
  // 3rd Army (north-east)
  ['4th Armoured Brigade', 'Doğubayazıt', 39.55, 44.08, ARMD({ m48a5: 100 })],
  ['14th Mechanized Infantry Brigade', 'Kars', 40.6, 43.1, MECH({ m48a5: 90 })],
  ['25th Mechanized Infantry Brigade', 'Ardahan', 41.11, 42.7, MECH({ m48a5: 90 })],
  ['9th Mechanized Infantry Brigade', 'Erzurum', 39.9, 41.27, MECH({ m48a5: 90 })],
  ['51st Motorized Infantry Brigade', 'Hozat', 39.11, 39.21, MECH({ m48a5: 60 })],
  ['49th Commando Brigade', 'Bingöl', 38.88, 40.5, CDO],
  // Aegean Army
  ['11th Mechanized Infantry Brigade', 'Denizli', 37.78, 29.09, MECH({ m60a3: 60 })],
  ['19th Mechanized Infantry Brigade', 'Edremit', 39.6, 27.02, MECH({ m60a3: 70 })],
  ['57th Artillery Training Brigade', 'İzmir', 38.42, 27.14, MECH({ m48a5: 60 })],
  // Training base and reserve holdings
  ['Armour School and reserve tank holdings', 'Etimesgut', 39.95, 32.67, { m48a5: 160, m60a3: 80, leopard1a5: 30 }],
  // Special forces and airborne
  ['1st Commando Brigade', 'Kayseri', 38.72, 35.49, CDO],
  ['Special Forces Command', 'Ankara', 39.93, 32.85, { infantry_squad: 60, kirpi: 40 }],
];

export const tur = [
  ...ground.map(([name, place, lat, lon, kit]) => u(name, 'maneuver', 'brigade', base(place, lat, lon), kit, { ...ACTIVE, personnel: Math.round((kit.infantry_squad ?? 0) * 40 + 2000) })),
  u('Turkish Forces Cyprus (28th and 39th Mechanized Divisions, 14th Armoured Brigade)', 'maneuver', 'corps', base('Kyrenia/Girne', 35.33, 33.32), add(ARMD({ m48a5: 150, m60a3: 80 }), { acv15: 200, infantry_squad: 108 }), { ...ACTIVE, personnel: 35000 }),
  u('Multiple Rocket Launcher Regiments (TRG-300, T-122)', 'artillery', 'brigade', base('Polatlı', 39.58, 32.15), { trg300_kasirga: 30, bora_launcher: 12, m270a1: 12 }, { ...ACTIVE, personnel: 2500 }),
  u('Army Aviation Command', 'air_wing', 'brigade', base('Güvercinlik, Ankara', 39.94, 32.74), { t129: 60, uh60m: 80, ch47f: 11 }, { ...ACTIVE, personnel: 4000 }),
  u('Air Defence (HİSAR-O, SİPER)', 'air_defense', 'brigade', base('Konya', 37.98, 32.56), { hisar_o: 12, siper: 6 }, { ...ACTIVE, personnel: 1500 }),
  u('S-400 regiment (inactive)', 'air_defense', 'brigade', base('Mürted (Akıncı) AB', 40.08, 32.57), { s400: 32 }, { readiness: 0.1, personnel: 800 }),

  // Air Force
  u('1st Main Jet Base', 'air_wing', 'wing', base('Eskişehir', 39.78, 30.58), { f16c: 20, f4e: 20 }, ACTIVE),
  u('3rd Main Jet Base', 'air_wing', 'wing', base('Konya', 37.98, 32.56), { f16c: 20, e7a: 4 }, ACTIVE),
  u('4th Main Jet Base', 'air_wing', 'wing', base('Akıncı, Ankara', 40.08, 32.57), { f16c: 50, akinci: 12 }, ACTIVE),
  u('5th Main Jet Base', 'air_wing', 'wing', base('Merzifon', 40.83, 35.52), { f16c: 40 }, ACTIVE),
  u('6th Main Jet Base', 'air_wing', 'wing', base('Bandırma', 40.32, 27.98), { f16c: 40 }, ACTIVE),
  u('7th Main Jet Base', 'air_wing', 'wing', base('Malatya Erhaç', 38.44, 38.09), { f4e: 10, tb2: 12 }, ACTIVE),
  u('8th Main Jet Base', 'air_wing', 'wing', base('Diyarbakır', 37.89, 40.2), { f16c: 40 }, ACTIVE),
  u('9th Main Jet Base', 'air_wing', 'wing', base('Balıkesir', 39.62, 27.93), { f16c: 40 }, ACTIVE),
  u('10th Tanker Base', 'logistics', 'wing', base('İncirlik', 37.0, 35.43), { kc135r: 7 }, ACTIVE),
  u('12th Air Transport Base', 'logistics', 'wing', base('Kayseri Erkilet', 38.77, 35.5), { a400m: 10, c130j: 18 }, ACTIVE),

  // Navy
  u('Northern Sea Area Command (Gölcük frigates)', 'surface_group', 'flotilla', base('Gölcük Naval Base', 40.72, 29.82), { ffg_barbaros: 4, ffg_yavuz: 4, ffg_istanbul: 1, lhd_anadolu: 1 }, { readiness: 0.65, personnel: 3000 }),
  u('Southern Sea Area Command (Aksaz frigates and corvettes)', 'surface_group', 'flotilla', base('Aksaz Naval Base', 36.98, 28.4), { ffg_gabya: 8, corvette_ada: 4 }, { readiness: 0.65, personnel: 2200 }),
  u('Submarine Fleet Command', 'submarine', 'flotilla', base('Gölcük Naval Base', 40.72, 29.82), { ssk_type209: 10, ssk_reis: 2 }, { readiness: 0.6, personnel: 12 * 40 }),
];

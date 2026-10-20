/*
 * Ukraine, wartime structure 2025-26.
 * Sources: IISS Military Balance 2025 (Ukraine: ~1,000+ MBT incl. T-64BV/T-72/T-80 and donated
 * Leopard 1A5/2A4/2A6, Strv 122, M1A1SA, Challenger 2, PT-91; combat aircraft MiG-29, Su-27,
 * Su-24M, Su-25, F-16AM/BM, Mirage 2000-5F); Oryx loss tallies and Kiel Institute Ukraine
 * Support Tracker for donated equipment; open-source ORBAT trackers (DeepState, UA brigade
 * pages, ISW) for brigade lists and sectors. The "base" of a committed brigade is its 2025
 * operating sector, not a garrison. Per-brigade holdings are estimates: brigades run well
 * below establishment, so a mechanized brigade fields ~10-25 tanks, not 31+. Experience is
 * high (0.85): most brigades have years of continuous combat.
 */
import { add, base, forNation, type Kit } from './build';

const u = forNation('UKR', 'IISS Military Balance 2025; Oryx; Kiel Ukraine Support Tracker; DeepState/ISW ORBAT');

const sector = {
  kupiansk: base('Kupiansk sector', 49.71, 37.62),
  lyman: base('Lyman sector', 48.99, 37.8),
  siversk: base('Siversk sector', 48.87, 38.1),
  kostiantynivka: base('Kostiantynivka sector', 48.53, 37.71),
  dobropillia: base('Dobropillia sector', 48.47, 37.08),
  pokrovsk: base('Pokrovsk sector', 48.28, 37.18),
  velykaNovosilka: base('Velyka Novosilka sector', 47.84, 36.83),
  huliaipole: base('Huliaipole sector', 47.66, 36.26),
  orikhiv: base('Orikhiv sector', 47.57, 35.78),
  kherson: base('Kherson sector', 46.64, 32.61),
  sumy: base('Sumy sector', 50.91, 34.8),
  kharkiv: base('Kharkiv sector', 50.0, 36.23),
  vovchansk: base('Vovchansk sector', 50.29, 36.94),
  kramatorsk: base('Kramatorsk', 48.72, 37.56),
  dnipro: base('Dnipro', 48.46, 35.05),
  zaporizhzhia: base('Zaporizhzhia', 47.84, 35.14),
  kyiv: base('Kyiv', 50.45, 30.52),
  odesa: base('Odesa', 46.48, 30.73),
  chernihiv: base('Chernihiv', 51.5, 31.3),
  lviv: base('Lviv', 49.84, 24.03),
} as const;
type Sector = keyof typeof sector;

const WAR = { readiness: 0.6, experience: 0.85 };

/** Mechanized/motorized brigade at typical 2025 strength; `tanks` sets the tank battalion's fleet. */
const mech = (tanks: Kit, ifv: Kit = { bmp2: 30, btr4: 10 }): Kit => add(tanks, ifv, { '2s1': 12, '2a65': 6, mt_lb: 20, maxxpro: 20, infantry_squad: 50, truck: 150 });
const AIR_ASSAULT = (tanks: Kit = { t80bv: 8 }): Kit => add(tanks, { btr4: 20, maxxpro: 40, '2a65': 12, infantry_squad: 60, truck: 150 });
const MARINE: Kit = { t72: 8, bmp1: 20, btr4: 20, '2s1': 12, infantry_squad: 50, truck: 120 };
const NGU: Kit = { t64bv: 4, btr4: 20, maxxpro: 20, '2a65': 6, infantry_squad: 55, truck: 100 };
const TDF: Kit = { infantry_squad: 45, maxxpro: 10, truck: 60 };
const TANK = (tanks: Kit): Kit => add(tanks, { bmp2: 10, '2s3': 12, infantry_squad: 9, truck: 150 });

type Row = readonly [name: string, at: Sector, kit: Kit];
const rows: Row[] = [
  // Tank brigades
  ['1st Separate Tank Brigade', 'pokrovsk', TANK({ t64bv: 40 })],
  ['3rd Separate Tank Brigade', 'kupiansk', TANK({ t80bv: 30, t64bv: 20 })],
  ['4th Separate Tank Brigade', 'kostiantynivka', TANK({ t64bv: 45, t72: 5 })],
  ['5th Separate Tank Brigade', 'kharkiv', TANK({ leopard1a5: 30, t72: 20 })],
  ['17th Separate Tank Brigade', 'kostiantynivka', TANK({ t64bv: 40 })],

  // Assault and mechanized brigades with Western equipment
  ['3rd Separate Assault Brigade', 'lyman', mech({ t64bv: 15, t72: 10 }, { bmp2: 40, m113: 20 })],
  ['5th Separate Assault Brigade', 'kostiantynivka', mech({ t64bv: 20 })],
  ['47th Separate Mechanized Brigade', 'sumy', mech({ m1a1_sa: 25 }, { m2a2_ods: 80 })],
  ['21st Separate Mechanized Brigade', 'kupiansk', mech({ strv122: 8 }, { cv90: 35 })],
  ['33rd Separate Mechanized Brigade', 'pokrovsk', mech({ leopard2a6: 8, leopard2a4: 10 }, { marder: 20, bmp2: 20 })],
  ['22nd Separate Mechanized Brigade', 'kostiantynivka', mech({ t72: 13 })],
  ['43rd Separate Mechanized Brigade', 'kharkiv', mech({ pt91: 20 })],
  ['44th Separate Mechanized Brigade', 'kupiansk', mech({ leopard1a5: 20 })],
  ['155th Separate Mechanized Brigade', 'pokrovsk', mech({ t64bv: 10 }, { bmp2: 20, btr4: 10 })],
  ['59th Separate Assault Brigade', 'pokrovsk', mech({ t64bv: 13 })],
  ['92nd Separate Assault Brigade', 'kupiansk', mech({ t64bv: 15 })],
  ['93rd Separate Mechanized Brigade', 'kostiantynivka', mech({ t64bv: 15 })],
  ['24th Separate Mechanized Brigade', 'kostiantynivka', mech({ t64bv: 13 })],
  ['28th Separate Mechanized Brigade', 'kostiantynivka', mech({ t64bv: 13 })],
  ['30th Separate Mechanized Brigade', 'siversk', mech({ t64bv: 13 })],
  ['14th Separate Mechanized Brigade', 'kupiansk', mech({ t64bv: 13 })],
  ['31st Separate Mechanized Brigade', 'pokrovsk', mech({ t64bv: 13 })],
  ['32nd Separate Mechanized Brigade', 'pokrovsk', mech({ t64bv: 13 })],
  ['41st Separate Mechanized Brigade', 'kupiansk', mech({ t64bv: 13 })],
  ['42nd Separate Mechanized Brigade', 'vovchansk', mech({ t64bv: 13 })],
  ['53rd Separate Mechanized Brigade', 'pokrovsk', mech({ t64bv: 13 })],
  ['54th Separate Mechanized Brigade', 'siversk', mech({ t64bv: 13 })],
  ['57th Separate Motorized Infantry Brigade', 'vovchansk', mech({ t64bv: 10 })],
  ['58th Separate Motorized Infantry Brigade', 'velykaNovosilka', mech({ t64bv: 10 })],
  ['60th Separate Mechanized Brigade', 'lyman', mech({ t64bv: 13 })],
  ['61st Separate Jaeger Brigade', 'kostiantynivka', mech({ t64bv: 10 })],
  ['62nd Separate Mechanized Brigade', 'lyman', mech({ t64bv: 13 })],
  ['63rd Separate Mechanized Brigade', 'lyman', mech({ t64bv: 13 })],
  ['65th Separate Mechanized Brigade', 'orikhiv', mech({ t64bv: 13 })],
  ['66th Separate Mechanized Brigade', 'lyman', mech({ t64bv: 13 })],
  ['67th Separate Mechanized Brigade', 'lyman', mech({ m84: 15 })],
  ['68th Separate Jaeger Brigade', 'pokrovsk', mech({ t64bv: 10 })],
  ['71st Separate Jaeger Brigade', 'sumy', mech({ t64bv: 10 })],
  ['72nd Separate Mechanized Brigade', 'velykaNovosilka', mech({ t64bv: 13 })],
  ['10th Separate Mountain Assault Brigade', 'siversk', mech({ t64bv: 10 })],
  ['128th Separate Mountain Assault Brigade', 'orikhiv', mech({ t64bv: 10 })],
  ['110th Separate Mechanized Brigade', 'huliaipole', mech({ t64bv: 13 })],
  ['100th Separate Mechanized Brigade', 'pokrovsk', mech({ t64bv: 13 })],
  ['102nd Separate Mechanized Brigade', 'huliaipole', mech({ t64bv: 10 })],
  ['104th Separate Mechanized Brigade', 'huliaipole', mech({ t64bv: 10 })],
  ['106th Separate Mechanized Brigade', 'huliaipole', mech({ t64bv: 10 })],
  ['114th Separate Mechanized Brigade', 'kupiansk', mech({ t64bv: 10 })],
  ['115th Separate Mechanized Brigade', 'lyman', mech({ t64bv: 13 })],
  ['116th Separate Mechanized Brigade', 'kupiansk', mech({ t64bv: 13 })],
  ['117th Separate Mechanized Brigade', 'pokrovsk', mech({ t64bv: 13 })],
  ['118th Separate Mechanized Brigade', 'orikhiv', mech({ t64bv: 13 })],
  ['141st Separate Mechanized Brigade', 'orikhiv', mech({ t64bv: 13 })],
  ['150th Separate Mechanized Brigade', 'pokrovsk', mech({ t64bv: 13 })],
  ['151st Separate Mechanized Brigade', 'kupiansk', mech({ t64bv: 13 })],
  ['152nd Separate Jaeger Brigade', 'pokrovsk', mech({ t64bv: 10 })],
  ['153rd Separate Mechanized Brigade', 'huliaipole', mech({ t64bv: 13 })],
  ['154th Separate Mechanized Brigade', 'orikhiv', mech({ t64bv: 13 })],
  ['156th Separate Mechanized Brigade', 'velykaNovosilka', mech({ t64bv: 13 })],
  ['157th Separate Mechanized Brigade', 'pokrovsk', mech({ t64bv: 13 })],
  ['158th Separate Mechanized Brigade', 'sumy', mech({ t64bv: 13 })],
  ['159th Separate Mechanized Brigade', 'kharkiv', mech({ t64bv: 13 })],
  ['160th Separate Mechanized Brigade', 'kharkiv', mech({ t64bv: 13 })],
  ['161st Separate Mechanized Brigade', 'sumy', mech({ t64bv: 13 })],
  ['164th Separate Mechanized Brigade', 'kostiantynivka', mech({ t64bv: 13 })],

  // Air Assault Forces
  ['25th Separate Airborne Brigade', 'pokrovsk', AIR_ASSAULT()],
  ['45th Separate Air Assault Brigade', 'siversk', AIR_ASSAULT()],
  ['46th Separate Airmobile Brigade', 'orikhiv', AIR_ASSAULT()],
  ['77th Separate Airmobile Brigade', 'kupiansk', AIR_ASSAULT()],
  ['79th Separate Air Assault Brigade', 'kostiantynivka', AIR_ASSAULT()],
  ['80th Separate Air Assault Brigade', 'sumy', AIR_ASSAULT()],
  ['81st Separate Airmobile Brigade', 'siversk', AIR_ASSAULT()],
  ['82nd Separate Air Assault Brigade', 'sumy', add(AIR_ASSAULT({ challenger2: 10 }), { stryker_icv: 60, marder: 30 })],
  ['95th Separate Air Assault Brigade', 'kramatorsk', AIR_ASSAULT()],

  // Marines and coastal defence
  ['35th Separate Marine Brigade', 'kherson', MARINE],
  ['36th Separate Marine Brigade', 'kostiantynivka', MARINE],
  ['37th Separate Marine Brigade', 'velykaNovosilka', MARINE],
  ['38th Separate Marine Brigade', 'kherson', MARINE],
  ['40th Separate Coastal Defence Brigade', 'kherson', add(TDF, { '2a65': 12 })],

  // National Guard
  ['1st Presidential Brigade "Bureviy"', 'huliaipole', NGU],
  ['2nd Galician Brigade (NGU)', 'kupiansk', NGU],
  ['4th Brigade "Rubizh" (NGU)', 'lyman', NGU],
  ['12th Assault Brigade "Azov" (NGU)', 'kostiantynivka', add(NGU, { t64bv: 10 })],
  ['13th Brigade "Khartiia" (NGU)', 'kharkiv', NGU],
  ['14th Brigade "Chervona Kalyna" (NGU)', 'kupiansk', NGU],
  ['15th Brigade "Kara-Dag" (NGU)', 'orikhiv', NGU],
  ['16th Brigade "Kryvbas" (NGU)', 'dobropillia', NGU],
  ['18th Sloviansk Brigade (NGU)', 'kostiantynivka', NGU],
  ['20th Brigade "Lubart" (NGU)', 'kostiantynivka', NGU],
  ['21st Brigade "Petra Sahaidachnoho" (NGU)', 'lyman', NGU],
  ['22nd Brigade (NGU)', 'chernihiv', NGU],
  ['23rd Brigade (NGU)', 'orikhiv', NGU],
  ['27th Pechersk Brigade (NGU)', 'kyiv', NGU],

  // Territorial Defence Forces brigades
  ['101st Territorial Defence Brigade', 'kyiv', TDF],
  ['103rd Territorial Defence Brigade', 'lviv', TDF],
  ['105th Territorial Defence Brigade', 'vovchansk', TDF],
  ['107th Territorial Defence Brigade', 'kupiansk', TDF],
  ['109th Territorial Defence Brigade', 'pokrovsk', TDF],
  ['111th Territorial Defence Brigade', 'dobropillia', TDF],
  ['112th Territorial Defence Brigade', 'kyiv', TDF],
  ['113th Territorial Defence Brigade', 'kharkiv', TDF],
  ['119th Territorial Defence Brigade', 'chernihiv', TDF],
  ['120th Territorial Defence Brigade', 'sumy', TDF],
  ['121st Territorial Defence Brigade', 'kherson', TDF],
  ['122nd Territorial Defence Brigade', 'odesa', TDF],
  ['123rd Territorial Defence Brigade', 'kherson', TDF],
  ['124th Territorial Defence Brigade', 'kherson', TDF],
  ['125th Territorial Defence Brigade', 'lyman', TDF],
  ['126th Territorial Defence Brigade', 'odesa', TDF],
  ['127th Territorial Defence Brigade', 'kharkiv', TDF],
  ['129th Territorial Defence Brigade', 'zaporizhzhia', TDF],
];

export const ukr = [
  ...rows.map(([name, at, kit]) => u(name, 'maneuver', 'brigade', sector[at], kit, { ...WAR, personnel: Math.round((kit.infantry_squad ?? 0) * 40 + 600) })),

  // Artillery, rocket and missile brigades
  u('26th Separate Artillery Brigade', 'artillery', 'brigade', sector.kramatorsk, { '2s19': 12, '2s3': 18, pzh2000: 6, caesar: 6, truck: 150 }, WAR),
  u('40th Separate Artillery Brigade', 'artillery', 'brigade', sector.huliaipole, { '2a65': 36, m777a2: 12, truck: 150 }, WAR),
  u('43rd Separate Heavy Artillery Brigade', 'artillery', 'brigade', sector.pokrovsk, { '2s7': 12, bohdana: 12, m109a6: 12, truck: 150 }, WAR),
  u('44th Separate Artillery Brigade', 'artillery', 'brigade', sector.kostiantynivka, { m777a2: 24, fh70: 12, as90: 12, truck: 150 }, WAR),
  u('45th Separate Artillery Brigade', 'artillery', 'brigade', sector.kupiansk, { '2s1': 24, krab: 12, m109a5: 12, truck: 150 }, WAR),
  u('55th Separate Artillery Brigade', 'artillery', 'brigade', sector.zaporizhzhia, { '2a65': 24, caesar: 12, dana: 6, truck: 150 }, WAR),
  u('27th Separate Rocket Artillery Brigade', 'artillery', 'brigade', sector.dnipro, { bm27: 24, bm21: 24, m142_himars: 16, truck: 150 }, { ...WAR, extraMagazine: { gmlrs: 384, atacms: 20 } }),
  u('107th Separate Rocket Artillery Brigade', 'artillery', 'brigade', sector.kharkiv, { bm30: 12, bm21: 24, m270a1: 10, mars2: 5, truck: 150 }, { ...WAR, extraMagazine: { gmlrs: 240 } }),
  u('19th Separate Missile Brigade', 'missile', 'brigade', sector.dnipro, { tochka_u: 6, neptune_launcher: 4, truck: 60 }, { ...WAR, extraMagazine: { neptune: 30 } }),
  u('Coastal missile battalion (Neptune)', 'missile', 'battalion', sector.odesa, { neptune_launcher: 4, truck: 30 }, { ...WAR, extraMagazine: { neptune: 20 } }),

  // Long-range one-way attack drones on Russian refineries, airbases and depots. Ukraine launched
  // several hundred a month in 2025 (Russian MoD daily claims; ISW; Ukrainian General Staff), mostly
  // FP-1/Lyutyi with older UJ-26 Bober. Launch sites x 5 launches a day at readiness 0.6 gives about
  // 500 a month; stocks cover roughly a month at that pace (judgement call).
  u('Unmanned Systems Forces long-range strike group (FP-1 / Lyutyi)', 'missile', 'brigade', base('Dispersed launch sites, Poltava', 49.59, 34.55), { lyutyi_launcher: 4, truck: 20 }, { ...WAR, extraMagazine: { lyutyi: 360 } }),
  u('GUR / SBU long-range drone units (Lyutyi, UJ-26 Bober)', 'missile', 'battalion', base('Dispersed launch sites, Sumy', 50.91, 34.8), { lyutyi_launcher: 1, bober_launcher: 2, truck: 10 }, { ...WAR, extraMagazine: { lyutyi: 80, bober: 120 } }),

  // Air defence (Air Force anti-aircraft missile brigades)
  u('96th Anti-Aircraft Missile Brigade', 'air_defense', 'brigade', sector.kyiv, { patriot_pac3: 16, nasams: 12, iris_t_slm: 9, s300ps: 12 }, { ...WAR, extraMagazine: { pac3_mse: 48, pac2_gem_t: 24 } }),
  u('138th Anti-Aircraft Missile Brigade', 'air_defense', 'brigade', sector.dnipro, { patriot_pac3: 8, s300ps: 12, iris_t_slm: 6 }, WAR),
  u('160th Anti-Aircraft Missile Brigade', 'air_defense', 'brigade', sector.odesa, { patriot_pac3: 8, s300ps: 12, nasams: 8 }, WAR),
  u('201st Anti-Aircraft Missile Brigade', 'air_defense', 'brigade', sector.zaporizhzhia, { s300ps: 12, iris_t_slm: 6, samp_t: 5 }, WAR),
  u('208th Anti-Aircraft Missile Brigade', 'air_defense', 'brigade', sector.kharkiv, { s300ps: 12, buk_m1: 12, nasams: 8 }, WAR),
  u('223rd Anti-Aircraft Missile Brigade', 'air_defense', 'brigade', sector.lviv, { patriot_pac3: 8, iris_t_slm: 9, samp_t: 5 }, WAR),
  u('Ground Forces air defence (Gepard and Avenger groups)', 'air_defense', 'brigade', sector.kramatorsk, { gepard: 50, avenger: 20, buk_m1: 18 }, WAR),

  // Air Force
  u('114th Tactical Aviation Brigade', 'air_wing', 'brigade', base('Ivano-Frankivsk', 48.88, 24.69), { mig29: 10 }, WAR),
  u('40th Tactical Aviation Brigade', 'air_wing', 'brigade', base('Vasylkiv', 50.24, 30.3), { mig29: 10 }, WAR),
  u('204th Tactical Aviation Brigade', 'air_wing', 'brigade', base('Lutsk', 50.68, 25.49), { mig29: 10 }, WAR),
  u('39th Tactical Aviation Brigade', 'air_wing', 'brigade', base('Ozerne', 50.16, 28.74), { su27: 8 }, WAR),
  u('831st Tactical Aviation Brigade', 'air_wing', 'brigade', base('Myrhorod', 49.93, 33.64), { su27: 7 }, WAR),
  u('7th Tactical Aviation Brigade', 'air_wing', 'brigade', base('Starokostiantyniv', 49.74, 27.27), { su24m_scalp: 12 }, { ...WAR, extraMagazine: { storm_shadow: 40 } }),
  u('299th Tactical Aviation Brigade', 'air_wing', 'brigade', base('Kulbakino (dispersed)', 47.0, 32.0), { su25: 12 }, WAR),
  u('F-16 group, Air Force (dispersed western Ukraine)', 'air_wing', 'wing', base('Western Ukraine dispersal airfields', 49.5, 26.0), { f16am: 20, mirage2000_5: 6 }, WAR),
  u('Army Aviation brigades (12th, 16th, 18th)', 'air_wing', 'brigade', sector.dnipro, { mi24: 30, mi8: 60 }, WAR),
  u('Unmanned Systems Forces strike drone wing', 'air_wing', 'wing', sector.kyiv, { tb2: 12 }, WAR),

  // Uncrewed surface vessels. GUR's Group 13 (Magura V5, V7 since 2025) and the SBU (Sea Baby)
  // sank or disabled Ivanovets, Tsezar Kunikov, Sergei Kotov and others in 2023-24 with waves of
  // 5-10 boats, and Magura V7s downed Su-30s in 2025 (Oryx; GUR and SBU statements; UK MoD).
  // Ready inventories are not published; ~50 boats across the two services is a judgement call.
  u('GUR Group 13 (Magura strike USVs)', 'surface_group', 'battalion', base('Odesa harbour', 46.49, 30.74), { magura_v5: 24, magura_v7: 6 }, WAR),
  u('SBU Sea Baby USV detachment', 'surface_group', 'battalion', base('Izmail (Danube)', 45.35, 28.84), { sea_baby: 20 }, WAR),

  // Logistics
  u('Joint Forces logistics (aggregate)', 'logistics', 'army', sector.dnipro, { truck: 8000 }, { ...WAR, personnel: 30000 }),
];

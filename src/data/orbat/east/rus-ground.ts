import type { OrbatEntry } from '../types';
import { at, merge, mix, scale, unit, type Base, type Kit } from './build';

/*
 * Russian Ground Forces, VDV and Naval Infantry, late 2025.
 *
 * Structure follows the 2024 re-creation of the Moscow and Leningrad military districts.
 * Formations committed to the war are placed at their sector of the front line, not their
 * peacetime garrison. Strength factors scale a table of organisation to an estimated current
 * strength: Oryx had documented more than 4,000 Russian tanks and ~9,000 other armoured
 * vehicles lost by late 2025, made good partly with refurbished T-62M/T-55 and MT-LBs, so
 * front-line units sit at ~50-70% of establishment and carry older types. Strengths are
 * estimates, calibrated so the force total sits near IISS Military Balance 2025 active
 * holdings (see tests/orbat-east.test.ts).
 */

const RUS = 'RUS';

type Tanks = Kit; // shares of each tank type in a unit's tank park

const ELITE: Tanks = { t90m: 0.35, t80bvm: 0.35, t72b3: 0.3 };
const T80: Tanks = { t80bvm: 0.55, t80bv: 0.3, t90m: 0.15 };
const STANDARD: Tanks = { t72b3: 0.6, t72b: 0.15, t90m: 0.15, t62m: 0.1 };
const REFURB: Tanks = { t72b3: 0.35, t72b: 0.2, t62m: 0.3, t55: 0.05, t64bv: 0.1 }; // ex-DNR/LNR corps and reconstituted units
const EAST: Tanks = { t72b3: 0.45, t80bv: 0.2, t62m: 0.25, t90m: 0.1 };
const GARRISON: Tanks = { t72b3: 0.7, t72b: 0.3 };

// Tables of organisation (full strength). Sources: IISS Military Balance 2025; Grau & Bartles,
// "The Russian Way of War" (2016) for brigade/division establishments.
const MRB_TOE = (tanks: Tanks, ifv: string): Kit => merge(mix(41, tanks), { [ifv]: 120, mtlb: 25, '2s19_msta': 18, '2s3': 18, bm21_grad: 18, tor_m2: 6, strela10: 6, infantry_squad: 110, truck: 450 });
const MRD_TOE = (tanks: Tanks, ifv: string): Kit => merge(mix(160, tanks), { [ifv]: 280, mtlb: 40, '2s19_msta': 54, '2s3': 18, bm21_grad: 18, tor_m2: 12, strela10: 12, infantry_squad: 260, truck: 1100 });
const TD_TOE = (tanks: Tanks): Kit => merge(mix(250, tanks), { bmp2: 110, bmp3: 40, '2s19_msta': 54, bm21_grad: 18, tor_m2: 12, strela10: 12, infantry_squad: 110, truck: 900 });
const TANK_BDE_TOE = (tanks: Tanks): Kit => merge(mix(94, tanks), { bmp2: 40, '2s19_msta': 18, bm21_grad: 6, tor_m2: 4, infantry_squad: 40, truck: 300 });
const VDV_DIV_TOE: Kit = { bmd4m: 80, bmd2: 120, btr_mdm: 60, t72b3: 31, '2s9': 36, '2s19_msta': 12, bm21_grad: 12, strela10: 12, infantry_squad: 170, truck: 450 };
const VDV_BDE_TOE: Kit = { bmd2: 70, bmd4m: 20, btr_mdm: 20, '2s9': 18, strela10: 6, infantry_squad: 90, truck: 250 };
const NIB_TOE = (tanks: Tanks): Kit => merge(mix(31, tanks), { btr82a: 100, mtlb: 30, '2s19_msta': 18, '2s9': 12, bm21_grad: 18, strela10: 6, infantry_squad: 100, truck: 350 });

const deployed = { readiness: 0.6, experience: 0.7 };
const home = { readiness: 0.55, experience: 0.45 };

type Row = [name: string, base: Base, strength: number, tanks?: Tanks, ifv?: string];

const mrbs = (rows: Row[], extra = deployed): OrbatEntry[] =>
  rows.map(([name, base, s, tanks = STANDARD, ifv = 'bmp2']) => unit(RUS, name, 'maneuver', 'brigade', base, scale(MRB_TOE(tanks, ifv), s), extra));
const mrds = (rows: Row[], extra = deployed): OrbatEntry[] =>
  rows.map(([name, base, s, tanks = STANDARD, ifv = 'bmp2']) => unit(RUS, name, 'maneuver', 'division', base, scale(MRD_TOE(tanks, ifv), s), extra));

// Front-line sectors, late 2025 (approximate; ISW / DeepState maps).
const KUPIANSK = (dLat = 0, dLon = 0) => at('Kupiansk axis, Kharkiv oblast', 49.7 + dLat, 37.75 + dLon);
const VOVCHANSK = (d = 0) => at('Vovchansk axis, Kharkiv oblast', 50.25 + d, 36.95 + d);
const LYMAN = (d = 0) => at('Lyman-Borova axis, Donetsk/Kharkiv', 49.1 + d, 38.0 + d);
const SIVERSK = (d = 0) => at('Siversk axis, Donetsk oblast', 48.85 + d, 38.15 - d);
const KOSTIANTYNIVKA = (d = 0) => at('Kostiantynivka/Toretsk axis, Donetsk oblast', 48.45 + d, 37.75 - d);
const POKROVSK = (d = 0) => at('Pokrovsk/Myrnohrad axis, Donetsk oblast', 48.25 + d, 37.2 - d);
const DOBROPILLIA = (d = 0) => at('Dobropillia salient, Donetsk oblast', 48.45 + d, 37.05 - d);
const NOVOPAVLIVKA = (d = 0) => at('Novopavlivka axis, Dnipropetrovsk border', 48.05 + d, 36.75 - d);
const HULIAIPOLE = (d = 0) => at('Huliaipole axis, Zaporizhzhia oblast', 47.7 + d, 36.35 - d);
const ORIKHIV = (d = 0) => at('Orikhiv/Kamianske axis, Zaporizhzhia oblast', 47.5 + d, 35.65 - d);
const KHERSON = (d = 0) => at('Dnipro left bank, Kherson oblast', 46.65 + d, 33.2 + d);
const KURSK = (d = 0) => at('Kursk-Sumy border', 51.3 + d, 35.1 + d);

const leningrad: OrbatEntry[] = [
  ...mrds([
    ['69th Guards Motor Rifle Division (6th CAA)', KUPIANSK(-0.15, 0.2), 0.5, STANDARD],
    ['72nd Motor Rifle Division (44th AC)', VOVCHANSK(), 0.5, REFURB],
  ]),
  ...mrds([['18th Guards Motor Rifle Division (11th AC)', at('Gusev, Kaliningrad', 54.59, 22.2), 0.55, GARRISON, 'btr82a']], home),
  ...mrbs([
    ['25th Guards Motor Rifle Brigade (6th CAA)', KUPIANSK(-0.3, 0.3), 0.55],
    ['128th Motor Rifle Brigade (44th AC)', VOVCHANSK(0.05), 0.55, REFURB, 'btr82a'],
    ['200th Separate Motor Rifle Brigade (14th AC)', KURSK(-0.05), 0.45, STANDARD, 'mtlb'],
    ['80th Arctic Motor Rifle Brigade (14th AC)', KURSK(0.08), 0.5, STANDARD, 'mtlb'],
  ]),
];

const moscow: OrbatEntry[] = [
  unit(RUS, '2nd Guards Tamanskaya Motor Rifle Division (1st GTA)', 'maneuver', 'division', KUPIANSK(0.1, 0), scale(MRD_TOE(ELITE, 'bmp2'), 0.6), deployed),
  unit(RUS, '4th Guards Kantemirovskaya Tank Division (1st GTA)', 'maneuver', 'division', KUPIANSK(0.2, -0.15), scale(TD_TOE(T80), 0.55), deployed),
  unit(RUS, '47th Guards Tank Division (1st GTA)', 'maneuver', 'division', KUPIANSK(0.35, -0.3), scale(TD_TOE(T80), 0.5), deployed),
  ...mrbs([['27th Guards Motor Rifle Brigade (1st GTA)', KUPIANSK(0, -0.4), 0.6, ELITE, 'bmp3']]),
  ...mrds([
    ['3rd Motor Rifle Division (20th CAA)', SIVERSK(0.1), 0.55],
    ['144th Guards Motor Rifle Division (20th CAA)', LYMAN(), 0.55],
    ['67th Motor Rifle Division (25th CAA)', LYMAN(0.15), 0.5, REFURB],
  ]),
  ...mrbs([['164th Motor Rifle Brigade (25th CAA)', LYMAN(0.25), 0.55, REFURB]]),
];

const southern: OrbatEntry[] = [
  ...mrds([
    ['20th Guards Motor Rifle Division (8th CAA)', KOSTIANTYNIVKA(), 0.6],
    ['150th Motor Rifle Division (8th CAA)', KOSTIANTYNIVKA(-0.1), 0.6],
    ['19th Motor Rifle Division (58th CAA)', ORIKHIV(), 0.6, STANDARD, 'bmp3'],
    ['42nd Guards Motor Rifle Division (58th CAA)', ORIKHIV(0.08), 0.6, STANDARD, 'bmp3'],
    ['70th Motor Rifle Division (18th CAA)', KHERSON(), 0.5, REFURB, 'btr82a'],
    ['71st Motor Rifle Division (58th CAA)', ORIKHIV(-0.1), 0.5, REFURB],
  ]),
  ...mrbs([
    ['34th Guards Mountain Motor Rifle Brigade (49th CAA)', ORIKHIV(0.15), 0.55, STANDARD, 'mtlb'],
    ['205th Motor Rifle Brigade (49th CAA)', KHERSON(0.1), 0.55, STANDARD, 'btr82a'],
    // 51st CAA, the former DNR 1st Army Corps
    ['1st Guards Slavic Motor Rifle Brigade (51st CAA)', POKROVSK(-0.15), 0.55, REFURB, 'bmp1'],
    ['5th Guards Motor Rifle Brigade (51st CAA)', POKROVSK(-0.25), 0.55, REFURB, 'bmp1'],
    ['9th Guards Motor Rifle Brigade (51st CAA)', KOSTIANTYNIVKA(-0.2), 0.5, REFURB, 'bmp1'],
    ['110th Guards Motor Rifle Brigade (51st CAA)', POKROVSK(-0.05), 0.5, REFURB, 'bmp1'],
    ['114th Guards Motor Rifle Brigade (51st CAA)', DOBROPILLIA(-0.1), 0.5, REFURB, 'bmp1'],
    ['132nd Guards Motor Rifle Brigade (51st CAA)', KOSTIANTYNIVKA(0.1), 0.5, REFURB, 'bmp1'],
    // 3rd CAA, the former LNR 2nd Army Corps
    ['2nd Guards Motor Rifle Brigade (3rd CAA)', SIVERSK(), 0.5, REFURB, 'mtlb'],
    ['4th Guards Motor Rifle Brigade (3rd CAA)', SIVERSK(-0.1), 0.5, REFURB, 'mtlb'],
    ['6th Motor Rifle Brigade (3rd CAA)', KOSTIANTYNIVKA(0.2), 0.5, REFURB, 'mtlb'],
    ['7th Motor Rifle Brigade (3rd CAA)', SIVERSK(0.2), 0.45, REFURB, 'mtlb'],
  ]),
  unit(RUS, '126th Coastal Defence Brigade (22nd AC)', 'maneuver', 'brigade', at('Perevalne, Crimea', 45.1, 34.3), scale(NIB_TOE(GARRISON), 0.6), home),
  unit(RUS, '4th Guards Military Base (South Ossetia)', 'maneuver', 'brigade', at('Tskhinvali', 42.23, 43.97), scale(MRB_TOE(GARRISON, 'bmp2'), 0.5), home),
  unit(RUS, '7th Military Base (Abkhazia)', 'maneuver', 'brigade', at('Gudauta', 43.1, 40.62), scale(MRB_TOE(GARRISON, 'bmp2'), 0.45), home),
  unit(RUS, '102nd Military Base (Armenia)', 'maneuver', 'brigade', at('Gyumri', 40.79, 44.1), scale(MRB_TOE(GARRISON, 'bmp2'), 0.6), home),
];

const central: OrbatEntry[] = [
  unit(RUS, '90th Guards Tank Division (CMD)', 'maneuver', 'division', POKROVSK(0.1), scale(TD_TOE(STANDARD), 0.55), deployed),
  ...mrbs([
    ['15th Guards Motor Rifle Brigade (2nd CAA)', POKROVSK(0.05), 0.55, STANDARD, 'mtlb'],
    ['21st Guards Motor Rifle Brigade (2nd CAA)', POKROVSK(0.15), 0.55, STANDARD, 'bmp2'],
    ['30th Motor Rifle Brigade (2nd CAA)', NOVOPAVLIVKA(), 0.55, STANDARD, 'bmp2'],
    ['35th Guards Motor Rifle Brigade (41st CAA)', DOBROPILLIA(), 0.55, STANDARD, 'bmp2'],
    ['74th Guards Motor Rifle Brigade (41st CAA)', DOBROPILLIA(0.08), 0.55, STANDARD, 'bmp2'],
    ['55th Mountain Motor Rifle Brigade (41st CAA)', NOVOPAVLIVKA(0.1), 0.5, STANDARD, 'mtlb'],
  ]),
  unit(RUS, '201st Military Base (Tajikistan)', 'maneuver', 'division', at('Dushanbe', 38.55, 68.8), scale(MRD_TOE(GARRISON, 'bmp2'), 0.35), home),
];

const eastern: OrbatEntry[] = [
  ...mrds([['127th Motor Rifle Division (5th CAA)', HULIAIPOLE(0.1), 0.55, EAST]]),
  ...mrbs([
    ['57th Guards Motor Rifle Brigade (5th CAA)', HULIAIPOLE(), 0.55, EAST],
    ['60th Motor Rifle Brigade (5th CAA)', HULIAIPOLE(-0.05), 0.55, EAST],
    ['36th Guards Motor Rifle Brigade (29th CAA)', NOVOPAVLIVKA(-0.1), 0.55, EAST],
    ['38th Guards Motor Rifle Brigade (35th CAA)', HULIAIPOLE(0.2), 0.55, EAST],
    ['64th Motor Rifle Brigade (35th CAA)', HULIAIPOLE(0.25), 0.5, EAST],
    ['69th Covering Brigade (35th CAA)', HULIAIPOLE(-0.15), 0.5, EAST, 'mtlb'],
    ['37th Guards Motor Rifle Brigade (36th CAA)', NOVOPAVLIVKA(-0.2), 0.55, EAST],
  ]),
  unit(RUS, '5th Guards Tank Brigade (36th CAA)', 'maneuver', 'brigade', NOVOPAVLIVKA(-0.25), scale(TANK_BDE_TOE(EAST), 0.6), deployed),
  ...mrbs([['39th Motor Rifle Brigade (68th AC)', at('Yuzhno-Sakhalinsk', 46.95, 142.73), 0.55, GARRISON, 'btr82a']], home),
  unit(RUS, '18th Machine Gun Artillery Division (68th AC)', 'maneuver', 'division', at('Iturup (nearest map land: southern Sakhalin)', 46.1, 143.9), { t72b: 40, mtlb: 60, '2s19_msta': 18, d30: 18, bm21_grad: 12, strela10: 6, infantry_squad: 90, truck: 200 }, home),
];

const vdv: OrbatEntry[] = [
  unit(RUS, '76th Guards Air Assault Division', 'maneuver', 'division', KURSK(0.1), scale(VDV_DIV_TOE, 0.6), deployed),
  unit(RUS, '98th Guards Airborne Division', 'maneuver', 'division', KOSTIANTYNIVKA(0.3), scale(VDV_DIV_TOE, 0.55), deployed),
  unit(RUS, '106th Guards Airborne Division', 'maneuver', 'division', SIVERSK(0.3), scale(VDV_DIV_TOE, 0.55), deployed),
  unit(RUS, '7th Guards Mountain Air Assault Division', 'maneuver', 'division', ORIKHIV(0.25), scale(VDV_DIV_TOE, 0.6), deployed),
  unit(RUS, '104th Guards Air Assault Division', 'maneuver', 'division', KURSK(0.2), scale(VDV_DIV_TOE, 0.5), deployed),
  unit(RUS, '11th Guards Air Assault Brigade', 'maneuver', 'brigade', KURSK(-0.15), scale(VDV_BDE_TOE, 0.6), deployed),
  unit(RUS, '83rd Guards Air Assault Brigade', 'maneuver', 'brigade', KURSK(-0.2), scale(VDV_BDE_TOE, 0.6), deployed),
  unit(RUS, '31st Guards Air Assault Brigade', 'maneuver', 'brigade', KOSTIANTYNIVKA(0.35), scale(VDV_BDE_TOE, 0.55), deployed),
  unit(RUS, '45th Guards Spetsnaz Brigade (VDV)', 'maneuver', 'brigade', at('Kubinka', 55.6, 36.65), { gaz_tigr: 60, infantry_squad: 60, truck: 80 }, { readiness: 0.7, experience: 0.7 }),
];

const navalInfantry: OrbatEntry[] = [
  unit(RUS, '155th Guards Naval Infantry Brigade (Pacific Fleet)', 'maneuver', 'brigade', KURSK(0.25), scale(NIB_TOE(T80), 0.55), deployed),
  unit(RUS, '40th Naval Infantry Brigade (Pacific Fleet)', 'maneuver', 'brigade', HULIAIPOLE(0.3), scale(NIB_TOE(EAST), 0.55), deployed),
  unit(RUS, '61st Naval Infantry Brigade (Northern Fleet)', 'maneuver', 'brigade', KURSK(-0.25), scale(NIB_TOE(T80), 0.55), deployed),
  unit(RUS, '336th Guards Naval Infantry Brigade (Baltic Fleet)', 'maneuver', 'brigade', KURSK(0.3), scale(NIB_TOE(STANDARD), 0.55), deployed),
  unit(RUS, '810th Guards Naval Infantry Brigade (Black Sea Fleet)', 'maneuver', 'brigade', KURSK(-0.3), scale(NIB_TOE(STANDARD), 0.55), deployed),
  unit(RUS, '177th Naval Infantry Regiment (Caspian Flotilla)', 'maneuver', 'brigade', at('Kaspiysk', 42.88, 47.64), scale(NIB_TOE(GARRISON), 0.4), home),
];

// Army/district fire support. Artillery brigade: 2 SP howitzer bns, 1 heavy, 1 MLRS (IISS MB 2025).
const ARTY_TOE: Kit = { '2s19_msta': 36, '2s7m': 12, '2a65': 18, bm27: 18, infantry_squad: 10, truck: 300 };
const ROCKET_TOE: Kit = { bm30: 18, tos1a: 6, infantry_squad: 6, truck: 120 };
const artillery: OrbatEntry[] = [
  unit(RUS, '9th Guards Artillery Brigade', 'artillery', 'brigade', KUPIANSK(-0.1, 0.5), scale(ARTY_TOE, 0.65), deployed),
  unit(RUS, '288th Artillery Brigade', 'artillery', 'brigade', SIVERSK(0.35), scale(ARTY_TOE, 0.65), deployed),
  unit(RUS, '238th Artillery Brigade', 'artillery', 'brigade', KOSTIANTYNIVKA(0.25), scale(ARTY_TOE, 0.65), deployed),
  unit(RUS, '385th Guards Artillery Brigade', 'artillery', 'brigade', POKROVSK(0.25), scale(ARTY_TOE, 0.65), deployed),
  unit(RUS, '305th Artillery Brigade', 'artillery', 'brigade', HULIAIPOLE(0.35), scale(ARTY_TOE, 0.65), deployed),
  unit(RUS, '291st Artillery Brigade', 'artillery', 'brigade', ORIKHIV(0.3), scale(ARTY_TOE, 0.65), deployed),
  unit(RUS, '244th Artillery Brigade', 'artillery', 'brigade', at('Kaliningrad', 54.71, 20.51), scale(ARTY_TOE, 0.5), home),
  unit(RUS, '79th Guards Rocket Artillery Brigade', 'artillery', 'brigade', LYMAN(0.4), scale(ROCKET_TOE, 0.8), deployed),
  unit(RUS, '439th Guards Rocket Artillery Brigade', 'artillery', 'brigade', ORIKHIV(0.4), scale(ROCKET_TOE, 0.8), deployed),
  unit(RUS, '1st Guards Flamethrower Regiment (RChBZ)', 'artillery', 'brigade', POKROVSK(0.35), { tos1a: 12, tos2: 6, infantry_squad: 8, truck: 60 }, deployed),
];

// Iskander-M brigade: 3 battalions x 4 TELs (IISS MB 2025). Reloads are an estimate:
// Ukrainian intelligence put 9M723 output near 60 a month in 2025.
const iskander = (name: string, base: Base): OrbatEntry =>
  unit(RUS, name, 'missile', 'brigade', base, { iskander_m_tel: 12, truck: 60 }, { readiness: 0.75, experience: 0.7, extraMagazine: { '9m723': 24, '9m728': 12 } });
const missiles: OrbatEntry[] = [
  iskander('26th Missile Brigade', at('Luga', 58.73, 29.85)),
  iskander('152nd Guards Missile Brigade', at('Chernyakhovsk', 54.63, 21.81)),
  iskander('112th Guards Missile Brigade', at('Shuya', 56.85, 41.38)),
  iskander('448th Missile Brigade', at('Kursk', 51.73, 36.19)),
  iskander('1st Guards Missile Brigade', at('Molkino, Krasnodar', 44.98, 38.95)),
  iskander('12th Missile Brigade', at('Mozdok', 43.75, 44.65)),
  iskander('92nd Missile Brigade', at('Totskoye', 52.52, 52.75)),
  iskander('119th Missile Brigade', at('Yelansky, Sverdlovsk', 56.92, 62.9)),
  iskander('3rd Guards Missile Brigade', at('Gornyy, Zabaykalsky', 51.75, 115.6)),
  iskander('20th Guards Missile Brigade', at('Spassk-Dalny', 44.6, 132.8)),
  iskander('103rd Missile Brigade', at('Drovyanaya, Zabaykalsky', 51.6, 113.0)),
  iskander('107th Missile Brigade', at('Birobidzhan', 48.79, 132.92)),
];

export const rusGround: OrbatEntry[] = [...leningrad, ...moscow, ...southern, ...central, ...eastern, ...vdv, ...navalInfantry, ...artillery, ...missiles];

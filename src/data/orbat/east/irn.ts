import type { OrbatEntry } from '../types';
import { at, merge, mix, unit, type Base, type Kit } from './build';

/*
 * Iran, late 2025: the Artesh (regular forces) and the IRGC.
 *
 * Baselines are IISS Military Balance 2025 (MBT ~1,500; ~19 submarines incl. Ghadir midgets).
 * Degradation from the October 2024 Israeli strikes (all four S-300PMU2 batteries) and the
 * June 2025 Twelve-Day War is applied: Israel reported destroying or disabling roughly two
 * thirds of ~400 ballistic-missile launchers and struck F-14s at Isfahan and tankers at
 * Mashhad, and Iran fired ~550 ballistic missiles and ~1,000 drones. Surviving launcher and
 * missile stocks are estimates; division garrisons are approximate.
 */

const IRN = 'IRN';
const ARTESH = { readiness: 0.5, experience: 0.3 };
const IRGC = { readiness: 0.6, experience: 0.45 };

const ARMOR_TANKS: Kit = { t72s: 0.35, chieftain: 0.15, m60a1: 0.1, t55: 0.2, zulfiqar: 0.1, karrar: 0.1 };
const INF_TANKS: Kit = { t55: 0.5, m47m: 0.3, t62m: 0.2 };
const IRGC_TANKS: Kit = { t72s: 0.4, t55: 0.4, karrar: 0.2 };

const ARMORED_DIV: Kit = merge(mix(200, ARMOR_TANKS), { bmp2: 80, m113: 60, m109: 36, d30: 36, bm21_grad: 18, infantry_squad: 400, truck: 800 });
const INFANTRY_DIV: Kit = merge(mix(60, INF_TANKS), { m113: 60, d30: 54, bm21_grad: 18, infantry_squad: 700, truck: 700 });
const IRGC_DIV: Kit = merge(mix(50, IRGC_TANKS), { bmp2: 40, d30: 36, bm21_grad: 18, infantry_squad: 800, truck: 600 });

const div = (name: string, base: Base, kit: Kit, extra = ARTESH): OrbatEntry => unit(IRN, name, 'maneuver', 'division', base, kit, extra);

const ground: OrbatEntry[] = [
  div('16th Armoured Division', at('Qazvin', 36.27, 50.0), ARMORED_DIV),
  div('81st Armoured Division', at('Kermanshah', 34.31, 47.07), ARMORED_DIV),
  div('88th Armoured Division', at('Zahedan', 29.5, 60.86), ARMORED_DIV),
  div('92nd Armoured Division', at('Ahvaz', 31.32, 48.67), ARMORED_DIV),
  div('21st Infantry Division', at('Tabriz', 38.08, 46.29), INFANTRY_DIV),
  div('28th Infantry Division', at('Sanandaj', 35.31, 47.0), INFANTRY_DIV),
  div('64th Infantry Division', at('Urmia', 37.55, 45.08), INFANTRY_DIV),
  div('77th Infantry Division', at('Mashhad', 36.3, 59.6), INFANTRY_DIV),
  div('84th Infantry Division', at('Khorramabad', 33.49, 48.36), INFANTRY_DIV),
  div('30th Infantry Division', at('Gorgan', 36.84, 54.44), INFANTRY_DIV),
  unit(IRN, '55th Airborne Brigade', 'maneuver', 'brigade', at('Shiraz', 29.6, 52.53), { infantry_squad: 300, d30: 12, truck: 150 }, { ...ARTESH, airborne: true }),
  unit(IRN, '65th Special Forces Airborne Brigade', 'maneuver', 'brigade', at('Tehran west', 35.7, 51.2), { infantry_squad: 200, truck: 80 }, { readiness: 0.65, experience: 0.4, airborne: true }),
  div('8th Najaf Ashraf Armoured Division (IRGC)', at('Najafabad', 32.63, 51.37), merge(mix(120, IRGC_TANKS), { bmp2: 80, m109: 18, bm21_grad: 18, infantry_squad: 500, truck: 600 }), IRGC),
  div('27th Mohammad Rasulullah Division (IRGC)', at('Tehran', 35.69, 51.39), IRGC_DIV, IRGC),
  div('31st Ashura Division (IRGC)', at('Tabriz IRGC', 38.05, 46.4), IRGC_DIV, IRGC),
  div('41st Tharallah Division (IRGC)', at('Kerman', 30.28, 57.08), IRGC_DIV, IRGC),
  div('14th Imam Hossein Division (IRGC)', at('Isfahan', 32.65, 51.67), IRGC_DIV, IRGC),
  div('25th Karbala Division (IRGC)', at('Sari', 36.56, 53.06), IRGC_DIV, IRGC),
  div('17th Ali ibn Abi Talib Division (IRGC)', at('Qom', 34.64, 50.88), IRGC_DIV, IRGC),
  div('Quds Base (IRGC Ground Force)', at('Zahedan IRGC', 29.45, 60.9), IRGC_DIV, IRGC),
];

// IRGC Aerospace Force missile bases. Pre-June-2025 estimates were roughly 2,000-3,000 ballistic
// missiles and ~400 launchers (IISS Military Balance 2025; CSIS Missile Threat; IDF statements);
// Israel reported destroying or disabling about two thirds of the launchers and Iran fired ~550
// missiles. By 2027 Iran is assumed to have rebuilt to ~200 launchers (~130 MRBM, ~70 SRBM) and
// ~2,000 ballistic missiles (~1,100 MRBM). Each type sits on its own TEL; split across bases is an
// estimate (Yazd and the western bases were the main 2024-25 launch areas).
const IRGC_ASF = { readiness: 0.5, experience: 0.55 };
const missileBase = (name: string, base: Base, tels: Kit, reloads: Kit): OrbatEntry =>
  unit(IRN, name, 'missile', 'brigade', base, { ...tels, truck: 60 }, { ...IRGC_ASF, extraMagazine: reloads });
const missiles: OrbatEntry[] = [
  missileBase('Imam Ali Missile Base', at('Khorramabad missile base', 33.4, 48.3), { shahab_3_tel: 12, kheibar_shekan_tel: 10 }, { ghadr_110: 100, kheibar_shekan: 90 }),
  // The land-attack cruise TELs are their own unit in the west. Hoveyzeh (1,350 km) and Paveh (1,650 km) reach Israel only
  // from western Iran, as the ~30 cruise missiles of 13-14 Apr 2024 did (IDF); from Haji Abad the nearest Israeli cell is
  // ~1,940 km and the US bases in reach stand on neutral soil. A brigade fires one munition a tick, so cruise TELs that
  // share a base with ballistic ones never fire.
  missileBase('Cruise Missile Group (Hoveyzeh, Paveh)', at('Khorramabad', 33.5, 48.35), { hoveyzeh_tel: 6 }, { hoveyzeh: 40 }),
  missileBase('Kermanshah Missile Base', at('Panj Pelleh, Kermanshah', 34.4, 47.0), { emad_tel: 12, fateh_110_tel: 12 }, { emad: 100, fateh_110: 120 }),
  missileBase('Tabriz Missile Base', at('Tabriz missile base', 38.0, 46.4), { zolfaghar_tel: 14, kheibar_shekan_tel: 10 }, { zolfaghar: 120, kheibar_shekan: 80 }),
  missileBase('Shiraz Missile Base', at('Shiraz missile base', 29.65, 52.4), { kheibar_shekan_tel: 8, fattah_tel: 10, fateh_110_tel: 10 }, { kheibar_shekan: 70, fattah_1: 60, fateh_110: 100 }),
  missileBase('Isfahan Missile Base', at('Isfahan missile base', 32.75, 51.85), { shahab_3_tel: 10, emad_tel: 8, fateh_110_tel: 8 }, { ghadr_110: 90, emad: 60, fateh_110: 100 }),
  missileBase('Yazd Missile Base', at('Yazd missile base', 31.9, 54.3), { shahab_3_tel: 8, emad_tel: 5, kheibar_shekan_tel: 7, fattah_tel: 8, zolfaghar_tel: 10 }, { ghadr_110: 50, emad: 40, kheibar_shekan: 50, fattah_1: 50, zolfaghar: 120 }),
  missileBase('Haji Abad Missile Base', at('Haji Abad', 28.3, 55.9), { sejjil_tel: 6, khorramshahr_tel: 5 }, { sejjil: 50, khorramshahr: 40 }),
  missileBase('Semnan Missile Base', at('Semnan', 35.24, 53.92), { sejjil_tel: 6, khorramshahr_tel: 5 }, { sejjil: 40, khorramshahr: 30 }),
  missileBase('Hormozgan Coastal Missile Brigade', at('Bandar Abbas coastal', 27.2, 56.1), { khalij_fars_tel: 12, fateh_110_tel: 6, noor_asm_launcher: 30 }, { khalij_fars: 100, fateh_110: 60 }),
];

const drones: OrbatEntry[] = [
  unit(IRN, 'IRGC ASF Drone Command Kashan', 'missile', 'brigade', at('Kashan', 33.9, 51.6), { shahed_136: 800, shahed_129: 12, truck: 60 }, IRGC_ASF),
  unit(IRN, 'IRGC ASF Drone Base Chabahar', 'missile', 'battalion', at('Chabahar', 25.3, 60.6), { shahed_136: 300, mohajer_6: 10, truck: 25 }, IRGC_ASF),
  unit(IRN, 'IRGC ASF Drone Base Bandar Abbas', 'missile', 'battalion', at('Bandar Abbas drone base', 27.25, 56.3), { shahed_136: 400, mohajer_6: 12, truck: 30 }, IRGC_ASF),
  unit(IRN, 'Artesh Drone Command Isfahan', 'missile', 'battalion', at('Isfahan drone base', 32.5, 51.5), { shahed_136: 300, mohajer_6: 12, truck: 25 }, ARTESH),
];

// Khatam al-Anbiya Air Defence HQ, heavily degraded: no surviving S-300PMU2 is modelled.
const AD = { readiness: 0.35, experience: 0.35 };
const airDefence: OrbatEntry[] = [
  unit(IRN, 'Tehran Air Defence Sector', 'air_defense', 'brigade', at('Tehran AD', 35.75, 51.45), { bavar373_launcher: 4, khordad15_launcher: 6, tor_m1: 8, hawk_launcher: 8 }, AD),
  unit(IRN, 'Isfahan Air Defence Sector', 'air_defense', 'brigade', at('Isfahan AD', 32.6, 51.8), { khordad15_launcher: 4, tor_m1: 6, hawk_launcher: 6 }, AD),
  unit(IRN, 'Bushehr Air Defence Sector', 'air_defense', 'brigade', at('Bushehr AD', 29.1, 50.9), { bavar373_launcher: 2, tor_m1: 6, hawk_launcher: 6 }, AD),
  unit(IRN, 'Southern Air Defence Sector', 'air_defense', 'brigade', at('Bandar Abbas AD', 27.2, 56.35), { khordad15_launcher: 4, hawk_launcher: 8, s200_launcher: 4 }, AD),
];

const IRIAF = { readiness: 0.45, experience: 0.3 };
const air = (name: string, base: Base, equipment: Kit): OrbatEntry => unit(IRN, name, 'air_wing', 'wing', base, equipment, IRIAF);
const airForce: OrbatEntry[] = [
  air('TFB-2 Tabriz', at('Tabriz air base', 38.13, 46.24), { f5e: 20, mig29: 8 }),
  air('TFB-3 Hamadan', at('Hamadan Nojeh', 35.21, 48.65), { f4e: 30 }),
  air('TFB-4 Dezful', at('Dezful Vahdati', 32.43, 48.4), { f5e: 30 }),
  air('TFB-6 Bushehr', at('Bushehr air base', 29.1, 50.83), { f4e: 15 }),
  air('TFB-7 Shiraz', at('Shiraz air base', 29.54, 52.59), { su24mk: 24, su22: 16 }),
  air('TFB-8 Isfahan', at('Isfahan Shahid Babaei', 32.62, 51.7), { f14a: 28 }),
  air('TFB-9 Bandar Abbas', at('Bandar Abbas air base', 27.22, 56.38), { f4e: 10, j7: 12 }),
  air('TFB-14 Mashhad', at('Mashhad air base', 36.23, 59.64), { mig29: 18, j7: 12 }),
  air('TFB-5 Omidiyeh', at('Omidiyeh', 30.84, 49.53), { j7: 12 }),
  air('TFB-10 Konarak', at('Konarak', 25.44, 60.38), { f4e: 10 }),
  air('IRGC Aerospace Force Air Wing', at('Shiraz IRGC air', 29.6, 52.7), { su22: 10 }),
  air('IRIAF Transport and Tanker Wing', at('Mehrabad', 35.69, 51.31), { il76: 4, c130: 12 }),
  unit(IRN, 'Artesh Army Aviation', 'air_wing', 'wing', at('Isfahan Havanirooz', 32.75, 51.86), { ah1j: 30, mi171: 20 }, IRIAF),
];

const IRIN = { readiness: 0.45, experience: 0.3 };
const IRGCN = { readiness: 0.6, experience: 0.45 };
const navy: OrbatEntry[] = [
  unit(IRN, 'Artesh Navy 1st Naval District', 'surface_group', 'flotilla', at('Bandar Abbas naval base', 27.14, 56.2), { moudge: 3, alvand: 3, bayandor: 2, missile_boat: 10 }, IRIN),
  unit(IRN, 'Artesh Navy 2nd Naval District', 'surface_group', 'flotilla', at('Jask', 25.64, 57.77), { moudge: 1, missile_boat: 4 }, IRIN),
  unit(IRN, 'Artesh Navy Submarine Flotilla', 'submarine', 'flotilla', at('Bandar Abbas submarine base', 27.13, 56.25), { kilo_877: 3, fateh_sub: 1, nahang: 1, ghadir: 14 }, IRIN),
  unit(IRN, 'IRGCN 1st Naval District', 'surface_group', 'flotilla', at('Bandar Abbas IRGCN', 27.18, 56.28), { shahid_soleimani: 2, missile_boat: 25, fast_attack_craft: 120 }, IRGCN),
  unit(IRN, 'IRGCN Qeshm-Larak Group', 'surface_group', 'flotilla', at('Qeshm', 26.95, 56.27), { missile_boat: 15, fast_attack_craft: 100 }, IRGCN),
  unit(IRN, 'IRGCN 2nd Naval District', 'surface_group', 'flotilla', at('Bushehr IRGCN', 28.97, 50.84), { shahid_soleimani: 1, missile_boat: 15, fast_attack_craft: 80 }, IRGCN),
  unit(IRN, 'IRGCN Abu Musa Garrison', 'missile', 'battalion', at('Bandar Lengeh (Abu Musa support)', 26.56, 54.88), { noor_asm_launcher: 12, fast_attack_craft: 20, infantry_squad: 40 }, IRGCN),
];

export const irn: OrbatEntry[] = [...ground, ...missiles, ...drones, ...airDefence, ...airForce, ...navy];

/**
 * Ground forces: tanks, infantry fighting vehicles, carriers, reconnaissance,
 * artillery, rocket artillery, anti-tank teams, infantry, engineers, ground
 * air defense and land logistics.
 *
 * FIREPOWER CALIBRATION (applies to every platform file)
 *
 * firepower[tc] is the expected number of enemy platforms of target class tc
 * destroyed or put out of action, per platform, per hour of engaged combat,
 * against a peer of average protection, before the combat system applies
 * terrain, posture, entrenchment, supply and morale.
 *
 * Anchor: a modern MBT against armor = 0.05. A 30-tank battalion engaged for
 * 8 hours of high-intensity fighting then removes ~12 armored vehicles, about a
 * third of an opposing battalion. That matches Dupuy's QJM daily attrition
 * rates for armor (roughly 5-15% per day at division level) once the day's
 * losses are concentrated into the few hours a unit is actually engaged, and
 * the magnitude of 1973 Golan and 1991 Medina Ridge exchanges (estimate).
 *
 * Every class baseline (CLASS_FIREPOWER in build.ts) is set relative to that
 * anchor by these rules:
 *  - Against armor: MBT 0.05 > ATGM team 0.04 > IFV 0.02 > recon 0.008 >
 *    APC 0.004 > rifle squad 0.003. An MBT is ~2.5x an IFV.
 *  - Artillery dominates infantry: SP howitzer 0.12, MLRS 0.2 per launcher,
 *    against 0.05 for an MBT and 0.02 for a squad. Artillery caused most
 *    casualties in both world wars and ~60-70% in Ukraine 2022-23 (RUSI).
 *  - Fighters against aircraft 0.3, attack helicopters against armor 0.2,
 *    destroyers against missiles 0.3.
 *  - A row's `q` scales its class baseline for generation, fire control,
 *    active protection and crew quality. q = 1.0 is a modern in-service type
 *    such as Leopard 2A6 or M109A6. Range ~0.35 (T-55) to ~1.6 (F-22 air-to-air).
 *
 * Firepower is organic fire only. Missiles, shells and bombs in `loadout` are
 * also spent by the strike and air-defense systems with their own pk.
 *
 * Air-defense rows are single launchers. Cost and crew include a pro-rata share
 * of the battery radar and fire control; engagementChannels is the battery's
 * simultaneous target channels divided by its launchers, rounded up.
 *
 * Infantry and engineer squads are raised from manpower rather than built in
 * factories, so their producers list is empty.
 */
import { toPlatform, type PlatformSpec } from './build';
import type { MunitionKey } from './munitions';

const tanks: PlatformSpec<MunitionKey>[] = [
  // M1A2 SEPv3: FY2023 upgrade ~$10.9M (Army P-1); gas turbine burn ~60 gal/h in operations.
  { id: 'm1a2_sepv3', name: 'M1A2 SEPv3 Abrams', cls: 'mbt', producers: ['USA'], inService: 2020, unitCostUsdM: 10.9, speedKph: 45, rangeKm: 426, fuelTph: 0.22, armor: 0.85, q: 1.25, load: { apfsds_120: 26, he_120: 16 } },
  { id: 'm1a1_sa', name: 'M1A1 SA Abrams', cls: 'mbt', producers: ['USA'], inService: 2008, unitCostUsdM: 6, speedKph: 45, rangeKm: 426, fuelTph: 0.22, armor: 0.78, q: 1.05, load: { apfsds_120: 26, he_120: 14 } },
  { id: 'leopard2a7', name: 'Leopard 2A7/2A7V', cls: 'mbt', producers: ['DEU'], inService: 2014, unitCostUsdM: 15, speedKph: 45, rangeKm: 450, fuelTph: 0.17, armor: 0.82, q: 1.2, load: { apfsds_120: 27, he_120: 15 } },
  { id: 'leopard2a6', name: 'Leopard 2A6', cls: 'mbt', producers: ['DEU'], inService: 2001, unitCostUsdM: 8, speedKph: 45, rangeKm: 450, fuelTph: 0.17, armor: 0.78, q: 1.1, load: { apfsds_120: 27, he_120: 15 } },
  { id: 'leopard2a4', name: 'Leopard 2A4', cls: 'mbt', producers: [], inService: 1985, unitCostUsdM: 4, speedKph: 45, rangeKm: 450, fuelTph: 0.17, armor: 0.6, q: 0.9, load: { apfsds_120: 30, he_120: 12 } },
  { id: 'challenger3', name: 'Challenger 3', cls: 'mbt', producers: ['GBR'], inService: 2027, unitCostUsdM: 7, speedKph: 40, rangeKm: 550, fuelTph: 0.18, armor: 0.85, q: 1.2, load: { apfsds_120: 20, he_120: 12 } },
  { id: 'challenger2', name: 'Challenger 2', cls: 'mbt', producers: [], inService: 1998, unitCostUsdM: 7, speedKph: 40, rangeKm: 450, fuelTph: 0.18, armor: 0.75, q: 1.0, load: { apfsds_120: 25, he_120: 24 } },
  { id: 'leclerc', name: 'Leclerc XLR', cls: 'mbt', producers: ['FRA'], inService: 1992, unitCostUsdM: 10, crew: 3, speedKph: 50, rangeKm: 550, fuelTph: 0.2, armor: 0.75, q: 1.1, load: { apfsds_120: 25, he_120: 15 } },
  { id: 'k2', name: 'K2 Black Panther', cls: 'mbt', producers: ['KOR', 'POL'], inService: 2014, unitCostUsdM: 8.5, crew: 3, speedKph: 50, rangeKm: 450, fuelTph: 0.16, armor: 0.8, q: 1.2, load: { apfsds_120: 25, he_120: 15 } },
  { id: 'k1a2', name: 'K1A2', cls: 'mbt', producers: ['KOR'], inService: 2014, unitCostUsdM: 4, speedKph: 45, rangeKm: 450, fuelTph: 0.16, armor: 0.7, q: 1.0, load: { apfsds_120: 20, he_120: 12 } },
  // Merkava Mk4 Barak/Windbreaker: Trophy APS defeats most ATGMs (IDF 2014, 2023-24).
  { id: 'merkava4', name: 'Merkava Mk 4M', cls: 'mbt', producers: ['ISR'], inService: 2004, unitCostUsdM: 6, speedKph: 45, rangeKm: 500, fuelTph: 0.18, armor: 0.87, q: 1.2, load: { apfsds_120: 30, he_120: 16, gun_launched_atgm: 2 } },
  { id: 'type10', name: 'Type 10', cls: 'mbt', producers: ['JPN'], inService: 2012, unitCostUsdM: 8.5, crew: 3, speedKph: 50, rangeKm: 440, fuelTph: 0.14, armor: 0.75, q: 1.15, load: { apfsds_120: 14, he_120: 8 } },
  { id: 'type90', name: 'Type 90', cls: 'mbt', producers: [], inService: 1990, unitCostUsdM: 7, crew: 3, speedKph: 50, rangeKm: 350, fuelTph: 0.17, armor: 0.7, q: 1.0, load: { apfsds_120: 12, he_120: 6 } },
  { id: 'altay', name: 'Altay', cls: 'mbt', producers: ['TUR'], inService: 2025, unitCostUsdM: 10, speedKph: 45, rangeKm: 450, fuelTph: 0.17, armor: 0.8, q: 1.1, load: { apfsds_120: 25, he_120: 15 } },
  { id: 'arjun_mk1a', name: 'Arjun Mk 1A', cls: 'mbt', producers: ['IND'], inService: 2021, unitCostUsdM: 7.5, speedKph: 40, rangeKm: 450, fuelTph: 0.2, armor: 0.75, q: 1.0, load: { apfsds_120: 25, he_120: 14 } },
  { id: 't90m', name: 'T-90M Proryv', cls: 'mbt', producers: ['RUS'], inService: 2020, unitCostUsdM: 4.5, crew: 3, speedKph: 45, rangeKm: 550, fuelTph: 0.12, armor: 0.75, q: 1.05, load: { apfsds_125: 16, he_125: 22, gun_launched_atgm: 3 } },
  { id: 't90a', name: 'T-90A', cls: 'mbt', producers: ['RUS'], inService: 2004, unitCostUsdM: 3, crew: 3, speedKph: 45, rangeKm: 550, fuelTph: 0.12, armor: 0.7, q: 0.95, load: { apfsds_125: 16, he_125: 22, gun_launched_atgm: 3 } },
  { id: 't90s', name: 'T-90S Bhishma', cls: 'mbt', producers: ['IND', 'RUS'], inService: 2003, unitCostUsdM: 3, crew: 3, speedKph: 45, rangeKm: 550, fuelTph: 0.12, armor: 0.68, q: 0.9, load: { apfsds_125: 16, he_125: 22, gun_launched_atgm: 3 } },
  // T-72B3: ~2,000 lost by Russia in Ukraine 2022-24 (Oryx visually confirmed); ammo stowage under the turret.
  { id: 't72b3', name: 'T-72B3M', cls: 'mbt', producers: ['RUS'], inService: 2016, unitCostUsdM: 2.5, crew: 3, speedKph: 45, rangeKm: 500, fuelTph: 0.12, armor: 0.62, q: 0.85, load: { apfsds_125: 16, he_125: 22 } },
  { id: 't72b', name: 'T-72B / T-72AV', cls: 'mbt', producers: [], inService: 1985, unitCostUsdM: 1.5, crew: 3, speedKph: 40, rangeKm: 450, fuelTph: 0.12, armor: 0.55, q: 0.7, load: { apfsds_125: 16, he_125: 22 } },
  { id: 't72m1', name: 'T-72M1 / T-72 export', cls: 'mbt', producers: [], inService: 1982, unitCostUsdM: 1, crew: 3, speedKph: 40, rangeKm: 450, fuelTph: 0.12, armor: 0.45, q: 0.6, load: { apfsds_125: 16, he_125: 22 } },
  { id: 'pt91', name: 'PT-91 Twardy', cls: 'mbt', producers: ['POL'], inService: 1995, unitCostUsdM: 2.5, crew: 3, speedKph: 45, rangeKm: 650, fuelTph: 0.12, armor: 0.55, q: 0.75, load: { apfsds_125: 16, he_125: 22 } },
  { id: 't80bvm', name: 'T-80BVM', cls: 'mbt', producers: ['RUS'], inService: 2018, unitCostUsdM: 3.5, crew: 3, speedKph: 50, rangeKm: 500, fuelTph: 0.25, armor: 0.65, q: 0.9, load: { apfsds_125: 16, he_125: 22, gun_launched_atgm: 3 } },
  { id: 't80u', name: 'T-80U', cls: 'mbt', producers: [], inService: 1985, unitCostUsdM: 2.5, crew: 3, speedKph: 50, rangeKm: 400, fuelTph: 0.25, armor: 0.62, q: 0.85, load: { apfsds_125: 16, he_125: 22, gun_launched_atgm: 3 } },
  { id: 't64bv', name: 'T-64BV mod. 2017', cls: 'mbt', producers: ['UKR'], inService: 2017, unitCostUsdM: 1.5, crew: 3, speedKph: 45, rangeKm: 500, fuelTph: 0.12, armor: 0.55, q: 0.75, load: { apfsds_125: 16, he_125: 20 } },
  { id: 't84_oplot', name: 'T-84 Oplot-M', cls: 'mbt', producers: ['UKR'], inService: 2009, unitCostUsdM: 5, crew: 3, speedKph: 45, rangeKm: 500, fuelTph: 0.13, armor: 0.7, q: 0.95, load: { apfsds_125: 16, he_125: 20, gun_launched_atgm: 3 } },
  { id: 't14', name: 'T-14 Armata', cls: 'mbt', producers: ['RUS'], inService: 2022, unitCostUsdM: 8, crew: 3, speedKph: 50, rangeKm: 500, fuelTph: 0.17, armor: 0.85, q: 1.15, load: { apfsds_125: 16, he_125: 16, gun_launched_atgm: 4 } },
  { id: 't62m', name: 'T-62M/MV', cls: 'mbt', producers: [], inService: 1983, unitCostUsdM: 0.8, speedKph: 40, rangeKm: 450, fuelTph: 0.12, armor: 0.35, q: 0.5, load: { apfsds_100: 40 } },
  { id: 't55', name: 'T-55 / Type 59', cls: 'mbt', producers: [], inService: 1958, unitCostUsdM: 0.5, speedKph: 35, rangeKm: 400, fuelTph: 0.1, armor: 0.25, q: 0.35, load: { apfsds_100: 43 } },
  { id: 'type99a', name: 'Type 99A (ZTZ-99A)', cls: 'mbt', producers: ['CHN'], inService: 2011, unitCostUsdM: 6, crew: 3, speedKph: 50, rangeKm: 500, fuelTph: 0.17, armor: 0.8, q: 1.1, load: { apfsds_125: 18, he_125: 20, gun_launched_atgm: 3 } },
  { id: 'type96b', name: 'Type 96B (ZTZ-96B)', cls: 'mbt', producers: ['CHN'], inService: 2016, unitCostUsdM: 2.5, crew: 3, speedKph: 45, rangeKm: 450, fuelTph: 0.13, armor: 0.6, q: 0.85, load: { apfsds_125: 18, he_125: 20 } },
  { id: 'type15', name: 'Type 15 light tank (ZTQ-15)', cls: 'mbt', producers: ['CHN'], inService: 2018, unitCostUsdM: 3, crew: 3, speedKph: 55, rangeKm: 450, fuelTph: 0.1, armor: 0.35, q: 0.75, load: { apfsds_105: 38 } },
  { id: 'vt4', name: 'VT-4 (MBT-3000)', cls: 'mbt', producers: ['CHN'], inService: 2014, unitCostUsdM: 5, crew: 3, speedKph: 50, rangeKm: 500, fuelTph: 0.14, armor: 0.72, q: 1.0, load: { apfsds_125: 18, he_125: 20, gun_launched_atgm: 3 } },
  { id: 'al_khalid', name: 'Al-Khalid', cls: 'mbt', producers: ['PAK', 'CHN'], inService: 2001, unitCostUsdM: 4, crew: 3, speedKph: 45, rangeKm: 450, fuelTph: 0.14, armor: 0.6, q: 0.85, load: { apfsds_125: 18, he_125: 20 } },
  { id: 'karrar', name: 'Karrar', cls: 'mbt', producers: ['IRN'], inService: 2020, unitCostUsdM: 2.5, crew: 3, speedKph: 45, rangeKm: 450, fuelTph: 0.13, armor: 0.55, q: 0.75, load: { apfsds_125: 18, he_125: 20 } },
  { id: 'm60t', name: 'M60T Sabra', cls: 'mbt', producers: ['TUR', 'ISR'], inService: 2010, unitCostUsdM: 2, speedKph: 40, rangeKm: 450, fuelTph: 0.15, armor: 0.5, q: 0.7, load: { apfsds_120: 25, he_120: 17 } },
  { id: 'm60a3', name: 'M60A3', cls: 'mbt', producers: [], inService: 1978, unitCostUsdM: 1, speedKph: 40, rangeKm: 480, fuelTph: 0.15, armor: 0.35, q: 0.5, load: { apfsds_105: 63 } },
  { id: 'pokpung_ho', name: 'Pokpung-ho / Chonma-20', cls: 'mbt', producers: ['PRK'], inService: 2002, unitCostUsdM: 2, crew: 3, speedKph: 40, rangeKm: 400, fuelTph: 0.13, armor: 0.45, q: 0.6, load: { apfsds_125: 18, he_125: 18 } },
  { id: 'chonma_ho', name: "Ch'onma-ho", cls: 'mbt', producers: [], inService: 1980, unitCostUsdM: 0.6, speedKph: 35, rangeKm: 400, fuelTph: 0.12, armor: 0.3, q: 0.45, load: { apfsds_100: 40 } },
  { id: 'centauro2', name: 'Centauro II 120 mm', cls: 'recon', producers: ['ITA'], inService: 2023, unitCostUsdM: 7, crew: 4, speedKph: 80, rangeKm: 800, fuelTph: 0.07, armor: 0.3, fp: { armor: 0.035 }, load: { apfsds_120: 20, he_120: 11 } },
];

const ifvs: PlatformSpec<MunitionKey>[] = [
  { id: 'm2a4_bradley', name: 'M2A4 Bradley', cls: 'ifv', producers: ['USA'], inService: 2022, unitCostUsdM: 4.5, speedKph: 45, rangeKm: 400, fuelTph: 0.12, armor: 0.4, q: 1.1, capacity: { troops: 6 }, load: { tow2b: 7, round_25mm: 90 } },
  { id: 'm2a2_ods', name: 'M2A2 ODS Bradley', cls: 'ifv', producers: [], inService: 1998, unitCostUsdM: 2.5, speedKph: 45, rangeKm: 400, fuelTph: 0.12, armor: 0.35, q: 0.95, capacity: { troops: 6 }, load: { tow2b: 7, round_25mm: 90 } },
  { id: 'cv90', name: 'CV90 Mk IV (CV9035/CV9030)', cls: 'ifv', crew: 11, producers: ['SWE', 'NOR'], inService: 2020, unitCostUsdM: 6, speedKph: 50, rangeKm: 600, fuelTph: 0.12, armor: 0.45, q: 1.1, capacity: { troops: 8 }, load: { round_30mm: 20, spike_lr2: 2 } },
  { id: 'puma', name: 'Puma S1', cls: 'ifv', producers: ['DEU'], inService: 2015, unitCostUsdM: 14, speedKph: 50, rangeKm: 600, fuelTph: 0.14, armor: 0.55, q: 1.15, capacity: { troops: 6 }, load: { round_30mm: 40, spike_lr2: 2 } },
  { id: 'lynx_kf41', name: 'Lynx KF41', cls: 'ifv', crew: 11, producers: ['DEU', 'HUN'], inService: 2022, unitCostUsdM: 8, speedKph: 50, rangeKm: 500, fuelTph: 0.13, armor: 0.5, q: 1.1, capacity: { troops: 8 }, load: { round_30mm: 20, spike_lr2: 2 } },
  { id: 'marder1a3', name: 'Marder 1A3', cls: 'ifv', producers: [], inService: 1989, unitCostUsdM: 1.5, speedKph: 45, rangeKm: 500, fuelTph: 0.11, armor: 0.25, q: 0.75, capacity: { troops: 6 }, load: { milan: 4, round_25mm: 50 } },
  { id: 'warrior', name: 'Warrior', cls: 'ifv', crew: 10, producers: [], inService: 1988, unitCostUsdM: 2, speedKph: 45, rangeKm: 660, fuelTph: 0.11, armor: 0.35, q: 0.85, capacity: { troops: 7 }, load: { round_30mm: 25 } },
  { id: 'vbci', name: 'VBCI', cls: 'ifv', crew: 11, producers: ['FRA'], inService: 2008, unitCostUsdM: 4, speedKph: 70, rangeKm: 750, fuelTph: 0.07, armor: 0.35, q: 0.95, capacity: { troops: 9 }, load: { round_25mm: 40, mmp: 2 } },
  { id: 'ascod', name: 'ASCOD Pizarro / Ulan', cls: 'ifv', crew: 11, producers: ['ESP', 'AUT'], inService: 2002, unitCostUsdM: 4, speedKph: 45, rangeKm: 600, fuelTph: 0.12, armor: 0.35, q: 0.95, capacity: { troops: 8 }, load: { round_30mm: 20 } },
  { id: 'dardo', name: 'Dardo', cls: 'ifv', producers: ['ITA'], inService: 2002, unitCostUsdM: 3, speedKph: 45, rangeKm: 500, fuelTph: 0.11, armor: 0.3, q: 0.9, capacity: { troops: 6 }, load: { round_25mm: 40, spike_lr2: 2 } },
  { id: 'stryker_dragoon', name: 'Stryker XM1296 Dragoon', cls: 'ifv', producers: ['USA'], inService: 2018, unitCostUsdM: 5, speedKph: 80, rangeKm: 500, fuelTph: 0.07, armor: 0.3, q: 0.95, capacity: { troops: 7 }, load: { round_30mm: 40, javelin: 2 } },
  { id: 'k21', name: 'K21 KNIFV', cls: 'ifv', crew: 12, producers: ['KOR'], inService: 2009, unitCostUsdM: 3.5, speedKph: 50, rangeKm: 450, fuelTph: 0.12, armor: 0.35, q: 1.0, capacity: { troops: 9 }, load: { round_30mm: 30, raybolt: 2 } },
  { id: 'type89_ifv', name: 'Type 89 FV', cls: 'ifv', producers: [], inService: 1989, unitCostUsdM: 6, speedKph: 45, rangeKm: 400, fuelTph: 0.11, armor: 0.3, q: 0.85, capacity: { troops: 7 }, load: { round_30mm: 30 } },
  // BMP-3: 100 mm gun-launcher plus 30 mm coaxial; roof-exposed ammunition makes it catastrophic when penetrated.
  { id: 'bmp3', name: 'BMP-3', cls: 'ifv', crew: 10, producers: ['RUS'], inService: 1990, unitCostUsdM: 1.5, speedKph: 50, rangeKm: 600, fuelTph: 0.1, armor: 0.25, q: 0.95, capacity: { troops: 7 }, load: { round_100mm_bmp3: 22, gun_launched_atgm: 8, round_30mm: 50 } },
  { id: 'bmp2', name: 'BMP-2M / BMP-2 Sarath', cls: 'ifv', crew: 10, producers: ['RUS', 'IND'], inService: 1980, unitCostUsdM: 1, speedKph: 45, rangeKm: 550, fuelTph: 0.09, armor: 0.2, q: 0.8, capacity: { troops: 7 }, load: { round_30mm: 50, konkurs: 4 } },
  { id: 'bmp1', name: 'BMP-1', cls: 'ifv', crew: 11, producers: [], inService: 1966, unitCostUsdM: 0.3, speedKph: 45, rangeKm: 550, fuelTph: 0.08, armor: 0.15, q: 0.5, capacity: { troops: 8 } },
  { id: 'bmd4m', name: 'BMD-4M', cls: 'ifv', crew: 8, producers: ['RUS'], inService: 2015, unitCostUsdM: 2, speedKph: 50, rangeKm: 500, fuelTph: 0.08, armor: 0.15, q: 0.85, capacity: { troops: 5 }, load: { round_100mm_bmp3: 34, round_30mm: 50 } },
  { id: 'btr82a', name: 'BTR-82A', cls: 'apc', crew: 10, producers: ['RUS'], inService: 2013, unitCostUsdM: 1, speedKph: 70, rangeKm: 600, fuelTph: 0.06, armor: 0.12, q: 1.3, capacity: { troops: 7 }, load: { round_30mm: 30 } },
  { id: 'zbd04a', name: 'ZBD-04A', cls: 'ifv', crew: 10, producers: ['CHN'], inService: 2017, unitCostUsdM: 2.5, speedKph: 50, rangeKm: 500, fuelTph: 0.1, armor: 0.3, q: 0.95, capacity: { troops: 7 }, load: { round_100mm_bmp3: 30, gun_launched_atgm: 8, round_30mm: 50 } },
  { id: 'zbd03', name: 'ZBD-03 airborne IFV', cls: 'ifv', crew: 7, producers: ['CHN'], inService: 2003, unitCostUsdM: 1.5, speedKph: 68, rangeKm: 500, fuelTph: 0.06, armor: 0.1, q: 0.8, capacity: { troops: 4 }, load: { round_30mm: 50, gun_launched_atgm: 4 } },
  { id: 'zbd05', name: 'ZBD-05 amphibious IFV', cls: 'ifv', crew: 11, producers: ['CHN'], inService: 2006, unitCostUsdM: 3, speedKph: 50, rangeKm: 500, fuelTph: 0.12, armor: 0.2, q: 0.85, capacity: { troops: 8 }, load: { round_30mm: 50, gun_launched_atgm: 4 } },
  { id: 'zbl08', name: 'ZBL-08 (VN1)', cls: 'ifv', crew: 10, producers: ['CHN'], inService: 2009, unitCostUsdM: 1.5, speedKph: 70, rangeKm: 800, fuelTph: 0.06, armor: 0.2, q: 0.85, capacity: { troops: 7 }, load: { round_30mm: 50, hj12: 2 } },
  { id: 'btr4', name: 'BTR-4E Bucephalus', cls: 'apc', crew: 10, producers: ['UKR'], inService: 2009, unitCostUsdM: 1, speedKph: 70, rangeKm: 600, fuelTph: 0.06, armor: 0.15, q: 1.2, capacity: { troops: 7 }, load: { round_30mm: 30 } },
];

const carriers: PlatformSpec<MunitionKey>[] = [
  { id: 'm113a3', name: 'M113A3', cls: 'apc', crew: 13, producers: [], inService: 1987, unitCostUsdM: 0.8, rangeKm: 480, armor: 0.12, q: 0.8, capacity: { troops: 11 } },
  { id: 'btr80', name: 'BTR-80', cls: 'apc', crew: 10, producers: [], inService: 1986, unitCostUsdM: 0.5, speedKph: 70, armor: 0.1, q: 0.9, capacity: { troops: 7 } },
  { id: 'mtlb', name: 'MT-LB', cls: 'apc', crew: 13, producers: ['RUS', 'POL', 'BGR'], inService: 1970, unitCostUsdM: 0.3, speedKph: 45, armor: 0.08, q: 0.6, capacity: { troops: 11 } },
  { id: 'stryker_icv', name: 'Stryker M1126 ICV', cls: 'apc', producers: ['USA'], inService: 2002, unitCostUsdM: 4.5, speedKph: 80, rangeKm: 500, armor: 0.3, q: 0.9, capacity: { troops: 9 } },
  { id: 'patria_amv', name: 'Patria AMV / KTO Rosomak', cls: 'apc', producers: ['FIN', 'POL'], inService: 2004, unitCostUsdM: 3.5, speedKph: 80, rangeKm: 800, armor: 0.3, q: 1.1, capacity: { troops: 8 }, load: { round_30mm: 20, spike_lr2: 2 } },
  { id: 'boxer', name: 'Boxer', cls: 'apc', producers: ['DEU', 'NLD', 'GBR', 'AUS'], inService: 2011, unitCostUsdM: 5, speedKph: 80, rangeKm: 1050, armor: 0.4, q: 0.9, capacity: { troops: 8 } },
  { id: 'piranha_v', name: 'Piranha V / III', cls: 'apc', producers: ['CHE', 'ESP', 'DNK'], inService: 2015, unitCostUsdM: 4, speedKph: 80, rangeKm: 550, armor: 0.3, q: 0.9, capacity: { troops: 8 } },
  { id: 'vbmr_griffon', name: 'VBMR Griffon', cls: 'apc', crew: 10, producers: ['FRA'], inService: 2019, unitCostUsdM: 2.5, speedKph: 80, rangeKm: 800, armor: 0.3, q: 0.9, capacity: { troops: 8 } },
  // Namer: heavy APC on a Merkava hull, the best-protected troop carrier in service.
  { id: 'namer', name: 'Namer', cls: 'apc', crew: 12, producers: ['ISR'], inService: 2008, unitCostUsdM: 3.5, speedKph: 40, rangeKm: 500, fuelTph: 0.16, armor: 0.65, q: 1.0, capacity: { troops: 9 } },
  { id: 'bushmaster', name: 'Bushmaster PMV', cls: 'apc', crew: 10, producers: ['AUS'], inService: 1997, unitCostUsdM: 1, speedKph: 80, rangeKm: 800, armor: 0.25, q: 0.6, capacity: { troops: 9 } },
  { id: 'maxxpro', name: 'MaxxPro MRAP', cls: 'apc', crew: 10, producers: ['USA'], inService: 2007, unitCostUsdM: 0.6, speedKph: 70, rangeKm: 600, armor: 0.25, q: 0.6, capacity: { troops: 8 } },
  { id: 'zsl92', name: 'ZSL-92 (WZ-551)', cls: 'apc', crew: 12, producers: ['CHN'], inService: 1995, unitCostUsdM: 0.8, speedKph: 70, armor: 0.12, q: 0.9, capacity: { troops: 9 } },
  { id: 'type96_wapc', name: 'Type 96 WAPC', cls: 'apc', crew: 10, producers: ['JPN'], inService: 1996, unitCostUsdM: 1.2, speedKph: 70, rangeKm: 500, armor: 0.15, q: 0.7, capacity: { troops: 8 } },
  { id: 'pars', name: 'FNSS Pars 8x8', cls: 'apc', producers: ['TUR'], inService: 2009, unitCostUsdM: 2.5, speedKph: 80, rangeKm: 700, armor: 0.25, q: 1.0, capacity: { troops: 8 } },
  { id: 'kamaz_typhoon', name: 'KamAZ-63968 Typhoon-K', cls: 'apc', crew: 14, producers: ['RUS'], inService: 2014, unitCostUsdM: 0.6, speedKph: 80, rangeKm: 1200, armor: 0.25, q: 0.6, capacity: { troops: 12 } },
];

const recon: PlatformSpec<MunitionKey>[] = [
  { id: 'jltv', name: 'JLTV (Oshkosh L-ATV)', cls: 'recon', producers: ['USA'], inService: 2019, unitCostUsdM: 0.45, speedKph: 90, rangeKm: 500, fuelTph: 0.03, armor: 0.2, q: 0.7 },
  { id: 'hmmwv', name: 'HMMWV', cls: 'recon', producers: ['USA'], inService: 1985, unitCostUsdM: 0.2, speedKph: 90, rangeKm: 480, fuelTph: 0.025, armor: 0.1, q: 0.5 },
  { id: 'brdm2', name: 'BRDM-2', cls: 'recon', producers: [], inService: 1963, unitCostUsdM: 0.2, speedKph: 80, rangeKm: 750, armor: 0.08, q: 0.5 },
  { id: 'tigr', name: 'GAZ Tigr-M', cls: 'recon', producers: ['RUS'], inService: 2006, unitCostUsdM: 0.25, speedKph: 90, rangeKm: 1000, fuelTph: 0.03, armor: 0.12, q: 0.5 },
  { id: 'fennek', name: 'Fennek', cls: 'recon', crew: 3, producers: ['DEU', 'NLD'], inService: 2003, unitCostUsdM: 1.5, speedKph: 90, rangeKm: 860, armor: 0.15, stealth: 0.6, detectionKm: 20, q: 0.6 },
  { id: 'ajax', name: 'Ajax', cls: 'recon', crew: 3, producers: ['GBR'], inService: 2025, unitCostUsdM: 10, speedKph: 50, rangeKm: 500, fuelTph: 0.13, armor: 0.45, detectionKm: 15, fp: { armor: 0.015, soft: 0.05 }, load: { round_30mm: 25 } },
  { id: 'jaguar_ebrc', name: 'EBRC Jaguar', cls: 'recon', crew: 3, producers: ['FRA'], inService: 2021, unitCostUsdM: 6, speedKph: 80, rangeKm: 800, armor: 0.3, fp: { armor: 0.02 }, load: { mmp: 2, round_30mm: 30 } },
  { id: 'amx10rc', name: 'AMX-10 RC', cls: 'recon', producers: [], inService: 1981, unitCostUsdM: 1.5, speedKph: 70, rangeKm: 800, armor: 0.12, fp: { armor: 0.015 } },
  { id: 'type16_mcv', name: 'Type 16 MCV', cls: 'recon', producers: ['JPN'], inService: 2016, unitCostUsdM: 7, speedKph: 80, rangeKm: 400, armor: 0.25, fp: { armor: 0.03 }, load: { apfsds_105: 40 } },
  { id: 'lav25', name: 'LAV-25', cls: 'recon', crew: 9, producers: ['USA', 'CAN'], inService: 1983, unitCostUsdM: 1.5, speedKph: 80, rangeKm: 660, armor: 0.12, q: 1.1, load: { round_25mm: 42 } },
];

const artillery: PlatformSpec<MunitionKey>[] = [
  { id: 'm109a7', name: 'M109A7 Paladin', cls: 'sp_artillery', crew: 4, producers: ['USA'], inService: 2015, unitCostUsdM: 7, speedKph: 38, rangeKm: 300, armor: 0.25, q: 1.0, load: { shell_155: 35, excalibur: 4 } },
  { id: 'm109a6', name: 'M109A6 / A5', cls: 'sp_artillery', crew: 4, producers: [], inService: 1992, unitCostUsdM: 3, speedKph: 38, rangeKm: 300, armor: 0.22, q: 0.85, load: { shell_155: 39 } },
  // PzH 2000: 3-round burst in 9 s, 52-cal; Ukraine reported barrel wear at high rates of fire.
  { id: 'pzh2000', name: 'PzH 2000', cls: 'sp_artillery', producers: ['DEU'], inService: 1998, unitCostUsdM: 15, speedKph: 45, rangeKm: 420, fuelTph: 0.18, armor: 0.3, q: 1.3, load: { shell_155: 55, excalibur: 5 } },
  { id: 'k9a1', name: 'K9A1 Thunder / K9 Vajra / Krab-K9PL', cls: 'sp_artillery', producers: ['KOR', 'IND', 'POL'], inService: 2018, unitCostUsdM: 4.5, speedKph: 50, rangeKm: 480, fuelTph: 0.15, armor: 0.25, q: 1.15, load: { shell_155: 48 } },
  { id: 'firtina', name: 'T-155 Firtina', cls: 'sp_artillery', producers: ['TUR'], inService: 2004, unitCostUsdM: 4, speedKph: 50, rangeKm: 480, armor: 0.25, q: 1.05, load: { shell_155: 48 } },
  { id: 'caesar', name: 'CAESAR 6x6/8x8', cls: 'sp_artillery', producers: ['FRA'], inService: 2008, unitCostUsdM: 5, speedKph: 80, rangeKm: 600, fuelTph: 0.05, armor: 0.1, stealth: 0.3, q: 1.15, load: { shell_155: 18 } },
  { id: 'archer', name: 'Archer FH77BW', cls: 'sp_artillery', crew: 3, producers: ['SWE'], inService: 2016, unitCostUsdM: 6, speedKph: 70, rangeKm: 500, fuelTph: 0.06, armor: 0.2, stealth: 0.3, q: 1.25, load: { shell_155: 21, excalibur: 2 } },
  { id: 'pcl181', name: 'PCL-181', cls: 'sp_artillery', crew: 6, producers: ['CHN'], inService: 2019, unitCostUsdM: 2.5, speedKph: 80, rangeKm: 600, fuelTph: 0.05, armor: 0.1, stealth: 0.25, q: 1.05, load: { shell_155: 27 } },
  { id: 'plz05', name: 'PLZ-05', cls: 'sp_artillery', producers: ['CHN'], inService: 2008, unitCostUsdM: 4, speedKph: 50, rangeKm: 450, fuelTph: 0.15, armor: 0.25, q: 1.1, load: { shell_155: 30 } },
  { id: 'plz07', name: 'PLZ-07 122 mm', cls: 'sp_artillery', producers: ['CHN'], inService: 2007, unitCostUsdM: 1.5, speedKph: 50, rangeKm: 450, armor: 0.15, q: 0.75, load: { shell_122: 40 } },
  { id: '2s19m2', name: '2S19M2 Msta-S', cls: 'sp_artillery', producers: ['RUS'], inService: 2013, unitCostUsdM: 2.5, speedKph: 40, rangeKm: 500, fuelTph: 0.14, armor: 0.25, q: 1.0, load: { shell_152: 48, krasnopol: 2 } },
  { id: '2s35', name: '2S35 Koalitsiya-SV', cls: 'sp_artillery', crew: 3, producers: ['RUS'], inService: 2023, unitCostUsdM: 6, speedKph: 45, rangeKm: 500, fuelTph: 0.16, armor: 0.3, q: 1.25, load: { shell_152: 70 } },
  { id: '2s3m', name: '2S3M Akatsiya', cls: 'sp_artillery', crew: 4, producers: [], inService: 1975, unitCostUsdM: 0.8, speedKph: 40, rangeKm: 500, armor: 0.15, q: 0.75, load: { shell_152: 46 } },
  { id: '2s1', name: '2S1 Gvozdika', cls: 'sp_artillery', crew: 4, producers: [], inService: 1972, unitCostUsdM: 0.4, speedKph: 40, rangeKm: 500, fuelTph: 0.08, armor: 0.1, q: 0.55, load: { shell_122: 40 } },
  { id: '2s7m', name: '2S7M Malka 203 mm', cls: 'sp_artillery', crew: 6, producers: ['RUS'], inService: 1983, unitCostUsdM: 2, speedKph: 40, rangeKm: 650, fuelTph: 0.17, armor: 0.1, q: 1.2, load: { shell_203: 8 } },
  { id: '2s5', name: '2S5 Giatsint-S', cls: 'sp_artillery', producers: ['RUS'], inService: 1978, unitCostUsdM: 1.5, speedKph: 40, rangeKm: 500, armor: 0.1, q: 0.95, load: { shell_152: 30 } },
  { id: 'bohdana', name: '2S22 Bohdana', cls: 'sp_artillery', producers: ['UKR'], inService: 2022, unitCostUsdM: 2, speedKph: 70, rangeKm: 800, fuelTph: 0.05, armor: 0.1, stealth: 0.3, q: 1.05, load: { shell_155: 20 } },
  { id: 'as90', name: 'AS-90', cls: 'sp_artillery', producers: [], inService: 1993, unitCostUsdM: 3, speedKph: 40, rangeKm: 370, armor: 0.2, q: 0.95, load: { shell_155: 48 } },
  { id: 'krab', name: 'AHS Krab', cls: 'sp_artillery', producers: ['POL'], inService: 2017, unitCostUsdM: 5, speedKph: 50, rangeKm: 450, fuelTph: 0.15, armor: 0.25, q: 1.15, load: { shell_155: 40 } },
  { id: 'zuzana2', name: 'Zuzana 2', cls: 'sp_artillery', producers: ['SVK'], inService: 2018, unitCostUsdM: 4, speedKph: 80, rangeKm: 750, fuelTph: 0.06, armor: 0.15, q: 1.1, load: { shell_155: 40 } },
  { id: 'dana', name: 'ShKH vz. 77 DANA (152 mm)', cls: 'sp_artillery', producers: [], inService: 1981, unitCostUsdM: 1, speedKph: 70, rangeKm: 740, fuelTph: 0.06, armor: 0.1, q: 0.8, load: { shell_152: 60 } },
  { id: 'atmos', name: 'ATMOS 2000', cls: 'sp_artillery', producers: ['ISR'], inService: 2004, unitCostUsdM: 3, speedKph: 80, rangeKm: 1000, fuelTph: 0.05, armor: 0.1, stealth: 0.3, q: 1.0, load: { shell_155: 27 } },
  { id: 'type19_spg', name: 'Type 19 wheeled SPH', cls: 'sp_artillery', producers: ['JPN'], inService: 2019, unitCostUsdM: 6, speedKph: 80, rangeKm: 700, fuelTph: 0.06, armor: 0.1, q: 1.05, load: { shell_155: 30 } },
  { id: 'nora_b52', name: 'Nora B-52', cls: 'sp_artillery', producers: ['SRB'], inService: 2010, unitCostUsdM: 3, speedKph: 80, rangeKm: 1000, fuelTph: 0.05, armor: 0.1, q: 1.0, load: { shell_155: 36 } },
  { id: 'm777', name: 'M777A2', cls: 'towed_artillery', producers: ['USA', 'GBR'], inService: 2005, unitCostUsdM: 3.7, q: 1.05, load: { shell_155: 30, excalibur: 2 } },
  { id: 'd30', name: 'D-30 122 mm', cls: 'towed_artillery', crew: 7, producers: [], inService: 1960, unitCostUsdM: 0.2, q: 0.6, load: { shell_122: 40 } },
  { id: 'msta_b', name: '2A65 Msta-B', cls: 'towed_artillery', producers: ['RUS'], inService: 1987, unitCostUsdM: 1, q: 0.9, load: { shell_152: 30 } },
  { id: 'giatsint_b', name: '2A36 Giatsint-B', cls: 'towed_artillery', producers: ['RUS'], inService: 1976, unitCostUsdM: 1, q: 0.9, load: { shell_152: 30 } },
  { id: 'd20', name: 'D-20 152 mm', cls: 'towed_artillery', producers: [], inService: 1955, unitCostUsdM: 0.3, q: 0.7, load: { shell_152: 30 } },
  { id: 'fh70', name: 'FH-70', cls: 'towed_artillery', producers: [], inService: 1978, unitCostUsdM: 1.5, q: 0.85, load: { shell_155: 30 } },
  { id: 'm46_130', name: 'M-46 / Type 59-1 130 mm', cls: 'towed_artillery', producers: ['CHN', 'PRK'], inService: 1954, unitCostUsdM: 0.2, q: 0.65, load: { shell_130: 30 } },
  { id: 'dhanush', name: 'Dhanush 155 mm', cls: 'towed_artillery', producers: ['IND'], inService: 2019, unitCostUsdM: 2, q: 0.95, load: { shell_155: 30 } },
  { id: 'ah4', name: 'AH4 155 mm light', cls: 'towed_artillery', producers: ['CHN'], inService: 2014, unitCostUsdM: 1.5, q: 0.9, load: { shell_155: 30 } },
  { id: 'm119', name: 'M119A3 / L118 105 mm', cls: 'towed_artillery', crew: 7, producers: ['USA', 'GBR'], inService: 1989, unitCostUsdM: 1, q: 0.65, load: { shell_105: 40 } },
  { id: 'mortar_120_section', name: '120 mm mortar (M120 / 2B11 / PP-87)', cls: 'towed_artillery', crew: 5, producers: ['USA', 'RUS', 'CHN', 'FRA', 'ISR', 'TUR', 'KOR', 'IRN', 'PRK', 'FIN', 'POL', 'UKR', 'SRB'], inService: 1991, unitCostUsdM: 0.05, speedKph: 30, armor: 0.05, stealth: 0.5, detectionKm: 6, q: 0.45, load: { mortar_120: 30 } },
  { id: 'mortar_81_section', name: '81/82 mm mortar section', cls: 'towed_artillery', crew: 4, producers: ['USA', 'RUS', 'CHN', 'GBR', 'TUR', 'IRN', 'PRK', 'PAK', 'IND', 'SRB', 'UKR'], inService: 1980, unitCostUsdM: 0.02, speedKph: 4, fuelTph: 0, armor: 0.05, stealth: 0.6, detectionKm: 4, q: 0.25, load: { mortar_81: 40 } },
];

const rockets: PlatformSpec<MunitionKey>[] = [
  // HIMARS: ~$5M per launcher (FY2024); precision makes it count far beyond its rocket count against structures.
  { id: 'himars', name: 'M142 HIMARS', cls: 'mlrs', producers: ['USA'], inService: 2005, unitCostUsdM: 5.1, speedKph: 85, rangeKm: 480, fuelTph: 0.05, armor: 0.15, stealth: 0.3, q: 0.6, fp: { armor: 0.06, structure: 0.12 }, load: { gmlrs: 6 } },
  { id: 'm270a2', name: 'M270A2 MLRS', cls: 'mlrs', producers: ['USA'], inService: 2023, unitCostUsdM: 7, speedKph: 55, rangeKm: 480, fuelTph: 0.13, armor: 0.2, q: 0.9, fp: { armor: 0.08, structure: 0.18 }, load: { gmlrs: 12 } },
  { id: 'bm21', name: 'BM-21 Grad', cls: 'mlrs', producers: ['RUS', 'SRB', 'EGY', 'IRN', 'PRK'], inService: 1963, unitCostUsdM: 0.3, speedKph: 60, rangeKm: 750, fuelTph: 0.05, armor: 0.05, q: 1.0, load: { rocket_122: 40 } },
  { id: 'tornado_g', name: '9K51M Tornado-G', cls: 'mlrs', producers: ['RUS'], inService: 2013, unitCostUsdM: 1.5, speedKph: 60, rangeKm: 900, fuelTph: 0.05, armor: 0.05, q: 1.1, load: { rocket_122: 40 } },
  { id: 'bm27', name: 'BM-27 Uragan', cls: 'mlrs', crew: 4, producers: ['RUS'], inService: 1975, unitCostUsdM: 1.5, speedKph: 60, rangeKm: 500, fuelTph: 0.08, armor: 0.05, q: 1.3, load: { rocket_220: 16 } },
  { id: 'bm30', name: 'BM-30 Smerch', cls: 'mlrs', crew: 4, producers: ['RUS'], inService: 1989, unitCostUsdM: 4, speedKph: 60, rangeKm: 850, fuelTph: 0.09, armor: 0.05, q: 1.5, load: { rocket_300: 12 } },
  { id: 'tornado_s', name: '9K515 Tornado-S', cls: 'mlrs', crew: 4, producers: ['RUS'], inService: 2016, unitCostUsdM: 6, speedKph: 60, rangeKm: 850, fuelTph: 0.09, armor: 0.05, q: 1.6, fp: { structure: 0.1 }, load: { rocket_300: 12 } },
  { id: 'tos1a', name: 'TOS-1A Solntsepyok', cls: 'mlrs', producers: ['RUS'], inService: 2001, unitCostUsdM: 4, speedKph: 40, rangeKm: 500, fuelTph: 0.13, armor: 0.6, q: 1.0, fp: { infantry: 0.3, structure: 0.08 }, load: { tos_thermobaric: 24 } },
  { id: 'phl16', name: 'PHL-16 (PCH-191)', cls: 'mlrs', crew: 4, producers: ['CHN'], inService: 2019, unitCostUsdM: 5, speedKph: 60, rangeKm: 650, fuelTph: 0.1, armor: 0.1, q: 1.4, fp: { structure: 0.15, armor: 0.06 }, load: { phl16_370: 8 } },
  { id: 'phl03', name: 'PHL-03', cls: 'mlrs', crew: 4, producers: ['CHN'], inService: 2004, unitCostUsdM: 3, speedKph: 60, rangeKm: 650, fuelTph: 0.09, armor: 0.05, q: 1.5, load: { phl03_300: 12 } },
  { id: 'phl11', name: 'PHL-11 122 mm', cls: 'mlrs', producers: ['CHN'], inService: 2011, unitCostUsdM: 1, speedKph: 70, rangeKm: 700, fuelTph: 0.05, armor: 0.05, q: 1.05, load: { rocket_122: 40 } },
  { id: 'chunmoo', name: 'K239 Chunmoo', cls: 'mlrs', producers: ['KOR'], inService: 2015, unitCostUsdM: 5, speedKph: 60, rangeKm: 450, fuelTph: 0.1, armor: 0.15, q: 1.2, fp: { structure: 0.12, armor: 0.06 }, load: { chunmoo_239: 12 } },
  { id: 'pinaka', name: 'Pinaka', cls: 'mlrs', crew: 4, producers: ['IND'], inService: 2007, unitCostUsdM: 3, speedKph: 60, rangeKm: 800, fuelTph: 0.08, armor: 0.05, q: 1.2, load: { pinaka_guided: 12 } },
  { id: 'astros2', name: 'Astros II Mk6', cls: 'mlrs', producers: ['BRA'], inService: 1983, unitCostUsdM: 3, speedKph: 60, rangeKm: 480, fuelTph: 0.08, armor: 0.05, q: 1.2, load: { astros_ss40: 16 } },
  { id: 'puls', name: 'PULS', cls: 'mlrs', producers: ['ISR'], inService: 2023, unitCostUsdM: 6, speedKph: 70, rangeKm: 500, fuelTph: 0.08, armor: 0.1, q: 1.1, fp: { structure: 0.12, armor: 0.05 }, load: { extra: 8 } },
  { id: 'rm70', name: 'RM-70 / Vampire', cls: 'mlrs', crew: 4, producers: ['CZE'], inService: 1972, unitCostUsdM: 1, speedKph: 70, rangeKm: 1000, fuelTph: 0.06, armor: 0.08, q: 1.05, load: { rocket_122: 80 } },
  { id: 't122_sakarya', name: 'T-122 Sakarya', cls: 'mlrs', producers: ['TUR'], inService: 1995, unitCostUsdM: 1, speedKph: 70, rangeKm: 600, fuelTph: 0.06, armor: 0.05, q: 1.05, load: { rocket_122: 40 } },
  { id: 't300_kasirga', name: 'T-300 Kasirga', cls: 'mlrs', producers: ['TUR'], inService: 2008, unitCostUsdM: 3, speedKph: 60, rangeKm: 600, fuelTph: 0.08, armor: 0.05, q: 1.2, load: { trg300: 4 } },
  { id: 'fajr5_launcher', name: 'Fajr-5 launcher', cls: 'mlrs', producers: ['IRN'], inService: 1996, unitCostUsdM: 0.5, speedKph: 60, rangeKm: 500, fuelTph: 0.07, armor: 0.05, q: 1.0, load: { fajr5: 4 } },
  { id: 'kn09', name: 'KN-09 300 mm MRL', cls: 'mlrs', producers: ['PRK'], inService: 2016, unitCostUsdM: 2, speedKph: 50, rangeKm: 500, fuelTph: 0.08, armor: 0.05, q: 1.2, load: { kn09_300: 8 } },
  { id: 'kn25_launcher', name: 'KN-25 600 mm launcher', cls: 'mlrs', producers: ['PRK'], inService: 2019, unitCostUsdM: 3, speedKph: 40, rangeKm: 500, fuelTph: 0.12, armor: 0.05, q: 0.3, load: { kn25: 4 } },
  { id: 'm1991_mrl', name: 'M1991 240 mm MRL', cls: 'mlrs', producers: ['PRK'], inService: 1991, unitCostUsdM: 0.5, speedKph: 50, rangeKm: 500, fuelTph: 0.07, armor: 0.05, q: 1.1, load: { rocket_240_nk: 22 } },
];

const antiTank: PlatformSpec<MunitionKey>[] = [
  { id: 'javelin_team', name: 'Javelin team', cls: 'atgm', producers: ['USA'], inService: 2018, unitCostUsdM: 0.25, q: 1.2, load: { javelin: 4 } },
  { id: 'nlaw_team', name: 'NLAW team', cls: 'atgm', crew: 2, producers: ['SWE', 'GBR'], inService: 2009, unitCostUsdM: 0.01, q: 0.8, detectionKm: 1, load: { nlaw: 4 } },
  { id: 'kornet_team', name: '9K135 Kornet team', cls: 'atgm', producers: ['RUS'], inService: 1998, unitCostUsdM: 0.2, q: 1.1, detectionKm: 8, load: { kornet: 4 } },
  { id: 'konkurs_team', name: '9K111/113 Fagot-Konkurs team', cls: 'atgm', producers: ['RUS', 'IND', 'IRN'], inService: 1974, unitCostUsdM: 0.05, q: 0.75, load: { konkurs: 4 } },
  { id: 'metis_team', name: '9K115-2 Metis-M team', cls: 'atgm', crew: 2, producers: ['RUS'], inService: 1992, unitCostUsdM: 0.05, q: 0.75, load: { metis_m: 4 } },
  { id: 'spike_team', name: 'Spike LR team', cls: 'atgm', producers: ['ISR', 'DEU', 'POL'], inService: 2004, unitCostUsdM: 0.2, q: 1.15, load: { spike_lr2: 4 } },
  { id: 'hj12_team', name: 'HJ-12 team', cls: 'atgm', producers: ['CHN'], inService: 2015, unitCostUsdM: 0.15, q: 1.1, load: { hj12: 4 } },
  { id: 'mmp_team', name: 'MMP team', cls: 'atgm', producers: ['FRA'], inService: 2017, unitCostUsdM: 0.25, q: 1.1, load: { mmp: 4 } },
  { id: 'toophan_team', name: 'Toophan / Dehlavieh team', cls: 'atgm', producers: ['IRN'], inService: 2000, unitCostUsdM: 0.03, q: 0.75, load: { toophan: 4 } },
  { id: 'rpg_team', name: 'RPG-7 team', cls: 'atgm', crew: 2, producers: ['RUS', 'CHN', 'IRN', 'PRK', 'BGR', 'SRB', 'PAK', 'EGY', 'IND', 'UKR'], inService: 1961, unitCostUsdM: 0.005, q: 0.35, detectionKm: 0.5, load: { rpg7: 6 } },
  { id: 'tow_hmmwv', name: 'M1167 HMMWV TOW', cls: 'atgm', producers: ['USA'], inService: 2010, unitCostUsdM: 0.6, speedKph: 80, rangeKm: 480, fuelTph: 0.025, armor: 0.1, stealth: 0.4, q: 1.0, load: { tow2b: 7 } },
  { id: 'm1134_atgm', name: 'Stryker M1134 ATGM', cls: 'atgm', crew: 4, producers: ['USA'], inService: 2002, unitCostUsdM: 4, speedKph: 80, rangeKm: 500, fuelTph: 0.07, armor: 0.3, stealth: 0.2, q: 1.3, load: { tow2b: 13 } },
  { id: 'kornet_t', name: '9P162 Kornet-T', cls: 'atgm', crew: 2, producers: ['RUS'], inService: 2012, unitCostUsdM: 1.5, speedKph: 60, rangeKm: 600, fuelTph: 0.09, armor: 0.25, stealth: 0.2, q: 1.5, detectionKm: 8, load: { kornet: 16 } },
  { id: 'namica', name: 'NAMICA (Nag carrier)', cls: 'atgm', producers: ['IND'], inService: 2019, unitCostUsdM: 2, speedKph: 60, rangeKm: 500, fuelTph: 0.09, armor: 0.2, stealth: 0.2, q: 1.2, detectionKm: 7, load: { nag: 6 } },
];

const infantry: PlatformSpec<MunitionKey>[] = [
  { id: 'infantry_squad', name: 'Infantry squad (regular)', cls: 'infantry', producers: [], inService: 2000, unitCostUsdM: 0.1, q: 1.0, load: { small_arms: 3, at4: 1 } },
  { id: 'infantry_squad_pro', name: 'Infantry squad (professional, night-capable)', cls: 'infantry', producers: [], inService: 2010, unitCostUsdM: 0.25, q: 1.4, detectionKm: 3, load: { small_arms: 3, at4: 2 } },
  { id: 'infantry_squad_conscript', name: 'Infantry squad (conscript/mobilised)', cls: 'infantry', producers: [], inService: 1990, unitCostUsdM: 0.05, q: 0.7, load: { small_arms: 2, rpg7: 1 } },
  { id: 'militia_squad', name: 'Militia / irregular squad', cls: 'infantry', crew: 10, producers: [], inService: 1980, unitCostUsdM: 0.02, armor: 0.03, q: 0.45, load: { small_arms: 2, rpg7: 1 } },
  { id: 'marine_squad', name: 'Marine rifle squad', cls: 'infantry', crew: 13, producers: [], inService: 2010, unitCostUsdM: 0.25, q: 1.3, load: { small_arms: 4, at4: 2 } },
  { id: 'airborne_squad', name: 'Airborne / air assault squad', cls: 'infantry', producers: [], inService: 2010, unitCostUsdM: 0.2, q: 1.3, load: { small_arms: 3, at4: 2 } },
  { id: 'sof_team', name: 'Special operations team (12)', cls: 'infantry', crew: 12, producers: [], inService: 2010, unitCostUsdM: 1, stealth: 0.8, detectionKm: 10, q: 2.5, load: { small_arms: 4, javelin: 2 } },
  { id: 'engineer_squad', name: 'Combat engineer squad', cls: 'engineer', producers: [], inService: 2000, unitCostUsdM: 0.15, speedKph: 4, rangeKm: 40, fuelTph: 0, armor: 0.05, stealth: 0.5, q: 1.0, load: { small_arms: 2 } },
  { id: 'm1150_abv', name: 'M1150 Assault Breacher Vehicle', cls: 'engineer', crew: 2, producers: ['USA'], inService: 2009, unitCostUsdM: 3, speedKph: 40, rangeKm: 400, fuelTph: 0.2, armor: 0.7, fp: { structure: 0.04 } },
  { id: 'kodiak', name: 'Kodiak AEV (Leopard 2 hull)', cls: 'engineer', crew: 3, producers: ['DEU', 'CHE'], inService: 2017, unitCostUsdM: 5, speedKph: 45, rangeKm: 450, fuelTph: 0.17, armor: 0.7, fp: { structure: 0.04 } },
  { id: 'imr2', name: 'IMR-2M engineer vehicle', cls: 'engineer', crew: 2, producers: ['RUS'], inService: 1990, unitCostUsdM: 1.5, speedKph: 40, rangeKm: 500, fuelTph: 0.12, armor: 0.55, fp: { structure: 0.03 } },
  { id: 'bridge_layer', name: 'Armoured bridge layer (M1074 JAB / Leguan / MTU-72)', cls: 'engineer', crew: 2, producers: ['USA', 'DEU', 'RUS', 'CHN', 'KOR'], inService: 2000, unitCostUsdM: 4, speedKph: 40, rangeKm: 450, fuelTph: 0.15, armor: 0.5, q: 0 },
  { id: 'pontoon_bridge', name: 'Ribbon bridge set (PMP / IRB / PP-91), per truck', cls: 'engineer', crew: 2, producers: ['RUS', 'CHN', 'USA', 'DEU', 'FRA', 'TUR', 'UKR'], inService: 1980, unitCostUsdM: 0.4, speedKph: 50, rangeKm: 500, fuelTph: 0.03, armor: 0.05, q: 0, capacity: { vehicles: 1 } },
  { id: 'ur77', name: 'UR-77 Meteorit mine-clearing', cls: 'engineer', crew: 2, producers: ['RUS'], inService: 1978, unitCostUsdM: 0.5, speedKph: 50, rangeKm: 500, fuelTph: 0.06, armor: 0.15, fp: { structure: 0.05, infantry: 0.03 } },
];

// Trucks: cargoTons is payload; fuel trucks carry it as bulk fuel.
const logistics: PlatformSpec<MunitionKey>[] = [
  { id: 'fmtv_m1083', name: 'FMTV M1083 5-ton', cls: 'truck', producers: ['USA'], inService: 1996, unitCostUsdM: 0.3, speedKph: 60, rangeKm: 650, fuelTph: 0.025, capacity: { cargoTons: 4.5, troops: 16 } },
  { id: 'hemtt_m977', name: 'HEMTT M977A4', cls: 'truck', producers: ['USA'], inService: 2010, unitCostUsdM: 0.5, rangeKm: 480, fuelTph: 0.035, capacity: { cargoTons: 10 } },
  { id: 'm1070_het', name: 'M1070A1 Heavy Equipment Transporter', cls: 'truck', producers: ['USA'], inService: 1993, unitCostUsdM: 0.9, speedKph: 45, rangeKm: 600, fuelTph: 0.06, capacity: { cargoTons: 70, vehicles: 1 } },
  { id: 'rmmv_hx', name: 'RMMV HX2 8x8', cls: 'truck', producers: ['DEU', 'AUT', 'GBR'], inService: 2007, unitCostUsdM: 0.35, rangeKm: 600, fuelTph: 0.035, capacity: { cargoTons: 10 } },
  { id: 'kamaz_5350', name: 'KamAZ-5350 Mustang', cls: 'truck', producers: ['RUS'], inService: 2003, unitCostUsdM: 0.1, rangeKm: 800, capacity: { cargoTons: 6, troops: 24 } },
  { id: 'ural_4320', name: 'Ural-4320', cls: 'truck', producers: ['RUS'], inService: 1977, unitCostUsdM: 0.07, rangeKm: 900, fuelTph: 0.035, capacity: { cargoTons: 6, troops: 27 } },
  { id: 'shaanxi_sx2190', name: 'Shaanxi SX2190 / Dongfeng EQ2102', cls: 'truck', producers: ['CHN'], inService: 2005, unitCostUsdM: 0.08, rangeKm: 800, capacity: { cargoTons: 5, troops: 20 } },
  { id: 'tatra_t815', name: 'Tatra T815-7', cls: 'truck', producers: ['CZE'], inService: 2015, unitCostUsdM: 0.2, rangeKm: 800, fuelTph: 0.035, capacity: { cargoTons: 12 } },
  { id: 'ashok_stallion', name: 'Ashok Leyland Stallion', cls: 'truck', producers: ['IND'], inService: 1986, unitCostUsdM: 0.04, rangeKm: 700, capacity: { cargoTons: 5, troops: 20 } },
  { id: 'technical', name: 'Technical (armed pickup)', cls: 'truck', crew: 3, producers: ['JPN', 'USA', 'CHN', 'THA', 'TUR', 'IRN'], inService: 1985, unitCostUsdM: 0.03, speedKph: 80, rangeKm: 700, fuelTph: 0.012, fp: { infantry: 0.008, soft: 0.006, helicopter: 0.002 }, capacity: { cargoTons: 0.8, troops: 6 } },
  { id: 'm978_tanker', name: 'HEMTT M978A4 fuel tanker', cls: 'fuel_truck', producers: ['USA'], inService: 1985, unitCostUsdM: 0.5, rangeKm: 480, fuelTph: 0.035, capacity: { cargoTons: 7.6 } },
  { id: 'atz10', name: 'ATZ-10 KamAZ fuel truck', cls: 'fuel_truck', producers: ['RUS'], inService: 2000, unitCostUsdM: 0.12, rangeKm: 800, capacity: { cargoTons: 8.5 } },
  { id: 'hx_fuel', name: 'RMMV HX 15 kL fuel truck (UTF)', cls: 'fuel_truck', producers: ['DEU', 'GBR'], inService: 2010, unitCostUsdM: 0.4, rangeKm: 600, fuelTph: 0.035, capacity: { cargoTons: 12.5 } },
  { id: 'cn_fuel_truck', name: 'Shaanxi fuel bowser', cls: 'fuel_truck', producers: ['CHN'], inService: 2005, unitCostUsdM: 0.1, rangeKm: 800, capacity: { cargoTons: 10 } },
];

const airDefense: PlatformSpec<MunitionKey>[] = [
  // Patriot: German battery ~€1B incl. missiles (2023); ~6 launchers. Per-launcher share excl. missiles ~$120M.
  { id: 'patriot_pac3', name: 'Patriot launcher (PAC-3 MSE)', cls: 'sam_long', crew: 15, producers: ['USA', 'JPN'], inService: 2018, unitCostUsdM: 120, detectionKm: 180, channels: 2, load: { pac3_mse: 12 } },
  { id: 'patriot_pac2', name: 'Patriot launcher (PAC-2 GEM-T)', cls: 'sam_long', crew: 15, producers: ['USA', 'DEU'], inService: 2002, unitCostUsdM: 100, detectionKm: 170, channels: 2, load: { pac2_gemt: 4 } },
  // S-400: India paid ~$5.4B for 5 squadrons (~80 launchers) incl. missiles.
  { id: 's400', name: 'S-400 Triumf launcher (5P85TE2)', cls: 'sam_long', crew: 8, producers: ['RUS'], inService: 2007, unitCostUsdM: 60, detectionKm: 600, channels: 2, load: { s400_48n6: 2, s400_40n6: 2 } },
  { id: 's300pmu2', name: 'S-300PMU2 launcher', cls: 'sam_long', crew: 8, producers: ['RUS'], inService: 1997, unitCostUsdM: 25, detectionKm: 300, channels: 2, load: { s300_48n6e2: 4 } },
  { id: 's300ps', name: 'S-300PS/PT launcher', cls: 'sam_long', crew: 8, producers: [], inService: 1982, unitCostUsdM: 10, detectionKm: 200, channels: 1, load: { s300_5v55: 4 } },
  { id: 's300v4', name: 'S-300V4 launcher (9A83/9A82)', cls: 'sam_long', crew: 8, producers: ['RUS'], inService: 2014, unitCostUsdM: 50, armor: 0.2, detectionKm: 400, channels: 2, load: { s300v4_9m82md: 2 } },
  { id: 's350', name: 'S-350 Vityaz launcher (50P6)', cls: 'sam_medium', producers: ['RUS'], inService: 2019, unitCostUsdM: 30, detectionKm: 200, channels: 4, load: { s400_9m96: 12 } },
  { id: 'hq9b_launcher', name: 'HQ-9B launcher', cls: 'sam_long', crew: 8, producers: ['CHN'], inService: 2015, unitCostUsdM: 35, detectionKm: 300, channels: 2, load: { hq9b: 4 } },
  { id: 'hq22_launcher', name: 'HQ-22 launcher', cls: 'sam_long', producers: ['CHN'], inService: 2017, unitCostUsdM: 15, detectionKm: 250, channels: 2, load: { hq22: 4 } },
  { id: 'samp_t_ng', name: 'SAMP/T NG launcher', cls: 'sam_long', crew: 10, producers: ['FRA', 'ITA'], inService: 2026, unitCostUsdM: 100, detectionKm: 350, channels: 3, load: { aster30: 8 } },
  { id: 'samp_t', name: 'SAMP/T (Mamba) launcher', cls: 'sam_long', crew: 10, producers: ['FRA', 'ITA'], inService: 2011, unitCostUsdM: 80, detectionKm: 150, channels: 3, load: { aster30: 8 } },
  { id: 'davids_sling', name: "David's Sling launcher", cls: 'sam_long', crew: 10, producers: ['ISR', 'USA'], inService: 2017, unitCostUsdM: 100, detectionKm: 450, channels: 3, load: { stunner: 12 } },
  { id: 'tien_kung3', name: 'Tien Kung III launcher', cls: 'sam_long', producers: ['TWN'], inService: 2003, unitCostUsdM: 40, detectionKm: 300, channels: 2, load: { tc2_sl: 4 } },
  { id: 'bavar373', name: 'Bavar-373 launcher', cls: 'sam_long', producers: ['IRN'], inService: 2019, unitCostUsdM: 20, detectionKm: 320, channels: 2, load: { sayyad4: 4 } },
  { id: 'khordad15', name: 'Khordad-15 launcher', cls: 'sam_medium', producers: ['IRN'], inService: 2019, unitCostUsdM: 10, detectionKm: 150, channels: 2, load: { sayyad3: 4 } },
  { id: 'nasams', name: 'NASAMS 3 launcher', cls: 'sam_medium', producers: ['NOR', 'USA'], inService: 2019, unitCostUsdM: 25, detectionKm: 120, channels: 2, load: { aim120_sl: 6 } },
  { id: 'iris_t_slm', name: 'IRIS-T SLM launcher', cls: 'sam_medium', producers: ['DEU'], inService: 2022, unitCostUsdM: 40, detectionKm: 250, channels: 3, load: { iris_t_sl: 8 } },
  { id: 'buk_m3', name: 'Buk-M3 TELAR (9A317M)', cls: 'sam_medium', producers: ['RUS'], inService: 2016, unitCostUsdM: 15, armor: 0.15, detectionKm: 120, channels: 3, load: { buk_9m317m: 6 } },
  { id: 'buk_m1', name: 'Buk-M1/M1-2 TELAR', cls: 'sam_medium', producers: [], inService: 1983, unitCostUsdM: 5, armor: 0.15, detectionKm: 85, channels: 1, load: { buk_9m38: 4 } },
  { id: 'hq16_launcher', name: 'HQ-16 launcher', cls: 'sam_medium', producers: ['CHN'], inService: 2011, unitCostUsdM: 15, detectionKm: 150, channels: 2, load: { hq16: 6 } },
  { id: 'kmsam', name: 'Cheongung-II launcher', cls: 'sam_medium', producers: ['KOR'], inService: 2020, unitCostUsdM: 30, detectionKm: 100, channels: 3, load: { cheongung2: 8 } },
  { id: 'akash', name: 'Akash launcher', cls: 'sam_medium', producers: ['IND'], inService: 2014, unitCostUsdM: 6, detectionKm: 120, channels: 1, load: { akash_ng: 3 } },
  { id: 'mrsam_army', name: 'MRSAM / Barak 8 land launcher', cls: 'sam_medium', producers: ['ISR', 'IND'], inService: 2021, unitCostUsdM: 25, detectionKm: 250, channels: 3, load: { barak8: 8 } },
  { id: 'sky_sabre', name: 'Sky Sabre (Land Ceptor) launcher', cls: 'sam_medium', producers: ['GBR'], inService: 2021, unitCostUsdM: 20, detectionKm: 100, channels: 3, load: { camm: 8 } },
  { id: 'spyder', name: 'SPYDER launcher', cls: 'sam_medium', producers: ['ISR'], inService: 2008, unitCostUsdM: 15, detectionKm: 110, channels: 2, load: { python5_sl: 4 } },
  { id: 'hisar_o_launcher', name: 'Hisar-O+ launcher', cls: 'sam_medium', producers: ['TUR'], inService: 2021, unitCostUsdM: 15, detectionKm: 100, channels: 2, load: { hisar_o: 6 } },
  // Iron Dome: US bought two batteries with interceptors for ~$373M (2019); 3-4 launchers of 20 Tamir each.
  { id: 'iron_dome', name: 'Iron Dome launcher', cls: 'sam_medium', producers: ['ISR', 'USA'], inService: 2011, unitCostUsdM: 40, detectionKm: 200, channels: 4, load: { tamir: 20 } },
  { id: 'pantsir_s1', name: 'Pantsir-S1/SM', cls: 'shorad', producers: ['RUS'], inService: 2012, unitCostUsdM: 15, armor: 0.15, detectionKm: 36, channels: 4, q: 1.3, load: { pantsir_57e6: 12 } },
  { id: 'tor_m2', name: 'Tor-M2', cls: 'shorad', producers: ['RUS'], inService: 2012, unitCostUsdM: 25, armor: 0.2, detectionKm: 32, channels: 4, q: 0.6, load: { tor_9m338: 16 } },
  // Gepard: credited with a large share of Shahed kills around Kyiv/Odesa, 2022-24.
  { id: 'gepard', name: 'Flakpanzer Gepard', cls: 'shorad', producers: [], inService: 1976, unitCostUsdM: 3, armor: 0.3, detectionKm: 15, channels: 1, q: 1.6, fp: { missile: 0.08 }, load: { shell_35_ahead: 34 } },
  { id: 'skynex', name: 'Skynex / Skyranger 35', cls: 'shorad', producers: ['DEU', 'CHE'], inService: 2021, unitCostUsdM: 20, detectionKm: 20, channels: 2, q: 2.0, fp: { missile: 0.1 }, load: { shell_35_ahead: 12 } },
  { id: 'm_shorad', name: 'M-SHORAD Inc 1 (Stryker)', cls: 'shorad', producers: ['USA'], inService: 2021, unitCostUsdM: 10, armor: 0.3, speedKph: 80, detectionKm: 20, channels: 2, q: 1.2, load: { stinger: 4, hellfire: 2, round_30mm: 30 } },
  { id: 'avenger', name: 'M1097 Avenger', cls: 'shorad', producers: ['USA'], inService: 1989, unitCostUsdM: 3, armor: 0.08, speedKph: 80, detectionKm: 10, channels: 1, q: 0.8, load: { stinger: 8 } },
  { id: 'tunguska', name: '2K22M Tunguska-M1', cls: 'shorad', producers: ['RUS'], inService: 1982, unitCostUsdM: 6, armor: 0.2, detectionKm: 18, channels: 1, q: 1.4 },
  { id: 'strela10', name: '9K35M3 Strela-10M3', cls: 'shorad', producers: [], inService: 1979, unitCostUsdM: 1, armor: 0.12, detectionKm: 10, channels: 1, q: 0.6, load: { strela10_9m333: 8 } },
  { id: 'hq17_launcher', name: 'HQ-17A', cls: 'shorad', producers: ['CHN'], inService: 2015, unitCostUsdM: 12, detectionKm: 25, channels: 2, q: 0.8, load: { hq17: 8 } },
  // Iron Beam 100 kW laser: operational deliveries to the IDF from late 2025; ~$2-3 per shot.
  { id: 'iron_beam', name: 'Iron Beam (100 kW laser)', cls: 'shorad', producers: ['ISR'], inService: 2025, unitCostUsdM: 30, detectionKm: 10, channels: 1, q: 0.5, fp: { missile: 0.3, helicopter: 0.05 } },
  { id: 'c_ram', name: 'LPWS C-RAM (Centurion)', cls: 'shorad', producers: ['USA'], inService: 2005, unitCostUsdM: 15, speedKph: 30, detectionKm: 10, channels: 1, q: 0.5, fp: { missile: 0.12 }, load: { ciws_burst: 15 } },
  { id: 'stinger_team', name: 'Stinger MANPADS team', cls: 'shorad', crew: 2, producers: ['USA', 'DEU'], inService: 1981, unitCostUsdM: 0.1, speedKph: 4, rangeKm: 40, fuelTph: 0, armor: 0.03, stealth: 0.6, detectionKm: 8, channels: 1, q: 0.6, load: { stinger: 3 } },
  { id: 'igla_team', name: 'Igla-S / Verba MANPADS team', cls: 'shorad', crew: 2, producers: ['RUS'], inService: 2004, unitCostUsdM: 0.05, speedKph: 4, rangeKm: 40, fuelTph: 0, armor: 0.03, stealth: 0.6, detectionKm: 6, channels: 1, q: 0.5, load: { igla_s: 3 } },
  { id: 'mistral_team', name: 'Mistral MANPADS team', cls: 'shorad', crew: 2, producers: ['FRA'], inService: 1989, unitCostUsdM: 0.1, speedKph: 4, rangeKm: 40, fuelTph: 0, armor: 0.03, stealth: 0.6, detectionKm: 8, channels: 1, q: 0.6, load: { mistral: 3 } },
  { id: 'piorun_team', name: 'Piorun MANPADS team', cls: 'shorad', crew: 2, producers: ['POL'], inService: 2019, unitCostUsdM: 0.05, speedKph: 4, rangeKm: 40, fuelTph: 0, armor: 0.03, stealth: 0.6, detectionKm: 6, channels: 1, q: 0.55, load: { piorun: 3 } },
  { id: 'rbs70_team', name: 'RBS 70 NG team', cls: 'shorad', crew: 3, producers: ['SWE'], inService: 2011, unitCostUsdM: 0.4, speedKph: 4, rangeKm: 40, fuelTph: 0, armor: 0.03, stealth: 0.6, detectionKm: 10, channels: 1, q: 0.6, load: { rbs70_ng: 3 } },
  { id: 'qw2_team', name: 'QW-2 / FN-6 MANPADS team', cls: 'shorad', crew: 2, producers: ['CHN'], inService: 2002, unitCostUsdM: 0.04, speedKph: 4, rangeKm: 40, fuelTph: 0, armor: 0.03, stealth: 0.6, detectionKm: 6, channels: 1, q: 0.5, load: { qw2: 3 } },
  { id: 'krasukha4', name: 'Krasukha-4 EW system', cls: 'ew', producers: ['RUS'], inService: 2014, unitCostUsdM: 15, detectionKm: 300 },
  { id: 'pole21', name: 'Pole-21 GNSS jammer', cls: 'ew', producers: ['RUS'], inService: 2016, unitCostUsdM: 1, detectionKm: 25 },
  // R-330Zh Zhitel: GPS, Iridium/Inmarsat and GSM jammer on a Ural truck, 100-2000 MHz (Protek; McDermott, ICDS 2017). Cost estimate.
  { id: 'zhitel', name: 'R-330Zh Zhitel jammer', cls: 'ew', producers: ['RUS'], inService: 2011, unitCostUsdM: 2, detectionKm: 25 },
  // RB-301B Borisoglebsk-2: HF/VHF communications and drone-link jamming on MT-LB chassis (McDermott 2017). Cost estimate.
  { id: 'borisoglebsk2', name: 'RB-301B Borisoglebsk-2 EW complex', cls: 'ew', producers: ['RUS'], inService: 2015, unitCostUsdM: 5, detectionKm: 30 },
  // RB-341V Leer-3: three Orlan-10 drones carrying GSM jammers, 6 km each, controlled to 120 km (McDermott 2017). Cost estimate.
  { id: 'leer3', name: 'RB-341V Leer-3 airborne EW', cls: 'ew', producers: ['RUS'], inService: 2015, unitCostUsdM: 2, detectionKm: 120 },
  { id: 'bukovel', name: 'Bukovel-AD counter-UAS EW', cls: 'ew', producers: ['UKR'], inService: 2016, unitCostUsdM: 1, detectionKm: 100 },
  { id: 'tls_bct', name: 'TLS-BCT Manpack/vehicle EW (US Army)', cls: 'ew', producers: ['USA'], inService: 2024, unitCostUsdM: 10, detectionKm: 150 },
  { id: 'jy27a', name: 'JY-27A VHF counter-stealth radar', cls: 'radar', producers: ['CHN'], inService: 2015, unitCostUsdM: 15, detectionKm: 500 },
  { id: 'nebo_m', name: '55Zh6M Nebo-M radar complex', cls: 'radar', producers: ['RUS'], inService: 2017, unitCostUsdM: 100, detectionKm: 600 },
  { id: 'giraffe_4a', name: 'Giraffe 4A / TRML-4D', cls: 'radar', producers: ['SWE', 'DEU'], inService: 2018, unitCostUsdM: 20, detectionKm: 280 },
];

export const landPlatforms = [...tanks, ...ifvs, ...carriers, ...recon, ...artillery, ...rockets, ...antiTank, ...infantry, ...logistics, ...airDefense].map(toPlatform);

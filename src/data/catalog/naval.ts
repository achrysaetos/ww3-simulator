/**
 * Surface ships: carriers, amphibious ships, cruisers, destroyers, frigates,
 * corvettes, patrol and mine-warfare craft, replenishment and merchant
 * shipping, and uncrewed surface vessels.
 *
 * Loadouts fill the real launcher count: an Arleigh Burke Flight III's 96 Mk 41
 * cells hold 32 SM-2, 16 SM-6, 32 ESSM (quad-packed in 8 cells), 24 Tomahawk,
 * 8 SM-3 and 8 ASROC. engagementChannels is simultaneous air targets the
 * fire-control radars can guide missiles against. Crew is ship's company;
 * a carrier's air wing personnel come with its aircraft. Merchant capacity
 * is deadweight cargo in tons.
 *
 * US costs from Navy SCN budget books and CRS (RL32665 shipbuilding, RL32109
 * DDG-51); Chinese and Russian costs are estimates.
 */
import { toPlatform, type PlatformSpec } from './build';
import type { MunitionKey } from './munitions';

const carriers: PlatformSpec<MunitionKey>[] = [
  { id: 'gerald_r_ford', name: 'Gerald R. Ford-class CVN', cls: 'carrier', crew: 2600, producers: ['USA'], inService: 2017, unitCostUsdM: 13300, armor: 0.7, detectionKm: 450, channels: 4, capacity: { aircraft: 75 }, load: { essm2: 32, ram_blk2: 42, ciws_burst: 60 } },
  { id: 'nimitz', name: 'Nimitz-class CVN', cls: 'carrier', producers: [], inService: 1975, unitCostUsdM: 8500, armor: 0.7, detectionKm: 400, channels: 3, capacity: { aircraft: 64 }, load: { essm2: 16, ram_blk2: 42, ciws_burst: 40 } },
  // Fujian (Type 003): electromagnetic catapults, conventional power; commissioned November 2025.
  { id: 'fujian', name: 'Fujian (Type 003)', cls: 'carrier', crew: 2500, producers: ['CHN'], inService: 2025, unitCostUsdM: 7000, rangeKm: 15000, fuelTph: 8, armor: 0.6, detectionKm: 450, channels: 4, capacity: { aircraft: 60 }, load: { hq10: 48, ciws_burst: 60 } },
  { id: 'shandong', name: 'Shandong (Type 002)', cls: 'carrier', crew: 2000, producers: ['CHN'], inService: 2019, unitCostUsdM: 4000, speedKph: 50, rangeKm: 15000, fuelTph: 8, armor: 0.5, detectionKm: 400, channels: 3, capacity: { aircraft: 40 }, load: { hq10: 36, ciws_burst: 40 } },
  { id: 'liaoning', name: 'Liaoning (Type 001)', cls: 'carrier', crew: 2000, producers: [], inService: 2012, unitCostUsdM: 2000, speedKph: 50, rangeKm: 15000, fuelTph: 8, armor: 0.5, detectionKm: 350, channels: 3, capacity: { aircraft: 36 }, load: { hq10: 36, ciws_burst: 40 } },
  { id: 'kuznetsov', name: 'Admiral Kuznetsov', cls: 'carrier', crew: 1700, producers: [], inService: 1991, unitCostUsdM: 2000, speedKph: 45, rangeKm: 15000, fuelTph: 8, armor: 0.45, detectionKm: 300, channels: 2, capacity: { aircraft: 24 }, load: { tor_9m338: 192, ciws_burst: 40 } },
  { id: 'queen_elizabeth', name: 'Queen Elizabeth-class', cls: 'carrier', crew: 700, producers: ['GBR'], inService: 2017, unitCostUsdM: 4000, speedKph: 46, rangeKm: 18500, fuelTph: 5, armor: 0.45, detectionKm: 400, channels: 1, capacity: { aircraft: 40 }, load: { ciws_burst: 40 } },
  { id: 'charles_de_gaulle', name: 'Charles de Gaulle (R91)', cls: 'carrier', crew: 1950, producers: ['FRA'], inService: 2001, unitCostUsdM: 3500, speedKph: 50, armor: 0.55, detectionKm: 400, channels: 3, capacity: { aircraft: 40 }, load: { aster15: 32, mistral: 12 } },
  { id: 'vikrant', name: 'INS Vikrant (IAC-1)', cls: 'carrier', crew: 1600, producers: ['IND'], inService: 2022, unitCostUsdM: 2700, speedKph: 50, rangeKm: 15000, fuelTph: 6, armor: 0.45, detectionKm: 350, channels: 3, capacity: { aircraft: 30 }, load: { barak8: 32 } },
  { id: 'vikramaditya', name: 'INS Vikramaditya', cls: 'carrier', crew: 1600, producers: [], inService: 2013, unitCostUsdM: 2300, speedKph: 50, rangeKm: 13000, fuelTph: 7, armor: 0.4, detectionKm: 300, channels: 2, capacity: { aircraft: 26 }, load: { barak8: 16 } },
  { id: 'cavour', name: 'Cavour (C550)', cls: 'carrier', crew: 600, producers: ['ITA'], inService: 2008, unitCostUsdM: 1800, speedKph: 48, rangeKm: 13000, fuelTph: 4, armor: 0.4, detectionKm: 300, channels: 2, capacity: { aircraft: 20 }, load: { aster15: 32 } },
  { id: 'izumo', name: 'Izumo-class (F-35B conversion)', cls: 'carrier', crew: 470, producers: ['JPN'], inService: 2015, unitCostUsdM: 1100, speedKph: 50, rangeKm: 11000, fuelTph: 4, armor: 0.35, detectionKm: 300, channels: 2, capacity: { aircraft: 12 }, load: { ram_blk2: 22, ciws_burst: 20 } },
];

const amphibious: PlatformSpec<MunitionKey>[] = [
  { id: 'america_lha', name: 'America-class LHA', cls: 'amphibious', crew: 1100, producers: ['USA'], inService: 2014, unitCostUsdM: 3400, rangeKm: 17000, fuelTph: 4, detectionKm: 300, channels: 2, capacity: { troops: 1680, aircraft: 20 }, load: { essm2: 16, ram_blk2: 42 } },
  { id: 'wasp_lhd', name: 'Wasp-class LHD', cls: 'amphibious', crew: 1100, producers: [], inService: 1989, unitCostUsdM: 2000, rangeKm: 17000, fuelTph: 4, detectionKm: 250, channels: 2, capacity: { troops: 1680, aircraft: 30, vehicles: 50 }, load: { essm2: 16, ram_blk2: 42 } },
  { id: 'san_antonio', name: 'San Antonio-class LPD', cls: 'amphibious', crew: 380, producers: ['USA'], inService: 2006, unitCostUsdM: 1900, rangeKm: 14000, fuelTph: 3, detectionKm: 200, channels: 1, capacity: { troops: 700, vehicles: 40 }, load: { ram_blk2: 42 } },
  { id: 'type075', name: 'Type 075 LHD', cls: 'amphibious', crew: 1000, producers: ['CHN'], inService: 2021, unitCostUsdM: 3000, rangeKm: 15000, fuelTph: 4, detectionKm: 250, channels: 2, capacity: { troops: 1200, aircraft: 30, vehicles: 40 }, load: { hq10: 48, ciws_burst: 40 } },
  { id: 'type071', name: 'Type 071 LPD', cls: 'amphibious', crew: 120, producers: ['CHN'], inService: 2007, unitCostUsdM: 600, rangeKm: 11000, fuelTph: 3, detectionKm: 150, channels: 1, capacity: { troops: 800, vehicles: 40 }, load: { ciws_burst: 40 } },
  { id: 'type072a', name: 'Type 072A LST', cls: 'amphibious', crew: 100, producers: ['CHN'], inService: 2003, unitCostUsdM: 100, speedKph: 32, rangeKm: 5500, fuelTph: 1, detectionKm: 60, capacity: { troops: 250, vehicles: 10 } },
  // Older and smaller PLAN landing ships (Yuting II, Yunshu, Yuhai); capacities from builders' figures as reported by Jane's.
  { id: 'type072_iii', name: 'Type 072-III LST (Yuting II)', cls: 'amphibious', crew: 100, producers: [], inService: 1992, unitCostUsdM: 60, speedKph: 32, rangeKm: 5500, fuelTph: 1, detectionKm: 60, capacity: { troops: 250, vehicles: 10 } },
  { id: 'type073a', name: 'Type 073A LSM (Yunshu)', cls: 'amphibious', crew: 70, producers: [], inService: 2004, unitCostUsdM: 40, speedKph: 31, rangeKm: 3500, fuelTph: 0.6, detectionKm: 40, capacity: { troops: 150, vehicles: 6 } },
  { id: 'type074', name: 'Type 074 LSM (Yuhai)', cls: 'amphibious', crew: 56, producers: [], inService: 1995, unitCostUsdM: 20, speedKph: 26, rangeKm: 2800, fuelTph: 0.4, detectionKm: 40, capacity: { troops: 250, vehicles: 2 } },
  { id: 'mistral_lhd', name: 'Mistral-class LHD', cls: 'amphibious', crew: 180, producers: ['FRA'], inService: 2006, unitCostUsdM: 600, rangeKm: 19800, fuelTph: 2, detectionKm: 200, channels: 1, capacity: { troops: 450, aircraft: 16, vehicles: 59 }, load: { mistral: 12 } },
  { id: 'juan_carlos', name: 'Juan Carlos I LHD', cls: 'amphibious', crew: 260, producers: ['ESP'], inService: 2010, unitCostUsdM: 500, rangeKm: 17000, fuelTph: 2.5, detectionKm: 200, capacity: { troops: 900, aircraft: 25, vehicles: 46 } },
  { id: 'anadolu', name: 'TCG Anadolu', cls: 'amphibious', crew: 260, producers: ['TUR'], inService: 2023, unitCostUsdM: 1000, rangeKm: 17000, fuelTph: 2.5, detectionKm: 200, capacity: { troops: 1200, aircraft: 12, vehicles: 40 } },
  { id: 'dokdo', name: 'Dokdo-class LPH', cls: 'amphibious', crew: 330, producers: ['KOR'], inService: 2007, unitCostUsdM: 650, rangeKm: 13000, fuelTph: 2.5, detectionKm: 200, channels: 1, capacity: { troops: 720, aircraft: 10, vehicles: 10 }, load: { ram_blk2: 21, ciws_burst: 20 } },
  { id: 'canberra_lhd', name: 'Canberra-class LHD', cls: 'amphibious', crew: 360, producers: ['AUS', 'ESP'], inService: 2014, unitCostUsdM: 1500, rangeKm: 17000, fuelTph: 2.5, detectionKm: 200, capacity: { troops: 1000, aircraft: 18, vehicles: 110 } },
  { id: 'ivan_gren', name: 'Ivan Gren-class LST', cls: 'amphibious', crew: 100, producers: ['RUS'], inService: 2018, unitCostUsdM: 200, speedKph: 33, rangeKm: 7400, fuelTph: 1.2, detectionKm: 100, capacity: { troops: 300, vehicles: 13 } },
  { id: 'ropucha', name: 'Ropucha-class LST', cls: 'amphibious', crew: 90, producers: [], inService: 1975, unitCostUsdM: 100, speedKph: 33, rangeKm: 6000, fuelTph: 1.2, detectionKm: 80, capacity: { troops: 225, vehicles: 10 } },
];

const combatants: PlatformSpec<MunitionKey>[] = [
  { id: 'ticonderoga', name: 'Ticonderoga-class CG', cls: 'cruiser', producers: [], inService: 1983, unitCostUsdM: 1000, detectionKm: 400, channels: 18, load: { sm2_iiic: 64, sm6: 8, tomahawk: 30, sm3_ib: 10, asroc: 10, harpoon: 8, mk54: 6, ciws_burst: 40 } },
  // Type 055: 112 GJB 5860 cells; YJ-21 hypersonic ASBM in VLS (paraded 2022).
  { id: 'type055', name: 'Type 055 Renhai', cls: 'cruiser', crew: 300, producers: ['CHN'], inService: 2020, unitCostUsdM: 900, stealth: 0.3, detectionKm: 450, channels: 16, q: 1.2, load: { hq9b: 48, yj18: 24, yj21: 8, cj10: 16, yu8: 16, hq10: 24, ciws_burst: 30 } },
  { id: 'kirov', name: 'Kirov-class (Pyotr Velikiy)', cls: 'cruiser', crew: 710, producers: [], inService: 1998, unitCostUsdM: 3000, rangeKm: 1e6, fuelTph: 0, armor: 0.4, detectionKm: 400, channels: 12, load: { p700: 20, s300_48n6e2: 96, tor_9m338: 128, type53: 10, ciws_burst: 40 } },
  { id: 'slava', name: 'Slava-class (Project 1164)', cls: 'cruiser', crew: 485, producers: [], inService: 1982, unitCostUsdM: 800, fuelTph: 4, detectionKm: 300, channels: 6, q: 0.85, load: { p1000: 16, s300_5v55: 64, ciws_burst: 30 } },
  { id: 'burke_flt3', name: 'Arleigh Burke Flight III DDG', cls: 'destroyer', crew: 330, producers: ['USA'], inService: 2023, unitCostUsdM: 2200, detectionKm: 500, channels: 24, q: 1.2, load: { sm2_iiic: 32, sm6: 16, essm2: 32, tomahawk: 24, sm3_iia: 8, asroc: 8, mk54: 6, ciws_burst: 30 } },
  { id: 'burke_flt2a', name: 'Arleigh Burke Flight IIA DDG', cls: 'destroyer', crew: 320, producers: ['USA'], inService: 2000, unitCostUsdM: 1800, detectionKm: 350, channels: 18, q: 1.1, load: { sm2_iiic: 40, sm6: 8, essm2: 32, tomahawk: 24, sm3_ib: 8, asroc: 8, mk54: 6, ciws_burst: 30 } },
  { id: 'burke_flt1', name: 'Arleigh Burke Flight I/II DDG', cls: 'destroyer', crew: 300, producers: [], inService: 1991, unitCostUsdM: 1500, detectionKm: 330, channels: 18, q: 1.0, load: { sm2_iiic: 40, tomahawk: 30, sm3_ib: 10, asroc: 10, harpoon: 8, mk54: 6, ciws_burst: 30 } },
  { id: 'zumwalt', name: 'Zumwalt-class DDG', cls: 'destroyer', crew: 175, producers: [], inService: 2016, unitCostUsdM: 4400, stealth: 0.8, detectionKm: 300, channels: 10, load: { sm2_iiic: 24, essm2: 32, tomahawk: 48 } },
  { id: 'type052d', name: 'Type 052D Luyang III', cls: 'destroyer', crew: 280, producers: ['CHN'], inService: 2014, unitCostUsdM: 600, stealth: 0.3, detectionKm: 400, channels: 12, q: 1.1, load: { hq9b: 32, yj18: 16, cj10: 8, yu8: 8, hq10: 24, ciws_burst: 30 } },
  { id: 'type052c', name: 'Type 052C Luyang II', cls: 'destroyer', crew: 280, producers: [], inService: 2004, unitCostUsdM: 400, detectionKm: 350, channels: 8, load: { hq9b: 48, yj62: 8, ciws_burst: 30 } },
  { id: 'sovremenny', name: 'Sovremenny-class (956/956EM)', cls: 'destroyer', crew: 350, producers: [], inService: 1999, unitCostUsdM: 600, rangeKm: 6500, fuelTph: 3, detectionKm: 250, channels: 6, q: 0.85, load: { p270: 8, buk_9m38: 48, ciws_burst: 30 } },
  { id: 'udaloy', name: 'Udaloy-class (1155/1155M)', cls: 'destroyer', producers: [], inService: 1980, unitCostUsdM: 500, rangeKm: 7000, detectionKm: 250, channels: 4, q: 0.85, fp: { submarine: 0.08 }, load: { type53: 8, tor_9m338: 64, kh35: 8, ciws_burst: 30 } },
  { id: 'type45', name: 'Type 45 Daring', cls: 'destroyer', crew: 190, producers: ['GBR'], inService: 2009, unitCostUsdM: 1500, stealth: 0.35, detectionKm: 400, channels: 12, q: 1.1, load: { aster30: 24, aster15: 24, harpoon: 8, ciws_burst: 20 } },
  { id: 'horizon', name: 'Horizon-class (Forbin/Andrea Doria)', cls: 'destroyer', crew: 190, producers: ['FRA', 'ITA'], inService: 2008, unitCostUsdM: 1400, stealth: 0.3, detectionKm: 350, channels: 12, load: { aster30: 32, aster15: 16, exocet: 8 } },
  // KDX-III: 128 cells, the largest VLS load of any destroyer.
  { id: 'sejong', name: 'Sejong the Great (KDX-III)', cls: 'destroyer', crew: 300, producers: ['KOR'], inService: 2008, unitCostUsdM: 1000, detectionKm: 350, channels: 18, q: 1.1, load: { sm2_iiic: 80, hyunmoo3c: 32, k745: 16, ssm700k: 16, ram_blk2: 21, ciws_burst: 20 } },
  { id: 'kdx2', name: 'Chungmugong Yi Sun-sin (KDX-II)', cls: 'destroyer', crew: 200, producers: ['KOR'], inService: 2003, unitCostUsdM: 400, detectionKm: 200, channels: 4, load: { sm2_iiic: 32, ssm700k: 8, ram_blk2: 21, k745: 6 } },
  { id: 'kongo', name: 'Kongo-class DDG', cls: 'destroyer', crew: 300, producers: ['JPN'], inService: 1993, unitCostUsdM: 1200, detectionKm: 330, channels: 16, load: { sm2_iiic: 70, sm3_ib: 8, asroc: 12, harpoon: 8, type12_lwt: 6, ciws_burst: 20 } },
  { id: 'maya', name: 'Maya-class DDG', cls: 'destroyer', crew: 300, producers: ['JPN'], inService: 2020, unitCostUsdM: 1500, detectionKm: 400, channels: 18, q: 1.15, load: { sm2_iiic: 56, sm6: 8, sm3_iia: 8, sm3_ib: 8, asroc: 16, type12_ssm: 8, type12_lwt: 6, ciws_burst: 20 } },
  { id: 'atago', name: 'Atago-class DDG', cls: 'destroyer', crew: 300, producers: ['JPN'], inService: 2007, unitCostUsdM: 1300, detectionKm: 350, channels: 18, q: 1.1, load: { sm2_iiic: 64, sm3_ib: 8, asroc: 16, type12_ssm: 8, type12_lwt: 6, ciws_burst: 20 } },
  { id: 'hobart', name: 'Hobart-class DDG', cls: 'destroyer', crew: 186, producers: ['AUS'], inService: 2017, unitCostUsdM: 2000, detectionKm: 330, channels: 12, load: { sm2_iiic: 32, sm6: 8, essm2: 32, harpoon: 8, mk54: 6 } },
  { id: 'kolkata', name: 'Kolkata-class (P-15A)', cls: 'destroyer', crew: 300, producers: ['IND'], inService: 2014, unitCostUsdM: 1000, detectionKm: 300, channels: 8, load: { brahmos: 16, barak8: 32, varunastra: 4 } },
  { id: 'visakhapatnam', name: 'Visakhapatnam-class (P-15B)', cls: 'destroyer', crew: 300, producers: ['IND'], inService: 2021, unitCostUsdM: 1200, detectionKm: 300, channels: 8, load: { brahmos: 16, barak8: 32, varunastra: 4 } },
  // Constellation FFG: GAO-24 puts first delivery around 2029.
  { id: 'constellation', name: 'Constellation-class FFG', cls: 'frigate', crew: 200, producers: ['USA'], inService: 2029, unitCostUsdM: 1100, detectionKm: 300, channels: 8, q: 1.15, load: { sm2_iiic: 16, essm2: 64, nsm: 16, ram_blk2: 21, mk54: 6 } },
  { id: 'fremm', name: 'FREMM (Aquitaine / Bergamini)', cls: 'frigate', crew: 145, producers: ['FRA', 'ITA'], inService: 2012, unitCostUsdM: 800, stealth: 0.35, detectionKm: 250, channels: 8, q: 1.1, load: { aster15: 16, aster30: 16, mdcn: 8, exocet: 8, mu90: 10 } },
  { id: 'admiral_gorshkov', name: 'Admiral Gorshkov (22350)', cls: 'frigate', crew: 210, producers: ['RUS'], inService: 2018, unitCostUsdM: 500, stealth: 0.3, detectionKm: 250, channels: 8, q: 1.1, load: { kalibr: 8, oniks: 4, zircon: 4, s400_9m96: 32, apr3: 8 } },
  { id: 'admiral_grigorovich', name: 'Admiral Grigorovich (11356R)', cls: 'frigate', producers: ['RUS'], inService: 2016, unitCostUsdM: 400, detectionKm: 200, channels: 4, load: { kalibr: 8, buk_9m317m: 24, type53: 4 } },
  { id: 'type054a', name: 'Type 054A Jiangkai II', cls: 'frigate', crew: 165, producers: ['CHN'], inService: 2008, unitCostUsdM: 350, detectionKm: 200, channels: 4, load: { hq16: 32, yj83: 8, yu7: 6, ciws_burst: 20 } },
  { id: 'type054b', name: 'Type 054B', cls: 'frigate', crew: 180, producers: ['CHN'], inService: 2025, unitCostUsdM: 500, stealth: 0.3, detectionKm: 250, channels: 6, q: 1.1, load: { hq16: 32, yj83: 8, yu8: 8, yu7: 6, ciws_burst: 20 } },
  { id: 'type23', name: 'Type 23 Duke-class', cls: 'frigate', crew: 185, producers: [], inService: 1990, unitCostUsdM: 300, detectionKm: 200, channels: 4, q: 1.05, fp: { submarine: 0.09 }, load: { camm: 32, nsm: 8, sting_ray: 4 } },
  { id: 'sachsen', name: 'Sachsen-class F124', cls: 'frigate', crew: 230, producers: ['DEU'], inService: 2004, unitCostUsdM: 900, detectionKm: 400, channels: 12, q: 1.1, load: { sm2_iiic: 24, essm2: 32, harpoon: 8, ram_blk2: 42, mu90: 6 } },
  { id: 'baden_wurttemberg', name: 'Baden-Wurttemberg-class F125', cls: 'frigate', crew: 120, producers: ['DEU'], inService: 2019, unitCostUsdM: 800, detectionKm: 200, channels: 2, q: 0.8, load: { harpoon: 8, ram_blk2: 42 } },
  { id: 'de_zeven_provincien', name: 'De Zeven Provincien-class LCF', cls: 'frigate', crew: 200, producers: ['NLD'], inService: 2002, unitCostUsdM: 600, detectionKm: 350, channels: 8, q: 1.05, load: { sm2_iiic: 32, essm2: 32, harpoon: 8, mk54: 4 } },
  { id: 'iver_huitfeldt', name: 'Iver Huitfeldt-class', cls: 'frigate', crew: 165, producers: ['DNK'], inService: 2011, unitCostUsdM: 330, detectionKm: 300, channels: 6, load: { sm2_iiic: 32, essm2: 24, harpoon: 16 } },
  { id: 'fridtjof_nansen', name: 'Fridtjof Nansen-class', cls: 'frigate', crew: 120, producers: ['NOR', 'ESP'], inService: 2006, unitCostUsdM: 600, detectionKm: 250, channels: 4, load: { essm2: 32, nsm: 8, sting_ray: 4 } },
  { id: 'alvaro_de_bazan', name: 'Alvaro de Bazan-class F100', cls: 'frigate', crew: 200, producers: ['ESP'], inService: 2002, unitCostUsdM: 800, detectionKm: 330, channels: 12, q: 1.05, load: { sm2_iiic: 32, essm2: 64, harpoon: 8, mk54: 4 } },
  { id: 'mogami', name: 'Mogami-class FFM', cls: 'frigate', crew: 90, producers: ['JPN'], inService: 2022, unitCostUsdM: 400, stealth: 0.4, detectionKm: 200, channels: 2, load: { ram_blk2: 11, type12_ssm: 8, type12_lwt: 6 } },
  { id: 'daegu', name: 'Daegu-class FFX-II', cls: 'frigate', crew: 120, producers: ['KOR'], inService: 2018, unitCostUsdM: 300, detectionKm: 200, channels: 2, load: { hyunmoo3c: 8, ssm700k: 8, k745: 6 } },
  { id: 'anzac', name: 'Anzac-class', cls: 'frigate', crew: 180, producers: [], inService: 1996, unitCostUsdM: 400, detectionKm: 200, channels: 4, load: { essm2: 32, harpoon: 8, mk54: 6 } },
  { id: 'halifax', name: 'Halifax-class', cls: 'frigate', crew: 225, producers: [], inService: 1992, unitCostUsdM: 600, detectionKm: 200, channels: 2, load: { essm2: 16, harpoon: 8, mk54: 6 } },
  { id: 'talwar', name: 'Talwar-class (11356)', cls: 'frigate', crew: 180, producers: ['IND', 'RUS'], inService: 2003, unitCostUsdM: 400, detectionKm: 200, channels: 4, load: { brahmos: 8, buk_9m317m: 24 } },
  { id: 'nilgiri', name: 'Nilgiri-class (P-17A)', cls: 'frigate', crew: 220, producers: ['IND'], inService: 2025, unitCostUsdM: 900, stealth: 0.35, detectionKm: 250, channels: 6, load: { brahmos: 8, barak8: 32, varunastra: 4 } },
  { id: 'istif', name: 'Istif-class (TF-100)', cls: 'frigate', crew: 125, producers: ['TUR'], inService: 2024, unitCostUsdM: 600, detectionKm: 200, channels: 4, load: { atmaca: 16, hisar_o: 16 } },
  { id: 'fdi', name: "FDI Amiral Ronarc'h", cls: 'frigate', crew: 125, producers: ['FRA'], inService: 2025, unitCostUsdM: 900, stealth: 0.35, detectionKm: 300, channels: 8, load: { aster30: 8, aster15: 8, exocet: 8, mu90: 4 } },
  { id: 'jamaran', name: 'Moudge-class (Jamaran)', cls: 'corvette', crew: 140, producers: ['IRN'], inService: 2010, unitCostUsdM: 100, detectionKm: 80, q: 0.7, load: { noor: 4 } },
  { id: 'type056a', name: 'Type 056A Jiangdao', cls: 'corvette', crew: 70, producers: ['CHN'], inService: 2013, unitCostUsdM: 100, detectionKm: 120, channels: 1, load: { yj83: 4, hq10: 8, yu7: 6 } },
  { id: 'steregushchiy', name: 'Steregushchiy (20380)', cls: 'corvette', producers: ['RUS'], inService: 2008, unitCostUsdM: 250, detectionKm: 150, channels: 2, load: { kh35: 8, s400_9m96: 12, apr3: 8 } },
  { id: 'karakurt', name: 'Karakurt (22800)', cls: 'corvette', crew: 39, producers: ['RUS'], inService: 2018, unitCostUsdM: 70, detectionKm: 100, channels: 1, load: { kalibr: 8, pantsir_57e6: 8 } },
  { id: 'buyan_m', name: 'Buyan-M (21631)', cls: 'corvette', crew: 29, producers: ['RUS'], inService: 2014, unitCostUsdM: 50, detectionKm: 80, channels: 1, load: { kalibr: 8, igla_s: 8 } },
  { id: 'lcs', name: 'Littoral Combat Ship (Freedom/Independence)', cls: 'corvette', crew: 70, producers: [], inService: 2008, unitCostUsdM: 500, speedKph: 70, detectionKm: 150, channels: 1, load: { nsm: 8, ram_blk2: 11 } },
  { id: 'saar6', name: "Sa'ar 6", cls: 'corvette', crew: 70, producers: ['DEU', 'ISR'], inService: 2020, unitCostUsdM: 450, detectionKm: 250, channels: 4, q: 1.2, load: { barak8: 32, tamir: 40, gabriel5: 16 } },
  { id: 'kamorta', name: 'Kamorta-class ASW corvette', cls: 'corvette', crew: 120, producers: ['IND'], inService: 2014, unitCostUsdM: 250, detectionKm: 120, fp: { submarine: 0.06 }, load: { varunastra: 4 } },
  { id: 'gowind', name: 'Gowind 2500', cls: 'corvette', crew: 80, producers: ['FRA', 'EGY', 'MYS'], inService: 2017, unitCostUsdM: 400, detectionKm: 150, channels: 2, load: { exocet: 8, mica_ng: 16 } },
  { id: 'visby', name: 'Visby-class', cls: 'corvette', crew: 43, producers: ['SWE'], inService: 2009, unitCostUsdM: 180, speedKph: 65, stealth: 0.7, detectionKm: 120, load: { rbs15: 8 } },
  { id: 'ada', name: 'Ada-class (MILGEM)', cls: 'corvette', crew: 93, producers: ['TUR', 'PAK'], inService: 2011, unitCostUsdM: 250, detectionKm: 150, channels: 1, load: { harpoon: 8, ram_blk2: 21 } },
  { id: 'tuo_chiang', name: 'Tuo Chiang-class', cls: 'corvette', crew: 41, producers: ['TWN'], inService: 2014, unitCostUsdM: 100, speedKph: 70, stealth: 0.5, detectionKm: 100, load: { hf3: 8, hf2e: 8 } },
];

const minorAndSupport: PlatformSpec<MunitionKey>[] = [
  { id: 'type022', name: 'Type 022 Houbei missile boat', cls: 'patrol', crew: 12, producers: ['CHN'], inService: 2004, unitCostUsdM: 30, speedKph: 70, rangeKm: 1500, stealth: 0.5, load: { yj83: 8 } },
  // IRGCN fast attack craft (Peykaap, Seraj, Zolfaghar classes): swarm tactics in the Strait of Hormuz.
  { id: 'iran_fac', name: 'IRGCN fast attack craft', cls: 'patrol', crew: 6, producers: ['IRN'], inService: 2010, unitCostUsdM: 1, speedKph: 90, rangeKm: 500, fuelTph: 0.2, armor: 0.05, stealth: 0.5, detectionKm: 20, load: { noor: 2 } },
  { id: 'gumdoksuri', name: 'Gumdoksuri-class PKG', cls: 'patrol', producers: ['KOR'], inService: 2008, unitCostUsdM: 50, speedKph: 75, load: { ssm700k: 4 } },
  { id: 'bykov', name: 'Vasily Bykov (22160) patrol ship', cls: 'patrol', crew: 80, producers: ['RUS'], inService: 2018, unitCostUsdM: 100, speedKph: 40, rangeKm: 6000, fuelTph: 0.8 },
  { id: 'nsc', name: 'Legend-class National Security Cutter', cls: 'patrol', crew: 120, producers: ['USA'], inService: 2008, unitCostUsdM: 700, speedKph: 52, rangeKm: 22000, fuelTph: 1.2, detectionKm: 150 },
  { id: 'avenger_mcm', name: 'Avenger-class MCM', cls: 'mine_warfare', crew: 84, producers: [], inService: 1987, unitCostUsdM: 120 },
  { id: 'alexandrit', name: 'Alexandrit (12700) MCM', cls: 'mine_warfare', crew: 44, producers: ['RUS'], inService: 2016, unitCostUsdM: 80 },
  { id: 'type082ii', name: 'Type 082II Wozang MCM', cls: 'mine_warfare', producers: ['CHN'], inService: 2005, unitCostUsdM: 60 },
  { id: 'tripartite', name: 'Tripartite-class MCM', cls: 'mine_warfare', crew: 40, producers: [], inService: 1984, unitCostUsdM: 60 },
  // Replenishment and merchant: capacity.cargoTons is deliverable fuel/cargo.
  { id: 'john_lewis', name: 'John Lewis-class T-AO', cls: 'replenishment', crew: 125, producers: ['USA'], inService: 2022, unitCostUsdM: 640, capacity: { cargoTons: 21000 } },
  { id: 'kaiser', name: 'Henry J. Kaiser-class T-AO', cls: 'replenishment', crew: 89, producers: [], inService: 1986, unitCostUsdM: 300, capacity: { cargoTons: 24000 } },
  { id: 'lewis_and_clark', name: 'Lewis and Clark-class T-AKE', cls: 'replenishment', crew: 125, producers: [], inService: 2006, unitCostUsdM: 500, capacity: { cargoTons: 10000 } },
  { id: 'type901', name: 'Type 901 fast combat support ship', cls: 'replenishment', crew: 200, producers: ['CHN'], inService: 2017, unitCostUsdM: 300, speedKph: 46, capacity: { cargoTons: 25000 } },
  { id: 'type903a', name: 'Type 903A replenishment ship', cls: 'replenishment', crew: 130, producers: ['CHN'], inService: 2013, unitCostUsdM: 150, capacity: { cargoTons: 11000 } },
  { id: 'tide_class', name: 'Tide-class tanker (RFA)', cls: 'replenishment', crew: 63, producers: ['KOR'], inService: 2017, unitCostUsdM: 200, capacity: { cargoTons: 19000 } },
  { id: 'berlin_class', name: 'Berlin-class EGV', cls: 'replenishment', crew: 140, producers: ['DEU'], inService: 2001, unitCostUsdM: 300, capacity: { cargoTons: 9000 } },
  { id: 'akademik_pashin', name: 'Akademik Pashin (23130)', cls: 'replenishment', crew: 25, producers: ['RUS'], inService: 2020, unitCostUsdM: 150, capacity: { cargoTons: 9000 } },
  { id: 'lmsr', name: 'LMSR (Bob Hope/Watson-class)', cls: 'cargo_ship', crew: 30, producers: [], inService: 1998, unitCostUsdM: 300, speedKph: 44, rangeKm: 22000, fuelTph: 4, capacity: { cargoTons: 15000, vehicles: 900 } },
  // Chinese civilian RO-RO ferries exercise with the PLA as amphibious lift (Bohai Ferry, 2020s).
  { id: 'roro_ferry', name: 'RO-PAX / RO-RO ferry', cls: 'cargo_ship', crew: 40, producers: ['CHN', 'KOR', 'JPN', 'ITA', 'FIN', 'DEU', 'TUR'], inService: 2010, unitCostUsdM: 60, speedKph: 40, rangeKm: 8000, fuelTph: 2, capacity: { cargoTons: 5000, troops: 1000, vehicles: 300 } },
  { id: 'container_ship', name: 'Feeder container ship (~2,500 TEU)', cls: 'cargo_ship', producers: ['CHN', 'KOR', 'JPN'], inService: 2010, unitCostUsdM: 40, capacity: { cargoTons: 30000 } },
  { id: 'bulk_carrier', name: 'Handymax bulk carrier', cls: 'cargo_ship', crew: 22, producers: ['CHN', 'KOR', 'JPN'], inService: 2010, unitCostUsdM: 30, speedKph: 26, fuelTph: 1.2, capacity: { cargoTons: 50000 } },
  { id: 'product_tanker', name: 'MR product tanker (50k dwt)', cls: 'tanker_ship', producers: ['CHN', 'KOR', 'JPN'], inService: 2010, unitCostUsdM: 45, speedKph: 27, capacity: { cargoTons: 50000 } },
  { id: 'vlcc', name: 'VLCC crude tanker', cls: 'tanker_ship', crew: 30, producers: ['CHN', 'KOR', 'JPN'], inService: 2010, unitCostUsdM: 120, fuelTph: 2.5, capacity: { cargoTons: 300000 } },
  { id: 'lng_carrier', name: 'LNG carrier (174k m3)', cls: 'tanker_ship', crew: 30, producers: ['KOR', 'CHN', 'JPN'], inService: 2015, unitCostUsdM: 250, speedKph: 35, fuelTph: 3, capacity: { cargoTons: 78000 } },
  // Magura V5 / Sea Baby: sank or damaged roughly a third of the Black Sea Fleet's major units 2023-24.
  { id: 'magura_v5', name: 'Magura V5 strike USV', cls: 'usv', producers: ['UKR'], inService: 2023, unitCostUsdM: 0.25, speedKph: 40, rangeKm: 800, fp: { ship: 0.05 } },
  { id: 'magura_v7', name: 'Magura V7 (AAM-armed USV)', cls: 'usv', producers: ['UKR'], inService: 2025, unitCostUsdM: 0.4, speedKph: 40, rangeKm: 1000, fp: { ship: 0.02, aircraft: 0.01 }, load: { r73: 2 } },
  { id: 'sea_baby', name: 'Sea Baby strike USV', cls: 'usv', producers: ['UKR'], inService: 2023, unitCostUsdM: 0.25, speedKph: 45, rangeKm: 1000, fp: { ship: 0.05, structure: 0.01 } },
  { id: 'mantas_t12', name: 'MARTAC Mantas T-12 / Devil Ray', cls: 'usv', producers: ['USA'], inService: 2022, unitCostUsdM: 0.3, speedKph: 50, rangeKm: 300, fp: {}, detectionKm: 15 },
  { id: 'sea_hunter', name: 'Sea Hunter MUSV', cls: 'usv', producers: ['USA'], inService: 2016, unitCostUsdM: 20, speedKph: 50, rangeKm: 18000, fuelTph: 0.2, fp: {}, detectionKm: 60 },
];

export const navalPlatforms = [...carriers, ...amphibious, ...combatants, ...minorAndSupport].map(toPlatform);

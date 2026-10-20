/**
 * Aircraft, helicopters and drones. Firepower follows the calibration in
 * land.ts. rangeKm is unrefuelled combat radius; speedKph is a sustained
 * cruise for the mission, not the dash maximum.
 *
 * stealth: 0.95 for F-22/B-2 class all-aspect low observables, ~0.8-0.9 for
 * F-35/J-20, ~0.6 for Su-57 (front-aspect only per most open assessments),
 * 0.15-0.3 for 4.5-generation types with reduced RCS and strong EW, ~0.05 for
 * large transports and bombers.
 *
 * loadout is one representative mixed load per airframe; a formation's
 * magazine is that load times the number of aircraft. US flyaway costs from
 * FY2024-25 budget books and SAR; foreign costs from export contracts or
 * estimates where marked.
 */
import { toPlatform, type PlatformSpec } from './build';
import type { MunitionKey } from './munitions';

const fighters: PlatformSpec<MunitionKey>[] = [
  { id: 'f22a', name: 'F-22A Raptor', cls: 'fighter', producers: [], inService: 2005, unitCostUsdM: 143, speedKph: 1300, rangeKm: 850, fuelTph: 4.5, armor: 0.15, stealth: 0.95, detectionKm: 220, q: 1.6, load: { aim120d: 6, aim9x: 2 } },
  // F-35A Lot 15-17 flyaway ~$82.5M.
  { id: 'f35a', name: 'F-35A Lightning II', cls: 'multirole', producers: ['USA', 'ITA', 'JPN'], inService: 2016, unitCostUsdM: 82.5, speedKph: 950, rangeKm: 1100, fuelTph: 3.5, armor: 0.15, stealth: 0.9, detectionKm: 180, q: 1.35, load: { aim120d: 2, gbu31: 2 } },
  { id: 'f35b', name: 'F-35B Lightning II', cls: 'multirole', producers: ['USA'], inService: 2015, unitCostUsdM: 109, speedKph: 950, rangeKm: 870, fuelTph: 3.5, armor: 0.15, stealth: 0.88, detectionKm: 180, q: 1.25, load: { aim120d: 2, gbu38: 2 } },
  { id: 'f35c', name: 'F-35C Lightning II', cls: 'multirole', producers: ['USA'], inService: 2019, unitCostUsdM: 102, speedKph: 950, rangeKm: 1150, fuelTph: 3.6, armor: 0.15, stealth: 0.9, detectionKm: 180, q: 1.3, load: { aim120d: 2, gbu31: 2 } },
  { id: 'f15ex', name: 'F-15EX Eagle II', cls: 'multirole', crew: 2, producers: ['USA'], inService: 2024, unitCostUsdM: 90, speedKph: 950, rangeKm: 1270, fuelTph: 5, stealth: 0.1, detectionKm: 200, q: 1.35, load: { aim120d: 8, aim9x: 2, jassm_er: 2 } },
  { id: 'f15e', name: 'F-15E Strike Eagle', cls: 'multirole', crew: 2, producers: ['USA'], inService: 1988, unitCostUsdM: 40, speedKph: 950, rangeKm: 1270, fuelTph: 5, stealth: 0.08, detectionKm: 170, q: 1.15, load: { aim120c: 2, aim9x: 2, gbu31: 4 } },
  { id: 'f15c', name: 'F-15C Eagle', cls: 'fighter', producers: [], inService: 1979, unitCostUsdM: 30, speedKph: 950, rangeKm: 1200, fuelTph: 5, stealth: 0.05, detectionKm: 160, q: 1.15, load: { aim120c: 6, aim9x: 2 } },
  { id: 'f16v', name: 'F-16 Block 70/72 (F-16V)', cls: 'multirole', producers: ['USA'], inService: 2023, unitCostUsdM: 64, rangeKm: 550, detectionKm: 150, q: 1.2, load: { aim120c: 4, aim9x: 2, gbu31: 2 } },
  // Israel's two-seat strike variants carry its air-launched ballistic missiles: ROCKS and Air LORA on the
  // F-15I Ra'am, Rampage on the F-16I Sufa (IISS Military Balance 2025; Israeli MoD and manufacturer releases).
  { id: 'f15i', name: "F-15I Ra'am", cls: 'multirole', crew: 2, producers: [], inService: 1998, unitCostUsdM: 45, speedKph: 950, rangeKm: 1270, fuelTph: 5, stealth: 0.08, detectionKm: 170, q: 1.15, load: { aim120c: 2, aim9x: 2, gbu31: 4, rocks: 2, air_lora: 1 } },
  { id: 'f16i', name: 'F-16I Sufa', cls: 'multirole', crew: 2, producers: [], inService: 2004, unitCostUsdM: 45, rangeKm: 650, detectionKm: 120, q: 1.05, load: { aim120c: 2, aim9x: 2, gbu12: 2, rampage: 2 } },
  { id: 'f16c', name: 'F-16C Block 50/52', cls: 'multirole', producers: ['USA'], inService: 1994, unitCostUsdM: 35, rangeKm: 550, detectionKm: 110, q: 1.0, load: { aim120c: 2, aim9x: 2, gbu12: 2 } },
  { id: 'f16am', name: 'F-16AM/BM MLU', cls: 'multirole', producers: [], inService: 1980, unitCostUsdM: 20, rangeKm: 550, detectionKm: 100, q: 0.85, load: { aim120c: 2, aim9x: 2, gbu12: 2 } },
  { id: 'f18e', name: 'F/A-18E/F Super Hornet Block III', cls: 'multirole', producers: ['USA'], inService: 2001, unitCostUsdM: 67, rangeKm: 720, fuelTph: 4, stealth: 0.15, detectionKm: 150, q: 1.15, load: { aim120d: 4, aim9x: 2, gbu31: 2 } },
  { id: 'f18c', name: 'F/A-18C/D Hornet', cls: 'multirole', producers: [], inService: 1987, unitCostUsdM: 30, rangeKm: 600, fuelTph: 3.5, detectionKm: 110, q: 0.95, load: { aim120c: 2, aim9x: 2, gbu12: 2 } },
  { id: 'f4e', name: 'F-4E Phantom II', cls: 'multirole', crew: 2, producers: [], inService: 1967, unitCostUsdM: 10, rangeKm: 700, fuelTph: 6, stealth: 0.02, detectionKm: 80, q: 0.7, load: { aim7m: 2, ir_aam_old: 2, mk82: 6 } },
  { id: 'f14a_irn', name: 'F-14AM Tomcat (Iran)', cls: 'fighter', crew: 2, producers: [], inService: 1976, unitCostUsdM: 20, rangeKm: 900, fuelTph: 6, stealth: 0.02, detectionKm: 150, q: 0.75, load: { aim54: 2, ir_aam_old: 2 } },
  { id: 'f5e', name: 'F-5E/F Tiger II', cls: 'fighter', producers: [], inService: 1975, unitCostUsdM: 5, rangeKm: 400, fuelTph: 2, stealth: 0.25, detectionKm: 35, q: 0.5, load: { ir_aam_old: 2 } },
  { id: 'su35s', name: 'Su-35S Flanker-E', cls: 'multirole', producers: ['RUS'], inService: 2014, unitCostUsdM: 45, rangeKm: 1300, fuelTph: 5, stealth: 0.15, detectionKm: 200, q: 1.25, load: { r77_1: 4, r37m: 2, r73: 2, kh31p: 2 } },
  { id: 'su57', name: 'Su-57 Felon', cls: 'multirole', producers: ['RUS'], inService: 2020, unitCostUsdM: 40, rangeKm: 1200, fuelTph: 5, stealth: 0.6, detectionKm: 200, q: 1.35, load: { r77m: 4, r73: 2, kh59mk2: 2 } },
  { id: 'su34', name: 'Su-34 Fullback', cls: 'multirole', crew: 2, producers: ['RUS'], inService: 2014, unitCostUsdM: 36, rangeKm: 1100, fuelTph: 5.5, armor: 0.25, stealth: 0.08, detectionKm: 150, q: 1.1, fp: { aircraft: 0.12, armor: 0.25, soft: 0.35, structure: 0.1 }, load: { fab1500_umpk: 2, fab500_umpk: 2, kh31p: 2, r73: 2, r77_1: 2 } },
  { id: 'su30sm2', name: 'Su-30SM2', cls: 'multirole', crew: 2, producers: ['RUS'], inService: 2012, unitCostUsdM: 40, rangeKm: 1300, fuelTph: 5.5, stealth: 0.1, detectionKm: 180, q: 1.15, load: { r77_1: 4, r73: 2, kh59mk2: 2 } },
  { id: 'su30mki', name: 'Su-30MKI', cls: 'multirole', crew: 2, producers: ['IND', 'RUS'], inService: 2002, unitCostUsdM: 50, rangeKm: 1300, fuelTph: 5.5, stealth: 0.08, detectionKm: 170, q: 1.15, load: { r77_1: 4, r73: 2, brahmos: 1 } },
  { id: 'su30mk', name: 'Su-30MKK/MK2 (export)', cls: 'multirole', crew: 2, producers: [], inService: 2000, unitCostUsdM: 35, rangeKm: 1300, fuelTph: 5.5, stealth: 0.08, detectionKm: 140, q: 1.0, load: { r77_1: 4, r73: 2, kh31a: 2 } },
  { id: 'su27', name: 'Su-27S/SM Flanker', cls: 'fighter', producers: [], inService: 1985, unitCostUsdM: 30, rangeKm: 1300, fuelTph: 5.5, stealth: 0.05, detectionKm: 120, q: 1.0, load: { r27er: 4, r73: 2 } },
  { id: 'mig31bm', name: 'MiG-31BM Foxhound', cls: 'fighter', crew: 2, producers: ['RUS'], inService: 2015, unitCostUsdM: 40, speedKph: 1700, rangeKm: 720, fuelTph: 9, stealth: 0.02, detectionKm: 320, q: 1.2, load: { r37m: 4, r77_1: 2 } },
  { id: 'mig31k', name: 'MiG-31K/I (Kinzhal carrier)', cls: 'multirole', crew: 2, producers: ['RUS'], inService: 2018, unitCostUsdM: 40, speedKph: 1700, rangeKm: 720, fuelTph: 9, stealth: 0.02, detectionKm: 200, q: 0.3, load: { kinzhal: 1 } },
  { id: 'mig29', name: 'MiG-29 (9.12/9.13)', cls: 'fighter', producers: [], inService: 1983, unitCostUsdM: 20, rangeKm: 700, fuelTph: 4, stealth: 0.08, detectionKm: 70, q: 0.85, load: { r27er: 2, r73: 4 } },
  { id: 'mig29k', name: 'MiG-29K/KUB', cls: 'multirole', producers: ['RUS'], inService: 2010, unitCostUsdM: 40, rangeKm: 850, fuelTph: 4.5, stealth: 0.08, detectionKm: 120, q: 1.0, load: { r77_1: 4, r73: 2, kh35: 2 } },
  { id: 'mig21', name: 'MiG-21bis / J-7 / F-7', cls: 'fighter', producers: [], inService: 1966, unitCostUsdM: 4, rangeKm: 350, fuelTph: 2.5, stealth: 0.2, detectionKm: 30, q: 0.45, load: { ir_aam_old: 2 } },
  { id: 'j20a', name: 'J-20A Mighty Dragon', cls: 'multirole', producers: ['CHN'], inService: 2017, unitCostUsdM: 110, speedKph: 1000, rangeKm: 1100, fuelTph: 5, armor: 0.15, stealth: 0.8, detectionKm: 220, q: 1.35, fp: { armor: 0.08, soft: 0.1 }, load: { pl15: 4, pl10: 2 } },
  // J-35 carrier variant seen on Fujian trials 2025; service date an estimate.
  { id: 'j35', name: 'J-35 (carrier/land)', cls: 'multirole', producers: ['CHN'], inService: 2026, unitCostUsdM: 80, rangeKm: 1100, fuelTph: 4, armor: 0.15, stealth: 0.85, detectionKm: 200, q: 1.3, load: { pl15: 4, pl10: 2 } },
  { id: 'j16', name: 'J-16', cls: 'multirole', crew: 2, producers: ['CHN'], inService: 2015, unitCostUsdM: 60, rangeKm: 1300, fuelTph: 5.5, stealth: 0.15, detectionKm: 200, q: 1.25, load: { pl15: 4, pl10: 2, yj83: 2 } },
  { id: 'j11b', name: 'J-11B/BS', cls: 'fighter', producers: ['CHN'], inService: 2007, unitCostUsdM: 30, rangeKm: 1300, fuelTph: 5.5, stealth: 0.08, detectionKm: 140, q: 1.05, load: { pl12: 4, pl10: 2 } },
  { id: 'j10c', name: 'J-10C', cls: 'multirole', producers: ['CHN'], inService: 2018, unitCostUsdM: 40, rangeKm: 550, detectionKm: 170, q: 1.15, load: { pl15: 4, pl10: 2 } },
  { id: 'j15', name: 'J-15/J-15T', cls: 'multirole', producers: ['CHN'], inService: 2013, unitCostUsdM: 60, rangeKm: 900, fuelTph: 5.5, stealth: 0.08, detectionKm: 150, q: 1.05, load: { pl12: 4, pl10: 2, yj83: 2 } },
  { id: 'jf17_blk3', name: 'JF-17 Block III', cls: 'multirole', producers: ['PAK', 'CHN'], inService: 2023, unitCostUsdM: 30, rangeKm: 550, fuelTph: 2.5, detectionKm: 150, q: 1.0, load: { pl15: 2, pl10: 2, ft12: 2 } },
  { id: 'rafale', name: 'Rafale F3R/F4', cls: 'multirole', producers: ['FRA'], inService: 2006, unitCostUsdM: 100, rangeKm: 1000, fuelTph: 3.5, stealth: 0.3, detectionKm: 180, q: 1.35, load: { meteor: 4, mica_ng: 2, storm_shadow: 2 } },
  { id: 'typhoon', name: 'Eurofighter Typhoon T3', cls: 'multirole', producers: ['GBR', 'DEU', 'ITA', 'ESP'], inService: 2013, unitCostUsdM: 110, rangeKm: 1100, fuelTph: 3.5, stealth: 0.2, detectionKm: 180, q: 1.35, load: { meteor: 4, iris_t: 2, paveway4: 2 } },
  { id: 'gripen_e', name: 'JAS 39E Gripen', cls: 'multirole', producers: ['SWE', 'BRA'], inService: 2023, unitCostUsdM: 85, rangeKm: 800, fuelTph: 2.5, stealth: 0.25, detectionKm: 180, q: 1.3, load: { meteor: 4, iris_t: 2, rbs15: 2 } },
  { id: 'gripen_c', name: 'JAS 39C Gripen', cls: 'multirole', producers: ['SWE'], inService: 2003, unitCostUsdM: 40, rangeKm: 800, fuelTph: 2.5, stealth: 0.2, detectionKm: 120, q: 1.1, load: { aim120c: 4, iris_t: 2 } },
  // KF-21 Block I: first deliveries to the ROKAF scheduled for late 2026.
  { id: 'kf21', name: 'KF-21 Boramae Block I', cls: 'multirole', producers: ['KOR'], inService: 2026, unitCostUsdM: 65, rangeKm: 1000, fuelTph: 4, stealth: 0.35, detectionKm: 180, q: 1.25, load: { meteor: 4, iris_t: 2 } },
  { id: 'tejas', name: 'HAL Tejas Mk1/1A', cls: 'multirole', producers: ['IND'], inService: 2016, unitCostUsdM: 40, rangeKm: 500, fuelTph: 2.2, stealth: 0.25, detectionKm: 120, q: 0.95, load: { astra1: 2, r73: 2 } },
  { id: 'mirage2000_5', name: 'Mirage 2000-5/-9/I', cls: 'multirole', producers: [], inService: 1997, unitCostUsdM: 40, rangeKm: 750, detectionKm: 130, q: 1.0, load: { mica_ng: 4 } },
  { id: 'f2', name: 'Mitsubishi F-2A', cls: 'multirole', producers: ['JPN'], inService: 2000, unitCostUsdM: 120, rangeKm: 830, detectionKm: 140, q: 1.1, fp: { ship: 0.08 }, load: { aam4b: 4, aam5: 2, asm3: 2 } },
  { id: 'tornado_ids', name: 'Tornado IDS/ECR', cls: 'multirole', crew: 2, producers: [], inService: 1982, unitCostUsdM: 30, rangeKm: 1400, fuelTph: 4.5, stealth: 0.1, detectionKm: 80, q: 0.95, fp: { aircraft: 0.08 }, load: { taurus: 2, iris_t: 2 } },
  { id: 'fa50', name: 'FA-50 Block 20', cls: 'multirole', producers: ['KOR'], inService: 2013, unitCostUsdM: 30, rangeKm: 450, fuelTph: 2, stealth: 0.25, detectionKm: 100, q: 0.75, load: { aim9x: 2, gbu12: 2 } },
  { id: 'jh7a', name: 'JH-7A Flying Leopard', cls: 'attack_aircraft', crew: 2, producers: ['CHN'], inService: 2004, unitCostUsdM: 20, speedKph: 850, rangeKm: 900, fuelTph: 5, armor: 0.15, detectionKm: 100, q: 0.9, fp: { ship: 0.08 }, load: { yj83: 2, ls6: 2 } },
  { id: 'a10c', name: 'A-10C Thunderbolt II', cls: 'attack_aircraft', producers: [], inService: 2007, unitCostUsdM: 19, speedKph: 560, rangeKm: 460, fuelTph: 2.5, armor: 0.6, detectionKm: 40, q: 1.2, load: { agm65: 4, gbu12: 4, aim9x: 1 } },
  { id: 'su25sm3', name: 'Su-25SM3 Frogfoot', cls: 'attack_aircraft', producers: ['RUS'], inService: 2013, unitCostUsdM: 15, speedKph: 700, rangeKm: 400, fuelTph: 2.5, armor: 0.45, detectionKm: 40, q: 1.0, load: { s8: 40, kh29: 2, r73: 2 } },
  { id: 'su25', name: 'Su-25 Frogfoot (older)', cls: 'attack_aircraft', producers: [], inService: 1981, unitCostUsdM: 8, speedKph: 700, rangeKm: 400, fuelTph: 2.5, armor: 0.4, detectionKm: 20, q: 0.8, load: { s8: 40, fab500: 4 } },
  // Ukraine adapted its Su-24Ms to carry two SCALP-EG / Storm Shadow from May 2023 (UK MoD; Ukrainian Air Force).
  { id: 'su24m_scalp', name: 'Su-24M (Ukrainian, Storm Shadow/SCALP-capable)', cls: 'attack_aircraft', crew: 2, producers: [], inService: 2023, unitCostUsdM: 25, speedKph: 850, rangeKm: 600, fuelTph: 5, armor: 0.15, detectionKm: 60, q: 0.9, load: { storm_shadow: 2, fab500: 4 } },
  { id: 'su24m', name: 'Su-24M/M2 Fencer', cls: 'attack_aircraft', crew: 2, producers: [], inService: 1983, unitCostUsdM: 25, speedKph: 850, rangeKm: 600, fuelTph: 5, armor: 0.15, detectionKm: 60, q: 0.9, load: { fab500: 6, kh29: 2 } },
  { id: 'emb314', name: 'A-29 Super Tucano', cls: 'attack_aircraft', producers: ['BRA', 'USA'], inService: 2003, unitCostUsdM: 15, speedKph: 450, rangeKm: 550, fuelTph: 0.25, armor: 0.25, detectionKm: 25, q: 0.45, load: { gbu12: 2, mk82: 2 } },
  { id: 'ac130j', name: 'AC-130J Ghostrider', cls: 'attack_aircraft', crew: 9, producers: ['USA'], inService: 2017, unitCostUsdM: 165, speedKph: 550, rangeKm: 1000, fuelTph: 2.5, armor: 0.1, stealth: 0, detectionKm: 30, q: 1.8, fp: { infantry: 0.5, armor: 0.3, soft: 0.6 }, load: { hellfire: 6, gbu39: 4 } },
];

const bombers: PlatformSpec<MunitionKey>[] = [
  // B-52H: 8 TF33s burn ~3,300 gal/h; AGM-86B load up to 20 (12 external + 8 internal).
  { id: 'b52h', name: 'B-52H Stratofortress', cls: 'bomber', crew: 5, producers: [], inService: 1961, unitCostUsdM: 84, speedKph: 840, rangeKm: 7200, fuelTph: 10, stealth: 0.03, detectionKm: 250, nuclear: true, load: { agm86b: 12, jassm_er: 8 } },
  { id: 'b1b', name: 'B-1B Lancer', cls: 'bomber', producers: [], inService: 1986, unitCostUsdM: 283, speedKph: 900, rangeKm: 5500, fuelTph: 9, stealth: 0.3, detectionKm: 200, q: 1.2, load: { jassm_er: 16, lrasm: 8 } },
  // B-2: program unit cost ~$2.1B; flyaway ~$1B (1997 $). 20 built, 19 in service.
  { id: 'b2a', name: 'B-2A Spirit', cls: 'stealth_bomber', producers: [], inService: 1997, unitCostUsdM: 1000, speedKph: 900, rangeKm: 5500, fuelTph: 7, stealth: 0.95, detectionKm: 150, q: 1.3, nuclear: true, load: { b61_12: 8, gbu31: 8, gbu57: 2 } },
  // B-21: APUC goal $550M in 2010 dollars (~$692M in 2022). IOC an estimate.
  { id: 'b21', name: 'B-21 Raider', cls: 'stealth_bomber', producers: ['USA'], inService: 2027, unitCostUsdM: 692, speedKph: 900, rangeKm: 5500, fuelTph: 6, stealth: 0.97, detectionKm: 200, q: 1.35, nuclear: true, load: { b61_12: 8, jassm_er: 8 } },
  { id: 'tu95ms', name: 'Tu-95MS/MSM Bear-H', cls: 'bomber', crew: 7, producers: [], inService: 1981, unitCostUsdM: 50, speedKph: 750, rangeKm: 6500, fuelTph: 6, stealth: 0.02, detectionKm: 150, nuclear: true, load: { kh101: 8, kh102: 6 } },
  { id: 'tu160m', name: 'Tu-160M Blackjack', cls: 'bomber', producers: ['RUS'], inService: 2021, unitCostUsdM: 200, speedKph: 960, rangeKm: 7300, fuelTph: 12, stealth: 0.1, detectionKm: 200, nuclear: true, load: { kh101: 6, kh102: 6 } },
  { id: 'tu22m3', name: 'Tu-22M3/M3M Backfire', cls: 'bomber', producers: [], inService: 1983, unitCostUsdM: 50, speedKph: 900, rangeKm: 2400, fuelTph: 8, stealth: 0.05, detectionKm: 150, fp: { ship: 0.05 }, load: { kh32: 3 } },
  { id: 'h6k', name: 'H-6K', cls: 'bomber', crew: 3, producers: ['CHN'], inService: 2011, unitCostUsdM: 40, speedKph: 770, rangeKm: 3500, fuelTph: 5, stealth: 0.02, detectionKm: 150, load: { kd20: 6 } },
  // H-6N: refuellable, carries an air-launched ballistic missile with a nuclear role (DoD CMPR 2024).
  { id: 'h6n', name: 'H-6N', cls: 'bomber', crew: 3, producers: ['CHN'], inService: 2020, unitCostUsdM: 50, speedKph: 770, rangeKm: 3500, fuelTph: 5, stealth: 0.02, detectionKm: 150, nuclear: true, load: { ch_as_x_13: 1, kd20: 4 } },
  { id: 'h6j', name: 'H-6J (naval)', cls: 'bomber', crew: 3, producers: ['CHN'], inService: 2018, unitCostUsdM: 45, speedKph: 770, rangeKm: 3500, fuelTph: 5, stealth: 0.02, detectionKm: 200, fp: { ship: 0.08 }, load: { yj12: 6 } },
];

const support: PlatformSpec<MunitionKey>[] = [
  { id: 'e3g', name: 'E-3G Sentry', cls: 'awacs', crew: 20, producers: [], inService: 1977, unitCostUsdM: 270, rangeKm: 1600, fuelTph: 7, detectionKm: 400 },
  // E-7A: USAF rapid prototypes ~$600M each with development; RAAF Wedgetail since 2012.
  { id: 'e7a', name: 'E-7A Wedgetail', cls: 'awacs', crew: 10, producers: ['USA', 'AUS'], inService: 2012, unitCostUsdM: 450, rangeKm: 1600, fuelTph: 5, detectionKm: 600 },
  { id: 'e2d', name: 'E-2D Advanced Hawkeye', cls: 'awacs', crew: 5, producers: ['USA'], inService: 2014, unitCostUsdM: 180, speedKph: 570, rangeKm: 1300, fuelTph: 1.5, detectionKm: 550 },
  { id: 'e2c', name: 'E-2C Hawkeye', cls: 'awacs', crew: 5, producers: [], inService: 1973, unitCostUsdM: 80, speedKph: 570, rangeKm: 1300, fuelTph: 1.5, detectionKm: 400 },
  { id: 'kj500', name: 'KJ-500', cls: 'awacs', crew: 10, producers: ['CHN'], inService: 2015, unitCostUsdM: 80, speedKph: 550, rangeKm: 1500, fuelTph: 2.5, detectionKm: 470 },
  { id: 'kj2000', name: 'KJ-2000', cls: 'awacs', crew: 15, producers: [], inService: 2007, unitCostUsdM: 150, rangeKm: 1500, fuelTph: 7, detectionKm: 470 },
  { id: 'kj600', name: 'KJ-600 carrier AEW', cls: 'awacs', crew: 5, producers: ['CHN'], inService: 2025, unitCostUsdM: 80, speedKph: 550, rangeKm: 1200, fuelTph: 1.5, detectionKm: 450 },
  // A-50U: two shot down by Ukraine in January-February 2024; ~6-8 remain.
  { id: 'a50u', name: 'A-50U Mainstay', cls: 'awacs', crew: 15, producers: [], inService: 2011, unitCostUsdM: 300, rangeKm: 1500, fuelTph: 7, detectionKm: 350 },
  { id: 'erieye', name: 'Saab 340/2000 Erieye', cls: 'awacs', crew: 6, producers: ['SWE'], inService: 1997, unitCostUsdM: 100, speedKph: 550, rangeKm: 1200, fuelTph: 1, detectionKm: 350 },
  { id: 'globaleye', name: 'Saab GlobalEye', cls: 'awacs', crew: 8, producers: ['SWE'], inService: 2020, unitCostUsdM: 300, speedKph: 800, rangeKm: 1800, fuelTph: 2, detectionKm: 450 },
  { id: 'netra', name: 'DRDO Netra AEW&C', cls: 'awacs', crew: 6, producers: ['IND'], inService: 2017, unitCostUsdM: 100, speedKph: 700, rangeKm: 1200, fuelTph: 1.5, detectionKm: 300 },
  { id: 'g550_caew', name: 'G550 CAEW (Eitam)', cls: 'awacs', crew: 6, producers: ['ISR'], inService: 2008, unitCostUsdM: 200, speedKph: 850, rangeKm: 1800, fuelTph: 1.2, detectionKm: 450 },
  { id: 'e767', name: 'E-767 AWACS', cls: 'awacs', crew: 20, producers: [], inService: 2000, unitCostUsdM: 550, rangeKm: 1800, fuelTph: 6, detectionKm: 450 },
  // Tankers: capacity.cargoTons is transferable fuel.
  { id: 'kc46a', name: 'KC-46A Pegasus', cls: 'tanker', crew: 3, producers: ['USA'], inService: 2019, unitCostUsdM: 165, speedKph: 850, rangeKm: 1800, fuelTph: 7, capacity: { cargoTons: 96 } },
  { id: 'kc135r', name: 'KC-135R Stratotanker', cls: 'tanker', crew: 3, producers: [], inService: 1957, unitCostUsdM: 40, speedKph: 850, rangeKm: 2400, fuelTph: 7, capacity: { cargoTons: 90 } },
  { id: 'a330mrtt', name: 'A330 MRTT', cls: 'tanker', crew: 3, producers: ['FRA', 'ESP'], inService: 2011, unitCostUsdM: 300, speedKph: 850, rangeKm: 1800, fuelTph: 6, capacity: { cargoTons: 111, troops: 300 } },
  { id: 'il78m', name: 'Il-78M-90A Midas', cls: 'tanker', producers: ['RUS'], inService: 1987, unitCostUsdM: 60, rangeKm: 1800, fuelTph: 8, capacity: { cargoTons: 85 } },
  { id: 'yy20', name: 'YY-20 (Y-20U)', cls: 'tanker', producers: ['CHN'], inService: 2018, unitCostUsdM: 170, rangeKm: 1800, fuelTph: 7, capacity: { cargoTons: 90 } },
  { id: 'kc130j', name: 'KC-130J Super Hercules', cls: 'tanker', producers: ['USA'], inService: 2004, unitCostUsdM: 85, speedKph: 640, rangeKm: 1800, fuelTph: 2.5, capacity: { cargoTons: 26 } },
  { id: 'c17a', name: 'C-17A Globemaster III', cls: 'transport_aircraft', producers: [], inService: 1993, unitCostUsdM: 340, speedKph: 830, rangeKm: 2200, fuelTph: 9, capacity: { cargoTons: 77, troops: 102, vehicles: 1 } },
  { id: 'c5m', name: 'C-5M Super Galaxy', cls: 'transport_aircraft', crew: 7, producers: [], inService: 2014, unitCostUsdM: 400, speedKph: 830, rangeKm: 2500, fuelTph: 11, capacity: { cargoTons: 127, troops: 73, vehicles: 2 } },
  { id: 'c130j', name: 'C-130J Super Hercules', cls: 'transport_aircraft', crew: 3, producers: ['USA'], inService: 1999, unitCostUsdM: 75, speedKph: 640, rangeKm: 1800, fuelTph: 2.5, capacity: { cargoTons: 19, troops: 92 } },
  { id: 'a400m', name: 'A400M Atlas', cls: 'transport_aircraft', crew: 3, producers: ['FRA', 'DEU', 'ESP'], inService: 2013, unitCostUsdM: 180, speedKph: 780, rangeKm: 2200, fuelTph: 4, capacity: { cargoTons: 37, troops: 116 } },
  { id: 'il76md', name: 'Il-76MD / MD-90A', cls: 'transport_aircraft', crew: 5, producers: ['RUS'], inService: 1981, unitCostUsdM: 60, speedKph: 780, rangeKm: 2000, fuelTph: 8, capacity: { cargoTons: 48, troops: 126 } },
  { id: 'y20', name: 'Y-20 Kunpeng', cls: 'transport_aircraft', producers: ['CHN'], inService: 2016, unitCostUsdM: 160, speedKph: 780, rangeKm: 2200, fuelTph: 7, capacity: { cargoTons: 66, troops: 120, vehicles: 1 } },
  { id: 'y9', name: 'Y-9', cls: 'transport_aircraft', producers: ['CHN'], inService: 2012, unitCostUsdM: 40, speedKph: 550, rangeKm: 1800, fuelTph: 2.5, capacity: { cargoTons: 20, troops: 106 } },
  { id: 'kc390', name: 'Embraer C-390 Millennium', cls: 'transport_aircraft', crew: 3, producers: ['BRA'], inService: 2019, unitCostUsdM: 130, speedKph: 850, rangeKm: 1800, fuelTph: 3.5, capacity: { cargoTons: 26, troops: 80 } },
  { id: 'an124', name: 'An-124 Ruslan', cls: 'transport_aircraft', crew: 6, producers: [], inService: 1986, unitCostUsdM: 150, speedKph: 800, rangeKm: 2500, fuelTph: 12, capacity: { cargoTons: 150, troops: 88, vehicles: 2 } },
  { id: 'an26', name: 'An-26 / Y-7', cls: 'transport_aircraft', producers: [], inService: 1969, unitCostUsdM: 5, speedKph: 440, rangeKm: 500, fuelTph: 0.8, capacity: { cargoTons: 5.5, troops: 40 } },
  { id: 'c2_kawasaki', name: 'Kawasaki C-2', cls: 'transport_aircraft', producers: ['JPN'], inService: 2017, unitCostUsdM: 170, speedKph: 850, rangeKm: 2000, fuelTph: 6, capacity: { cargoTons: 37, troops: 110 } },
  { id: 'c295', name: 'C-295', cls: 'transport_aircraft', crew: 3, producers: ['ESP', 'IND'], inService: 2001, unitCostUsdM: 30, speedKph: 480, rangeKm: 800, fuelTph: 0.8, capacity: { cargoTons: 9.25, troops: 71 } },
  { id: 'p8a', name: 'P-8A Poseidon', cls: 'maritime_patrol', producers: ['USA'], inService: 2013, unitCostUsdM: 150, speedKph: 815, rangeKm: 2200, fuelTph: 4, detectionKm: 350, q: 1.3, load: { mk54: 5, harpoon: 2 } },
  { id: 'p1', name: 'Kawasaki P-1', cls: 'maritime_patrol', crew: 11, producers: ['JPN'], inService: 2013, unitCostUsdM: 170, speedKph: 800, rangeKm: 2500, fuelTph: 4, detectionKm: 350, q: 1.2, load: { type12_lwt: 6, harpoon: 2 } },
  { id: 'p3c', name: 'P-3C Orion', cls: 'maritime_patrol', crew: 11, producers: [], inService: 1969, unitCostUsdM: 40, speedKph: 600, rangeKm: 2500, fuelTph: 2.5, detectionKm: 250, q: 0.9, load: { mk54: 4, harpoon: 2 } },
  { id: 'tu142m', name: 'Tu-142MK/MZ Bear-F', cls: 'maritime_patrol', crew: 11, producers: [], inService: 1980, unitCostUsdM: 50, speedKph: 700, rangeKm: 3000, fuelTph: 6, detectionKm: 200, q: 0.8, load: { apr3: 4 } },
  { id: 'il38n', name: 'Il-38N May', cls: 'maritime_patrol', crew: 8, producers: [], inService: 1969, unitCostUsdM: 40, speedKph: 600, rangeKm: 2200, fuelTph: 3, detectionKm: 200, q: 0.75, load: { apr3: 4 } },
  { id: 'kq200', name: 'KQ-200 (Y-8Q)', cls: 'maritime_patrol', crew: 10, producers: ['CHN'], inService: 2015, unitCostUsdM: 60, speedKph: 550, rangeKm: 2200, fuelTph: 2.5, detectionKm: 250, q: 1.0, load: { yu7: 6 } },
  { id: 'atlantique2', name: 'Atlantique 2 Std 6', cls: 'maritime_patrol', crew: 12, producers: ['FRA'], inService: 1989, unitCostUsdM: 80, speedKph: 550, rangeKm: 2500, fuelTph: 2, detectionKm: 300, q: 1.1, load: { mu90: 6, exocet: 2 } },
  { id: 'ea18g', name: 'EA-18G Growler', cls: 'ew_aircraft', crew: 2, producers: ['USA'], inService: 2009, unitCostUsdM: 70, speedKph: 900, rangeKm: 720, fuelTph: 4, stealth: 0.2, detectionKm: 300, load: { agm88e: 2, aim120c: 2 } },
  { id: 'j16d', name: 'J-16D', cls: 'ew_aircraft', crew: 2, producers: ['CHN'], inService: 2021, unitCostUsdM: 70, speedKph: 900, rangeKm: 1300, fuelTph: 5.5, stealth: 0.15, detectionKm: 300, load: { ld10: 2, pl15: 2 } },
  { id: 'ec37b', name: 'EC-37B Compass Call', cls: 'ew_aircraft', crew: 13, producers: ['USA'], inService: 2024, unitCostUsdM: 200, rangeKm: 2500, fuelTph: 1.5, stealth: 0, detectionKm: 400 },
  { id: 'rc135v', name: 'RC-135V/W Rivet Joint', cls: 'ew_aircraft', crew: 27, producers: [], inService: 1964, unitCostUsdM: 300, rangeKm: 2500, fuelTph: 6, stealth: 0, detectionKm: 500 },
  { id: 'u2s', name: 'U-2S Dragon Lady', cls: 'ew_aircraft', crew: 1, producers: [], inService: 1994, unitCostUsdM: 100, speedKph: 690, rangeKm: 4000, fuelTph: 0.8, stealth: 0.3, detectionKm: 400 },
  { id: 'il20m', name: 'Il-20M Coot-A', cls: 'ew_aircraft', crew: 13, producers: [], inService: 1968, unitCostUsdM: 40, speedKph: 600, rangeKm: 2500, fuelTph: 3, stealth: 0, detectionKm: 300 },
];

const drones: PlatformSpec<MunitionKey>[] = [
  { id: 'rq4b', name: 'RQ-4B Global Hawk', cls: 'isr_drone', producers: ['USA'], inService: 2001, unitCostUsdM: 130, speedKph: 570, rangeKm: 5500, fuelTph: 0.4, stealth: 0.05, detectionKm: 300 },
  { id: 'mq4c', name: 'MQ-4C Triton', cls: 'isr_drone', producers: ['USA'], inService: 2018, unitCostUsdM: 180, speedKph: 570, rangeKm: 5500, fuelTph: 0.4, stealth: 0.05, detectionKm: 400 },
  { id: 'wz7', name: 'WZ-7 Soaring Dragon', cls: 'isr_drone', producers: ['CHN'], inService: 2018, unitCostUsdM: 30, speedKph: 700, rangeKm: 3500, fuelTph: 0.4, stealth: 0.1, detectionKm: 300 },
  { id: 'heron_tp', name: 'Heron TP (Eitan)', cls: 'isr_drone', producers: ['ISR'], inService: 2010, unitCostUsdM: 35, speedKph: 300, rangeKm: 1000, fuelTph: 0.1, detectionKm: 200 },
  { id: 'hermes900', name: 'Hermes 900', cls: 'isr_drone', producers: ['ISR'], inService: 2012, unitCostUsdM: 30, speedKph: 220, rangeKm: 1000, fuelTph: 0.05, detectionKm: 150 },
  // Orlan-10: Russia's artillery spotter; ~$100k each; RUSI: spotter-to-shell kill chain ~3-5 minutes.
  { id: 'orlan10', name: 'Orlan-10', cls: 'isr_drone', producers: ['RUS'], inService: 2010, unitCostUsdM: 0.1, speedKph: 110, rangeKm: 120, fuelTph: 0.001, stealth: 0.6, detectionKm: 15 },
  { id: 'scaneagle', name: 'ScanEagle', cls: 'isr_drone', producers: ['USA'], inService: 2005, unitCostUsdM: 0.1, speedKph: 100, rangeKm: 100, fuelTph: 0.001, stealth: 0.6, detectionKm: 10 },
  { id: 'mq9', name: 'MQ-9A/B Reaper / SkyGuardian', cls: 'strike_drone', producers: ['USA'], inService: 2007, unitCostUsdM: 32, speedKph: 310, rangeKm: 1850, fuelTph: 0.15, stealth: 0.1, detectionKm: 80, q: 1.0, load: { hellfire: 4, gbu12: 2 } },
  { id: 'mq1c', name: 'MQ-1C Gray Eagle', cls: 'strike_drone', producers: ['USA'], inService: 2009, unitCostUsdM: 21, speedKph: 280, rangeKm: 1200, fuelTph: 0.05, stealth: 0.15, detectionKm: 60, q: 0.8, load: { hellfire: 4 } },
  // TB2: effective in 2020 Nagorno-Karabakh and early 2022; largely driven off by Russian air defense after.
  { id: 'tb2', name: 'Bayraktar TB2', cls: 'strike_drone', producers: ['TUR', 'UKR'], inService: 2014, unitCostUsdM: 5, speedKph: 130, rangeKm: 150, fuelTph: 0.01, stealth: 0.3, detectionKm: 40, q: 0.6, load: { mam_l: 4 } },
  { id: 'akinci', name: 'Bayraktar Akinci', cls: 'strike_drone', producers: ['TUR'], inService: 2021, unitCostUsdM: 15, speedKph: 300, rangeKm: 1500, fuelTph: 0.1, stealth: 0.2, detectionKm: 100, q: 1.0, load: { mam_l: 6, teber: 2 } },
  { id: 'anka', name: 'TAI Anka-S', cls: 'strike_drone', producers: ['TUR'], inService: 2016, unitCostUsdM: 10, speedKph: 220, rangeKm: 1000, fuelTph: 0.05, stealth: 0.25, detectionKm: 60, q: 0.6, load: { mam_l: 4 } },
  { id: 'orion', name: 'Kronshtadt Orion (Inokhodets)', cls: 'strike_drone', producers: ['RUS'], inService: 2020, unitCostUsdM: 5, speedKph: 200, rangeKm: 250, fuelTph: 0.03, stealth: 0.25, detectionKm: 50, q: 0.5, load: { kab20: 4 } },
  { id: 'forpost_r', name: 'Forpost-R', cls: 'strike_drone', producers: ['RUS'], inService: 2019, unitCostUsdM: 6, speedKph: 180, rangeKm: 250, fuelTph: 0.02, stealth: 0.25, detectionKm: 40, q: 0.4, load: { kab20: 2 } },
  { id: 'wing_loong2', name: 'Wing Loong II', cls: 'strike_drone', producers: ['CHN'], inService: 2017, unitCostUsdM: 2, speedKph: 300, rangeKm: 1500, fuelTph: 0.1, stealth: 0.2, detectionKm: 60, q: 0.85, load: { akd10: 6, ft12: 2 } },
  { id: 'ch4b', name: 'CH-4B Rainbow', cls: 'strike_drone', producers: ['CHN'], inService: 2016, unitCostUsdM: 4, speedKph: 200, rangeKm: 1000, fuelTph: 0.04, stealth: 0.25, detectionKm: 40, q: 0.7, load: { akd10: 4 } },
  { id: 'ch5', name: 'CH-5 Rainbow', cls: 'strike_drone', producers: ['CHN'], inService: 2017, unitCostUsdM: 10, speedKph: 250, rangeKm: 2000, fuelTph: 0.08, stealth: 0.2, detectionKm: 60, q: 0.9, load: { akd10: 8 } },
  // GJ-11: stealth flying-wing UCAV; operational status an estimate (displayed with PLA units 2025).
  { id: 'gj11', name: 'GJ-11 Sharp Sword', cls: 'strike_drone', producers: ['CHN'], inService: 2025, unitCostUsdM: 30, speedKph: 700, rangeKm: 1500, fuelTph: 0.5, stealth: 0.9, detectionKm: 80, q: 1.0, load: { ls6: 2, ft12: 2 } },
  { id: 'shahed129', name: 'Shahed-129', cls: 'strike_drone', producers: ['IRN'], inService: 2013, unitCostUsdM: 1, speedKph: 150, rangeKm: 1000, fuelTph: 0.02, stealth: 0.3, detectionKm: 40, q: 0.5, load: { qaem5: 4 } },
  { id: 'mohajer6', name: 'Mohajer-6', cls: 'strike_drone', producers: ['IRN'], inService: 2018, unitCostUsdM: 1, speedKph: 150, rangeKm: 200, fuelTph: 0.01, stealth: 0.35, detectionKm: 30, q: 0.4, load: { qaem5: 2 } },
  { id: 'shahed_launcher', name: 'Shahed-136 / Geran-2 launch truck (5 rails)', cls: 'loitering_munition_launcher', producers: ['IRN', 'RUS'], inService: 2022, unitCostUsdM: 0.2, load: { shahed136: 5 } },
  { id: 'lancet_team', name: 'Lancet launch team', cls: 'loitering_munition_launcher', producers: ['RUS'], inService: 2022, unitCostUsdM: 0.05, speedKph: 40, load: { lancet3: 4 } },
  { id: 'switchblade_team', name: 'Switchblade 600 team', cls: 'loitering_munition_launcher', producers: ['USA'], inService: 2021, unitCostUsdM: 0.05, speedKph: 40, load: { switchblade600: 2, switchblade300: 2 } },
  { id: 'harop_launcher', name: 'Harop launcher (12 canisters)', cls: 'loitering_munition_launcher', producers: ['ISR', 'IND'], inService: 2009, unitCostUsdM: 5, load: { harop: 12 } },
  { id: 'fpv_team', name: 'FPV drone team', cls: 'loitering_munition_launcher', producers: ['UKR', 'RUS', 'CHN', 'USA', 'POL', 'TUR', 'IRN'], inService: 2023, unitCostUsdM: 0.02, speedKph: 30, stealth: 0.6, detectionKm: 10, load: { fpv: 30, fpv_fiber: 5 } },
  { id: 'bober_launcher', name: 'Long-range strike drone launch site (UJ-26 Bober)', cls: 'loitering_munition_launcher', producers: ['UKR'], inService: 2023, unitCostUsdM: 0.1, load: { bober: 4 } },
  { id: 'lyutyi_launcher', name: 'Long-range strike drone launch site (FP-1 / Lyutyi)', cls: 'loitering_munition_launcher', producers: ['UKR'], inService: 2023, unitCostUsdM: 0.2, load: { lyutyi: 4 } },
  { id: 'kargu_team', name: 'Kargu-2 team', cls: 'loitering_munition_launcher', producers: ['TUR'], inService: 2020, unitCostUsdM: 0.05, speedKph: 40, load: { kargu2: 4 } },
];

const helicopters: PlatformSpec<MunitionKey>[] = [
  { id: 'ah64e', name: 'AH-64E Apache Guardian', cls: 'attack_helo', producers: ['USA'], inService: 2011, unitCostUsdM: 35, speedKph: 270, rangeKm: 480, fuelTph: 0.55, armor: 0.35, detectionKm: 15, q: 1.3, load: { jagm: 8, hydra70: 19 } },
  { id: 'ah64d', name: 'AH-64D Apache Longbow', cls: 'attack_helo', producers: [], inService: 1997, unitCostUsdM: 25, speedKph: 260, rangeKm: 480, fuelTph: 0.55, armor: 0.35, detectionKm: 12, q: 1.1, load: { hellfire: 8, hydra70: 19 } },
  { id: 'ah1z', name: 'AH-1Z Viper', cls: 'attack_helo', producers: ['USA'], inService: 2010, unitCostUsdM: 31, speedKph: 270, rangeKm: 230, fuelTph: 0.45, armor: 0.3, detectionKm: 12, q: 1.15, load: { hellfire: 8, aim9x: 2, hydra70: 14 } },
  { id: 'ka52m', name: 'Ka-52M Alligator', cls: 'attack_helo', producers: ['RUS'], inService: 2023, unitCostUsdM: 16, speedKph: 260, rangeKm: 460, fuelTph: 0.6, armor: 0.35, detectionKm: 15, q: 1.15, load: { vikhr: 12, lmur: 2 } },
  { id: 'mi28nm', name: 'Mi-28NM Havoc', cls: 'attack_helo', producers: ['RUS'], inService: 2019, unitCostUsdM: 18, speedKph: 260, rangeKm: 450, fuelTph: 0.6, armor: 0.4, detectionKm: 12, q: 1.05, load: { ataka: 16 } },
  { id: 'mi35m', name: 'Mi-35M Hind-E', cls: 'attack_helo', crew: 3, producers: ['RUS'], inService: 2005, unitCostUsdM: 12, speedKph: 260, rangeKm: 400, fuelTph: 0.7, armor: 0.35, detectionKm: 8, q: 0.85, capacity: { troops: 8 }, load: { ataka: 8, s8: 40 } },
  { id: 'mi24v', name: 'Mi-24V/P Hind', cls: 'attack_helo', crew: 3, producers: [], inService: 1976, unitCostUsdM: 6, speedKph: 260, rangeKm: 400, fuelTph: 0.7, armor: 0.3, detectionKm: 5, q: 0.65, capacity: { troops: 8 }, load: { s8: 40 } },
  { id: 'z10', name: 'Z-10ME', cls: 'attack_helo', producers: ['CHN'], inService: 2012, unitCostUsdM: 15, speedKph: 250, rangeKm: 400, fuelTph: 0.5, armor: 0.3, detectionKm: 10, q: 1.0, load: { hj10: 8 } },
  { id: 'z19', name: 'Z-19', cls: 'attack_helo', producers: ['CHN'], inService: 2012, unitCostUsdM: 8, speedKph: 240, rangeKm: 350, fuelTph: 0.3, armor: 0.2, detectionKm: 10, q: 0.7, load: { akd10: 4 } },
  { id: 'tiger', name: 'Tiger HAD/UHT', cls: 'attack_helo', producers: ['FRA', 'DEU', 'ESP'], inService: 2005, unitCostUsdM: 50, speedKph: 270, rangeKm: 400, fuelTph: 0.4, armor: 0.3, detectionKm: 12, q: 1.0, load: { spike_lr2: 8 } },
  { id: 't129', name: 'T129 ATAK', cls: 'attack_helo', producers: ['TUR'], inService: 2014, unitCostUsdM: 20, speedKph: 260, rangeKm: 280, fuelTph: 0.35, armor: 0.25, detectionKm: 10, q: 0.9, load: { omtas: 8 } },
  { id: 'lch_prachand', name: 'HAL LCH Prachand', cls: 'attack_helo', producers: ['IND'], inService: 2022, unitCostUsdM: 20, speedKph: 260, rangeKm: 350, fuelTph: 0.35, armor: 0.25, detectionKm: 10, q: 0.8, load: { nag: 4 } },
  { id: 'uh60m', name: 'UH-60M Black Hawk', cls: 'transport_helo', crew: 4, producers: ['USA', 'POL', 'KOR', 'JPN', 'TUR'], inService: 2007, unitCostUsdM: 22, speedKph: 280, rangeKm: 590, fuelTph: 0.5, capacity: { troops: 11, cargoTons: 4 } },
  { id: 'ch47f', name: 'CH-47F Chinook', cls: 'transport_helo', producers: ['USA'], inService: 2006, unitCostUsdM: 40, speedKph: 290, rangeKm: 400, fuelTph: 1.2, capacity: { troops: 33, cargoTons: 10 } },
  { id: 'mi8', name: 'Mi-8AMTSh / Mi-17 family', cls: 'transport_helo', producers: ['RUS'], inService: 1991, unitCostUsdM: 15, speedKph: 230, rangeKm: 500, fuelTph: 0.75, capacity: { troops: 24, cargoTons: 4 } },
  { id: 'mi26', name: 'Mi-26 Halo', cls: 'transport_helo', crew: 5, producers: ['RUS'], inService: 1983, unitCostUsdM: 25, speedKph: 255, rangeKm: 400, fuelTph: 3, capacity: { troops: 82, cargoTons: 20 } },
  { id: 'nh90_tth', name: 'NH90 TTH', cls: 'transport_helo', producers: ['FRA', 'DEU', 'ITA', 'NLD'], inService: 2007, unitCostUsdM: 35, speedKph: 260, rangeKm: 400, fuelTph: 0.6, capacity: { troops: 20, cargoTons: 4 } },
  { id: 'z20', name: 'Z-20', cls: 'transport_helo', producers: ['CHN'], inService: 2019, unitCostUsdM: 15, speedKph: 280, rangeKm: 500, fuelTph: 0.5, capacity: { troops: 12, cargoTons: 4 } },
  { id: 'z8', name: 'Z-8G/L', cls: 'transport_helo', producers: ['CHN'], inService: 1994, unitCostUsdM: 15, speedKph: 250, rangeKm: 400, fuelTph: 1, capacity: { troops: 27, cargoTons: 4 } },
  { id: 'aw101', name: 'AW101 Merlin', cls: 'transport_helo', producers: ['GBR', 'ITA'], inService: 1999, unitCostUsdM: 40, speedKph: 280, rangeKm: 500, fuelTph: 0.9, capacity: { troops: 30, cargoTons: 5.5 } },
  { id: 'h225m', name: 'H225M Caracal', cls: 'transport_helo', producers: ['FRA', 'BRA'], inService: 2004, unitCostUsdM: 30, speedKph: 270, rangeKm: 450, fuelTph: 0.6, capacity: { troops: 28, cargoTons: 4.75 } },
  { id: 'kuh1', name: 'KUH-1 Surion', cls: 'transport_helo', producers: ['KOR'], inService: 2013, unitCostUsdM: 15, speedKph: 260, rangeKm: 400, fuelTph: 0.4, capacity: { troops: 9, cargoTons: 3.5 } },
  { id: 'mv22b', name: 'MV-22B / CV-22B Osprey', cls: 'transport_helo', crew: 4, producers: ['USA'], inService: 2007, unitCostUsdM: 90, speedKph: 450, rangeKm: 720, fuelTph: 1.1, capacity: { troops: 24, cargoTons: 9 } },
  { id: 'mh60r', name: 'MH-60R Seahawk', cls: 'asw_helo', producers: ['USA'], inService: 2006, unitCostUsdM: 40, speedKph: 270, rangeKm: 450, detectionKm: 40, q: 1.3, load: { mk54: 3, hellfire: 4 } },
  { id: 'ka27pl', name: 'Ka-27PL / Ka-28 Helix', cls: 'asw_helo', producers: [], inService: 1982, unitCostUsdM: 10, speedKph: 230, rangeKm: 400, detectionKm: 25, q: 0.8, load: { apr3: 1, mk11_dc: 4 } },
  { id: 'z20f', name: 'Z-20F / Z-9D naval', cls: 'asw_helo', producers: ['CHN'], inService: 2022, unitCostUsdM: 20, speedKph: 270, rangeKm: 450, detectionKm: 35, q: 1.0, load: { yu7: 2 } },
  { id: 'nh90_nfh', name: 'NH90 NFH', cls: 'asw_helo', producers: ['FRA', 'ITA', 'NLD'], inService: 2010, unitCostUsdM: 40, speedKph: 260, rangeKm: 450, detectionKm: 35, q: 1.1, load: { mu90: 2 } },
  { id: 'wildcat', name: 'AW159 Wildcat HMA2', cls: 'asw_helo', producers: ['GBR'], inService: 2014, unitCostUsdM: 30, speedKph: 260, rangeKm: 350, detectionKm: 30, q: 1.0, load: { sting_ray: 2 } },
  { id: 'sh60k', name: 'SH-60K/L', cls: 'asw_helo', producers: ['JPN'], inService: 2005, unitCostUsdM: 50, speedKph: 260, rangeKm: 450, detectionKm: 35, q: 1.1, load: { type12_lwt: 2, hellfire: 4 } },
];

export const airPlatforms = [...fighters, ...bombers, ...support, ...drones, ...helicopters].map(toPlatform);

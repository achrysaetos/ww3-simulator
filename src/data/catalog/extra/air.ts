/**
 * Aircraft, helicopters and drones fielded in the orders of battle that the base
 * catalog lacked. Same conventions as ../air.ts: rangeKm is combat radius,
 * speedKph a mission cruise, q scales class firepower against a typical modern
 * type (1.0). Older and export types are placed against the base rows they
 * resemble (mig21 0.45, f5e 0.5, f16am 0.85, su25 0.8) so the ladder stays
 * monotonic with radar and missile generation. Costs are flyaway or used-market
 * estimates; most of these are no longer in production.
 */
import { defineMunitions, toMunition, toPlatform, type PlatformSpec } from '../build';
import type { MunitionKey } from '../munitions';

const extraMunitions = defineMunitions([
  // Sky Sword II: active radar, ~60 km (Jane's); carried by the F-CK-1.
  { id: 'tc2', name: 'TC-2 Sky Sword II', kind: 'aam', producers: ['TWN'], rangeKm: 60, speedMach: 4, warheadKg: 22, cepM: 5, pk: { aircraft: 0.35, helicopter: 0.45 }, interceptDifficulty: 0.2, unitCostUsdM: 0.8, weightKg: 184 },
  // Denel ZT-6 Mokopa: semi-active laser, 10 km, 49.8 kg; Hellfire-class.
  { id: 'mokopa', name: 'ZT-6 Mokopa', kind: 'atgm', producers: ['ZAF'], rangeKm: 10, speedMach: 1.2, warheadKg: 12, cepM: 1, pk: { armor: 0.8, soft: 0.85, infantry: 0.5, structure: 0.3, ship: 0.05, helicopter: 0.3 }, interceptDifficulty: 0.1, unitCostUsdM: 0.15, weightKg: 50 },
] as const);

type Key = MunitionKey | (typeof extraMunitions)[number]['id'];

const fixedWing: PlatformSpec<Key>[] = [
  // Block I/II: KLJ-7 radar (~105 km), PL-12/SD-10; Block III (base jf17_blk3) adds AESA and PL-15.
  { id: 'jf17', name: 'JF-17 Block I/II Thunder', cls: 'multirole', producers: ['PAK', 'CHN'], inService: 2007, unitCostUsdM: 25, rangeKm: 550, fuelTph: 2.5, detectionKm: 100, q: 0.8, load: { pl12: 2, ir_aam_old: 2, mk82: 2 } },
  { id: 'j10a', name: 'J-10A/S', cls: 'multirole', producers: ['CHN'], inService: 2005, unitCostUsdM: 28, rangeKm: 550, detectionKm: 110, q: 0.9, load: { pl12: 4, ir_aam_old: 2 } },
  // F-15J/DJ: ~90 of ~200 J-MSIP upgraded with AAM-4; the rest still carry AIM-7/AAM-3, hence below the F-15C.
  { id: 'f15j', name: 'F-15J/DJ Eagle', cls: 'fighter', producers: ['JPN'], inService: 1981, unitCostUsdM: 60, speedKph: 950, rangeKm: 1200, fuelTph: 5, stealth: 0.05, detectionKm: 150, q: 1.05, load: { aam4b: 4, aam5: 4 } },
  { id: 'f5em', name: 'F-5EM/FM Tiger II (Brazil)', cls: 'fighter', producers: ['BRA'], inService: 2005, unitCostUsdM: 10, rangeKm: 400, fuelTph: 2, stealth: 0.25, detectionKm: 70, q: 0.65, load: { derby_er: 2, ir_aam_old: 2 } },
  // F-CK-1C/D upgrade: GD-53 radar, four TC-2.
  { id: 'f_ck_1', name: 'F-CK-1C/D Ching-kuo', cls: 'multirole', producers: ['TWN'], inService: 1994, unitCostUsdM: 25, rangeKm: 450, fuelTph: 2.5, detectionKm: 80, q: 0.8, load: { tc2: 4, ir_aam_old: 2 } },
  // Phantom 2000 / Terminator 2020: EL/M-2032 radar and new avionics on the F-4E airframe.
  { id: 'f4e_2020', name: 'F-4E 2020 Terminator', cls: 'multirole', crew: 2, producers: ['TUR'], inService: 2002, unitCostUsdM: 15, rangeKm: 700, fuelTph: 6, stealth: 0.02, detectionKm: 110, q: 0.8, load: { aim7m: 2, ir_aam_old: 2, gbu12: 4 } },
  // Pakistan's ROSE-upgraded Mirage III/5 (Grifo M3 radar on ROSE I). Mirage 5 aliases here.
  { id: 'mirage3', name: 'Mirage III/5 (ROSE)', cls: 'multirole', producers: [], inService: 1967, unitCostUsdM: 5, rangeKm: 600, fuelTph: 3, stealth: 0.1, detectionKm: 50, q: 0.5, load: { ir_aam_old: 2, mk82: 4 } },
  // Morocco's F1 MF2000 upgrade carries MICA; mica_ng stands in for MICA RF/IR.
  { id: 'mirage_f1', name: 'Mirage F1 (MF2000)', cls: 'multirole', producers: [], inService: 1974, unitCostUsdM: 10, rangeKm: 600, fuelTph: 3, detectionKm: 80, q: 0.65, load: { mica_ng: 2, mk82: 4 } },
  // Sapfir-23ML radar ~45-55 km; aim7m stands in for the R-24R semi-active missile.
  { id: 'mig23ml', name: 'MiG-23ML/MLD Flogger', cls: 'fighter', producers: [], inService: 1978, unitCostUsdM: 5, speedKph: 900, rangeKm: 600, fuelTph: 4, stealth: 0.05, detectionKm: 45, q: 0.5, load: { aim7m: 2, ir_aam_old: 2 } },
  { id: 'j6', name: 'J-6 / MiG-19 Farmer', cls: 'fighter', producers: [], inService: 1958, unitCostUsdM: 1, speedKph: 850, rangeKm: 350, fuelTph: 3, stealth: 0.1, detectionKm: 10, q: 0.25, load: { ir_aam_old: 2 } },
  { id: 'j5', name: 'J-5 / MiG-17 Fresco', cls: 'fighter', producers: [], inService: 1956, unitCostUsdM: 0.5, speedKph: 800, rangeKm: 300, fuelTph: 2, stealth: 0.1, detectionKm: 5, q: 0.15, load: { ir_aam_old: 2 } },
  // Il-28 copy, 3 t bomb load; North Korea keeps ~80 (IISS 2024).
  { id: 'h5', name: 'H-5 / Il-28 Beagle', cls: 'bomber', crew: 3, producers: [], inService: 1956, unitCostUsdM: 1, speedKph: 700, rangeKm: 1100, fuelTph: 3, stealth: 0.02, detectionKm: 20, q: 0.2, load: { fab500: 6 } },
  { id: 'su22', name: 'Su-22M4 Fitter-K', cls: 'attack_aircraft', producers: [], inService: 1984, unitCostUsdM: 5, speedKph: 750, rangeKm: 550, fuelTph: 3.5, armor: 0.15, detectionKm: 20, q: 0.6, load: { fab500: 4, s8: 32 } },
  // Jaguar IS DARIN III; R-550 Magic is the ir_aam_old stand-in.
  { id: 'jaguar', name: 'SEPECAT Jaguar IS (DARIN III)', cls: 'attack_aircraft', producers: [], inService: 1979, unitCostUsdM: 15, speedKph: 800, rangeKm: 800, fuelTph: 3, armor: 0.15, detectionKm: 40, q: 0.75, load: { gbu12: 2, mk82: 4, ir_aam_old: 2 } },
  { id: 'a1m_amx', name: 'AMX A-1M', cls: 'attack_aircraft', producers: ['BRA', 'ITA'], inService: 1989, unitCostUsdM: 15, speedKph: 800, rangeKm: 550, fuelTph: 2, armor: 0.15, detectionKm: 40, q: 0.6, load: { mk82: 4, ir_aam_old: 2 } },
  // A-4AR: ARG-1 radar (APG-66 derivative). Brazil's AF-1 (ex-Kuwaiti A-4KU, modernized) aliases here.
  { id: 'a4ar', name: 'A-4AR Fightinghawk', cls: 'attack_aircraft', producers: [], inService: 1998, unitCostUsdM: 8, speedKph: 800, rangeKm: 600, fuelTph: 2, armor: 0.15, detectionKm: 60, q: 0.5, load: { ir_aam_old: 2, mk82: 4 } },
  { id: 'j22_orao', name: 'Soko J-22 Orao', cls: 'attack_aircraft', producers: [], inService: 1978, unitCostUsdM: 5, speedKph: 800, rangeKm: 400, fuelTph: 2, armor: 0.15, detectionKm: 5, q: 0.4, load: { agm65: 2, fab500: 2 } },
  { id: 'l159', name: 'Aero L-159 ALCA', cls: 'attack_aircraft', producers: ['CZE'], inService: 2000, unitCostUsdM: 15, speedKph: 800, rangeKm: 500, fuelTph: 1, armor: 0.15, detectionKm: 70, q: 0.5, load: { gbu12: 2, ir_aam_old: 2 } },
  // TA-50 / T-50IQ armed lead-in trainers with EL/M-2032 radar; T-50i and T-50TH alias here.
  { id: 't50iq', name: 'KAI TA-50 / T-50IQ', cls: 'attack_aircraft', producers: ['KOR'], inService: 2011, unitCostUsdM: 25, speedKph: 900, rangeKm: 450, fuelTph: 1.8, armor: 0.1, detectionKm: 60, q: 0.5, load: { ir_aam_old: 2, mk82: 4 } },
  { id: 'hawk200', name: 'BAE Hawk 200 / 100-series', cls: 'attack_aircraft', producers: ['GBR'], inService: 1993, unitCostUsdM: 20, speedKph: 750, rangeKm: 500, fuelTph: 1, armor: 0.1, detectionKm: 30, q: 0.4, load: { mk82: 4, ir_aam_old: 2 } },
  { id: 'yak130', name: 'Yak-130 Mitten', cls: 'attack_aircraft', crew: 2, producers: ['RUS'], inService: 2010, unitCostUsdM: 15, speedKph: 750, rangeKm: 550, fuelTph: 1, armor: 0.15, detectionKm: 30, q: 0.4, load: { s8: 40, r73: 2 } },
  { id: 'alpha_jet', name: 'Dassault/Dornier Alpha Jet', cls: 'attack_aircraft', crew: 2, producers: [], inService: 1977, unitCostUsdM: 5, speedKph: 700, rangeKm: 400, fuelTph: 1, armor: 0.1, detectionKm: 5, q: 0.3, load: { mk82: 4 } },
  { id: 'k8', name: 'K-8 Karakorum', cls: 'attack_aircraft', crew: 2, producers: ['CHN', 'PAK'], inService: 1994, unitCostUsdM: 5, speedKph: 600, rangeKm: 400, fuelTph: 0.6, armor: 0.1, detectionKm: 10, q: 0.2, load: { mk82: 2, ir_aam_old: 2 } },
  { id: 'ia58_pucara', name: 'FMA IA-58 Pucara', cls: 'attack_aircraft', crew: 2, producers: [], inService: 1975, unitCostUsdM: 3, speedKph: 430, rangeKm: 350, fuelTph: 0.35, armor: 0.2, detectionKm: 5, q: 0.3, load: { hydra70: 19, mk82: 2 } },
  { id: 'ia63_pampa', name: 'FMA IA-63 Pampa III', cls: 'attack_aircraft', producers: ['ARG'], inService: 1988, unitCostUsdM: 10, speedKph: 650, rangeKm: 350, fuelTph: 0.8, detectionKm: 5, q: 0.2, load: { mk82: 2 } },
  { id: 'pc7', name: 'Pilatus PC-7 (armed)', cls: 'attack_aircraft', producers: [], inService: 1978, unitCostUsdM: 3, speedKph: 400, rangeKm: 350, fuelTph: 0.15, armor: 0.1, detectionKm: 5, q: 0.1, load: { hydra70: 14 } },
  // Harrier II Plus (USMC, Spanish Navy): APG-65 radar, AMRAAM-capable.
  { id: 'av8b', name: 'AV-8B Harrier II Plus', cls: 'attack_aircraft', producers: [], inService: 1993, unitCostUsdM: 30, speedKph: 850, rangeKm: 450, fuelTph: 2.5, armor: 0.15, detectionKm: 100, q: 0.9, load: { aim120c: 2, gbu12: 4 } },
  // Mirage 2000D RMV: two-seat strike variant without the -5's air-intercept radar.
  { id: 'mirage2000d', name: 'Mirage 2000D RMV', cls: 'attack_aircraft', crew: 2, producers: [], inService: 1993, unitCostUsdM: 40, speedKph: 850, rangeKm: 700, fuelTph: 3, armor: 0.15, detectionKm: 60, q: 0.95, load: { gbu12: 4, mica_ng: 2 } },
];

const support: PlatformSpec<Key>[] = [
  // C-130H: ~19 t or 92 troops like the J, but ~100 km/h slower and shorter-legged.
  { id: 'c130h', name: 'C-130H Hercules', cls: 'transport_aircraft', producers: [], inService: 1974, unitCostUsdM: 30, speedKph: 540, rangeKm: 1600, fuelTph: 2.5, capacity: { cargoTons: 19, troops: 92 } },
  { id: 'y8', name: 'Y-8 / An-12 Cub', cls: 'transport_aircraft', producers: ['CHN'], inService: 1981, unitCostUsdM: 15, speedKph: 550, rangeKm: 1500, fuelTph: 2.5, capacity: { cargoTons: 20, troops: 96 } },
  { id: 'cn235', name: 'CN-235', cls: 'transport_aircraft', crew: 3, producers: ['ESP', 'IDN'], inService: 1988, unitCostUsdM: 25, speedKph: 450, rangeKm: 800, fuelTph: 0.6, capacity: { cargoTons: 6, troops: 51 } },
  // Tankers: cargoTons is fuel load, as in the base rows.
  { id: 'kc767', name: 'KC-767J/A', cls: 'tanker', crew: 3, producers: [], inService: 2008, unitCostUsdM: 200, speedKph: 850, rangeKm: 1800, fuelTph: 6.5, capacity: { cargoTons: 91 } },
  { id: 'kc707', name: 'Boeing 707 tanker (Re\'em)', cls: 'tanker', producers: [], inService: 1966, unitCostUsdM: 20, speedKph: 800, rangeKm: 2000, fuelTph: 7, capacity: { cargoTons: 70 } },
  { id: 'kc130h', name: 'KC-130H Hercules', cls: 'tanker', crew: 5, producers: [], inService: 1976, unitCostUsdM: 30, speedKph: 540, rangeKm: 1600, fuelTph: 2.5, capacity: { cargoTons: 21 } },
  // Y-8 with a mechanically scanned rotodome (KJ-200 family export); range is an estimate.
  { id: 'zdk03_aewc', name: 'ZDK-03 Karakoram Eagle', cls: 'awacs', crew: 10, producers: ['CHN'], inService: 2011, unitCostUsdM: 70, speedKph: 550, rangeKm: 1500, fuelTph: 2.5, detectionKm: 380 },
  // Il-76 with IAI EL/W-2090 Phalcon; three delivered 2009-11 for ~$1.1B.
  { id: 'a50ei', name: 'A-50EI Phalcon', cls: 'awacs', crew: 15, producers: [], inService: 2009, unitCostUsdM: 370, speedKph: 750, rangeKm: 1500, fuelTph: 7, detectionKm: 450 },
  { id: 'atr72_mpa', name: 'ATR 72 MPA (Sea Eagle)', cls: 'maritime_patrol', crew: 7, producers: ['ITA'], inService: 2018, unitCostUsdM: 40, speedKph: 500, rangeKm: 1500, fuelTph: 0.8, detectionKm: 250, q: 0.6, load: { mk54: 2 } },
];

const drones: PlatformSpec<Key>[] = [
  // Datalink line-of-sight ~150 km without satcom; most export units fly LOS.
  { id: 'wing_loong1', name: 'Wing Loong I', cls: 'strike_drone', producers: ['CHN'], inService: 2011, unitCostUsdM: 1, speedKph: 180, rangeKm: 800, fuelTph: 0.05, stealth: 0.25, detectionKm: 40, q: 0.6, load: { akd10: 2 } },
  // The ORBATs count Geran/Shahed airframes (300-800 per launch group), not launch trucks, so this row is
  // one drone on its rail; shahed_launcher stays the 5-rail truck. Cost is the rail share; the drone is the munition.
  { id: 'shahed_136', name: 'Shahed-136 / Geran-2 on launch rail', cls: 'loitering_munition_launcher', crew: 1, producers: ['IRN', 'RUS'], inService: 2022, unitCostUsdM: 0.02, speedKph: 40, load: { shahed136: 1 } },
  { id: 'lancet', name: 'ZALA Lancet-3 with launcher share', cls: 'loitering_munition_launcher', crew: 1, producers: ['RUS'], inService: 2022, unitCostUsdM: 0.01, speedKph: 40, fp: { armor: 0.004, soft: 0.015, infantry: 0.003 }, load: { lancet3: 1 } },
];

const helicopters: PlatformSpec<Key>[] = [
  { id: 'ah1s', name: 'AH-1S/F Cobra', cls: 'attack_helo', producers: [], inService: 1977, unitCostUsdM: 8, speedKph: 230, rangeKm: 250, fuelTph: 0.35, armor: 0.2, detectionKm: 6, q: 0.6, load: { tow2b: 8, hydra70: 14 } },
  { id: 'ah1w', name: 'AH-1W SuperCobra', cls: 'attack_helo', producers: [], inService: 1986, unitCostUsdM: 12, speedKph: 250, rangeKm: 250, fuelTph: 0.4, armor: 0.25, detectionKm: 10, q: 0.85, load: { hellfire: 8, hydra70: 14 } },
  { id: 'rooivalk', name: 'Denel Rooivalk Mk1', cls: 'attack_helo', producers: ['ZAF'], inService: 2011, unitCostUsdM: 40, speedKph: 260, rangeKm: 350, fuelTph: 0.45, armor: 0.3, detectionKm: 12, q: 0.8, load: { mokopa: 8 } },
  // Armed scout with mast-mounted sight and Hellfire, so attack_helo rather than utility.
  { id: 'oh58d', name: 'OH-58D Kiowa Warrior', cls: 'attack_helo', producers: [], inService: 1985, unitCostUsdM: 8, speedKph: 200, rangeKm: 250, fuelTph: 0.2, armor: 0.1, detectionKm: 10, q: 0.45, load: { hellfire: 4 } },
  // UH-1H: 11-14 troops, 1.76 t. UH-1J and Bell 412 (13 troops, ~2 t) alias here.
  { id: 'uh1h', name: 'UH-1H Iroquois / Bell 212-412 family', cls: 'transport_helo', crew: 2, producers: [], inService: 1963, unitCostUsdM: 2, speedKph: 200, rangeKm: 250, fuelTph: 0.3, capacity: { troops: 12, cargoTons: 1.8 } },
  { id: 'alh_dhruv', name: 'HAL Dhruv ALH', cls: 'transport_helo', crew: 2, producers: ['IND'], inService: 2002, unitCostUsdM: 10, speedKph: 250, rangeKm: 300, fuelTph: 0.35, capacity: { troops: 12, cargoTons: 1.5 } },
  { id: 'chetak', name: 'HAL Chetak (Alouette III)', cls: 'transport_helo', crew: 1, producers: ['IND'], inService: 1965, unitCostUsdM: 1, speedKph: 185, rangeKm: 250, fuelTph: 0.15, capacity: { troops: 5, cargoTons: 0.75 } },
  // Z-9 is the licensed AS365 Dauphin; AS365 and Brazil's HM-1 Pantera (AS565) alias here.
  { id: 'z9', name: 'Z-9 / AS365 Dauphin', cls: 'transport_helo', crew: 2, producers: ['CHN', 'FRA'], inService: 1994, unitCostUsdM: 6, speedKph: 260, rangeKm: 350, fuelTph: 0.3, capacity: { troops: 10, cargoTons: 1.9 } },
  { id: 'as550_fennec', name: 'AS550/AS350 Fennec', cls: 'transport_helo', crew: 1, producers: ['FRA', 'BRA'], inService: 1990, unitCostUsdM: 3, speedKph: 220, rangeKm: 300, fuelTph: 0.15, capacity: { troops: 4, cargoTons: 1 } },
  { id: 'h145m', name: 'H145M', cls: 'transport_helo', crew: 2, producers: ['DEU'], inService: 2015, unitCostUsdM: 10, speedKph: 230, rangeKm: 300, fuelTph: 0.25, capacity: { troops: 9, cargoTons: 1.7 } },
  { id: 'a109', name: 'AW109', cls: 'transport_helo', crew: 2, producers: ['ITA'], inService: 1976, unitCostUsdM: 6, speedKph: 260, rangeKm: 300, fuelTph: 0.25, capacity: { troops: 6, cargoTons: 1 } },
  { id: 'oryx', name: 'Atlas Oryx (Puma upgrade)', cls: 'transport_helo', producers: ['ZAF'], inService: 1994, unitCostUsdM: 8, speedKph: 250, rangeKm: 400, fuelTph: 0.5, capacity: { troops: 16, cargoTons: 3 } },
  { id: 'ch53d', name: 'CH-53D Yasur', cls: 'transport_helo', producers: [], inService: 1969, unitCostUsdM: 25, speedKph: 260, rangeKm: 400, fuelTph: 1.2, capacity: { troops: 38, cargoTons: 6 } },
  // mk54 stands in for the Mk 46 / K745 lightweight torpedoes these carry.
  { id: 'super_lynx', name: 'Super Lynx Mk 99/300', cls: 'asw_helo', crew: 2, producers: ['GBR'], inService: 1990, unitCostUsdM: 20, speedKph: 240, rangeKm: 300, detectionKm: 25, q: 0.8, load: { mk54: 2 } },
  { id: 'sea_king', name: 'Westland Sea King Mk45', cls: 'asw_helo', crew: 4, producers: [], inService: 1975, unitCostUsdM: 10, speedKph: 200, rangeKm: 350, fuelTph: 0.6, detectionKm: 25, q: 0.6, load: { mk54: 2 } },
  { id: 's70b', name: 'S-70B Seahawk', cls: 'asw_helo', producers: ['USA'], inService: 2012, unitCostUsdM: 30, speedKph: 260, rangeKm: 400, detectionKm: 35, q: 1.0, load: { mk54: 2, hellfire: 4 } },
  { id: 'a129', name: 'A129 Mangusta', cls: 'attack_helo', crew: 2, producers: [], inService: 1990, unitCostUsdM: 15, speedKph: 250, rangeKm: 250, fuelTph: 0.3, armor: 0.2, detectionKm: 10, q: 0.75, load: { tow2b: 8 } },
  // Max external hook load: CH-53E 32,000 lb, CH-53K 36,000 lb (NAVAIR); CH-53K ~$120M flyaway (GAO, estimate).
  { id: 'ch53e', name: 'CH-53E Super Stallion', cls: 'transport_helo', crew: 4, producers: [], inService: 1981, unitCostUsdM: 35, speedKph: 280, rangeKm: 500, fuelTph: 1.5, capacity: { troops: 37, cargoTons: 14.5 } },
  { id: 'ch53k', name: 'CH-53K King Stallion', cls: 'transport_helo', crew: 4, producers: ['USA'], inService: 2022, unitCostUsdM: 120, speedKph: 290, rangeKm: 500, fuelTph: 1.6, capacity: { troops: 30, cargoTons: 16.3 } },
];

export const platforms = [...fixedWing, ...support, ...drones, ...helicopters].map(toPlatform);
export const munitions = extraMunitions.map(toMunition);

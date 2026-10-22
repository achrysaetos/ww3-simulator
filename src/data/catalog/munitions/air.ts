/**
 * Air-launched weapons: air-to-air missiles, guided and unguided bombs,
 * glide kits, anti-radiation missiles and helicopter/UAV missiles.
 *
 * AAM pk vs aircraft: RAND and Higby (2005) put historical BVR pk near 0.45-0.5
 * for AIM-120 and much lower for older Sparrows; WVR AIM-9X ~0.6-0.7. These are
 * per shot against a non-stealthy target; the air system discounts for stealth
 * and EW. US costs from Air Force/Navy FY2024-25 P-1 books.
 */
import { defineMunitions } from '../build';

const bombPk = (hard: number) => ({ structure: 0.75, soft: 0.8, armor: 0.5, infantry: 0.5, hardened: hard, ship: 0.3 });

export const airMunitions = defineMunitions([
  // ---- air-to-air
  { id: 'aim120d', name: 'AIM-120D AMRAAM', kind: 'aam', producers: ['USA'], rangeKm: 160, speedMach: 4, warheadKg: 23, cepM: 5, pk: { aircraft: 0.5, helicopter: 0.6, missile: 0.3 }, interceptDifficulty: 0.2, unitCostUsdM: 1.1, weightKg: 161 },
  { id: 'aim120c', name: 'AIM-120C-7 AMRAAM', kind: 'aam', producers: ['USA'], rangeKm: 105, speedMach: 4, warheadKg: 23, cepM: 5, pk: { aircraft: 0.45, helicopter: 0.55, missile: 0.25 }, interceptDifficulty: 0.2, unitCostUsdM: 1, weightKg: 157 },
  { id: 'aim9x', name: 'AIM-9X Block II', kind: 'aam', producers: ['USA'], rangeKm: 35, speedMach: 2.5, warheadKg: 9, cepM: 2, pk: { aircraft: 0.65, helicopter: 0.7, missile: 0.3 }, interceptDifficulty: 0.2, unitCostUsdM: 0.47, weightKg: 85 },
  { id: 'aim260', name: 'AIM-260 JATM', kind: 'aam', producers: ['USA'], rangeKm: 200, speedMach: 5, warheadKg: 20, cepM: 5, pk: { aircraft: 0.55, helicopter: 0.6, missile: 0.3 }, interceptDifficulty: 0.25, unitCostUsdM: 1.5, weightKg: 160 },
  { id: 'meteor', name: 'MBDA Meteor', kind: 'aam', producers: ['GBR', 'FRA', 'DEU', 'ITA', 'ESP', 'SWE'], rangeKm: 200, speedMach: 4, warheadKg: 20, cepM: 5, pk: { aircraft: 0.55, helicopter: 0.6, missile: 0.3 }, interceptDifficulty: 0.25, unitCostUsdM: 2.2, weightKg: 190 },
  { id: 'mica_ng', name: 'MICA NG', kind: 'aam', producers: ['FRA'], rangeKm: 80, speedMach: 4, warheadKg: 12, cepM: 3, pk: { aircraft: 0.5, helicopter: 0.6, missile: 0.3 }, interceptDifficulty: 0.2, unitCostUsdM: 1.5, weightKg: 112 },
  { id: 'iris_t', name: 'IRIS-T', kind: 'aam', producers: ['DEU'], rangeKm: 25, speedMach: 3, warheadKg: 11, cepM: 2, pk: { aircraft: 0.65, helicopter: 0.7, missile: 0.35 }, interceptDifficulty: 0.2, unitCostUsdM: 0.43, weightKg: 87 },
  { id: 'asraam', name: 'AIM-132 ASRAAM', kind: 'aam', producers: ['GBR'], rangeKm: 50, speedMach: 3, warheadKg: 10, cepM: 2, pk: { aircraft: 0.6, helicopter: 0.7, missile: 0.3 }, interceptDifficulty: 0.2, unitCostUsdM: 0.5, weightKg: 88 },
  { id: 'r77_1', name: 'R-77-1 (RVV-SD)', kind: 'aam', producers: ['RUS'], rangeKm: 110, speedMach: 4, warheadKg: 22, cepM: 5, pk: { aircraft: 0.4, helicopter: 0.5, missile: 0.2 }, interceptDifficulty: 0.2, unitCostUsdM: 0.8, weightKg: 190 },
  { id: 'r77m', name: 'R-77M (izdeliye 180)', kind: 'aam', producers: ['RUS'], rangeKm: 190, speedMach: 4, warheadKg: 22, cepM: 5, pk: { aircraft: 0.45, helicopter: 0.5, missile: 0.2 }, interceptDifficulty: 0.2, unitCostUsdM: 1.2, weightKg: 226 },
  // R-37M: used from Su-35/MiG-31 at 150-200 km against Ukrainian aircraft (RUSI 2022).
  { id: 'r37m', name: 'R-37M (RVV-BD)', kind: 'aam', producers: ['RUS'], rangeKm: 300, speedMach: 6, warheadKg: 60, cepM: 10, pk: { aircraft: 0.4, helicopter: 0.4 }, interceptDifficulty: 0.3, unitCostUsdM: 1.5, weightKg: 510 },
  { id: 'r73', name: 'R-73 / R-74M', kind: 'aam', producers: ['RUS'], rangeKm: 30, speedMach: 2.5, warheadKg: 7, cepM: 2, pk: { aircraft: 0.5, helicopter: 0.6, missile: 0.2 }, interceptDifficulty: 0.2, unitCostUsdM: 0.3, weightKg: 105 },
  { id: 'r27er', name: 'R-27ER', kind: 'aam', producers: ['RUS', 'UKR'], rangeKm: 90, speedMach: 4, warheadKg: 39, cepM: 10, pk: { aircraft: 0.3, helicopter: 0.4 }, interceptDifficulty: 0.15, unitCostUsdM: 0.4, weightKg: 350 },
  { id: 'pl15', name: 'PL-15', kind: 'aam', producers: ['CHN'], rangeKm: 200, speedMach: 5, warheadKg: 20, cepM: 5, pk: { aircraft: 0.5, helicopter: 0.55, missile: 0.25 }, interceptDifficulty: 0.25, unitCostUsdM: 1, weightKg: 210 },
  // PL-17: very-long-range AAM for tanker/AWACS hunting; range per open estimates.
  { id: 'pl17', name: 'PL-17', kind: 'aam', producers: ['CHN'], rangeKm: 400, speedMach: 4, warheadKg: 30, cepM: 10, pk: { aircraft: 0.45 }, interceptDifficulty: 0.3, unitCostUsdM: 2, weightKg: 500 },
  { id: 'pl12', name: 'PL-12 / SD-10', kind: 'aam', producers: ['CHN', 'PAK'], rangeKm: 80, speedMach: 4, warheadKg: 22, cepM: 5, pk: { aircraft: 0.4, helicopter: 0.5 }, interceptDifficulty: 0.2, unitCostUsdM: 0.6, weightKg: 199 },
  { id: 'pl10', name: 'PL-10', kind: 'aam', producers: ['CHN'], rangeKm: 20, speedMach: 3, warheadKg: 10, cepM: 2, pk: { aircraft: 0.6, helicopter: 0.7, missile: 0.25 }, interceptDifficulty: 0.2, unitCostUsdM: 0.3, weightKg: 89 },
  { id: 'astra1', name: 'Astra Mk1', kind: 'aam', producers: ['IND'], rangeKm: 110, speedMach: 4, warheadKg: 15, cepM: 5, pk: { aircraft: 0.4, helicopter: 0.5 }, interceptDifficulty: 0.2, unitCostUsdM: 0.9, weightKg: 154 },
  { id: 'python5', name: 'Python-5', kind: 'aam', producers: ['ISR'], rangeKm: 20, speedMach: 4, warheadKg: 11, cepM: 2, pk: { aircraft: 0.65, helicopter: 0.7, missile: 0.3 }, interceptDifficulty: 0.2, unitCostUsdM: 0.5, weightKg: 105 },
  { id: 'derby_er', name: 'I-Derby ER', kind: 'aam', producers: ['ISR'], rangeKm: 100, speedMach: 4, warheadKg: 23, cepM: 5, pk: { aircraft: 0.45, helicopter: 0.55 }, interceptDifficulty: 0.2, unitCostUsdM: 0.9, weightKg: 118 },
  { id: 'aim7m', name: 'AIM-7M Sparrow', kind: 'aam', producers: [], rangeKm: 70, speedMach: 4, warheadKg: 40, cepM: 10, pk: { aircraft: 0.3, helicopter: 0.4 }, interceptDifficulty: 0.15, unitCostUsdM: 0.4, weightKg: 231 },
  { id: 'aam4b', name: 'AAM-4B (Type 99)', kind: 'aam', producers: ['JPN'], rangeKm: 120, speedMach: 4, warheadKg: 20, cepM: 5, pk: { aircraft: 0.5, helicopter: 0.55, missile: 0.3 }, interceptDifficulty: 0.2, unitCostUsdM: 1.2, weightKg: 224 },
  { id: 'aam5', name: 'AAM-5 (Type 04)', kind: 'aam', producers: ['JPN'], rangeKm: 35, speedMach: 3, warheadKg: 10, cepM: 2, pk: { aircraft: 0.65, helicopter: 0.7, missile: 0.3 }, interceptDifficulty: 0.2, unitCostUsdM: 0.6, weightKg: 95 },
  { id: 'ir_aam_old', name: 'Older IR AAM (AIM-9P / R-60 / PL-5 / PL-8)', kind: 'aam', producers: ['CHN', 'PAK', 'IRN', 'PRK'], rangeKm: 10, speedMach: 2.5, warheadKg: 5, cepM: 3, pk: { aircraft: 0.3, helicopter: 0.45 }, interceptDifficulty: 0.15, unitCostUsdM: 0.1, weightKg: 75 },
  { id: 'aim54',name: 'AIM-54 Phoenix / Fakour-90', kind: 'aam', producers: ['IRN'], rangeKm: 150, speedMach: 5, warheadKg: 60, cepM: 15, pk: { aircraft: 0.3 }, interceptDifficulty: 0.2, unitCostUsdM: 1, weightKg: 450 },

  // ---- guided bombs and glide kits
  // JDAM tail kit ~$25k + Mk 84 body; GBU-31 total ~$0.04M.
  { id: 'gbu31', name: 'GBU-31 JDAM (2,000 lb)', kind: 'guided_bomb', producers: ['USA'], rangeKm: 28, speedMach: 0.9, warheadKg: 429, cepM: 5, pk: bombPk(0.3), interceptDifficulty: 0.15, unitCostUsdM: 0.04, weightKg: 934 },
  { id: 'gbu38', name: 'GBU-38 JDAM (500 lb)', kind: 'guided_bomb', producers: ['USA'], rangeKm: 24, speedMach: 0.9, warheadKg: 89, cepM: 5, pk: { ...bombPk(0.05), structure: 0.5 }, interceptDifficulty: 0.15, unitCostUsdM: 0.03, weightKg: 253 },
  { id: 'jdam_er', name: 'JDAM-ER (GBU-62)', kind: 'glide_bomb', producers: ['USA'], rangeKm: 72, speedMach: 0.9, warheadKg: 89, cepM: 8, pk: { ...bombPk(0.05), structure: 0.5 }, interceptDifficulty: 0.15, unitCostUsdM: 0.07, weightKg: 260 },
  { id: 'gbu39', name: 'GBU-39 Small Diameter Bomb', kind: 'glide_bomb', producers: ['USA'], rangeKm: 110, speedMach: 0.9, warheadKg: 17, cepM: 3, pk: { structure: 0.5, soft: 0.7, armor: 0.4, infantry: 0.4, hardened: 0.15 }, interceptDifficulty: 0.15, unitCostUsdM: 0.04, weightKg: 129 },
  { id: 'gbu53', name: 'GBU-53/B StormBreaker (SDB II)', kind: 'glide_bomb', producers: ['USA'], rangeKm: 72, speedMach: 0.9, warheadKg: 23, cepM: 2, pk: { structure: 0.45, soft: 0.7, armor: 0.65, infantry: 0.4, ship: 0.15 }, interceptDifficulty: 0.15, unitCostUsdM: 0.2, weightKg: 93 },
  { id: 'gbu12', name: 'GBU-12 Paveway II', kind: 'guided_bomb', producers: ['USA', 'GBR'], rangeKm: 15, speedMach: 0.9, warheadKg: 89, cepM: 3, pk: { ...bombPk(0.05), structure: 0.5 }, interceptDifficulty: 0.1, unitCostUsdM: 0.02, weightKg: 230 },
  { id: 'paveway4', name: 'Paveway IV', kind: 'guided_bomb', producers: ['GBR'], rangeKm: 15, speedMach: 0.9, warheadKg: 100, cepM: 3, pk: { ...bombPk(0.05), structure: 0.55 }, interceptDifficulty: 0.1, unitCostUsdM: 0.07, weightKg: 230 },
  // GBU-57 MOP: 30,000 lb penetrator, B-2/B-21 only.
  { id: 'gbu57', name: 'GBU-57 Massive Ordnance Penetrator', kind: 'guided_bomb', producers: ['USA'], rangeKm: 15, speedMach: 0.9, warheadKg: 2400, cepM: 5, pk: { hardened: 0.8, structure: 1 }, interceptDifficulty: 0.15, unitCostUsdM: 3.5, weightKg: 13600 },
  { id: 'agm154c', name: 'AGM-154C JSOW', kind: 'glide_bomb', producers: ['USA'], rangeKm: 130, speedMach: 0.8, warheadKg: 220, cepM: 3, pk: { ...bombPk(0.2), ship: 0.25 }, interceptDifficulty: 0.25, unitCostUsdM: 0.7, weightKg: 483 },
  { id: 'aasm_hammer', name: 'AASM Hammer', kind: 'glide_bomb', producers: ['FRA'], rangeKm: 70, speedMach: 0.9, warheadKg: 125, cepM: 2, pk: bombPk(0.1), interceptDifficulty: 0.15, unitCostUsdM: 0.3, weightKg: 340 },
  { id: 'spice2000', name: 'SPICE 2000', kind: 'glide_bomb', producers: ['ISR'], rangeKm: 60, speedMach: 0.9, warheadKg: 429, cepM: 3, pk: bombPk(0.35), interceptDifficulty: 0.15, unitCostUsdM: 0.3, weightKg: 1000 },
  // UMPK/UMPB glide kits: Russia drops ~100+/day on the front (ISW, 2024); ~$20-30k each.
  { id: 'fab500_umpk', name: 'FAB-500M62 with UMPK', kind: 'glide_bomb', producers: ['RUS'], rangeKm: 60, speedMach: 0.8, warheadKg: 200, cepM: 15, pk: { structure: 0.6, soft: 0.7, infantry: 0.5, armor: 0.25, hardened: 0.05 }, interceptDifficulty: 0.05, unitCostUsdM: 0.03, weightKg: 550 },
  { id: 'fab1500_umpk', name: 'FAB-1500M54 with UMPK', kind: 'glide_bomb', producers: ['RUS'], rangeKm: 60, speedMach: 0.8, warheadKg: 675, cepM: 20, pk: { structure: 0.85, soft: 0.85, infantry: 0.7, armor: 0.4, hardened: 0.25 }, interceptDifficulty: 0.05, unitCostUsdM: 0.04, weightKg: 1550 },
  { id: 'fab3000_umpk', name: 'FAB-3000M54 with UMPK', kind: 'glide_bomb', producers: ['RUS'], rangeKm: 60, speedMach: 0.8, warheadKg: 1400, cepM: 25, pk: { structure: 0.95, soft: 0.9, infantry: 0.8, armor: 0.5, hardened: 0.4 }, interceptDifficulty: 0.05, unitCostUsdM: 0.06, weightKg: 3070 },
  { id: 'kab500l', name: 'KAB-500L', kind: 'guided_bomb', producers: ['RUS'], rangeKm: 10, speedMach: 0.8, warheadKg: 195, cepM: 7, pk: bombPk(0.1), interceptDifficulty: 0.1, unitCostUsdM: 0.05, weightKg: 534 },
  { id: 'kab1500', name: 'KAB-1500L/S', kind: 'guided_bomb', producers: ['RUS'], rangeKm: 15, speedMach: 0.8, warheadKg: 1170, cepM: 7, pk: bombPk(0.45), interceptDifficulty: 0.1, unitCostUsdM: 0.1, weightKg: 1525 },
  { id: 'ls6', name: 'LS-6 / FT-6 glide bomb', kind: 'glide_bomb', producers: ['CHN'], rangeKm: 60, speedMach: 0.8, warheadKg: 250, cepM: 10, pk: bombPk(0.1), interceptDifficulty: 0.1, unitCostUsdM: 0.05, weightKg: 570 },
  { id: 'ft12', name: 'FT-12 / GB-4 guided bomb', kind: 'guided_bomb', producers: ['CHN'], rangeKm: 20, speedMach: 0.8, warheadKg: 100, cepM: 5, pk: bombPk(0.05), interceptDifficulty: 0.1, unitCostUsdM: 0.03, weightKg: 250 },
  { id: 'teber', name: 'TEBER / KUZGUN glide kit', kind: 'glide_bomb', producers: ['TUR'], rangeKm: 30, speedMach: 0.8, warheadKg: 100, cepM: 5, pk: bombPk(0.05), interceptDifficulty: 0.1, unitCostUsdM: 0.05, weightKg: 250 },
  { id: 'kab20', name: 'KAB-20 / KAB-50 small guided bomb (UAV)', kind: 'guided_bomb', producers: ['RUS'], rangeKm: 5, speedMach: 0.5, warheadKg: 7, cepM: 3, pk: { armor: 0.35, soft: 0.6, infantry: 0.3 }, interceptDifficulty: 0.05, unitCostUsdM: 0.02, weightKg: 20 },
  { id: 'qaem5', name: 'Qaem-5 / Sadid-345 UAV munition', kind: 'atgm', producers: ['IRN'], rangeKm: 8, speedMach: 0.6, warheadKg: 8, cepM: 3, pk: { armor: 0.45, soft: 0.7, infantry: 0.3 }, interceptDifficulty: 0.05, unitCostUsdM: 0.03, weightKg: 30 },
  { id: 'mam_l',name: 'MAM-L smart micro munition', kind: 'guided_bomb', producers: ['TUR'], rangeKm: 15, speedMach: 0.6, warheadKg: 10, cepM: 2, pk: { armor: 0.55, soft: 0.7, infantry: 0.4, structure: 0.2 }, interceptDifficulty: 0.05, unitCostUsdM: 0.03, weightKg: 22 },

  // ---- unguided
  { id: 'mk82', name: 'Mk 82 (500 lb)', kind: 'unguided_bomb', producers: ['USA', 'TUR', 'KOR', 'IND'], rangeKm: 5, speedMach: 0.8, warheadKg: 89, cepM: 30, pk: { structure: 0.2, soft: 0.4, infantry: 0.3, armor: 0.1 }, interceptDifficulty: 0.05, unitCostUsdM: 0.003, weightKg: 241 },
  { id: 'mk84', name: 'Mk 84 (2,000 lb)', kind: 'unguided_bomb', producers: ['USA', 'TUR', 'KOR'], rangeKm: 5, speedMach: 0.8, warheadKg: 429, cepM: 30, pk: { structure: 0.4, soft: 0.6, infantry: 0.5, armor: 0.25 }, interceptDifficulty: 0.05, unitCostUsdM: 0.016, weightKg: 925 },
  { id: 'fab500', name: 'FAB-500M62', kind: 'unguided_bomb', producers: ['RUS', 'CHN', 'IRN', 'PRK'], rangeKm: 5, speedMach: 0.8, warheadKg: 200, cepM: 40, pk: { structure: 0.25, soft: 0.45, infantry: 0.35, armor: 0.12 }, interceptDifficulty: 0.05, unitCostUsdM: 0.003, weightKg: 500 },
  { id: 'cbu97', name: 'CBU-97 Sensor Fuzed Weapon', kind: 'unguided_bomb', producers: ['USA'], rangeKm: 10, speedMach: 0.8, warheadKg: 380, cepM: 20, pk: { armor: 0.75, soft: 0.8, infantry: 0.4 }, interceptDifficulty: 0.05, unitCostUsdM: 0.36, weightKg: 420 },

  // ---- anti-radiation
  { id: 'agm88e', name: 'AGM-88E AARGM', kind: 'arm', producers: ['USA', 'ITA'], rangeKm: 150, speedMach: 2, warheadKg: 66, cepM: 5, pk: { soft: 0.7, structure: 0.3 }, interceptDifficulty: 0.4, unitCostUsdM: 0.9, weightKg: 361 },
  { id: 'aargm_er', name: 'AGM-88G AARGM-ER', kind: 'arm', producers: ['USA'], rangeKm: 300, speedMach: 4, warheadKg: 66, cepM: 5, pk: { soft: 0.75, structure: 0.3 }, interceptDifficulty: 0.55, unitCostUsdM: 1.5, weightKg: 460 },
  { id: 'kh31p', name: 'Kh-31PD', kind: 'arm', producers: ['RUS'], rangeKm: 250, speedMach: 3.5, warheadKg: 110, cepM: 8, pk: { soft: 0.65, structure: 0.3 }, interceptDifficulty: 0.5, unitCostUsdM: 0.7, weightKg: 715 },
  { id: 'kh31a', name: 'Kh-31AD anti-ship', kind: 'antiship_cruise', producers: ['RUS'], rangeKm: 160, speedMach: 3.5, warheadKg: 110, cepM: 5, pk: { ship: 0.5, structure: 0.3, soft: 0.4 }, interceptDifficulty: 0.55, unitCostUsdM: 0.8, weightKg: 715 },
  // ADM-160B/C MALD and MALD-J: a jet decoy with a radar signature like a strike aircraft or missile, ~USD 0.32M
  // (USAF FY2024 P-1). Fired with a raid, it draws interceptors and fire-control channels and kills nothing.
  { id: 'mald', name: 'ADM-160 MALD / MALD-J decoy', kind: 'cruise', producers: ['USA'], rangeKm: 925, speedMach: 0.8, warheadKg: 0, cepM: 0, pk: { structure: 0 }, interceptDifficulty: 0.3, unitCostUsdM: 0.32, weightKg: 130 },
  { id: 'ld10', name: 'LD-10 / CM-102', kind: 'arm', producers: ['CHN'], rangeKm: 100, speedMach: 3, warheadKg: 60, cepM: 8, pk: { soft: 0.6, structure: 0.3 }, interceptDifficulty: 0.4, unitCostUsdM: 0.6, weightKg: 600 },
  { id: 'yj91', name: 'YJ-91 ARM / anti-ship', kind: 'arm', producers: ['CHN'], rangeKm: 120, speedMach: 3.5, warheadKg: 90, cepM: 8, pk: { soft: 0.6, ship: 0.35, structure: 0.3 }, interceptDifficulty: 0.5, unitCostUsdM: 0.7, weightKg: 600 },

  // ---- air-to-surface tactical missiles
  { id: 'hellfire', name: 'AGM-114R Hellfire', kind: 'atgm', producers: ['USA'], rangeKm: 11, speedMach: 1.3, warheadKg: 9, cepM: 1, pk: { armor: 0.8, soft: 0.85, infantry: 0.5, structure: 0.3, ship: 0.05, helicopter: 0.3 }, interceptDifficulty: 0.1, unitCostUsdM: 0.15, weightKg: 49 },
  { id: 'jagm', name: 'AGM-179 JAGM', kind: 'atgm', producers: ['USA'], rangeKm: 16, speedMach: 1.3, warheadKg: 9, cepM: 1, pk: { armor: 0.85, soft: 0.85, infantry: 0.5, structure: 0.3, ship: 0.08 }, interceptDifficulty: 0.1, unitCostUsdM: 0.22, weightKg: 52 },
  { id: 'brimstone', name: 'Brimstone 2', kind: 'atgm', producers: ['GBR'], rangeKm: 40, speedMach: 1.3, warheadKg: 6, cepM: 1, pk: { armor: 0.8, soft: 0.85, infantry: 0.4, ship: 0.05 }, interceptDifficulty: 0.1, unitCostUsdM: 0.2, weightKg: 50 },
  { id: 'agm65', name: 'AGM-65 Maverick', kind: 'atgm', producers: ['USA'], rangeKm: 22, speedMach: 1, warheadKg: 57, cepM: 2, pk: { armor: 0.8, soft: 0.85, structure: 0.4, ship: 0.1 }, interceptDifficulty: 0.1, unitCostUsdM: 0.17, weightKg: 300 },
  { id: 'vikhr', name: '9K121 Vikhr-1', kind: 'atgm', producers: ['RUS'], rangeKm: 10, speedMach: 1.8, warheadKg: 8, cepM: 1, pk: { armor: 0.65, soft: 0.8, infantry: 0.4, helicopter: 0.3 }, interceptDifficulty: 0.1, unitCostUsdM: 0.1, weightKg: 45 },
  { id: 'ataka', name: '9M120 Ataka', kind: 'atgm', producers: ['RUS'], rangeKm: 6, speedMach: 1.5, warheadKg: 7, cepM: 1, pk: { armor: 0.55, soft: 0.8, infantry: 0.4 }, interceptDifficulty: 0.1, unitCostUsdM: 0.06, weightKg: 49 },
  { id: 'lmur', name: 'LMUR (izdeliye 305)', kind: 'atgm', producers: ['RUS'], rangeKm: 14, speedMach: 0.8, warheadKg: 25, cepM: 2, pk: { armor: 0.7, soft: 0.85, structure: 0.4, infantry: 0.4 }, interceptDifficulty: 0.1, unitCostUsdM: 0.2, weightKg: 105 },
  { id: 'kh38', name: 'Kh-38ML', kind: 'atgm', producers: ['RUS'], rangeKm: 40, speedMach: 2.2, warheadKg: 250, cepM: 3, pk: { armor: 0.8, soft: 0.85, structure: 0.6, ship: 0.15 }, interceptDifficulty: 0.15, unitCostUsdM: 0.3, weightKg: 520 },
  { id: 'kh29', name: 'Kh-29L/T', kind: 'atgm', producers: ['RUS'], rangeKm: 30, speedMach: 2.5, warheadKg: 320, cepM: 3, pk: { armor: 0.8, soft: 0.85, structure: 0.6, hardened: 0.2, ship: 0.15 }, interceptDifficulty: 0.15, unitCostUsdM: 0.2, weightKg: 680 },
  { id: 'akd10', name: 'AKD-10 / AR-1', kind: 'atgm', producers: ['CHN'], rangeKm: 10, speedMach: 1, warheadKg: 10, cepM: 1, pk: { armor: 0.7, soft: 0.8, infantry: 0.4 }, interceptDifficulty: 0.1, unitCostUsdM: 0.1, weightKg: 45 },
  { id: 'spike_nlos', name: 'Spike NLOS', kind: 'atgm', producers: ['ISR'], rangeKm: 32, speedMach: 0.6, warheadKg: 13, cepM: 1, pk: { armor: 0.8, soft: 0.85, structure: 0.4, infantry: 0.4, ship: 0.08 }, interceptDifficulty: 0.1, unitCostUsdM: 0.25, weightKg: 71 },
  { id: 'hydra70', name: 'Hydra 70 rocket (unguided)', kind: 'rocket', producers: ['USA'], rangeKm: 8, speedMach: 2, warheadKg: 4, cepM: 30, pk: { soft: 0.2, infantry: 0.15, armor: 0.02 }, interceptDifficulty: 0, unitCostUsdM: 0.003, weightKg: 13 },
  // APKWS laser kit; heavily used against Houthi drones from F-16s since 2024.
  { id: 'apkws', name: 'APKWS II', kind: 'guided_rocket', producers: ['USA'], rangeKm: 11, speedMach: 2, warheadKg: 4, cepM: 1, pk: { soft: 0.7, infantry: 0.3, armor: 0.2, missile: 0.6, helicopter: 0.4 }, interceptDifficulty: 0, unitCostUsdM: 0.025, weightKg: 15 },
  { id: 's8', name: 'S-8 80 mm rocket', kind: 'rocket', producers: ['RUS'], rangeKm: 4, speedMach: 2, warheadKg: 4, cepM: 30, pk: { soft: 0.2, infantry: 0.15, armor: 0.03 }, interceptDifficulty: 0, unitCostUsdM: 0.002, weightKg: 11 },
  { id: 'mk11_dc', name: 'Air-dropped depth charge', kind: 'unguided_bomb', producers: ['GBR', 'RUS', 'CHN'], rangeKm: 1, speedMach: 0.3, warheadKg: 80, cepM: 50, pk: { submarine: 0.05 }, interceptDifficulty: 0, unitCostUsdM: 0.005, weightKg: 145 },
]);

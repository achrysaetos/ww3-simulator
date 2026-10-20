/**
 * Conventional strike missiles: SRBMs, land-attack cruise missiles, anti-ship
 * missiles. Ranges and warheads from CSIS Missile Threat and manufacturer
 * data; US unit costs from DoD FY2024/25 budget justification books (P-1/P-40).
 *
 * interceptDifficulty is calibrated against observed interception: Ukraine
 * reports downing ~70-80% of Kalibr/Kh-101 salvos (2022-24) but a much smaller
 * share of Iskander-M and Kh-22; Israel's coalition intercepted nearly all of
 * Iran's April 2024 drones and cruise missiles and most of its ballistic ones.
 * Subsonic sea-skimmers sit near 0.3-0.5, supersonic 0.6, hypersonic 0.8+.
 */
import { defineMunitions } from '../build';

const srbmPk = { structure: 0.7, soft: 0.6, infantry: 0.4, hardened: 0.15, armor: 0.1 };
const cruisePk = { structure: 0.8, soft: 0.6, hardened: 0.3, ship: 0.4, infantry: 0.3 };
const ashmPk = (ship: number) => ({ ship, structure: 0.4, soft: 0.4 });

export const strikeMunitions = defineMunitions([
  // ---- short-range ballistic
  { id: 'iskander_m', name: '9M723 Iskander-M', kind: 'srbm', producers: ['RUS'], rangeKm: 500, speedMach: 6, warheadKg: 480, cepM: 10, pk: srbmPk, interceptDifficulty: 0.75, unitCostUsdM: 3, weightKg: 3800 },
  // ATACMS M57 Block 1A unitary; FY2018 unit ~$1.5M.
  { id: 'atacms', name: 'MGM-140 ATACMS', kind: 'srbm', producers: ['USA'], rangeKm: 300, speedMach: 3, warheadKg: 230, cepM: 9, pk: srbmPk, interceptDifficulty: 0.6, unitCostUsdM: 1.5, weightKg: 1670 },
  { id: 'prsm', name: 'PrSM Increment 1', kind: 'srbm', producers: ['USA'], rangeKm: 500, speedMach: 3, warheadKg: 90, cepM: 5, pk: { ...srbmPk, ship: 0.3 }, interceptDifficulty: 0.65, unitCostUsdM: 1.6, weightKg: 1700 },
  { id: 'tochka_u', name: 'OTR-21 Tochka-U', kind: 'srbm', producers: [], rangeKm: 120, speedMach: 5, warheadKg: 482, cepM: 95, pk: srbmPk, interceptDifficulty: 0.5, unitCostUsdM: 0.5, weightKg: 2010 },
  { id: 'df15b', name: 'DF-15B (CSS-6 Mod 3)', kind: 'srbm', producers: ['CHN'], rangeKm: 725, speedMach: 6, warheadKg: 600, cepM: 10, pk: srbmPk, interceptDifficulty: 0.7, unitCostUsdM: 2.5, weightKg: 6200 },
  { id: 'df11a', name: 'DF-11A (CSS-7 Mod 2)', kind: 'srbm', producers: ['CHN'], rangeKm: 600, speedMach: 5, warheadKg: 500, cepM: 20, pk: srbmPk, interceptDifficulty: 0.65, unitCostUsdM: 1.5, weightKg: 4200 },
  { id: 'bre8', name: 'BRE8 / Fire Dragon 480 (PHL-16 750 mm)', kind: 'srbm', producers: ['CHN'], rangeKm: 480, speedMach: 5, warheadKg: 480, cepM: 20, pk: srbmPk, interceptDifficulty: 0.65, unitCostUsdM: 1.5, weightKg: 2800 },
  { id: 'fateh110', name: 'Fateh-110', kind: 'srbm', producers: ['IRN'], rangeKm: 300, speedMach: 4, warheadKg: 450, cepM: 100, pk: srbmPk, interceptDifficulty: 0.55, unitCostUsdM: 0.5, weightKg: 3450 },
  { id: 'fateh313', name: 'Fateh-313', kind: 'srbm', producers: ['IRN'], rangeKm: 500, speedMach: 5, warheadKg: 450, cepM: 30, pk: srbmPk, interceptDifficulty: 0.6, unitCostUsdM: 0.7, weightKg: 3500 },
  { id: 'zolfaghar', name: 'Zolfaghar', kind: 'srbm', producers: ['IRN'], rangeKm: 700, speedMach: 6, warheadKg: 600, cepM: 30, pk: srbmPk, interceptDifficulty: 0.6, unitCostUsdM: 1, weightKg: 4600 },
  { id: 'hyunmoo2c', name: 'Hyunmoo-2C', kind: 'srbm', producers: ['KOR'], rangeKm: 800, speedMach: 6, warheadKg: 500, cepM: 10, pk: srbmPk, interceptDifficulty: 0.7, unitCostUsdM: 3, weightKg: 5400 },
  // Hyunmoo-4: ~2 t warhead "bunker buster" at 800 km (ROK MND).
  { id: 'hyunmoo4', name: 'Hyunmoo-4', kind: 'srbm', producers: ['KOR'], rangeKm: 800, speedMach: 8, warheadKg: 2000, cepM: 10, pk: { ...srbmPk, hardened: 0.55 }, interceptDifficulty: 0.75, unitCostUsdM: 5, weightKg: 17000 },
  { id: 'prithvi2', name: 'Prithvi-II', kind: 'srbm', producers: ['IND'], rangeKm: 350, speedMach: 5, warheadKg: 500, cepM: 25, pk: srbmPk, interceptDifficulty: 0.55, unitCostUsdM: 1, weightKg: 4600 },
  { id: 'pralay', name: 'Pralay', kind: 'srbm', producers: ['IND'], rangeKm: 500, speedMach: 6, warheadKg: 700, cepM: 10, pk: srbmPk, interceptDifficulty: 0.7, unitCostUsdM: 2, weightKg: 5000 },
  { id: 'lora', name: 'LORA', kind: 'srbm', producers: ['ISR'], rangeKm: 400, speedMach: 5, warheadKg: 440, cepM: 10, pk: srbmPk, interceptDifficulty: 0.65, unitCostUsdM: 2, weightKg: 1600 },
  // Israeli air-launched ballistic missiles, used against Iran in October 2024 and June 2025 (IISS; Elbit,
  // Rafael and IAI data; ranges and warheads are manufacturer figures or press estimates).
  { id: 'rampage', name: 'Rampage ALBM', kind: 'srbm', producers: ['ISR'], rangeKm: 150, speedMach: 3, warheadKg: 150, cepM: 5, pk: srbmPk, interceptDifficulty: 0.6, unitCostUsdM: 0.5, weightKg: 570 },
  { id: 'rocks', name: 'Rafael ROCKS ALBM', kind: 'srbm', producers: ['ISR'], rangeKm: 250, speedMach: 4, warheadKg: 200, cepM: 5, pk: { ...srbmPk, hardened: 0.35 }, interceptDifficulty: 0.65, unitCostUsdM: 1, weightKg: 1000 },
  { id: 'air_lora', name: 'Air LORA ALBM', kind: 'srbm', producers: ['ISR'], rangeKm: 400, speedMach: 5, warheadKg: 440, cepM: 10, pk: srbmPk, interceptDifficulty: 0.65, unitCostUsdM: 2, weightKg: 1600 },
  { id: 'bora', name: 'Bora (Khan)', kind: 'srbm', producers: ['TUR'], rangeKm: 280, speedMach: 5, warheadKg: 470, cepM: 10, pk: srbmPk, interceptDifficulty: 0.6, unitCostUsdM: 1.5, weightKg: 2500 },
  { id: 'scud', name: 'Scud-B/C (R-17, Hwasong-5/6, Shahab-1/2)', kind: 'srbm', producers: ['PRK', 'IRN'], rangeKm: 500, speedMach: 5, warheadKg: 770, cepM: 700, pk: { ...srbmPk, structure: 0.4, hardened: 0.03 }, interceptDifficulty: 0.5, unitCostUsdM: 1, weightKg: 6400 },
  // Hyunmoo-4-4: conventional SLBM fired from KSS-III (first test Sept 2021).
  { id: 'hyunmoo4_4', name: 'Hyunmoo-4-4 SLBM', kind: 'slbm', producers: ['KOR'], rangeKm: 500, speedMach: 7, warheadKg: 500, cepM: 10, pk: srbmPk, interceptDifficulty: 0.75, unitCostUsdM: 5, weightKg: 8000 },
  { id: 'kn25',name: 'KN-25 600 mm guided rocket', kind: 'srbm', producers: ['PRK'], rangeKm: 380, speedMach: 5, warheadKg: 300, cepM: 80, pk: srbmPk, interceptDifficulty: 0.6, unitCostUsdM: 1, weightKg: 3000 },
  // Kinzhal (Kh-47M2): air-launched aeroballistic; Patriot PAC-3 intercepts confirmed over Kyiv in May 2023.
  { id: 'kinzhal', name: 'Kh-47M2 Kinzhal', kind: 'srbm', producers: ['RUS'], rangeKm: 1500, speedMach: 10, warheadKg: 480, cepM: 10, pk: srbmPk, interceptDifficulty: 0.75, unitCostUsdM: 10, weightKg: 4300 },

  // ---- land-attack cruise
  // Tomahawk Block V; FY2024 unit ~$2.0M.
  { id: 'tomahawk', name: 'BGM-109 Tomahawk Block V', kind: 'cruise', producers: ['USA'], rangeKm: 1600, speedMach: 0.75, warheadKg: 450, cepM: 10, pk: cruisePk, interceptDifficulty: 0.35, unitCostUsdM: 2, weightKg: 1510 },
  // JASSM-ER FY2024 unit ~$1.5M (Lot 21).
  { id: 'jassm_er', name: 'AGM-158B JASSM-ER', kind: 'cruise', producers: ['USA'], rangeKm: 925, speedMach: 0.8, warheadKg: 450, cepM: 3, pk: { ...cruisePk, hardened: 0.4 }, interceptDifficulty: 0.55, unitCostUsdM: 1.5, weightKg: 1020 },
  { id: 'jassm', name: 'AGM-158A JASSM', kind: 'cruise', producers: ['USA'], rangeKm: 370, speedMach: 0.8, warheadKg: 450, cepM: 3, pk: { ...cruisePk, hardened: 0.4 }, interceptDifficulty: 0.55, unitCostUsdM: 1.1, weightKg: 1020 },
  { id: 'storm_shadow', name: 'Storm Shadow / SCALP-EG', kind: 'cruise', producers: ['GBR', 'FRA'], rangeKm: 560, speedMach: 0.8, warheadKg: 450, cepM: 3, pk: { ...cruisePk, hardened: 0.45 }, interceptDifficulty: 0.45, unitCostUsdM: 2.5, weightKg: 1300 },
  { id: 'taurus', name: 'Taurus KEPD 350', kind: 'cruise', producers: ['DEU', 'SWE'], rangeKm: 500, speedMach: 0.9, warheadKg: 480, cepM: 3, pk: { ...cruisePk, hardened: 0.55 }, interceptDifficulty: 0.45, unitCostUsdM: 1.2, weightKg: 1400 },
  { id: 'mdcn', name: 'MdCN naval cruise missile', kind: 'cruise', producers: ['FRA'], rangeKm: 1000, speedMach: 0.8, warheadKg: 250, cepM: 3, pk: cruisePk, interceptDifficulty: 0.4, unitCostUsdM: 3, weightKg: 1400 },
  { id: 'kalibr', name: '3M14 Kalibr', kind: 'cruise', producers: ['RUS'], rangeKm: 2000, speedMach: 0.8, warheadKg: 450, cepM: 5, pk: cruisePk, interceptDifficulty: 0.3, unitCostUsdM: 6.5, weightKg: 1770 },
  { id: 'kh101', name: 'Kh-101', kind: 'cruise', producers: ['RUS'], rangeKm: 4500, speedMach: 0.7, warheadKg: 450, cepM: 10, pk: cruisePk, interceptDifficulty: 0.3, unitCostUsdM: 13, weightKg: 2400 },
  { id: 'kh555', name: 'Kh-555', kind: 'cruise', producers: ['RUS'], rangeKm: 2000, speedMach: 0.7, warheadKg: 410, cepM: 20, pk: cruisePk, interceptDifficulty: 0.25, unitCostUsdM: 2, weightKg: 1280 },
  { id: 'kh59mk2', name: 'Kh-59MK2', kind: 'cruise', producers: ['RUS'], rangeKm: 290, speedMach: 0.8, warheadKg: 320, cepM: 3, pk: cruisePk, interceptDifficulty: 0.3, unitCostUsdM: 1, weightKg: 930 },
  { id: 'iskander_k', name: '9M728 Iskander-K', kind: 'cruise', producers: ['RUS'], rangeKm: 500, speedMach: 0.8, warheadKg: 480, cepM: 5, pk: cruisePk, interceptDifficulty: 0.35, unitCostUsdM: 1.5, weightKg: 2000 },
  // 9M729 (SSC-8): INF-violating ground-launched cruise missile, dual-capable.
  { id: 'r9m729', name: '9M729 (SSC-8)', kind: 'cruise', producers: ['RUS'], rangeKm: 2350, speedMach: 0.8, warheadKg: 450, cepM: 5, pk: cruisePk, interceptDifficulty: 0.35, unitCostUsdM: 6, weightKg: 2300 },
  { id: 'cj10', name: 'CJ-10 / CJ-10A', kind: 'cruise', producers: ['CHN'], rangeKm: 1500, speedMach: 0.75, warheadKg: 500, cepM: 10, pk: cruisePk, interceptDifficulty: 0.35, unitCostUsdM: 2, weightKg: 2200 },
  { id: 'cj100', name: 'CJ-100 (DF-100) supersonic', kind: 'cruise', producers: ['CHN'], rangeKm: 2000, speedMach: 3, warheadKg: 500, cepM: 10, pk: cruisePk, interceptDifficulty: 0.65, unitCostUsdM: 5, weightKg: 8000 },
  { id: 'kd20', name: 'KD-20 (CJ-20) ALCM', kind: 'cruise', producers: ['CHN'], rangeKm: 2000, speedMach: 0.75, warheadKg: 500, cepM: 10, pk: cruisePk, interceptDifficulty: 0.35, unitCostUsdM: 2, weightKg: 1700 },
  { id: 'brahmos', name: 'BrahMos', kind: 'antiship_cruise', producers: ['IND', 'RUS'], rangeKm: 450, speedMach: 2.8, warheadKg: 250, cepM: 3, pk: { ...ashmPk(0.55), structure: 0.7, hardened: 0.25 }, interceptDifficulty: 0.6, unitCostUsdM: 3, weightKg: 3000 },
  { id: 'babur', name: 'Babur-1A', kind: 'cruise', producers: ['PAK'], rangeKm: 450, speedMach: 0.8, warheadKg: 450, cepM: 20, pk: cruisePk, interceptDifficulty: 0.3, unitCostUsdM: 1.5, weightKg: 1500 },
  { id: 'hyunmoo3c', name: 'Hyunmoo-3C', kind: 'cruise', producers: ['KOR'], rangeKm: 1500, speedMach: 0.8, warheadKg: 450, cepM: 3, pk: cruisePk, interceptDifficulty: 0.35, unitCostUsdM: 2, weightKg: 1500 },
  { id: 'hf2e', name: 'Hsiung Feng IIE', kind: 'cruise', producers: ['TWN'], rangeKm: 1000, speedMach: 0.85, warheadKg: 200, cepM: 10, pk: cruisePk, interceptDifficulty: 0.3, unitCostUsdM: 1.5, weightKg: 1500 },
  { id: 'neptune_lacm', name: 'R-360 Neptune (land attack)', kind: 'cruise', producers: ['UKR'], rangeKm: 400, speedMach: 0.75, warheadKg: 150, cepM: 10, pk: cruisePk, interceptDifficulty: 0.3, unitCostUsdM: 1, weightKg: 870 },
  { id: 'paveh', name: 'Paveh', kind: 'cruise', producers: ['IRN'], rangeKm: 1650, speedMach: 0.7, warheadKg: 300, cepM: 30, pk: cruisePk, interceptDifficulty: 0.25, unitCostUsdM: 0.5, weightKg: 1500 },
  { id: 'soumar', name: 'Soumar / Hoveyzeh', kind: 'cruise', producers: ['IRN'], rangeKm: 2000, speedMach: 0.7, warheadKg: 410, cepM: 30, pk: cruisePk, interceptDifficulty: 0.25, unitCostUsdM: 0.8, weightKg: 1700 },

  // ---- anti-ship
  { id: 'lrasm', name: 'AGM-158C LRASM', kind: 'antiship_cruise', producers: ['USA'], rangeKm: 560, speedMach: 0.8, warheadKg: 450, cepM: 2, pk: ashmPk(0.7), interceptDifficulty: 0.55, unitCostUsdM: 3.2, weightKg: 1100 },
  { id: 'nsm', name: 'Naval Strike Missile', kind: 'antiship_cruise', producers: ['NOR', 'USA'], rangeKm: 185, speedMach: 0.9, warheadKg: 125, cepM: 2, pk: ashmPk(0.6), interceptDifficulty: 0.5, unitCostUsdM: 2.2, weightKg: 410 },
  { id: 'jsm', name: 'Joint Strike Missile', kind: 'antiship_cruise', producers: ['NOR'], rangeKm: 275, speedMach: 0.9, warheadKg: 125, cepM: 2, pk: { ...ashmPk(0.6), structure: 0.6 }, interceptDifficulty: 0.5, unitCostUsdM: 2.5, weightKg: 416 },
  { id: 'harpoon', name: 'RGM-84 Harpoon Block II', kind: 'antiship_cruise', producers: ['USA'], rangeKm: 124, speedMach: 0.85, warheadKg: 221, cepM: 3, pk: ashmPk(0.55), interceptDifficulty: 0.3, unitCostUsdM: 1.4, weightKg: 690 },
  { id: 'tomahawk_mst', name: 'Tomahawk Maritime Strike (Block Va)', kind: 'antiship_cruise', producers: ['USA'], rangeKm: 1600, speedMach: 0.75, warheadKg: 450, cepM: 5, pk: ashmPk(0.6), interceptDifficulty: 0.35, unitCostUsdM: 2.3, weightKg: 1510 },
  { id: 'exocet', name: 'MM40 Exocet Block 3', kind: 'antiship_cruise', producers: ['FRA'], rangeKm: 200, speedMach: 0.9, warheadKg: 165, cepM: 3, pk: ashmPk(0.55), interceptDifficulty: 0.35, unitCostUsdM: 2, weightKg: 870 },
  { id: 'rbs15', name: 'RBS-15 Mk3', kind: 'antiship_cruise', producers: ['SWE'], rangeKm: 200, speedMach: 0.9, warheadKg: 200, cepM: 3, pk: ashmPk(0.55), interceptDifficulty: 0.35, unitCostUsdM: 2, weightKg: 800 },
  { id: 'otomat', name: 'Otomat Mk2 / Teseo', kind: 'antiship_cruise', producers: ['ITA'], rangeKm: 180, speedMach: 0.9, warheadKg: 210, cepM: 3, pk: ashmPk(0.5), interceptDifficulty: 0.3, unitCostUsdM: 1.5, weightKg: 780 },
  { id: 'type12_ssm', name: 'Type 12 SSM (upgraded)', kind: 'antiship_cruise', producers: ['JPN'], rangeKm: 1000, speedMach: 0.9, warheadKg: 225, cepM: 3, pk: { ...ashmPk(0.6), structure: 0.6 }, interceptDifficulty: 0.45, unitCostUsdM: 3, weightKg: 700 },
  { id: 'ssm700k', name: 'SSM-700K Haeseong', kind: 'antiship_cruise', producers: ['KOR'], rangeKm: 180, speedMach: 0.85, warheadKg: 250, cepM: 3, pk: ashmPk(0.55), interceptDifficulty: 0.35, unitCostUsdM: 1.5, weightKg: 720 },
  { id: 'hf3', name: 'Hsiung Feng III', kind: 'antiship_cruise', producers: ['TWN'], rangeKm: 400, speedMach: 2.5, warheadKg: 225, cepM: 3, pk: ashmPk(0.6), interceptDifficulty: 0.6, unitCostUsdM: 3, weightKg: 1500 },
  { id: 'neptune', name: 'R-360 Neptune', kind: 'antiship_cruise', producers: ['UKR'], rangeKm: 280, speedMach: 0.75, warheadKg: 150, cepM: 3, pk: ashmPk(0.55), interceptDifficulty: 0.35, unitCostUsdM: 1, weightKg: 870 },
  { id: 'atmaca', name: 'Atmaca', kind: 'antiship_cruise', producers: ['TUR'], rangeKm: 250, speedMach: 0.85, warheadKg: 250, cepM: 3, pk: ashmPk(0.55), interceptDifficulty: 0.35, unitCostUsdM: 1.5, weightKg: 800 },
  { id: 'gabriel5', name: 'Gabriel V (Blue Spear)', kind: 'antiship_cruise', producers: ['ISR'], rangeKm: 290, speedMach: 0.9, warheadKg: 150, cepM: 3, pk: ashmPk(0.6), interceptDifficulty: 0.45, unitCostUsdM: 2, weightKg: 1250 },
  { id: 'asm3', name: 'ASM-3A supersonic anti-ship', kind: 'antiship_cruise', producers: ['JPN'], rangeKm: 400, speedMach: 3, warheadKg: 200, cepM: 3, pk: ashmPk(0.6), interceptDifficulty: 0.6, unitCostUsdM: 3, weightKg: 940 },
  { id: 'oniks',name: 'P-800 Oniks', kind: 'antiship_cruise', producers: ['RUS'], rangeKm: 600, speedMach: 2.5, warheadKg: 250, cepM: 5, pk: { ...ashmPk(0.6), structure: 0.6 }, interceptDifficulty: 0.6, unitCostUsdM: 2.5, weightKg: 3000 },
  { id: 'zircon', name: '3M22 Zircon', kind: 'antiship_cruise', producers: ['RUS'], rangeKm: 1000, speedMach: 8, warheadKg: 300, cepM: 5, pk: { ...ashmPk(0.7), structure: 0.7, hardened: 0.3 }, interceptDifficulty: 0.85, unitCostUsdM: 10, weightKg: 3500 },
  { id: 'kalibr_ash', name: '3M54 Kalibr anti-ship', kind: 'antiship_cruise', producers: ['RUS'], rangeKm: 440, speedMach: 2.5, warheadKg: 200, cepM: 5, pk: ashmPk(0.6), interceptDifficulty: 0.55, unitCostUsdM: 6.5, weightKg: 2300 },
  { id: 'kh35', name: 'Kh-35U Uran', kind: 'antiship_cruise', producers: ['RUS'], rangeKm: 260, speedMach: 0.8, warheadKg: 145, cepM: 5, pk: ashmPk(0.5), interceptDifficulty: 0.3, unitCostUsdM: 0.5, weightKg: 610 },
  // Kh-22 / Kh-32: Mach 4 heavy ASM; Ukraine reports almost no intercepts with older systems.
  { id: 'kh32', name: 'Kh-32 / Kh-22', kind: 'antiship_cruise', producers: ['RUS'], rangeKm: 1000, speedMach: 4, warheadKg: 500, cepM: 20, pk: { ...ashmPk(0.7), structure: 0.7 }, interceptDifficulty: 0.7, unitCostUsdM: 3, weightKg: 6000 },
  { id: 'p700', name: 'P-700 Granit', kind: 'antiship_cruise', producers: [], rangeKm: 625, speedMach: 2.5, warheadKg: 750, cepM: 10, pk: ashmPk(0.7), interceptDifficulty: 0.55, unitCostUsdM: 5, weightKg: 7000 },
  { id: 'p1000', name: 'P-1000 Vulkan', kind: 'antiship_cruise', producers: [], rangeKm: 700, speedMach: 2.5, warheadKg: 1000, cepM: 10, pk: ashmPk(0.7), interceptDifficulty: 0.55, unitCostUsdM: 5, weightKg: 4800 },
  { id: 'p270', name: 'P-270 Moskit', kind: 'antiship_cruise', producers: ['RUS'], rangeKm: 120, speedMach: 3, warheadKg: 320, cepM: 10, pk: ashmPk(0.65), interceptDifficulty: 0.6, unitCostUsdM: 2, weightKg: 4500 },
  { id: 'yj12', name: 'YJ-12', kind: 'antiship_cruise', producers: ['CHN'], rangeKm: 400, speedMach: 3, warheadKg: 250, cepM: 5, pk: ashmPk(0.65), interceptDifficulty: 0.6, unitCostUsdM: 3, weightKg: 2500 },
  { id: 'yj18', name: 'YJ-18', kind: 'antiship_cruise', producers: ['CHN'], rangeKm: 540, speedMach: 2.5, warheadKg: 300, cepM: 5, pk: { ...ashmPk(0.65), structure: 0.6 }, interceptDifficulty: 0.6, unitCostUsdM: 3, weightKg: 2000 },
  { id: 'yj83', name: 'YJ-83 (C-802)', kind: 'antiship_cruise', producers: ['CHN'], rangeKm: 180, speedMach: 0.9, warheadKg: 165, cepM: 5, pk: ashmPk(0.5), interceptDifficulty: 0.3, unitCostUsdM: 0.8, weightKg: 715 },
  { id: 'yj62', name: 'YJ-62 coastal', kind: 'antiship_cruise', producers: ['CHN'], rangeKm: 400, speedMach: 0.75, warheadKg: 300, cepM: 5, pk: ashmPk(0.55), interceptDifficulty: 0.3, unitCostUsdM: 1, weightKg: 1350 },
  // YJ-21: hypersonic anti-ship ballistic missile launched from Type 055 VLS (paraded 2022).
  { id: 'yj21', name: 'YJ-21', kind: 'antiship_ballistic', producers: ['CHN'], rangeKm: 1500, speedMach: 6, warheadKg: 300, cepM: 10, pk: { ship: 0.6, structure: 0.6, soft: 0.5 }, interceptDifficulty: 0.85, unitCostUsdM: 8, weightKg: 4000 },
  { id: 'noor', name: 'Noor / Ghader (C-802 derivative)', kind: 'antiship_cruise', producers: ['IRN'], rangeKm: 200, speedMach: 0.9, warheadKg: 165, cepM: 10, pk: ashmPk(0.45), interceptDifficulty: 0.3, unitCostUsdM: 0.5, weightKg: 715 },
  { id: 'abu_mahdi', name: 'Abu Mahdi', kind: 'antiship_cruise', producers: ['IRN'], rangeKm: 1000, speedMach: 0.8, warheadKg: 250, cepM: 10, pk: ashmPk(0.5), interceptDifficulty: 0.35, unitCostUsdM: 1, weightKg: 1000 },
  { id: 'khalij_fars', name: 'Khalij Fars ASBM', kind: 'antiship_ballistic', producers: ['IRN'], rangeKm: 300, speedMach: 3, warheadKg: 450, cepM: 50, pk: { ship: 0.25, structure: 0.5, soft: 0.5 }, interceptDifficulty: 0.55, unitCostUsdM: 1, weightKg: 3600 },
]);

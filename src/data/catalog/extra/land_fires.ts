/**
 * Artillery, rocket artillery, air defense and missile launchers fielded in the
 * orders of battle that the base catalog lacked (land_fires slice), and every
 * munition the orders of battle name in `extraMagazine`.
 *
 * Rows follow the calibration at the top of land.ts: `q` scales the class
 * baseline for range, rate of fire and fire control relative to a modern
 * in-service type (M109A6/A5 is 0.85, PzH 2000 1.3). Air-defense rows are
 * single launchers with a pro-rata share of the battery radar. Ranges, weights
 * and warheads are from IISS Military Balance 2024, CSIS Missile Threat and
 * manufacturer data unless noted; launcher costs for Soviet-era, Chinese,
 * North Korean, Pakistani and Israeli systems are estimates.
 *
 * Nuclear yields for Israel, India, Pakistan and North Korea are not published;
 * the figures follow the FAS Nuclear Notebook estimates (Kristensen & Korda):
 * Pakistan 5-12 kt, India 12-40 kt, Israel ~20 kt fission, DPRK ~150 kt.
 */
import type { Munition, Platform } from '../../../core/types';
import { defineMunitions, nuclearPk, toMunition, toPlatform, type PlatformSpec } from '../build';
import type { MunitionKey } from '../munitions';

const shellPk = (k: number) => ({ infantry: 0.03 * k, soft: 0.04 * k, armor: 0.004 * k, structure: 0.01 * k });
const srbmPk = { structure: 0.7, soft: 0.6, infantry: 0.4, hardened: 0.15, armor: 0.1 };
const cruisePk = { structure: 0.8, soft: 0.6, hardened: 0.3, ship: 0.4, infantry: 0.3 };
const ashmPk = (ship: number) => ({ ship, structure: 0.4, soft: 0.4 });

const specs = defineMunitions([
  // tube and rocket artillery
  { id: 'shell_170', name: '170 mm HE (Koksan M1978/M1989)', kind: 'shell', producers: ['PRK'], rangeKm: 40, speedMach: 2.8, warheadKg: 15, cepM: 250, pk: shellPk(1.2), interceptDifficulty: 0.95, unitCostUsdM: 0.003, weightKg: 70 },
  { id: 'rocket_107', name: '107 mm Type 63 rocket', kind: 'rocket', producers: ['CHN', 'PRK', 'IRN'], rangeKm: 8.5, speedMach: 1.1, warheadKg: 8.3, cepM: 150, pk: shellPk(0.5), interceptDifficulty: 0.6, unitCostUsdM: 0.0005, weightKg: 19 },
  { id: 'rocket_127', name: '127 mm Valkiri Mk II rocket (Bateleur)', kind: 'rocket', producers: ['ZAF'], rangeKm: 36, speedMach: 2, warheadKg: 15, cepM: 250, pk: shellPk(1.3), interceptDifficulty: 0.6, unitCostUsdM: 0.004, weightKg: 53 },
  { id: 'rocket_128', name: '128 mm M-77 Oganj rocket', kind: 'rocket', producers: ['SRB'], rangeKm: 21, speedMach: 1.8, warheadKg: 19, cepM: 250, pk: shellPk(1.3), interceptDifficulty: 0.6, unitCostUsdM: 0.003, weightKg: 65 },
  // K136 K30 rocket: 23 km standard, 36 km extended-range; mass is an estimate.
  { id: 'rocket_130', name: '130 mm K30 rocket (K136 Kooryong)', kind: 'rocket', producers: ['KOR'], rangeKm: 30, speedMach: 2, warheadKg: 18, cepM: 250, pk: shellPk(1.3), interceptDifficulty: 0.6, unitCostUsdM: 0.003, weightKg: 60 },
  // M26 carries 644 M77 DPICM bomblets over ~32 km; RT-2000 Mk45 is the same 227 mm class at 45 km.
  { id: 'rocket_227', name: '227 mm unguided rocket (M26 / RT-2000 Mk45)', kind: 'rocket', producers: ['USA', 'TWN'], rangeKm: 35, speedMach: 2.5, warheadKg: 159, cepM: 250, pk: shellPk(5), interceptDifficulty: 0.55, unitCostUsdM: 0.02, weightKg: 306 },
  { id: 'polonez_300', name: 'A200 301 mm guided rocket (Polonez)', kind: 'guided_rocket', producers: ['BLR', 'CHN'], rangeKm: 200, speedMach: 4, warheadKg: 200, cepM: 30, pk: { ...shellPk(10), structure: 0.4 }, interceptDifficulty: 0.55, unitCostUsdM: 0.5, weightKg: 750 },
  { id: 'ws1b_302', name: '302 mm WS-1B / DTI-1 rocket', kind: 'guided_rocket', producers: ['CHN', 'THA'], rangeKm: 180, speedMach: 4, warheadKg: 150, cepM: 150, pk: { ...shellPk(8), structure: 0.2 }, interceptDifficulty: 0.55, unitCostUsdM: 0.3, weightKg: 725 },
  { id: 'jerinac_267', name: '267 mm Jerinac rocket (Sumadija)', kind: 'guided_rocket', producers: ['SRB'], rangeKm: 70, speedMach: 3, warheadKg: 90, cepM: 60, pk: { ...shellPk(6), structure: 0.2 }, interceptDifficulty: 0.55, unitCostUsdM: 0.15, weightKg: 400 },

  // surface-to-air
  { id: 's300_48n6e', name: '48N6 / 48N6E (S-300PM1 / PMU1)', kind: 'sam', producers: ['RUS'], rangeKm: 150, speedMach: 6, warheadKg: 143, cepM: 10, pk: { aircraft: 0.65, missile: 0.3, helicopter: 0.7 }, interceptDifficulty: 0, unitCostUsdM: 1, weightKg: 1800 },
  { id: 's300vm_9m82me', name: '9M82ME / 9M83ME (Antey-2500)', kind: 'abm', producers: ['RUS'], rangeKm: 200, speedMach: 7.5, warheadKg: 150, cepM: 10, pk: { aircraft: 0.65, missile: 0.5 }, interceptDifficulty: 0, unitCostUsdM: 2, weightKg: 4600 },
  // V-750 per-missile kill rates fell to ~1-2% against US ECM over Vietnam (Zaloga); 0.25 assumes no stand-off jamming.
  { id: 's75_v750', name: 'V-750 / 5Ya23 (S-75 Dvina / HQ-2)', kind: 'sam', producers: [], rangeKm: 45, speedMach: 3.5, warheadKg: 196, cepM: 65, pk: { aircraft: 0.25, helicopter: 0.2 }, interceptDifficulty: 0, unitCostUsdM: 0.2, weightKg: 2300 },
  { id: 's125_5v27', name: '5V27D (S-125 Pechora)', kind: 'sam', producers: [], rangeKm: 25, speedMach: 3, warheadKg: 72, cepM: 15, pk: { aircraft: 0.35, helicopter: 0.4, missile: 0.05 }, interceptDifficulty: 0, unitCostUsdM: 0.2, weightKg: 980 },
  { id: 's200_5v28', name: '5V28 (S-200 Angara/Vega)', kind: 'sam', producers: [], rangeKm: 255, speedMach: 4, warheadKg: 217, cepM: 30, pk: { aircraft: 0.35 }, interceptDifficulty: 0, unitCostUsdM: 0.6, weightKg: 7100 },
  { id: 'hq9a', name: 'HQ-9 / HQ-9A / FD-2000', kind: 'sam', producers: ['CHN'], rangeKm: 200, speedMach: 4.2, warheadKg: 180, cepM: 8, pk: { aircraft: 0.7, missile: 0.4, helicopter: 0.75 }, interceptDifficulty: 0, unitCostUsdM: 1.5, weightKg: 1300 },
  { id: 'kn06', name: 'KN-06 (Pongae-5)', kind: 'sam', producers: ['PRK'], rangeKm: 150, speedMach: 5, warheadKg: 100, cepM: 15, pk: { aircraft: 0.5, missile: 0.2, helicopter: 0.55 }, interceptDifficulty: 0, unitCostUsdM: 1, weightKg: 1500 },
  { id: 'mim23b', name: 'MIM-23B I-Hawk', kind: 'sam', producers: [], rangeKm: 45, speedMach: 2.4, warheadKg: 54, cepM: 8, pk: { aircraft: 0.5, helicopter: 0.6, missile: 0.15 }, interceptDifficulty: 0, unitCostUsdM: 0.5, weightKg: 638 },
  { id: 'buk_9m317', name: '9M317 (Buk-M2)', kind: 'sam', producers: ['RUS'], rangeKm: 50, speedMach: 4, warheadKg: 62, cepM: 8, pk: { aircraft: 0.65, missile: 0.35, helicopter: 0.75 }, interceptDifficulty: 0, unitCostUsdM: 0.7, weightKg: 715 },
  // Type 03 Chu-SAM range and mass are not published; ~50 km and ~570 kg are open-source estimates.
  { id: 'type03_chusam', name: 'Type 03 Chu-SAM', kind: 'sam', producers: ['JPN'], rangeKm: 50, speedMach: 3, warheadKg: 70, cepM: 5, pk: { aircraft: 0.75, missile: 0.45, helicopter: 0.8 }, interceptDifficulty: 0, unitCostUsdM: 2, weightKg: 570 },
  { id: 'kub_3m9', name: '3M9M3 (2K12 Kub / Kvadrat)', kind: 'sam', producers: [], rangeKm: 24, speedMach: 2.8, warheadKg: 59, cepM: 10, pk: { aircraft: 0.4, helicopter: 0.5, missile: 0.05 }, interceptDifficulty: 0, unitCostUsdM: 0.2, weightKg: 599 },
  { id: 'osa_9m33', name: '9M33M3 (9K33 Osa-AKM)', kind: 'shorad_missile', producers: [], rangeKm: 10, speedMach: 1.5, warheadKg: 15, cepM: 5, pk: { aircraft: 0.3, helicopter: 0.5, missile: 0.1 }, interceptDifficulty: 0, unitCostUsdM: 0.1, weightKg: 170 },
  { id: 'tor_9m330', name: '9M330 / 9M331 (Tor-M1)', kind: 'shorad_missile', producers: ['RUS'], rangeKm: 12, speedMach: 2.5, warheadKg: 15, cepM: 3, pk: { aircraft: 0.45, helicopter: 0.6, missile: 0.35 }, interceptDifficulty: 0, unitCostUsdM: 0.3, weightKg: 167 },
  // One profile for the Crotale family: R440 (10 km), HQ-7/FM-80/FM-90 (12-15 km) and Chunma (9 km).
  { id: 'r440_crotale', name: 'R440 Crotale / HQ-7 / Chunma-class missile', kind: 'shorad_missile', producers: ['FRA', 'CHN', 'KOR'], rangeKm: 12, speedMach: 2.3, warheadKg: 15, cepM: 4, pk: { aircraft: 0.35, helicopter: 0.55, missile: 0.2 }, interceptDifficulty: 0, unitCostUsdM: 0.3, weightKg: 85 },
  { id: 'mim72', name: 'MIM-72G Chaparral', kind: 'shorad_missile', producers: [], rangeKm: 9, speedMach: 1.5, warheadKg: 11, cepM: 3, pk: { aircraft: 0.25, helicopter: 0.4, missile: 0.05 }, interceptDifficulty: 0, unitCostUsdM: 0.1, weightKg: 86 },
  { id: 'hisar_a_msl', name: 'Hisar-A+ missile', kind: 'shorad_missile', producers: ['TUR'], rangeKm: 15, speedMach: 2, warheadKg: 10, cepM: 3, pk: { aircraft: 0.4, helicopter: 0.6, missile: 0.25 }, interceptDifficulty: 0, unitCostUsdM: 0.4, weightKg: 100 },
  { id: 'type11_tansam', name: 'Type 11 Tan-SAM Kai', kind: 'shorad_missile', producers: ['JPN'], rangeKm: 12, speedMach: 2.4, warheadKg: 10, cepM: 3, pk: { aircraft: 0.4, helicopter: 0.55, missile: 0.3 }, interceptDifficulty: 0, unitCostUsdM: 0.8, weightKg: 100 },
  { id: 'starstreak_hvm', name: 'Starstreak HVM (three darts)', kind: 'shorad_missile', producers: ['GBR'], rangeKm: 7, speedMach: 3.5, warheadKg: 2.7, cepM: 1, pk: { aircraft: 0.3, helicopter: 0.6, missile: 0.1 }, interceptDifficulty: 0, unitCostUsdM: 0.3, weightKg: 14 },

  // surface-to-surface
  { id: 'iskander_e', name: '9M723E Iskander-E (export)', kind: 'srbm', producers: ['RUS'], rangeKm: 280, speedMach: 6, warheadKg: 480, cepM: 30, pk: srbmPk, interceptDifficulty: 0.7, unitCostUsdM: 3, weightKg: 3800 },
  { id: 'kn24', name: 'KN-24 (Hwasong-11B)', kind: 'srbm', producers: ['PRK'], rangeKm: 410, speedMach: 6, warheadKg: 400, cepM: 50, pk: srbmPk, interceptDifficulty: 0.65, unitCostUsdM: 2, weightKg: 3000 },
  // KTSSM-I: GPS/INS, ~2 m CEP, penetrating warhead for hardened North Korean artillery sites (ADD).
  { id: 'ktssm', name: 'KTSSM-I tactical surface-to-surface missile', kind: 'srbm', producers: ['KOR'], rangeKm: 120, speedMach: 3, warheadKg: 300, cepM: 2, pk: { ...srbmPk, hardened: 0.4 }, interceptDifficulty: 0.55, unitCostUsdM: 1, weightKg: 1600 },
  { id: 'yildirim', name: 'J-600T Yildirim II', kind: 'srbm', producers: ['TUR'], rangeKm: 300, speedMach: 5, warheadKg: 480, cepM: 50, pk: srbmPk, interceptDifficulty: 0.55, unitCostUsdM: 1, weightKg: 2100 },
  { id: 'abdali', name: 'Abdali (Hatf-II)', kind: 'srbm', producers: ['PAK'], rangeKm: 180, speedMach: 4, warheadKg: 450, yieldKt: 12, cepM: 150, pk: nuclearPk(12, 150), interceptDifficulty: 0.55, unitCostUsdM: 1, weightKg: 1750 },
  { id: 'ghaznavi', name: 'Ghaznavi (Hatf-III)', kind: 'srbm', producers: ['PAK'], rangeKm: 290, speedMach: 5, warheadKg: 500, yieldKt: 12, cepM: 250, pk: nuclearPk(12, 250), interceptDifficulty: 0.55, unitCostUsdM: 1.5, weightKg: 5256 },
  { id: 'shaheen1', name: 'Shaheen-IA (Hatf-IV)', kind: 'srbm', producers: ['PAK'], rangeKm: 900, speedMach: 8, warheadKg: 1000, yieldKt: 12, cepM: 200, pk: nuclearPk(12, 200), interceptDifficulty: 0.7, unitCostUsdM: 3, weightKg: 9500 },
  { id: 'shaheen2', name: 'Shaheen-II (Hatf-VI)', kind: 'mrbm', producers: ['PAK'], rangeKm: 1500, speedMach: 10, warheadKg: 700, yieldKt: 12, cepM: 350, pk: nuclearPk(12, 350), interceptDifficulty: 0.75, unitCostUsdM: 5, weightKg: 25000 },
  // Ababeel carries a MIRV bus (count unconfirmed); one warhead is modelled.
  { id: 'ababeel', name: 'Ababeel (MIRV)', kind: 'mrbm', producers: ['PAK'], rangeKm: 2200, speedMach: 12, warheadKg: 1500, yieldKt: 12, cepM: 200, pk: nuclearPk(12, 200), interceptDifficulty: 0.85, unitCostUsdM: 10, weightKg: 26000 },
  { id: 'agni1', name: 'Agni-I', kind: 'mrbm', producers: ['IND'], rangeKm: 700, speedMach: 8, warheadKg: 1000, yieldKt: 40, cepM: 100, pk: nuclearPk(40, 100), interceptDifficulty: 0.7, unitCostUsdM: 4, weightKg: 12000 },
  { id: 'agni2', name: 'Agni-II', kind: 'mrbm', producers: ['IND'], rangeKm: 2000, speedMach: 11, warheadKg: 1000, yieldKt: 40, cepM: 150, pk: nuclearPk(40, 150), interceptDifficulty: 0.75, unitCostUsdM: 6, weightKg: 16000 },
  { id: 'agni4', name: 'Agni-IV', kind: 'irbm', producers: ['IND'], rangeKm: 3500, speedMach: 15, warheadKg: 1000, yieldKt: 40, cepM: 100, pk: nuclearPk(40, 100), interceptDifficulty: 0.85, unitCostUsdM: 10, weightKg: 17000 },
  { id: 'jericho2', name: 'Jericho II', kind: 'mrbm', producers: ['ISR'], rangeKm: 3000, speedMach: 12, warheadKg: 1000, yieldKt: 20, cepM: 300, pk: nuclearPk(20, 300), interceptDifficulty: 0.8, unitCostUsdM: 8, weightKg: 26000 },
  { id: 'jericho3', name: 'Jericho III', kind: 'icbm', producers: ['ISR'], rangeKm: 6500, speedMach: 18, warheadKg: 1000, yieldKt: 20, cepM: 300, pk: nuclearPk(20, 300), interceptDifficulty: 0.85, unitCostUsdM: 15, weightKg: 30000 },
  { id: 'hwasong19', name: 'Hwasong-19 (solid)', kind: 'icbm', producers: ['PRK'], rangeKm: 15000, speedMach: 22, warheadKg: 1500, yieldKt: 150, cepM: 800, pk: nuclearPk(150, 800), interceptDifficulty: 0.88, unitCostUsdM: 25, weightKg: 80000 },
  // Oreshnik: six MIRVed re-entry vehicles at Mach 10+ (Dnipro strike, 21 Nov 2024); one warhead is modelled.
  { id: 'oreshnik', name: 'Oreshnik IRBM', kind: 'irbm', producers: ['RUS'], rangeKm: 5000, speedMach: 11, warheadKg: 1500, yieldKt: 150, cepM: 150, pk: nuclearPk(150, 150), interceptDifficulty: 0.95, unitCostUsdM: 30, weightKg: 40000 },
  // DF-21C: conventional terminally guided DF-21, the variant Saudi Arabia bought (CSIS Missile Threat).
  { id: 'df21c', name: 'DF-21C (CSS-5 Mod 4, conventional)', kind: 'mrbm', producers: ['CHN'], rangeKm: 1750, speedMach: 10, warheadKg: 600, cepM: 50, pk: srbmPk, interceptDifficulty: 0.75, unitCostUsdM: 6, weightKg: 14700 },
  { id: 'hf2', name: 'Hsiung Feng II', kind: 'antiship_cruise', producers: ['TWN'], rangeKm: 160, speedMach: 0.85, warheadKg: 190, cepM: 3, pk: ashmPk(0.45), interceptDifficulty: 0.3, unitCostUsdM: 1, weightKg: 685 },
  { id: 'zarb', name: 'Zarb (C-602 derivative)', kind: 'antiship_cruise', producers: ['PAK', 'CHN'], rangeKm: 280, speedMach: 0.9, warheadKg: 300, cepM: 5, pk: ashmPk(0.5), interceptDifficulty: 0.3, unitCostUsdM: 1, weightKg: 1140 },
  // Popeye Turbo SLCM: range (~1,500 km) and a nuclear role are reported but never confirmed (FAS 2022).
  { id: 'nuclear_gravity_bomb', name: 'Israeli nuclear gravity bomb', kind: 'unguided_bomb', producers: ['ISR'], rangeKm: 5, speedMach: 0.9, warheadKg: 500, yieldKt: 20, cepM: 100, pk: nuclearPk(20, 100), interceptDifficulty: 0.6, unitCostUsdM: 5, weightKg: 500 },
] as const);

type Key = MunitionKey | (typeof specs)[number]['id'];

const artillery: PlatformSpec<Key>[] = [
  // 2S19 / 2S19M1: 8 rds/min against 10 for the M2 and older fire control.
  { id: '2s19', name: '2S19 / 2S19M1 Msta-S', cls: 'sp_artillery', producers: [], inService: 1989, unitCostUsdM: 1.8, speedKph: 60, rangeKm: 500, armor: 0.2, q: 0.9, load: { shell_152: 50 } },
  { id: 'm109a2', name: 'M109A1-A3 / K55 (155 mm L/23-L/39)', cls: 'sp_artillery', crew: 6, producers: [], inService: 1979, unitCostUsdM: 1, speedKph: 56, rangeKm: 350, armor: 0.2, q: 0.7, load: { shell_155: 36 } },
  { id: 'm110', name: 'M110A2 203 mm', cls: 'sp_artillery', crew: 5, producers: [], inService: 1977, unitCostUsdM: 1, speedKph: 55, rangeKm: 520, armor: 0.05, q: 1.0, load: { shell_203: 2 } },
  { id: '2s9', name: '2S9 Nona-S 120 mm gun-mortar', cls: 'sp_artillery', crew: 4, producers: [], inService: 1981, unitCostUsdM: 0.6, speedKph: 60, rangeKm: 500, armor: 0.1, q: 0.5, load: { mortar_120: 40 } },
  // Koksan: 40 km (60 km rocket-assisted), but ~1 round per 5 min and 12 rounds aboard.
  { id: 'koksan', name: 'M1978/M1989 Koksan 170 mm', cls: 'sp_artillery', crew: 8, producers: ['PRK'], inService: 1978, unitCostUsdM: 1, speedKph: 40, rangeKm: 300, armor: 0.1, q: 0.7, fp: { structure: 0.04 }, load: { shell_170: 12 } },
  { id: 'type99_sph', name: 'Type 99 155 mm SPH', cls: 'sp_artillery', crew: 4, producers: ['JPN'], inService: 1999, unitCostUsdM: 9, speedKph: 49, rangeKm: 300, armor: 0.25, q: 1.15, load: { shell_155: 48 } },
  { id: 'g6_sph', name: 'G6 Rhino 155 mm', cls: 'sp_artillery', crew: 6, producers: ['ZAF'], inService: 1988, unitCostUsdM: 3, speedKph: 85, rangeKm: 700, armor: 0.15, q: 1.0, load: { shell_155_erfb: 47 } },
  { id: 'ssph_primus', name: 'SSPH 1 Primus', cls: 'sp_artillery', crew: 4, producers: ['SGP'], inService: 2003, unitCostUsdM: 4, speedKph: 50, rangeKm: 350, armor: 0.2, q: 1.0, load: { shell_155: 26 } },
  { id: 'vca_palmaria', name: 'VCA 155 Palmaria', cls: 'sp_artillery', crew: 5, producers: [], inService: 1995, unitCostUsdM: 2.5, speedKph: 70, rangeKm: 550, armor: 0.2, q: 0.85, load: { shell_155: 30 } },
  { id: 'm101', name: 'M101A1 105 mm', cls: 'towed_artillery', crew: 8, producers: [], inService: 1954, unitCostUsdM: 0.1, q: 0.5, load: { shell_105: 40 } },
  { id: 'm114', name: 'M114A1 155 mm L/23', cls: 'towed_artillery', crew: 11, producers: [], inService: 1954, unitCostUsdM: 0.2, q: 0.65, load: { shell_155: 30 } },
  { id: 'kh179', name: 'KH179 155 mm L/39', cls: 'towed_artillery', crew: 10, producers: [], inService: 1983, unitCostUsdM: 0.5, q: 0.8, load: { shell_155: 30 } },
  { id: 'm198', name: 'M198 155 mm', cls: 'towed_artillery', crew: 9, producers: [], inService: 1979, unitCostUsdM: 0.8, q: 0.8, load: { shell_155: 30 } },
  { id: 'oto_melara_mod56', name: 'OTO Melara Mod 56 105 mm pack howitzer', cls: 'towed_artillery', crew: 7, producers: [], inService: 1957, unitCostUsdM: 0.1, q: 0.45, load: { shell_105: 40 } },
  { id: 'g5', name: 'G5 155 mm L/45', cls: 'towed_artillery', crew: 8, producers: ['ZAF'], inService: 1983, unitCostUsdM: 1.5, q: 0.95, load: { shell_155_erfb: 30 } },
  { id: 'fh2000', name: 'FH-2000 155 mm L/52', cls: 'towed_artillery', crew: 8, producers: ['SGP'], inService: 1995, unitCostUsdM: 2, q: 1.0, load: { shell_155: 30 } },
  { id: 'atags', name: 'ATAGS 155 mm L/52', cls: 'towed_artillery', crew: 8, producers: ['IND'], inService: 2024, unitCostUsdM: 2, q: 1.05, load: { shell_155: 30 } },
];

const rockets: PlatformSpec<Key>[] = [
  // Type 63: 12 x 107 mm, a salvo of ~100 kg against ~720 kg for a 40-round Grad.
  { id: 'type63_mlrs', name: 'Type 63 107 mm MRL', cls: 'mlrs', crew: 5, producers: ['CHN'], inService: 1963, unitCostUsdM: 0.02, speedKph: 30, rangeKm: 100, fuelTph: 0, armor: 0.03, stealth: 0.4, q: 0.3, load: { rocket_107: 24 } },
  { id: 'm270', name: 'M270 / M270A1 MLRS', cls: 'mlrs', producers: [], inService: 1983, unitCostUsdM: 3, speedKph: 64, rangeKm: 480, armor: 0.15, q: 1.2, load: { rocket_227: 12 } },
  { id: 'k136_kooryong', name: 'K136 Kooryong 130 mm', cls: 'mlrs', producers: ['KOR'], inService: 1986, unitCostUsdM: 0.8, speedKph: 70, q: 0.9, load: { rocket_130: 36 } },
  { id: 'ravs_mlrs', name: 'RT-2000 Thunderbolt', cls: 'mlrs', producers: ['TWN'], inService: 2011, unitCostUsdM: 4, speedKph: 80, q: 1.1, load: { rocket_227: 12 } },
  // Jobaria: four BM-21 pods on one carrier, 240 rockets; reload time, not tube count, bounds sustained fire.
  { id: 'jobaria_mlrs', name: 'Jobaria MCL 122 mm', cls: 'mlrs', crew: 4, producers: ['ARE'], inService: 2013, unitCostUsdM: 2, speedKph: 50, q: 2.0, load: { rocket_122: 240 } },
  { id: 'bateleur', name: 'Bateleur FV2 127 mm', cls: 'mlrs', producers: ['ZAF'], inService: 1989, unitCostUsdM: 1, speedKph: 90, q: 1.0, load: { rocket_127: 40 } },
  { id: 'lynx_mlrs', name: 'IMI Lynx', cls: 'mlrs', producers: ['ISR'], inService: 2007, unitCostUsdM: 3, speedKph: 80, q: 1.05, load: { rocket_122: 40 } },
  { id: 'm77_oganj', name: 'M-77 Oganj 128 mm', cls: 'mlrs', producers: ['SRB'], inService: 1975, unitCostUsdM: 0.5, speedKph: 80, q: 0.9, load: { rocket_128: 64 } },
  { id: 'polonez', name: 'Polonez 301 mm', cls: 'mlrs', producers: ['BLR'], inService: 2016, unitCostUsdM: 4, speedKph: 60, q: 0.8, fp: { structure: 0.15, armor: 0.04 }, load: { polonez_300: 8 } },
  { id: 'dti1_mlrs', name: 'DTI-1 / DTI-1G 302 mm', cls: 'mlrs', producers: ['THA'], inService: 2013, unitCostUsdM: 3, speedKph: 60, q: 0.7, fp: { structure: 0.1 }, load: { ws1b_302: 4 } },
  { id: 'sumadija_mlrs', name: 'Sumadija modular MLRS', cls: 'mlrs', producers: ['SRB'], inService: 2019, unitCostUsdM: 3, speedKph: 80, q: 0.8, fp: { structure: 0.1 }, load: { jerinac_267: 12 } },
  { id: 'tos2', name: 'TOS-2 Tosochka', cls: 'mlrs', producers: ['RUS'], inService: 2020, unitCostUsdM: 4, speedKph: 80, rangeKm: 1000, q: 0.95, fp: { infantry: 0.28, soft: 0.17, structure: 0.07 }, load: { tos_thermobaric: 18 } },
  // Korean Spike NLOS vehicle launcher fielded on the Northwest Islands since 2016; missiles per vehicle are an estimate.
  { id: 'spike_ngl_launcher', name: 'Spike NLOS vehicle launcher', cls: 'atgm', crew: 3, producers: ['ISR', 'KOR'], inService: 2016, unitCostUsdM: 5, speedKph: 60, rangeKm: 500, fuelTph: 0.05, armor: 0.1, detectionKm: 25, q: 1.3, fp: { ship: 0.03 }, load: { spike_nlos: 4 } },
];

const airDefense: PlatformSpec<Key>[] = [
  { id: 's300pm', name: 'S-300PM1 / PMU1 launcher', cls: 'sam_long', crew: 8, producers: [], inService: 1993, unitCostUsdM: 18, detectionKm: 300, channels: 2, load: { s300_48n6e: 4 } },
  { id: 's300vm', name: 'S-300VM Antey-2500 launcher', cls: 'sam_long', crew: 8, producers: ['RUS'], inService: 2014, unitCostUsdM: 40, armor: 0.15, detectionKm: 250, channels: 2, load: { s300vm_9m82me: 2 } },
  { id: 's75', name: 'S-75 Dvina / HQ-2 launcher', cls: 'sam_long', crew: 6, producers: [], inService: 1957, unitCostUsdM: 1, speedKph: 20, detectionKm: 150, channels: 1, load: { s75_v750: 1 } },
  { id: 's200', name: 'S-200 Vega launcher', cls: 'sam_long', crew: 6, producers: [], inService: 1967, unitCostUsdM: 3, speedKph: 0, rangeKm: 0, fuelTph: 0, detectionKm: 300, channels: 1, load: { s200_5v28: 1 } },
  { id: 'hq9_launcher', name: 'HQ-9 / HQ-9A / FD-2000 launcher', cls: 'sam_long', producers: ['CHN'], inService: 2001, unitCostUsdM: 25, detectionKm: 200, channels: 2, load: { hq9a: 4 } },
  { id: 'pongae5_launcher', name: 'Pongae-5 (KN-06) launcher', cls: 'sam_long', producers: ['PRK'], inService: 2017, unitCostUsdM: 8, detectionKm: 200, channels: 1, load: { kn06: 3 } },
  // L-SAM: first battery delivered 2024 (DAPA); missiles per launcher are an estimate.
  { id: 'l_sam_launcher', name: 'L-SAM launcher', cls: 'sam_long', producers: ['KOR'], inService: 2024, unitCostUsdM: 60, detectionKm: 300, channels: 2, load: { lsam_int: 6 } },
  { id: 's125', name: 'S-125 Pechora / Newa launcher', cls: 'sam_medium', crew: 5, producers: [], inService: 1961, unitCostUsdM: 1, speedKph: 30, detectionKm: 100, channels: 1, load: { s125_5v27: 4 } },
  { id: 'hawk', name: 'MIM-23 I-Hawk launcher', cls: 'sam_medium', crew: 5, producers: [], inService: 1972, unitCostUsdM: 5, speedKph: 30, detectionKm: 100, channels: 1, load: { mim23b: 3 } },
  { id: 'buk_m2', name: 'Buk-M2 TELAR (9A317)', cls: 'sam_medium', producers: ['RUS'], inService: 2008, unitCostUsdM: 10, armor: 0.15, detectionKm: 100, channels: 4, load: { buk_9m317: 4 } },
  { id: 'type03_chusam_launcher', name: 'Type 03 Chu-SAM launcher', cls: 'sam_medium', producers: ['JPN'], inService: 2003, unitCostUsdM: 30, detectionKm: 120, channels: 2, load: { type03_chusam: 6 } },
  { id: 'kub', name: '2K12 Kub / Kvadrat launcher', cls: 'sam_medium', crew: 3, producers: [], inService: 1967, unitCostUsdM: 1, armor: 0.1, detectionKm: 75, channels: 1, load: { kub_3m9: 3 } },
  { id: 'osa_ak', name: '9K33 Osa-AKM', cls: 'shorad', crew: 5, producers: [], inService: 1980, unitCostUsdM: 2, speedKph: 60, armor: 0.1, detectionKm: 30, channels: 1, q: 0.6, load: { osa_9m33: 6 } },
  { id: 'tor_m1', name: '9K331 Tor-M1', cls: 'shorad', crew: 4, producers: [], inService: 1991, unitCostUsdM: 12, armor: 0.2, detectionKm: 25, channels: 2, q: 0.8, load: { tor_9m330: 8 } },
  { id: 'crotale', name: 'Crotale / Shahine / FM-90 launcher', cls: 'shorad', producers: ['CHN'], inService: 1971, unitCostUsdM: 4, armor: 0.1, detectionKm: 20, channels: 1, q: 0.6, load: { r440_crotale: 4 } },
  { id: 'chunma_shorad', name: 'K-SAM Chunma (Pegasus)', cls: 'shorad', producers: ['KOR'], inService: 1999, unitCostUsdM: 12, armor: 0.25, detectionKm: 20, channels: 1, q: 0.8, load: { r440_crotale: 8 } },
  { id: 'chaparral', name: 'M48 Chaparral', cls: 'shorad', producers: [], inService: 1969, unitCostUsdM: 1, armor: 0.1, detectionKm: 8, channels: 1, q: 0.45, load: { mim72: 4 } },
  { id: 'hisar_a', name: 'Hisar-A+ launcher', cls: 'shorad', producers: ['TUR'], inService: 2021, unitCostUsdM: 8, armor: 0.2, detectionKm: 25, channels: 1, q: 0.9, load: { hisar_a_msl: 4 } },
  { id: 'type11_shorad', name: 'Type 11 Tan-SAM Kai', cls: 'shorad', producers: ['JPN'], inService: 2014, unitCostUsdM: 20, detectionKm: 30, channels: 2, q: 0.9, load: { type11_tansam: 4 } },
  { id: 'starstreak', name: 'Starstreak HVM team', cls: 'shorad', crew: 2, producers: ['GBR'], inService: 1997, unitCostUsdM: 0.3, speedKph: 4, rangeKm: 40, fuelTph: 0, armor: 0.03, stealth: 0.6, detectionKm: 8, channels: 1, q: 0.6, load: { starstreak_hvm: 3 } },
  // Gun systems carry no modelled load, like Tunguska: their fire is organic firepower only.
  { id: 'zsu_23_4', name: 'ZSU-23-4 Shilka', cls: 'shorad', crew: 4, producers: [], inService: 1965, unitCostUsdM: 0.5, armor: 0.12, detectionKm: 15, channels: 1, q: 0.7 },
  { id: 'pgz09', name: 'PGZ-09 35 mm SPAAG', cls: 'shorad', producers: ['CHN'], inService: 2009, unitCostUsdM: 4, armor: 0.25, detectionKm: 20, channels: 1, q: 1.3, fp: { missile: 0.05 } },
  { id: 'type87_spaag', name: 'Type 87 35 mm SPAAG', cls: 'shorad', producers: [], inService: 1987, unitCostUsdM: 12, armor: 0.25, detectionKm: 15, channels: 1, q: 1.2 },
  { id: 'gdf_35mm', name: 'Oerlikon GDF 35 mm twin (Skyguard)', cls: 'shorad', crew: 6, producers: [], inService: 1963, unitCostUsdM: 2, speedKph: 30, armor: 0.05, detectionKm: 20, channels: 1, q: 0.9 },
  { id: 'green_pine_radar', name: 'EL/M-2080 Green Pine radar', cls: 'radar', crew: 10, producers: ['ISR'], inService: 2000, unitCostUsdM: 60, detectionKm: 800 },
];

const missiles: PlatformSpec<Key>[] = [
  { id: 'iskander_e_tel', name: '9P78E Iskander-E TEL', cls: 'tel_srbm', crew: 3, producers: ['RUS'], inService: 2017, unitCostUsdM: 10, load: { iskander_e: 2 } },
  { id: 'kn24_tel', name: 'KN-24 TEL', cls: 'tel_srbm', producers: ['PRK'], inService: 2020, unitCostUsdM: 4, load: { kn24: 2 } },
  { id: 'ktssm_launcher', name: 'KTSSM-I launcher', cls: 'tel_srbm', producers: ['KOR'], inService: 2024, unitCostUsdM: 5, load: { ktssm: 4 } },
  { id: 'j600t_yildirim', name: 'J-600T Yildirim TEL', cls: 'tel_srbm', producers: ['TUR'], inService: 2001, unitCostUsdM: 3, load: { yildirim: 1 } },
  { id: 'abdali_tel', name: 'Abdali TEL', cls: 'tel_srbm', producers: ['PAK'], inService: 2005, unitCostUsdM: 2, nuclear: true, load: { abdali: 1 } },
  { id: 'ghaznavi_tel', name: 'Ghaznavi TEL', cls: 'tel_srbm', producers: ['PAK'], inService: 2004, unitCostUsdM: 2, nuclear: true, load: { ghaznavi: 1 } },
  { id: 'shaheen1_tel', name: 'Shaheen-I/IA TEL', cls: 'tel_srbm', producers: ['PAK'], inService: 2003, unitCostUsdM: 3, nuclear: true, load: { shaheen1: 1 } },
  { id: 'shaheen2_tel', name: 'Shaheen-II TEL', cls: 'tel_mrbm', producers: ['PAK'], inService: 2014, unitCostUsdM: 5, nuclear: true, load: { shaheen2: 1 } },
  { id: 'ababeel_tel', name: 'Ababeel TEL', cls: 'tel_mrbm', producers: ['PAK'], inService: 2023, unitCostUsdM: 6, nuclear: true, load: { ababeel: 1 } },
  { id: 'agni1_tel', name: 'Agni-I TEL', cls: 'tel_mrbm', producers: ['IND'], inService: 2004, unitCostUsdM: 3, nuclear: true, load: { agni1: 1 } },
  { id: 'agni2_tel', name: 'Agni-II launcher', cls: 'tel_mrbm', producers: ['IND'], inService: 2004, unitCostUsdM: 4, nuclear: true, load: { agni2: 1 } },
  { id: 'agni4_tel', name: 'Agni-IV TEL', cls: 'tel_irbm', producers: ['IND'], inService: 2018, unitCostUsdM: 6, nuclear: true, load: { agni4: 1 } },
  // One orbat id covers China's DF-21 brigades and Saudi Arabia's CSS-5s. The launcher carries the
  // conventional DF-21C so Riyadh gets no warheads; Chinese DF-21A nuclear rounds arrive as reloads.
  { id: 'df21_tel', name: 'DF-21 / DF-21C TEL', cls: 'tel_mrbm', producers: ['CHN'], inService: 2006, unitCostUsdM: 6, load: { df21c: 1 } },
  { id: 'jericho2_tel', name: 'Jericho II launcher', cls: 'tel_mrbm', producers: ['ISR'], inService: 1990, unitCostUsdM: 5, nuclear: true, load: { jericho2: 1 } },
  { id: 'jericho3_silo', name: 'Jericho III silo (Sdot Micha)', cls: 'icbm_silo', producers: ['ISR'], inService: 2011, unitCostUsdM: 20, armor: 0.85, nuclear: true, load: { jericho3: 1 } },
  { id: 'oreshnik_tel', name: 'Oreshnik TEL', cls: 'tel_irbm', producers: ['RUS'], inService: 2024, unitCostUsdM: 20, nuclear: true, load: { oreshnik: 1 } },
  { id: 'hwasong19_tel', name: 'Hwasong-19 TEL (11-axle)', cls: 'icbm_mobile', producers: ['PRK'], inService: 2024, unitCostUsdM: 12, nuclear: true, load: { hwasong19: 1 } },
  { id: 'topol_m_silo', name: 'Topol-M silo', cls: 'icbm_silo', producers: [], inService: 1997, unitCostUsdM: 30, armor: 0.92, nuclear: true, load: { topol_m: 1 } },
  // The ~320 new silos at Yumen, Hami and Ordos outnumber the DF-41s to fill them (DoD CMPR 2024); empty ones still soak up counterforce warheads.
  { id: 'icbm_silo_empty', name: 'ICBM silo (unloaded)', cls: 'icbm_silo', producers: ['CHN'], inService: 2023, unitCostUsdM: 15, armor: 0.92 },
  { id: 'hf2_coastal', name: 'Hsiung Feng II coastal launcher', cls: 'coastal_asm', producers: ['TWN'], inService: 1993, unitCostUsdM: 6, load: { hf2: 4 } },
  { id: 'zarb_coastal', name: 'Zarb coastal launcher', cls: 'coastal_asm', producers: ['PAK'], inService: 2016, unitCostUsdM: 6, load: { zarb: 2 } },
];

export const munitions: Munition[] = specs.map(toMunition);
export const platforms: Platform[] = [...artillery, ...rockets, ...airDefense, ...missiles].map(toPlatform);

/**
 * Surface-to-air, ballistic-missile-defense and ASAT interceptors.
 *
 * pk.missile is single-shot kill probability against the threat the
 * interceptor was designed for (SRBMs for Patriot, IRBMs for SM-3, cruise
 * missiles and drones for short-range systems). Calibrated against: MDA test
 * records (THAAD 16/16, SM-3 ~80%, GMD ~55%), Patriot in Ukraine (two-shot
 * doctrine against Kinzhal/Iskander, high success), Iron Dome's published
 * ~90% on engaged rockets, and the April/October 2024 Iran-Israel exchanges.
 *
 * Satellites have no TargetClass yet; an ASAT's pk.missile is its kill
 * probability against a satellite in reach (proposed core change: add
 * 'satellite' to TARGET_CLASSES).
 *
 * interceptDifficulty is 0: interceptors are not themselves targets.
 */
import { defineMunitions } from '../build';

export const airDefenseMunitions = defineMunitions([
  // ---- United States and partners
  // PAC-3 MSE FY2024 unit ~$4.1M (Army P-1); hit-to-kill.
  { id: 'pac3_mse', name: 'PAC-3 MSE', kind: 'abm', producers: ['USA', 'JPN'], rangeKm: 60, speedMach: 5, warheadKg: 11, cepM: 0, pk: { missile: 0.65, aircraft: 0.8, helicopter: 0.85 }, interceptDifficulty: 0, unitCostUsdM: 4.1, weightKg: 370 },
  { id: 'pac2_gemt', name: 'MIM-104E PAC-2 GEM-T', kind: 'sam', producers: ['USA', 'DEU'], rangeKm: 160, speedMach: 5, warheadKg: 90, cepM: 5, pk: { missile: 0.4, aircraft: 0.8, helicopter: 0.85 }, interceptDifficulty: 0, unitCostUsdM: 4, weightKg: 900 },
  // THAAD interceptor ~$12.7M (MDA FY2024).
  { id: 'thaad_int', name: 'THAAD interceptor', kind: 'abm', producers: ['USA'], rangeKm: 200, speedMach: 8, warheadKg: 0, cepM: 0, pk: { missile: 0.85 }, interceptDifficulty: 0, unitCostUsdM: 12.7, weightKg: 900 },
  // SM-3 Block IIA ~$28M (MDA FY2024); demonstrated ICBM-class intercept FTM-44 (2020).
  { id: 'sm3_iia', name: 'RIM-161 SM-3 Block IIA', kind: 'abm', producers: ['USA', 'JPN'], rangeKm: 2500, speedMach: 15, warheadKg: 0, cepM: 0, pk: { missile: 0.8 }, interceptDifficulty: 0, unitCostUsdM: 28, weightKg: 1500 },
  { id: 'sm3_ib', name: 'RIM-161 SM-3 Block IB', kind: 'abm', producers: ['USA'], rangeKm: 900, speedMach: 10, warheadKg: 0, cepM: 0, pk: { missile: 0.8 }, interceptDifficulty: 0, unitCostUsdM: 12, weightKg: 1500 },
  // Operation Burnt Frost (2008): modified SM-3 destroyed USA-193 at ~247 km altitude.
  { id: 'sm3_asat', name: 'SM-3 (direct-ascent ASAT use)', kind: 'abm', producers: ['USA'], rangeKm: 500, speedMach: 10, warheadKg: 0, cepM: 0, pk: { missile: 0.7 }, interceptDifficulty: 0, unitCostUsdM: 12, weightKg: 1500 },
  // SM-6 Block IA ~$4.3M (Navy FY2024); dual AAW and terminal BMD, also anti-ship.
  { id: 'sm6', name: 'RIM-174 SM-6', kind: 'sam', producers: ['USA'], rangeKm: 370, speedMach: 3.5, warheadKg: 64, cepM: 5, pk: { aircraft: 0.85, missile: 0.6, helicopter: 0.85, ship: 0.25 }, interceptDifficulty: 0, unitCostUsdM: 4.3, weightKg: 1500 },
  { id: 'sm2_iiic', name: 'RIM-66 SM-2 Block IIIC', kind: 'sam', producers: ['USA'], rangeKm: 167, speedMach: 3.5, warheadKg: 62, cepM: 5, pk: { aircraft: 0.75, missile: 0.5, helicopter: 0.8 }, interceptDifficulty: 0, unitCostUsdM: 2.5, weightKg: 708 },
  { id: 'essm2', name: 'RIM-162 ESSM Block 2', kind: 'sam', producers: ['USA'], rangeKm: 50, speedMach: 4, warheadKg: 39, cepM: 5, pk: { aircraft: 0.75, missile: 0.6, helicopter: 0.8 }, interceptDifficulty: 0, unitCostUsdM: 2, weightKg: 280 },
  { id: 'ram_blk2', name: 'RIM-116 RAM Block 2', kind: 'shorad_missile', producers: ['USA', 'DEU'], rangeKm: 10, speedMach: 2, warheadKg: 11, cepM: 2, pk: { missile: 0.7, aircraft: 0.6, helicopter: 0.7 }, interceptDifficulty: 0, unitCostUsdM: 0.9, weightKg: 88 },
  // Ground-Based Interceptor: GMD test record ~55% (MDA, 2000-2019).
  { id: 'gbi', name: 'Ground-Based Interceptor (GMD)', kind: 'abm', producers: ['USA'], rangeKm: 4000, speedMach: 25, warheadKg: 0, cepM: 0, pk: { missile: 0.55 }, interceptDifficulty: 0, unitCostUsdM: 75, weightKg: 21600 },
  { id: 'aim120_sl', name: 'AMRAAM (surface-launched, NASAMS)', kind: 'sam', producers: ['USA'], rangeKm: 40, speedMach: 4, warheadKg: 23, cepM: 5, pk: { aircraft: 0.75, missile: 0.6, helicopter: 0.8 }, interceptDifficulty: 0, unitCostUsdM: 1.1, weightKg: 152 },
  { id: 'amraam_er', name: 'AMRAAM-ER (NASAMS)', kind: 'sam', producers: ['USA', 'NOR'], rangeKm: 50, speedMach: 4, warheadKg: 23, cepM: 5, pk: { aircraft: 0.75, missile: 0.6, helicopter: 0.8 }, interceptDifficulty: 0, unitCostUsdM: 1.5, weightKg: 350 },
  { id: 'stinger', name: 'FIM-92 Stinger', kind: 'shorad_missile', producers: ['USA', 'DEU'], rangeKm: 8, speedMach: 2.2, warheadKg: 3, cepM: 1, pk: { aircraft: 0.35, helicopter: 0.55, missile: 0.3 }, interceptDifficulty: 0, unitCostUsdM: 0.48, weightKg: 10 },
  // Coyote Block 2 counter-UAS interceptor (Raytheon), ~$100k.
  { id: 'coyote', name: 'Coyote Block 2 counter-UAS', kind: 'shorad_missile', producers: ['USA'], rangeKm: 15, speedMach: 0.5, warheadKg: 2, cepM: 2, pk: { missile: 0.7, helicopter: 0.4 }, interceptDifficulty: 0, unitCostUsdM: 0.1, weightKg: 6 },

  // ---- Europe
  { id: 'aster30', name: 'Aster 30 B1', kind: 'abm', producers: ['FRA', 'ITA'], rangeKm: 120, speedMach: 4.5, warheadKg: 15, cepM: 2, pk: { aircraft: 0.85, missile: 0.6, helicopter: 0.85 }, interceptDifficulty: 0, unitCostUsdM: 2.8, weightKg: 450 },
  { id: 'aster15', name: 'Aster 15', kind: 'sam', producers: ['FRA', 'ITA'], rangeKm: 30, speedMach: 3, warheadKg: 13, cepM: 2, pk: { aircraft: 0.8, missile: 0.65, helicopter: 0.85 }, interceptDifficulty: 0, unitCostUsdM: 1.5, weightKg: 310 },
  // IRIS-T SLM in Ukraine: Diehl reports >90% success, mostly against cruise missiles and drones.
  { id: 'iris_t_sl', name: 'IRIS-T SL', kind: 'sam', producers: ['DEU'], rangeKm: 40, speedMach: 3, warheadKg: 11, cepM: 2, pk: { aircraft: 0.8, missile: 0.75, helicopter: 0.85 }, interceptDifficulty: 0, unitCostUsdM: 0.45, weightKg: 89 },
  { id: 'camm', name: 'CAMM (Sea Ceptor / Land Ceptor)', kind: 'sam', producers: ['GBR'], rangeKm: 25, speedMach: 3, warheadKg: 10, cepM: 2, pk: { aircraft: 0.75, missile: 0.7, helicopter: 0.8 }, interceptDifficulty: 0, unitCostUsdM: 1, weightKg: 99 },
  { id: 'camm_er', name: 'CAMM-ER', kind: 'sam', producers: ['GBR', 'ITA'], rangeKm: 45, speedMach: 3, warheadKg: 10, cepM: 2, pk: { aircraft: 0.75, missile: 0.7, helicopter: 0.8 }, interceptDifficulty: 0, unitCostUsdM: 1.3, weightKg: 160 },
  { id: 'mistral', name: 'Mistral 3', kind: 'shorad_missile', producers: ['FRA'], rangeKm: 8, speedMach: 2.7, warheadKg: 3, cepM: 1, pk: { aircraft: 0.4, helicopter: 0.6, missile: 0.35 }, interceptDifficulty: 0, unitCostUsdM: 0.3, weightKg: 19 },
  { id: 'rbs70_ng', name: 'RBS 70 NG Bolide', kind: 'shorad_missile', producers: ['SWE'], rangeKm: 9, speedMach: 2, warheadKg: 1, cepM: 1, pk: { aircraft: 0.4, helicopter: 0.6, missile: 0.3 }, interceptDifficulty: 0, unitCostUsdM: 0.3, weightKg: 17 },
  { id: 'piorun', name: 'Piorun', kind: 'shorad_missile', producers: ['POL'], rangeKm: 6.5, speedMach: 2, warheadKg: 2, cepM: 1, pk: { aircraft: 0.35, helicopter: 0.55, missile: 0.25 }, interceptDifficulty: 0, unitCostUsdM: 0.1, weightKg: 10 },
  // Gepard 35 mm: effective against Shahed-class drones in Ukraine; cost per engagement ~ a few $k.
  { id: 'shell_35_ahead', name: '35 mm AHEAD / FAPDS (burst of 20)', kind: 'shell', producers: ['DEU', 'CHE'], rangeKm: 4, speedMach: 3.5, warheadKg: 1, cepM: 2, pk: { missile: 0.5, helicopter: 0.4, aircraft: 0.15 }, interceptDifficulty: 0, unitCostUsdM: 0.02, weightKg: 30 },

  // ---- Israel
  // Tamir: Rafael quotes ~$40-50k; Iron Dome engagement success ~90% (IDF).
  { id: 'tamir', name: 'Tamir (Iron Dome)', kind: 'shorad_missile', producers: ['ISR', 'USA'], rangeKm: 70, speedMach: 2.2, warheadKg: 11, cepM: 2, pk: { missile: 0.9, helicopter: 0.6, aircraft: 0.4 }, interceptDifficulty: 0, unitCostUsdM: 0.05, weightKg: 90 },
  { id: 'stunner', name: "Stunner (David's Sling)", kind: 'abm', producers: ['ISR', 'USA'], rangeKm: 300, speedMach: 7.5, warheadKg: 0, cepM: 0, pk: { missile: 0.75, aircraft: 0.85 }, interceptDifficulty: 0, unitCostUsdM: 1, weightKg: 400 },
  { id: 'arrow2', name: 'Arrow 2', kind: 'abm', producers: ['ISR', 'USA'], rangeKm: 150, speedMach: 9, warheadKg: 150, cepM: 4, pk: { missile: 0.8 }, interceptDifficulty: 0, unitCostUsdM: 3, weightKg: 1300 },
  { id: 'arrow3', name: 'Arrow 3', kind: 'abm', producers: ['ISR', 'USA'], rangeKm: 2400, speedMach: 9, warheadKg: 0, cepM: 0, pk: { missile: 0.85 }, interceptDifficulty: 0, unitCostUsdM: 3.5, weightKg: 2000 },
  { id: 'barak8', name: 'Barak 8 / MRSAM', kind: 'sam', producers: ['ISR', 'IND'], rangeKm: 100, speedMach: 2, warheadKg: 60, cepM: 3, pk: { aircraft: 0.8, missile: 0.6, helicopter: 0.85 }, interceptDifficulty: 0, unitCostUsdM: 1.5, weightKg: 275 },
  { id: 'python5_sl', name: 'Python-5 (SPYDER)', kind: 'shorad_missile', producers: ['ISR'], rangeKm: 20, speedMach: 4, warheadKg: 11, cepM: 2, pk: { aircraft: 0.7, missile: 0.5, helicopter: 0.8 }, interceptDifficulty: 0, unitCostUsdM: 0.6, weightKg: 105 },

  // ---- Russia
  // 40N6E: 380-400 km; S-400 missile costs are not published, estimates ~$1-2M.
  { id: 's400_40n6', name: '40N6E (S-400 long range)', kind: 'sam', producers: ['RUS'], rangeKm: 380, speedMach: 12, warheadKg: 180, cepM: 10, pk: { aircraft: 0.7, missile: 0.4, helicopter: 0.7 }, interceptDifficulty: 0, unitCostUsdM: 2, weightKg: 1893 },
  { id: 's400_48n6', name: '48N6DM / 48N6E3', kind: 'sam', producers: ['RUS'], rangeKm: 250, speedMach: 6, warheadKg: 180, cepM: 10, pk: { aircraft: 0.75, missile: 0.45, helicopter: 0.8 }, interceptDifficulty: 0, unitCostUsdM: 1.5, weightKg: 1835 },
  { id: 's400_9m96', name: '9M96E2', kind: 'sam', producers: ['RUS'], rangeKm: 120, speedMach: 5, warheadKg: 24, cepM: 3, pk: { aircraft: 0.75, missile: 0.5, helicopter: 0.8 }, interceptDifficulty: 0, unitCostUsdM: 1, weightKg: 420 },
  { id: 's300_48n6e2', name: '48N6E2 (S-300PMU2)', kind: 'sam', producers: ['RUS'], rangeKm: 200, speedMach: 6, warheadKg: 180, cepM: 10, pk: { aircraft: 0.7, missile: 0.35, helicopter: 0.75 }, interceptDifficulty: 0, unitCostUsdM: 1, weightKg: 1800 },
  { id: 's300_5v55', name: '5V55R (S-300PS/PT)', kind: 'sam', producers: [], rangeKm: 75, speedMach: 6, warheadKg: 133, cepM: 15, pk: { aircraft: 0.55, missile: 0.2, helicopter: 0.6 }, interceptDifficulty: 0, unitCostUsdM: 0.6, weightKg: 1480 },
  { id: 's300v4_9m82md', name: '9M82MD (S-300V4)', kind: 'abm', producers: ['RUS'], rangeKm: 400, speedMach: 7.5, warheadKg: 150, cepM: 10, pk: { aircraft: 0.7, missile: 0.55 }, interceptDifficulty: 0, unitCostUsdM: 2.5, weightKg: 5800 },
  { id: 's500_77n6', name: '77N6-N (S-500)', kind: 'abm', producers: ['RUS'], rangeKm: 600, speedMach: 15, warheadKg: 0, cepM: 0, pk: { missile: 0.6, aircraft: 0.6 }, interceptDifficulty: 0, unitCostUsdM: 6, weightKg: 9000 },
  { id: 'a235_53t6', name: '53T6M (A-235 Moscow ABM)', kind: 'abm', producers: ['RUS'], rangeKm: 100, speedMach: 17, warheadKg: 10, yieldKt: 10, cepM: 50, pk: { missile: 0.6 }, interceptDifficulty: 0, unitCostUsdM: 20, weightKg: 10000 },
  // Nudol (A-235 exo-atmospheric): destroyed Kosmos-1408 in Nov 2021 at ~480 km.
  { id: 'nudol_int', name: '14A042 Nudol interceptor', kind: 'abm', producers: ['RUS'], rangeKm: 1500, speedMach: 15, warheadKg: 0, cepM: 0, pk: { missile: 0.7 }, interceptDifficulty: 0, unitCostUsdM: 25, weightKg: 30000 },
  { id: 'buk_9m317m', name: '9M317M (Buk-M3)', kind: 'sam', producers: ['RUS'], rangeKm: 70, speedMach: 5, warheadKg: 62, cepM: 5, pk: { aircraft: 0.75, missile: 0.5, helicopter: 0.8 }, interceptDifficulty: 0, unitCostUsdM: 1, weightKg: 581 },
  { id: 'buk_9m38', name: '9M38M1 (Buk-M1)', kind: 'sam', producers: ['RUS', 'BLR'], rangeKm: 35, speedMach: 3, warheadKg: 70, cepM: 10, pk: { aircraft: 0.6, missile: 0.3, helicopter: 0.7 }, interceptDifficulty: 0, unitCostUsdM: 0.5, weightKg: 690 },
  { id: 'tor_9m338', name: '9M338K (Tor-M2)', kind: 'shorad_missile', producers: ['RUS'], rangeKm: 16, speedMach: 3, warheadKg: 15, cepM: 2, pk: { aircraft: 0.7, missile: 0.6, helicopter: 0.8 }, interceptDifficulty: 0, unitCostUsdM: 0.3, weightKg: 163 },
  { id: 'pantsir_57e6', name: '57E6 (Pantsir-S1)', kind: 'shorad_missile', producers: ['RUS'], rangeKm: 20, speedMach: 3.8, warheadKg: 20, cepM: 3, pk: { aircraft: 0.6, missile: 0.5, helicopter: 0.75 }, interceptDifficulty: 0, unitCostUsdM: 0.15, weightKg: 75 },
  { id: 'igla_s', name: '9K338 Igla-S / Verba', kind: 'shorad_missile', producers: ['RUS'], rangeKm: 6, speedMach: 2, warheadKg: 2.5, cepM: 1, pk: { aircraft: 0.3, helicopter: 0.5, missile: 0.2 }, interceptDifficulty: 0, unitCostUsdM: 0.1, weightKg: 11 },
  { id: 'strela10_9m333', name: '9M333 (Strela-10M3)', kind: 'shorad_missile', producers: ['RUS'], rangeKm: 5, speedMach: 2, warheadKg: 5, cepM: 2, pk: { aircraft: 0.3, helicopter: 0.5, missile: 0.15 }, interceptDifficulty: 0, unitCostUsdM: 0.08, weightKg: 42 },

  // ---- China
  { id: 'hq9b', name: 'HQ-9B', kind: 'sam', producers: ['CHN'], rangeKm: 260, speedMach: 4.2, warheadKg: 180, cepM: 10, pk: { aircraft: 0.75, missile: 0.5, helicopter: 0.8 }, interceptDifficulty: 0, unitCostUsdM: 1.5, weightKg: 1300 },
  // HQ-19: exo-atmospheric hit-to-kill, tested vs IRBM-class targets; performance estimated.
  { id: 'hq19', name: 'HQ-19', kind: 'abm', producers: ['CHN'], rangeKm: 1000, speedMach: 10, warheadKg: 0, cepM: 0, pk: { missile: 0.7 }, interceptDifficulty: 0, unitCostUsdM: 10, weightKg: 8000 },
  { id: 'hq16', name: 'HQ-16FE', kind: 'sam', producers: ['CHN'], rangeKm: 70, speedMach: 4, warheadKg: 70, cepM: 5, pk: { aircraft: 0.75, missile: 0.45, helicopter: 0.8 }, interceptDifficulty: 0, unitCostUsdM: 0.8, weightKg: 615 },
  { id: 'hq22', name: 'HQ-22 (FK-3)', kind: 'sam', producers: ['CHN'], rangeKm: 170, speedMach: 6, warheadKg: 100, cepM: 8, pk: { aircraft: 0.7, missile: 0.4, helicopter: 0.75 }, interceptDifficulty: 0, unitCostUsdM: 0.8, weightKg: 1300 },
  { id: 'hq17', name: 'HQ-17A', kind: 'shorad_missile', producers: ['CHN'], rangeKm: 15, speedMach: 3, warheadKg: 15, cepM: 2, pk: { aircraft: 0.7, missile: 0.55, helicopter: 0.8 }, interceptDifficulty: 0, unitCostUsdM: 0.3, weightKg: 165 },
  { id: 'hq10', name: 'HQ-10 (FL-3000N)', kind: 'shorad_missile', producers: ['CHN'], rangeKm: 9, speedMach: 2, warheadKg: 10, cepM: 2, pk: { missile: 0.65, aircraft: 0.55, helicopter: 0.7 }, interceptDifficulty: 0, unitCostUsdM: 0.3, weightKg: 85 },
  { id: 'qw2', name: 'QW-2 / FN-6', kind: 'shorad_missile', producers: ['CHN'], rangeKm: 6, speedMach: 2, warheadKg: 2, cepM: 1, pk: { aircraft: 0.3, helicopter: 0.5, missile: 0.2 }, interceptDifficulty: 0, unitCostUsdM: 0.08, weightKg: 11 },
  // SC-19 (DN-1): destroyed FY-1C weather satellite at ~865 km, January 2007.
  { id: 'sc19_int', name: 'SC-19 / DN-1 kinetic kill vehicle', kind: 'abm', producers: ['CHN'], rangeKm: 1000, speedMach: 15, warheadKg: 0, cepM: 0, pk: { missile: 0.7 }, interceptDifficulty: 0, unitCostUsdM: 20, weightKg: 15000 },
  // DN-3: tested 2018+, reaches higher orbits per DoD CMPR 2024 (est).
  { id: 'dn3_int', name: 'DN-3 direct-ascent ASAT', kind: 'abm', producers: ['CHN'], rangeKm: 30000, speedMach: 20, warheadKg: 0, cepM: 0, pk: { missile: 0.6 }, interceptDifficulty: 0, unitCostUsdM: 40, weightKg: 30000 },

  // ---- others
  { id: 'cheongung2', name: 'Cheongung-II (KM-SAM Blk II)', kind: 'sam', producers: ['KOR'], rangeKm: 40, speedMach: 4.5, warheadKg: 30, cepM: 3, pk: { aircraft: 0.8, missile: 0.6, helicopter: 0.85 }, interceptDifficulty: 0, unitCostUsdM: 1.5, weightKg: 400 },
  { id: 'lsam_int', name: 'L-SAM ABM interceptor', kind: 'abm', producers: ['KOR'], rangeKm: 150, speedMach: 8, warheadKg: 0, cepM: 0, pk: { missile: 0.7 }, interceptDifficulty: 0, unitCostUsdM: 5, weightKg: 1500 },
  { id: 'akash_ng', name: 'Akash / Akash-NG', kind: 'sam', producers: ['IND'], rangeKm: 40, speedMach: 2.5, warheadKg: 60, cepM: 5, pk: { aircraft: 0.7, missile: 0.35, helicopter: 0.8 }, interceptDifficulty: 0, unitCostUsdM: 0.5, weightKg: 720 },
  // Mission Shakti (March 2019): PDV Mk-II destroyed Microsat-R at ~283 km.
  { id: 'pdv_mk2', name: 'PDV Mk-II', kind: 'abm', producers: ['IND'], rangeKm: 1000, speedMach: 15, warheadKg: 0, cepM: 0, pk: { missile: 0.7 }, interceptDifficulty: 0, unitCostUsdM: 15, weightKg: 18000 },
  { id: 'sayyad4', name: 'Sayyad-4 (Bavar-373)', kind: 'sam', producers: ['IRN'], rangeKm: 300, speedMach: 6, warheadKg: 150, cepM: 10, pk: { aircraft: 0.6, missile: 0.3, helicopter: 0.7 }, interceptDifficulty: 0, unitCostUsdM: 1, weightKg: 1800 },
  { id: 'sayyad3', name: 'Sayyad-3 (Khordad-15)', kind: 'sam', producers: ['IRN'], rangeKm: 120, speedMach: 4, warheadKg: 100, cepM: 10, pk: { aircraft: 0.6, missile: 0.25, helicopter: 0.7 }, interceptDifficulty: 0, unitCostUsdM: 0.6, weightKg: 1200 },
  { id: 'tc2_sl', name: 'Tien Kung III', kind: 'abm', producers: ['TWN'], rangeKm: 200, speedMach: 7, warheadKg: 90, cepM: 5, pk: { aircraft: 0.75, missile: 0.5 }, interceptDifficulty: 0, unitCostUsdM: 2, weightKg: 1100 },
  { id: 'hisar_o', name: 'Hisar-O+', kind: 'sam', producers: ['TUR'], rangeKm: 25, speedMach: 3, warheadKg: 20, cepM: 3, pk: { aircraft: 0.7, missile: 0.5, helicopter: 0.8 }, interceptDifficulty: 0, unitCostUsdM: 0.7, weightKg: 300 },
]);

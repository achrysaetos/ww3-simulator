/**
 * Nuclear and long-range ballistic delivery: ICBMs, SLBMs, IRBMs, MRBMs,
 * hypersonic glide vehicles, nuclear cruise missiles and bombs.
 *
 * Sources: FAS Nuclear Notebook (2023-2025 country editions), CSIS Missile
 * Threat, DoD China Military Power Report 2024, CRS RL33640 (US strategic
 * forces). yieldKt is per warhead; MIRV counts are in the comment where a
 * missile carries more than one. Russian, Chinese, North Korean, Indian and
 * Pakistani yields and CEPs are open-source estimates. Unit costs for Soviet-era
 * and Chinese systems are estimates; US costs are program-unit figures restated
 * in current dollars where marked.
 */
import { defineMunitions, nuclearPk } from '../build';

const ballisticConv = { structure: 0.7, soft: 0.6, infantry: 0.4, hardened: 0.15, armor: 0.1 };

export const strategicMunitions = defineMunitions([
  // ---- United States
  // Mk21/W87 single warhead as deployed under New START counting; ~400 deployed (FAS 2024).
  { id: 'minuteman3', name: 'LGM-30G Minuteman III', kind: 'icbm', producers: ['USA'], rangeKm: 13000, speedMach: 23, warheadKg: 1150, yieldKt: 300, cepM: 120, pk: nuclearPk(300, 120), interceptDifficulty: 0.95, unitCostUsdM: 20, weightKg: 36030 },
  // GAO-24 Sentinel program ~$141B for 659 missiles incl. infrastructure; missile-only unit cost is an estimate.
  { id: 'sentinel', name: 'LGM-35A Sentinel', kind: 'icbm', producers: ['USA'], rangeKm: 13000, speedMach: 23, warheadKg: 1150, yieldKt: 300, cepM: 90, pk: nuclearPk(300, 90), interceptDifficulty: 0.95, unitCostUsdM: 160, weightKg: 36000 },
  // W76-1 90 kt; up to 8 RVs, ~4 average loaded (FAS). FY2024 D5LE unit ~$35M.
  { id: 'trident2_d5', name: 'UGM-133A Trident II D5LE (W76-1)', kind: 'slbm', producers: ['USA'], rangeKm: 12000, speedMach: 24, warheadKg: 2800, yieldKt: 90, cepM: 90, pk: nuclearPk(90, 90), interceptDifficulty: 0.96, unitCostUsdM: 35, weightKg: 59000 },
  { id: 'trident2_d5_w88', name: 'UGM-133A Trident II D5 (W88)', kind: 'slbm', producers: ['USA'], rangeKm: 11000, speedMach: 24, warheadKg: 2800, yieldKt: 475, cepM: 90, pk: nuclearPk(475, 90), interceptDifficulty: 0.96, unitCostUsdM: 35, weightKg: 59000 },
  // W76-2 low-yield warhead deployed 2019 (FAS: ~8 kt).
  { id: 'trident2_d5_lo', name: 'UGM-133A Trident II D5 (W76-2 low yield)', kind: 'slbm', producers: ['USA'], rangeKm: 12000, speedMach: 24, warheadKg: 2800, yieldKt: 8, cepM: 90, pk: nuclearPk(8, 90), interceptDifficulty: 0.96, unitCostUsdM: 35, weightKg: 59000 },
  { id: 'b61_12', name: 'B61-12 guided nuclear bomb', kind: 'guided_bomb', producers: ['USA'], rangeKm: 10, speedMach: 0.9, warheadKg: 375, yieldKt: 50, cepM: 30, pk: nuclearPk(50, 30), interceptDifficulty: 0.6, unitCostUsdM: 28, weightKg: 375 },
  { id: 'b83_1', name: 'B83-1 strategic bomb', kind: 'unguided_bomb', producers: ['USA'], rangeKm: 5, speedMach: 0.9, warheadKg: 1100, yieldKt: 1200, cepM: 100, pk: nuclearPk(1200, 100), interceptDifficulty: 0.5, unitCostUsdM: 10, weightKg: 1100 },
  { id: 'agm86b', name: 'AGM-86B ALCM (W80-1)', kind: 'cruise', producers: ['USA'], rangeKm: 2400, speedMach: 0.73, warheadKg: 123, yieldKt: 150, cepM: 30, pk: nuclearPk(150, 30), interceptDifficulty: 0.4, unitCostUsdM: 3, weightKg: 1430 },
  // LRSO enters service ~2030 per USAF; included because B-21/B-52 plans reference it.
  { id: 'lrso', name: 'AGM-181 LRSO (W80-4)', kind: 'cruise', producers: ['USA'], rangeKm: 2500, speedMach: 0.8, warheadKg: 130, yieldKt: 150, cepM: 15, pk: nuclearPk(150, 15), interceptDifficulty: 0.65, unitCostUsdM: 14, weightKg: 1500 },

  // ---- Russia
  // RS-24 Yars: up to 4 MIRV, ~100-150 kt (FAS 2024).
  { id: 'yars', name: 'RS-24 Yars', kind: 'icbm', producers: ['RUS'], rangeKm: 11000, speedMach: 23, warheadKg: 1200, yieldKt: 150, cepM: 150, pk: nuclearPk(150, 150), interceptDifficulty: 0.96, unitCostUsdM: 25, weightKg: 49600 },
  { id: 'topol_m', name: 'RT-2PM2 Topol-M', kind: 'icbm', producers: ['RUS'], rangeKm: 11000, speedMach: 23, warheadKg: 1200, yieldKt: 800, cepM: 200, pk: nuclearPk(800, 200), interceptDifficulty: 0.95, unitCostUsdM: 25, weightKg: 47200 },
  // RS-28 Sarmat: up to 10 MIRV (FAS); entry to combat duty claimed 2023, test failures since.
  { id: 'sarmat', name: 'RS-28 Sarmat', kind: 'icbm', producers: ['RUS'], rangeKm: 18000, speedMach: 23, warheadKg: 10000, yieldKt: 500, cepM: 150, pk: nuclearPk(500, 150), interceptDifficulty: 0.97, unitCostUsdM: 60, weightKg: 208100 },
  // R-36M2 Voevoda (SS-18 Mod 6): 10 MIRV x 500-800 kt.
  { id: 'r36m2', name: 'R-36M2 Voevoda (SS-18)', kind: 'icbm', producers: [], rangeKm: 11000, speedMach: 23, warheadKg: 8800, yieldKt: 800, cepM: 220, pk: nuclearPk(800, 220), interceptDifficulty: 0.95, unitCostUsdM: 40, weightKg: 211100 },
  // Avangard glider on UR-100N UTTKh booster; yield estimates range 0.8-2 Mt.
  { id: 'avangard', name: 'Avangard HGV (UR-100N UTTKh)', kind: 'hgv', producers: ['RUS'], rangeKm: 10000, speedMach: 20, warheadKg: 2000, yieldKt: 800, cepM: 150, pk: nuclearPk(800, 150), interceptDifficulty: 0.99, unitCostUsdM: 60, weightKg: 105600 },
  // R-30 Bulava: 6 MIRV x 100-150 kt.
  { id: 'bulava', name: 'R-30 Bulava', kind: 'slbm', producers: ['RUS'], rangeKm: 9300, speedMach: 23, warheadKg: 1150, yieldKt: 100, cepM: 350, pk: nuclearPk(100, 350), interceptDifficulty: 0.96, unitCostUsdM: 30, weightKg: 36800 },
  { id: 'sineva', name: 'R-29RMU2 Sineva', kind: 'slbm', producers: ['RUS'], rangeKm: 8300, speedMach: 23, warheadKg: 2800, yieldKt: 100, cepM: 500, pk: nuclearPk(100, 500), interceptDifficulty: 0.95, unitCostUsdM: 25, weightKg: 40300 },
  { id: 'kh102', name: 'Kh-102 nuclear ALCM', kind: 'cruise', producers: ['RUS'], rangeKm: 4500, speedMach: 0.7, warheadKg: 400, yieldKt: 250, cepM: 20, pk: nuclearPk(250, 20), interceptDifficulty: 0.45, unitCostUsdM: 13, weightKg: 2400 },
  // 3M14 Kalibr with a nuclear warhead; the yield is not public, 200 kt is the Soviet SS-N-21 Granat it replaced.
  { id: 'kalibr_nuc', name: '3M14 Kalibr (nuclear)', kind: 'cruise', producers: ['RUS'], rangeKm: 2000, speedMach: 0.8, warheadKg: 450, yieldKt: 200, cepM: 10, pk: nuclearPk(200, 10), interceptDifficulty: 0.4, unitCostUsdM: 3, weightKg: 1800 },
  { id: 'iskander_m_nuc', name: '9M723 Iskander-M (nuclear)', kind: 'srbm', producers: ['RUS'], rangeKm: 500, speedMach: 6, warheadKg: 480, yieldKt: 10, cepM: 30, pk: nuclearPk(10, 30), interceptDifficulty: 0.75, unitCostUsdM: 3, weightKg: 3800 },
  // 2M39 Poseidon nuclear torpedo; yields reported 2 Mt up to fanciful 100 Mt, 2 Mt used.
  { id: 'poseidon', name: '2M39 Poseidon nuclear torpedo', kind: 'torpedo', producers: ['RUS'], rangeKm: 10000, speedMach: 0.08, warheadKg: 2000, yieldKt: 2000, cepM: 500, pk: { ...nuclearPk(2000, 500), ship: 1, submarine: 0.8 }, interceptDifficulty: 0.9, unitCostUsdM: 100, weightKg: 100000 },

  // ---- China
  // DF-41: up to 3 MIRV (DoD CMPR 2024); range 12,000-15,000 km (CSIS).
  { id: 'df41', name: 'DF-41 (CSS-20)', kind: 'icbm', producers: ['CHN'], rangeKm: 13000, speedMach: 23, warheadKg: 2500, yieldKt: 250, cepM: 100, pk: nuclearPk(250, 100), interceptDifficulty: 0.96, unitCostUsdM: 30, weightKg: 80000 },
  { id: 'df31ag', name: 'DF-31AG (CSS-10 Mod 3)', kind: 'icbm', producers: ['CHN'], rangeKm: 11200, speedMach: 22, warheadKg: 1050, yieldKt: 250, cepM: 150, pk: nuclearPk(250, 150), interceptDifficulty: 0.95, unitCostUsdM: 20, weightKg: 42000 },
  // DF-5B: up to 5 MIRV.
  { id: 'df5b', name: 'DF-5B (CSS-4 Mod 3)', kind: 'icbm', producers: ['CHN'], rangeKm: 13000, speedMach: 22, warheadKg: 3200, yieldKt: 300, cepM: 300, pk: nuclearPk(300, 300), interceptDifficulty: 0.94, unitCostUsdM: 30, weightKg: 183000 },
  { id: 'jl3', name: 'JL-3 (CSS-N-20)', kind: 'slbm', producers: ['CHN'], rangeKm: 10000, speedMach: 22, warheadKg: 2000, yieldKt: 250, cepM: 150, pk: nuclearPk(250, 150), interceptDifficulty: 0.95, unitCostUsdM: 30, weightKg: 42000 },
  { id: 'jl2', name: 'JL-2 (CSS-N-14)', kind: 'slbm', producers: ['CHN'], rangeKm: 7200, speedMach: 20, warheadKg: 1050, yieldKt: 250, cepM: 300, pk: nuclearPk(250, 300), interceptDifficulty: 0.93, unitCostUsdM: 20, weightKg: 42000 },
  { id: 'df26_nuc', name: 'DF-26 (nuclear)', kind: 'irbm', producers: ['CHN'], rangeKm: 4000, speedMach: 18, warheadKg: 1200, yieldKt: 250, cepM: 150, pk: nuclearPk(250, 150), interceptDifficulty: 0.85, unitCostUsdM: 15, weightKg: 20000 },
  { id: 'df21a', name: 'DF-21A (CSS-5 Mod 2, nuclear)', kind: 'mrbm', producers: ['CHN'], rangeKm: 2150, speedMach: 10, warheadKg: 600, yieldKt: 250, cepM: 300, pk: nuclearPk(250, 300), interceptDifficulty: 0.75, unitCostUsdM: 8, weightKg: 14700 },
  // H-6N air-launched ballistic missile, nuclear role per DoD CMPR 2024; yield an estimate.
  { id: 'ch_as_x_13', name: 'CH-AS-X-13 air-launched ballistic missile', kind: 'mrbm', producers: ['CHN'], rangeKm: 3000, speedMach: 10, warheadKg: 600, yieldKt: 250, cepM: 100, pk: nuclearPk(250, 100), interceptDifficulty: 0.85, unitCostUsdM: 15, weightKg: 10000 },

  // ---- United Kingdom and France
  // M51.3: up to 6 TN-75/TNO, ~100 kt (FAS France 2023).
  { id: 'm51', name: 'M51.3 SLBM', kind: 'slbm', producers: ['FRA'], rangeKm: 9000, speedMach: 23, warheadKg: 1200, yieldKt: 100, cepM: 150, pk: nuclearPk(100, 150), interceptDifficulty: 0.96, unitCostUsdM: 120, weightKg: 56000 },
  { id: 'asmpa', name: 'ASMP-A (TNA)', kind: 'cruise', producers: ['FRA'], rangeKm: 500, speedMach: 3, warheadKg: 200, yieldKt: 300, cepM: 20, pk: nuclearPk(300, 20), interceptDifficulty: 0.75, unitCostUsdM: 20, weightKg: 860 },

  // ---- India and Pakistan (yields: FAS 2024 estimates of 12-40 kt fission/boosted; thermonuclear unproven)
  { id: 'agni5', name: 'Agni-V', kind: 'icbm', producers: ['IND'], rangeKm: 7000, speedMach: 22, warheadKg: 1500, yieldKt: 40, cepM: 150, pk: nuclearPk(40, 150), interceptDifficulty: 0.93, unitCostUsdM: 15, weightKg: 50000 },
  { id: 'agni3', name: 'Agni-III', kind: 'irbm', producers: ['IND'], rangeKm: 3200, speedMach: 15, warheadKg: 1500, yieldKt: 40, cepM: 200, pk: nuclearPk(40, 200), interceptDifficulty: 0.85, unitCostUsdM: 10, weightKg: 48300 },
  { id: 'agni_p', name: 'Agni-P (Prime)', kind: 'mrbm', producers: ['IND'], rangeKm: 2000, speedMach: 12, warheadKg: 1000, yieldKt: 40, cepM: 100, pk: nuclearPk(40, 100), interceptDifficulty: 0.8, unitCostUsdM: 8, weightKg: 11000 },
  { id: 'k4', name: 'K-4 SLBM', kind: 'slbm', producers: ['IND'], rangeKm: 3500, speedMach: 15, warheadKg: 2000, yieldKt: 40, cepM: 200, pk: nuclearPk(40, 200), interceptDifficulty: 0.85, unitCostUsdM: 12, weightKg: 17000 },
  { id: 'k15', name: 'K-15 Sagarika SLBM', kind: 'slbm', producers: ['IND'], rangeKm: 750, speedMach: 7, warheadKg: 1000, yieldKt: 12, cepM: 250, pk: nuclearPk(12, 250), interceptDifficulty: 0.7, unitCostUsdM: 5, weightKg: 6300 },
  { id: 'shaheen3', name: 'Shaheen-III', kind: 'mrbm', producers: ['PAK'], rangeKm: 2750, speedMach: 12, warheadKg: 1000, yieldKt: 40, cepM: 200, pk: nuclearPk(40, 200), interceptDifficulty: 0.8, unitCostUsdM: 8, weightKg: 19000 },
  { id: 'ghauri', name: 'Ghauri (Hatf-V)', kind: 'mrbm', producers: ['PAK'], rangeKm: 1250, speedMach: 9, warheadKg: 700, yieldKt: 12, cepM: 2500, pk: nuclearPk(12, 2500), interceptDifficulty: 0.7, unitCostUsdM: 4, weightKg: 15850 },
  // Nasr/Hatf-IX tactical nuclear SRBM, 70 km; yield estimated in the low kilotons.
  { id: 'nasr', name: 'Nasr (Hatf-IX)', kind: 'srbm', producers: ['PAK'], rangeKm: 70, speedMach: 4, warheadKg: 200, yieldKt: 5, cepM: 50, pk: nuclearPk(5, 50), interceptDifficulty: 0.6, unitCostUsdM: 1, weightKg: 1200 },
  { id: 'babur_nuc', name: 'Babur-1B (Hatf-VII, nuclear)', kind: 'cruise', producers: ['PAK'], rangeKm: 900, speedMach: 0.8, warheadKg: 450, yieldKt: 12, cepM: 30, pk: nuclearPk(12, 30), interceptDifficulty: 0.35, unitCostUsdM: 2, weightKg: 1500 },

  // ---- North Korea (CSIS Missile Threat; 2017 test ~140-250 kt; accuracy poorly constrained)
  { id: 'hwasong15', name: 'Hwasong-15', kind: 'icbm', producers: ['PRK'], rangeKm: 13000, speedMach: 22, warheadKg: 1000, yieldKt: 150, cepM: 1000, pk: nuclearPk(150, 1000), interceptDifficulty: 0.85, unitCostUsdM: 15, weightKg: 72000 },
  { id: 'hwasong17', name: 'Hwasong-17', kind: 'icbm', producers: ['PRK'], rangeKm: 15000, speedMach: 22, warheadKg: 2000, yieldKt: 150, cepM: 1000, pk: nuclearPk(150, 1000), interceptDifficulty: 0.87, unitCostUsdM: 20, weightKg: 100000 },
  { id: 'hwasong18', name: 'Hwasong-18 (solid)', kind: 'icbm', producers: ['PRK'], rangeKm: 15000, speedMach: 22, warheadKg: 1000, yieldKt: 150, cepM: 800, pk: nuclearPk(150, 800), interceptDifficulty: 0.88, unitCostUsdM: 20, weightKg: 55000 },
  { id: 'hwasong12', name: 'Hwasong-12', kind: 'irbm', producers: ['PRK'], rangeKm: 4500, speedMach: 15, warheadKg: 650, yieldKt: 150, cepM: 1000, pk: nuclearPk(150, 1000), interceptDifficulty: 0.8, unitCostUsdM: 8, weightKg: 24000 },
  { id: 'nodong', name: 'Hwasong-7 (Nodong)', kind: 'mrbm', producers: ['PRK'], rangeKm: 1500, speedMach: 9, warheadKg: 700, yieldKt: 15, cepM: 2000, pk: nuclearPk(15, 2000), interceptDifficulty: 0.65, unitCostUsdM: 3, weightKg: 16250 },

  // ---- Conventional theatre ballistic and hypersonic (long range)
  // DF-26 conventional land-attack round, 1,200-1,800 kg warhead (CSIS Missile Threat). DoD CMPR 2024: the
  // DF-26 strikes ground targets conventionally or with a nuclear warhead, and naval targets conventionally.
  { id: 'df26', name: 'DF-26 (conventional land attack)', kind: 'irbm', producers: ['CHN'], rangeKm: 4000, speedMach: 18, warheadKg: 1500, cepM: 100, pk: ballisticConv, interceptDifficulty: 0.85, unitCostUsdM: 15, weightKg: 20000 },
  // DF-26B, the anti-ship round with a manoeuvring terminal seeker (DoD CMPR 2024: conventional strikes against
  // naval targets out to the second island chain). Ship pk below the DF-21D's: longer flight time for the target
  // to move and a less mature seeker (estimate).
  { id: 'df26b', name: 'DF-26B ASBM', kind: 'antiship_ballistic', producers: ['CHN'], rangeKm: 4000, speedMach: 18, warheadKg: 1200, cepM: 20, pk: { ship: 0.4, structure: 0.6, soft: 0.5 }, interceptDifficulty: 0.85, unitCostUsdM: 15, weightKg: 20000 },
  // DF-21D ASBM, 1,500+ km; ship pk reflects terminal seeker vs a manoeuvring carrier (est).
  { id: 'df21d', name: 'DF-21D ASBM', kind: 'antiship_ballistic', producers: ['CHN'], rangeKm: 1500, speedMach: 10, warheadKg: 600, cepM: 20, pk: { ship: 0.45, structure: 0.6, soft: 0.5 }, interceptDifficulty: 0.8, unitCostUsdM: 10, weightKg: 14700 },
  { id: 'df17', name: 'DF-17 (DF-ZF HGV)', kind: 'hgv', producers: ['CHN'], rangeKm: 2000, speedMach: 8, warheadKg: 500, cepM: 10, pk: { structure: 0.8, soft: 0.7, hardened: 0.3, ship: 0.4, infantry: 0.4 }, interceptDifficulty: 0.9, unitCostUsdM: 12, weightKg: 15000 },
  { id: 'df16', name: 'DF-16 (CSS-11)', kind: 'mrbm', producers: ['CHN'], rangeKm: 1000, speedMach: 9, warheadKg: 1000, cepM: 10, pk: ballisticConv, interceptDifficulty: 0.75, unitCostUsdM: 6, weightKg: 11000 },
  // Iran's Scud and Nodong derivatives are the threat Arrow, David's Sling and THAAD were built against: with US help
  // Israel stopped ~85-90 % of them in April 2024 and June 2025 and most of the October 2024 wave (IDF; CSIS Missile
  // Defense Project 2025), so they are harder than a Scud but easier than an Iskander or a manoeuvring Fattah.
  { id: 'kheibar_shekan', name: 'Kheibar Shekan', kind: 'mrbm', producers: ['IRN'], rangeKm: 1450, speedMach: 10, warheadKg: 500, cepM: 50, pk: ballisticConv, interceptDifficulty: 0.5, unitCostUsdM: 2, weightKg: 7000 },
  { id: 'shahab3', name: 'Shahab-3 / Ghadr', kind: 'mrbm', producers: ['IRN'], rangeKm: 1600, speedMach: 9, warheadKg: 750, cepM: 500, pk: { ...ballisticConv, structure: 0.5, hardened: 0.05 }, interceptDifficulty: 0.4, unitCostUsdM: 1.5, weightKg: 17410 },
  { id: 'emad', name: 'Emad', kind: 'mrbm', producers: ['IRN'], rangeKm: 1700, speedMach: 10, warheadKg: 750, cepM: 100, pk: ballisticConv, interceptDifficulty: 0.45, unitCostUsdM: 2, weightKg: 17500 },
  { id: 'sejjil', name: 'Sejjil', kind: 'mrbm', producers: ['IRN'], rangeKm: 2000, speedMach: 11, warheadKg: 700, cepM: 200, pk: ballisticConv, interceptDifficulty: 0.5, unitCostUsdM: 3, weightKg: 23600 },
  { id: 'khorramshahr', name: 'Khorramshahr-4', kind: 'mrbm', producers: ['IRN'], rangeKm: 2000, speedMach: 12, warheadKg: 1500, cepM: 100, pk: ballisticConv, interceptDifficulty: 0.55, unitCostUsdM: 4, weightKg: 26000 },
  // Fattah-1: claimed manoeuvring re-entry; used against Israel Oct 2024 with partial interception.
  { id: 'fattah1', name: 'Fattah-1', kind: 'mrbm', producers: ['IRN'], rangeKm: 1400, speedMach: 13, warheadKg: 450, cepM: 50, pk: ballisticConv, interceptDifficulty: 0.75, unitCostUsdM: 3, weightKg: 8000 },
  { id: 'kn23', name: 'KN-23 (Hwasong-11A)', kind: 'srbm', producers: ['PRK'], rangeKm: 690, speedMach: 6, warheadKg: 500, cepM: 100, pk: ballisticConv, interceptDifficulty: 0.75, unitCostUsdM: 2, weightKg: 3400 },
]);

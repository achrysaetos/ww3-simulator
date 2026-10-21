import type { ItemKey } from './items';

export interface LineSpec {
  item: ItemKey;
  /**
   * Output per year at mobilization 0, i.e. at the defence-spending level in the
   * nation's baseline stats (2024-25). For nations already at war (RUS, UKR) this is
   * their wartime rate, because their stats already carry wartime spending.
   */
  baselinePerYear: number;
  /** Ceiling reachable after about two years of full mobilization: plant, tooling, and labour, not money. */
  surgePerYear: number;
  /** Lifetime cap for lines that consume a finite stock, such as refurbishing stored hulls. */
  maxTotal?: number;
}

const L = (item: ItemKey, baselinePerYear: number, surgePerYear: number, maxTotal?: number): LineSpec => ({ item, baselinePerYear, surgePerYear, ...(maxTotal ? { maxTotal } : {}) });

/**
 * Defence-industrial lines by nation. "est." marks figures with no authoritative
 * public number, scaled from comparable lines; everything else cites a source.
 * Nations not listed still produce `ammo_generic` scaled by manufacturing output.
 */
export const LINES: Record<string, LineSpec[]> = {
  USA: [
    // US Army: ~40k/month in early 2025, goal 100k/month (slipped into 2026).
    L('shell_155', 480_000, 1_200_000),
    // Lockheed Martin: GMLRS capacity ~14,000/yr from 2023; surge est.
    L('gmlrs', 14_000, 20_000),
    // Lockheed Martin: 550 PAC-3 MSE in 2024, 650/yr planned by 2027; wartime surge est. ~2x.
    L('pac3_mse', 550, 1_100),
    // FY2024-25 SM-6 buys ~125/yr (CRS RL32109); surge est.
    L('sm6', 125, 300),
    // Lockheed: ~96 THAAD interceptors/yr (2025); surge est.
    L('thaad', 96, 200),
    // FY2024-25 Tomahawk buys 55-70/yr; Raytheon surge est.
    L('tomahawk', 70, 500),
    // JASSM ~550/yr with a stated goal of ~1,100/yr combined JASSM/LRASM.
    L('jassm', 550, 1_000),
    L('lrasm', 50, 120),
    // AMRAAM ~1,100-1,200/yr after the 2023 multiyear; surge est.
    L('aim120', 1_150, 2_000),
    // Javelin JV: 2,400/yr (2023) toward 3,960/yr by 2026.
    L('javelin', 2_400, 3_960),
    L('stinger', 500, 720),
    // Lima JSMP: ~12 Abrams/month (upgrade line); surge est.
    L('m1a2', 144, 400),
    // F-35: 156 delivered 2023, ~110 in 2024 (TR-3 hold), capacity ~156/yr (Lockheed); surge est.
    L('f35a', 150, 180),
    // Two Arleigh Burke yards at ~1 hull each per year (CRS RL32109).
    L('ddg51', 2, 3),
    // Virginia class delivering ~1.1-1.3/yr against a 2/yr goal (CRS RL32418).
    L('ssn_virginia', 1.2, 2),
  ],
  RUS: [
    // Estonian Defence Intelligence / NATO 2024: ~3M rounds/yr (152+122 mm); Rheinmetall est. up to 4.5M.
    L('shell_152', 3_000_000, 4_500_000),
    // RUSI (2024): new-build T-90M est. 200-300/yr; most "new" tanks are refurbished.
    L('t90m', 250, 500),
    // RUSI/IISS: ~1,200 tanks/yr refurbished from storage, depleting by ~2026 (est. remaining hulls).
    L('t72b3', 1_200, 1_500, 3_000),
    L('su35s', 15, 24),
    L('su34', 15, 30),
    // Ukrainian GUR 2024: Kh-101 ~40-50/month.
    L('kh101', 500, 700),
    // Ukrainian GUR 2024: Iskander-M ~40-50/month.
    L('iskander_m', 550, 900),
    L('kalibr', 300, 450),
    // Alabuga: ~2,700 Geran-2/month by mid-2025 plus decoys (ISIS, Ukrainian intelligence).
    L('shahed_136', 32_000, 72_000),
    // UMPK glide kits est. ~70,000 in 2025 (Ukrainian intelligence statements).
    L('fab500_umpk', 70_000, 100_000),
    L('s400_48n6', 400, 600),
    L('ssn_yasen', 1, 1.5),
  ],
  CHN: [
    // No public figure; est. from NORINCO scale and China's ~30% share of world manufacturing.
    L('shell_155', 2_000_000, 8_000_000),
    // J-20: est. ~100/yr in 2023-24 (IISS, imagery-based counts); surge est.
    L('j20', 100, 150),
    L('j16', 40, 80),
    L('ztz99a', 80, 300),
    // DoD China Military Power Report 2023-24 inventory growth implies these rates (est.).
    L('df15', 150, 300),
    L('df21d', 100, 250),
    L('df26', 100, 250),
    L('cj10', 100, 300),
    L('pl15', 500, 1_500),
    L('hq9', 500, 1_200),
    L('shahed_136', 0, 20_000),
    // PLAN commissioning pace 2019-24: ~2 Type 055 and ~4-6 Type 052D per year.
    L('type055', 2, 4),
    L('type052d', 5, 10),
    L('ssn_093', 1.5, 3),
  ],
  UKR: [
    // Ukrainian MoD 2024-25: domestic 155 mm production in the low hundreds of thousands (est.).
    L('shell_155', 200_000, 600_000),
    // Ukraine: ~1.5-2M FPV drones in 2024, 4.5M planned for 2025 (MoD).
    L('fpv_drone', 2_000_000, 4_500_000),
    // Ministry of Strategic Industries (Jan 2025): ~2.4M artillery and mortar rounds made at home in 2024.
    // Less the 155 mm line, ~2.2M mostly 82/120 mm mortar and 122 mm rounds at ~20 kg shipped (est.): ~44 kt;
    // planned to roughly double in 2025.
    L('ammo_generic', 44_000, 90_000),
  ],
  // EU target ~2M rounds/yr by end-2025 (European Commission); split by producer, est.
  DEU: [L('shell_155', 450_000, 900_000), L('leopard2a8', 50, 120)],
  FRA: [L('shell_155', 100_000, 200_000), L('rafale', 25, 36), L('aster30', 200, 400), L('storm_shadow', 50, 150)],
  GBR: [L('shell_155', 80_000, 200_000), L('storm_shadow', 30, 100)],
  POL: [L('shell_155', 150_000, 300_000)],
  ESP: [L('shell_155', 250_000, 400_000)],
  ITA: [L('shell_155', 60_000, 150_000), L('aster30', 80, 160)],
  CZE: [L('shell_155', 100_000, 200_000)],
  // Poongsan/Hanwha supplied ~500k+ rounds to the US 2023; est.
  KOR: [L('shell_155', 600_000, 1_200_000), L('k2', 100, 250), L('k9', 100, 250)],
  JPN: [L('shell_155', 50_000, 150_000), L('pac3_mse', 30, 60), L('mogami', 2, 3)],
  TWN: [L('shell_155', 30_000, 100_000)],
  // South Korean NIS: North Korea shipped ~6M+ rounds to Russia 2023-24; capacity est.
  PRK: [L('shell_152', 1_500_000, 3_000_000), L('kn23', 50, 100)],
  IRN: [L('shahed_136', 12_000, 24_000), L('fateh_110', 300, 600)],
  IND: [L('shell_155', 100_000, 300_000), L('tejas', 16, 24), L('brahmos', 100, 200)],
  ISR: [L('shell_155', 50_000, 150_000), L('tamir', 1_000, 2_500)],
  TUR: [L('shell_155', 100_000, 250_000)],
};

/**
 * Generic ammunition output, tons per year per USD 1B of manufacturing value added,
 * at mobilization 0. Est.: puts the US at ~50 kt/yr, about twice its 155 mm tonnage.
 */
export const GENERIC_AMMO_TONS_PER_MFG_USD_B = 20;
/**
 * Generic ammunition surge multiple at full mobilization. Artillery fires it as shells, so it
 * surges like the shell lines above (1.5-3x; US 155 mm about 14k to 40k a month over 2022-25,
 * US Army), not like WWII small-arms ammunition (US about 10x 1940-43, from a peacetime trickle).
 */
// param: tag=estimated range=[2,4] source=US Army 155 mm production 2022-25; shell lines in this file
export const GENERIC_AMMO_SURGE_MULTIPLE = 3;

/**
 * Merchant shipbuilding capacity, gross tons per year. ONI 2023 briefing slide:
 * China ~23.25M GT, about 232x the US (<0.1M GT). Korea and Japan from Clarksons 2023.
 * Caps greenfield warship lines ordered through the `produce` command.
 */
export const SHIPBUILDING_GT_PER_YEAR: Record<string, number> = {
  CHN: 23_250_000,
  KOR: 15_000_000,
  JPN: 9_000_000,
  USA: 100_000,
  ITA: 600_000,
  DEU: 400_000,
  FRA: 300_000,
  RUS: 300_000,
  IND: 200_000,
  TWN: 400_000,
  TUR: 600_000,
  VNM: 700_000,
  PHL: 600_000,
};
/** Share of merchant yard tonnage convertible to warships, est. from WWII US/UK conversion. */
export const SHIPYARD_WARSHIP_SHARE = 0.05;

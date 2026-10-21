import type { NationStats } from '../../core/types';
import type { Resource } from './items';

/** Crude steel output, Mt per year (worldsteel, World Steel in Figures 2025, 2024 data). */
export const STEEL_OUTPUT_MT: Record<string, number> = {
  CHN: 1005, IND: 149, JPN: 84, USA: 79, RUS: 71, KOR: 64, DEU: 37, TUR: 37, BRA: 34, IRN: 31,
  VNM: 22, ITA: 20, TWN: 19, MEX: 14, ESP: 12, FRA: 11, CAN: 12, POL: 7, UKR: 7.6, GBR: 4,
};
const STEEL_WORLD_MT = 1_885;

/**
 * Oil products consumed per year, Mt (Energy Institute Statistical Review 2024, 2023
 * data, kb/d x 0.05). Nations not listed use OIL_TONS_PER_PPP_USD_M.
 */
export const OIL_CONSUMPTION_MT: Record<string, number> = {
  USA: 1_010, CHN: 830, IND: 270, SAU: 200, RUS: 185, JPN: 165, KOR: 140, BRA: 160, CAN: 120, DEU: 100, IRN: 100, MEX: 90,
  FRA: 75, GBR: 70, TWN: 50, ITA: 60, ESP: 63, TUR: 50, POL: 35, ISR: 12, UKR: 10, PRK: 1,
};
/** World oil use (~4.5 Gt) over world GDP at PPP (~USD 185T), tons per year per USD 1M (est.). */
export const OIL_TONS_PER_PPP_USD_M = 25;

/**
 * Share of a nation's foreign trade that moves by sea, so a naval blockade
 * (`theater.tradeBlocked`, a share of seaborne trade) cannot touch the rest. About 80%
 * of world trade by volume goes by sea (UNCTAD Review of Maritime Transport 2024); the
 * overrides are estimates from land borders, pipelines and rail links.
 */
export const SEABORNE_TRADE_SHARE: Record<string, number> = {
  JPN: 0.99, TWN: 0.99, KOR: 0.99, AUS: 0.99, NZL: 0.99, PHL: 0.99, IDN: 0.97, ISR: 0.95, IND: 0.95, GBR: 0.85,
  // Ukraine moved ~60% of 2024 exports through its Black Sea ports, the rest by rail, road and the Danube.
  UKR: 0.6,
  // Russia: pipelines and rail to China, Central Asia and Belarus.
  RUS: 0.6,
  CHN: 0.85, IRN: 0.85, SAU: 0.9,
  // Land trade inside the EU single market and across North America.
  USA: 0.7, CAN: 0.3, MEX: 0.3, DEU: 0.4, FRA: 0.5, POL: 0.4, ITA: 0.6, ESP: 0.6, NLD: 0.6,
};
export const DEFAULT_SEABORNE_TRADE_SHARE = 0.8;

/**
 * One national stock of an import stream: its share of the resource's imports and the months of
 * national use of that stream it holds, as reserves are reported (days of LNG, of oil, of grain).
 */
export interface Stock {
  share: number;
  months: number;
}

/**
 * Energy imports split by fuel, each with its own reserve. LNG runs out in weeks while
 * strategic oil lasts months, so a blockade bites in steps, not at one cliff.
 */
const energy = (oil: [number, number], coal: [number, number], gas: [number, number]): Stock[] => [
  { share: oil[0], months: oil[1] },
  { share: coal[0], months: coal[1] },
  { share: gas[0], months: gas[1] },
];
// IEA members hold 90 days of net oil imports; the EU gas-storage rule fills ~2-3 months of winter use.
const iea = energy([0.55, 3], [0.1, 1], [0.35, 2.5]);

export interface ResourceSpec {
  /**
   * Share of world exports (or processing) by supplier. 'other' stands for the
   * diffuse remainder of the market, which no single sanction or war can close.
   */
  market: Record<string, number>;
  /** Domestic share of national need for nations that make a material part of it. */
  selfSufficiency: Record<string, number>;
  /** Fallback when a nation is not in `selfSufficiency`. */
  defaultSelf(stats: NationStats): number;
  /** Months of national stocks held against an import cut, and per-nation overrides. */
  bufferMonths: number;
  buffers?: Record<string, number>;
  /** Per-nation stocks split by import stream, replacing the single buffer. Shares sum to 1. */
  tiered?: Record<string, Stock[]>;
  /** Covered by export controls, so sanctions stop most of it rather than rerouting it like ordinary goods. */
  exportControlled?: boolean;
  /** How the state rations a stock it draws on. Absent: the stock is drawn at the full rate until it is empty. */
  rationing?: Rationing;
}

/**
 * Once a stock covers less than `belowMonths` of use, the state cuts non-priority demand in step
 * with the cover left, down to `priority`, the share of demand it serves from a nearly empty stock.
 */
export interface Rationing {
  priority: number;
  belowMonths: number;
}

const fromRest = (shares: Record<string, number>): Record<string, number> => {
  const named = Object.values(shares).reduce((a, b) => a + b, 0);
  return { ...shares, other: Math.max(0, 1 - named) };
};

export const RESOURCE_SPECS: Record<Resource, ResourceSpec> = {
  energy: {
    // Share of world primary-energy exports (oil, gas, coal), est. from Energy Institute Statistical Review 2024.
    market: fromRest({ SAU: 0.11, RUS: 0.12, USA: 0.1, CAN: 0.06, AUS: 0.06, QAT: 0.04, ARE: 0.05, IRQ: 0.05, NOR: 0.04, IDN: 0.05, KWT: 0.03, IRN: 0.02 }),
    selfSufficiency: {},
    // World Bank energy imports, net (% of energy use); negative means net exporter.
    defaultSelf: (s) => 1 - Math.max(0, Math.min(100, s.energyImportPct ?? 30)) / 100,
    // IEA members hold >= 90 days of net oil imports. Months below weight oil stocks
    // by oil's share of imports; LNG and coal hold only weeks (est.).
    bufferMonths: 1,
    buffers: { USA: 3 },
    // [import share, months held] for oil, coal, gas. Import shares by fuel from the Energy Institute
    // Statistical Review 2024 (est.); reserves as cited.
    tiered: {
      // METI: ~230 days of oil (state + private); LNG ~2-3 weeks; coal ~1 month.
      JPN: energy([0.45, 7.5], [0.28, 1], [0.27, 0.6]),
      // KNOC: ~200 days of oil; KOGAS LNG ~9 days on hand plus storage.
      KOR: energy([0.5, 6.5], [0.27, 1], [0.23, 0.4]),
      // Taiwan: ~90+ days of oil (Petroleum Administration Act), coal ~36 days, LNG ~11 days (CPC/Taipower).
      TWN: energy([0.45, 3.5], [0.32, 1.2], [0.23, 0.37]),
      // China: SPR and commercial crude ~90-120 days (est.); gas storage ~1 month.
      CHN: energy([0.7, 3.5], [0.1, 1], [0.2, 1]),
      // India: SPR ~9.5 days plus ~65 days of refinery and product stocks (PPAC).
      IND: energy([0.65, 2.5], [0.25, 1], [0.1, 0.3]),
      // UK: ~60 days of oil, almost no gas storage since Rough closed in 2017.
      GBR: energy([0.55, 2], [0.05, 1], [0.4, 0.3]),
      DEU: iea, FRA: iea, ITA: iea, ESP: iea, POL: iea, NLD: iea,
    },
    // Forces, power for hospitals, water, telecoms and households, and the food chain keep their
    // supply; industry and feedstock go first. Judgment: Taiwan's industry takes ~55% of its power
    // and petrochemical feedstock ~30% of its oil (Energy Administration, Energy Statistics Handbook
    // 2023). Restraint starts when a fuel is down to about a month of cover, as Taipower sheds load
    // when its LNG tanks run low, while a 90-day oil reserve is drawn freely at first (IEA
    // emergency system: stock draw first, demand restraint of 7-10% if a shortage persists).
    rationing: { priority: 0.5, belowMonths: 1 },
  },
  food: {
    market: fromRest({ USA: 0.1, BRA: 0.1, ARG: 0.04, NLD: 0.05, CAN: 0.04, AUS: 0.04, UKR: 0.03, RUS: 0.04, FRA: 0.04, IND: 0.04, THA: 0.03, IDN: 0.03 }),
    // Calorie-basis self-sufficiency: Japan MAFF ~38%, Korea ~35-45%, Taiwan COA ~31%, UK DEFRA ~60%.
    selfSufficiency: {
      JPN: 0.38, KOR: 0.4, TWN: 0.31, GBR: 0.6, DEU: 0.85, NLD: 0.7, ISR: 0.45, SAU: 0.2, ARE: 0.1, EGY: 0.5,
      USA: 1, CAN: 1, BRA: 1, ARG: 1, AUS: 1, RUS: 1, UKR: 1, FRA: 1, IND: 1, CHN: 0.85, PRK: 0.75, IRN: 0.65,
    },
    defaultSelf: () => 0.8,
    bufferMonths: 2,
    // China's state grain reserve is reported at over a year of consumption (est.).
    buffers: { CHN: 12, JPN: 2, IND: 6 },
  },
  semiconductors: {
    // Foundry and memory output share (TrendForce, SIA/BCG 2024). TSMC alone ~60% of foundry
    // revenue and ~90% of leading-edge logic.
    market: fromRest({ TWN: 0.55, KOR: 0.17, CHN: 0.1, USA: 0.07, JPN: 0.06, NLD: 0.01, DEU: 0.02 }),
    // Share of defence-grade chip need met at home (est.): US trusted foundries and
    // mature-node fabs; Russia relies on imported Western/Chinese chips (CAR, KSE 2024).
    selfSufficiency: { TWN: 1, KOR: 0.9, CHN: 0.6, USA: 0.35, JPN: 0.6, DEU: 0.3, FRA: 0.3, GBR: 0.2, ISR: 0.4, NLD: 0.3, RUS: 0.1, IND: 0.1, IRN: 0.05, PRK: 0.05, UKR: 0.05, TUR: 0.1 },
    defaultSelf: () => 0,
    bufferMonths: 6,
    // US, EU, Japanese, Korean and Taiwanese export controls on Russia from 2022; US controls on China from 2022.
    exportControlled: true,
    // Russia stockpiled microelectronics before 2022 (est.).
    buffers: { RUS: 9 },
  },
  rare_earths: {
    // Processing and magnet share (IEA Critical Minerals Outlook 2024: China ~90% processing).
    market: fromRest({ CHN: 0.88, MYS: 0.04, USA: 0.02, JPN: 0.02, EST: 0.01 }),
    selfSufficiency: { CHN: 1, USA: 0.15, JPN: 0.1, RUS: 0.3, IND: 0.3, MYS: 0.5, AUS: 0.3 },
    defaultSelf: () => 0,
    bufferMonths: 4,
    // China's export licensing of gallium, germanium, graphite and rare-earth magnets (2023-25).
    exportControlled: true,
    // Japan holds a national rare-metals stockpile (JOGMEC) of ~60 days, plus industry stock (est.).
    buffers: { JPN: 6, USA: 6 },
  },
  energetics: {
    // Nitrocellulose, TNT and RDX/HMX. China dominates cotton-linter nitrocellulose (est.);
    // the US has had no TNT plant since 1986 and relies on imports while one is built.
    market: fromRest({ CHN: 0.35, IND: 0.1, RUS: 0.1, POL: 0.04, DEU: 0.04, FRA: 0.03, KOR: 0.05, USA: 0.05, TUR: 0.04 }),
    selfSufficiency: { CHN: 1, RUS: 0.95, IND: 0.85, USA: 0.6, KOR: 0.8, DEU: 0.5, FRA: 0.6, POL: 0.6, GBR: 0.3, JPN: 0.5, TUR: 0.7, IRN: 0.8, PRK: 0.9, UKR: 0.3, ISR: 0.6 },
    defaultSelf: () => 0.2,
    // Explosives and propellants are munitions-list items (Wassenaar, EU Common Military List).
    exportControlled: true,
    bufferMonths: 3,
  },
  steel: {
    market: fromRest(Object.fromEntries(Object.entries(STEEL_OUTPUT_MT).map(([n, mt]) => [n, mt / STEEL_WORLD_MT]))),
    // Domestic share of finished-steel demand (est. from worldsteel apparent-use vs output).
    selfSufficiency: { CHN: 1, JPN: 1, KOR: 1, RUS: 1, IND: 1, UKR: 1, TUR: 1, BRA: 1, IRN: 1, USA: 0.75, DEU: 0.85, ITA: 0.8, FRA: 0.7, TWN: 0.9, ESP: 0.75, POL: 0.6, GBR: 0.4, CAN: 0.7, MEX: 0.6, VNM: 0.7 },
    defaultSelf: () => 0.3,
    bufferMonths: 2,
  },
};

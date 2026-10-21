import type { Nation } from '../../core/types';

/**
 * Trained reservists outside the active force, IISS Military Balance 2025 "Reserve" headlines
 * (rounded, as recalled from the 2025 edition; organised reserve units that the ORBAT already
 * fields as formations are part of these totals but small beside them). Nations not listed get
 * 0.57 reservists per active serviceman in createWorld, the median of these rows against World
 * Bank armed-forces totals (Egypt; the rows run from Italy's 0.05 to Finland's 10.8).
 */
export const IISS_RESERVES: Record<string, number> = {
  USA: 799_500, CAN: 34_400, GBR: 72_850, FRA: 41_050, DEU: 33_650, ITA: 18_300, ESP: 14_900,
  GRC: 289_000, TUR: 378_700, POL: 0, FIN: 238_000, SWE: 10_000, NOR: 40_000, EST: 17_500,
  UKR: 1_000_000, RUS: 1_500_000, BLR: 289_500,
  CHN: 510_000, TWN: 1_657_000, JPN: 55_900, KOR: 3_100_000, PRK: 600_000, VNM: 5_000_000,
  THA: 200_000, AUS: 29_750, IND: 1_155_000, IRN: 350_000, ISR: 465_000, EGY: 479_000, BRA: 1_340_000,
};

/**
 * Months from a call-up order until a recalled reservist can replace a loss: reporting,
 * re-equipping and a refresher course. Russia's September 2022 partial mobilisation put
 * 300,000 men into units within about two months (Shoigu, 28 Oct 2022) after 2-4 weeks of
 * training; Taiwan's reservist refresher runs 14 days (MND 2024). Mean of an exponential lag.
 */
export const RESERVIST_RECALL_MONTHS = 2;

/**
 * Recall reservists for one step. A nation calls up reservists in proportion to its
 * mobilization: full mobilization recalls the pool at 1/RESERVIST_RECALL_MONTHS a month, a
 * peacetime nation none. Moves the recalled men out of `nation.reservists` and returns them.
 */
export function recallReservists(nation: Nation, dtMonths: number): number {
  if (nation.mobilization <= 0 || nation.reservists <= 0) return 0;
  const recalled = nation.reservists * nation.mobilization * (1 - Math.exp(-dtMonths / RESERVIST_RECALL_MONTHS));
  nation.reservists -= recalled;
  return recalled;
}

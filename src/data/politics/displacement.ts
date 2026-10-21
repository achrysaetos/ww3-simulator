/**
 * People already displaced by wars running when the scenarios open (late 2025), so a
 * continuing war starts from the real stock rather than an empty country.
 *
 * Ukraine: UNHCR Operational Data Portal, "Ukraine Refugee Situation" (refugees recorded
 * by host, late 2025; ~6.9M worldwide, ~6.3M of them in Europe), rounded; Russia's figure
 * is the last UNHCR-reported count (2023). IDPs: IOM Ukraine General Population Survey,
 * 2025 (~3.7M).
 */
export interface DisplacedStock {
  idps: number;
  /** Refugees by host nation. */
  hosted: Record<string, number>;
}

export const DISPLACED_2025: Record<string, DisplacedStock> = {
  UKR: {
    idps: 3_700_000,
    hosted: {
      DEU: 1_230_000, POL: 990_000, RUS: 1_230_000, CZE: 390_000, GBR: 250_000, ESP: 240_000,
      ROU: 180_000, ITA: 170_000, MDA: 130_000, SVK: 130_000, NLD: 120_000, IRL: 110_000,
      AUT: 90_000, BEL: 90_000, USA: 270_000, FRA: 70_000, LTU: 50_000, BGR: 70_000, HUN: 40_000,
    },
  },
};

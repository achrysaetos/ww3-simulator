import type { ItemKey } from './items';

/**
 * A standing arms-transfer pipeline: units a year the donor ships while the recipient is at war
 * and the two are not at war with each other. `stocks` ships from the donor's own stocks and
 * production; `market` buys from third-country makers with money partners already budget as aid,
 * so it draws on no one's stocks.
 */
export interface AidFlow {
  donor: string;
  recipient: string;
  item: ItemKey;
  perYear: number;
  source: 'stocks' | 'market';
}

const A = (donor: string, recipient: string, item: ItemKey, perYear: number, source: AidFlow['source'] = 'stocks'): AidFlow => ({ donor, recipient, item, perYear, source });

/**
 * 2024-25 rates. Partners supplied most of Ukraine's artillery ammunition and North Korea
 * about half of Russia's in 2024; without these flows neither side's shell supply matches
 * what it fired. All figures are estimates from public statements.
 */
export const AID_FLOWS: AidFlow[] = [
  // US: >3M 155 mm rounds sent Feb 2022-early 2025 (DoD fact sheets), ~1M a year; slowed in 2025 (est.).
  A('USA', 'UKR', 'shell_155', 500_000),
  // EU: ~1M rounds delivered by end-2024 under the 2023 pledge (est. split between the largest suppliers).
  A('DEU', 'UKR', 'shell_155', 250_000),
  A('CZE', 'UKR', 'shell_155', 50_000),
  A('FRA', 'UKR', 'shell_155', 80_000),
  A('POL', 'UKR', 'shell_155', 50_000),
  A('GBR', 'UKR', 'shell_155', 40_000),
  // Czech ammunition initiative: ~1.5M large-calibre rounds delivered in 2024, bought outside the EU
  // with money from ~18 partner states (Czech government, Jan 2025); 152 and 155 mm, counted as 155.
  A('CZE', 'UKR', 'shell_155', 1_500_000, 'market'),
  // GMLRS and Patriot interceptors: a few thousand rockets and a few hundred PAC-3 since 2022 (est.).
  A('USA', 'UKR', 'gmlrs', 2_000),
  A('USA', 'UKR', 'pac3_mse', 100),
  A('GBR', 'UKR', 'storm_shadow', 30),
  A('FRA', 'UKR', 'storm_shadow', 20),
  // South Korean NIS: North Korea shipped >12,000 containers, est. 6-9M+ rounds, from Aug 2023 to 2025;
  // about 2-3M a year, falling as its stocks thinned.
  A('PRK', 'RUS', 'shell_152', 2_500_000),
];

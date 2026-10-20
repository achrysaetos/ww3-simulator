import type { Government } from '../../core/types';

/**
 * Regime type per nation. Base classification: EIU Democracy Index 2024 categories
 * (full democracy -> liberal_democracy, flawed, hybrid, authoritarian). Authoritarian
 * regimes are split further using V-Dem 2025 and Freedom House 2025 where the ruling
 * structure differs in kind: one-party totalitarian states, clerical rule, ruling
 * monarchies, and post-coup juntas. States the EIU does not rate (Pacific and Caribbean
 * microstates, Kosovo, Monaco, Vatican) follow Freedom House 2025 status. Borderline
 * EIU cases (scores within 0.1 of a cutoff) are judgment calls.
 */
const BY_TYPE: Record<Government, string[]> = {
  liberal_democracy: [
    'NOR', 'NZL', 'SWE', 'ISL', 'CHE', 'FIN', 'DNK', 'IRL', 'NLD', 'AUS', 'TWN', 'URY', 'LUX', 'DEU', 'CAN',
    'JPN', 'CRI', 'AUT', 'ESP', 'GBR', 'EST', 'CHL', 'CZE', 'GRC',
    // Freedom House "Free", not rated by EIU
    'ATG', 'BHS', 'BRB', 'DMA', 'GRD', 'KNA', 'LCA', 'VCT', 'KIR', 'MHL', 'FSM', 'NRU', 'PLW', 'WSM',
  ],
  flawed_democracy: [
    'USA', 'FRA', 'KOR', 'ITA', 'BEL', 'PRT', 'MLT', 'MUS', 'CYP', 'SVN', 'LVA', 'LTU', 'POL', 'SVK', 'ISR',
    'IND', 'ZAF', 'BWA', 'CPV', 'JAM', 'TTO', 'PAN', 'ARG', 'BRA', 'COL', 'SUR', 'GUY', 'DOM', 'IDN', 'PHL',
    'MYS', 'THA', 'MNG', 'TLS', 'HRV', 'BGR', 'ROU', 'SRB', 'MNE', 'MKD', 'ALB', 'HUN', 'NAM', 'GHA', 'LKA',
    'PER', 'PRY', 'ECU', 'BLZ', 'MDA', 'SGP', 'TON', 'SLB', 'VUT', 'FJI', 'XKX', 'SYC', 'STP', 'LSO', 'MDV',
  ],
  hybrid: [
    'UKR', 'GEO', 'ARM', 'TUR', 'BIH', 'MEX', 'BOL', 'HND', 'GTM', 'SLV', 'BGD', 'NPL', 'BTN', 'PAK', 'KGZ',
    'SEN', 'KEN', 'TZA', 'MWI', 'ZMB', 'UGA', 'LBR', 'SLE', 'GMB', 'CIV', 'BEN', 'MDG', 'MAR', 'TUN', 'PNG',
    'NGA', 'MRT', 'HTI', 'LBN', 'PSE', 'IRQ',
  ],
  authoritarian: [
    'RUS', 'BLR', 'AZE', 'KAZ', 'UZB', 'TJK', 'DZA', 'EGY', 'ETH', 'RWA', 'BDI', 'CMR', 'TGO', 'AGO', 'MOZ',
    'ZWE', 'COG', 'COD', 'CAF', 'GNQ', 'GAB', 'DJI', 'SSD', 'SOM', 'LBY', 'YEM', 'SYR', 'VEN', 'NIC', 'CUB',
    'KHM', 'COM', 'GNB', 'TCD', 'CHN', 'VNM', 'LAO',
  ],
  // Personalist one-party states with no tolerated civil society (Freedom House 2025 scores of 3/100 or less).
  totalitarian: ['PRK', 'ERI', 'TKM'],
  theocracy: ['IRN', 'AFG', 'VAT'],
  // Ruling post-coup militaries (Mali 2021, Burkina Faso 2022, Niger 2023, Guinea 2021, Myanmar 2021, Sudan SAF 2021).
  military_junta: ['MMR', 'MLI', 'BFA', 'NER', 'GIN', 'SDN'],
  // Monarchs hold executive power (EIU authoritarian; Kuwait's parliament suspended May 2024).
  monarchy: ['SAU', 'ARE', 'QAT', 'KWT', 'BHR', 'OMN', 'BRN', 'SWZ', 'JOR', 'MCO'],
};

export const governments: Record<string, Government> = Object.fromEntries(
  Object.entries(BY_TYPE).flatMap(([gov, ids]) => ids.map((id) => [id, gov as Government])),
);

/** Exposed so tests can catch a nation listed under two regime types. */
export const governmentListings: string[] = Object.values(BY_TYPE).flat();

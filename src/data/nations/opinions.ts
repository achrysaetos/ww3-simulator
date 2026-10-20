import { alliances } from './alliances';

/**
 * Government-level opinion between pairs, -100 (hostile) .. 100 (allied), as of late 2025.
 * Values are estimates. They weigh state-to-state relations (treaties, sanctions, recalled
 * ambassadors, active conflict) over popular sentiment, and are cross-checked against Pew
 * Global Attitudes 2024-25, the ECFR 2025 global poll, and Gallup's 2025 country ratings
 * where those exist.
 *
 * Each row is [a, b, a's opinion of b, b's opinion of a]; the last value is omitted when
 * the pair is symmetric.
 */
type Row = [string, string, number, number?];

const PAIRS: Row[] = [
  // --- great powers
  ['USA', 'RUS', -75, -80],
  ['USA', 'CHN', -55, -50],
  ['RUS', 'CHN', 60, 45], // "no limits" partnership (Feb 2022); Beijing keeps distance on arms
  ['USA', 'GBR', 85],
  ['USA', 'FRA', 65],
  ['USA', 'DEU', 65],
  ['USA', 'JPN', 80],
  ['USA', 'KOR', 75],
  ['USA', 'AUS', 85],
  ['USA', 'CAN', 55, 45], // 2025 tariff dispute and annexation rhetoric
  ['USA', 'IND', 35, 30],
  ['USA', 'PAK', 10, 5],
  ['USA', 'TWN', 60, 80],
  ['USA', 'ISR', 80, 85],
  ['USA', 'IRN', -85, -90],
  ['USA', 'PRK', -85, -95],
  ['USA', 'UKR', 40, 55],
  ['USA', 'POL', 70, 80],
  ['USA', 'PHL', 65, 70],
  ['USA', 'SAU', 45],
  ['USA', 'ARE', 50],
  ['USA', 'QAT', 45],
  ['USA', 'EGY', 30],
  ['USA', 'TUR', 20, 10],
  ['USA', 'MEX', 15, 10],
  ['USA', 'BRA', 0, -5],
  ['USA', 'VEN', -60, -70],
  ['USA', 'CUB', -55, -70],
  ['USA', 'NIC', -45, -55],
  ['USA', 'SYR', -10, -10], // sanctions lifted mid-2025 after Assad's fall
  ['USA', 'VNM', 30, 25],
  ['USA', 'SGP', 55],
  ['USA', 'NZL', 50],
  ['USA', 'BLR', -55, -60],
  ['USA', 'ZAF', -20, -15],
  ['CHN', 'GBR', -30, -30],
  ['CHN', 'FRA', -15, -20],
  ['CHN', 'DEU', -10, -15],
  ['CHN', 'JPN', -55, -55],
  ['CHN', 'KOR', -25, -30],
  ['CHN', 'AUS', -35, -40],
  ['CHN', 'IND', -45, -50], // Galwan 2020; partial thaw 2024-25
  ['CHN', 'PAK', 75, 80],
  ['CHN', 'TWN', -70, -65],
  ['CHN', 'PHL', -60, -60],
  ['CHN', 'VNM', -10, -25],
  ['CHN', 'PRK', 40, 30],
  ['CHN', 'IRN', 35, 45],
  ['CHN', 'SAU', 35],
  ['CHN', 'BRA', 35],
  ['CHN', 'ZAF', 40],
  ['CHN', 'KHM', 65, 70],
  ['CHN', 'LAO', 55, 50],
  ['CHN', 'MMR', 35, 30],
  ['CHN', 'MNG', 10, 0],
  ['CHN', 'KAZ', 35],
  ['CHN', 'BLR', 45],
  ['CHN', 'UKR', -10, -15],
  ['CHN', 'LTU', -45, -40],
  ['CHN', 'BGD', 30],
  ['CHN', 'LKA', 30],
  ['CHN', 'IDN', 25],
  ['CHN', 'MYS', 25],
  ['CHN', 'SRB', 50],
  ['CHN', 'HUN', 35],
  ['RUS', 'UKR', -95, -100],
  ['RUS', 'GBR', -80, -80],
  ['RUS', 'FRA', -70, -70],
  ['RUS', 'DEU', -65, -65],
  ['RUS', 'POL', -80, -90],
  ['RUS', 'EST', -80, -85],
  ['RUS', 'LVA', -80, -85],
  ['RUS', 'LTU', -80, -85],
  ['RUS', 'FIN', -65, -75],
  ['RUS', 'SWE', -65, -70],
  ['RUS', 'NOR', -55, -60],
  ['RUS', 'DNK', -55, -60],
  ['RUS', 'CZE', -60, -65],
  ['RUS', 'ROU', -60, -65],
  ['RUS', 'MDA', -55, -60],
  ['RUS', 'GEO', -35, -40],
  ['RUS', 'HUN', 20, 10],
  ['RUS', 'SVK', 10, 5],
  ['RUS', 'SRB', 50, 45],
  ['RUS', 'TUR', 10, 5],
  ['RUS', 'JPN', -55, -60],
  ['RUS', 'KOR', -35, -40],
  ['RUS', 'AUS', -55, -60],
  ['RUS', 'CAN', -60, -70],
  ['RUS', 'IND', 55, 45],
  ['RUS', 'IRN', 50, 45],
  ['RUS', 'PRK', 65, 70],
  ['RUS', 'BLR', 80, 75],
  ['RUS', 'KAZ', 40, 30],
  ['RUS', 'KGZ', 50, 45],
  ['RUS', 'TJK', 45, 40],
  ['RUS', 'UZB', 35, 30],
  ['RUS', 'TKM', 25],
  ['RUS', 'ARM', 0, -25], // Armenia froze CSTO participation after 2023 Karabakh loss
  ['RUS', 'AZE', 5, -20], // AZAL crash Dec 2024 and 2025 arrests
  ['RUS', 'SYR', -15, -25], // Russia sheltered Assad; transitional government keeps bases under review
  ['RUS', 'CUB', 45, 50],
  ['RUS', 'VEN', 50, 50],
  ['RUS', 'NIC', 45, 50],
  ['RUS', 'MLI', 40, 50], // Africa Corps
  ['RUS', 'BFA', 40, 45],
  ['RUS', 'NER', 35, 40],
  ['RUS', 'CAF', 40, 50],
  ['RUS', 'EGY', 20],
  ['RUS', 'SAU', 25],
  ['RUS', 'ARE', 30],
  ['RUS', 'ISR', 0, -15],
  ['RUS', 'BRA', 20],
  ['RUS', 'ZAF', 30],
  ['RUS', 'VNM', 30],
  ['RUS', 'MNG', 30],
  ['RUS', 'SGP', -15],
  // --- Europe
  ['GBR', 'FRA', 60],
  ['GBR', 'DEU', 60],
  ['FRA', 'DEU', 70],
  ['DEU', 'POL', 45, 25],
  ['POL', 'UKR', 50, 45],
  ['GBR', 'UKR', 70, 80],
  ['FRA', 'UKR', 60, 70],
  ['DEU', 'UKR', 55, 60],
  ['UKR', 'HUN', -25, -30],
  ['UKR', 'BLR', -70, -60],
  ['UKR', 'MDA', 45],
  ['UKR', 'EST', 75],
  ['UKR', 'LTU', 75],
  ['UKR', 'LVA', 75],
  ['UKR', 'FIN', 60],
  ['UKR', 'SWE', 60],
  ['UKR', 'CAN', 65],
  ['UKR', 'TUR', 25],
  ['UKR', 'IRN', -60, -40],
  ['UKR', 'PRK', -70, -70],
  ['POL', 'BLR', -60, -60],
  ['LTU', 'BLR', -60, -60],
  ['LVA', 'BLR', -55, -55],
  ['GRC', 'TUR', -30, -30],
  ['GRC', 'CYP', 85],
  ['TUR', 'CYP', -50, -60],
  ['FRA', 'TUR', 5], // strained over Syria, Libya and the 2020 naval incident
  ['SRB', 'XKX', -75, -75],
  ['SRB', 'HRV', -20, -20],
  ['SRB', 'BIH', 0, -10],
  ['HUN', 'SVK', 30],
  ['FIN', 'SWE', 85],
  ['NOR', 'SWE', 80],
  ['DNK', 'SWE', 80],
  ['EST', 'FIN', 80],
  ['POL', 'LTU', 75],
  ['ARM', 'AZE', -80, -85],
  ['TUR', 'ARM', -35, -45], // normalization talks since 2022, border still closed
  ['TUR', 'AZE', 85, 90],
  ['GEO', 'AZE', 30],
  ['GEO', 'ARM', 25],
  ['IRN', 'AZE', -25, -30],
  ['IRN', 'ARM', 30, 25],
  ['FRA', 'ARM', 40, 50],
  ['FRA', 'ARE', 55],
  ['ISR', 'AZE', 55, 50],
  // --- Middle East
  ['ISR', 'IRN', -95, -100],
  ['ISR', 'SYR', -50, -55],
  ['ISR', 'LBN', -60, -70],
  ['ISR', 'PSE', -80, -85],
  ['ISR', 'EGY', 15, 0],
  ['ISR', 'JOR', 15, -15],
  ['ISR', 'ARE', 30, 15], // Abraham Accords, strained by Gaza
  ['ISR', 'BHR', 25, 10],
  ['ISR', 'MAR', 25, 5],
  ['ISR', 'SAU', 10, -20],
  ['ISR', 'TUR', -45, -55],
  ['ISR', 'QAT', -30, -35], // Israeli strike in Doha, Sep 2025
  ['ISR', 'YEM', -70, -85], // Houthi missile and drone campaign
  ['ISR', 'IRQ', -40, -50],
  ['ISR', 'IND', 50, 45],
  ['ISR', 'GBR', 25, 0],
  ['ISR', 'FRA', 10, -10],
  ['ISR', 'DEU', 50, 30],
  ['ISR', 'ZAF', -55, -60], // ICJ genocide case
  ['SAU', 'IRN', -25, -25], // Beijing-brokered restoration Mar 2023
  ['SAU', 'ARE', 50],
  ['SAU', 'QAT', 25],
  ['SAU', 'EGY', 55],
  ['SAU', 'PAK', 70, 75],
  ['SAU', 'YEM', -55, -70],
  ['SAU', 'TUR', 25],
  ['SAU', 'SYR', 40],
  ['SAU', 'IND', 35],
  ['ARE', 'IRN', -20, -20],
  ['ARE', 'QAT', 15],
  ['ARE', 'EGY', 50],
  ['ARE', 'SDN', -40, -50], // UAE backs the RSF
  ['QAT', 'TUR', 70],
  ['QAT', 'IRN', 20],
  ['IRN', 'IRQ', 40, 30],
  ['IRN', 'SYR', -40, -45], // Assad's fall ended Iran's land bridge
  ['IRN', 'LBN', 15, 0],
  ['IRN', 'YEM', 55, 60], // Houthi-controlled Sana'a
  ['IRN', 'PAK', -10, -10],
  ['IRN', 'AFG', -15, -10],
  ['IRN', 'GBR', -60, -60],
  ['IRN', 'FRA', -55, -55],
  ['IRN', 'DEU', -50, -50],
  ['IRN', 'TUR', 5],
  ['IRN', 'EGY', 0],
  ['IRN', 'VEN', 40],
  ['TUR', 'SYR', 45, 40],
  ['TUR', 'IRQ', 10],
  ['TUR', 'EGY', 20],
  ['EGY', 'ETH', -45, -40], // GERD dispute
  ['EGY', 'SDN', 40],
  ['EGY', 'LBY', 20],
  ['EGY', 'QAT', 20],
  ['EGY', 'PSE', 35],
  ['JOR', 'PSE', 40],
  ['DZA', 'MAR', -60, -55],
  ['DZA', 'FRA', -30, -20],
  ['DZA', 'MLI', -40, -50],
  ['IRQ', 'SYR', 0],
  ['KWT', 'IRQ', 10, 10],
  // --- South and Central Asia
  ['IND', 'PAK', -85, -85], // Operation Sindoor, May 2025
  ['IND', 'BGD', 10, -10],
  ['IND', 'NPL', 30],
  ['IND', 'BTN', 80],
  ['IND', 'LKA', 30],
  ['IND', 'MDV', 10],
  ['IND', 'AFG', 10],
  ['IND', 'JPN', 60],
  ['IND', 'AUS', 50],
  ['IND', 'FRA', 60],
  ['IND', 'GBR', 40],
  ['IND', 'IRN', 25],
  ['IND', 'ARE', 55],
  ['IND', 'CAN', -25, -25], // Nijjar affair, partial reset 2025
  ['IND', 'TUR', -25, -10],
  ['PAK', 'AFG', -50, -50], // Oct 2025 border clashes
  ['PAK', 'TUR', 70],
  ['PAK', 'AZE', 55],
  ['PAK', 'BGD', 25],
  ['AFG', 'TJK', -30, -30],
  ['KAZ', 'UZB', 40],
  ['KGZ', 'TJK', -20, -20], // border war 2022; March 2025 border treaty
  // --- East Asia and Pacific
  ['KOR', 'PRK', -70, -95],
  ['JPN', 'PRK', -75, -85],
  ['JPN', 'KOR', 35, 20],
  ['JPN', 'TWN', 55, 60],
  ['JPN', 'AUS', 70],
  ['JPN', 'PHL', 60, 65],
  ['JPN', 'GBR', 55],
  ['JPN', 'VNM', 40],
  ['AUS', 'NZL', 85],
  ['AUS', 'GBR', 75],
  ['AUS', 'IDN', 35],
  ['AUS', 'PNG', 60, 55], // Pukpuk mutual defence treaty signed Oct 2025
  ['AUS', 'SLB', 10, 0],
  ['AUS', 'FJI', 45],
  ['TWN', 'PHL', 30],
  ['PHL', 'VNM', 20],
  ['KOR', 'TWN', 15],
  ['VNM', 'KHM', 15],
  ['THA', 'KHM', -40, -45], // July 2025 border fighting
  ['THA', 'MMR', 0],
  ['IDN', 'MYS', 40],
  ['MYS', 'SGP', 45],
  ['PRK', 'IRN', 30],
  ['PRK', 'SYR', -10],
  // --- Americas
  ['CAN', 'GBR', 70],
  ['CAN', 'FRA', 60],
  ['MEX', 'CAN', 35],
  ['BRA', 'ARG', 10, 5],
  ['VEN', 'GUY', -55, -60], // Essequibo claim, 2023 referendum
  ['VEN', 'COL', 0, -15],
  ['VEN', 'CUB', 70],
  ['CUB', 'NIC', 55],
  ['ARG', 'GBR', -25, -10], // Falklands claim
  ['CHL', 'BOL', -20, -20],
  ['PER', 'CHL', 10],
  ['COL', 'ECU', 10],
  // --- Africa
  ['ETH', 'ERI', -50, -55],
  ['ETH', 'SOM', -20, -30],
  ['SDN', 'SSD', -10, -10],
  ['SDN', 'TCD', -25, -30],
  ['RWA', 'COD', -60, -70], // M23 offensive Jan 2025; Washington accord Jun 2025
  ['RWA', 'BDI', -40, -40],
  ['NGA', 'NER', -10, -15],
  ['MLI', 'FRA', -55, -45],
  ['BFA', 'FRA', -50, -40],
  ['NER', 'FRA', -55, -45],
  ['MLI', 'BFA', 70],
  ['MLI', 'NER', 70],
  ['BFA', 'NER', 70],
  ['MAR', 'FRA', 45],
  ['KEN', 'SOM', 10],
  ['ZAF', 'ZWE', 30],
];

/**
 * Baseline opinion between co-members of a security alliance, before PAIRS overrides it.
 * Calibrated so treaty allies land in the 40-60 band Pew and ECFR polls show for
 * established partners; rivalries inside an alliance (GRC-TUR) are listed in PAIRS.
 */
const ALLIANCE_AFFINITY: Record<string, number> = {
  NATO: 50,
  EU: 45,
  CSTO: 35,
  GCC: 35,
  'Five Eyes': 60,
  'US-COFA': 65,
  FPDA: 35,
  'Rio Treaty': 15,
  ASEAN: 20,
  AU: 10,
  'Arab League': 10,
};

function build(): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  const set = (a: string, b: string, v: number) => ((out[a] ??= {})[b] = v);
  for (const al of alliances) {
    const v = ALLIANCE_AFFINITY[al.id];
    if (v === undefined) continue;
    for (const a of al.members) for (const b of al.members) if (a !== b) set(a, b, Math.max(out[a]?.[b] ?? -100, v));
  }
  for (const [a, b, ab, ba] of PAIRS) {
    set(a, b, ab);
    set(b, a, ba ?? ab);
  }
  return out;
}

/** Directed opinions: opinions[a][b] is a's opinion of b. */
export const opinions = build();

/** Exposed for tests: every pair the table names explicitly. */
export const opinionPairs: readonly Row[] = PAIRS;

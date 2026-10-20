/**
 * Values the World Bank API does not publish (Taiwan is absent; several
 * militarized states lack recent GDP/military series). Figures are rounded
 * public estimates (IMF, SIPRI, IISS Military Balance press summaries).
 */
export const MANUAL_STATS: Record<string, { name?: string; [k: string]: number | string | undefined }> = {
  TWN: { name: 'Taiwan', gdp: 7.9e11, gdpPpp: 1.8e12, population: 23.4e6, milexUsd: 1.9e10, milexPctGdp: 2.4, armedForces: 169_000, manufacturing: 2.6e11, exportsPctGdp: 62, importsPctGdp: 52, energyImportPct: 97, urbanPct: 80, workingAgePct: 69, highTechExportsUsd: 2.6e11, railKm: 1_600 },
  PRK: { name: 'North Korea', gdp: 2.8e10, gdpPpp: 4e10, milexUsd: 4e9, milexPctGdp: 15, armedForces: 1_280_000, manufacturing: 6e9, exportsPctGdp: 1, importsPctGdp: 8, energyImportPct: 20 },
  CUB: { gdp: 1.07e11, milexUsd: 1.5e9 },
  VEN: { gdp: 9.2e10, milexUsd: 7e8, manufacturing: 9e9 },
  SYR: { gdp: 2.0e10, milexUsd: 1.8e9 },
  ERI: { gdp: 2.3e9, milexUsd: 1e8 },
  AFG: { gdp: 1.4e10 },
  YEM: { gdp: 2.1e10, milexUsd: 1.5e9 },
  IRN: { milexUsd: 1.03e10 },
  XKX: { name: 'Kosovo' },
  PSE: { name: 'Palestine' },
  RUS: { milexUsd: 1.09e11, milexPctGdp: 5.9 },
  UKR: { milexUsd: 6.5e10, milexPctGdp: 34, armedForces: 900_000 },
  ISR: { milexUsd: 4.6e10, milexPctGdp: 8.8 },
};

/** Dependent territories are fought over by the sovereign state that defends them. */
export const SOVEREIGN_OF: Record<string, string> = {
  GRL: 'DNK', FRO: 'DNK', PRI: 'USA', GUM: 'USA', VIR: 'USA', ASM: 'USA', MNP: 'USA', UMI: 'USA',
  NCL: 'FRA', ATF: 'FRA', PYF: 'FRA', SPM: 'FRA', WLF: 'FRA', BLM: 'FRA', MAF: 'FRA', GUF: 'FRA',
  FLK: 'GBR', BMU: 'GBR', CYM: 'GBR', TCA: 'GBR', VGB: 'GBR', AIA: 'GBR', MSR: 'GBR', SHN: 'GBR',
  IOT: 'GBR', SGS: 'GBR', PCN: 'GBR', GGY: 'GBR', JEY: 'GBR', IMN: 'GBR',
  ABW: 'NLD', CUW: 'NLD', SXM: 'NLD', ALA: 'FIN', NFK: 'AUS', HMD: 'AUS', COK: 'NZL', NIU: 'NZL',
  HKG: 'CHN', MAC: 'CHN', ESH: 'MAR',
};

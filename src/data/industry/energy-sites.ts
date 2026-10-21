import type { NationId } from '../../core/types';

/**
 * A facility a large share of a nation's energy exports passes through, so wrecking it cuts them
 * far beyond its cell's share of population. `share` is the share of the nation's exports lost
 * while it is down. Facilities in series (field, processing, terminal) each take their share of
 * what is left. A site offshore or on an island resolves to the nearest of the nation's land cells,
 * the shore end of its pipelines. Ras Tanura is left out: it loads crude Abqaiq has processed and
 * shares its one-degree cell.
 */
export interface EnergyExportSite {
  name: string;
  nation: NationId;
  lat: number;
  lon: number;
  share: number;
}

// param: tag=estimated range=[0.3,0.9] source=EIA Today in Energy 2019-09; EIA Iran and Saudi Arabia country analyses
export const ENERGY_EXPORT_SITES: readonly EnergyExportSite[] = [
  // The September 2019 strike on Abqaiq stopped 5.7 mb/d, about 58% of Saudi crude output (EIA, Sept. 2019).
  { name: 'Abqaiq', nation: 'SAU' as NationId, lat: 25.94, lon: 49.68, share: 0.58 },
  // Ghawar, about 3.8 mb/d of ~10 mb/d (Saudi Aramco bond prospectus 2019, cited by EIA).
  { name: 'Ghawar', nation: 'SAU' as NationId, lat: 25.0, lon: 49.3, share: 0.38 },
  // Kharg Island handles about 90% of Iran's crude exports (EIA Iran country analysis).
  { name: 'Kharg Island', nation: 'IRN' as NationId, lat: 29.24, lon: 50.31, share: 0.9 },
  // Ras Laffan liquefies all of Qatar's LNG (EIA Qatar country analysis).
  { name: 'Ras Laffan', nation: 'QAT' as NationId, lat: 25.91, lon: 51.55, share: 0.8 },
  // Basra's offshore terminals carry about 85% of Iraq's crude exports; Kirkuk-Ceyhan the rest (EIA Iraq).
  { name: 'Basra oil terminal', nation: 'IRQ' as NationId, lat: 29.68, lon: 48.81, share: 0.85 },
];

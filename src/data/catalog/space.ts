/**
 * Military satellites and co-orbital counter-space systems. Unit cost includes
 * launch where the source quotes it. Classified constellations (KH-11, Yaogan,
 * Persona) are priced from open estimates and marked as such. Ground-launched
 * ASAT interceptors are in strategic.ts.
 */
import { toPlatform, type PlatformSpec } from './build';
import type { MunitionKey } from './munitions';

const satellites: PlatformSpec<MunitionKey>[] = [
  { id: 'gps3', name: 'GPS III', cls: 'nav_satellite', producers: ['USA'], inService: 2018, unitCostUsdM: 500 },
  { id: 'glonass_k2', name: 'GLONASS-K2', cls: 'nav_satellite', producers: ['RUS'], inService: 2023, unitCostUsdM: 100 },
  { id: 'beidou3', name: 'BeiDou-3', cls: 'nav_satellite', producers: ['CHN'], inService: 2018, unitCostUsdM: 100 },
  { id: 'galileo', name: 'Galileo FOC', cls: 'nav_satellite', producers: ['DEU', 'ITA', 'FRA'], inService: 2016, unitCostUsdM: 100 },
  { id: 'kh11', name: 'KH-11 Evolved Enhanced CRYSTAL (est.)', cls: 'recon_satellite', producers: ['USA'], inService: 2005, unitCostUsdM: 3000, detectionKm: 300 },
  { id: 'us_sar_sat', name: 'US radar imaging satellite (Topaz, est.)', cls: 'recon_satellite', producers: ['USA'], inService: 2010, unitCostUsdM: 1000, detectionKm: 500 },
  { id: 'sbirs_geo', name: 'SBIRS GEO / Next-Gen OPIR', cls: 'recon_satellite', producers: ['USA'], inService: 2011, unitCostUsdM: 1500, detectionKm: 10000 },
  { id: 'sda_tracking', name: 'SDA Tranche 1 Tracking Layer', cls: 'recon_satellite', producers: ['USA'], inService: 2025, unitCostUsdM: 40, speedKph: 27000, detectionKm: 2000 },
  { id: 'persona', name: 'Persona / Bars-M (est.)', cls: 'recon_satellite', producers: ['RUS'], inService: 2008, unitCostUsdM: 150, detectionKm: 300 },
  { id: 'tundra_eks', name: 'Tundra (EKS Kupol) early warning', cls: 'recon_satellite', producers: ['RUS'], inService: 2015, unitCostUsdM: 200, speedKph: 11000, detectionKm: 10000 },
  { id: 'yaogan_elint', name: 'Yaogan ELINT triplet (est.)', cls: 'recon_satellite', producers: ['CHN'], inService: 2017, unitCostUsdM: 50, detectionKm: 1500 },
  { id: 'yaogan_sar', name: 'Yaogan SAR/optical (est.)', cls: 'recon_satellite', producers: ['CHN'], inService: 2015, unitCostUsdM: 100, detectionKm: 500 },
  { id: 'ofek16', name: 'Ofek-16', cls: 'recon_satellite', producers: ['ISR'], inService: 2020, unitCostUsdM: 100, detectionKm: 200 },
  { id: 'aehf', name: 'AEHF', cls: 'comms_satellite', producers: ['USA'], inService: 2010, unitCostUsdM: 1500 },
  { id: 'wgs', name: 'WGS', cls: 'comms_satellite', producers: ['USA'], inService: 2007, unitCostUsdM: 440 },
  // Starlink/Starshield: ~$0.5-1M per satellite; Ukraine's front-line comms depend on it.
  { id: 'starshield', name: 'Starlink / Starshield LEO', cls: 'comms_satellite', producers: ['USA'], inService: 2023, unitCostUsdM: 1, speedKph: 27000 },
  { id: 'sda_transport', name: 'SDA Tranche 1 Transport Layer', cls: 'comms_satellite', producers: ['USA'], inService: 2024, unitCostUsdM: 15, speedKph: 27000 },
  { id: 'meridian', name: 'Meridian', cls: 'comms_satellite', producers: ['RUS'], inService: 2006, unitCostUsdM: 100 },
  { id: 'tianlian', name: 'Tianlian relay', cls: 'comms_satellite', producers: ['CHN'], inService: 2008, unitCostUsdM: 100 },
  { id: 'skynet5', name: 'Skynet 5', cls: 'comms_satellite', producers: ['GBR'], inService: 2007, unitCostUsdM: 500 },
  { id: 'syracuse4', name: 'Syracuse IV', cls: 'comms_satellite', producers: ['FRA'], inService: 2021, unitCostUsdM: 500 },
  // Kosmos-2543 released a projectile in orbit in 2020 (US Space Command); fp is its kill rate on satellites, mapped to missile.
  { id: 'nivelir', name: 'Nivelir co-orbital inspector/ASAT', cls: 'asat', producers: ['RUS'], inService: 2019, unitCostUsdM: 100, crew: 0, speedKph: 27000, rangeKm: 0, fuelTph: 0, armor: 0, stealth: 0.3, fp: { missile: 0.01 } },
  { id: 'shijian21', name: 'Shijian-21 GEO tug', cls: 'asat', producers: ['CHN'], inService: 2021, unitCostUsdM: 150, crew: 0, speedKph: 11000, rangeKm: 0, fuelTph: 0, armor: 0, stealth: 0.2, fp: { missile: 0.005 } },
];

export const spacePlatforms = satellites.map(toPlatform);

/**
 * Altitude, km, a direct-ascent interceptor must reach to engage each satellite type: LEO imagers
 * and proliferated layers 500-1,100 km, navigation constellations in MEO at 19,100-23,200 km, relay
 * and early-warning satellites at GEO (35,786 km) or a Molniya/Tundra apogee near 39,000 km (UCS
 * Satellite Database orbits; SWF "Global Counterspace Capabilities" 2025).
 */
export const ORBIT_KM: Readonly<Record<string, number>> = {
  gps3: 20200, glonass_k2: 19100, beidou3: 21500, galileo: 23200,
  kh11: 600, us_sar_sat: 1100, sbirs_geo: 35786, sda_tracking: 1000, persona: 700, tundra_eks: 39000,
  yaogan_elint: 1100, yaogan_sar: 700, ofek16: 600,
  aehf: 35786, wgs: 35786, starshield: 550, sda_transport: 1000, meridian: 39000, tianlian: 35786, skynet5: 35786, syracuse4: 35786,
  nivelir: 600, shijian21: 35786,
};

/**
 * Submarines and large uncrewed undersea vehicles.
 *
 * stealth encodes acoustic quietness, ordered per ONI and open estimates:
 * Seawolf/Virginia/Columbia (~0.95+) > Astute, Yasen-M, Suffren > modern AIP
 * SSKs on battery (~0.9) > Improved Kilo > Type 093B > Type 094 (~0.7, "noisy"
 * per ONI 2015) > older Soviet and Chinese boats.
 *
 * SSK speedKph is a submerged sustained transit; AIP and snorting limit it.
 */
import { toPlatform, type PlatformSpec } from './build';
import type { MunitionKey } from './munitions';

const attack: PlatformSpec<MunitionKey>[] = [
  // Virginia Block IV: two boats per year at ~$7B (FY2024 SCN).
  { id: 'virginia', name: 'Virginia-class SSN (Block IV)', cls: 'ssn', crew: 135, producers: ['USA'], inService: 2020, unitCostUsdM: 3400, stealth: 0.95, detectionKm: 80, q: 1.3, load: { mk48: 25, tomahawk: 12 } },
  { id: 'seawolf', name: 'Seawolf-class SSN', cls: 'ssn', crew: 140, producers: [], inService: 1997, unitCostUsdM: 5000, speedKph: 45, stealth: 0.97, detectionKm: 90, q: 1.35, load: { mk48: 50 } },
  { id: 'los_angeles', name: 'Los Angeles-class SSN (688i)', cls: 'ssn', producers: [], inService: 1985, unitCostUsdM: 1500, stealth: 0.85, detectionKm: 60, q: 1.1, load: { mk48: 26, tomahawk: 12 } },
  { id: 'astute', name: 'Astute-class SSN', cls: 'ssn', crew: 98, producers: ['GBR'], inService: 2010, unitCostUsdM: 2100, stealth: 0.95, detectionKm: 80, q: 1.3, load: { spearfish: 26, tomahawk: 12 } },
  { id: 'suffren', name: 'Suffren-class SSN (Barracuda)', cls: 'ssn', crew: 65, producers: ['FRA'], inService: 2020, unitCostUsdM: 1800, stealth: 0.9, detectionKm: 70, q: 1.25, load: { f21: 16, mdcn: 4, exocet: 4 } },
  { id: 'akula', name: 'Akula-class SSN (971)', cls: 'ssn', crew: 73, producers: [], inService: 1986, unitCostUsdM: 1500, stealth: 0.85, detectionKm: 60, q: 1.0, load: { type53: 28, kalibr: 4 } },
  { id: 'type093b', name: 'Type 093B Shang III SSN', cls: 'ssn', crew: 100, producers: ['CHN'], inService: 2020, unitCostUsdM: 1200, stealth: 0.8, detectionKm: 50, q: 1.0, load: { yu6: 24, yj18: 12 } },
  { id: 'yasen_m', name: 'Yasen-M SSGN (885M)', cls: 'ssgn', crew: 64, producers: ['RUS'], inService: 2021, unitCostUsdM: 1600, stealth: 0.92, detectionKm: 70, q: 1.2, load: { kalibr: 16, oniks: 8, zircon: 8, futlyar: 30 } },
  { id: 'oscar2', name: 'Oscar II SSGN (949A Antey)', cls: 'ssgn', crew: 107, producers: [], inService: 1986, unitCostUsdM: 2000, speedKph: 40, stealth: 0.75, detectionKm: 60, q: 0.9, load: { p700: 24, type53: 24 } },
  { id: 'ohio_ssgn', name: 'Ohio-class SSGN', cls: 'ssgn', crew: 159, producers: [], inService: 2008, unitCostUsdM: 2000, stealth: 0.93, detectionKm: 60, q: 1.1, load: { tomahawk: 154, mk48: 20 } },
  // Belgorod (09852): special-mission boat carrying the Poseidon nuclear torpedo.
  { id: 'belgorod', name: 'Belgorod (Project 09852)', cls: 'ssgn', crew: 110, producers: ['RUS'], inService: 2022, unitCostUsdM: 1500, stealth: 0.85, detectionKm: 50, nuclear: true, load: { poseidon: 6, type53: 12 } },
];

const diesel: PlatformSpec<MunitionKey>[] = [
  { id: 'kilo636', name: 'Improved Kilo (636.3)', cls: 'ssk', crew: 52, producers: ['RUS'], inService: 2014, unitCostUsdM: 300, stealth: 0.88, q: 1.0, load: { type53: 18, kalibr: 4 } },
  { id: 'kilo877', name: 'Kilo (877EKM)', cls: 'ssk', crew: 52, producers: [], inService: 1980, unitCostUsdM: 200, stealth: 0.8, q: 0.8, load: { type53: 18 } },
  { id: 'type039c', name: 'Type 039A/B/C Yuan (AIP)', cls: 'ssk', crew: 58, producers: ['CHN'], inService: 2006, unitCostUsdM: 300, stealth: 0.88, q: 1.0, load: { yu6: 18, yj18: 4 } },
  { id: 'soryu', name: 'Soryu-class', cls: 'ssk', crew: 65, producers: ['JPN'], inService: 2009, unitCostUsdM: 600, stealth: 0.9, q: 1.2, load: { type89: 20, harpoon: 6 } },
  { id: 'taigei', name: 'Taigei-class', cls: 'ssk', crew: 70, producers: ['JPN'], inService: 2022, unitCostUsdM: 700, stealth: 0.92, q: 1.25, load: { type89: 20, harpoon: 4 } },
  { id: 'dosan_ahn_changho', name: 'Dosan Ahn Changho (KSS-III)', cls: 'ssk', crew: 50, producers: ['KOR'], inService: 2021, unitCostUsdM: 900, stealth: 0.88, q: 1.15, load: { baekeo: 16, hyunmoo4_4: 6 } },
  { id: 'type214', name: 'Type 214 (AIP)', cls: 'ssk', crew: 27, producers: ['DEU', 'KOR', 'TUR'], inService: 2007, unitCostUsdM: 500, stealth: 0.9, q: 1.1, load: { dm2a4: 16 } },
  { id: 'type212', name: 'Type 212A/CD (AIP)', cls: 'ssk', crew: 28, producers: ['DEU', 'ITA'], inService: 2005, unitCostUsdM: 500, stealth: 0.93, q: 1.15, load: { dm2a4: 12 } },
  { id: 'scorpene', name: 'Scorpene / Kalvari-class', cls: 'ssk', crew: 31, producers: ['FRA', 'IND', 'BRA'], inService: 2005, unitCostUsdM: 600, stealth: 0.88, q: 1.05, load: { f21: 16, exocet: 2 } },
  { id: 'collins', name: 'Collins-class', cls: 'ssk', crew: 58, producers: [], inService: 1996, unitCostUsdM: 800, stealth: 0.85, q: 1.05, load: { mk48: 22, harpoon: 4 } },
  { id: 'fateh_ssk', name: 'Fateh-class (Iran)', cls: 'ssk', crew: 30, producers: ['IRN'], inService: 2019, unitCostUsdM: 50, speedKph: 14, rangeKm: 5000, stealth: 0.75, q: 0.6, load: { valfajr: 4 } },
  // Ghadir midget subs: Iran operates ~20 in the Gulf (IISS).
  { id: 'ghadir', name: 'Ghadir-class midget submarine', cls: 'ssk', crew: 7, producers: ['IRN'], inService: 2007, unitCostUsdM: 15, speedKph: 14, rangeKm: 1000, stealth: 0.7, detectionKm: 15, q: 0.4, load: { valfajr: 2 } },
  { id: 'romeo', name: 'Romeo / Type 033', cls: 'ssk', crew: 54, producers: [], inService: 1958, unitCostUsdM: 20, speedKph: 13, rangeKm: 9000, stealth: 0.4, detectionKm: 25, q: 0.4, load: { type53: 14 } },
  { id: 'sang_o', name: 'Sang-O coastal submarine', cls: 'ssk', crew: 15, producers: ['PRK'], inService: 1991, unitCostUsdM: 10, speedKph: 13, rangeKm: 2700, stealth: 0.6, detectionKm: 15, q: 0.4, load: { type53: 4 } },
  // Yono-class midget: blamed for sinking ROKS Cheonan in 2010 (JIG report).
  { id: 'yono', name: 'Yono-class midget submarine', cls: 'ssk', crew: 4, producers: ['PRK', 'IRN'], inService: 1965, unitCostUsdM: 5, speedKph: 13, rangeKm: 550, stealth: 0.7, detectionKm: 10, q: 0.35, load: { type53: 2 } },
];

const ballistic: PlatformSpec<MunitionKey>[] = [
  // Columbia: lead boat delivery slipped ~12-18 months; first patrol ~2031 (CRS R41129).
  { id: 'columbia', name: 'Columbia-class SSBN', cls: 'ssbn', producers: ['USA'], inService: 2031, unitCostUsdM: 8000, stealth: 0.98, nuclear: true, load: { trident2_d5: 16, mk48: 12 } },
  { id: 'ohio_ssbn', name: 'Ohio-class SSBN', cls: 'ssbn', producers: [], inService: 1981, unitCostUsdM: 2000, stealth: 0.95, nuclear: true, load: { trident2_d5: 16, trident2_d5_w88: 2, trident2_d5_lo: 2, mk48: 12 } },
  { id: 'vanguard', name: 'Vanguard-class SSBN', cls: 'ssbn', crew: 135, producers: [], inService: 1993, unitCostUsdM: 2500, stealth: 0.93, nuclear: true, load: { trident2_d5: 8, spearfish: 12 } },
  { id: 'dreadnought', name: 'Dreadnought-class SSBN', cls: 'ssbn', crew: 130, producers: ['GBR'], inService: 2032, unitCostUsdM: 5000, stealth: 0.97, nuclear: true, load: { trident2_d5: 12, spearfish: 12 } },
  { id: 'triomphant', name: 'Triomphant-class SSBN', cls: 'ssbn', crew: 111, producers: ['FRA'], inService: 1997, unitCostUsdM: 3000, stealth: 0.93, nuclear: true, load: { m51: 16, f21: 12 } },
  { id: 'borei_a', name: 'Borei-A SSBN (955A)', cls: 'ssbn', crew: 130, producers: ['RUS'], inService: 2020, unitCostUsdM: 1000, stealth: 0.92, nuclear: true, load: { bulava: 16, futlyar: 12 } },
  { id: 'borei', name: 'Borei SSBN (955)', cls: 'ssbn', crew: 107, producers: [], inService: 2013, unitCostUsdM: 900, stealth: 0.9, nuclear: true, load: { bulava: 16, type53: 12 } },
  { id: 'delta4', name: 'Delta IV SSBN (667BDRM)', cls: 'ssbn', crew: 135, producers: [], inService: 1985, unitCostUsdM: 800, stealth: 0.8, nuclear: true, load: { sineva: 16, type53: 12 } },
  { id: 'type094a', name: 'Type 094A Jin SSBN', cls: 'ssbn', crew: 140, producers: ['CHN'], inService: 2015, unitCostUsdM: 1000, stealth: 0.7, nuclear: true, load: { jl3: 12, yu6: 8 } },
  // Type 096: construction under way; DoD expects it later this decade (service date an estimate).
  { id: 'type096', name: 'Type 096 Tang SSBN', cls: 'ssbn', crew: 150, producers: ['CHN'], inService: 2029, unitCostUsdM: 2000, stealth: 0.88, nuclear: true, load: { jl3: 16, yu6: 8 } },
  { id: 'arihant', name: 'Arihant-class SSBN', cls: 'ssbn', crew: 95, producers: ['IND'], inService: 2016, unitCostUsdM: 2900, speedKph: 30, stealth: 0.8, nuclear: true, load: { k15: 12, varunastra: 6 } },
];

const uuv: PlatformSpec<MunitionKey>[] = [
  { id: 'orca_xluuv', name: 'Orca XLUUV', cls: 'uuv', producers: ['USA'], inService: 2024, unitCostUsdM: 50, rangeKm: 10000, load: { sea_mine: 2 } },
  { id: 'hsu001', name: 'HSU-001 large UUV', cls: 'uuv', producers: ['CHN'], inService: 2019, unitCostUsdM: 20, rangeKm: 2000 },
];

export const subsurfacePlatforms = [...attack, ...diesel, ...ballistic, ...uuv].map(toPlatform);

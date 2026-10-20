/**
 * Armoured and soft-skinned land vehicles fielded in the orders of battle that
 * the base catalog lacked: older and export tanks, regional IFVs, APCs and
 * MRAPs, armoured cars and light tanks, and the generic truck.
 *
 * Rows follow the calibration at the top of ../land.ts. Armor and `q` are set
 * relative to existing anchors rather than measured: an unmodernised 1960s
 * 105 mm tank sits between T-55 (armor 0.25, q 0.35) and M60A3 (0.35, 0.5);
 * a 1980s export composite-armor tank near T-72M1 (0.45, 0.6). Wheeled armoured
 * cars and light tanks use the recon class with an anti-armor override, the way
 * ../land.ts treats Centauro II and Type 16 MCV. Costs are approximate unit
 * prices or, for out-of-production types, surplus/upgrade values (estimate).
 */
import type { Munition, Platform } from '../../../core/types';
import { defineMunitions, toMunition, toPlatform, type PlatformSpec } from '../build';
import type { MunitionKey } from '../munitions';

const specs = defineMunitions([
  { id: 'round_20mm', name: '20 mm autocannon (burst of 10)', kind: 'shell', producers: ['DEU', 'FRA', 'SRB', 'ZAF', 'CHE', 'ARG'], rangeKm: 2, speedMach: 3, warheadKg: 0.1, cepM: 3, pk: { infantry: 0.1, soft: 0.2, armor: 0.008, helicopter: 0.1 }, interceptDifficulty: 1, unitCostUsdM: 0.0005, weightKg: 3 },
  // Low-pressure 90 mm (Cockerill Mk III, GIAT F1) and the M36 tank gun: HEAT defeats light armor but not a modern MBT frontally.
  { id: 'round_90mm', name: '90 mm gun round (HEAT/HE: Cockerill Mk III / GIAT F1 / M36)', kind: 'shell', producers: ['BEL', 'FRA', 'BRA', 'ZAF'], rangeKm: 1.5, speedMach: 2, warheadKg: 1, cepM: 2, pk: { armor: 0.2, soft: 0.6, infantry: 0.2, structure: 0.15 }, interceptDifficulty: 1, unitCostUsdM: 0.002, weightKg: 10 },
] as const);

type Key = MunitionKey | (typeof specs)[number]['id'];

const tanks: PlatformSpec<Key>[] = [
  // Export M1A1 lacks the US depleted-uranium armor package. Egypt's Factory 200 co-produced ~1,360 from 1992 (CRS RL33003).
  { id: 'm1a1', name: 'M1A1 Abrams (export, non-DU armor)', cls: 'mbt', producers: ['EGY'], inService: 1992, unitCostUsdM: 4.5, speedKph: 45, rangeKm: 426, fuelTph: 0.22, armor: 0.7, q: 0.95, load: { apfsds_120: 26, he_120: 14 } },
  // M1A2S (Saudi) and M1A2T (Taiwan, delivered from 2024) are SEPv2-standard export builds.
  { id: 'm1a2', name: 'M1A2 Abrams (export: M1A2S / M1A2T)', cls: 'mbt', producers: ['USA'], inService: 2016, unitCostUsdM: 8.5, speedKph: 45, rangeKm: 426, fuelTph: 0.22, armor: 0.8, q: 1.15, load: { apfsds_120: 26, he_120: 16 } },
  { id: 'k1', name: 'K1 (105 mm)', cls: 'mbt', producers: [], inService: 1987, unitCostUsdM: 2.5, speedKph: 45, rangeKm: 450, fuelTph: 0.16, armor: 0.55, q: 0.75, load: { apfsds_105: 47 } },
  { id: 'm48a5', name: 'M48A5 / M48A5T2 Patton (105 mm)', cls: 'mbt', producers: [], inService: 1975, unitCostUsdM: 0.5, speedKph: 45, rangeKm: 500, fuelTph: 0.15, armor: 0.3, q: 0.45, load: { apfsds_105: 54 } },
  { id: 'm60a1', name: 'M60A1 (105 mm)', cls: 'mbt', producers: [], inService: 1962, unitCostUsdM: 0.6, rangeKm: 480, fuelTph: 0.15, armor: 0.32, q: 0.42, load: { apfsds_105: 63 } },
  { id: 'cm11', name: 'CM-11 Brave Tiger', cls: 'mbt', producers: [], inService: 1990, unitCostUsdM: 2, speedKph: 45, rangeKm: 480, fuelTph: 0.15, armor: 0.35, q: 0.55, load: { apfsds_105: 50 } },
  { id: 'leopard1', name: 'Leopard 1A3/1A4 / 1T Volkan', cls: 'mbt', producers: [], inService: 1974, unitCostUsdM: 0.8, speedKph: 50, rangeKm: 600, fuelTph: 0.14, armor: 0.25, q: 0.5, load: { apfsds_105: 55 } },
  // 1A5 adds the EMES 18 thermal fire-control system; armor is unchanged.
  { id: 'leopard1a5', name: 'Leopard 1A5', cls: 'mbt', producers: [], inService: 1987, unitCostUsdM: 1, speedKph: 50, rangeKm: 600, fuelTph: 0.14, armor: 0.28, q: 0.6, load: { apfsds_105: 55 } },
  { id: 'tam', name: 'TAM medium tank', cls: 'mbt', producers: [], inService: 1983, unitCostUsdM: 1, speedKph: 55, rangeKm: 590, fuelTph: 0.12, armor: 0.2, q: 0.5, load: { apfsds_105: 50 } },
  { id: 'amx30', name: 'AMX-30B2 / AMX-30S', cls: 'mbt', producers: [], inService: 1982, unitCostUsdM: 0.8, speedKph: 50, rangeKm: 450, fuelTph: 0.17, armor: 0.25, q: 0.5, load: { apfsds_105: 47 } },
  { id: 'vickers_mk3', name: 'Vickers Mk 3', cls: 'mbt', producers: [], inService: 1980, unitCostUsdM: 0.6, rangeKm: 530, fuelTph: 0.13, armor: 0.25, q: 0.42, load: { apfsds_105: 50 } },
  { id: 'olifant2', name: 'Olifant Mk 2 (Centurion upgrade)', cls: 'mbt', producers: [], inService: 2007, unitCostUsdM: 1.5, rangeKm: 350, fuelTph: 0.17, armor: 0.4, q: 0.6, load: { apfsds_105: 64 } },
  { id: 'ramses2', name: 'Ramses II (T-54 upgrade, 105 mm)', cls: 'mbt', producers: [], inService: 2004, unitCostUsdM: 0.8, rangeKm: 450, fuelTph: 0.11, armor: 0.3, q: 0.45, load: { apfsds_105: 42 } },
  { id: 'type59d', name: 'Type 59D (105 mm, ERA)', cls: 'mbt', producers: [], inService: 1995, unitCostUsdM: 0.6, speedKph: 35, rangeKm: 440, fuelTph: 0.1, armor: 0.35, q: 0.5, load: { apfsds_105: 34 } },
  { id: 'al_zarrar', name: 'Al-Zarrar (Type 59 upgrade, 125 mm)', cls: 'mbt', producers: [], inService: 2004, unitCostUsdM: 1, speedKph: 40, rangeKm: 450, fuelTph: 0.11, armor: 0.35, q: 0.55, load: { apfsds_125: 16, he_125: 23 } },
  { id: 'type85', name: 'Type 85-IIAP (125 mm)', cls: 'mbt', producers: [], inService: 1990, unitCostUsdM: 1, crew: 3, speedKph: 45, rangeKm: 450, fuelTph: 0.12, armor: 0.4, q: 0.55, load: { apfsds_125: 16, he_125: 24 } },
  { id: 't62', name: 'T-62 (unmodernised)', cls: 'mbt', producers: [], inService: 1961, unitCostUsdM: 0.5, speedKph: 40, rangeKm: 450, fuelTph: 0.12, armor: 0.3, q: 0.42, load: { apfsds_100: 40 } },
  { id: 'zulfiqar', name: 'Zulfiqar-1/3', cls: 'mbt', producers: ['IRN'], inService: 1997, unitCostUsdM: 1.5, crew: 3, speedKph: 45, rangeKm: 450, fuelTph: 0.13, armor: 0.45, q: 0.55, load: { apfsds_125: 16, he_125: 20 } },
  // L11 120 mm rifled gun fires APDS/HESH; the 120 mm rows stand in for both (estimate).
  { id: 'chieftain', name: 'Chieftain Mk 5', cls: 'mbt', producers: [], inService: 1970, unitCostUsdM: 0.6, speedKph: 35, rangeKm: 400, fuelTph: 0.17, armor: 0.45, q: 0.45, load: { apfsds_120: 32, he_120: 32 } },
  { id: 'm47m', name: 'M47M Patton (90 mm)', cls: 'mbt', producers: [], inService: 1970, unitCostUsdM: 0.3, speedKph: 40, rangeKm: 600, fuelTph: 0.15, armor: 0.22, q: 0.33, load: { round_90mm: 79 } },
  // T-80UD swaps the T-80U gas turbine for the 6TD diesel, roughly halving fuel burn; Pakistan bought 320 from Ukraine in 1997-99 (SIPRI).
  { id: 't80ud', name: 'T-80UD', cls: 'mbt', producers: [], inService: 1987, unitCostUsdM: 2.5, crew: 3, speedKph: 50, rangeKm: 560, fuelTph: 0.14, armor: 0.62, q: 0.85, load: { apfsds_125: 16, he_125: 24 } },
  { id: 't80bv', name: 'T-80BV', cls: 'mbt', producers: [], inService: 1985, unitCostUsdM: 1.5, crew: 3, speedKph: 50, rangeKm: 400, fuelTph: 0.25, armor: 0.55, q: 0.75, load: { apfsds_125: 16, he_125: 22, gun_launched_atgm: 3 } },
  // 2A5 adds the wedge turret armor and a stabilised commander's thermal sight to the 2A4; Leopard 2PL brings Polish 2A4s to the same turret standard.
  { id: 'leopard2a5', name: 'Leopard 2A5 / 2PL', cls: 'mbt', producers: ['DEU', 'POL'], inService: 1995, unitCostUsdM: 6, speedKph: 45, rangeKm: 450, fuelTph: 0.17, armor: 0.72, q: 1.0, load: { apfsds_120: 27, he_120: 15 } },
  { id: 'ariete', name: 'C1 Ariete', cls: 'mbt', producers: [], inService: 1995, unitCostUsdM: 6, speedKph: 45, rangeKm: 550, fuelTph: 0.17, armor: 0.55, q: 0.8, load: { apfsds_120: 28, he_120: 14 } },
  // TR-85: Romanian stretched T-55 hull, 100 mm gun, 830 hp; ~310 km road range. TR-85M1 Bizonul adds a thermal FCS and appliqué armor.
  { id: 'tr85', name: 'TR-85', cls: 'mbt', producers: [], inService: 1986, unitCostUsdM: 0.5, speedKph: 40, rangeKm: 310, fuelTph: 0.12, armor: 0.3, q: 0.4, load: { apfsds_100: 41 } },
  { id: 'tr85m1', name: 'TR-85M1 Bizonul', cls: 'mbt', producers: [], inService: 1997, unitCostUsdM: 1.5, speedKph: 40, rangeKm: 400, fuelTph: 0.12, armor: 0.38, q: 0.6, load: { apfsds_100: 41 } },
  { id: 't55am', name: 'T-55AM (BDD appliqué armor)', cls: 'mbt', producers: [], inService: 1983, unitCostUsdM: 0.6, speedKph: 35, rangeKm: 400, fuelTph: 0.1, armor: 0.32, q: 0.45, load: { apfsds_100: 43 } },
];

const ifvs: PlatformSpec<Key>[] = [
  { id: 'acv15', name: 'FNSS ACV-15 / YPR-765 AIFV (25 mm)', cls: 'ifv', crew: 10, producers: ['TUR'], inService: 1990, unitCostUsdM: 1, speedKph: 50, rangeKm: 490, fuelTph: 0.07, armor: 0.15, q: 0.7, capacity: { troops: 7 }, load: { round_25mm: 30 } },
  { id: 'ratel', name: 'Ratel 20/60/90', cls: 'ifv', crew: 11, producers: [], inService: 1976, unitCostUsdM: 0.5, speedKph: 70, rangeKm: 860, fuelTph: 0.07, armor: 0.12, q: 0.6, capacity: { troops: 7 }, load: { round_20mm: 40 } },
  { id: 'bmd2', name: 'BMD-2', cls: 'ifv', crew: 7, producers: [], inService: 1985, unitCostUsdM: 0.6, speedKph: 45, rangeKm: 450, fuelTph: 0.07, armor: 0.1, q: 0.65, capacity: { troops: 5 }, load: { round_30mm: 30, konkurs: 3 } },
  { id: 'bvp_m80', name: 'M-80A IFV', cls: 'ifv', crew: 10, producers: [], inService: 1985, unitCostUsdM: 0.5, speedKph: 45, rangeKm: 500, fuelTph: 0.09, armor: 0.15, q: 0.55, capacity: { troops: 8 }, load: { round_20mm: 40 } },
  { id: 'vci_tam', name: 'VCTP (TAM IFV, 20 mm)', cls: 'ifv', crew: 12, producers: [], inService: 1980, unitCostUsdM: 0.8, speedKph: 55, rangeKm: 570, fuelTph: 0.11, armor: 0.15, q: 0.55, capacity: { troops: 10 }, load: { round_20mm: 40 } },
  { id: 'amx10p', name: 'AMX-10P', cls: 'ifv', crew: 11, producers: [], inService: 1973, unitCostUsdM: 0.6, speedKph: 50, rangeKm: 600, fuelTph: 0.09, armor: 0.15, q: 0.55, capacity: { troops: 8 }, load: { round_20mm: 40 } },
  { id: 'cm34_ifv', name: 'CM-34 Clouded Leopard 30 mm IFV', cls: 'ifv', crew: 10, producers: ['TWN'], inService: 2021, unitCostUsdM: 3, speedKph: 80, rangeKm: 800, fuelTph: 0.07, armor: 0.3, q: 0.95, capacity: { troops: 7 }, load: { round_30mm: 40 } },
  { id: 'bionix2', name: 'Bionix II', cls: 'ifv', crew: 10, producers: ['SGP'], inService: 2006, unitCostUsdM: 3, speedKph: 45, rangeKm: 415, fuelTph: 0.11, armor: 0.3, q: 0.95, capacity: { troops: 7 }, load: { round_25mm: 40 } },
  { id: 'hunter_afv', name: 'Hunter AFV', cls: 'ifv', crew: 11, producers: ['SGP'], inService: 2019, unitCostUsdM: 6, speedKph: 50, rangeKm: 500, fuelTph: 0.12, armor: 0.45, q: 1.1, capacity: { troops: 8 }, load: { round_30mm: 40, spike_lr2: 2 } },
  // Vilkas: Lithuania's Boxer IFV with the Samson Mk II turret (30 mm, Spike LR); apc class like the patria_amv (Rosomak) row, which the catalog files wheeled 8x8s under.
  { id: 'vilkas', name: 'Vilkas (Boxer IFV)', cls: 'apc', crew: 11, producers: ['DEU'], inService: 2019, unitCostUsdM: 7, speedKph: 80, rangeKm: 1050, fuelTph: 0.08, armor: 0.4, q: 1.0, capacity: { troops: 8 }, load: { round_30mm: 30, spike_lr2: 2 } },
];

const carriers: PlatformSpec<Key>[] = [
  { id: 'm113', name: 'M113 / M113A1 / M113A2', cls: 'apc', crew: 13, producers: [], inService: 1964, unitCostUsdM: 0.4, rangeKm: 480, armor: 0.1, q: 0.65, capacity: { troops: 11 } },
  // BTR-60PB: twin GAZ-49B petrol engines, hence the higher fuel burn than the diesel BTR-80.
  { id: 'btr60', name: 'BTR-60PB', cls: 'apc', crew: 10, producers: [], inService: 1966, unitCostUsdM: 0.15, speedKph: 60, rangeKm: 500, fuelTph: 0.07, armor: 0.08, q: 0.75, capacity: { troops: 8 } },
  { id: 'k200', name: 'K200 KIFV', cls: 'apc', crew: 12, producers: [], inService: 1985, unitCostUsdM: 0.8, speedKph: 50, rangeKm: 480, fuelTph: 0.07, armor: 0.12, q: 0.75, capacity: { troops: 9 } },
  { id: 'vtt323', name: 'VTT-323 (M1973 Sinhung)', cls: 'apc', crew: 12, producers: ['PRK'], inService: 1973, unitCostUsdM: 0.2, speedKph: 45, rangeKm: 450, fuelTph: 0.07, armor: 0.1, q: 0.75, capacity: { troops: 10 } },
  { id: 'zsd89', name: 'ZSD-89 (Type 89 / YW534)', cls: 'apc', crew: 15, producers: [], inService: 1990, unitCostUsdM: 0.4, speedKph: 50, rangeKm: 500, fuelTph: 0.09, armor: 0.12, q: 0.7, capacity: { troops: 13 } },
  { id: 'btr_mdm', name: 'BTR-MDM Rakushka', cls: 'apc', crew: 15, producers: ['RUS'], inService: 2015, unitCostUsdM: 1, speedKph: 50, rangeKm: 500, fuelTph: 0.08, armor: 0.1, q: 0.55, capacity: { troops: 13 } },
  { id: 'aav7', name: 'AAV7A1 amphibious assault vehicle', cls: 'apc', crew: 24, producers: ['KOR'], inService: 1983, unitCostUsdM: 2, speedKph: 45, rangeKm: 480, fuelTph: 0.1, armor: 0.15, q: 0.8, capacity: { troops: 21 } },
  { id: 'guarani', name: 'VBTP-MR Guarani 6x6', cls: 'apc', crew: 11, producers: ['BRA'], inService: 2014, unitCostUsdM: 1.5, speedKph: 80, rangeKm: 600, armor: 0.2, q: 0.85, capacity: { troops: 9 } },
  { id: 'terrex', name: 'Terrex AV-81 / ICV 8x8', cls: 'apc', crew: 13, producers: ['SGP'], inService: 2009, unitCostUsdM: 1.5, speedKph: 80, rangeKm: 800, armor: 0.25, q: 0.85, capacity: { troops: 11 } },
  { id: 'cm32_apc', name: 'CM-32 Clouded Leopard 8x8', cls: 'apc', crew: 10, producers: ['TWN'], inService: 2010, unitCostUsdM: 2, speedKph: 80, rangeKm: 800, armor: 0.25, q: 0.8, capacity: { troops: 8 } },
  // Eitan: 8x8 with Trophy APS; IDF combat debut in Gaza 2023-24.
  { id: 'eitan', name: 'Eitan 8x8', cls: 'apc', crew: 12, producers: ['ISR'], inService: 2023, unitCostUsdM: 3, speedKph: 80, rangeKm: 650, armor: 0.4, q: 1.0, capacity: { troops: 9 }, load: { round_30mm: 30 } },
  { id: 'btr3e1', name: 'BTR-3E1 / BTR-3U', cls: 'apc', crew: 9, producers: ['UKR'], inService: 2001, unitCostUsdM: 0.8, speedKph: 70, rangeKm: 600, armor: 0.12, q: 1.1, capacity: { troops: 6 }, load: { round_30mm: 20 } },
  { id: 'lazar3', name: 'Lazar 3 8x8', cls: 'apc', crew: 12, producers: ['SRB'], inService: 2018, unitCostUsdM: 1.5, speedKph: 80, rangeKm: 800, armor: 0.25, q: 0.75, capacity: { troops: 9 } },
  { id: 'anoa_apc', name: 'Pindad Anoa 6x6', cls: 'apc', crew: 12, producers: ['IDN'], inService: 2008, unitCostUsdM: 0.6, speedKph: 80, rangeKm: 600, armor: 0.12, q: 0.55, capacity: { troops: 10 } },
  { id: 'urutu', name: 'EE-11 Urutu', cls: 'apc', crew: 14, producers: [], inService: 1974, unitCostUsdM: 0.3, speedKph: 70, rangeKm: 850, fuelTph: 0.05, armor: 0.08, q: 0.55, capacity: { troops: 12 } },
  { id: 'vab', name: 'VAB 4x4', cls: 'apc', crew: 12, producers: [], inService: 1976, unitCostUsdM: 0.4, speedKph: 70, rangeKm: 1000, fuelTph: 0.04, armor: 0.1, q: 0.6, capacity: { troops: 10 } },
  { id: 'type73_apc', name: 'Type 73 APC', cls: 'apc', crew: 12, producers: [], inService: 1973, unitCostUsdM: 0.5, speedKph: 50, rangeKm: 300, fuelTph: 0.08, armor: 0.1, q: 0.5, capacity: { troops: 9 } },
  { id: 'fahd_apc', name: 'Fahd 4x4', cls: 'apc', crew: 12, producers: ['EGY'], inService: 1986, unitCostUsdM: 0.3, speedKph: 80, rangeKm: 800, fuelTph: 0.03, armor: 0.08, q: 0.5, capacity: { troops: 10 } },
  { id: 'simba_apc', name: 'GKN Simba 4x4', cls: 'apc', crew: 12, producers: [], inService: 1993, unitCostUsdM: 0.4, speedKph: 80, rangeKm: 660, fuelTph: 0.03, armor: 0.08, q: 0.5, capacity: { troops: 10 } },
  { id: 'dn_xi', name: 'DN-XI 4x4', cls: 'apc', crew: 10, producers: ['MEX'], inService: 2012, unitCostUsdM: 0.25, speedKph: 80, rangeKm: 700, fuelTph: 0.03, armor: 0.1, q: 0.45, capacity: { troops: 8 } },
  // MRAPs: V-hull mine protection is captured in armor; armament is a single 12.7 mm / 7.62 mm mount.
  { id: 'kirpi_mrap', name: 'BMC Kirpi MRAP', cls: 'apc', crew: 13, producers: ['TUR'], inService: 2010, unitCostUsdM: 0.5, speedKph: 70, rangeKm: 700, fuelTph: 0.04, armor: 0.25, q: 0.6, capacity: { troops: 10 } },
  { id: 'casspir', name: 'Casspir MRAP', cls: 'apc', crew: 14, producers: ['ZAF'], inService: 1979, unitCostUsdM: 0.3, speedKph: 80, rangeKm: 800, fuelTph: 0.04, armor: 0.15, q: 0.45, capacity: { troops: 12 } },
  { id: 'otokar_cobra', name: 'Otokar Cobra / Cobra II', cls: 'apc', crew: 9, producers: ['TUR'], inService: 1997, unitCostUsdM: 0.4, speedKph: 80, rangeKm: 700, fuelTph: 0.03, armor: 0.12, q: 0.6, capacity: { troops: 7 } },
  { id: 'nimr', name: 'NIMR Ajban 4x4 / Hafeet 6x6', cls: 'apc', crew: 8, producers: ['ARE'], inService: 2005, unitCostUsdM: 0.4, speedKph: 80, rangeKm: 700, fuelTph: 0.03, armor: 0.15, q: 0.6, capacity: { troops: 6 } },
  // AMPV replaces the M113 family in ABCTs on a turretless Bradley hull; the ORBAT counts all five variants (GP, mortar, medical, mission command) as this row. ~$4M each, FY2024 Army budget (estimate).
  { id: 'ampv', name: 'M1283 AMPV', cls: 'apc', crew: 8, producers: ['USA'], inService: 2023, unitCostUsdM: 4, speedKph: 45, rangeKm: 400, fuelTph: 0.12, armor: 0.4, q: 0.9, capacity: { troops: 6 } },
  // USMC ACV-P: 3 crew + 13 Marines, swims ship-to-shore.
  { id: 'acv', name: 'Amphibious Combat Vehicle (ACV-P)', cls: 'apc', crew: 16, producers: ['USA'], inService: 2020, unitCostUsdM: 4.5, speedKph: 80, rangeKm: 520, fuelTph: 0.07, armor: 0.3, q: 0.9, capacity: { troops: 13 } },
  { id: 'lav6', name: 'LAV 6.0 (25 mm)', cls: 'apc', crew: 10, producers: ['CAN'], inService: 2017, unitCostUsdM: 3.5, speedKph: 80, rangeKm: 600, fuelTph: 0.07, armor: 0.3, q: 0.9, capacity: { troops: 7 }, load: { round_25mm: 40 } },
];

const recon: PlatformSpec<Key>[] = [
  { id: 'csk181', name: 'Dongfeng Mengshi CSK-181 4x4', cls: 'recon', producers: ['CHN'], inService: 2015, unitCostUsdM: 0.15, speedKph: 90, rangeKm: 600, fuelTph: 0.03, armor: 0.12, q: 0.5 },
  { id: 'ztl11', name: 'ZTL-11 105 mm wheeled assault gun', cls: 'recon', producers: ['CHN'], inService: 2011, unitCostUsdM: 1.5, speedKph: 80, rangeKm: 800, fuelTph: 0.06, armor: 0.2, fp: { armor: 0.03 }, load: { apfsds_105: 30 } },
  { id: 'ztd05', name: 'ZTD-05 amphibious assault gun (105 mm)', cls: 'recon', producers: ['CHN'], inService: 2006, unitCostUsdM: 2.5, speedKph: 45, rangeKm: 500, fuelTph: 0.13, armor: 0.2, fp: { armor: 0.03 }, load: { apfsds_105: 30 } },
  // Boxer CRV: Australia's LAND 400 Ph2, 211 vehicles for ~A$5.2B incl. support; vehicle share estimated at ~$8M.
  { id: 'boxer_crv', name: 'Boxer CRV (Lance 30 mm, Spike LR2)', cls: 'recon', producers: ['AUS', 'DEU'], inService: 2022, unitCostUsdM: 8, speedKph: 80, rangeKm: 1050, fuelTph: 0.08, armor: 0.4, detectionKm: 15, fp: { armor: 0.02, soft: 0.05 }, load: { round_30mm: 30, spike_lr2: 2 } },
  { id: 'cascavel', name: 'EE-9 Cascavel (90 mm)', cls: 'recon', crew: 3, producers: [], inService: 1977, unitCostUsdM: 0.3, speedKph: 80, rangeKm: 880, armor: 0.08, fp: { armor: 0.012 }, load: { round_90mm: 44 } },
  { id: 'erc90_sagaie', name: 'ERC-90 Sagaie', cls: 'recon', crew: 3, producers: [], inService: 1979, unitCostUsdM: 0.5, speedKph: 80, rangeKm: 700, armor: 0.08, fp: { armor: 0.012 }, load: { round_90mm: 20 } },
  { id: 'panhard_aml', name: 'Panhard AML-60/90', cls: 'recon', crew: 3, producers: [], inService: 1961, unitCostUsdM: 0.2, speedKph: 70, rangeKm: 600, fuelTph: 0.03, armor: 0.06, fp: { armor: 0.01 }, load: { round_90mm: 20 } },
  { id: 'rooikat', name: 'Rooikat 76', cls: 'recon', producers: [], inService: 1990, unitCostUsdM: 1, speedKph: 80, rangeKm: 1000, armor: 0.12, detectionKm: 12, fp: { armor: 0.02 } },
  { id: 'pt76', name: 'PT-76B amphibious light tank', cls: 'recon', crew: 3, producers: [], inService: 1959, unitCostUsdM: 0.1, speedKph: 35, rangeKm: 370, fuelTph: 0.08, armor: 0.08, q: 0.8 },
  { id: 'stingray_light_tank', name: 'Stingray light tank (105 mm)', cls: 'recon', producers: [], inService: 1988, unitCostUsdM: 1.5, speedKph: 60, rangeKm: 480, fuelTph: 0.1, armor: 0.15, fp: { armor: 0.025 }, load: { apfsds_105: 32 } },
  { id: 'sabrah_light_tank', name: 'Sabrah light tank (ASCOD hull, 105 mm)', cls: 'recon', producers: ['ISR', 'ESP'], inService: 2023, unitCostUsdM: 5, speedKph: 60, rangeKm: 500, fuelTph: 0.12, armor: 0.3, fp: { armor: 0.03 }, load: { apfsds_105: 30 } },
  { id: 'centauro', name: 'Centauro B1 (105 mm)', cls: 'recon', producers: [], inService: 1991, unitCostUsdM: 2.5, speedKph: 80, rangeKm: 800, fuelTph: 0.07, armor: 0.15, fp: { armor: 0.025 }, load: { apfsds_105: 40 } },
  { id: 'cvrt', name: 'CVR(T) Scimitar (30 mm Rarden)', cls: 'recon', crew: 3, producers: [], inService: 1971, unitCostUsdM: 0.5, speedKph: 60, rangeKm: 450, fuelTph: 0.05, armor: 0.08, fp: { armor: 0.008 }, load: { round_30mm: 16 } },
];

// Generic placeholder for the ORBATs' unspecified transport: a 4-6 t, 4x4/6x6 cargo truck of the Ural-4320 / KamAZ-4310 / MAN / Tata class.
const logistics: PlatformSpec<Key>[] = [
  { id: 'truck', name: 'Military cargo truck (generic 4-6 t)', cls: 'truck', producers: ['USA', 'RUS', 'CHN', 'DEU', 'FRA', 'IND', 'KOR', 'JPN', 'TUR', 'BRA', 'ITA', 'CZE', 'SWE', 'POL', 'IRN', 'PAK', 'ZAF', 'UKR', 'BLR', 'EGY', 'IDN'], inService: 1990, unitCostUsdM: 0.08, rangeKm: 600, fuelTph: 0.03, capacity: { cargoTons: 5, troops: 20 } },
];

export const platforms: Platform[] = [...tanks, ...ifvs, ...carriers, ...recon, ...logistics].map(toPlatform);
export const munitions: Munition[] = specs.map(toMunition);

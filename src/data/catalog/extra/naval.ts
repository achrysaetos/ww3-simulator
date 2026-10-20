/**
 * Ships and submarines fielded in the orders of battle that the base catalog
 * lacked: mostly export, legacy and mid-size navies, plus the generic hulls the
 * generated forces use (patrol_craft, fast_attack_craft, missile_boat).
 *
 * Rows follow naval.ts and subsurface.ts: state what is specific, the class
 * template supplies the rest. Hull data from IISS Military Balance 2025 and
 * Jane's Fighting Ships summaries; costs for second-hand and long-retired
 * builds are replacement-value estimates. Loadouts fill the real launchers.
 * Where a ship fires a weapon the catalog lacks, the row uses the nearest
 * catalog analogue and says so.
 *
 * Gun-only hulls carry 76 mm rounds when they mount one, so they keep the
 * anti-surface capability naval combat draws from the magazine; smaller guns
 * have no ship pk and are left to the class firepower.
 */
import type { Munition, Platform } from '../../../core/types';
import { defineMunitions, nuclearPk, toMunition, toPlatform, type PlatformSpec } from '../build';
import type { MunitionKey } from '../munitions';

const ashmPk = (ship: number) => ({ ship, structure: 0.4, soft: 0.4 });
const cruisePk = { structure: 0.8, soft: 0.6, hardened: 0.3, ship: 0.4, infantry: 0.3 };

const munitionSpecs = defineMunitions([
  // P-15 family (SS-N-2 Styx, SY-1, HY-2): large, slow-reacting seeker, easy to decoy by modern standards.
  { id: 'p15_termit', name: 'P-15M Termit / HY-2 (SS-N-2 Styx)', kind: 'antiship_cruise', producers: [], rangeKm: 80, speedMach: 0.9, warheadKg: 513, cepM: 20, pk: ashmPk(0.35), interceptDifficulty: 0.15, unitCostUsdM: 0.3, weightKg: 2500 },
  { id: 'exocet_mm38', name: 'MM38 Exocet', kind: 'antiship_cruise', producers: [], rangeKm: 42, speedMach: 0.9, warheadKg: 165, cepM: 5, pk: ashmPk(0.45), interceptDifficulty: 0.3, unitCostUsdM: 0.8, weightKg: 735 },
  { id: 'sm1mr', name: 'RIM-66 SM-1MR Block VI', kind: 'sam', producers: [], rangeKm: 46, speedMach: 3, warheadKg: 62, cepM: 5, pk: { aircraft: 0.6, missile: 0.3, helicopter: 0.7 }, interceptDifficulty: 0, unitCostUsdM: 0.6, weightKg: 621 },
  { id: 'rim7_sea_sparrow', name: 'RIM-7M/P Sea Sparrow / Aspide', kind: 'sam', producers: [], rangeKm: 26, speedMach: 2.5, warheadKg: 39, cepM: 5, pk: { aircraft: 0.6, missile: 0.4, helicopter: 0.7 }, interceptDifficulty: 0, unitCostUsdM: 0.8, weightKg: 231 },
  { id: 'osa_m_9m33', name: '9M33M Osa-M (SA-N-4 Gecko)', kind: 'shorad_missile', producers: [], rangeKm: 15, speedMach: 2.4, warheadKg: 15, cepM: 5, pk: { aircraft: 0.45, missile: 0.2, helicopter: 0.6 }, interceptDifficulty: 0, unitCostUsdM: 0.15, weightKg: 128 },
  { id: 'crotale_hq7', name: 'Crotale Naval / HHQ-7 (FM-90N)', kind: 'shorad_missile', producers: ['CHN'], rangeKm: 12, speedMach: 2.3, warheadKg: 14, cepM: 5, pk: { aircraft: 0.5, missile: 0.3, helicopter: 0.6 }, interceptDifficulty: 0, unitCostUsdM: 0.3, weightKg: 85 },
  { id: 'barak1', name: 'Barak 1', kind: 'shorad_missile', producers: ['ISR'], rangeKm: 12, speedMach: 2.1, warheadKg: 22, cepM: 3, pk: { aircraft: 0.55, missile: 0.55, helicopter: 0.65 }, interceptDifficulty: 0, unitCostUsdM: 0.3, weightKg: 98 },
  { id: 'mk46', name: 'Mk 46 Mod 5 / A244-S lightweight', kind: 'torpedo', producers: [], rangeKm: 11, speedMach: 0.07, warheadKg: 44, cepM: 5, pk: { submarine: 0.35, ship: 0.2 }, interceptDifficulty: 0.9, unitCostUsdM: 0.8, weightKg: 231 },
  // Wire-guided 533 mm heavyweights of the 1970s-80s export submarines (Type 209, Agosta, Zwaardvis, TR-1700).
  { id: 'sut_heavyweight', name: 'SUT / SST-4 / F17 legacy heavyweight', kind: 'torpedo', producers: [], rangeKm: 28, speedMach: 0.054, warheadKg: 260, cepM: 5, pk: { ship: 0.6, submarine: 0.35 }, interceptDifficulty: 0.9, unitCostUsdM: 1, weightKg: 1400 },
  // Export Club-S land-attack round: MTCR-limited to 300 km, against 1,500-2,500 km for Russia's own 3M14.
  { id: 'kalibr_club', name: '3M14E Club-S (export Kalibr)', kind: 'cruise', producers: ['RUS'], rangeKm: 300, speedMach: 0.8, warheadKg: 450, cepM: 5, pk: cruisePk, interceptDifficulty: 0.3, unitCostUsdM: 2, weightKg: 1770 },
  // Babur-3: 450 km per ISPR (2017/2018 tests). Yield as babur_nuc (FAS estimate for Pakistani warheads).
  { id: 'babur3_slcm', name: 'Babur-3 SLCM (nuclear)', kind: 'cruise', producers: ['PAK'], rangeKm: 450, speedMach: 0.8, warheadKg: 450, yieldKt: 12, cepM: 30, pk: nuclearPk(12, 30), interceptDifficulty: 0.4, unitCostUsdM: 2, weightKg: 1500 },
  // Popeye Turbo SLCM: ~1,500 km reported (1,000-1,500 km in open sources); yield an estimate, Israel publishes nothing.
  { id: 'popeye_turbo_slcm', name: 'Popeye Turbo SLCM (nuclear)', kind: 'cruise', producers: ['ISR'], rangeKm: 1500, speedMach: 0.8, warheadKg: 200, yieldKt: 20, cepM: 30, pk: nuclearPk(20, 30), interceptDifficulty: 0.4, unitCostUsdM: 3, weightKg: 1500 },
  // Pukguksong-3/-4/-5 family: range ~1,900 km (2019 lofted test); yield and CEP are estimates.
  { id: 'pukguksong3', name: 'Pukguksong-3 SLBM', kind: 'slbm', producers: ['PRK'], rangeKm: 1900, speedMach: 10, warheadKg: 650, yieldKt: 15, cepM: 1000, pk: nuclearPk(15, 1000), interceptDifficulty: 0.75, unitCostUsdM: 10, weightKg: 14000 },
]);

type Key = MunitionKey | (typeof munitionSpecs)[number]['id'];

const carriersAndAmphibs: PlatformSpec<Key>[] = [
  { id: 'hyuga', name: 'Hyuga-class DDH', cls: 'carrier', crew: 340, producers: [], inService: 2009, unitCostUsdM: 1000, speedKph: 56, rangeKm: 11000, fuelTph: 4, armor: 0.35, detectionKm: 300, channels: 2, capacity: { aircraft: 11 }, fp: { submarine: 0.06 }, load: { essm2: 16, asroc: 12, type12_lwt: 6, ciws_burst: 20 } },
  { id: 'chakri_naruebet', name: 'HTMS Chakri Naruebet', cls: 'carrier', crew: 455, producers: [], inService: 1997, unitCostUsdM: 340, speedKph: 48, rangeKm: 18500, fuelTph: 2, armor: 0.3, detectionKm: 150, channels: 0, capacity: { aircraft: 6 }, load: { mistral: 6 } },
  { id: 'osumi_lst', name: 'Osumi-class LST', cls: 'amphibious', crew: 135, producers: [], inService: 1998, unitCostUsdM: 400, speedKph: 41, rangeKm: 8300, fuelTph: 1.5, detectionKm: 100, capacity: { troops: 330, vehicles: 10 }, load: { ciws_burst: 20 } },
  { id: 'cheonwangbong_lst', name: 'Cheonwangbong-class LST-II', cls: 'amphibious', crew: 120, producers: ['KOR'], inService: 2014, unitCostUsdM: 200, speedKph: 42, rangeKm: 8000, fuelTph: 1.2, detectionKm: 80, capacity: { troops: 300, vehicles: 13 } },
  { id: 'yu_shan_lpd', name: 'Yu Shan-class LPD', cls: 'amphibious', crew: 150, producers: ['TWN'], inService: 2022, unitCostUsdM: 170, speedKph: 39, rangeKm: 13000, fuelTph: 1.5, detectionKm: 100, capacity: { troops: 670, vehicles: 20 }, load: { ciws_burst: 20 } },
  { id: 'newport_lst', name: 'Newport-class LST (Chung Ho)', cls: 'amphibious', crew: 250, producers: [], inService: 1969, unitCostUsdM: 50, speedKph: 37, rangeKm: 4600, fuelTph: 1.5, detectionKm: 60, capacity: { troops: 400, vehicles: 29 }, load: { ciws_burst: 20 } },
  { id: 'choules_lsd', name: 'HMAS Choules (Bay-class LSD)', cls: 'amphibious', crew: 158, producers: [], inService: 2006, unitCostUsdM: 200, speedKph: 33, rangeKm: 15000, fuelTph: 1.5, detectionKm: 80, capacity: { troops: 356, vehicles: 24 }, load: { ciws_burst: 20 } },
  { id: 'jalashwa_lpd', name: 'INS Jalashwa (Austin-class LPD)', cls: 'amphibious', crew: 420, producers: [], inService: 1971, unitCostUsdM: 50, speedKph: 39, rangeKm: 14000, fuelTph: 2.5, detectionKm: 100, capacity: { troops: 930, aircraft: 6, vehicles: 20 } },
  { id: 'shardul_lst', name: 'Shardul-class LST', cls: 'amphibious', crew: 160, producers: [], inService: 2007, unitCostUsdM: 70, speedKph: 30, rangeKm: 6500, fuelTph: 1, detectionKm: 60, capacity: { troops: 500, vehicles: 11 } },
  { id: 'tarlac_lpd', name: 'Tarlac-class LPD', cls: 'amphibious', crew: 120, producers: ['IDN'], inService: 2016, unitCostUsdM: 45, speedKph: 30, rangeKm: 16000, fuelTph: 1, detectionKm: 60, capacity: { troops: 500, aircraft: 2, vehicles: 10 } },
  { id: 'makassar_lpd', name: 'Makassar-class LPD', cls: 'amphibious', crew: 125, producers: ['IDN', 'KOR'], inService: 2007, unitCostUsdM: 40, speedKph: 28, rangeKm: 16000, fuelTph: 1, detectionKm: 60, capacity: { troops: 520, aircraft: 2, vehicles: 13 } },
  { id: 'endurance_lpd', name: 'Endurance-class LPD', cls: 'amphibious', crew: 65, producers: ['SGP'], inService: 2000, unitCostUsdM: 150, speedKph: 28, rangeKm: 10000, fuelTph: 1.2, detectionKm: 100, capacity: { troops: 350, aircraft: 2, vehicles: 18 }, load: { mistral: 8 } },
  { id: 'angthong_lpd', name: 'HTMS Angthong (Endurance-class LPD)', cls: 'amphibious', crew: 120, producers: [], inService: 2012, unitCostUsdM: 150, speedKph: 28, rangeKm: 10000, fuelTph: 1.2, detectionKm: 80, capacity: { troops: 500, aircraft: 2, vehicles: 19 } },
  { id: 'bayraktar_lst', name: 'Bayraktar-class LST', cls: 'amphibious', crew: 130, producers: ['TUR'], inService: 2017, unitCostUsdM: 150, speedKph: 33, rangeKm: 8300, fuelTph: 1.2, detectionKm: 80, capacity: { troops: 350, vehicles: 20 }, load: { ciws_burst: 20 } },
  { id: 'bahia_lpd', name: 'NDM Bahia (ex-Siroco, Foudre-class)', cls: 'amphibious', crew: 160, producers: [], inService: 1998, unitCostUsdM: 100, speedKph: 39, rangeKm: 20000, fuelTph: 2, detectionKm: 100, capacity: { troops: 470, aircraft: 4, vehicles: 50 } },
  { id: 'atlantico', name: 'NAM Atlântico (ex-HMS Ocean)', cls: 'amphibious', crew: 285, producers: [], inService: 1998, unitCostUsdM: 120, speedKph: 33, rangeKm: 15000, fuelTph: 2, detectionKm: 150, capacity: { troops: 800, aircraft: 18, vehicles: 40 } },
  { id: 'al_fulk_lpd', name: 'Al Fulk LPD (Fincantieri)', cls: 'amphibious', crew: 100, producers: ['ITA'], inService: 2024, unitCostUsdM: 400, speedKph: 37, rangeKm: 13000, fuelTph: 1.5, detectionKm: 150, capacity: { troops: 550, aircraft: 1, vehicles: 30 } },
  { id: 'kalaat_beni_abbes_lpd', name: 'Kalaat Beni Abbes LPD', cls: 'amphibious', crew: 150, producers: ['ITA'], inService: 2015, unitCostUsdM: 400, speedKph: 37, rangeKm: 13000, fuelTph: 1.5, detectionKm: 200, channels: 1, capacity: { troops: 440, aircraft: 3, vehicles: 15 }, load: { aster15: 16 } },
  // Western order of battle (src/data/orbat/west).
  { id: 'lsd_whidbey_island', name: 'Whidbey Island-class LSD', cls: 'amphibious', crew: 410, producers: [], inService: 1985, unitCostUsdM: 700, speedKph: 37, rangeKm: 15000, fuelTph: 2.5, detectionKm: 150, channels: 1, capacity: { troops: 402, vehicles: 30 }, load: { ram_blk2: 42, ciws_burst: 40 } },
  // Galicia-class LPD, built to the Dutch Rotterdam design.
  { id: 'lpd_rotterdam', name: 'Galicia / Rotterdam-class LPD', cls: 'amphibious', crew: 185, producers: [], inService: 1998, unitCostUsdM: 300, speedKph: 35, rangeKm: 11000, fuelTph: 2, detectionKm: 120, capacity: { troops: 540, aircraft: 6, vehicles: 33 }, load: { ciws_burst: 20 } },
  { id: 'lha_trieste', name: 'Trieste LHD', cls: 'amphibious', crew: 460, producers: ['ITA'], inService: 2024, unitCostUsdM: 1300, speedKph: 46, rangeKm: 13000, fuelTph: 3, detectionKm: 300, channels: 2, capacity: { troops: 600, aircraft: 20, vehicles: 50 }, load: { aster15: 8, aster30: 8 } },
];

const destroyers: PlatformSpec<Key>[] = [
  // Type 90 SSM (SSM-1B) is loaded as Harpoon: same subsonic class, 150 vs 124 km.
  { id: 'murasame', name: 'Murasame-class DD', cls: 'destroyer', crew: 165, producers: [], inService: 1996, unitCostUsdM: 600, detectionKm: 250, channels: 4, load: { essm2: 16, asroc: 16, harpoon: 8, type12_lwt: 6, ciws_burst: 20 } },
  { id: 'asagiri', name: 'Asagiri-class DD', cls: 'destroyer', crew: 220, producers: [], inService: 1988, unitCostUsdM: 350, detectionKm: 200, channels: 1, q: 0.85, load: { rim7_sea_sparrow: 8, asroc: 8, harpoon: 8, mk46: 6, ciws_burst: 20 } },
  { id: 'takanami', name: 'Takanami-class DD', cls: 'destroyer', crew: 175, producers: [], inService: 2003, unitCostUsdM: 650, detectionKm: 250, channels: 4, q: 1.05, load: { essm2: 32, asroc: 16, harpoon: 8, type12_lwt: 6, ciws_burst: 20 } },
  { id: 'akizuki', name: 'Akizuki-class DD', cls: 'destroyer', crew: 200, producers: [], inService: 2012, unitCostUsdM: 800, stealth: 0.3, detectionKm: 300, channels: 8, q: 1.15, load: { essm2: 48, asroc: 20, type12_ssm: 8, type12_lwt: 6, ciws_burst: 20 } },
  { id: 'asahi', name: 'Asahi-class DD', cls: 'destroyer', crew: 230, producers: [], inService: 2018, unitCostUsdM: 800, stealth: 0.3, detectionKm: 300, channels: 8, q: 1.15, fp: { submarine: 0.07 }, load: { essm2: 48, asroc: 20, type12_ssm: 8, type12_lwt: 6, ciws_burst: 20 } },
  // KDX-III Batch II: Aegis Baseline 9 with BMD; SM-6 and SM-3 buys announced, SM-2 loaded until delivery.
  { id: 'jeongjo_the_great', name: 'Jeongjo the Great (KDX-III Batch II)', cls: 'destroyer', crew: 300, producers: ['KOR'], inService: 2024, unitCostUsdM: 1500, detectionKm: 500, channels: 24, q: 1.2, load: { sm2_iiic: 48, hyunmoo3c: 24, ssm700k: 16, k745: 16, ram_blk2: 21, ciws_burst: 20 } },
  { id: 'gwanggaeto', name: 'Gwanggaeto the Great (KDX-I)', cls: 'destroyer', crew: 170, producers: [], inService: 1998, unitCostUsdM: 300, detectionKm: 200, channels: 2, q: 0.9, load: { rim7_sea_sparrow: 16, harpoon: 8, mk46: 6, ciws_burst: 20 } },
  // Ex-Kidd: Mk 26 twin-arm launchers, 68 rounds of SM-2 Block IIIA and ASROC.
  { id: 'kee_lung', name: 'Kee Lung-class (ex-Kidd) DDG', cls: 'destroyer', crew: 360, producers: [], inService: 1981, unitCostUsdM: 400, detectionKm: 330, channels: 4, q: 0.9, load: { sm2_iiic: 52, asroc: 16, harpoon: 8, mk46: 6, ciws_burst: 40 } },
  { id: 'delhi', name: 'Delhi-class (Project 15)', cls: 'destroyer', crew: 350, producers: [], inService: 1997, unitCostUsdM: 700, detectionKm: 250, channels: 6, load: { buk_9m317m: 48, kh35: 16, type53: 5, ciws_burst: 30 } },
  // Rajput (Kashin-II export): later hulls refitted with BrahMos and Barak 1.
  { id: 'rajput', name: 'Rajput-class (Project 61ME)', cls: 'destroyer', crew: 320, producers: [], inService: 1980, unitCostUsdM: 300, detectionKm: 200, channels: 2, q: 0.8, load: { brahmos: 8, barak1: 16, type53: 5, ciws_burst: 20 } },
  { id: 'almirante_brown', name: 'Almirante Brown-class (MEKO 360)', cls: 'destroyer', crew: 200, producers: [], inService: 1983, unitCostUsdM: 300, detectionKm: 150, channels: 1, q: 0.75, load: { exocet_mm38: 8, rim7_sea_sparrow: 24, mk46: 6 } },
  // Choe Hyon (2025): 74 VLS cells reported; the mix of Kumsong-3 and SAMs is an estimate.
  { id: 'choe_hyon', name: 'Choe Hyon-class destroyer', cls: 'destroyer', crew: 250, producers: ['PRK'], inService: 2025, unitCostUsdM: 500, detectionKm: 250, channels: 4, q: 0.8, load: { kh35: 16, buk_9m38: 32, ciws_burst: 20 } },
  { id: 'type051c', name: 'Type 051C Luzhou', cls: 'destroyer', crew: 250, producers: [], inService: 2006, unitCostUsdM: 300, detectionKm: 300, channels: 6, load: { s300_48n6e2: 48, yj83: 8, yu7: 6, ciws_burst: 30 } },
  // Durand de la Penne: Mk 13 launcher with 40 SM-1MR, Albatros/Aspide point defence, Teseo (Otomat) Mk 2A.
  { id: 'ddg_durand_de_la_penne', name: 'Durand de la Penne-class', cls: 'destroyer', crew: 377, producers: [], inService: 1993, unitCostUsdM: 600, detectionKm: 300, channels: 3, q: 0.9, load: { sm1mr: 40, otomat: 8, rim7_sea_sparrow: 16, mk46: 6 } },
];

const frigates: PlatformSpec<Key>[] = [
  // Generic modern export frigate in the generated forces; armament of Egypt's A-200EN / Algeria's Erradii.
  { id: 'meko_a200', name: 'MEKO A-200 frigate', cls: 'frigate', crew: 120, producers: ['DEU'], inService: 2006, unitCostUsdM: 400, stealth: 0.3, detectionKm: 200, channels: 4, load: { exocet: 8, mica_ng: 16, mu90: 6 } },
  { id: 'oliver_hazard_perry', name: 'Oliver Hazard Perry-class FFG', cls: 'frigate', crew: 200, producers: [], inService: 1977, unitCostUsdM: 250, detectionKm: 150, channels: 1, q: 0.8, load: { sm1mr: 36, harpoon: 4, mk46: 6, ciws_burst: 20 } },
  { id: 'koni', name: 'Koni-class (Project 1159)', cls: 'frigate', crew: 110, producers: [], inService: 1978, unitCostUsdM: 60, detectionKm: 80, channels: 1, q: 0.55, load: { osa_m_9m33: 20 } },
  // Cheng Kung (Taiwan-built Perry): HF-2 loaded as Harpoon (same subsonic class), plus HF-3.
  { id: 'cheng_kung', name: 'Cheng Kung-class FFG', cls: 'frigate', crew: 215, producers: [], inService: 1993, unitCostUsdM: 400, detectionKm: 150, channels: 1, q: 0.85, load: { sm1mr: 36, harpoon: 4, hf3: 4, mk46: 6, ciws_burst: 20 } },
  { id: 'kang_ding', name: 'Kang Ding-class (La Fayette)', cls: 'frigate', crew: 140, producers: [], inService: 1996, unitCostUsdM: 300, stealth: 0.45, detectionKm: 150, q: 0.85, load: { harpoon: 8, mk46: 6, ciws_burst: 20 } },
  { id: 'abukuma', name: 'Abukuma-class DE', cls: 'frigate', crew: 120, producers: [], inService: 1989, unitCostUsdM: 250, detectionKm: 100, q: 0.8, load: { harpoon: 8, asroc: 8, mk46: 6, ciws_burst: 20 } },
  { id: 'incheon', name: 'Incheon-class (FFX-I)', cls: 'frigate', crew: 140, producers: [], inService: 2013, unitCostUsdM: 230, detectionKm: 150, channels: 1, load: { ssm700k: 8, ram_blk2: 21, k745: 6, ciws_burst: 20 } },
  // FFX-III: 16-cell K-VLS with K-SAAM (Haegung), loaded as RAM Block 2, its nearest catalog analogue.
  { id: 'chungnam', name: 'Chungnam-class (FFX-III)', cls: 'frigate', crew: 120, producers: ['KOR'], inService: 2024, unitCostUsdM: 350, stealth: 0.3, detectionKm: 250, channels: 4, q: 1.1, load: { ssm700k: 8, hyunmoo3c: 8, ram_blk2: 16, k745: 6, ciws_burst: 20 } },
  { id: 'gabya', name: 'Gabya-class (ex-Perry, ESSM upgrade)', cls: 'frigate', crew: 220, producers: [], inService: 1980, unitCostUsdM: 250, detectionKm: 200, channels: 2, q: 0.9, load: { sm1mr: 32, essm2: 32, harpoon: 8, mk46: 6, ciws_burst: 20 } },
  { id: 'barbaros', name: 'Barbaros-class (MEKO 200TN-II)', cls: 'frigate', crew: 190, producers: [], inService: 1995, unitCostUsdM: 350, detectionKm: 200, channels: 2, load: { essm2: 16, harpoon: 8, mk46: 6, ciws_burst: 20 } },
  { id: 'yavuz', name: 'Yavuz-class (MEKO 200TN)', cls: 'frigate', crew: 180, producers: [], inService: 1987, unitCostUsdM: 250, detectionKm: 150, channels: 1, q: 0.85, load: { rim7_sea_sparrow: 24, harpoon: 8, mk46: 6, ciws_burst: 20 } },
  { id: 'jianghu', name: 'Jianghu-class (Type 053H)', cls: 'frigate', crew: 200, producers: [], inService: 1975, unitCostUsdM: 50, detectionKm: 60, q: 0.5, load: { p15_termit: 4 } },
  { id: 'zulfiquar', name: 'Zulfiquar-class (F-22P)', cls: 'frigate', crew: 200, producers: ['CHN'], inService: 2009, unitCostUsdM: 175, detectionKm: 150, channels: 1, load: { yj83: 8, crotale_hq7: 8, yu7: 6, ciws_burst: 20 } },
  { id: 'jose_rizal', name: 'Jose Rizal-class (HDF-2600)', cls: 'frigate', crew: 65, producers: ['KOR'], inService: 2020, unitCostUsdM: 170, detectionKm: 150, channels: 1, load: { ssm700k: 8, mistral: 6, k745: 6 } },
  { id: 'martadinata', name: 'Martadinata-class (SIGMA 10514)', cls: 'frigate', crew: 120, producers: ['NLD', 'IDN'], inService: 2017, unitCostUsdM: 220, detectionKm: 200, channels: 2, load: { exocet: 8, mica_ng: 12, mk46: 6 } },
  { id: 'reformador', name: 'Reformador-class POLA (SIGMA 10514)', cls: 'frigate', crew: 120, producers: [], inService: 2020, unitCostUsdM: 250, detectionKm: 200, channels: 2, load: { harpoon: 8, essm2: 8, ram_blk2: 21, mk54: 6 } },
  { id: 'sigma_frigate', name: 'SIGMA 9813/10513 frigate (Morocco)', cls: 'frigate', crew: 100, producers: [], inService: 2011, unitCostUsdM: 230, detectionKm: 200, channels: 2, load: { exocet: 4, mica_ng: 12, mu90: 6 } },
  { id: 'ahmad_yani', name: 'Ahmad Yani-class (ex-Van Speijk)', cls: 'frigate', crew: 180, producers: [], inService: 1967, unitCostUsdM: 30, detectionKm: 100, q: 0.55, load: { yj83: 4, mistral: 4, mk46: 6 } },
  { id: 'formidable', name: 'Formidable-class', cls: 'frigate', crew: 71, producers: [], inService: 2007, unitCostUsdM: 400, stealth: 0.4, detectionKm: 250, channels: 4, q: 1.1, load: { aster15: 24, aster30: 8, harpoon: 8, mk46: 6 } },
  { id: 'naresuan', name: 'Naresuan-class (upgraded)', cls: 'frigate', crew: 150, producers: [], inService: 1995, unitCostUsdM: 150, detectionKm: 200, channels: 2, load: { essm2: 32, harpoon: 8, mk46: 6 } },
  { id: 'bhumibol_adulyadej', name: 'HTMS Bhumibol Adulyadej (DW3000H)', cls: 'frigate', crew: 140, producers: [], inService: 2018, unitCostUsdM: 450, stealth: 0.3, detectionKm: 250, channels: 2, load: { essm2: 32, harpoon: 8, mk54: 6 } },
  { id: 'chao_phraya', name: 'Chao Phraya-class (Type 053HT)', cls: 'frigate', crew: 170, producers: [], inService: 1991, unitCostUsdM: 60, detectionKm: 80, q: 0.5, load: { yj83: 8 } },
  { id: 'phutthayotfa_chulalok', name: 'Phutthayotfa Chulalok (ex-Knox)', cls: 'frigate', crew: 250, producers: [], inService: 1969, unitCostUsdM: 30, detectionKm: 100, q: 0.55, load: { harpoon: 8, asroc: 8, mk46: 4 } },
  { id: 'al_riyadh', name: 'Al Riyadh-class (F3000S)', cls: 'frigate', crew: 180, producers: [], inService: 2002, unitCostUsdM: 600, stealth: 0.45, detectionKm: 250, channels: 4, load: { aster15: 16, exocet: 8, sut_heavyweight: 4 } },
  { id: 'madina', name: 'Madina-class (F2000S)', cls: 'frigate', crew: 180, producers: [], inService: 1985, unitCostUsdM: 300, detectionKm: 150, channels: 1, q: 0.75, load: { otomat: 8, crotale_hq7: 26, sut_heavyweight: 4 } },
  { id: 'niteroi', name: 'Niterói-class (modernized)', cls: 'frigate', crew: 210, producers: [], inService: 1976, unitCostUsdM: 150, detectionKm: 150, channels: 1, q: 0.75, load: { exocet: 4, rim7_sea_sparrow: 16, mk46: 6 } },
  { id: 'tamandare', name: 'Tamandaré-class (MEKO A-100)', cls: 'frigate', crew: 135, producers: ['BRA', 'DEU'], inService: 2025, unitCostUsdM: 500, stealth: 0.3, detectionKm: 250, channels: 4, q: 1.1, load: { camm: 12, exocet: 8, mk54: 6 } },
  { id: 'floreal', name: 'Floréal-class', cls: 'frigate', crew: 90, producers: [], inService: 1992, unitCostUsdM: 100, detectionKm: 80, q: 0.7, load: { exocet_mm38: 2 } },
  { id: 'brahmaputra', name: 'Brahmaputra-class (Project 16A)', cls: 'frigate', crew: 330, producers: [], inService: 2000, unitCostUsdM: 350, detectionKm: 200, channels: 2, load: { kh35: 16, barak1: 24, mk46: 6, ciws_burst: 20 } },
  { id: 'shivalik', name: 'Shivalik-class (Project 17)', cls: 'frigate', crew: 260, producers: [], inService: 2010, unitCostUsdM: 600, stealth: 0.3, detectionKm: 250, channels: 4, load: { kalibr_ash: 8, buk_9m317m: 24, barak1: 32, type53: 6 } },
  { id: 'gepard_frigate', name: 'Gepard 3.9-class (Vietnam)', cls: 'frigate', crew: 100, producers: [], inService: 2011, unitCostUsdM: 350, detectionKm: 150, channels: 1, load: { kh35: 8, osa_m_9m33: 20, ciws_burst: 20 } },
  { id: 'petya_frigate', name: 'Petya-class (Project 159)', cls: 'frigate', crew: 90, producers: [], inService: 1964, unitCostUsdM: 20, detectionKm: 40, q: 0.4 },
  { id: 'najin', name: 'Najin-class frigate', cls: 'frigate', crew: 180, producers: [], inService: 1973, unitCostUsdM: 60, detectionKm: 60, q: 0.4, load: { p15_termit: 2 } },
  { id: 'alvand', name: 'Alvand-class (Vosper Mk 5)', cls: 'frigate', crew: 135, producers: [], inService: 1971, unitCostUsdM: 50, detectionKm: 80, q: 0.55, load: { noor: 4 } },
  { id: 'neustrashimy', name: 'Neustrashimy-class (Project 11540)', cls: 'frigate', crew: 210, producers: [], inService: 1993, unitCostUsdM: 400, detectionKm: 200, channels: 4, q: 0.9, fp: { submarine: 0.07 }, load: { tor_9m338: 32, kh35: 8, type53: 6, ciws_burst: 20 } },
  { id: 'krivak', name: 'Krivak-class (Project 1135)', cls: 'frigate', crew: 190, producers: [], inService: 1970, unitCostUsdM: 150, detectionKm: 120, channels: 1, q: 0.7, load: { osa_m_9m33: 40, type53: 8 } },
  // Karel Doorman M-class: also Portugal's Bartolomeu Dias pair and Belgium's Leopold I pair.
  { id: 'ffg_karel_doorman', name: 'Karel Doorman-class (M-frigate)', cls: 'frigate', crew: 154, producers: [], inService: 1991, unitCostUsdM: 250, detectionKm: 180, channels: 2, q: 0.9, load: { harpoon: 8, rim7_sea_sparrow: 16, mk46: 4, ciws_burst: 20 } },
  { id: 'ffg_elli', name: 'Elli-class (Kortenaer)', cls: 'frigate', crew: 196, producers: [], inService: 1981, unitCostUsdM: 150, detectionKm: 150, channels: 1, q: 0.8, load: { harpoon: 8, rim7_sea_sparrow: 24, mk46: 6, shell_76_naval: 80 } },
  { id: 'ffg_wielingen', name: 'Wielingen-class (Drazki)', cls: 'frigate', crew: 160, producers: [], inService: 1976, unitCostUsdM: 80, detectionKm: 100, channels: 1, q: 0.65, load: { exocet_mm38: 4, rim7_sea_sparrow: 8 } },
  { id: 'ffg_f123', name: 'Brandenburg-class F123', cls: 'frigate', crew: 220, producers: [], inService: 1994, unitCostUsdM: 450, detectionKm: 250, channels: 4, q: 1.0, load: { essm2: 16, ram_blk2: 42, exocet: 4, mu90: 4 } },
  // Thaon di Revel PPA in Light+/Full fit: 16-cell Sylver A50 and Teseo Mk2/E (Otomat stands in).
  { id: 'ffg_thaon_di_revel', name: 'Paolo Thaon di Revel-class PPA', cls: 'frigate', crew: 171, producers: ['ITA'], inService: 2022, unitCostUsdM: 500, stealth: 0.35, detectionKm: 300, channels: 6, q: 1.15, load: { aster30: 8, aster15: 8, otomat: 8 } },
  { id: 'ffg_absalon', name: 'Absalon-class', cls: 'frigate', crew: 100, producers: [], inService: 2004, unitCostUsdM: 270, detectionKm: 200, channels: 3, q: 1.0, load: { harpoon: 16, essm2: 36, mu90: 4 } },
  // Romania's ex-Royal Navy Type 22 Batch 2: Exocet and Sea Wolf were removed before transfer in 2004-05.
  { id: 'ffg_type22', name: 'Type 22 Batch 2 (Regele Ferdinand)', cls: 'frigate', crew: 250, producers: [], inService: 1988, unitCostUsdM: 100, detectionKm: 120, q: 0.6, load: { shell_76_naval: 80, mk46: 6 } },
  { id: 'ffg_marasesti', name: 'Marasesti (destroyer-frigate)', cls: 'frigate', crew: 230, producers: [], inService: 1985, unitCostUsdM: 80, detectionKm: 100, q: 0.5, load: { p15_termit: 8, shell_76_naval: 100 } },
];

const corvettes: PlatformSpec<Key>[] = [
  { id: 'pohang_corvette', name: 'Pohang-class corvette', cls: 'corvette', crew: 95, producers: [], inService: 1984, unitCostUsdM: 50, detectionKm: 60, q: 0.7, load: { harpoon: 2, mk46: 6 } },
  { id: 'kora_corvette', name: 'Kora-class corvette', cls: 'corvette', crew: 125, producers: [], inService: 1998, unitCostUsdM: 100, detectionKm: 80, load: { kh35: 16, igla_s: 8 } },
  { id: 'khukri_corvette', name: 'Khukri-class corvette', cls: 'corvette', crew: 110, producers: [], inService: 1989, unitCostUsdM: 60, detectionKm: 60, q: 0.6, load: { p15_termit: 4, igla_s: 8 } },
  // Yarmook (Damen OPV 1900): Pakistan states anti-ship missile capability; C-802-class load is an estimate.
  { id: 'yarmook_corvette', name: 'Yarmook-class (Damen OPV 1900)', cls: 'corvette', crew: 60, producers: [], inService: 2020, unitCostUsdM: 90, detectionKm: 100, load: { yj83: 4 } },
  // BRP Miguel Malvar (HDC-3100), commissioned 2025; K-SAAM loaded as RAM Block 2.
  { id: 'miguel_malvar_corvette', name: 'Miguel Malvar-class (HDC-3100)', cls: 'corvette', crew: 115, producers: ['KOR'], inService: 2025, unitCostUsdM: 300, stealth: 0.3, detectionKm: 250, channels: 2, load: { ssm700k: 8, ram_blk2: 16, k745: 6 } },
  { id: 'bung_tomo_corvette', name: 'Bung Tomo-class (F2000)', cls: 'corvette', crew: 80, producers: [], inService: 2014, unitCostUsdM: 130, detectionKm: 150, channels: 1, load: { exocet: 8, mistral: 16, mk46: 6 } },
  { id: 'diponegoro_corvette', name: 'Diponegoro-class (SIGMA 9113)', cls: 'corvette', crew: 80, producers: [], inService: 2007, unitCostUsdM: 150, detectionKm: 150, channels: 1, load: { exocet: 4, mistral: 8, mk46: 6 } },
  { id: 'fatahillah_corvette', name: 'Fatahillah-class corvette', cls: 'corvette', crew: 90, producers: [], inService: 1979, unitCostUsdM: 30, detectionKm: 60, q: 0.6, load: { exocet_mm38: 4, mk46: 6 } },
  { id: 'parchim_corvette', name: 'Parchim-class (Kapitan Pattimura)', cls: 'corvette', crew: 70, producers: [], inService: 1981, unitCostUsdM: 15, detectionKm: 40, q: 0.45, load: { igla_s: 8 } },
  { id: 'rattanakosin_corvette', name: 'Rattanakosin-class corvette', cls: 'corvette', crew: 90, producers: [], inService: 1986, unitCostUsdM: 80, detectionKm: 80, channels: 1, q: 0.7, load: { harpoon: 8, rim7_sea_sparrow: 24, mk46: 6 } },
  { id: 'al_jubail_corvette', name: 'Al Jubail-class (Avante 2200)', cls: 'corvette', crew: 100, producers: ['ESP'], inService: 2022, unitCostUsdM: 400, detectionKm: 200, channels: 2, load: { harpoon: 8, essm2: 16, ciws_burst: 20 } },
  { id: 'badr_corvette', name: 'Badr-class corvette', cls: 'corvette', crew: 58, producers: [], inService: 1981, unitCostUsdM: 40, detectionKm: 60, q: 0.6, load: { harpoon: 8, mk46: 6 } },
  // Saudi MMSC (Freedom-class derivative): 8-cell Mk 41 quad-packed with ESSM.
  { id: 'mmsc_tuwaiq', name: 'Tuwaiq-class MMSC', cls: 'corvette', crew: 70, producers: ['USA'], inService: 2025, unitCostUsdM: 600, speedKph: 70, detectionKm: 200, channels: 2, load: { essm2: 32, harpoon: 8, ram_blk2: 11 } },
  { id: 'baynunah', name: 'Baynunah-class corvette', cls: 'corvette', crew: 45, producers: [], inService: 2011, unitCostUsdM: 200, detectionKm: 150, channels: 1, load: { exocet: 8, essm2: 8, ram_blk2: 21 } },
  { id: 'abu_dhabi_corvette', name: 'Abu Dhabi-class corvette', cls: 'corvette', crew: 70, producers: [], inService: 2013, unitCostUsdM: 300, detectionKm: 150, load: { exocet: 8, ciws_burst: 20 } },
  { id: 'al_zubarah_corvette', name: 'Al Zubarah-class (Doha) corvette', cls: 'corvette', crew: 100, producers: ['ITA'], inService: 2022, unitCostUsdM: 600, stealth: 0.3, detectionKm: 250, channels: 4, q: 1.05, load: { aster30: 16, exocet: 8 } },
  // Sa'ar 5: Barak 1 replaced by Barak 8 from 2015 (IDF).
  { id: 'saar5', name: "Sa'ar 5-class corvette", cls: 'corvette', crew: 74, producers: [], inService: 1994, unitCostUsdM: 260, detectionKm: 150, channels: 2, load: { harpoon: 8, barak8: 16, mk46: 6, ciws_burst: 20 } },
  { id: 'c28a_corvette', name: 'Adhafer-class (C28A)', cls: 'corvette', crew: 100, producers: ['CHN'], inService: 2015, unitCostUsdM: 300, detectionKm: 200, channels: 1, load: { yj83: 8, crotale_hq7: 8, yu7: 6, ciws_burst: 20 } },
  { id: 'tigr_corvette', name: 'Tigr-class (Project 20382)', cls: 'corvette', crew: 100, producers: ['RUS'], inService: 2023, unitCostUsdM: 250, detectionKm: 150, channels: 2, load: { kh35: 8, s400_9m96: 12, ciws_burst: 20 } },
  // Algeria's Nanuchkas were refitted with 16 Uran-E (2012-18).
  { id: 'nanuchka', name: 'Nanuchka-class (Project 1234E)', cls: 'corvette', crew: 60, producers: [], inService: 1980, unitCostUsdM: 40, detectionKm: 80, channels: 1, q: 0.6, load: { kh35: 16, osa_m_9m33: 20 } },
  { id: 'grisha', name: 'Grisha-class (Project 1124M)', cls: 'corvette', crew: 80, producers: [], inService: 1980, unitCostUsdM: 30, detectionKm: 40, channels: 1, q: 0.6, fp: { submarine: 0.04 }, load: { osa_m_9m33: 20, type53: 4 } },
  { id: 'bayandor', name: 'Bayandor-class (PF-103)', cls: 'corvette', crew: 140, producers: [], inService: 1964, unitCostUsdM: 15, detectionKm: 40, q: 0.4, load: { noor: 4 } },
  // Shahid Soleimani (2022) IRGCN catamaran: 6 anti-ship canisters plus VLS; load is an estimate.
  { id: 'shahid_soleimani', name: 'Shahid Soleimani-class catamaran corvette', cls: 'corvette', crew: 70, producers: ['IRN'], inService: 2022, unitCostUsdM: 60, speedKph: 55, rangeKm: 3000, detectionKm: 100, q: 0.7, load: { noor: 6 } },
  { id: 'espora_corvette', name: 'Espora-class (MEKO 140)', cls: 'corvette', crew: 93, producers: [], inService: 1985, unitCostUsdM: 120, detectionKm: 80, q: 0.7, load: { exocet_mm38: 4, mk46: 6 } },
  { id: 'barroso_corvette', name: 'Barroso-class corvette', cls: 'corvette', crew: 145, producers: [], inService: 2008, unitCostUsdM: 250, detectionKm: 150, load: { exocet: 4, mk46: 6 } },
  { id: 'inhauma_corvette', name: 'Inhaúma-class corvette', cls: 'corvette', crew: 120, producers: [], inService: 1989, unitCostUsdM: 150, detectionKm: 100, q: 0.7, load: { exocet: 4, mk46: 6 } },
  { id: 'descubierta_corvette', name: 'Descubierta-class corvette', cls: 'corvette', crew: 110, producers: [], inService: 1978, unitCostUsdM: 80, detectionKm: 80, channels: 1, q: 0.65, load: { exocet_mm38: 4, rim7_sea_sparrow: 24, mk46: 6 } },
  { id: 'corvette_k130', name: 'Braunschweig-class K130', cls: 'corvette', crew: 65, producers: ['DEU'], inService: 2008, unitCostUsdM: 300, stealth: 0.4, detectionKm: 150, channels: 2, q: 1.0, load: { rbs15: 4, ram_blk2: 42 } },
  // Skjold: surface-effect hull, ~60 kn; held at the catalog's 100 km/h sea-speed bound.
  { id: 'corvette_skjold', name: 'Skjold-class', cls: 'corvette', crew: 21, producers: [], inService: 2010, unitCostUsdM: 150, speedKph: 100, rangeKm: 1500, stealth: 0.7, detectionKm: 100, q: 1.0, load: { nsm: 8, mistral: 12 } },
  // Hamina after its 2019-22 MLU: Gabriel V and Umkhonto (VL MICA NG stands in).
  { id: 'corvette_hamina', name: 'Hamina-class', cls: 'corvette', crew: 30, producers: [], inService: 1998, unitCostUsdM: 80, speedKph: 60, rangeKm: 900, stealth: 0.5, detectionKm: 100, channels: 1, load: { gabriel5: 4, mica_ng: 8 } },
];

const patrol: PlatformSpec<Key>[] = [
  // Generic coastal patrol boat (30-60 m, 20-40 mm guns); the bulk of small-navy and coast-guard fleets.
  { id: 'patrol_craft', name: 'Coastal patrol craft (generic)', cls: 'patrol', crew: 20, producers: [], inService: 2000, unitCostUsdM: 10, speedKph: 55, rangeKm: 1500, fuelTph: 0.2, detectionKm: 40, q: 0.5 },
  // Gun and torpedo boats (Ku Song / Sin Hung, IRGCN Seraj / Ashura): no anti-ship missiles.
  { id: 'fast_attack_craft', name: 'Fast attack craft, gun/torpedo (generic)', cls: 'patrol', crew: 12, producers: ['IRN', 'PRK'], inService: 1995, unitCostUsdM: 2, speedKph: 80, rangeKm: 600, fuelTph: 0.15, armor: 0.05, stealth: 0.5, detectionKm: 20, q: 0.6 },
  // Osa / Soju (PRK, P-15 or Kumsong-3) and Kaman / Houdong / Sina (IRN, C-802 / Noor): loaded as Noor.
  { id: 'missile_boat', name: 'Missile boat (Osa/Soju/Kaman/Houdong)', cls: 'patrol', crew: 30, producers: ['IRN', 'PRK'], inService: 1985, unitCostUsdM: 20, speedKph: 65, rangeKm: 1500, fuelTph: 0.3, stealth: 0.4, detectionKm: 40, load: { noor: 4 } },
  // China Coast Guard ocean cutters (Zhaotou, Type 818): 76 mm gun, 3,000-12,000 t.
  { id: 'ccg_cutter', name: 'China Coast Guard large cutter', cls: 'patrol', crew: 100, producers: ['CHN'], inService: 2015, unitCostUsdM: 120, speedKph: 45, rangeKm: 15000, fuelTph: 1.5, armor: 0.15, detectionKm: 120, load: { shell_76_naval: 200 } },
  { id: 'ccg_patrol', name: 'China Coast Guard patrol ship (Type 718B class)', cls: 'patrol', crew: 50, producers: ['CHN'], inService: 2015, unitCostUsdM: 30, speedKph: 45, rangeKm: 6000, fuelTph: 0.6, detectionKm: 80 },
  { id: 'kuang_hua_vi', name: 'Kuang Hua VI missile boat', cls: 'patrol', crew: 19, producers: [], inService: 2003, unitCostUsdM: 20, speedKph: 56, rangeKm: 1900, fuelTph: 0.2, stealth: 0.45, detectionKm: 40, load: { harpoon: 4 } },
  // Tarantul III (1241.8): four P-270 Moskit, far heavier than a typical patrol boat.
  { id: 'molniya', name: 'Molniya / Tarantul III (Project 1241.8)', cls: 'patrol', crew: 44, producers: [], inService: 1987, unitCostUsdM: 40, speedKph: 76, rangeKm: 3000, fuelTph: 0.5, detectionKm: 60, fp: { ship: 0.06, aircraft: 0.01 }, load: { p270: 4, igla_s: 8 } },
  { id: 'saar45', name: "Sa'ar 4.5-class missile boat", cls: 'patrol', crew: 53, producers: [], inService: 1994, unitCostUsdM: 60, speedKph: 59, rangeKm: 4000, fuelTph: 0.5, detectionKm: 80, channels: 1, fp: { ship: 0.05 }, load: { harpoon: 8, barak1: 16 } },
  { id: 'kilic_fac', name: 'Kılıç-class fast attack craft', cls: 'patrol', crew: 45, producers: [], inService: 1998, unitCostUsdM: 80, speedKph: 70, rangeKm: 2000, fuelTph: 0.5, detectionKm: 80, fp: { ship: 0.05 }, load: { harpoon: 8 } },
  { id: 'azmat_fac', name: 'Azmat-class fast attack craft', cls: 'patrol', crew: 40, producers: ['CHN', 'PAK'], inService: 2012, unitCostUsdM: 40, speedKph: 55, rangeKm: 2000, fuelTph: 0.4, detectionKm: 80, fp: { ship: 0.05 }, load: { yj83: 8 } },
  { id: 'independence_lmv', name: 'Independence-class littoral mission vessel', cls: 'patrol', crew: 23, producers: ['SGP'], inService: 2017, unitCostUsdM: 100, speedKph: 50, rangeKm: 5500, fuelTph: 0.4, detectionKm: 120, channels: 1, load: { mica_ng: 12 } },
  { id: 'cape_patrol', name: 'Cape-class patrol boat', cls: 'patrol', crew: 22, producers: ['AUS'], inService: 2013, unitCostUsdM: 40, speedKph: 47, rangeKm: 7400, fuelTph: 0.3, detectionKm: 40 },
  { id: 'river_patrol', name: 'Riverine patrol boat (generic)', cls: 'patrol', crew: 6, producers: [], inService: 2005, unitCostUsdM: 1, speedKph: 50, rangeKm: 500, fuelTph: 0.05, armor: 0.05, detectionKm: 10, q: 0.3 },
  { id: 'oaxaca_opv', name: 'Oaxaca-class OPV', cls: 'patrol', crew: 75, producers: ['MEX'], inService: 2003, unitCostUsdM: 40, speedKph: 37, rangeKm: 6000, fuelTph: 0.5, detectionKm: 80, load: { shell_76_naval: 80 } },
  { id: 'holzinger_opv', name: 'Holzinger-class OPV', cls: 'patrol', crew: 75, producers: [], inService: 1999, unitCostUsdM: 30, speedKph: 37, rangeKm: 6000, fuelTph: 0.5, detectionKm: 60 },
  { id: 'durango_opv', name: 'Durango-class OPV', cls: 'patrol', crew: 75, producers: [], inService: 2000, unitCostUsdM: 40, speedKph: 37, rangeKm: 6000, fuelTph: 0.5, detectionKm: 60 },
  { id: 'gowind_opv', name: "Gowind OPV (L'Adroit-class)", cls: 'patrol', crew: 40, producers: ['FRA'], inService: 2019, unitCostUsdM: 90, speedKph: 39, rangeKm: 15000, fuelTph: 0.4, detectionKm: 80 },
  { id: 'thunder_opv', name: 'Thunder-class OPV (ex-Hamilton)', cls: 'patrol', crew: 160, producers: [], inService: 1967, unitCostUsdM: 20, speedKph: 52, rangeKm: 26000, fuelTph: 1.2, detectionKm: 60, load: { shell_76_naval: 80 } },
  { id: 'del_pilar_opv', name: 'Gregorio del Pilar-class OPV (ex-Hamilton)', cls: 'patrol', crew: 120, producers: [], inService: 1967, unitCostUsdM: 20, speedKph: 52, rangeKm: 26000, fuelTph: 1.2, detectionKm: 60, load: { shell_76_naval: 80 } },
  { id: 'centenary_opv', name: 'Centenary-class OPV (P18N)', cls: 'patrol', crew: 70, producers: ['CHN'], inService: 2016, unitCostUsdM: 45, speedKph: 40, rangeKm: 6500, fuelTph: 0.5, detectionKm: 60, load: { shell_76_naval: 80 } },
  { id: 'warrior_opv', name: 'Warrior-class OPV (ex-strike craft)', cls: 'patrol', crew: 52, producers: [], inService: 1977, unitCostUsdM: 15, speedKph: 59, rangeKm: 2400, fuelTph: 0.4, detectionKm: 40, load: { shell_76_naval: 80 } },
  { id: 'mmipv', name: 'Warrior-class MMIPV (Damen 6211)', cls: 'patrol', crew: 40, producers: ['ZAF', 'NLD'], inService: 2022, unitCostUsdM: 50, speedKph: 39, rangeKm: 7400, fuelTph: 0.3, detectionKm: 60 },
  { id: 'musherib_opv', name: 'Musherib-class OPV', cls: 'patrol', crew: 40, producers: ['ITA'], inService: 2022, unitCostUsdM: 150, speedKph: 48, rangeKm: 6000, fuelTph: 0.5, detectionKm: 100, load: { shell_76_naval: 80 } },
  { id: 'krabi_opv', name: 'Krabi-class OPV', cls: 'patrol', crew: 90, producers: ['THA'], inService: 2013, unitCostUsdM: 70, speedKph: 46, rangeKm: 6500, fuelTph: 0.5, detectionKm: 80, load: { harpoon: 4, shell_76_naval: 80 } },
  { id: 'arafura_opv', name: 'Arafura-class OPV', cls: 'patrol', crew: 40, producers: ['AUS'], inService: 2024, unitCostUsdM: 200, speedKph: 37, rangeKm: 7400, fuelTph: 0.4, detectionKm: 80 },
];

const mineAndSupport: PlatformSpec<Key>[] = [
  { id: 'mine_hunter', name: 'Aydın-class minehunter', cls: 'mine_warfare', crew: 40, producers: [], inService: 2005, unitCostUsdM: 70 },
  { id: 'awaji_mcm', name: 'Awaji-class MSO', cls: 'mine_warfare', crew: 48, producers: [], inService: 2017, unitCostUsdM: 170 },
  { id: 'enoshima_mcm', name: 'Enoshima-class MSC', cls: 'mine_warfare', crew: 45, producers: [], inService: 2012, unitCostUsdM: 130 },
  { id: 'hirashima_mcm', name: 'Hirashima-class MSC', cls: 'mine_warfare', crew: 45, producers: [], inService: 2008, unitCostUsdM: 130 },
  // Uraga MST: minesweeper tender that also lays mines (~230 Type 91 mines).
  { id: 'uraga_mcs', name: 'Uraga-class mine warfare support ship', cls: 'mine_warfare', crew: 160, producers: [], inService: 1997, unitCostUsdM: 300, speedKph: 41, rangeKm: 9000, fuelTph: 1, load: { sea_mine: 230 } },
  { id: 'yangyang_mcm', name: 'Yangyang-class MSH', cls: 'mine_warfare', crew: 56, producers: [], inService: 1999, unitCostUsdM: 120 },
  { id: 'ganggyeong_mcm', name: 'Ganggyeong-class MHC', cls: 'mine_warfare', crew: 40, producers: [], inService: 1986, unitCostUsdM: 50 },
  { id: 'yung_feng_mcm', name: 'Yung Feng-class MHC', cls: 'mine_warfare', crew: 50, producers: [], inService: 1991, unitCostUsdM: 60 },
  { id: 'huon_mcm', name: 'Huon-class MHC', cls: 'mine_warfare', crew: 40, producers: [], inService: 1999, unitCostUsdM: 140 },
  { id: 'towada_aor', name: 'Towada-class AOE', cls: 'replenishment', crew: 140, producers: [], inService: 1987, unitCostUsdM: 300, capacity: { cargoTons: 5700 } },
  { id: 'mashu_aor', name: 'Mashu-class AOE', cls: 'replenishment', crew: 145, producers: [], inService: 2004, unitCostUsdM: 400, capacity: { cargoTons: 10000 } },
  { id: 'soyang_aor', name: 'Soyang-class AOE', cls: 'replenishment', crew: 130, producers: ['KOR'], inService: 2018, unitCostUsdM: 300, capacity: { cargoTons: 10000 } },
  { id: 'panshih_aor', name: 'Panshih fast combat support ship', cls: 'replenishment', crew: 165, producers: [], inService: 2015, unitCostUsdM: 180, capacity: { cargoTons: 9000 } },
  { id: 'supply_aor', name: 'Supply-class AOR (Cantabria type)', cls: 'replenishment', crew: 60, producers: ['ESP'], inService: 2021, unitCostUsdM: 450, capacity: { cargoTons: 12000 } },
];

const submarines: PlatformSpec<Key>[] = [
  { id: 'type039', name: 'Type 039/039G Song', cls: 'ssk', crew: 60, producers: [], inService: 1999, unitCostUsdM: 150, stealth: 0.8, q: 0.85, load: { yu6: 18, yj83: 4 } },
  { id: 'type093', name: 'Type 093/093A Shang I/II SSN', cls: 'ssn', crew: 100, producers: [], inService: 2006, unitCostUsdM: 800, stealth: 0.75, detectionKm: 45, q: 0.9, load: { yu6: 24, yj83: 6 } },
  { id: 'sierra', name: 'Sierra II SSN (Project 945A)', cls: 'ssn', crew: 61, producers: [], inService: 1990, unitCostUsdM: 1000, stealth: 0.85, detectionKm: 55, q: 0.95, load: { type53: 22, type65_76: 8 } },
  { id: 'lada', name: 'Lada-class (Project 677)', cls: 'ssk', crew: 35, producers: ['RUS'], inService: 2010, unitCostUsdM: 400, stealth: 0.88, q: 1.0, load: { type53: 18, kalibr: 4 } },
  // North Korea's ballistic-missile boats are diesel-electric, so they override the nuclear ssbn template.
  { id: 'gorae', name: 'Gorae (Sinpo-B) SSB', cls: 'ssbn', crew: 50, producers: ['PRK'], inService: 2014, unitCostUsdM: 150, speedKph: 18, rangeKm: 3000, fuelTph: 0.2, stealth: 0.55, detectionKm: 15, q: 0.4, nuclear: true, load: { pukguksong3: 1, type53: 4 } },
  // Hero Kim Kun Ok (2023): ten vertical tubes reported, four sized for SLBMs; the rest assumed cruise missiles not yet catalogued.
  { id: 'sinpo_c', name: 'Hero Kim Kun Ok (Sinpo-C) SSB', cls: 'ssbn', crew: 80, producers: ['PRK'], inService: 2023, unitCostUsdM: 300, speedKph: 18, rangeKm: 5000, fuelTph: 0.3, stealth: 0.5, detectionKm: 20, q: 0.45, nuclear: true, load: { pukguksong3: 4, type53: 6 } },
  { id: 'oyashio', name: 'Oyashio-class', cls: 'ssk', crew: 70, producers: [], inService: 1998, unitCostUsdM: 500, stealth: 0.88, q: 1.1, load: { type89: 20, harpoon: 4 } },
  { id: 'chang_bogo', name: 'Chang Bogo-class (Type 209/1200)', cls: 'ssk', crew: 33, producers: [], inService: 1993, unitCostUsdM: 200, stealth: 0.82, q: 0.9, load: { baekeo: 12, harpoon: 2 } },
  { id: 'nagapasa', name: 'Nagapasa-class (DSME 209/1400)', cls: 'ssk', crew: 40, producers: ['KOR', 'IDN'], inService: 2017, unitCostUsdM: 350, stealth: 0.85, q: 0.95, load: { black_shark: 14 } },
  { id: 'cakra', name: 'Cakra-class (Type 209/1300)', cls: 'ssk', crew: 34, producers: [], inService: 1981, unitCostUsdM: 100, stealth: 0.78, q: 0.75, load: { sut_heavyweight: 14 } },
  { id: 'hai_lung', name: 'Hai Lung-class (Zwaardvis)', cls: 'ssk', crew: 67, producers: [], inService: 1987, unitCostUsdM: 200, stealth: 0.75, q: 0.8, load: { sut_heavyweight: 20, harpoon: 4 } },
  // Hai Shih: WWII-built Guppy II, recommissioned by Taiwan 1973; the oldest operational submarine in the world.
  { id: 'hai_shih', name: 'Hai Shih-class (Guppy II)', cls: 'ssk', crew: 75, producers: [], inService: 1973, unitCostUsdM: 20, speedKph: 14, rangeKm: 15000, stealth: 0.4, detectionKm: 20, q: 0.35, load: { sut_heavyweight: 10 } },
  { id: 'shishumar', name: 'Shishumar-class (Type 209/1500)', cls: 'ssk', crew: 40, producers: [], inService: 1986, unitCostUsdM: 200, stealth: 0.8, q: 0.85, load: { sut_heavyweight: 14, harpoon: 2 } },
  { id: 'agosta90b', name: 'Agosta 90B (Khalid-class, MESMA AIP)', cls: 'ssk', crew: 36, producers: [], inService: 1999, unitCostUsdM: 300, stealth: 0.87, q: 1.0, load: { sut_heavyweight: 16, exocet: 4 } },
  { id: 'agosta70', name: 'Agosta 70 (Hashmat-class)', cls: 'ssk', crew: 54, producers: [], inService: 1979, unitCostUsdM: 150, stealth: 0.75, q: 0.8, load: { sut_heavyweight: 20, harpoon: 4 } },
  { id: 'invincible_218sg', name: 'Invincible-class (Type 218SG)', cls: 'ssk', crew: 28, producers: ['DEU'], inService: 2024, unitCostUsdM: 500, stealth: 0.92, q: 1.15, load: { dm2a4: 16 } },
  { id: 'dolphin1', name: 'Dolphin I-class', cls: 'ssk', crew: 35, producers: [], inService: 1999, unitCostUsdM: 400, stealth: 0.85, q: 1.1, load: { dm2a4: 14, harpoon: 2 } },
  { id: 'dolphin2', name: 'Dolphin II-class (AIP)', cls: 'ssk', crew: 35, producers: ['DEU'], inService: 2014, unitCostUsdM: 600, stealth: 0.92, q: 1.15, load: { dm2a4: 14, harpoon: 2 } },
  { id: 'type209_1400', name: 'Type 209/1400mod (Egypt)', cls: 'ssk', crew: 30, producers: ['DEU'], inService: 2016, unitCostUsdM: 350, stealth: 0.85, q: 1.0, load: { dm2a4: 14 } },
  { id: 'preveze', name: 'Preveze-class (Type 209/1400)', cls: 'ssk', crew: 30, producers: [], inService: 1994, unitCostUsdM: 250, stealth: 0.84, q: 0.95, load: { mk48: 12, harpoon: 2 } },
  { id: 'gur', name: 'Gür-class (Type 209/1400)', cls: 'ssk', crew: 30, producers: [], inService: 2003, unitCostUsdM: 250, stealth: 0.85, q: 0.95, load: { mk48: 12, harpoon: 2 } },
  { id: 'atilay', name: 'Atılay-class (Type 209/1200)', cls: 'ssk', crew: 33, producers: [], inService: 1976, unitCostUsdM: 120, stealth: 0.78, q: 0.75, load: { sut_heavyweight: 14 } },
  { id: 'tupi', name: 'Tupi-class (Type 209/1400)', cls: 'ssk', crew: 30, producers: [], inService: 1989, unitCostUsdM: 200, stealth: 0.82, q: 0.85, load: { mk48: 16 } },
  { id: 'tikuna', name: 'Tikuna (improved Type 209)', cls: 'ssk', crew: 30, producers: [], inService: 2005, unitCostUsdM: 250, stealth: 0.84, q: 0.9, load: { mk48: 16 } },
  { id: 'salta_209', name: 'ARA Salta (Type 209/1200)', cls: 'ssk', crew: 31, producers: [], inService: 1974, unitCostUsdM: 80, stealth: 0.7, q: 0.6, load: { sut_heavyweight: 14 } },
  { id: 'santa_cruz_tr1700', name: 'Santa Cruz-class (TR-1700)', cls: 'ssk', crew: 30, producers: [], inService: 1984, unitCostUsdM: 200, stealth: 0.75, q: 0.65, load: { sut_heavyweight: 22 } },
  { id: 'heroine_209', name: 'Heroine-class (Type 209/1400MOD)', cls: 'ssk', crew: 30, producers: [], inService: 2006, unitCostUsdM: 300, stealth: 0.85, q: 0.95, load: { sut_heavyweight: 14 } },
  { id: 'ssn_rubis', name: 'Rubis-class SSN', cls: 'ssn', crew: 70, producers: [], inService: 1983, unitCostUsdM: 600, stealth: 0.78, detectionKm: 50, q: 0.85, load: { f21: 14, exocet: 4 } },
];

export const munitions: Munition[] = munitionSpecs.map(toMunition);
export const platforms: Platform[] = [...carriersAndAmphibs, ...destroyers, ...frigates, ...corvettes, ...patrol, ...mineAndSupport, ...submarines].map(toPlatform);

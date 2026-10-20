/**
 * Missile forces: ballistic and cruise missile launchers from SRBM to ICBM,
 * silos, coastal anti-ship batteries, ballistic-missile defense, strategic
 * early-warning radars and ground-launched ASAT.
 *
 * Launcher unit costs exclude the missiles they carry (those are priced on the
 * Munition). Silo costs are the silo plus a share of the launch-control
 * facility. Russian, Chinese, Iranian, North Korean, Indian and Pakistani
 * launcher costs are estimates. Nuclear-capable rows carry their nuclear
 * missile in `loadout`; dual-capable launchers whose normal load is
 * conventional (Iskander, DF-26, 9M729) are not flagged.
 */
import { toPlatform, type PlatformSpec } from './build';
import type { MunitionKey } from './munitions';

const tels: PlatformSpec<MunitionKey>[] = [
  { id: 'iskander_tel', name: '9P78-1 Iskander-M TEL', cls: 'tel_srbm', crew: 3, producers: ['RUS'], inService: 2006, unitCostUsdM: 10, load: { iskander_m: 2 } },
  // Russia's own 9K720 TELs fire both the 9M723 ballistic and the 9M728 (Iskander-K) cruise round; the load
  // lists the rounds a brigade keeps with each TEL. Export and Belarusian launchers use iskander_tel above.
  { id: 'iskander_mk_tel', name: '9P78-1 Iskander-M/K TEL', cls: 'tel_srbm', crew: 3, producers: ['RUS'], inService: 2006, unitCostUsdM: 10, load: { iskander_m: 2, iskander_k: 2 } },
  { id: 'tochka_tel', name: '9P129 Tochka-U TEL', cls: 'tel_srbm', crew: 3, producers: [], inService: 1989, unitCostUsdM: 3, armor: 0.15, load: { tochka_u: 1 } },
  { id: 'scud_tel', name: 'MAZ-543 Scud TEL', cls: 'tel_srbm', producers: [], inService: 1965, unitCostUsdM: 2, speedKph: 35, stealth: 0.3, load: { scud: 1 } },
  { id: 'df15_tel', name: 'DF-15B TEL', cls: 'tel_srbm', producers: ['CHN'], inService: 2015, unitCostUsdM: 5, load: { df15b: 1 } },
  { id: 'df11_tel', name: 'DF-11A TEL', cls: 'tel_srbm', producers: ['CHN'], inService: 1999, unitCostUsdM: 3, load: { df11a: 1 } },
  { id: 'kn23_tel', name: 'KN-23 TEL', cls: 'tel_srbm', producers: ['PRK'], inService: 2019, unitCostUsdM: 5, load: { kn23: 2 } },
  { id: 'fateh_tel', name: 'Fateh-110 / Fateh-313 TEL', cls: 'tel_srbm', producers: ['IRN'], inService: 2004, unitCostUsdM: 1, load: { fateh110: 1 } },
  { id: 'zolfaghar_tel', name: 'Zolfaghar TEL', cls: 'tel_srbm', producers: ['IRN'], inService: 2017, unitCostUsdM: 1.5, load: { zolfaghar: 1 } },
  { id: 'khalij_fars_tel', name: 'Khalij Fars TEL', cls: 'tel_srbm', producers: ['IRN'], inService: 2014, unitCostUsdM: 1, load: { khalij_fars: 1 } },
  { id: 'hyunmoo2_tel', name: 'Hyunmoo-2C TEL', cls: 'tel_srbm', producers: ['KOR'], inService: 2017, unitCostUsdM: 8, load: { hyunmoo2c: 1 } },
  { id: 'hyunmoo4_tel', name: 'Hyunmoo-4 TEL', cls: 'tel_srbm', producers: ['KOR'], inService: 2020, unitCostUsdM: 15, load: { hyunmoo4: 1 } },
  { id: 'prithvi_tel', name: 'Prithvi-II TEL', cls: 'tel_srbm', producers: ['IND'], inService: 1996, unitCostUsdM: 3, load: { prithvi2: 1 } },
  { id: 'lora_launcher', name: 'LORA launcher', cls: 'tel_srbm', producers: ['ISR'], inService: 2017, unitCostUsdM: 15, load: { lora: 4 } },
  { id: 'bora_tel', name: 'Bora TEL', cls: 'tel_srbm', producers: ['TUR'], inService: 2017, unitCostUsdM: 5, load: { bora: 2 } },
  { id: 'nasr_tel', name: 'Nasr TEL', cls: 'tel_srbm', producers: ['PAK'], inService: 2013, unitCostUsdM: 3, nuclear: true, load: { nasr: 4 } },
  { id: 'df16_tel', name: 'DF-16 TEL', cls: 'tel_mrbm', producers: ['CHN'], inService: 2015, unitCostUsdM: 6, load: { df16: 1 } },
  { id: 'df21d_tel', name: 'DF-21D TEL', cls: 'tel_mrbm', producers: ['CHN'], inService: 2010, unitCostUsdM: 8, load: { df21d: 1 } },
  { id: 'df21a_tel', name: 'DF-21A TEL', cls: 'tel_mrbm', producers: ['CHN'], inService: 1991, unitCostUsdM: 6, nuclear: true, load: { df21a: 1 } },
  { id: 'df17_tel', name: 'DF-17 TEL', cls: 'tel_mrbm', producers: ['CHN'], inService: 2020, unitCostUsdM: 10, load: { df17: 1 } },
  { id: 'kheibar_tel', name: 'Kheibar Shekan TEL', cls: 'tel_mrbm', producers: ['IRN'], inService: 2022, unitCostUsdM: 2, load: { kheibar_shekan: 1 } },
  { id: 'shahab3_tel', name: 'Shahab-3 / Ghadr TEL', cls: 'tel_mrbm', producers: ['IRN'], inService: 2003, unitCostUsdM: 2, load: { shahab3: 1 } },
  { id: 'emad_tel', name: 'Emad TEL', cls: 'tel_mrbm', producers: ['IRN'], inService: 2016, unitCostUsdM: 2, load: { emad: 1 } },
  { id: 'sejjil_tel', name: 'Sejjil TEL', cls: 'tel_mrbm', producers: ['IRN'], inService: 2012, unitCostUsdM: 3, load: { sejjil: 1 } },
  { id: 'khorramshahr_tel', name: 'Khorramshahr TEL', cls: 'tel_mrbm', producers: ['IRN'], inService: 2019, unitCostUsdM: 3, load: { khorramshahr: 1 } },
  { id: 'fattah_tel', name: 'Fattah-1 TEL', cls: 'tel_mrbm', producers: ['IRN'], inService: 2023, unitCostUsdM: 3, load: { fattah1: 1 } },
  { id: 'shaheen3_tel', name: 'Shaheen-III TEL', cls: 'tel_mrbm', producers: ['PAK'], inService: 2022, unitCostUsdM: 6, nuclear: true, load: { shaheen3: 1 } },
  { id: 'ghauri_tel', name: 'Ghauri TEL', cls: 'tel_mrbm', producers: ['PAK'], inService: 2003, unitCostUsdM: 3, nuclear: true, load: { ghauri: 1 } },
  { id: 'agni_p_tel', name: 'Agni-P canister TEL', cls: 'tel_mrbm', producers: ['IND'], inService: 2023, unitCostUsdM: 6, nuclear: true, load: { agni_p: 1 } },
  { id: 'nodong_tel', name: 'Hwasong-7 (Nodong) TEL', cls: 'tel_mrbm', producers: ['PRK'], inService: 1993, unitCostUsdM: 3, nuclear: true, load: { nodong: 1 } },
  { id: 'df26_tel', name: 'DF-26 TEL', cls: 'tel_irbm', producers: ['CHN'], inService: 2016, unitCostUsdM: 12, load: { df26: 1 } },
  { id: 'hwasong12_tel', name: 'Hwasong-12 TEL', cls: 'tel_irbm', producers: ['PRK'], inService: 2017, unitCostUsdM: 6, nuclear: true, load: { hwasong12: 1 } },
  { id: 'agni3_tel', name: 'Agni-III launcher', cls: 'tel_irbm', producers: ['IND'], inService: 2011, unitCostUsdM: 6, nuclear: true, load: { agni3: 1 } },
  // MZKT-79221 for Yars/Topol-M; ~3-4 mobile regiments patrol forests near bases (FAS).
  { id: 'yars_tel', name: 'RS-24 Yars mobile launcher', cls: 'icbm_mobile', producers: ['RUS'], inService: 2010, unitCostUsdM: 15, nuclear: true, load: { yars: 1 } },
  { id: 'topol_m_tel', name: 'Topol-M mobile launcher', cls: 'icbm_mobile', producers: ['RUS'], inService: 2006, unitCostUsdM: 12, nuclear: true, load: { topol_m: 1 } },
  { id: 'df41_tel', name: 'DF-41 TEL', cls: 'icbm_mobile', producers: ['CHN'], inService: 2017, unitCostUsdM: 15, nuclear: true, load: { df41: 1 } },
  { id: 'df31ag_tel', name: 'DF-31AG TEL', cls: 'icbm_mobile', producers: ['CHN'], inService: 2017, unitCostUsdM: 10, nuclear: true, load: { df31ag: 1 } },
  { id: 'hwasong15_tel', name: 'Hwasong-15 TEL (9-axle)', cls: 'icbm_mobile', producers: ['PRK'], inService: 2017, unitCostUsdM: 10, stealth: 0.3, nuclear: true, load: { hwasong15: 1 } },
  { id: 'hwasong17_tel', name: 'Hwasong-17 TEL (11-axle)', cls: 'icbm_mobile', producers: ['PRK'], inService: 2022, unitCostUsdM: 12, stealth: 0.25, nuclear: true, load: { hwasong17: 1 } },
  { id: 'hwasong18_tel', name: 'Hwasong-18 TEL', cls: 'icbm_mobile', producers: ['PRK'], inService: 2023, unitCostUsdM: 10, stealth: 0.35, nuclear: true, load: { hwasong18: 1 } },
  { id: 'agni5_tel', name: 'Agni-V canister TEL', cls: 'icbm_mobile', producers: ['IND'], inService: 2018, unitCostUsdM: 12, nuclear: true, load: { agni5: 1 } },
];

// Silos: armor 0.9-0.95 reflects ~2,000+ psi hardening; only nuclear or heavy penetrators threaten them.
const silos: PlatformSpec<MunitionKey>[] = [
  { id: 'minuteman3_silo', name: 'Minuteman III silo (LF)', cls: 'icbm_silo', producers: ['USA'], inService: 1970, unitCostUsdM: 30, armor: 0.95, nuclear: true, load: { minuteman3: 1 } },
  // Sentinel: initial operational capability slipped to the early 2030s (GAO-24, Nunn-McCurdy 2024).
  { id: 'sentinel_silo', name: 'Sentinel silo (new-build)', cls: 'icbm_silo', producers: ['USA'], inService: 2033, unitCostUsdM: 100, armor: 0.95, nuclear: true, load: { sentinel: 1 } },
  { id: 'yars_silo', name: 'Yars silo', cls: 'icbm_silo', producers: ['RUS'], inService: 2014, unitCostUsdM: 30, armor: 0.92, nuclear: true, load: { yars: 1 } },
  { id: 'sarmat_silo', name: 'Sarmat silo', cls: 'icbm_silo', producers: ['RUS'], inService: 2023, unitCostUsdM: 50, armor: 0.95, nuclear: true, load: { sarmat: 1 } },
  { id: 'r36m2_silo', name: 'R-36M2 Voevoda silo', cls: 'icbm_silo', producers: [], inService: 1988, unitCostUsdM: 40, armor: 0.95, nuclear: true, load: { r36m2: 1 } },
  { id: 'avangard_silo', name: 'Avangard silo (UR-100N UTTKh)', cls: 'icbm_silo', producers: ['RUS'], inService: 2019, unitCostUsdM: 40, armor: 0.93, nuclear: true, load: { avangard: 1 } },
  { id: 'df5b_silo', name: 'DF-5B silo', cls: 'icbm_silo', producers: ['CHN'], inService: 2015, unitCostUsdM: 30, armor: 0.9, nuclear: true, load: { df5b: 1 } },
  // ~320 new silos at Yumen, Hami and Ordos; DoD CMPR 2024 assesses some loaded.
  { id: 'df41_silo', name: 'DF-41 silo (western silo fields)', cls: 'icbm_silo', producers: ['CHN'], inService: 2023, unitCostUsdM: 25, armor: 0.92, nuclear: true, load: { df41: 1 } },
];

const cruiseAndCoastal: PlatformSpec<MunitionKey>[] = [
  { id: 'ssc8_launcher', name: '9K720 launcher with 9M729', cls: 'cruise_launcher', producers: ['RUS'], inService: 2017, unitCostUsdM: 12, load: { r9m729: 4 } },
  // Typhon (Mid-Range Capability): deployed to the Philippines in 2024.
  { id: 'typhon', name: 'Typhon MRC launcher', cls: 'cruise_launcher', producers: ['USA'], inService: 2023, unitCostUsdM: 50, load: { tomahawk: 4 } },
  { id: 'cj10_tel', name: 'CJ-10 GLCM TEL', cls: 'cruise_launcher', producers: ['CHN'], inService: 2009, unitCostUsdM: 8, load: { cj10: 3 } },
  { id: 'cj100_tel', name: 'CJ-100 TEL', cls: 'cruise_launcher', producers: ['CHN'], inService: 2019, unitCostUsdM: 12, load: { cj100: 2 } },
  { id: 'babur_tel', name: 'Babur TEL', cls: 'cruise_launcher', producers: ['PAK'], inService: 2005, unitCostUsdM: 5, load: { babur: 3 } },
  { id: 'hyunmoo3_tel', name: 'Hyunmoo-3 TEL', cls: 'cruise_launcher', producers: ['KOR'], inService: 2010, unitCostUsdM: 8, load: { hyunmoo3c: 2 } },
  { id: 'hf2e_tel', name: 'Hsiung Feng IIE TEL', cls: 'cruise_launcher', producers: ['TWN'], inService: 2011, unitCostUsdM: 8, load: { hf2e: 4 } },
  { id: 'iran_lacm_tel', name: 'Soumar / Paveh cruise launcher', cls: 'cruise_launcher', producers: ['IRN'], inService: 2019, unitCostUsdM: 2, load: { soumar: 1, paveh: 2 } },
  { id: 'bastion_p', name: 'K-300P Bastion-P launcher', cls: 'coastal_asm', producers: ['RUS'], inService: 2010, unitCostUsdM: 20, detectionKm: 450, load: { oniks: 2 } },
  { id: 'bal', name: 'K-300 Bal launcher', cls: 'coastal_asm', producers: ['RUS'], inService: 2008, unitCostUsdM: 15, load: { kh35: 8 } },
  { id: 'yj12_coastal', name: 'YJ-12B coastal TEL', cls: 'coastal_asm', producers: ['CHN'], inService: 2015, unitCostUsdM: 10, load: { yj12: 2 } },
  { id: 'yj62_coastal', name: 'YJ-62 coastal TEL', cls: 'coastal_asm', producers: ['CHN'], inService: 2005, unitCostUsdM: 6, load: { yj62: 3 } },
  { id: 'nsm_cds', name: 'NSM Coastal Defence System', cls: 'coastal_asm', producers: ['NOR'], inService: 2013, unitCostUsdM: 20, load: { nsm: 4 } },
  { id: 'nmesis', name: 'NMESIS (USMC)', cls: 'coastal_asm', crew: 0, producers: ['USA'], inService: 2023, unitCostUsdM: 15, load: { nsm: 2 } },
  { id: 'type12_ssm_tel', name: 'Type 12 SSM launcher', cls: 'coastal_asm', producers: ['JPN'], inService: 2012, unitCostUsdM: 15, load: { type12_ssm: 6 } },
  { id: 'brahmos_coastal', name: 'BrahMos coastal / land battery launcher', cls: 'coastal_asm', producers: ['IND'], inService: 2007, unitCostUsdM: 20, load: { brahmos: 3 } },
  { id: 'hf3_coastal', name: 'Hsiung Feng III coastal TEL', cls: 'coastal_asm', producers: ['TWN'], inService: 2007, unitCostUsdM: 10, load: { hf3: 4 } },
  { id: 'harpoon_cds', name: 'Harpoon Coastal Defense System', cls: 'coastal_asm', producers: ['USA'], inService: 2023, unitCostUsdM: 10, load: { harpoon: 4 } },
  { id: 'neptune_tel', name: 'R-360 Neptune coastal TEL', cls: 'coastal_asm', producers: ['UKR'], inService: 2021, unitCostUsdM: 5, load: { neptune: 4 } },
  { id: 'exocet_coastal', name: 'MM40 Exocet coastal battery', cls: 'coastal_asm', producers: ['FRA'], inService: 2005, unitCostUsdM: 10, load: { exocet: 4 } },
  { id: 'rbs15_coastal', name: 'RBS-15 coastal launcher', cls: 'coastal_asm', producers: ['SWE'], inService: 2004, unitCostUsdM: 10, load: { rbs15: 4 } },
  { id: 'iran_coastal_asm', name: 'Ghader / Noor coastal launcher', cls: 'coastal_asm', producers: ['IRN'], inService: 2011, unitCostUsdM: 2, load: { noor: 2 } },
  { id: 'abu_mahdi_tel', name: 'Abu Mahdi coastal launcher', cls: 'coastal_asm', producers: ['IRN'], inService: 2023, unitCostUsdM: 3, load: { abu_mahdi: 2 } },
];

const missileDefense: PlatformSpec<MunitionKey>[] = [
  // THAAD: ~$1B per battery excl. interceptors (MDA); 6 launchers x 8 rounds, AN/TPY-2 in terminal mode.
  { id: 'thaad', name: 'THAAD launcher', cls: 'abm', crew: 16, producers: ['USA'], inService: 2008, unitCostUsdM: 170, detectionKm: 1000, channels: 2, load: { thaad_int: 8 } },
  { id: 'arrow3_launcher', name: 'Arrow 3 launcher', cls: 'abm', crew: 10, producers: ['ISR', 'USA'], inService: 2017, unitCostUsdM: 150, detectionKm: 900, channels: 2, load: { arrow3: 6 } },
  { id: 'arrow2_launcher', name: 'Arrow 2 launcher', cls: 'abm', crew: 10, producers: ['ISR', 'USA'], inService: 2000, unitCostUsdM: 80, detectionKm: 500, channels: 2, load: { arrow2: 6 } },
  { id: 's500', name: 'S-500 Prometey launcher', cls: 'abm', crew: 8, producers: ['RUS'], inService: 2021, unitCostUsdM: 150, detectionKm: 800, channels: 2, load: { s500_77n6: 2, s400_40n6: 2 } },
  { id: 'hq19_launcher', name: 'HQ-19 launcher', cls: 'abm', crew: 8, producers: ['CHN'], inService: 2021, unitCostUsdM: 100, detectionKm: 1500, channels: 2, load: { hq19: 2 } },
  { id: 'gmd_gbi', name: 'GMD Ground-Based Interceptor silo', cls: 'abm', crew: 3, producers: ['USA'], inService: 2004, unitCostUsdM: 30, speedKph: 0, rangeKm: 0, fuelTph: 0, armor: 0.85, stealth: 0, detectionKm: 4000, channels: 1, load: { gbi: 1 } },
  { id: 'aegis_ashore', name: 'Aegis Ashore site', cls: 'abm', crew: 140, producers: ['USA'], inService: 2016, unitCostUsdM: 800, speedKph: 0, rangeKm: 0, fuelTph: 0, armor: 0.3, stealth: 0, detectionKm: 1000, channels: 4, load: { sm3_iia: 12, sm3_ib: 12 } },
  // A-235 nuclear-tipped 53T6 interceptors around Moscow.
  { id: 'a235', name: 'A-235 Moscow ABM silo (53T6M)', cls: 'abm', crew: 3, producers: ['RUS'], inService: 1995, unitCostUsdM: 60, speedKph: 0, rangeKm: 0, fuelTph: 0, armor: 0.85, stealth: 0, detectionKm: 1500, channels: 1, nuclear: true, load: { a235_53t6: 1 } },
  { id: 'an_tpy2', name: 'AN/TPY-2 forward-based radar', cls: 'radar', crew: 30, producers: ['USA'], inService: 2008, unitCostUsdM: 200, detectionKm: 2000 },
  { id: 'uewr', name: 'Upgraded Early Warning Radar (PAVE PAWS)', cls: 'radar', crew: 100, producers: ['USA'], inService: 1980, unitCostUsdM: 300, speedKph: 0, rangeKm: 0, fuelTph: 0, armor: 0.2, detectionKm: 5000 },
  { id: 'voronezh', name: 'Voronezh-DM early-warning radar', cls: 'radar', crew: 100, producers: ['RUS'], inService: 2012, unitCostUsdM: 200, speedKph: 0, rangeKm: 0, fuelTph: 0, armor: 0.2, detectionKm: 6000 },
  { id: 'lpar_cn', name: 'Chinese large phased-array early-warning radar', cls: 'radar', crew: 100, producers: ['CHN'], inService: 2018, unitCostUsdM: 200, speedKph: 0, rangeKm: 0, fuelTph: 0, armor: 0.2, detectionKm: 5000 },
];

// Ground-launched ASAT: domain is land because the launcher is a ground vehicle; pk is on the interceptor.
const asat: PlatformSpec<MunitionKey>[] = [
  { id: 'nudol', name: 'A-235 PL-19 Nudol ASAT launcher', cls: 'asat', domain: 'land', producers: ['RUS'], inService: 2021, unitCostUsdM: 50, load: { nudol_int: 1 } },
  { id: 'sc19_tel', name: 'SC-19 / DN-1 ASAT TEL', cls: 'asat', domain: 'land', producers: ['CHN'], inService: 2007, unitCostUsdM: 30, load: { sc19_int: 1 } },
  { id: 'dn3_tel', name: 'DN-3 ASAT launcher', cls: 'asat', domain: 'land', producers: ['CHN'], inService: 2018, unitCostUsdM: 40, load: { dn3_int: 1 } },
  { id: 'pdv_launcher', name: 'PDV Mk-II launcher (Mission Shakti)', cls: 'asat', domain: 'land', producers: ['IND'], inService: 2019, unitCostUsdM: 20, load: { pdv_mk2: 1 } },
];

export const strategicPlatforms = [...tels, ...silos, ...cruiseAndCoastal, ...missileDefense, ...asat].map(toPlatform);

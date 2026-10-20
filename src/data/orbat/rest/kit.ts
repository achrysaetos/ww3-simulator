import type { PlatformClass } from '../../../core/types';

/**
 * Every catalog platform id this folder fields, grouped by platform class. The weapons
 * catalog is written in parallel, so this registry is the reconciliation list: each id
 * here must exist in the catalog with a matching class. The class also lets tests total
 * tanks, combat aircraft, principal surface combatants and submarines per nation.
 */
const BY_CLASS = {
  infantry: ['infantry_squad'],
  mbt: [
    'type10', 'type90', 'k2_black_panther', 'k1a2', 'k1a1', 'k1', 't80u', 'm48a5', 'm48a5t', 'm1a2t', 'cm11', 'cm12', 'm60a3', 'm60a1',
    'm60t_sabra', 'm60_phoenix', 'm1a1', 'm1a2s', 't90s', 't72', 't72ms', 't62', 't55', 'type59', 'type69', 'type85', 'arjun',
    'al_khalid', 'al_zarrar', 't80ud', 'vt4', 'vt1', 'leopard2a4', 'leopard2ri', 'leopard2sg', 'leopard2a7', 'leopard1', 'leopard1a5br',
    't84_oplot', 'merkava4', 'amx30', 'leclerc', 'ramses2', 'tam', 'vickers_mk3', 'olifant2', 'm84',
  ],
  ifv: [
    'type89_ifv', 'k21_ifv', 'bmp1', 'bmp2', 'bmp3', 'bmp3f', 'cm34_ifv', 'marder1a3', 'bvp2', 'bvp_m80', 'm2a2_bradley', 'amx10p',
    'ybs_ifv', 'vci_tam', 'hunter_afv', 'bionix2', 'lav25', 'acv15', 'ratel', 'vn1',
  ],
  apc: [
    'type73_apc', 'type96_apc', 'k200', 'aav7', 'kaav7', 'lvtp7', 'm113', 'm113as4', 'cm32_apc', 'btr60', 'btr80', 'btr82a', 'btr3e1',
    'btr3u', 'anoa_apc', 'terrex', 'simba_apc', 'fahd_apc', 'guarani', 'urutu', 'piranha', 'vab', 'dn_xi', 'otokar_cobra', 'kirpi_mrap',
    'mrap', 'nimr', 'casspir', 'lazar3', 'bushmaster', 'namer', 'eitan', 'wz551',
  ],
  recon: [
    'type16_mcv', 'boxer_crv', 'cascavel', 'rooikat', 'erc90_sagaie', 'panhard_aml', 'sabrah_light_tank', 'stingray_light_tank', 'pt76',
    'technical', 'humvee',
  ],
  sp_artillery: [
    'type99_sph', 'type19_sph', 'k9_thunder', 'k9_vajra', 'k55', 'm109', 'm109a3', 'm109a5', 'm110', 'msta_s', 'pzh2000', 'caesar',
    'atmos_sph', 'ssph_primus', 't155_firtina', 'g6_sph', 'sh15_sph', 'dana_sph', 'nora_b52', 'vca_palmaria', 'm52t',
  ],
  towed_artillery: [
    'fh70', 'm114', 'm101', 'm198', 'm46', 'm777', 'd30', 'kh179', 'g5', 'dhanush', 'ind_105mm_lfg', 'type59_1_gun', 'oto_melara_mod56',
    'fh2000', 'msta_b', 'atags',
  ],
  mlrs: [
    'm270', 'himars', 'k239_chunmoo', 'k136_kooryong', 'ravs_mlrs', 'pinaka', 'smerch', 'bm21', 'a100_mlrs', 'fatah_mlrs', 'astros2',
    'jobaria_mlrs', 'pulse_mlrs', 't122_sakarya', 't300_kasirga', 'polonez_mlrs', 'lynx_mlrs', 'tos1a', 'phl03', 'dti1_mlrs', 'sr4_mlrs',
    'rm70', 'm77_oganj', 'sumadija_mlrs', 'bateleur', 'type63_mlrs',
  ],
  atgm: ['spike_ngl_launcher'],
  truck: ['truck'],
  sam_long: [
    'patriot_pac3', 'patriot_pac2', 's400_launcher', 's300pmu1', 's300pmu2', 's300ps', 's300vm_launcher', 'tien_kung_3', 'hq9p_launcher',
    'aster30_samp_t', 'fd2000b', 's75_dvina', 'fk3_launcher', 'davids_sling_launcher', 'l_sam_launcher',
  ],
  sam_medium: [
    'type03_chusam_launcher', 'km_sam_launcher', 'nasams', 'akash_launcher', 'mrsam_launcher', 'barak8_launcher', 'barak_mx', 'spyder',
    'buk_m1', 'buk_m2', 'hq16fe_launcher', 'ly80_launcher', 'hawk', 's125_pechora', 'kvadrat', 'kub_2k12', 'hisar_o',
  ],
  shorad: [
    'type11_shorad', 'type87_spaag', 'chunma_shorad', 'tunguska', 'zsu_23_4', 'osa_ak', 'tor_m2', 'pantsir_s1', 'avenger', 'rbs70',
    'starstreak', 'gdf_35mm', 'flakpanzer_gepard', 'korkut', 'hisar_a', 'fm90', 'chaparral', 'mistral_team', 'stinger_team', 'crotale', 'shahine',
    'iron_dome_launcher', 'iron_beam',
  ],
  abm: ['arrow2_launcher', 'arrow3_launcher', 'thaad_launcher'],
  radar: ['green_pine_radar'],
  tel_srbm: [
    'hyunmoo2_tel', 'ktssm_launcher', 'scud_b_tel', 'iskander_e_tel', 'bora_tel', 'j600t_yildirim', 'lora_launcher', 'prithvi2_tel',
    'nasr_tel', 'ghaznavi_tel', 'abdali_tel', 'shaheen1_tel',
  ],
  tel_mrbm: ['agni1_tel', 'agni2_tel', 'ghauri_tel', 'shaheen2_tel', 'df21_tel', 'jericho2_tel', 'ababeel_tel'],
  tel_irbm: ['agni3_tel', 'agni4_tel', 'shaheen3_tel'],
  icbm_mobile: ['agni5_tel'],
  icbm_silo: ['jericho3_silo'],
  cruise_launcher: ['hyunmoo3_launcher', 'babur_tel', 'brahmos_tel', 'hsiung_feng_2e_tel'],
  coastal_asm: ['type12_ssm_launcher', 'hsiung_feng_3', 'hsiung_feng_2_coastal', 'harpoon_coastal', 'brahmos_coastal', 'bastion_p', 'zarb_coastal'],
  fighter: ['f15j', 'f15c', 'f5e', 'f5em', 'mig21', 'mig23', 'mig29', 'su27', 'f7', 'f7pg'],
  multirole: [
    'f35a', 'f35b', 'f35i', 'mitsubishi_f2', 'f15k', 'f15i', 'f15sa', 'f15sg', 'f15qa', 'kf16', 'f16c', 'f16a', 'f16v', 'f16e', 'f16i',
    'fa50', 'fa50ph', 'f_ck_1', 'mirage2000', 'mirage2000_5', 'mirage2000_9', 'mirage3', 'mirage5', 'mirage_f1', 'su30mki', 'su30mk2',
    'su30mka', 'su30sm', 'su30k', 'rafale', 'tejas', 'mig29k', 'mig29m', 'jf17', 'j10ce', 'typhoon', 'gripen_c', 'gripen_e', 'fa18f',
    'f4e_2020',
  ],
  attack_aircraft: [
    'jaguar', 'tornado_ids', 'su24', 'su25', 'su22', 'a29', 'emb314', 'k8', 'hawk200', 'hawk_mk120', 't50i', 't50th', 't50iq',
    'alpha_jet', 'l159', 'yak130', 'ia63_pampa', 'ia58_pucara', 'pc7', 'at6th', 'a4ar', 'af1_skyhawk', 'a1m_amx', 'j22_orao',
  ],
  awacs: ['e2c', 'e2d', 'e767', 'e7a', 'e7t', 'e3a', 'e99', 'a50ei', 'netra_aewc', 'saab2000_erieye', 'saab340_aew', 'g550_caew', 'globaleye', 'zdk03_aewc'],
  tanker: ['kc767', 'kc46a', 'kc30a', 'kc330', 'a330_mrtt', 'kc135r', 'kc707', 'il78', 'kc130h'],
  transport_aircraft: ['c130h', 'c130j', 'c130bz', 'c17', 'c2', 'a400m', 'il76', 'cn235', 'cn295', 'c295', 'kc390', 'an26', 'y8'],
  maritime_patrol: ['p1', 'p3c', 'p8a', 'p8i', 'atr72_mpa'],
  ew_aircraft: ['ea18g'],
  isr_drone: ['mq4c', 'mq9b', 'hermes900', 'heron_tp'],
  strike_drone: ['bayraktar_tb2', 'akinci_ucav', 'anka_s', 'wing_loong1', 'wing_loong2'],
  loitering_munition_launcher: ['harop_launcher'],
  attack_helo: ['ah64d', 'ah64e', 'ah1s', 'ah1w', 'ah1f', 't129_atak', 'tiger_arh', 'lch_prachand', 'rooivalk', 'ka52', 'mi28n', 'mi28ne', 'mi35', 'mi24', 'z10me'],
  transport_helo: [
    'uh60', 'uh60ja', 'uh60m', 's70a', 's70i_blackhawk', 'kuh1', 'ch47j', 'ch47d', 'ch47f', 'ch47sd', 'ch53d', 'uh1h', 'uh1j', 'mi8', 'mi17',
    'bell412', 'as365', 'as550_fennec', 'a109', 'h145m', 'hm1_pantera', 'hm4_jaguar', 'alh_dhruv', 'chetak', 'oryx', 'nh90', 'v22', 'oh58d', 'z9',
  ],
  asw_helo: ['sh60k', 'mh60r', 'super_lynx', 'sea_king', 's70b'],
  carrier: ['izumo', 'hyuga', 'ins_vikrant', 'ins_vikramaditya', 'chakri_naruebet'],
  destroyer: [
    'kongo', 'atago', 'maya', 'akizuki', 'asahi', 'takanami', 'murasame', 'asagiri', 'sejong', 'jeongjo_the_great', 'chungmugong_yi_sun_sin',
    'gwanggaeto', 'kee_lung', 'hobart', 'visakhapatnam', 'kolkata', 'delhi', 'rajput', 'almirante_brown',
  ],
  frigate: [
    'mogami', 'abukuma', 'incheon', 'daegu', 'chungnam', 'cheng_kung', 'kang_ding', 'anzac', 'talwar', 'brahmaputra', 'nilgiri', 'tushil',
    'shivalik', 'tughril', 'zulfiquar', 'babur_milgem', 'jose_rizal', 'gepard_frigate', 'martadinata', 'ahmad_yani', 'formidable', 'naresuan',
    'bhumibol_adulyadej', 'chao_phraya', 'phutthayotfa_chulalok', 'al_riyadh', 'madina', 'fremm', 'meko_a200', 'oliver_hazard_perry',
    'jianghu', 'barbaros', 'yavuz', 'gabya', 'istanbul_frigate', 'niteroi', 'tamandare', 'reformador', 'koni', 'sigma_frigate', 'floreal',
    'valour', 'petya_frigate',
  ],
  corvette: [
    'pohang_corvette', 'kora_corvette', 'khukri_corvette', 'kamorta_corvette', 'yarmook_corvette', 'miguel_malvar_corvette',
    'bung_tomo_corvette', 'diponegoro_corvette', 'fatahillah_corvette', 'parchim_corvette', 'rattanakosin_corvette', 'al_jubail_corvette',
    'badr_corvette', 'baynunah', 'abu_dhabi_corvette', 'gowind', 'saar5', 'saar6', 'ada_corvette', 'barroso_corvette', 'inhauma_corvette',
    'espora_corvette', 'c28a_corvette', 'tigr_corvette', 'nanuchka', 'descubierta_corvette', 'al_zubarah_corvette', 'mmsc_tuwaiq',
  ],
  patrol: [
    'patrol_craft', 'kuang_hua_vi', 'tuo_chiang', 'del_pilar_opv', 'molniya', 'saar45', 'kilic_fac', 'azmat_fac', 'independence_lmv',
    'krabi_opv', 'arafura_opv', 'cape_patrol', 'river_patrol', 'oaxaca_opv', 'holzinger_opv', 'durango_opv', 'gowind_opv', 'thunder_opv',
    'centenary_opv', 'warrior_opv', 'mmipv', 'musherib_opv',
  ],
  mine_warfare: ['awaji_mcm', 'enoshima_mcm', 'hirashima_mcm', 'uraga_mcs', 'yangyang_mcm', 'ganggyeong_mcm', 'huon_mcm', 'yung_feng_mcm', 'mine_hunter'],
  amphibious: [
    'osumi_lst', 'cheonwangbong_lst', 'dokdo', 'yu_shan_lpd', 'newport_lst', 'canberra_lhd', 'choules_lsd', 'jalashwa_lpd', 'shardul_lst',
    'tarlac_lpd', 'makassar_lpd', 'endurance_lpd', 'angthong_lpd', 'mistral', 'tcg_anadolu', 'bayraktar_lst', 'bahia_lpd', 'atlantico',
    'al_fulk_lpd', 'kalaat_beni_abbes_lpd',
  ],
  replenishment: ['mashu_aor', 'towada_aor', 'soyang_aor', 'panshih_aor', 'supply_aor'],
  ssk: [
    'taigei', 'soryu', 'oyashio', 'dosan_ahn_changho', 'son_won_il', 'chang_bogo', 'hai_lung', 'hai_shih', 'collins', 'kalvari', 'shishumar',
    'sindhughosh', 'agosta90b', 'agosta70', 'kilo', 'kilo_636', 'nagapasa', 'cakra', 'invincible_218sg', 'archer', 'dolphin1', 'dolphin2',
    'type209_1400', 'romeo', 'preveze', 'gur', 'atilay', 'reis_214tn', 'riachuelo', 'tupi', 'tikuna', 'salta_209', 'santa_cruz_tr1700',
    'heroine_209',
  ],
  ssbn: ['arihant'],
} as const satisfies Partial<Record<PlatformClass, readonly string[]>>;

export type KitId = (typeof BY_CLASS)[keyof typeof BY_CLASS][number];

export const KIT_CLASS = {} as Record<KitId, PlatformClass>;
for (const [cls, ids] of Object.entries(BY_CLASS) as [PlatformClass, readonly KitId[]][])
  for (const id of ids) {
    // One id naming two platforms (the Gepard SPAAG and the Gepard frigate) would silently merge them.
    if (KIT_CLASS[id]) throw new Error(`kit id ${id} listed as both ${KIT_CLASS[id]} and ${cls}`);
    KIT_CLASS[id] = cls;
  }

/** Munitions named in `extraMagazine`; same reconciliation role as the platform registry. */
export const MUNITION_KIT = [
  'tamir', 'stunner', 'arrow2', 'arrow3', 'nuclear_gravity_bomb', 'popeye_turbo_slcm', 'babur3_slcm', 'kalibr_club',
] as const;
export type MunitionKitId = (typeof MUNITION_KIT)[number];

export const KIT_IDS_BY_CLASS: Readonly<Partial<Record<PlatformClass, readonly KitId[]>>> = BY_CLASS;

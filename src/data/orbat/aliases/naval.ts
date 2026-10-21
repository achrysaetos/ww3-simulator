/** ORBAT id -> catalog id where both name the same system (naval slice). */
export const aliases: Record<string, string> = {
  cv_liaoning: 'liaoning',
  cv_shandong: 'shandong',
  cv_fujian: 'fujian',
  ins_vikrant: 'vikrant',
  ins_vikramaditya: 'vikramaditya',
  mistral: 'mistral_lhd',
  tcg_anadolu: 'anadolu',
  chungmugong_yi_sun_sin: 'kdx2',
  moudge: 'jamaran',
  tughril: 'type054a',
  tushil: 'talwar',
  istanbul_frigate: 'istif',
  // Valour-class is the South African MEKO A-200SAN.
  valour: 'meko_a200',
  kamorta_corvette: 'kamorta',
  ada_corvette: 'ada',
  // PNS Babur is the Pakistani MILGEM (Ada-class derivative, ~15% larger, similar launchers).
  babur_milgem: 'ada',
  kilo_636: 'kilo636',
  kilo_877: 'kilo877',
  // 6 of the 8 boats under this id are Vietnam's 636.1; Algeria's two 877EKMs were refitted with Club-S.
  kilo: 'kilo636',
  sindhughosh: 'kilo877',
  type039a: 'type039c',
  type094: 'type094a',
  delta_iv: 'delta4',
  oscar_ii: 'oscar2',
  // Severodvinsk (885) differs from 885M chiefly in noise and electronics.
  yasen: 'yasen_m',
  fateh_sub: 'fateh_ssk',
  // Nahang: a single larger midget boat with the same two-tube Valfajr armament.
  nahang: 'ghadir',
  son_won_il: 'type214',
  reis_214tn: 'type214',
  kalvari: 'scorpene',
  riachuelo: 'scorpene',
  // Western order of battle (src/data/orbat/west): same class under another id.
  cvn_nimitz: 'nimitz', cvn_ford: 'gerald_r_ford', cv_queen_elizabeth: 'queen_elizabeth',
  cvn_charles_de_gaulle: 'charles_de_gaulle', cv_cavour: 'cavour',
  lha_america: 'america_lha', lhd_wasp: 'wasp_lhd', lhd_mistral: 'mistral_lhd', lhd_juan_carlos: 'juan_carlos',
  lhd_anadolu: 'anadolu', lpd_san_antonio: 'san_antonio',
  cg_ticonderoga: 'ticonderoga', ddg_zumwalt: 'zumwalt',
  ddg_arleigh_burke_flt1: 'burke_flt1', ddg_arleigh_burke_flt2a: 'burke_flt2a', ddg_arleigh_burke_flt3: 'burke_flt3',
  ddg_type45: 'type45', ddg_horizon: 'horizon',
  ffg_fremm: 'fremm', ffg_fdi: 'fdi', ffg_floreal: 'floreal', ffg_la_fayette: 'kang_ding',
  ffg_type23: 'type23', ffg_halifax: 'halifax', ffg_f100: 'alvaro_de_bazan', ffg_nansen: 'fridtjof_nansen',
  ffg_f124: 'sachsen', ffg_f125: 'baden_wurttemberg', ffg_de_zeven_provincien: 'de_zeven_provincien',
  ffg_iver_huitfeldt: 'iver_huitfeldt', ffg_gabya: 'gabya', ffg_barbaros: 'barbaros', ffg_yavuz: 'yavuz',
  ffg_istanbul: 'istif', ffg_oliver_hazard_perry: 'oliver_hazard_perry',
  // Santa Maria-class is the Spanish-built Oliver Hazard Perry.
  ffg_santa_maria: 'oliver_hazard_perry',
  ffg_bartolomeu_dias: 'ffg_karel_doorman',
  // Hydra (MEKO 200HN) and Vasco da Gama (MEKO 200PN) are Barbaros's MEKO 200 sisters: 8 Harpoon, Sea Sparrow/ESSM.
  ffg_hydra: 'barbaros', ffg_vasco_da_gama: 'barbaros',
  corvette_ada: 'ada', corvette_visby: 'visby',
  lcs_freedom: 'lcs', lcs_independence: 'lcs',
  t_ao: 'kaiser', t_ake: 'lewis_and_clark', tide_tanker: 'tide_class', egv_berlin: 'berlin_class',
  ssbn_ohio: 'ohio_ssbn', ssgn_ohio: 'ohio_ssgn', ssbn_vanguard: 'vanguard', ssbn_triomphant: 'triomphant',
  ssn_virginia: 'virginia', ssn_los_angeles: 'los_angeles', ssn_seawolf: 'seawolf', ssn_astute: 'astute', ssn_suffren: 'suffren',
  ssk_type212a: 'type212', ssk_todaro: 'type212', ssk_type214: 'type214', ssk_tridente: 'type214', ssk_reis: 'type214',
  ssk_kilo: 'kilo877', ssk_agosta: 'agosta70',
  // Western submarines within ~10% of a catalog row of the same generation and propulsion.
  // Trafalgar: 1980s SSN with Spearfish and Tomahawk, the 688i's peer.
  ssn_trafalgar: 'los_angeles',
  // Greek Glavkos/Poseidon are Type 209/1100-1200, the Atilay's build.
  ssk_type209: 'atilay',
  // Sauro/Pelosi, Ula and Victoria (Upholder): late-1980s non-AIP boats like the Preveze.
  ssk_sauro: 'preveze', ssk_ula: 'preveze', ssk_victoria: 'preveze',
  // Walrus: 2,650 t, Mk 48, 1990s, the Collins's class of boat.
  ssk_walrus: 'collins',
  // Stirling AIP boats: Gotland is as quiet as the Type 212A; Sodermanland is an A17 with AIP retrofitted.
  ssk_gotland: 'type212', ssk_sodermanland: 'type214',
  // S-80 Isaac Peral: 3,000 t, AIP not fitted until S-83; Scorpene-class sensors and weapons.
  ssk_s80: 'scorpene',
  // munitions
  tomahawk_blk5: 'tomahawk',
};

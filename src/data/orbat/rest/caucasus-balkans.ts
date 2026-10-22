// Sources: IISS Military Balance 2025 country sections for Azerbaijan, Armenia, Georgia and
// Serbia; SIPRI Arms Transfers Database (Israeli and Turkish systems in Azerbaijan, Indian
// systems in Armenia, Chinese FK-3 in Serbia). Corps and brigade splits are estimates.
import { base, nation } from './build';

const SRC = 'IISS Military Balance 2025';

// ---------------------------------------------------------------- Azerbaijan
const az = nation('AZE', SRC, { readiness: 0.7, experience: 0.65 });
const azCorps = { t72: 50, t55: 20, bmp2: 40, btr82a: 40, d30: 36, msta_b: 12, infantry_squad: 300, truck: 500 };
export const azerbaijan = [
  az('maneuver', 'corps', '1st Army Corps', base('Yevlakh', 40.62, 47.15), azCorps, { personnel: 12000 }),
  az('maneuver', 'corps', '2nd Army Corps', base('Beylagan', 39.77, 47.62), azCorps, { personnel: 12000 }),
  az('maneuver', 'corps', '3rd Army Corps', base('Shamkir', 40.83, 46.02), azCorps, { personnel: 12000 }),
  az('maneuver', 'corps', '4th Army Corps', base('Baku', 40.41, 49.87), { ...azCorps, t90s: 100 }, { personnel: 12000 }),
  az('maneuver', 'corps', 'Karabakh Garrison (Shusha, Khankendi)', base('Shusha', 39.76, 46.75), { t72: 50, btr82a: 30, infantry_squad: 250, truck: 300 }, { personnel: 8000 }),
  az('maneuver', 'army', 'Nakhchivan Separate Combined Arms Army', base('Nakhchivan', 39.21, 45.41), { t55: 15, bmp2: 30, d30: 24, infantry_squad: 300, truck: 300 }, { personnel: 12000 }),
  az('maneuver', 'brigade', 'Special Forces (Commando Brigades)', base('Baku', 40.4, 49.9), { infantry_squad: 200, otokar_cobra: 40, truck: 150 }, { personnel: 6000, readiness: 0.85, experience: 0.8 }),
  az('artillery', 'brigade', 'Missile and Rocket Brigades', base('Ganja', 40.68, 46.36), { polonez_mlrs: 10, lynx_mlrs: 18, smerch: 30, tos1a: 18, lora_launcher: 4, iskander_e_tel: 4, truck: 200 }),
  az('air_defense', 'brigade', 'Air Defence Forces', base('Baku', 40.45, 49.95), { s300pmu2: 8, barak8_launcher: 4, buk_m1: 12, tor_m2: 8, s125_pechora: 12 }),
  az('air_wing', 'wing', 'Kurdamir AB', base('Kurdamir', 40.27, 48.18), { mig29: 14, su24: 2 }),
  az('air_wing', 'wing', 'Kyurdamir and Dollyar ABs', base('Dollyar', 40.73, 46.3), { su25: 15, bayraktar_tb2: 36, mi35: 20 }),
  // Harops fly from truck-mounted canister launchers, a launch group of their own beside the TB2s' base.
  az('missile', 'battalion', 'Harop Launch Group', base('Dollyar', 40.73, 46.3), { harop_launcher: 6 }),
  az('surface_group', 'flotilla', 'Caspian Naval Forces', base('Baku', 40.37, 49.85), { petya_frigate: 1, patrol_craft: 15 }),
];

// ---------------------------------------------------------------- Armenia
const am = nation('ARM', SRC, { readiness: 0.6, experience: 0.55 });
export const armenia = [
  am('maneuver', 'corps', '1st Army Corps', base('Goris', 39.51, 46.34), { t72: 30, bmp2: 40, d30: 18, infantry_squad: 250, truck: 250 }, { personnel: 10000 }),
  am('maneuver', 'corps', '2nd Army Corps', base('Yeghegnadzor', 39.76, 45.33), { t72: 20, bmp1: 30, d30: 18, infantry_squad: 250, truck: 250 }, { personnel: 9000 }),
  am('maneuver', 'corps', '3rd Army Corps', base('Vanadzor', 40.81, 44.49), { t72: 20, bmp1: 30, d30: 18, infantry_squad: 200, truck: 200 }, { personnel: 8000 }),
  am('maneuver', 'corps', '4th Army Corps', base('Ijevan', 40.88, 45.15), { t72: 15, bmp1: 20, d30: 12, infantry_squad: 200, truck: 200 }, { personnel: 8000 }),
  am('maneuver', 'corps', '5th Army Corps', base('Nubarashen, Yerevan', 40.12, 44.58), { t72: 15, bmp2: 30, d30: 12, infantry_squad: 200, truck: 200 }, { personnel: 8000 }),
  am('artillery', 'brigade', 'Artillery and Missile Brigade', base('Yerevan', 40.18, 44.51), { pinaka: 6, atags: 12, smerch: 6, iskander_e_tel: 4, truck: 100 }, { source: 'IISS Military Balance 2025; SIPRI Arms Transfers (Pinaka, ATAGS from India)' }),
  am('air_defense', 'brigade', 'Air Defence', base('Yerevan', 40.15, 44.4), { s300ps: 8, buk_m1: 6, akash_launcher: 6, osa_ak: 12 }),
  am('air_wing', 'wing', 'Erebuni AB', base('Yerevan', 40.12, 44.47), { su30sm: 4, su25: 13, mi24: 10 }),
];

// ---------------------------------------------------------------- Georgia
const ge = nation('GEO', SRC, { readiness: 0.6, experience: 0.4 });
export const georgia = [
  ge('maneuver', 'brigade', '1st Infantry Brigade', base('Tbilisi (Vaziani)', 41.62, 45.03), { btr80: 20, infantry_squad: 100, d30: 12, truck: 150 }, { personnel: 3000 }),
  ge('maneuver', 'brigade', '2nd Infantry Brigade', base('Senaki', 42.27, 42.07), { btr80: 20, infantry_squad: 100, d30: 12, truck: 150 }, { personnel: 3000 }),
  ge('maneuver', 'brigade', '3rd Infantry Brigade', base('Kutaisi', 42.27, 42.7), { btr80: 20, infantry_squad: 100, d30: 12, truck: 150 }, { personnel: 3000 }),
  ge('maneuver', 'brigade', '4th Mechanised Brigade', base('Vaziani', 41.62, 45.0), { t72: 80, bmp2: 60, btr80: 20, infantry_squad: 50, truck: 200 }, { personnel: 3000 }),
  ge('maneuver', 'brigade', '5th Infantry Brigade', base('Gori', 41.98, 44.11), { t72: 40, btr80: 20, infantry_squad: 100, truck: 150 }, { personnel: 3000 }),
  ge('artillery', 'brigade', 'Artillery Brigade', base('Khoni', 42.32, 42.42), { dana_sph: 24, rm70: 12, bm21: 12, truck: 100 }),
  ge('air_defense', 'brigade', 'Air Defence Brigade', base('Tbilisi', 41.7, 44.8), { spyder: 3, buk_m1: 3, osa_ak: 6, mistral_team: 20 }),
  ge('air_wing', 'wing', 'Alekseevka AB', base('Marneuli', 41.47, 44.79), { su25: 3, uh1h: 12, mi24: 6 }),
  ge('surface_group', 'flotilla', 'Coast Guard', base('Poti', 42.15, 41.67), { patrol_craft: 12 }),
];

// ---------------------------------------------------------------- Serbia
const rs = nation('SRB', SRC, { readiness: 0.6, experience: 0.2 });
const rsBrigade = { m84: 50, bvp_m80: 40, lazar3: 15, nora_b52: 12, infantry_squad: 100, truck: 250 };
export const serbia = [
  rs('maneuver', 'brigade', '1st Army Brigade', base('Novi Sad', 45.26, 19.84), rsBrigade, { personnel: 4000 }),
  rs('maneuver', 'brigade', '2nd Army Brigade', base('Kraljevo', 43.72, 20.69), rsBrigade, { personnel: 4000 }),
  rs('maneuver', 'brigade', '3rd Army Brigade', base('Niš', 43.32, 21.9), { ...rsBrigade, t72ms: 30 }, { personnel: 4000 }),
  rs('maneuver', 'brigade', '4th Army Brigade', base('Vranje', 42.55, 21.9), rsBrigade, { personnel: 4000 }),
  rs('maneuver', 'brigade', 'Special Brigade', base('Pančevo', 44.87, 20.64), { infantry_squad: 80, truck: 80 }, { personnel: 2000, readiness: 0.8 }),
  rs('artillery', 'brigade', 'Mixed Artillery Brigade', base('Niš', 43.3, 21.85), { nora_b52: 18, m77_oganj: 18, sumadija_mlrs: 4, truck: 120 }),
  rs('air_defense', 'brigade', '250th Air Defence Missile Brigade', base('Belgrade', 44.82, 20.46), { fk3_launcher: 4, pantsir_s1: 6, kub_2k12: 12, s125_pechora: 8 }),
  rs('air_wing', 'wing', '204th Air Brigade', base('Batajnica', 44.94, 20.26), { mig29: 14, h145m: 10, cn295: 2 }),
  rs('air_wing', 'wing', '98th Air Brigade', base('Lađevci (Kraljevo)', 43.82, 20.59), { j22_orao: 15, wing_loong1: 6 }),
];

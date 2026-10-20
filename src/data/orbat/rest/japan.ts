// Sources: IISS Military Balance 2025 (Japan); Japan MoD "Defense of Japan 2024" white paper
// (unit locations, Patriot group bases); JMSDF fleet list 2025. Per-unit splits of national
// totals are estimates where the MoD does not publish them.
import { base, nation } from './build';

const u = nation('JPN', 'IISS Military Balance 2025; Defense of Japan 2024', { readiness: 0.85, experience: 0.35 });

export const japan = [
  // ---- JGSDF. Type 90 tanks are concentrated in Hokkaido; Type 10 equips the other divisions.
  u('maneuver', 'division', '7th Division (Armored)', base('Higashi-Chitose', 42.81, 141.66), { type90: 120, type89_ifv: 50, type73_apc: 60, type99_sph: 30, type87_spaag: 12, infantry_squad: 60, truck: 500 }, { personnel: 6500 }),
  u('maneuver', 'division', '2nd Division', base('Asahikawa', 43.77, 142.37), { type90: 55, type16_mcv: 20, type96_apc: 50, type99_sph: 20, infantry_squad: 160, truck: 600 }, { personnel: 7000 }),
  u('maneuver', 'brigade', '5th Brigade', base('Obihiro', 42.92, 143.2), { type90: 30, type16_mcv: 12, type96_apc: 30, fh70: 18, infantry_squad: 100, truck: 350 }, { personnel: 4000 }),
  u('maneuver', 'brigade', '11th Brigade', base('Makomanai', 43.0, 141.35), { type90: 20, type16_mcv: 20, type96_apc: 30, fh70: 18, infantry_squad: 100, truck: 350 }, { personnel: 4000 }),
  u('artillery', 'brigade', '1st Artillery Brigade', base('Kita-Chitose', 42.85, 141.61), { m270: 18, type99_sph: 30, type12_ssm_launcher: 16, truck: 250 }, { personnel: 2500 }),
  u('maneuver', 'division', '6th Division', base('Jinmachi', 38.48, 140.38), { type10: 15, type16_mcv: 30, type96_apc: 40, fh70: 18, infantry_squad: 150, truck: 500 }, { personnel: 6500 }),
  u('maneuver', 'division', '9th Division', base('Aomori', 40.8, 140.72), { type10: 15, type16_mcv: 20, type96_apc: 40, fh70: 18, infantry_squad: 150, truck: 500 }, { personnel: 6500 }),
  u('maneuver', 'division', '1st Division', base('Nerima', 35.74, 139.62), { type10: 15, type16_mcv: 20, type96_apc: 50, fh70: 18, infantry_squad: 160, truck: 550 }, { personnel: 7000 }),
  u('maneuver', 'brigade', '12th Brigade (Air Assault)', base('Somagahara', 36.47, 139.03), { type96_apc: 20, uh60ja: 20, ch47j: 8, infantry_squad: 90, truck: 250 }, { personnel: 3500 }),
  u('maneuver', 'brigade', '1st Airborne Brigade', base('Narashino', 35.69, 140.05), { infantry_squad: 80, truck: 150, ch47j: 10 }, { personnel: 2000 }),
  u('maneuver', 'brigade', 'Fuji School Brigade', base('Camp Fuji', 35.33, 138.83), { type10: 30, type90: 15, type89_ifv: 18, type99_sph: 10, infantry_squad: 40, truck: 200 }, { personnel: 2500 }),
  u('maneuver', 'division', '3rd Division', base('Senzo', 34.81, 135.39), { type10: 10, type16_mcv: 20, type96_apc: 40, fh70: 18, infantry_squad: 150, truck: 500 }, { personnel: 6500 }),
  u('maneuver', 'division', '10th Division', base('Moriyama', 35.2, 136.95), { type10: 10, type16_mcv: 20, type96_apc: 40, fh70: 18, infantry_squad: 150, truck: 500 }, { personnel: 6500 }),
  u('maneuver', 'brigade', '13th Brigade', base('Kaitaichi', 34.37, 132.52), { type16_mcv: 15, type96_apc: 25, fh70: 12, infantry_squad: 90, truck: 300 }, { personnel: 3500 }),
  u('maneuver', 'brigade', '14th Brigade', base('Zentsuji', 34.22, 133.78), { type16_mcv: 15, type96_apc: 25, fh70: 12, infantry_squad: 90, truck: 300 }, { personnel: 3500 }),
  u('maneuver', 'division', '4th Division', base('Fukuoka', 33.53, 130.46), { type10: 15, type16_mcv: 20, type96_apc: 40, fh70: 18, infantry_squad: 160, truck: 500 }, { personnel: 6500 }),
  u('maneuver', 'division', '8th Division', base('Kita-Kumamoto', 32.84, 130.75), { type10: 15, type16_mcv: 25, type96_apc: 40, type19_sph: 20, infantry_squad: 150, truck: 500 }, { personnel: 6500 }),
  u('maneuver', 'brigade', 'Amphibious Rapid Deployment Brigade', base('Ainoura', 33.18, 129.66), { aav7: 52, type10: 8, type19_sph: 10, infantry_squad: 90, truck: 200 }, { personnel: 3000 }),
  u('maneuver', 'brigade', '15th Brigade', base('Naha', 26.2, 127.68), { type96_apc: 20, infantry_squad: 70, truck: 200 }, { personnel: 2600 }),
  u('missile', 'brigade', '2nd Artillery Brigade (Type 12 SSM)', base('Yufuin', 33.27, 131.37), { type12_ssm_launcher: 32, type19_sph: 10, truck: 120 }, { personnel: 1800 }),
  u('missile', 'battalion', '7th Surface-to-Ship Missile Regiment', base('Katsuren', 26.32, 127.86), { type12_ssm_launcher: 8, truck: 30 }),
  u('missile', 'battalion', 'Ishigaki SSM/SAM Garrison', base('Ishigaki', 24.4, 124.18), { type12_ssm_launcher: 4, type03_chusam_launcher: 4, infantry_squad: 20, truck: 30 }),
  u('missile', 'battalion', 'Miyako SSM/SAM Garrison', base('Miyako', 24.78, 125.31), { type12_ssm_launcher: 4, type03_chusam_launcher: 4, infantry_squad: 20, truck: 30 }),
  u('missile', 'battalion', 'Amami SSM/SAM Garrison', base('Amami', 28.36, 129.45), { type12_ssm_launcher: 4, type03_chusam_launcher: 4, infantry_squad: 20, truck: 30 }),
  u('air_defense', 'brigade', 'Western Army SAM Groups', base('Iizuka', 33.65, 130.69), { type03_chusam_launcher: 24, type11_shorad: 12, truck: 80 }),
  u('air_defense', 'brigade', 'Northern Army SAM Groups', base('Higashi-Chitose', 42.81, 141.66), { type03_chusam_launcher: 24, type11_shorad: 12, truck: 80 }),
  u('air_wing', 'brigade', '1st Helicopter Brigade', base('Kisarazu', 35.4, 139.91), { ch47j: 30, uh60ja: 10, ah64d: 12, v22: 17 }),
  u('air_wing', 'wing', 'GSDF Army Aviation (regional)', base('Metabaru', 33.33, 130.41), { ah1s: 40, uh60ja: 15, uh1j: 50 }),

  // ---- JASDF. F-15J/DJ ~200, F-2A/B ~90, F-35A ~40 (IISS 2025).
  u('air_wing', 'wing', '2nd Air Wing', base('Chitose AB', 42.79, 141.67), { f15j: 44 }),
  u('air_wing', 'wing', '3rd Air Wing', base('Misawa AB', 40.7, 141.37), { f35a: 42, mitsubishi_f2: 20, e2d: 13 }),
  u('air_wing', 'wing', '6th Air Wing', base('Komatsu AB', 36.39, 136.41), { f15j: 60 }),
  u('air_wing', 'wing', '5th Air Wing', base('Nyutabaru AB', 32.08, 131.45), { f15j: 40, f35b: 4 }),
  u('air_wing', 'wing', '8th Air Wing', base('Tsuiki AB', 33.69, 131.04), { mitsubishi_f2: 40 }),
  u('air_wing', 'wing', '4th Air Wing (F-2 conversion)', base('Matsushima AB', 38.4, 141.22), { mitsubishi_f2: 22 }),
  u('air_wing', 'wing', '9th Air Wing', base('Naha AB', 26.2, 127.65), { f15j: 44, e2c: 4 }),
  u('air_wing', 'wing', 'Airborne Warning and Control Wing', base('Hamamatsu AB', 34.75, 137.7), { e767: 4 }),
  u('air_wing', 'wing', 'Air Support Command', base('Komaki AB', 35.26, 136.92), { kc767: 4, kc46a: 2, c130h: 14, c2: 15 }),
  u('air_defense', 'brigade', '1st Air Defense Missile Group', base('Iruma AB', 35.84, 139.41), { patriot_pac3: 20 }),
  u('air_defense', 'brigade', '2nd Air Defense Missile Group', base('Kasuga', 33.53, 130.47), { patriot_pac3: 20 }),
  u('air_defense', 'brigade', '3rd Air Defense Missile Group', base('Chitose AB', 42.79, 141.67), { patriot_pac3: 20 }),
  u('air_defense', 'brigade', '4th Air Defense Missile Group', base('Gifu AB', 35.39, 136.87), { patriot_pac3: 20 }),
  u('air_defense', 'brigade', '5th Air Defense Missile Group', base('Chinen', 26.17, 127.81), { patriot_pac3: 20 }),
  u('air_defense', 'brigade', '6th Air Defense Missile Group', base('Misawa AB', 40.7, 141.37), { patriot_pac3: 20 }),

  // ---- JMSDF. Four escort flotillas, each with one helicopter destroyer and two Aegis ships.
  u('surface_group', 'flotilla', 'Escort Flotilla 1', base('Yokosuka', 35.29, 139.67), { izumo: 1, kongo: 1, maya: 1, akizuki: 1, takanami: 2, murasame: 2 }),
  u('surface_group', 'flotilla', 'Escort Flotilla 2', base('Sasebo', 33.16, 129.72), { hyuga: 1, kongo: 2, atago: 1, akizuki: 1, takanami: 1, murasame: 3 }),
  u('surface_group', 'flotilla', 'Escort Flotilla 3', base('Maizuru', 35.48, 135.38), { hyuga: 1, kongo: 1, atago: 1, akizuki: 1, asahi: 1, murasame: 2, asagiri: 2 }),
  u('surface_group', 'flotilla', 'Escort Flotilla 4', base('Kure', 34.24, 132.55), { izumo: 1, maya: 1, akizuki: 1, asahi: 1, takanami: 2, murasame: 2, asagiri: 2 }),
  u('surface_group', 'flotilla', 'Regional Escort Squadrons', base('Ominato', 41.25, 141.15), { mogami: 8, abukuma: 6, asagiri: 4 }),
  u('surface_group', 'flotilla', 'Mine Warfare Force', base('Yokosuka', 35.29, 139.67), { awaji_mcm: 3, enoshima_mcm: 3, hirashima_mcm: 3, uraga_mcs: 2 }),
  u('surface_group', 'flotilla', 'Amphibious and Replenishment Group', base('Kure', 34.24, 132.55), { osumi_lst: 3, mashu_aor: 2, towada_aor: 3 }),
  u('submarine', 'flotilla', 'Submarine Flotilla 1', base('Kure', 34.24, 132.55), { taigei: 2, soryu: 6, oyashio: 4 }),
  u('submarine', 'flotilla', 'Submarine Flotilla 2', base('Yokosuka', 35.29, 139.67), { taigei: 2, soryu: 6, oyashio: 4 }),
  u('air_wing', 'wing', 'Fleet Air Wing 4', base('Atsugi', 35.45, 139.45), { p1: 35 }),
  u('air_wing', 'wing', 'Fleet Air Wing 1 and 5', base('Kanoya', 31.37, 130.84), { p3c: 40, sh60k: 70 }),
];

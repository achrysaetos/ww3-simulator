// Sources: IISS Military Balance 2025 (Korea, Republic of); ROK MND Defense White Paper 2022
// (corps and division locations); per-unit equipment splits are estimates.
import { base, nation } from './build';

const u = nation('KOR', 'IISS Military Balance 2025; ROK Defense White Paper 2022', { readiness: 0.85, experience: 0.35 });

// Infantry division along the DMZ: ~10,000 troops, a tank battalion, K9/KH179 artillery.
const dmzDivision = { k1: 40, k200: 60, k9_thunder: 36, kh179: 18, infantry_squad: 260, truck: 700 };

export const southKorea = [
  // ---- VII Maneuver Corps (mechanized counter-attack force).
  u('maneuver', 'division', 'Capital Mechanized Division', base('Pocheon', 37.89, 127.2), { k2_black_panther: 120, k1a2: 120, k21_ifv: 160, k200: 100, k9_thunder: 54, k239_chunmoo: 12, infantry_squad: 180, truck: 900 }, { personnel: 12000 }),
  u('maneuver', 'division', '8th Maneuver Division', base('Pocheon', 37.94, 127.24), { k2_black_panther: 80, k1a2: 140, k21_ifv: 150, k200: 100, k9_thunder: 54, infantry_squad: 180, truck: 900 }, { personnel: 12000 }),
  u('maneuver', 'division', '11th Maneuver Division', base('Hongcheon', 37.69, 127.89), { k2_black_panther: 60, k1a2: 160, k21_ifv: 160, k200: 100, k9_thunder: 54, infantry_squad: 180, truck: 900 }, { personnel: 12000 }),
  u('maneuver', 'division', '2nd Rapid Response Division', base('Yanggu', 38.1, 127.99), { k1: 40, k200: 60, k9_thunder: 18, kuh1: 20, infantry_squad: 250, truck: 600 }, { personnel: 9000 }),
  u('artillery', 'brigade', 'VII Corps Artillery', base('Icheon', 37.27, 127.44), { k9_thunder: 54, m270: 29, k239_chunmoo: 18, truck: 300 }),

  // ---- I Corps (western DMZ, Seoul approaches).
  u('maneuver', 'division', '1st Infantry Division', base('Paju', 37.76, 126.78), dmzDivision, { personnel: 10000 }),
  u('maneuver', 'division', '9th Infantry Division', base('Goyang', 37.66, 126.83), dmzDivision, { personnel: 10000 }),
  u('maneuver', 'division', '25th Infantry Division', base('Yangju', 37.79, 127.05), dmzDivision, { personnel: 10000 }),
  u('maneuver', 'brigade', '2nd Armored Brigade', base('Paju', 37.8, 126.85), { k1: 100, k1a2: 20, k200: 60, k9_thunder: 18, infantry_squad: 40, truck: 300 }, { personnel: 4000 }),
  u('maneuver', 'brigade', '1st Armored Brigade', base('Goyang', 37.7, 126.9), { k1: 100, k1a1: 20, k200: 60, k9_thunder: 18, infantry_squad: 40, truck: 300 }, { personnel: 4000 }),
  u('artillery', 'brigade', 'I Corps Artillery', base('Goyang', 37.65, 126.9), { k9_thunder: 72, k239_chunmoo: 18, k136_kooryong: 18, truck: 300 }),

  // ---- V Corps (central DMZ).
  u('maneuver', 'division', '3rd Infantry Division', base('Cheorwon', 38.15, 127.31), dmzDivision, { personnel: 10000 }),
  u('maneuver', 'division', '5th Infantry Division', base('Yeoncheon', 38.1, 127.07), dmzDivision, { personnel: 10000 }),
  u('maneuver', 'division', '6th Infantry Division', base('Cheorwon', 38.2, 127.4), dmzDivision, { personnel: 10000 }),
  u('maneuver', 'brigade', '3rd Armored Brigade', base('Pocheon', 37.97, 127.15), { k1: 100, k1a1: 20, k200: 60, k9_thunder: 18, infantry_squad: 40, truck: 300 }, { personnel: 4000 }),
  u('maneuver', 'brigade', '5th Armored Brigade', base('Gapyeong', 37.83, 127.51), { k1: 100, t80u: 35, k200: 60, bmp3: 35, k9_thunder: 18, infantry_squad: 40, truck: 300 }, { personnel: 4000 }),
  u('artillery', 'brigade', 'V Corps Artillery', base('Pocheon', 37.9, 127.3), { k9_thunder: 72, k239_chunmoo: 18, k136_kooryong: 18, truck: 300 }),

  // ---- II Corps and III Corps (eastern DMZ, mountains).
  u('maneuver', 'division', '7th Infantry Division', base('Hwacheon', 38.11, 127.71), dmzDivision, { personnel: 10000 }),
  u('maneuver', 'division', '15th Infantry Division', base('Hwacheon', 38.2, 127.6), dmzDivision, { personnel: 10000 }),
  u('maneuver', 'division', '21st Infantry Division', base('Yanggu', 38.11, 128.0), dmzDivision, { personnel: 10000 }),
  u('maneuver', 'division', '12th Infantry Division', base('Inje', 38.07, 128.17), dmzDivision, { personnel: 10000 }),
  u('maneuver', 'division', '22nd Infantry Division', base('Goseong', 38.38, 128.47), dmzDivision, { personnel: 10000 }),
  u('maneuver', 'division', '23rd Infantry Division', base('Samcheok', 37.45, 129.16), { ...dmzDivision, k1: 20 }, { personnel: 9000 }),
  u('maneuver', 'brigade', 'Mountain Brigade', base('Yangyang', 38.08, 128.62), { infantry_squad: 100, kh179: 18, truck: 150 }, { personnel: 3000 }),
  u('maneuver', 'brigade', '102nd Armored Brigade', base('Chuncheon', 37.88, 127.73), { k1: 90, m48a5: 40, k200: 60, k9_thunder: 18, infantry_squad: 40, truck: 300 }, { personnel: 4000 }),
  u('artillery', 'brigade', 'II/III Corps Artillery', base('Chuncheon', 37.86, 127.7), { k9_thunder: 108, k55: 72, k239_chunmoo: 24, k136_kooryong: 36, truck: 400 }),

  // ---- Capital Defense Command, Second Operations Command, special forces.
  u('maneuver', 'division', 'Capital Defense Command', base('Seoul', 37.5, 126.99), { k200: 40, k55: 36, kh179: 18, infantry_squad: 300, truck: 500 }, { personnel: 12000 }),
  u('maneuver', 'division', 'Homeland Divisions (32nd, 35th, 37th, 39th, 50th, 53rd)', base('Daegu', 35.87, 128.6), { m48a5: 150, k1: 120, k200: 80, k55: 108, kh179: 54, infantry_squad: 900, truck: 1500 }, { personnel: 40000, readiness: 0.6 }),
  u('maneuver', 'brigade', 'Special Warfare Command', base('Icheon', 37.27, 127.44), { infantry_squad: 400, truck: 200, uh60: 30 }, { personnel: 12000, readiness: 0.95, experience: 0.4 }),
  u('air_wing', 'brigade', 'Army Aviation Command', base('Icheon', 37.21, 127.47), { ah64e: 36, ah1s: 60, uh60: 100, kuh1: 150, ch47d: 24 }),
  u('missile', 'brigade', 'Missile Strategic Command (Hyunmoo)', base('Eumseong', 36.94, 127.69), { hyunmoo2_tel: 36, hyunmoo3_launcher: 12, ktssm_launcher: 12 }, { personnel: 3000 }),

  // ---- ROK Marine Corps.
  u('maneuver', 'division', '1st Marine Division', base('Pohang', 36.02, 129.36), { k1a1: 50, kaav7: 80, k9_thunder: 36, infantry_squad: 250, truck: 400 }, { personnel: 12000 }),
  u('maneuver', 'division', '2nd Marine Division', base('Gimpo', 37.62, 126.71), { k1a1: 50, kaav7: 60, k9_thunder: 36, infantry_squad: 250, truck: 400 }, { personnel: 12000 }),
  u('maneuver', 'brigade', '6th Marine Brigade', base('Baengnyeong-do', 37.96, 124.66), { k1a1: 15, k9_thunder: 12, k239_chunmoo: 6, spike_ngl_launcher: 4, infantry_squad: 60, truck: 80 }, { personnel: 4000 }),

  // ---- ROKAF. ~410 combat-capable aircraft (IISS 2025).
  u('air_wing', 'wing', '11th Fighter Wing', base('Daegu AB', 35.9, 128.66), { f15k: 59 }),
  u('air_wing', 'wing', '17th Fighter Wing', base('Cheongju AB', 36.72, 127.5), { f35a: 40 }),
  u('air_wing', 'wing', '19th Fighter Wing', base('Jungwon AB', 37.02, 127.88), { kf16: 70 }),
  u('air_wing', 'wing', '20th Fighter Wing', base('Seosan AB', 36.7, 126.49), { kf16: 64 }),
  u('air_wing', 'wing', '38th Fighter Group', base('Gunsan AB', 35.9, 126.62), { f16c: 34 }),
  u('air_wing', 'wing', '8th Fighter Wing', base('Wonju AB', 37.44, 127.96), { fa50: 60 }),
  u('air_wing', 'wing', '10th Fighter Wing', base('Suwon AB', 37.24, 127.01), { f5e: 40 }),
  u('air_wing', 'wing', '18th Fighter Wing', base('Gangneung AB', 37.75, 128.94), { f5e: 30 }),
  u('air_wing', 'wing', '5th Air Mobility Wing and AEW&C', base('Gimhae AB', 35.18, 128.94), { e7a: 4, kc330: 4, c130h: 16, cn235: 20 }),
  u('air_defense', 'brigade', 'Air Defense Missile Command', base('Osan AB', 37.09, 127.03), { patriot_pac3: 48, km_sam_launcher: 72, l_sam_launcher: 6, chunma_shorad: 48 }),

  // ---- ROKN.
  u('surface_group', 'flotilla', '1st Fleet', base('Donghae', 37.49, 129.12), { chungmugong_yi_sun_sin: 2, incheon: 2, daegu: 3, pohang_corvette: 2, patrol_craft: 12 }),
  u('surface_group', 'flotilla', '2nd Fleet', base('Pyeongtaek', 36.96, 126.83), { chungmugong_yi_sun_sin: 1, gwanggaeto: 1, incheon: 2, daegu: 3, chungnam: 1, pohang_corvette: 2, patrol_craft: 14 }),
  u('surface_group', 'flotilla', '3rd Fleet', base('Mokpo', 34.79, 126.39), { gwanggaeto: 1, incheon: 2, daegu: 2, chungnam: 1, patrol_craft: 12 }),
  u('surface_group', 'task_group', 'Maritime Task Flotilla 7', base('Jeju Naval Base', 33.23, 126.47), { sejong: 3, jeongjo_the_great: 1, chungmugong_yi_sun_sin: 3, gwanggaeto: 1 }),
  u('surface_group', 'flotilla', 'Amphibious and Mine Warfare Flotillas', base('Jinhae', 35.13, 128.66), { dokdo: 2, cheonwangbong_lst: 4, yangyang_mcm: 3, ganggyeong_mcm: 6, soyang_aor: 3 }),
  u('submarine', 'flotilla', 'Submarine Force Command', base('Jinhae', 35.13, 128.66), { dosan_ahn_changho: 3, son_won_il: 9, chang_bogo: 7 }),
  u('air_wing', 'wing', '6th Air Wing (Navy)', base('Pohang', 35.99, 129.42), { p3c: 16, p8a: 6, super_lynx: 20, mh60r: 12 }),
];

// Sources: IISS Military Balance 2025 (Taiwan); ROC MND National Defense Report 2023;
// US DSCA notifications (M1A2T, HIMARS, Harpoon Coastal Defense). Brigade equipment splits
// and missile launcher counts are estimates.
import { base, nation } from './build';

const u = nation('TWN', 'IISS Military Balance 2025; ROC National Defense Report 2023', { readiness: 0.7, experience: 0.2 });

export const taiwan = [
  // ---- Army: 6th Corps (north), 10th Corps (centre), 8th Corps (south), offshore commands.
  u('maneuver', 'brigade', '542nd Armored Brigade', base('Hukou', 24.88, 121.05), { m1a2t: 38, cm11: 60, cm34_ifv: 40, m113: 60, m109a5: 18, infantry_squad: 50, truck: 300 }, { personnel: 4500 }),
  u('maneuver', 'brigade', '584th Armored Brigade', base('Hsinchu', 24.8, 120.97), { cm11: 100, cm34_ifv: 40, cm32_apc: 40, m109a5: 18, infantry_squad: 50, truck: 300 }, { personnel: 4500 }),
  u('maneuver', 'brigade', '269th Mechanized Infantry Brigade', base('Yangmei', 24.91, 121.15), { m60a3: 60, cm32_apc: 80, m113: 40, m109a5: 18, infantry_squad: 90, truck: 300 }, { personnel: 4000 }),
  u('maneuver', 'brigade', '153rd Infantry Brigade', base('Taoyuan', 24.99, 121.3), { infantry_squad: 110, m114: 18, truck: 200 }, { personnel: 3500 }),
  u('artillery', 'brigade', '21st Artillery Command', base('Taoyuan', 24.95, 121.25), { m109a5: 36, ravs_mlrs: 18, himars: 11, truck: 200 }),
  u('maneuver', 'brigade', '586th Armored Brigade', base('Taichung', 24.25, 120.65), { cm11: 100, cm12: 50, cm34_ifv: 40, m113: 60, m109a5: 18, infantry_squad: 50, truck: 300 }, { personnel: 4500 }),
  u('maneuver', 'brigade', '234th Mechanized Infantry Brigade', base('Hsinchu', 24.73, 120.95), { m60a3: 100, cm32_apc: 80, m109a5: 18, infantry_squad: 90, truck: 300 }, { personnel: 4000 }),
  u('artillery', 'brigade', '58th Artillery Command', base('Taichung', 24.2, 120.7), { m109a5: 36, ravs_mlrs: 18, truck: 200 }),
  u('maneuver', 'brigade', '564th Armored Brigade', base('Tainan', 23.0, 120.25), { cm11: 100, cm12: 50, cm34_ifv: 30, m113: 60, m109a5: 18, infantry_squad: 50, truck: 300 }, { personnel: 4500 }),
  u('maneuver', 'brigade', '333rd Mechanized Infantry Brigade', base('Kaohsiung', 22.7, 120.35), { m60a3: 100, cm32_apc: 80, m109a5: 18, infantry_squad: 90, truck: 300 }, { personnel: 4000 }),
  u('maneuver', 'brigade', '203rd Infantry Brigade', base('Pingtung', 22.67, 120.49), { infantry_squad: 110, m114: 18, truck: 200 }, { personnel: 3500 }),
  u('artillery', 'brigade', '43rd Artillery Command', base('Pingtung', 22.6, 120.5), { m109a5: 36, ravs_mlrs: 18, truck: 200 }),
  u('maneuver', 'brigade', 'Hua-Tung Defense Command', base('Hualien', 23.98, 121.6), { m60a3: 40, cm32_apc: 40, infantry_squad: 120, m114: 18, truck: 250 }, { personnel: 5000 }),
  u('maneuver', 'brigade', 'Kinmen Defense Command', base('Kinmen', 24.44, 118.38), { m60a3: 40, cm11: 30, infantry_squad: 150, m114: 36, truck: 200 }, { personnel: 6000 }),
  u('maneuver', 'brigade', 'Matsu Defense Command', base('Nangan', 26.16, 119.94), { infantry_squad: 90, m114: 18, truck: 80 }, { personnel: 3000 }),
  u('maneuver', 'brigade', 'Penghu Defense Command', base('Magong', 23.57, 119.58), { m60a3: 40, cm11: 30, infantry_squad: 100, m114: 18, truck: 150 }, { personnel: 4000 }),
  u('air_wing', 'brigade', '601st Aviation Brigade', base('Longtan', 24.86, 121.24), { ah64e: 28, ah1w: 30, uh60m: 15, oh58d: 20 }),
  u('air_wing', 'brigade', '602nd Aviation Brigade', base('Taichung', 24.26, 120.62), { ah1w: 30, uh60m: 15, ch47sd: 9 }),
  u('maneuver', 'brigade', 'Special Forces Command', base('Taoyuan', 24.97, 121.2), { infantry_squad: 150, truck: 80 }, { personnel: 4000, readiness: 0.85 }),
  // ---- Marine Corps.
  u('maneuver', 'brigade', '66th Marine Brigade', base('Linkou', 25.08, 121.38), { m60a3: 40, aav7: 30, infantry_squad: 100, m109a5: 12, truck: 150 }, { personnel: 4000 }),
  u('maneuver', 'brigade', '77th Marine Brigade', base('Fangshan', 22.27, 120.65), { m60a3: 40, aav7: 30, infantry_squad: 100, truck: 150 }, { personnel: 4000 }),
  u('maneuver', 'brigade', '99th Marine Brigade', base('Zuoying', 22.7, 120.29), { m60a3: 40, aav7: 30, infantry_squad: 100, truck: 150 }, { personnel: 4000 }),
  // ---- Missiles and air defense.
  u('missile', 'brigade', 'Coastal Defense Command (Hsiung Feng)', base('Kaohsiung', 22.62, 120.3), { hsiung_feng_3: 30, hsiung_feng_2_coastal: 30, harpoon_coastal: 12 }, { personnel: 2000 }),
  u('missile', 'brigade', 'Strategic Strike Group (HF-2E)', base('Hualien', 24.0, 121.55), { hsiung_feng_2e_tel: 24 }),
  u('air_defense', 'brigade', 'Air Defense Missile Command North', base('Taipei', 25.03, 121.55), { tien_kung_3: 24, patriot_pac3: 16, nasams: 3, avenger: 20 }),
  u('air_defense', 'brigade', 'Air Defense Missile Command Central', base('Taichung', 24.15, 120.68), { tien_kung_3: 16, patriot_pac3: 8, avenger: 20 }),
  u('air_defense', 'brigade', 'Air Defense Missile Command South', base('Kaohsiung', 22.65, 120.35), { tien_kung_3: 16, patriot_pac3: 8, avenger: 20 }),
  // ---- Air force: ~140 F-16V, ~54 Mirage 2000-5, ~127 F-CK-1, F-5E/F in training wing.
  u('air_wing', 'wing', '4th Tactical Fighter Wing', base('Chiayi AB', 23.46, 120.39), { f16v: 70 }),
  u('air_wing', 'wing', '5th Tactical Fighter Wing', base('Hualien AB', 24.02, 121.62), { f16v: 71 }),
  u('air_wing', 'wing', '2nd Tactical Fighter Wing', base('Hsinchu AB', 24.82, 120.94), { mirage2000_5: 54 }),
  u('air_wing', 'wing', '3rd Tactical Fighter Wing', base('Ching Chuan Kang AB', 24.26, 120.62), { f_ck_1: 64 }),
  u('air_wing', 'wing', '1st Tactical Fighter Wing', base('Tainan AB', 22.95, 120.21), { f_ck_1: 63 }),
  u('air_wing', 'wing', '7th Flying Training Wing', base('Chihhang AB', 22.79, 121.18), { f5e: 60 }),
  u('air_wing', 'wing', '439th Composite Wing', base('Pingtung AB', 22.7, 120.48), { e2d: 6, c130h: 19, p3c: 12 }),
  // ---- Navy.
  u('surface_group', 'flotilla', '124th Fleet', base('Zuoying', 22.69, 120.27), { kee_lung: 2, cheng_kung: 4, kang_ding: 2, tuo_chiang: 3 }),
  u('surface_group', 'flotilla', '146th Fleet', base('Magong', 23.56, 119.57), { cheng_kung: 3, kang_ding: 2, tuo_chiang: 2, kuang_hua_vi: 15 }),
  u('surface_group', 'flotilla', '168th Fleet', base('Suao', 24.59, 121.86), { kee_lung: 2, cheng_kung: 3, kang_ding: 2, tuo_chiang: 2, kuang_hua_vi: 16 }),
  u('surface_group', 'flotilla', 'Amphibious and Mine Warfare Command', base('Zuoying', 22.69, 120.27), { yu_shan_lpd: 1, newport_lst: 1, yung_feng_mcm: 4, panshih_aor: 1 }),
  u('submarine', 'flotilla', '256th Submarine Squadron', base('Zuoying', 22.69, 120.27), { hai_lung: 2, hai_shih: 2 }),
];

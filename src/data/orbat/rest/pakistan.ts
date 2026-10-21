// Sources: IISS Military Balance 2025 (Pakistan); SIPRI Yearbook 2025 and Kristensen, Korda &
// Johns, "Pakistan nuclear weapons, 2023" (Bulletin of the Atomic Scientists) for launcher
// counts and suspected garrisons; corps and division garrisons from open compilations.
// Division level for the Army. Launcher garrisons are the Bulletin's assessed sites.
import { base, nation, type Kit } from './build';

const u = nation('PAK', 'IISS Military Balance 2025', { readiness: 0.7, experience: 0.5 });
const NUKE_SRC = 'SIPRI Yearbook 2025; Kristensen, Korda & Johns 2023 (launcher counts estimated)';

const template = {
  plains: { type69: 44, m113: 60, m109a5: 18, type59_1_gun: 36, infantry_squad: 320, truck: 1300 },
  hills: { m198: 18, ind_105mm_lfg: 36, infantry_squad: 340, truck: 900 },
} satisfies Record<string, Kit>;

const divisions: [string, string, number, number, keyof typeof template][] = [
  ['17th Infantry Division (I Corps)', 'Kharian', 32.81, 73.86, 'plains'],
  ['37th Infantry Division (I Corps)', 'Gujranwala', 32.16, 74.19, 'plains'],
  ['14th Infantry Division (II Corps)', 'Okara', 30.81, 73.45, 'plains'],
  ['40th Infantry Division (II Corps)', 'Okara', 30.85, 73.5, 'plains'],
  ['10th Infantry Division (IV Corps)', 'Lahore', 31.52, 74.36, 'plains'],
  ['11th Infantry Division (IV Corps)', 'Lahore', 31.48, 74.4, 'plains'],
  ['16th Infantry Division (V Corps)', 'Pano Aqil', 27.86, 69.11, 'plains'],
  ['18th Infantry Division (V Corps)', 'Hyderabad', 25.38, 68.37, 'plains'],
  ['8th Infantry Division (XXX Corps)', 'Sialkot', 32.49, 74.53, 'plains'],
  ['15th Infantry Division (XXX Corps)', 'Sialkot', 32.45, 74.5, 'plains'],
  ['35th Infantry Division (XXXI Corps)', 'Bahawalpur', 29.4, 71.68, 'plains'],
  ['12th Infantry Division (X Corps)', 'Murree', 33.91, 73.39, 'hills'],
  ['19th Infantry Division (X Corps)', 'Mangla', 33.12, 73.64, 'plains'],
  ['23rd Infantry Division (X Corps)', 'Jhelum', 32.94, 73.73, 'plains'],
  ['Force Command Northern Areas', 'Gilgit', 35.92, 74.31, 'hills'],
  ['7th Infantry Division (XI Corps)', 'Miranshah', 33.0, 70.07, 'hills'],
  ['9th Infantry Division (XI Corps)', 'Kohat', 33.58, 71.44, 'hills'],
  ['33rd Infantry Division (XII Corps)', 'Quetta', 30.18, 67.0, 'hills'],
  ['41st Infantry Division (XII Corps)', 'Quetta', 30.2, 67.05, 'hills'],
  ['44th Infantry Division (XII Corps)', 'Turbat', 26.0, 63.05, 'hills'],
];

export const pakistan = [
  ...divisions.map(([name, place, lat, lon, t]) => u('maneuver', 'division', name, base(place, lat, lon), template[t], { personnel: 15000 })),
  u('maneuver', 'division', '1st Armoured Division (II Corps)', base('Multan', 30.2, 71.47), { al_khalid: 270, m113: 120, m109a5: 36, infantry_squad: 80, truck: 1200 }, { personnel: 13000 }),
  u('maneuver', 'division', '6th Armoured Division (I Corps)', base('Kharian', 32.83, 73.88), { al_khalid: 130, t80ud: 140, m113: 120, m109a5: 36, infantry_squad: 80, truck: 1200 }, { personnel: 13000 }),
  u('maneuver', 'division', '25th Mechanised Division (V Corps)', base('Malir, Karachi', 24.95, 67.2), { vt4: 88, type85: 44, m113: 150, sh15_sph: 18, infantry_squad: 180, truck: 1300 }, { personnel: 14000 }),
  u('maneuver', 'division', '26th Mechanised Division (XXXI Corps)', base('Bahawalpur', 29.4, 71.7), { vt4: 88, type85: 44, m113: 150, sh15_sph: 18, infantry_squad: 180, truck: 1300 }, { personnel: 14000 }),
  u('maneuver', 'brigade', 'Independent Armoured Brigades (T-80UD)', base('Gujranwala', 32.18, 74.2), { t80ud: 180, m113: 60, infantry_squad: 40, truck: 500 }, { personnel: 6000 }),
  u('maneuver', 'brigade', 'Independent Armoured Brigades (Al-Zarrar), north', base('Sialkot', 32.5, 74.55), { al_zarrar: 250, m113: 60, infantry_squad: 40, truck: 500 }, { personnel: 6000 }),
  u('maneuver', 'brigade', 'Independent Armoured Brigades (Al-Zarrar), south', base('Pano Aqil', 27.85, 69.1), { al_zarrar: 250, m113: 60, infantry_squad: 40, truck: 500 }, { personnel: 6000 }),
  u('maneuver', 'brigade', 'Independent Armoured Brigades (Type 85)', base('Lahore', 31.55, 74.3), { type85: 212, m113: 60, infantry_squad: 40, truck: 500 }, { personnel: 6000 }),
  u('maneuver', 'brigade', 'Armoured reserve (Type 69/59)', base('Nowshera', 34.0, 71.97), { type69: 316, truck: 200 }, { personnel: 4000, readiness: 0.4 }),
  u('maneuver', 'brigade', 'Special Service Group', base('Cherat', 33.82, 71.89), { infantry_squad: 300, truck: 150 }, { personnel: 5000, readiness: 0.9, experience: 0.7 }),
  u('maneuver', 'division', 'Frontier Corps (Khyber Pakhtunkhwa and Balochistan)', base('Peshawar', 34.01, 71.58), { infantry_squad: 2000, truck: 1500 }, { personnel: 70000, readiness: 0.6, experience: 0.7 }),
  u('artillery', 'brigade', 'Army Rocket Force Command', base('Rawalpindi', 33.6, 73.05), { fatah_mlrs: 36, a100_mlrs: 36, truck: 200 }),
  u('air_defense', 'brigade', 'Army Air Defence Command', base('Rawalpindi', 33.62, 73.1), { hq9p_launcher: 16, hq16fe_launcher: 24, ly80_launcher: 24, fm90: 30 }),
  u('air_wing', 'brigade', 'Army Aviation', base('Dhamial, Rawalpindi', 33.56, 73.03), { ah1f: 35, z10me: 6, mi17: 60, bell412: 30 }),

  // ---- Army Strategic Forces Command. ~170 warheads (SIPRI 2025).
  u('strategic', 'brigade', 'Shaheen-III Group', base('Khuzdar', 27.8, 66.62), { shaheen3_tel: 6 }, { source: NUKE_SRC }),
  u('strategic', 'brigade', 'Shaheen-I/II Groups', base('Pano Aqil', 27.86, 69.15), { shaheen1_tel: 16, shaheen2_tel: 16 }, { source: NUKE_SRC }),
  u('strategic', 'brigade', 'Ghauri Group', base('Sargodha', 32.07, 72.67), { ghauri_tel: 24 }, { source: NUKE_SRC }),
  u('strategic', 'brigade', 'Ghaznavi and Abdali Groups', base('Gujranwala', 32.2, 74.15), { ghaznavi_tel: 16, abdali_tel: 10 }, { source: NUKE_SRC }),
  u('strategic', 'brigade', 'Nasr Groups', base('Pano Aqil', 27.9, 69.2), { nasr_tel: 24 }, { source: NUKE_SRC }),
  u('strategic', 'brigade', 'Babur GLCM Group', base('Akro', 25.7, 68.6), { babur_tel: 12 }, { source: NUKE_SRC }),
  u('strategic', 'brigade', 'Ababeel MIRV Development Group', base('Somiani (Sonmiani) test range', 25.4, 66.6), { ababeel_tel: 2 }, { source: 'SIPRI Yearbook 2025: Ababeel under development, not yet deployed', readiness: 0.3 }),

  // ---- Pakistan Air Force: JF-17 ~150, F-16 ~75, J-10CE ~20, Mirage III/5 ~140, F-7PG ~50.
  u('air_wing', 'wing', 'PAF Base Minhas (Kamra)', base('Kamra', 33.87, 72.4), { jf17: 32, j10ce: 20, saab2000_erieye: 4 }),
  u('air_wing', 'wing', 'PAF Base Mushaf (Sargodha)', base('Sargodha', 32.05, 72.67), { f16c: 45 }),
  u('air_wing', 'wing', 'PAF Base Shahbaz (Jacobabad)', base('Jacobabad', 28.28, 68.45), { f16a: 30 }),
  u('air_wing', 'wing', 'PAF Base Peshawar', base('Peshawar', 33.99, 71.51), { jf17: 32 }),
  u('air_wing', 'wing', 'PAF Base Rafiqui (Shorkot)', base('Shorkot', 30.76, 72.28), { jf17: 32, mirage5: 40 }),
  u('air_wing', 'wing', 'PAF Base Masroor (Karachi)', base('Karachi', 24.89, 66.94), { jf17: 22, mirage3: 50, mirage5: 20 }),
  u('air_wing', 'wing', 'PAF Base Samungli (Quetta)', base('Quetta', 30.25, 66.94), { jf17: 32 }),
  u('air_wing', 'wing', 'PAF Base Mianwali', base('Mianwali', 32.56, 71.57), { f7pg: 50, mirage5: 30 }),
  u('air_wing', 'wing', 'PAF Air Mobility', base('Nur Khan, Rawalpindi', 33.62, 73.1), { c130h: 16, il78: 4, zdk03_aewc: 4 }),

  // ---- Pakistan Navy.
  u('surface_group', 'fleet', 'Pakistan Fleet', base('Karachi', 24.82, 66.98), { tughril: 4, zulfiquar: 4, babur_milgem: 2, yarmook_corvette: 2, azmat_fac: 4 }),
  u('submarine', 'flotilla', 'Submarine Force', base('Karachi', 24.82, 66.98), { agosta90b: 3, agosta70: 2 }, { extraMagazine: { babur3_slcm: 6 } }),
  u('missile', 'battalion', 'Coastal Missile Regiment', base('Ormara (Jinnah Naval Base)', 25.21, 64.64), { zarb_coastal: 12 }),
  u('air_wing', 'wing', 'Naval Air', base('PNS Mehran, Karachi', 24.9, 67.15), { p3c: 3, atr72_mpa: 4, sea_king: 6 }),
];

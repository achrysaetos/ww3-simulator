// Sources: IISS Military Balance 2025 (India); SIPRI Yearbook 2025 and Kristensen & Korda,
// "Indian nuclear weapons, 2024" (Bulletin of the Atomic Scientists) for Strategic Forces
// Command; corps and division garrisons from open Indian Army order-of-battle compilations.
// Modelled at division level for the Army (about 40 divisions). The Air Force's MiG-21 squadrons
// retired in September 2025 and are left out because scenarios start in 2027.
import { base, nation, type Kit } from './build';

const SRC = 'IISS Military Balance 2025; SIPRI Yearbook 2025';
const u = nation('IND', SRC, { readiness: 0.7, experience: 0.45 });

/** Division templates. Tank counts are two to four regiments of 45 tanks. */
const template = {
  armoured: { t90s: 210, bmp2: 120, k9_vajra: 18, d30: 36, bm21: 12, infantry_squad: 90, truck: 1200 },
  rapid: { t72: 105, bmp2: 60, d30: 54, m46: 18, pinaka: 12, infantry_squad: 300, truck: 1500 },
  infantry: { d30: 54, m46: 18, infantry_squad: 360, truck: 1400 },
  mountain: { ind_105mm_lfg: 54, infantry_squad: 360, truck: 900 },
  artillery: { m46: 54, k9_vajra: 18, dhanush: 18, pinaka: 18, truck: 600 },
  armouredBrigade72: { t72: 135, bmp2: 45, k9_vajra: 6, infantry_squad: 30, truck: 400 },
  armouredBrigade90: { t90s: 135, bmp2: 45, k9_vajra: 6, infantry_squad: 30, truck: 400 },
} satisfies Record<string, Kit>;

const divisionPersonnel = { artillery: 6000, armoured: 15000, rapid: 16000, infantry: 15000, mountain: 14000, armouredBrigade72: 4500, armouredBrigade90: 4500 };

const army: [string, string, number, number, keyof typeof template][] = [
  // Northern Command
  ['3rd Infantry Division (14 Corps)', 'Leh', 34.15, 77.58, 'mountain'],
  ['8th Mountain Division (14 Corps)', 'Dras', 34.43, 75.75, 'mountain'],
  ['19th Infantry Division (15 Corps)', 'Baramulla', 34.2, 74.34, 'infantry'],
  ['28th Infantry Division (15 Corps)', 'Gurez', 34.63, 74.83, 'mountain'],
  ['10th Infantry Division (16 Corps)', 'Akhnoor', 32.87, 74.73, 'rapid'],
  ['25th Infantry Division (16 Corps)', 'Rajouri', 33.37, 74.31, 'infantry'],
  ['39th Infantry Division (16 Corps)', 'Yol', 32.17, 76.38, 'mountain'],
  // Western Command
  ['26th Infantry Division (9 Corps)', 'Jammu', 32.73, 74.86, 'rapid'],
  ['29th Infantry Division (9 Corps)', 'Pathankot', 32.27, 75.65, 'rapid'],
  ['7th Infantry Division (11 Corps)', 'Firozpur', 30.93, 74.61, 'rapid'],
  ['9th Infantry Division (11 Corps)', 'Meerut', 28.98, 77.71, 'rapid'],
  ['15th Infantry Division (11 Corps)', 'Amritsar', 31.63, 74.87, 'rapid'],
  ['1st Armoured Division (2 Corps)', 'Patiala', 30.34, 76.39, 'armoured'],
  ['22nd Infantry Division (2 Corps)', 'Meerut', 29.0, 77.7, 'rapid'],
  ['40th Artillery Division (2 Corps)', 'Ambala', 30.38, 76.78, 'artillery'],
  // South Western Command
  ['16th Infantry Division (10 Corps)', 'Sri Ganganagar', 29.9, 73.88, 'rapid'],
  ['18th Infantry Division (10 Corps)', 'Kota', 25.18, 75.83, 'rapid'],
  ['24th Infantry Division (10 Corps)', 'Bikaner', 28.02, 73.31, 'rapid'],
  ['33rd Armoured Division (1 Corps)', 'Hisar', 29.15, 75.72, 'armoured'],
  ['4th Infantry Division (1 Corps)', 'Prayagraj', 25.44, 81.85, 'rapid'],
  ['6th Mountain Division (1 Corps)', 'Bareilly', 28.37, 79.43, 'mountain'],
  // Southern Command
  ['31st Armoured Division (21 Corps)', 'Jhansi', 25.45, 78.57, 'armoured'],
  ['36th Infantry Division (21 Corps)', 'Sagar', 23.84, 78.74, 'rapid'],
  ['54th Infantry Division (21 Corps)', 'Secunderabad', 17.44, 78.5, 'infantry'],
  ['11th Infantry Division (12 Corps)', 'Ahmedabad', 23.03, 72.58, 'rapid'],
  ['12th Infantry Division (12 Corps)', 'Jodhpur', 26.29, 73.02, 'rapid'],
  ['41st Artillery Division', 'Pune', 18.52, 73.86, 'artillery'],
  // Eastern Command
  ['2nd Mountain Division (3 Corps)', 'Dinjan', 27.54, 95.27, 'mountain'],
  ['57th Mountain Division (3 Corps)', 'Leimakhong', 24.93, 93.84, 'mountain'],
  ['5th Mountain Division (4 Corps)', 'Bomdila', 27.26, 92.42, 'mountain'],
  ['21st Mountain Division (4 Corps)', 'Rangiya', 26.45, 91.62, 'mountain'],
  ['71st Mountain Division (4 Corps)', 'Missamari', 26.82, 92.6, 'mountain'],
  ['17th Mountain Division (33 Corps)', 'Gangtok', 27.33, 88.61, 'mountain'],
  ['20th Mountain Division (33 Corps)', 'Binnaguri', 26.76, 89.05, 'mountain'],
  ['27th Mountain Division (33 Corps)', 'Kalimpong', 27.06, 88.47, 'mountain'],
  ['59th Mountain Division (17 Corps)', 'Panagarh', 23.45, 87.43, 'mountain'],
  ['72nd Mountain Division (17 Corps)', 'Pathankot', 32.28, 75.6, 'mountain'],
  ['23rd Infantry Division', 'Ranchi', 23.35, 85.33, 'infantry'],
  // Independent armoured brigades
  ['2nd Independent Armoured Brigade', 'Pathankot', 32.3, 75.7, 'armouredBrigade90'],
  ['3rd Independent Armoured Brigade', 'Jammu', 32.7, 74.9, 'armouredBrigade72'],
  ['6th Independent Armoured Brigade', 'Bathinda', 30.21, 74.95, 'armouredBrigade90'],
  ['14th Independent Armoured Brigade', 'Jodhpur', 26.25, 73.05, 'armouredBrigade72'],
  ['16th Independent Armoured Brigade', 'Bikaner', 28.0, 73.35, 'armouredBrigade72'],
  ['23rd Independent Armoured Brigade', 'Jalandhar', 31.33, 75.58, 'armouredBrigade90'],
  ['340th Mechanised Brigade', 'Suratgarh', 29.32, 73.9, 'armouredBrigade72'],
  ['Ladakh Armoured Group (14 Corps)', 'Nyoma', 33.18, 78.65, 'armouredBrigade90'],
];

export const india = [
  ...army.map(([name, place, lat, lon, kind]) => u(kind === 'artillery' ? 'artillery' : 'maneuver', kind.startsWith('armouredBrigade') ? 'brigade' : 'division', name, base(place, lat, lon), template[kind], { personnel: divisionPersonnel[kind] })),
  u('maneuver', 'brigade', '43rd Armoured Brigade (Arjun)', base('Jaisalmer', 26.92, 70.9), { arjun: 120, bmp2: 45, infantry_squad: 30, truck: 400 }, { personnel: 4500 }),
  u('maneuver', 'brigade', 'Armoured Corps Centre and School (reserve)', base('Ahmednagar', 19.09, 74.74), { t72: 300, bmp2: 200, truck: 300 }, { personnel: 5000, readiness: 0.5 }),
  u('maneuver', 'division', 'Para SF and 50th Parachute Brigade', base('Agra', 27.18, 78.01), { infantry_squad: 250, truck: 200 }, { personnel: 8000, readiness: 0.9, experience: 0.6 }),
  u('maneuver', 'division', 'Assam Rifles and Rashtriya Rifles (counter-insurgency)', base('Srinagar', 34.08, 74.8), { infantry_squad: 2500, truck: 3000 }, { personnel: 65000, readiness: 0.75, experience: 0.7 }),
  u('missile', 'brigade', 'Army BrahMos Regiments', base('Pokhran', 26.92, 71.92), { brahmos_tel: 30, truck: 120 }),
  u('artillery', 'brigade', 'Pinaka and Smerch Regiments', base('Deolali', 19.95, 73.83), { pinaka: 60, smerch: 42, m777: 145, dhanush: 60, truck: 600 }),
  u('air_defense', 'brigade', 'Army Air Defence (Akash, Kvadrat, OSA)', base('Gopalpur', 19.26, 84.9), { akash_launcher: 72, kvadrat: 40, osa_ak: 50, tunguska: 60, zsu_23_4: 75 }),
  u('air_wing', 'brigade', 'Army Aviation Corps', base('Nasik', 20.0, 73.79), { ah64e: 6, lch_prachand: 15, alh_dhruv: 180, chetak: 120 }),

  // ---- Strategic Forces Command. ~180 warheads (SIPRI 2025). Launcher locations estimated.
  u('strategic', 'brigade', 'SFC Agni-V Missile Group', base('Central India (estimated)', 22.8, 79.0), { agni5_tel: 8 }, { source: 'SIPRI Yearbook 2025; Kristensen & Korda 2024 (launcher counts estimated)' }),
  u('strategic', 'brigade', 'SFC Agni-III/IV Missile Groups', base('Central India (estimated)', 21.5, 80.5), { agni3_tel: 16, agni4_tel: 8 }, { source: 'SIPRI Yearbook 2025; Kristensen & Korda 2024 (launcher counts estimated)' }),
  u('strategic', 'brigade', '444 and 555 Missile Groups (Agni-I/II)', base('Secunderabad', 17.44, 78.5), { agni1_tel: 12, agni2_tel: 12 }, { source: 'SIPRI Yearbook 2025; Kristensen & Korda 2024' }),
  u('strategic', 'brigade', '333, 334, 335 Missile Groups (Prithvi-II)', base('Jalandhar', 31.33, 75.58), { prithvi2_tel: 30 }, { source: 'SIPRI Yearbook 2025; Kristensen & Korda 2024' }),
  u('strategic', 'flotilla', 'SSBN Force (INS Arihant, INS Arighaat)', base('INS Varsha, Rambilli', 17.48, 82.98), { arihant: 2 }, { source: 'SIPRI Yearbook 2025 (K-15 on Arihant, K-4 on Arighaat)' }),

  // ---- Indian Air Force: Su-30MKI ~260, Rafale 36, Mirage 2000 ~45, MiG-29UPG ~60, Jaguar ~110, Tejas ~36.
  u('air_wing', 'wing', '2 Wing (Su-30MKI)', base('Pune Lohegaon', 18.58, 73.92), { su30mki: 36 }),
  u('air_wing', 'wing', '15 Wing (Su-30MKI)', base('Bareilly', 28.42, 79.45), { su30mki: 36 }),
  u('air_wing', 'wing', '11 Wing (Su-30MKI)', base('Tezpur', 26.71, 92.79), { su30mki: 18 }),
  u('air_wing', 'wing', '13 Wing (Su-30MKI)', base('Chabua', 27.46, 95.12), { su30mki: 18 }),
  u('air_wing', 'wing', '32 Wing (Su-30MKI)', base('Jodhpur', 26.25, 73.05), { su30mki: 36 }),
  u('air_wing', 'wing', '34 Wing (Su-30MKI)', base('Halwara', 30.75, 75.63), { su30mki: 36 }),
  u('air_wing', 'wing', '45 Wing (Su-30MKI)', base('Sirsa', 29.56, 75.0), { su30mki: 18 }),
  u('air_wing', 'wing', '47 Wing (Su-30MKI, BrahMos-A)', base('Thanjavur', 10.72, 79.1), { su30mki: 18 }),
  u('air_wing', 'wing', '20 Wing (Su-30MKI)', base('Kalaikunda', 22.34, 87.21), { su30mki: 22 }),
  u('air_wing', 'wing', '28 Wing (Su-30MKI)', base('Jamnagar', 22.47, 70.01), { su30mki: 22 }),
  u('air_wing', 'wing', '7 Wing (Rafale, Jaguar)', base('Ambala', 30.37, 76.82), { rafale: 18, jaguar: 36 }),
  u('air_wing', 'wing', '16 Wing (Rafale)', base('Hasimara', 26.68, 89.37), { rafale: 18 }),
  u('air_wing', 'wing', '40 Wing (Mirage 2000)', base('Gwalior', 26.29, 78.23), { mirage2000: 45 }),
  u('air_wing', 'wing', '9 Wing (MiG-29UPG)', base('Adampur', 31.43, 75.76), { mig29: 40 }),
  u('air_wing', 'wing', '33 Wing (MiG-29UPG, Jaguar)', base('Jamnagar', 22.47, 70.01), { mig29: 20, jaguar: 18 }),
  u('air_wing', 'wing', '18 Wing (Jaguar)', base('Gorakhpur', 26.74, 83.45), { jaguar: 56 }),
  u('air_wing', 'wing', '43 Wing (Tejas)', base('Sulur', 11.01, 77.16), { tejas: 36 }),
  u('air_wing', 'wing', 'Air Mobility and AEW&C', base('Hindon', 28.7, 77.36), { c17: 11, c130j: 12, il76: 14, a50ei: 3, netra_aewc: 3, il78: 6 }),
  u('air_defense', 'brigade', 'IAF S-400 Squadrons', base('Pathankot', 32.23, 75.63), { s400_launcher: 24 }),
  u('air_defense', 'brigade', 'IAF S-400 Squadrons (East)', base('Siliguri', 26.72, 88.4), { s400_launcher: 12 }),
  u('air_defense', 'brigade', 'IAF Akash and MRSAM Squadrons', base('Gwalior', 26.25, 78.2), { akash_launcher: 64, mrsam_launcher: 48, spyder: 18 }),

  // ---- Indian Navy: 2 carriers, 12 destroyers, 17 frigates, 17 SSK + 2 SSBN.
  u('surface_group', 'task_group', 'Western Fleet Carrier Group', base('INS Kadamba, Karwar', 14.8, 74.12), { ins_vikramaditya: 1, kolkata: 1, talwar: 2 }),
  u('surface_group', 'fleet', 'Western Fleet', base('Mumbai', 18.93, 72.84), { visakhapatnam: 4, kolkata: 2, delhi: 2, talwar: 4, brahmaputra: 2, nilgiri: 3, tushil: 2, kora_corvette: 2, khukri_corvette: 2 }),
  u('surface_group', 'task_group', 'Southern Carrier Group', base('Kochi', 9.96, 76.27), { ins_vikrant: 1 }),
  u('surface_group', 'fleet', 'Eastern Fleet', base('Visakhapatnam', 17.69, 83.29), { delhi: 1, rajput: 2, shivalik: 3, brahmaputra: 1, kamorta_corvette: 4, kora_corvette: 2, khukri_corvette: 1, jalashwa_lpd: 1, shardul_lst: 3 }),
  u('submarine', 'flotilla', 'Western Submarine Flotilla', base('Mumbai', 18.93, 72.84), { kalvari: 6, shishumar: 4, sindhughosh: 3 }),
  u('submarine', 'flotilla', 'Eastern Submarine Flotilla', base('Visakhapatnam', 17.69, 83.29), { sindhughosh: 4 }),
  u('air_wing', 'wing', 'Naval Air (MiG-29K)', base('INS Hansa, Goa', 15.38, 73.83), { mig29k: 40 }),
  u('air_wing', 'wing', 'Naval Air (Maritime Patrol)', base('INS Rajali, Arakkonam', 13.07, 79.69), { p8i: 12, mh60r: 24, mq9b: 2 }),
];

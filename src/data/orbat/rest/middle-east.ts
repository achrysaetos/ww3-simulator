// Sources: IISS Military Balance 2025 country sections for Saudi Arabia, UAE, Egypt, Iraq,
// Jordan and Qatar; US DSCA notifications (THAAD, Patriot, F-15SA/QA). Syria is modelled
// after the December 2024 collapse of the Assad government: Israeli strikes that month
// destroyed most of the navy, air force, air defences and missile stocks (IDF statements,
// ISW/Reuters reporting), so the force is the new Ministry of Defence's infantry-heavy
// divisions built from former opposition factions. Syrian figures are estimates.
import { base, nation } from './build';

const SRC = 'IISS Military Balance 2025';

// ---------------------------------------------------------------- Saudi Arabia
const sa = nation('SAU', SRC, { readiness: 0.6, experience: 0.45 });
export const saudiArabia = [
  sa('maneuver', 'brigade', '4th Armored Brigade', base('King Khalid Military City', 27.9, 45.53), { m1a2s: 120, m2a2_bradley: 100, m109a5: 18, infantry_squad: 40, truck: 400 }, { personnel: 5000 }),
  sa('maneuver', 'brigade', '20th Mechanized Brigade', base('King Khalid Military City', 27.95, 45.55), { m1a2s: 70, m2a2_bradley: 120, m113: 60, m109a5: 18, infantry_squad: 70, truck: 400 }, { personnel: 5000 }),
  sa('maneuver', 'brigade', '12th Armored Brigade', base('King Abdulaziz Military City, Tabuk', 28.37, 36.6), { m1a2s: 100, m2a2_bradley: 80, m109a5: 18, infantry_squad: 40, truck: 400 }, { personnel: 5000 }),
  sa('maneuver', 'brigade', '10th Mechanized Brigade', base('Tabuk', 28.4, 36.57), { m60a3: 120, m113: 120, m109a5: 18, infantry_squad: 70, truck: 400 }, { personnel: 5000 }),
  sa('maneuver', 'brigade', '8th Armored Brigade', base('King Faisal Military City, Khamis Mushait', 18.3, 42.73), { m1a2s: 80, m2a2_bradley: 60, m109a5: 18, infantry_squad: 40, truck: 400 }, { personnel: 5000, experience: 0.55 }),
  sa('maneuver', 'brigade', '11th Mechanized Brigade', base('Najran', 17.49, 44.13), { m60a3: 140, m113: 120, m109a5: 18, infantry_squad: 70, truck: 400 }, { personnel: 5000, experience: 0.55 }),
  sa('maneuver', 'brigade', '18th Mechanized Brigade', base('Jizan', 16.89, 42.57), { m60a3: 140, m113: 120, infantry_squad: 70, truck: 400 }, { personnel: 5000, experience: 0.55 }),
  sa('maneuver', 'brigade', '6th Mechanized Brigade', base('Hafar al-Batin', 28.43, 45.97), { amx30: 140, amx10p: 100, infantry_squad: 70, truck: 400 }, { personnel: 5000, readiness: 0.4 }),
  sa('maneuver', 'brigade', '64th Airborne Brigade', base('Tabuk', 28.38, 36.62), { infantry_squad: 120, truck: 150 }, { personnel: 4000 }),
  sa('maneuver', 'brigade', 'Royal Guard Regiment', base('Riyadh', 24.7, 46.7), { lav25: 60, infantry_squad: 60, truck: 100 }, { personnel: 2500 }),
  sa('artillery', 'brigade', 'Artillery Corps', base('King Khalid Military City', 27.9, 45.5), { m109a5: 60, caesar: 60, astros2: 60, m270: 10, truck: 300 }),
  sa('maneuver', 'division', 'National Guard Western Sector', base('Jeddah', 21.54, 39.17), { lav25: 400, infantry_squad: 400, m198: 36, truck: 600 }, { personnel: 25000 }),
  sa('maneuver', 'division', 'National Guard Central Sector', base('Riyadh', 24.75, 46.75), { lav25: 400, infantry_squad: 400, m198: 36, truck: 600 }, { personnel: 25000 }),
  sa('maneuver', 'division', 'National Guard Eastern Sector', base('Dammam', 26.42, 50.09), { lav25: 300, infantry_squad: 350, m198: 36, truck: 500 }, { personnel: 25000 }),
  sa('air_wing', 'brigade', 'Army Aviation Command', base('King Khalid Military City', 27.9, 45.53), { ah64d: 48, uh60: 60, as365: 20 }),
  sa('missile', 'brigade', 'Royal Strategic Missile Force (DF-21)', base('Al-Watah', 22.0, 45.45), { df21_tel: 12 }, { source: 'IISS Military Balance 2025; CSIS Missile Threat (Saudi DF-21 purchase), counts estimated' }),
  sa('air_defense', 'brigade', 'Air Defense Forces (Riyadh)', base('Riyadh', 24.71, 46.67), { patriot_pac3: 36, thaad_launcher: 6, shahine: 20 }),
  sa('air_defense', 'brigade', 'Air Defense Forces (Eastern Province)', base('Dhahran', 26.27, 50.15), { patriot_pac3: 36, crotale: 20 }),
  sa('air_defense', 'brigade', 'Air Defense Forces (Western and Southern)', base('Jeddah', 21.6, 39.2), { patriot_pac3: 36, hawk: 24 }),
  // RSAF: F-15SA 84, F-15C/D ~80, Typhoon 72, Tornado IDS ~66.
  sa('air_wing', 'wing', 'King Abdulaziz AB (Typhoon, Tornado)', base('Dhahran', 26.27, 50.15), { typhoon: 48, tornado_ids: 32 }),
  sa('air_wing', 'wing', 'King Fahad AB (F-15SA, Typhoon)', base('Taif', 21.48, 40.54), { f15sa: 42, typhoon: 24 }),
  sa('air_wing', 'wing', 'King Khalid AB (F-15SA)', base('Khamis Mushait', 18.3, 42.8), { f15sa: 42 }),
  sa('air_wing', 'wing', 'King Faisal AB (F-15C/D, Tornado)', base('Tabuk', 28.37, 36.62), { f15c: 50, tornado_ids: 34 }),
  sa('air_wing', 'wing', 'Prince Sultan AB (F-15C, AEW, tankers)', base('Al-Kharj', 24.06, 47.58), { f15c: 30, e3a: 5, a330_mrtt: 6, kc130h: 7 }),
  sa('surface_group', 'fleet', 'Western Fleet', base('Jeddah', 21.45, 39.15), { al_riyadh: 3, madina: 4, patrol_craft: 20 }),
  sa('surface_group', 'fleet', 'Eastern Fleet', base('Jubail', 27.0, 49.66), { al_jubail_corvette: 5, badr_corvette: 4, mmsc_tuwaiq: 2, patrol_craft: 20 }),
];

// ---------------------------------------------------------------- UAE
const ae = nation('ARE', SRC, { readiness: 0.7, experience: 0.55 });
export const uae = [
  ae('maneuver', 'brigade', 'Western Region Armoured Brigade', base('Madinat Zayed', 23.68, 53.7), { leclerc: 170, bmp3: 140, g6_sph: 24, infantry_squad: 60, truck: 400 }, { personnel: 7000 }),
  ae('maneuver', 'brigade', 'Abu Dhabi Mechanised Brigade', base('Abu Dhabi', 24.35, 54.5), { leclerc: 100, bmp3: 140, m109a3: 24, infantry_squad: 80, truck: 400 }, { personnel: 7000 }),
  ae('maneuver', 'brigade', 'Al Ain Mechanised Brigade', base('Al Ain', 24.2, 55.75), { leclerc: 70, bmp3: 120, infantry_squad: 80, truck: 400 }, { personnel: 7000 }),
  ae('maneuver', 'brigade', 'Presidential Guard', base('Abu Dhabi', 24.45, 54.4), { bmp3: 100, nimr: 200, infantry_squad: 150, truck: 300 }, { personnel: 12000, readiness: 0.85, experience: 0.65 }),
  ae('maneuver', 'brigade', 'Northern Command', base('Ras al-Khaimah', 25.79, 55.94), { nimr: 150, infantry_squad: 120, truck: 250 }, { personnel: 6000 }),
  ae('artillery', 'brigade', 'Artillery Command', base('Al Dhafra', 24.24, 54.55), { himars: 20, jobaria_mlrs: 48, g6_sph: 30, truck: 200 }),
  ae('air_defense', 'brigade', 'Air Defence Command', base('Abu Dhabi', 24.44, 54.65), { thaad_launcher: 12, patriot_pac3: 36, km_sam_launcher: 12, pantsir_s1: 40 }),
  ae('air_wing', 'wing', 'Al Dhafra AB', base('Al Dhafra', 24.25, 54.55), { f16e: 78, globaleye: 5, a330_mrtt: 3 }),
  ae('air_wing', 'wing', 'Al Minhad AB', base('Al Minhad', 25.03, 55.37), { mirage2000_9: 59 }),
  ae('air_wing', 'wing', 'Joint Aviation Command', base('Al Sader', 24.5, 54.7), { ah64d: 28, uh60m: 60, ch47f: 22, wing_loong2: 15 }),
  ae('surface_group', 'flotilla', 'UAE Navy', base('Abu Dhabi', 24.52, 54.38), { baynunah: 6, abu_dhabi_corvette: 1, gowind: 2, patrol_craft: 30 }),
];

// ---------------------------------------------------------------- Egypt
const eg = nation('EGY', SRC, { readiness: 0.55, experience: 0.4 });
export const egypt = [
  eg('maneuver', 'division', '4th Armored Division (Third Field Army)', base('Suez', 29.97, 32.53), { m1a1: 300, m113: 200, m109a5: 36, infantry_squad: 100, truck: 1200 }, { personnel: 12000 }),
  eg('maneuver', 'division', '21st Armored Division (Second Field Army)', base('Ismailia', 30.6, 32.27), { m1a1: 300, m113: 200, m109a5: 36, infantry_squad: 100, truck: 1200 }, { personnel: 12000 }),
  eg('maneuver', 'division', '9th Armored Division (Central Zone)', base('Dahshur', 29.8, 31.2), { m1a1: 300, ybs_ifv: 120, m109a5: 36, infantry_squad: 100, truck: 1200 }, { personnel: 12000 }),
  eg('maneuver', 'division', '6th Armored Division', base('Cairo', 30.1, 31.4), { m60a3: 250, m113: 200, m109a5: 36, infantry_squad: 100, truck: 1200 }, { personnel: 12000 }),
  eg('maneuver', 'division', '2nd Mechanized Division (Second Field Army)', base('Ismailia', 30.55, 32.2), { m60a3: 150, m113: 250, d30: 54, infantry_squad: 300, truck: 1300 }, { personnel: 14000 }),
  eg('maneuver', 'division', '7th Mechanized Division (Third Field Army)', base('Suez', 29.95, 32.45), { m60a3: 150, m113: 250, d30: 54, infantry_squad: 300, truck: 1300 }, { personnel: 14000 }),
  eg('maneuver', 'division', '16th Mechanized Division (Second Field Army)', base('Qantara', 30.85, 32.3), { m60a3: 150, bmp1: 120, d30: 54, infantry_squad: 300, truck: 1300 }, { personnel: 14000 }),
  eg('maneuver', 'division', '19th Mechanized Division (Third Field Army)', base('Sinai (Nakhl)', 29.9, 33.75), { m60a3: 150, bmp1: 120, d30: 54, infantry_squad: 300, truck: 1300 }, { personnel: 14000 }),
  eg('maneuver', 'division', '23rd Mechanized Division', base('Cairo', 30.05, 31.6), { t62: 150, bmp1: 120, d30: 54, infantry_squad: 300, truck: 1300 }, { personnel: 14000 }),
  eg('maneuver', 'division', 'Northern Military Zone', base('Alexandria', 31.2, 29.92), { t62: 150, fahd_apc: 120, d30: 54, infantry_squad: 300, truck: 1000 }, { personnel: 14000 }),
  eg('maneuver', 'division', 'Western Military Zone', base('Mersa Matruh', 31.35, 27.24), { m60a1: 150, fahd_apc: 120, d30: 54, infantry_squad: 300, truck: 1200 }, { personnel: 14000 }),
  eg('maneuver', 'division', 'Southern Military Zone', base('Aswan', 24.09, 32.9), { ramses2: 130, fahd_apc: 80, d30: 36, infantry_squad: 300, truck: 900 }, { personnel: 12000 }),
  eg('maneuver', 'division', 'Republican Guard', base('Cairo', 30.08, 31.32), { m1a1: 230, m113: 100, infantry_squad: 80, truck: 300 }, { personnel: 8000, readiness: 0.75 }),
  eg('maneuver', 'brigade', 'Airborne and Special Forces', base('Inshas', 30.32, 31.45), { infantry_squad: 400, truck: 300 }, { personnel: 15000, readiness: 0.7, experience: 0.55 }),
  eg('artillery', 'brigade', 'Army Artillery and Missile Command', base('Cairo', 30.0, 31.5), { m109a5: 120, k9_thunder: 48, bm21: 90, m270: 26, scud_b_tel: 9, truck: 600 }),
  eg('air_defense', 'division', 'Air Defense Forces (Delta)', base('Cairo', 30.06, 31.25), { s300vm_launcher: 12, buk_m2: 24, tor_m2: 16, s125_pechora: 60, s75_dvina: 50, hawk: 24 }),
  eg('air_defense', 'division', 'Air Defense Forces (Canal and Sinai)', base('Ismailia', 30.6, 32.25), { buk_m2: 12, s125_pechora: 40, kub_2k12: 40, chaparral: 40, avenger: 30 }),
  // EAF: F-16C/D ~210, Rafale ~50, MiG-29M ~46, Mirage 2000 ~18, Mirage 5 ~70, F-7/J-7 ~80.
  eg('air_wing', 'wing', 'Gebel El Basur AB', base('Gebel El Basur', 30.55, 30.56), { rafale: 50, mig29m: 46 }),
  eg('air_wing', 'wing', 'Beni Suef AB', base('Beni Suef', 29.1, 31.03), { f16c: 70 }),
  eg('air_wing', 'wing', 'Abu Suwayr AB', base('Abu Suwayr', 30.56, 32.1), { f16c: 70 }),
  eg('air_wing', 'wing', 'Gianaclis AB', base('Gianaclis', 30.82, 30.19), { f16c: 70 }),
  eg('air_wing', 'wing', 'Bir Kusaybah and Tanta ABs', base('Tanta', 30.8, 30.95), { mirage2000: 18, mirage5: 70 }),
  eg('air_wing', 'wing', 'Inshas and Aswan ABs', base('Aswan', 23.96, 32.82), { f7: 80, k8: 60 }),
  eg('air_wing', 'wing', 'Army Aviation', base('Cairo West', 30.12, 30.92), { ah64d: 46, ka52: 46, mi17: 60, ch47d: 19, e2c: 7, c130h: 24 }),
  eg('surface_group', 'fleet', 'Mediterranean Fleet', base('Alexandria', 31.18, 29.87), { fremm: 2, meko_a200: 2, oliver_hazard_perry: 2, mistral: 1, gowind: 2, patrol_craft: 30 }),
  eg('surface_group', 'fleet', 'Southern (Red Sea) Fleet', base('Safaga', 26.74, 33.94), { meko_a200: 2, oliver_hazard_perry: 2, jianghu: 1, mistral: 1, gowind: 2, patrol_craft: 20 }),
  eg('submarine', 'flotilla', 'Submarine Flotilla', base('Alexandria', 31.18, 29.87), { type209_1400: 4, romeo: 4 }),
];

// ---------------------------------------------------------------- Syria (post-2024)
const SY_SRC = 'Estimates: Syrian MoD 2025 announcements; IDF statements on December 2024 strikes; ISW reporting';
const sy = nation('SYR', SY_SRC, { readiness: 0.4, experience: 0.65 });
export const syria = [
  sy('maneuver', 'division', 'Damascus Division Group', base('Damascus', 33.51, 36.29), { t72: 40, bmp1: 30, d30: 18, technical: 150, infantry_squad: 600, truck: 300 }, { personnel: 25000 }),
  sy('maneuver', 'division', 'Idlib Division Group (ex-HTS)', base('Idlib', 35.93, 36.63), { t55: 25, t62: 15, technical: 200, d30: 12, infantry_squad: 700, truck: 300 }, { personnel: 25000, experience: 0.75 }),
  sy('maneuver', 'division', 'Aleppo Division Group (ex-SNA)', base('Aleppo', 36.2, 37.15), { t62: 20, t55: 20, technical: 150, d30: 12, infantry_squad: 600, truck: 250 }, { personnel: 22000 }),
  sy('maneuver', 'division', 'Homs and Hama Division Group', base('Homs', 34.73, 36.72), { t72: 20, bmp1: 20, technical: 100, infantry_squad: 400, truck: 200 }, { personnel: 15000 }),
  sy('maneuver', 'division', 'Coastal Division Group', base('Latakia', 35.52, 35.78), { technical: 80, infantry_squad: 300, truck: 150 }, { personnel: 12000 }),
  sy('maneuver', 'division', 'Southern Division Group', base('Daraa', 32.62, 36.1), { t55: 10, technical: 100, infantry_squad: 300, truck: 150 }, { personnel: 12000 }),
  sy('maneuver', 'division', 'Deir ez-Zor Division Group', base('Deir ez-Zor', 35.33, 40.14), { technical: 80, infantry_squad: 250, truck: 120 }, { personnel: 10000 }),
  sy('maneuver', 'division', 'Syrian Democratic Forces (integration pending)', base('Hasakah', 36.5, 40.75), { technical: 200, infantry_squad: 800, truck: 300 }, { personnel: 40000, readiness: 0.5, experience: 0.7, source: 'Estimate: SDF strength per CENTCOM statements; March 2025 integration agreement' }),
];

// ---------------------------------------------------------------- Iraq
const iq = nation('IRQ', SRC, { readiness: 0.5, experience: 0.6 });
export const iraq = [
  iq('maneuver', 'division', '9th Armored Division', base('Besmaya', 33.2, 44.6), { m1a1: 140, t90s: 73, t72: 50, bmp1: 60, m113: 200, infantry_squad: 100, truck: 600 }, { personnel: 12000 }),
  iq('maneuver', 'division', 'Baghdad Operations Command (6th, 11th Divisions)', base('Baghdad', 33.31, 44.37), { t72: 30, t55: 40, m113: 100, infantry_squad: 700, truck: 800 }, { personnel: 30000 }),
  iq('maneuver', 'division', 'Nineveh Operations Command (15th, 16th Divisions)', base('Mosul', 36.34, 43.13), { t72: 20, t55: 30, m113: 80, infantry_squad: 600, truck: 600 }, { personnel: 25000 }),
  iq('maneuver', 'division', 'Anbar Operations Command (7th, 10th Divisions)', base('Ramadi', 33.42, 43.3), { m113: 60, infantry_squad: 500, truck: 500 }, { personnel: 20000 }),
  iq('maneuver', 'division', 'Basra Operations Command (8th, 14th Divisions)', base('Basra', 30.5, 47.8), { m113: 60, infantry_squad: 500, truck: 500 }, { personnel: 20000 }),
  iq('maneuver', 'brigade', 'Counter Terrorism Service', base('Baghdad', 33.3, 44.4), { infantry_squad: 300, truck: 400 }, { personnel: 10000, readiness: 0.75, experience: 0.85 }),
  iq('maneuver', 'division', 'Popular Mobilization Forces (Baghdad and centre)', base('Baghdad', 33.35, 44.42), { technical: 400, infantry_squad: 1500, d30: 36, truck: 600 }, { personnel: 80000, readiness: 0.45 }),
  iq('maneuver', 'division', 'Popular Mobilization Forces (north and west)', base('Tikrit', 34.6, 43.68), { technical: 300, infantry_squad: 1200, truck: 500 }, { personnel: 60000, readiness: 0.45 }),
  iq('maneuver', 'division', 'Popular Mobilization Forces (south)', base('Karbala', 32.6, 44.02), { technical: 300, infantry_squad: 1200, truck: 500 }, { personnel: 60000, readiness: 0.45 }),
  iq('maneuver', 'division', 'Kurdistan Region Peshmerga', base('Erbil', 36.19, 44.01), { mrap: 200, technical: 300, infantry_squad: 1500, truck: 600 }, { personnel: 120000, readiness: 0.5, experience: 0.7, source: 'IISS Military Balance 2025 (Kurdistan Regional Government forces)' }),
  iq('artillery', 'brigade', 'Army Artillery', base('Taji', 33.53, 44.25), { m198: 60, m109a5: 24, bm21: 18, truck: 200 }),
  iq('air_wing', 'wing', 'Balad AB', base('Balad', 33.94, 44.36), { f16c: 34, l159: 12 }),
  iq('air_wing', 'wing', 'Al Kut AB', base('Al Kut', 32.5, 45.8), { t50iq: 24 }),
  iq('air_wing', 'wing', 'Al Taqaddum AB', base('Habbaniyah', 33.34, 43.6), { su25: 18, mi28ne: 15, mi35: 10, mi17: 30 }),
  iq('surface_group', 'flotilla', 'Iraqi Navy', base('Umm Qasr', 30.03, 47.95), { patrol_craft: 15 }),
];

// ---------------------------------------------------------------- Jordan
const jo = nation('JOR', SRC, { readiness: 0.7, experience: 0.35 });
export const jordan = [
  jo('maneuver', 'division', 'Northern Military Region', base('Mafraq', 32.34, 36.21), { m60_phoenix: 60, m113: 150, ratel: 50, m109a5: 18, infantry_squad: 250, truck: 500 }, { personnel: 18000 }),
  jo('maneuver', 'division', 'Central Military Region', base('Zarqa', 32.07, 36.09), { leclerc: 80, m60_phoenix: 40, m113: 150, m109a5: 18, infantry_squad: 250, truck: 500 }, { personnel: 18000 }),
  jo('maneuver', 'division', 'Eastern Military Region', base('Azraq', 31.83, 36.82), { m113: 80, infantry_squad: 200, truck: 300 }, { personnel: 12000 }),
  jo('maneuver', 'division', 'Southern Military Region', base("Ma'an", 30.19, 35.73), { m113: 60, infantry_squad: 200, truck: 300 }, { personnel: 12000 }),
  jo('maneuver', 'brigade', 'King Abdullah II Special Operations Command', base('Amman', 31.95, 35.93), { infantry_squad: 250, truck: 200 }, { personnel: 14000, readiness: 0.85, experience: 0.5 }),
  jo('artillery', 'brigade', 'Royal Artillery', base('Zarqa', 32.05, 36.05), { m109a5: 60, m110: 30, himars: 12, truck: 150 }),
  jo('air_defense', 'brigade', 'Air Defence', base('Amman', 31.97, 35.99), { patriot_pac2: 12, hawk: 24, avenger: 20 }),
  jo('air_wing', 'wing', 'Muwaffaq Salti AB', base('Azraq', 31.83, 36.79), { f16a: 45 }),
  jo('air_wing', 'wing', 'King Abdullah II AB', base('Amman (Marka)', 31.97, 35.99), { ah1f: 12, uh60: 20, c130h: 3 }),
];

// ---------------------------------------------------------------- Qatar
const qa = nation('QAT', SRC, { readiness: 0.7, experience: 0.2 });
export const qatar = [
  qa('maneuver', 'brigade', 'Armoured Brigade', base('Al Daayen', 25.45, 51.45), { leopard2a7: 62, vab: 100, pzh2000: 24, infantry_squad: 40, truck: 200 }, { personnel: 4000 }),
  qa('maneuver', 'brigade', 'Mechanised Brigade', base('Doha', 25.25, 51.45), { piranha: 100, infantry_squad: 80, truck: 200 }, { personnel: 4000 }),
  qa('maneuver', 'brigade', 'Emiri Guard', base('Doha', 25.3, 51.52), { infantry_squad: 80, truck: 150 }, { personnel: 3000 }),
  qa('air_defense', 'brigade', 'Air Defence Group', base('Doha', 25.28, 51.55), { patriot_pac3: 10, nasams: 3 }),
  qa('air_wing', 'wing', 'Al Udeid AB', base('Al Udeid', 25.12, 51.32), { f15qa: 36, c17: 8 }),
  qa('air_wing', 'wing', 'Dukhan (Tamim) AB', base('Dukhan', 25.4, 50.78), { rafale: 36, typhoon: 24, ah64e: 24, nh90: 28 }),
  qa('surface_group', 'flotilla', 'Qatar Emiri Navy', base('Doha', 25.29, 51.55), { al_zubarah_corvette: 4, al_fulk_lpd: 1, musherib_opv: 2, patrol_craft: 10 }),
];

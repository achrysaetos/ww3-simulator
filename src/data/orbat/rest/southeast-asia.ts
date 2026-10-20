// Sources: IISS Military Balance 2025 country sections for the Philippines, Vietnam,
// Indonesia, Singapore and Thailand. Garrisons from each armed force's published unit
// locations. Equipment splits between formations are estimates.
import { base, nation } from './build';

const SRC = 'IISS Military Balance 2025';

// ---------------------------------------------------------------- Philippines
const ph = nation('PHL', SRC, { readiness: 0.6, experience: 0.55 });
const phDivision = { m113: 15, m101: 18, infantry_squad: 300, truck: 400 };
export const philippines = [
  ...([
    ['1st Infantry Division', 'Pulacan, Zamboanga del Sur', 7.85, 123.45],
    ['2nd Infantry Division', 'Tanay, Rizal', 14.5, 121.28],
    ['3rd Infantry Division', 'Jamindan, Capiz', 11.4, 122.5],
    ['4th Infantry Division', 'Cagayan de Oro', 8.48, 124.65],
    ['5th Infantry Division', 'Gamu, Isabela', 16.95, 121.83],
    ['6th Infantry Division', 'Datu Odin Sinsuat', 7.16, 124.2],
    ['7th Infantry Division', 'Fort Magsaysay', 15.43, 121.08],
    ['8th Infantry Division', 'Catbalogan, Samar', 11.78, 124.89],
    ['9th Infantry Division', 'Pili, Camarines Sur', 13.58, 123.28],
    ['10th Infantry Division', 'Mawab, Davao de Oro', 7.5, 125.93],
    ['11th Infantry Division', 'Jolo, Sulu', 6.05, 121.0],
  ] as const).map(([name, place, lat, lon]) => ph('maneuver', 'division', name, base(place, lat, lon), phDivision, { personnel: 8000 })),
  ph('maneuver', 'division', 'Armor Division', base("Camp O'Donnell, Capas", 15.34, 120.53), { sabrah_light_tank: 18, m113: 120, simba_apc: 20, infantry_squad: 60, atmos_sph: 12, truck: 250 }, { personnel: 4000 }),
  ph('maneuver', 'division', 'Philippine Marine Corps', base('Fort Bonifacio, Taguig', 14.53, 121.05), { aav7: 8, m101: 18, infantry_squad: 250, truck: 300 }, { personnel: 8500 }),
  ph('missile', 'battalion', 'Coastal Defense Regiment (BrahMos)', base('Zambales', 15.3, 120.05), { brahmos_coastal: 6 }),
  ph('maneuver', 'brigade', 'Special Operations Command', base('Fort Magsaysay', 15.45, 121.1), { infantry_squad: 150, truck: 100 }, { personnel: 4000, readiness: 0.8, experience: 0.7 }),
  ph('air_wing', 'wing', '5th Fighter Wing', base('Basa AB, Pampanga', 14.99, 120.49), { fa50ph: 12 }),
  ph('air_wing', 'wing', '15th Strike Wing', base('Sangley Point, Cavite', 14.49, 120.9), { a29: 6, ah1s: 2, t129_atak: 6 }),
  ph('air_wing', 'wing', 'Tactical Operations and Air Mobility', base('Clark AB', 15.19, 120.56), { s70i_blackhawk: 32, c130h: 4, c295: 3 }),
  ph('surface_group', 'flotilla', 'Offshore Combat Force', base('Subic Bay', 14.8, 120.28), { jose_rizal: 2, miguel_malvar_corvette: 2, del_pilar_opv: 3, tarlac_lpd: 2 }),
  ph('surface_group', 'flotilla', 'Littoral Combat Force', base('Cavite', 14.48, 120.92), { patrol_craft: 20 }),
];

// ---------------------------------------------------------------- Vietnam
const vn = nation('VNM', SRC, { readiness: 0.65, experience: 0.3 });
const vnDivision = { t55: 55, btr60: 20, d30: 24, infantry_squad: 300, truck: 300 };
export const vietnam = [
  ...([
    ['Capital Military Command (308th Division)', 'Hanoi', 21.03, 105.85],
    ['Military Region 1', 'Thai Nguyen', 21.59, 105.85],
    ['Military Region 2', 'Viet Tri', 21.32, 105.4],
    ['Military Region 3', 'Hai Phong', 20.86, 106.68],
    ['Military Region 4', 'Vinh', 18.68, 105.68],
    ['Military Region 5', 'Da Nang', 16.05, 108.2],
    ['Military Region 7', 'Ho Chi Minh City', 10.8, 106.65],
    ['Military Region 9', 'Can Tho', 10.03, 105.78],
  ] as const).map(([name, place, lat, lon]) => vn('maneuver', 'division', name, base(place, lat, lon), vnDivision, { personnel: 25000 })),
  vn('maneuver', 'corps', '12th Corps', base('Tam Diep, Ninh Binh', 20.15, 105.92), { t55: 120, type59: 120, bmp1: 60, btr60: 80, d30: 72, bm21: 18, infantry_squad: 600, truck: 1000 }, { personnel: 35000 }),
  vn('maneuver', 'corps', '34th Corps', base('Pleiku, Gia Lai', 13.98, 108.0), { t55: 120, type59: 120, t62: 70, bmp1: 60, btr60: 80, d30: 72, bm21: 18, infantry_squad: 600, truck: 1000 }, { personnel: 35000 }),
  vn('maneuver', 'corps', '4th Corps', base('Thu Dau Mot, Binh Duong', 10.98, 106.65), { t55: 120, type59: 110, bmp1: 60, btr60: 80, d30: 72, bm21: 18, infantry_squad: 600, truck: 1000 }, { personnel: 35000 }),
  vn('maneuver', 'brigade', '202nd Armored Brigade', base('Phu Tho', 21.4, 105.22), { t90s: 64, t55: 30, bmp2: 40, infantry_squad: 30, truck: 200 }, { personnel: 3000 }),
  vn('maneuver', 'brigade', 'Naval Infantry Brigades', base('Hai Phong', 20.85, 106.7), { pt76: 50, btr60: 50, infantry_squad: 200, truck: 150 }, { personnel: 6000 }),
  vn('missile', 'brigade', 'Coastal Missile Brigades (Bastion-P)', base('Cam Ranh', 11.92, 109.15), { bastion_p: 8, scud_b_tel: 12 }),
  vn('air_defense', 'division', 'Air Defense Divisions (S-300PMU1, SPYDER)', base('Hanoi', 21.0, 105.8), { s300pmu1: 12, spyder: 10, s125_pechora: 30, s75_dvina: 24 }),
  vn('air_wing', 'wing', '370th Air Division', base('Bien Hoa AB', 10.98, 106.82), { su30mk2: 12, su22: 15 }),
  vn('air_wing', 'wing', '372nd Air Division', base('Phu Cat AB', 13.95, 109.04), { su30mk2: 12, su22: 15 }),
  vn('air_wing', 'wing', '371st Air Division', base('Tho Xuan AB', 19.9, 105.47), { su30mk2: 11, su27: 6, mi8: 30 }),
  vn('surface_group', 'flotilla', 'Naval Region 4', base('Cam Ranh', 11.92, 109.15), { gepard_frigate: 4, molniya: 8, pohang_corvette: 1 }),
  vn('submarine', 'flotilla', '189th Submarine Brigade', base('Cam Ranh', 11.92, 109.15), { kilo: 6 }),
];

// ---------------------------------------------------------------- Indonesia
const id = nation('IDN', SRC, { readiness: 0.6, experience: 0.4 });
export const indonesia = [
  id('maneuver', 'division', '1st Kostrad Infantry Division', base('Cilodong, Depok', -6.43, 106.86), { leopard2a4: 42, marder1a3: 42, anoa_apc: 60, caesar: 18, infantry_squad: 250, truck: 500 }, { personnel: 12000 }),
  id('maneuver', 'division', '2nd Kostrad Infantry Division', base('Singosari, Malang', -7.89, 112.66), { leopard2ri: 61, anoa_apc: 60, caesar: 18, infantry_squad: 250, truck: 500 }, { personnel: 12000 }),
  id('maneuver', 'division', '3rd Kostrad Infantry Division', base('Gowa, Makassar', -5.2, 119.45), { anoa_apc: 60, m101: 18, infantry_squad: 250, truck: 500 }, { personnel: 12000 }),
  ...([
    ['Kodam Jaya', 'Jakarta', -6.2, 106.85],
    ['Kodam III/Siliwangi', 'Bandung', -6.92, 107.6],
    ['Kodam IV/Diponegoro', 'Semarang', -6.99, 110.42],
    ['Kodam V/Brawijaya', 'Surabaya', -7.25, 112.75],
    ['Kodam I/Bukit Barisan', 'Medan', 3.6, 98.67],
    ['Kodam XII/Tanjungpura', 'Pontianak', -0.03, 109.33],
    ['Kodam XIV/Hasanuddin', 'Makassar', -5.14, 119.43],
    ['Kodam XVII/Cenderawasih', 'Jayapura', -2.55, 140.7],
  ] as const).map(([name, place, lat, lon]) => id('maneuver', 'division', name, base(place, lat, lon), { infantry_squad: 400, m101: 12, truck: 400 }, { personnel: 25000 })),
  id('maneuver', 'brigade', 'Kopassus', base('Cijantung, Jakarta', -6.31, 106.86), { infantry_squad: 200, truck: 100 }, { personnel: 6000, readiness: 0.85 }),
  id('maneuver', 'division', 'Korps Marinir', base('Surabaya', -7.2, 112.73), { bmp3f: 54, pt76: 30, bvp2: 20, infantry_squad: 300, truck: 300 }, { personnel: 20000 }),
  id('air_wing', 'wing', 'Iswahyudi AB (3 and 15 Sqn)', base('Madiun', -7.62, 111.43), { f16c: 22, t50i: 13 }),
  id('air_wing', 'wing', 'Roesmin Nurjadin AB (12 and 16 Sqn)', base('Pekanbaru', 0.46, 101.44), { f16c: 11, hawk200: 12 }),
  id('air_wing', 'wing', 'Sultan Hasanuddin AB (11 Sqn)', base('Makassar', -5.06, 119.55), { su30mk2: 11, su27: 5 }),
  id('air_wing', 'wing', 'Supadio AB (1 Sqn)', base('Pontianak', -0.15, 109.4), { hawk200: 10 }),
  id('air_wing', 'wing', 'Abdulrachman Saleh AB (21 Sqn)', base('Malang', -7.93, 112.71), { emb314: 14, c130h: 12 }),
  id('surface_group', 'fleet', 'Koarmada I', base('Jakarta (Tanjung Priok)', -6.1, 106.88), { martadinata: 1, ahmad_yani: 2, bung_tomo_corvette: 3, diponegoro_corvette: 2, patrol_craft: 15 }),
  id('surface_group', 'fleet', 'Koarmada II', base('Surabaya', -7.2, 112.73), { martadinata: 1, ahmad_yani: 2, diponegoro_corvette: 2, fatahillah_corvette: 3, makassar_lpd: 4, patrol_craft: 15 }),
  id('surface_group', 'fleet', 'Koarmada III', base('Sorong', -0.88, 131.25), { patrol_craft: 12, parchim_corvette: 6 }),
  id('submarine', 'flotilla', 'Submarine Unit', base('Surabaya', -7.2, 112.73), { nagapasa: 3, cakra: 1 }),
];

// ---------------------------------------------------------------- Singapore
const sg = nation('SGP', SRC, { readiness: 0.9, experience: 0.15 });
export const singapore = [
  sg('maneuver', 'division', '3rd Division', base('Kranji Camp', 1.42, 103.75), { leopard2sg: 48, bionix2: 100, terrex: 100, ssph_primus: 18, infantry_squad: 200, truck: 400 }, { personnel: 12000 }),
  sg('maneuver', 'division', '6th Division', base('Mandai Hill Camp', 1.41, 103.79), { leopard2sg: 48, hunter_afv: 100, bionix2: 50, m113: 200, ssph_primus: 18, infantry_squad: 200, truck: 400 }, { personnel: 12000 }),
  sg('maneuver', 'division', '9th Division', base('Jurong Camp', 1.35, 103.7), { terrex: 150, m113: 200, fh2000: 36, infantry_squad: 250, truck: 400 }, { personnel: 12000 }),
  sg('maneuver', 'division', '21st Division (Guards)', base('Bedok Camp', 1.33, 103.93), { terrex: 80, infantry_squad: 150, truck: 200 }, { personnel: 8000 }),
  sg('artillery', 'brigade', 'Singapore Artillery', base('Khatib Camp', 1.42, 103.83), { himars: 18, ssph_primus: 18, truck: 150 }),
  sg('air_defense', 'brigade', 'Air Defence and Operations Command', base('Paya Lebar', 1.36, 103.91), { aster30_samp_t: 12, spyder: 12, rbs70: 30 }),
  sg('air_wing', 'wing', 'Paya Lebar Air Base', base('Paya Lebar AB', 1.36, 103.91), { f15sg: 40, g550_caew: 4, a330_mrtt: 6 }),
  sg('air_wing', 'wing', 'Tengah Air Base', base('Tengah AB', 1.39, 103.71), { f16c: 40 }),
  sg('air_wing', 'wing', 'Changi Air Base', base('Changi AB', 1.35, 103.99), { f16c: 20, ah64d: 17, ch47f: 16 }),
  sg('surface_group', 'flotilla', '1st Flotilla', base('Changi Naval Base', 1.32, 104.02), { formidable: 6, endurance_lpd: 4 }),
  sg('surface_group', 'flotilla', '3rd Flotilla', base('Tuas Naval Base', 1.3, 103.62), { independence_lmv: 8 }),
  sg('submarine', 'flotilla', '171 Squadron', base('Changi Naval Base', 1.32, 104.02), { invincible_218sg: 2, archer: 2 }),
];

// ---------------------------------------------------------------- Thailand
const th = nation('THA', SRC, { readiness: 0.6, experience: 0.3 });
export const thailand = [
  th('maneuver', 'division', '1st Division (King\'s Guard)', base('Bangkok', 13.78, 100.52), { m113: 60, m101: 18, infantry_squad: 250, truck: 400 }, { personnel: 12000 }),
  th('maneuver', 'division', '2nd Infantry Division', base('Prachinburi', 14.05, 101.37), { m113: 60, m198: 18, infantry_squad: 250, truck: 400 }, { personnel: 12000 }),
  th('maneuver', 'division', '9th Infantry Division', base('Kanchanaburi', 14.02, 99.53), { m113: 30, m101: 18, infantry_squad: 250, truck: 400 }, { personnel: 12000 }),
  th('maneuver', 'division', '11th Infantry Division', base('Chachoengsao', 13.69, 101.07), { btr3e1: 60, m101: 18, infantry_squad: 200, truck: 350 }, { personnel: 10000 }),
  th('maneuver', 'division', '1st Cavalry Division', base('Phetchabun', 16.42, 101.15), { m60a3: 105, m60a1: 53, m113: 80, m109a5: 18, infantry_squad: 60, truck: 300 }, { personnel: 8000 }),
  th('maneuver', 'division', '2nd Cavalry Division (King\'s Guard)', base('Bangkok', 13.8, 100.56), { vt4: 60, t84_oplot: 49, m113: 80, infantry_squad: 60, truck: 300 }, { personnel: 8000 }),
  th('maneuver', 'division', '3rd Cavalry Division', base('Khon Kaen', 16.43, 102.83), { m48a5: 105, stingray_light_tank: 50, m113: 60, infantry_squad: 60, truck: 300 }, { personnel: 8000 }),
  th('maneuver', 'division', '3rd Infantry Division', base('Nakhon Ratchasima', 14.97, 102.1), { m113: 40, m198: 18, infantry_squad: 250, truck: 400 }, { personnel: 12000 }),
  th('maneuver', 'division', '6th Infantry Division', base('Roi Et', 16.05, 103.65), { m113: 40, m101: 18, infantry_squad: 250, truck: 400 }, { personnel: 12000 }),
  th('maneuver', 'division', '4th Infantry Division', base('Phitsanulok', 16.82, 100.26), { m113: 40, m101: 18, infantry_squad: 250, truck: 400 }, { personnel: 12000 }),
  th('maneuver', 'division', '7th Infantry Division', base('Chiang Mai', 18.79, 98.98), { m101: 18, infantry_squad: 250, truck: 350 }, { personnel: 12000 }),
  th('maneuver', 'division', '5th Infantry Division', base('Nakhon Si Thammarat', 8.43, 99.96), { m101: 18, infantry_squad: 250, truck: 350 }, { personnel: 12000 }),
  th('maneuver', 'division', '15th Infantry Division', base('Pattani', 6.87, 101.25), { infantry_squad: 300, truck: 350 }, { personnel: 12000, experience: 0.55 }),
  th('maneuver', 'division', 'Royal Thai Marine Corps', base('Sattahip', 12.67, 100.9), { aav7: 33, btr3e1: 30, infantry_squad: 200, truck: 200 }, { personnel: 23000 }),
  th('artillery', 'brigade', 'Artillery Division', base('Lopburi', 14.8, 100.62), { atmos_sph: 18, caesar: 6, dti1_mlrs: 12, sr4_mlrs: 4, truck: 200 }),
  th('air_wing', 'wing', 'Wing 1', base('Korat AB', 14.93, 102.08), { f16a: 30 }),
  th('air_wing', 'wing', 'Wing 4', base('Takhli AB', 15.28, 100.3), { f16a: 20, t50th: 14 }),
  th('air_wing', 'wing', 'Wing 7', base('Surat Thani AB', 9.13, 99.14), { gripen_c: 11, saab340_aew: 2 }),
  th('air_wing', 'wing', 'Wing 21', base('Ubon Ratchathani AB', 15.25, 104.87), { f5e: 14 }),
  th('air_wing', 'wing', 'Wing 41', base('Chiang Mai AB', 18.77, 98.96), { at6th: 8, alpha_jet: 15 }),
  th('surface_group', 'fleet', 'Royal Thai Fleet', base('Sattahip', 12.67, 100.9), { chakri_naruebet: 1, naresuan: 2, bhumibol_adulyadej: 1, chao_phraya: 2, phutthayotfa_chulalok: 1, rattanakosin_corvette: 2, krabi_opv: 2, angthong_lpd: 1 }),
];

// Sources: IISS Military Balance 2025 country sections for Algeria, Morocco, Nigeria, South
// Africa and Ethiopia; SIPRI Arms Transfers Database for recent deliveries. Garrisons are
// military-region and division headquarters; equipment splits are estimates.
import { base, nation } from './build';

const SRC = 'IISS Military Balance 2025';

// ---------------------------------------------------------------- Algeria
const dz = nation('DZA', SRC, { readiness: 0.6, experience: 0.35 });
export const algeria = [
  dz('maneuver', 'division', '1st Armoured Division', base('Bouira', 36.37, 3.9), { t90s: 300, bmp2: 150, msta_s: 18, infantry_squad: 100, truck: 1000 }, { personnel: 12000 }),
  dz('maneuver', 'division', '8th Armoured Division', base('Sidi Bel Abbès', 35.19, -0.63), { t90s: 300, bmp3: 100, msta_s: 18, infantry_squad: 100, truck: 1000 }, { personnel: 12000 }),
  dz('maneuver', 'division', '12th Mechanised Division', base('Djelfa', 34.67, 3.25), { t72: 300, bmp2: 200, d30: 54, infantry_squad: 250, truck: 1100 }, { personnel: 14000 }),
  dz('maneuver', 'division', '40th Mechanised Division', base('Oran', 35.7, -0.63), { t72: 300, bmp1: 200, d30: 54, infantry_squad: 250, truck: 1100 }, { personnel: 14000 }),
  dz('maneuver', 'division', '1st Military Region Brigades', base('Blida', 36.47, 2.83), { t62: 100, btr80: 100, d30: 36, infantry_squad: 300, truck: 600 }, { personnel: 15000 }),
  dz('maneuver', 'division', '3rd Military Region Brigades', base('Béchar', 31.62, -2.22), { t62: 100, btr80: 120, bm21: 18, infantry_squad: 300, truck: 600 }, { personnel: 15000 }),
  dz('maneuver', 'division', '4th Military Region Brigades', base('Ouargla', 31.95, 5.33), { t62: 100, btr60: 100, infantry_squad: 250, truck: 600 }, { personnel: 12000 }),
  dz('maneuver', 'division', '5th Military Region Brigades', base('Constantine', 36.36, 6.61), { btr80: 100, d30: 36, infantry_squad: 300, truck: 600 }, { personnel: 15000 }),
  dz('maneuver', 'division', '6th Military Region Brigades', base('Tamanrasset', 22.79, 5.52), { btr60: 60, infantry_squad: 200, truck: 500 }, { personnel: 10000 }),
  dz('maneuver', 'brigade', '17th Airborne Division', base('Biskra', 34.85, 5.73), { infantry_squad: 250, truck: 300 }, { personnel: 8000, readiness: 0.75 }),
  dz('artillery', 'brigade', 'Artillery and Missile Command', base('Laghouat', 33.8, 2.88), { smerch: 18, bm21: 48, iskander_e_tel: 4, msta_s: 30, truck: 300 }, { source: 'IISS Military Balance 2025; Iskander-E delivery reported (estimate)' }),
  dz('air_defense', 'division', 'Territorial Air Defence Forces', base('Algiers', 36.73, 3.1), { s300pmu2: 32, buk_m2: 24, pantsir_s1: 38, tor_m2: 12, s125_pechora: 30 }),
  // QJJ: Su-30MKA 58, MiG-29S ~30, Su-24MK ~30, Yak-130 ~30.
  dz('air_wing', 'wing', 'Oum El Bouaghi AB', base('Oum El Bouaghi', 35.88, 7.27), { su30mka: 29 }),
  dz('air_wing', 'wing', 'Ain Beida AB', base('Ain Beida', 35.73, 7.36), { su30mka: 29 }),
  dz('air_wing', 'wing', 'Ain Oussera AB', base('Ain Oussera', 35.52, 2.88), { mig29: 30 }),
  dz('air_wing', 'wing', 'Ouargla AB', base('Ouargla', 31.93, 5.41), { su24: 30 }),
  dz('air_wing', 'wing', 'Oran Tafraoui AB', base('Tafraoui', 35.54, -0.53), { yak130: 30, il76: 3 }),
  dz('air_wing', 'wing', 'Boufarik AB', base('Boufarik', 36.55, 2.88), { mi28n: 42, mi17: 60, mi24: 30 }),
  dz('surface_group', 'fleet', 'Western Façade', base('Mers el-Kébir', 35.73, -0.71), { meko_a200: 2, koni: 3, c28a_corvette: 3, kalaat_beni_abbes_lpd: 1 }),
  dz('surface_group', 'fleet', 'Central and Eastern Façades', base('Algiers', 36.78, 3.07), { tigr_corvette: 2, nanuchka: 3, patrol_craft: 20 }),
  dz('submarine', 'flotilla', 'Submarine Flotilla', base('Mers el-Kébir', 35.73, -0.71), { kilo_636: 4, kilo: 2 }, { extraMagazine: { kalibr_club: 24 } }),
];

// ---------------------------------------------------------------- Morocco
const ma = nation('MAR', SRC, { readiness: 0.65, experience: 0.4 });
export const morocco = [
  ma('maneuver', 'division', 'Southern Zone (Sahara)', base('Laayoune', 27.15, -13.2), { m60a3: 120, t72: 136, m113: 300, ratel: 60, m109a5: 54, infantry_squad: 800, truck: 2000 }, { personnel: 60000, experience: 0.5 }),
  ma('maneuver', 'division', 'Southern Zone Headquarters', base('Agadir', 30.42, -9.6), { m1a1: 80, m113: 100, vt1: 54, m109a5: 18, infantry_squad: 300, truck: 800 }, { personnel: 25000 }),
  ma('maneuver', 'division', 'Northern Zone', base('Rabat', 34.02, -6.84), { m1a1: 142, m60a3: 100, m113: 150, m109a5: 36, infantry_squad: 400, truck: 1000 }, { personnel: 35000 }),
  ma('maneuver', 'division', 'Eastern Zone', base('Oujda', 34.69, -1.91), { m60a1: 40, m113: 100, d30: 36, infantry_squad: 300, truck: 700 }, { personnel: 20000 }),
  ma('maneuver', 'brigade', 'Parachute and Light Security Brigades', base('Salé', 34.05, -6.79), { infantry_squad: 250, truck: 300 }, { personnel: 10000 }),
  ma('artillery', 'brigade', 'Artillery Command', base('Meknes', 33.89, -5.55), { himars: 18, phl03: 18, m109a5: 36, caesar: 36, truck: 200 }),
  ma('air_defense', 'brigade', 'Air Defence', base('Rabat', 34.0, -6.8), { patriot_pac3: 6, barak_mx: 6, fd2000b: 6, chaparral: 30 }),
  ma('air_wing', 'wing', 'Ben Guerir AB', base('Ben Guerir', 32.13, -7.88), { f16c: 23 }),
  ma('air_wing', 'wing', 'Sidi Slimane AB', base('Sidi Slimane', 34.23, -6.05), { mirage_f1: 26, ah64e: 12 }),
  ma('air_wing', 'wing', 'Meknes AB', base('Meknes', 33.88, -5.52), { f5e: 20, alpha_jet: 19 }),
  ma('surface_group', 'fleet', 'Royal Moroccan Navy', base('Ksar Sghir', 35.84, -5.55), { fremm: 1, sigma_frigate: 3, floreal: 2, descubierta_corvette: 1, patrol_craft: 20 }),
];

// ---------------------------------------------------------------- Nigeria
const ng = nation('NGA', SRC, { readiness: 0.45, experience: 0.6 });
const ngDivision = { panhard_aml: 10, otokar_cobra: 20, m101: 12, infantry_squad: 400, technical: 50, truck: 500 };
export const nigeria = [
  ng('maneuver', 'division', '1st Division', base('Kaduna', 10.52, 7.44), ngDivision, { personnel: 18000 }),
  ng('maneuver', 'division', '2nd Division', base('Ibadan', 7.38, 3.94), ngDivision, { personnel: 18000 }),
  ng('maneuver', 'division', '3rd Armoured Division', base('Jos', 9.9, 8.86), { t72: 77, vickers_mk3: 40, vt4: 17, t55: 20, btr3u: 40, m101: 18, infantry_squad: 200, truck: 500 }, { personnel: 15000 }),
  ng('maneuver', 'division', '6th Division', base('Port Harcourt', 4.82, 7.03), ngDivision, { personnel: 18000 }),
  ng('maneuver', 'division', '7th Division (Operation Hadin Kai)', base('Maiduguri', 11.85, 13.16), { ...ngDivision, technical: 150 }, { personnel: 25000, experience: 0.7 }),
  ng('maneuver', 'division', '8th Division', base('Sokoto', 13.06, 5.24), ngDivision, { personnel: 15000 }),
  ng('maneuver', 'division', '81st Division', base('Lagos', 6.45, 3.4), ngDivision, { personnel: 18000 }),
  ng('maneuver', 'division', '82nd Division', base('Enugu', 6.44, 7.5), ngDivision, { personnel: 18000 }),
  ng('maneuver', 'brigade', 'Guards Brigade', base('Abuja', 9.06, 7.49), { otokar_cobra: 30, infantry_squad: 120, truck: 150 }, { personnel: 5000 }),
  ng('air_wing', 'wing', 'Makurdi AB (Tactical Air Command)', base('Makurdi', 7.7, 8.61), { jf17: 3, f7: 7, alpha_jet: 13 }),
  ng('air_wing', 'wing', 'Kainji AB', base('New Bussa', 9.88, 4.49), { a29: 12, k8: 10, mi35: 6, wing_loong2: 4 }),
  ng('surface_group', 'flotilla', 'Western Naval Command', base('Lagos (Apapa)', 6.44, 3.37), { thunder_opv: 3, centenary_opv: 2, patrol_craft: 20 }),
  ng('surface_group', 'flotilla', 'Eastern Naval Command', base('Calabar', 4.95, 8.32), { patrol_craft: 30 }),
];

// ---------------------------------------------------------------- South Africa
const za = nation('ZAF', SRC, { readiness: 0.45, experience: 0.3 });
export const southAfrica = [
  za('maneuver', 'brigade', 'Armour Formation (1 SA Tank Regiment)', base('Bloemfontein (Tempe)', -29.1, 26.18), { olifant2: 34, rooikat: 40, ratel: 60, infantry_squad: 30, truck: 150 }, { personnel: 2500 }),
  za('maneuver', 'brigade', '43 SA Brigade', base('Lohatla', -28.03, 23.03), { ratel: 200, g6_sph: 20, g5: 18, infantry_squad: 150, truck: 300 }, { personnel: 6000 }),
  za('maneuver', 'brigade', '46 SA Brigade', base('Johannesburg', -26.2, 28.05), { ratel: 150, rooikat: 40, infantry_squad: 150, truck: 300 }, { personnel: 6000 }),
  za('maneuver', 'brigade', '44 Parachute Regiment', base('Bloemfontein', -29.12, 26.21), { infantry_squad: 60, truck: 80 }, { personnel: 1500, readiness: 0.6 }),
  za('maneuver', 'division', 'Infantry Formation (Light and Motorised)', base('Pretoria', -25.75, 28.19), { casspir: 300, infantry_squad: 400, truck: 600 }, { personnel: 20000 }),
  za('artillery', 'brigade', 'Artillery Formation', base('Potchefstroom', -26.71, 27.1), { g6_sph: 20, g5: 12, bateleur: 20, truck: 120 }),
  za('air_defense', 'brigade', 'Air Defence Artillery Formation', base('Kimberley', -28.74, 24.77), { starstreak: 20, gdf_35mm: 36 }),
  za('air_wing', 'wing', 'AFB Makhado', base('Makhado', -23.16, 29.7), { gripen_c: 26, hawk_mk120: 24 }),
  za('air_wing', 'wing', 'AFB Bloemspruit and Waterkloof', base('Pretoria (Waterkloof)', -25.83, 28.22), { rooivalk: 11, a109: 20, oryx: 30, c130bz: 2 }),
  za('surface_group', 'flotilla', 'Fleet Command', base("Simon's Town", -34.19, 18.43), { valour: 4, warrior_opv: 3, mmipv: 3 }),
  za('submarine', 'flotilla', 'Submarine Flotilla', base("Simon's Town", -34.19, 18.43), { heroine_209: 3 }, { readiness: 0.3 }),
];

// ---------------------------------------------------------------- Ethiopia
const et = nation('ETH', SRC, { readiness: 0.5, experience: 0.7 });
export const ethiopia = [
  et('maneuver', 'corps', 'Northern Command', base('Mekelle', 13.5, 39.47), { t72: 60, t55: 40, bmp1: 30, d30: 36, infantry_squad: 600, truck: 500 }, { personnel: 25000 }),
  et('maneuver', 'corps', 'Central Command', base('Addis Ababa', 9.02, 38.75), { t72: 100, t55: 40, bmp1: 40, btr60: 40, d30: 36, bm21: 18, infantry_squad: 600, truck: 600 }, { personnel: 30000 }),
  et('maneuver', 'corps', 'Western Command', base('Bahir Dar', 11.59, 37.39), { t72: 40, t55: 30, d30: 18, infantry_squad: 500, truck: 400 }, { personnel: 25000 }),
  et('maneuver', 'corps', 'Eastern Command', base('Harar', 9.31, 42.12), { t72: 50, t55: 40, d30: 18, infantry_squad: 500, truck: 400 }, { personnel: 25000 }),
  et('maneuver', 'corps', 'Southern Command', base('Hawassa', 7.06, 38.48), { infantry_squad: 400, d30: 12, truck: 300 }, { personnel: 18000 }),
  et('maneuver', 'brigade', 'Republican Guard', base('Addis Ababa', 9.0, 38.8), { infantry_squad: 150, truck: 100 }, { personnel: 5000, readiness: 0.7 }),
  et('air_wing', 'wing', 'Bishoftu (Harar Meda) AB', base('Bishoftu', 8.72, 39.0), { su27: 11, su30k: 2, mig23: 6, bayraktar_tb2: 6, wing_loong2: 4, mi35: 10 }),
  et('air_defense', 'brigade', 'Air Defence', base('Addis Ababa', 8.98, 38.8), { pantsir_s1: 4, s125_pechora: 12, s75_dvina: 6 }),
];

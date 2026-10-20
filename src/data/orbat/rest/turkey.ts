// Sources: IISS Military Balance 2025 (Turkey); Turkish General Staff unit lists; SIPRI Arms
// Transfers Database (S-400, Bayraktar). Brigade equipment splits are estimates. The S-400
// regiment is held in reserve at Mürted and is not integrated with NATO air defence.
import { base, nation } from './build';

const u = nation('TUR', 'IISS Military Balance 2025', { readiness: 0.7, experience: 0.6 });

const armouredBrigade = { acv15: 100, t155_firtina: 18, infantry_squad: 40, truck: 400 };
const mechBrigade = { acv15: 140, m113: 40, m52t: 18, infantry_squad: 90, truck: 400 };
const commandoBrigade = { kirpi_mrap: 80, otokar_cobra: 40, t122_sakarya: 6, infantry_squad: 160, truck: 200 };

export const turkey = [
  // ---- 1st Army (Thrace and Istanbul).
  u('maneuver', 'brigade', '1st Armoured Brigade', base('Hadımköy', 41.15, 28.6), { ...armouredBrigade, leopard2a4: 120 }, { personnel: 5000 }),
  u('maneuver', 'brigade', '2nd Armoured Brigade', base('Kartal', 40.9, 29.18), { ...armouredBrigade, leopard2a4: 100 }, { personnel: 5000 }),
  u('maneuver', 'brigade', '3rd Armoured Brigade', base('Çerkezköy', 41.29, 28.0), { ...armouredBrigade, leopard2a4: 96 }, { personnel: 5000 }),
  u('maneuver', 'brigade', '4th Armoured Brigade', base('Keşan', 40.86, 26.63), { ...armouredBrigade, leopard1: 130 }, { personnel: 5000 }),
  u('maneuver', 'brigade', '54th Mechanised Brigade', base('Edirne', 41.68, 26.56), { ...mechBrigade, leopard1: 130 }, { personnel: 5000 }),
  u('maneuver', 'brigade', '65th Mechanised Brigade', base('Lüleburgaz', 41.4, 27.36), { ...mechBrigade, leopard1: 130 }, { personnel: 5000 }),
  u('maneuver', 'brigade', '66th Mechanised Brigade (NRDC-T)', base('Istanbul', 41.08, 28.9), { ...mechBrigade, m60t_sabra: 85 }, { personnel: 5000 }),
  u('maneuver', 'brigade', '8th Mechanised Brigade', base('Tekirdağ', 40.98, 27.51), { ...mechBrigade, m60a3: 100 }, { personnel: 5000 }),
  u('maneuver', 'brigade', '18th Mechanised Brigade', base('Çanakkale', 40.15, 26.41), { ...mechBrigade, m48a5t: 120 }, { personnel: 5000 }),
  // ---- 2nd Army (south-east, Syria and Iraq borders).
  u('maneuver', 'brigade', '20th Armoured Brigade', base('Şanlıurfa', 37.16, 38.8), { ...armouredBrigade, m60t_sabra: 85, m60a3: 60 }, { personnel: 5000, experience: 0.7 }),
  u('maneuver', 'brigade', '5th Armoured Brigade', base('Gaziantep', 37.07, 37.38), { ...armouredBrigade, m60a3: 130 }, { personnel: 5000, experience: 0.7 }),
  u('maneuver', 'brigade', '39th Mechanised Brigade', base('İskenderun', 36.59, 36.17), { ...mechBrigade, m60a3: 100 }, { personnel: 5000, experience: 0.7 }),
  u('maneuver', 'brigade', '70th Mechanised Brigade', base('Mardin', 37.31, 40.74), { ...mechBrigade, m60a3: 100 }, { personnel: 5000, experience: 0.7 }),
  u('maneuver', 'brigade', '172nd Armoured Brigade', base('Silopi', 37.25, 42.47), { ...armouredBrigade, m48a5t: 120 }, { personnel: 5000, experience: 0.7 }),
  u('maneuver', 'brigade', '2nd Commando Brigade', base('Hakkari', 37.57, 43.74), commandoBrigade, { personnel: 5000, experience: 0.8 }),
  u('maneuver', 'brigade', '3rd Commando Brigade', base('Siirt', 37.93, 41.94), commandoBrigade, { personnel: 5000, experience: 0.8 }),
  u('maneuver', 'brigade', '23rd Commando Brigade', base('Şırnak', 37.52, 42.46), commandoBrigade, { personnel: 5000, experience: 0.8 }),
  u('maneuver', 'brigade', 'Syria Task Force (northern Syria garrisons)', base('Kilis', 36.72, 37.12), { ...mechBrigade, m60a3: 90, m48a5t: 60 }, { personnel: 8000, experience: 0.8 }),
  // ---- 3rd Army (east, Caucasus).
  u('maneuver', 'brigade', '1st Mechanised Brigade', base('Doğubayazıt', 39.55, 44.08), { ...mechBrigade, m48a5t: 120 }, { personnel: 5000 }),
  u('maneuver', 'brigade', '14th Mechanised Brigade', base('Kars', 40.6, 43.1), { ...mechBrigade, m48a5t: 120 }, { personnel: 5000 }),
  u('maneuver', 'brigade', '25th Mechanised Brigade', base('Ardahan', 41.11, 42.7), { ...mechBrigade, m48a5t: 120 }, { personnel: 5000 }),
  u('maneuver', 'brigade', '4th Commando Brigade', base('Tunceli', 39.11, 39.55), commandoBrigade, { personnel: 5000, experience: 0.8 }),
  u('maneuver', 'brigade', '9th Commando Brigade', base('Bitlis', 38.4, 42.11), commandoBrigade, { personnel: 5000, experience: 0.8 }),
  u('maneuver', 'brigade', '9th Corps Reserve (M48A5T)', base('Erzurum', 39.9, 41.27), { m48a5t: 240, m113: 100, truck: 200 }, { personnel: 4000, readiness: 0.45 }),
  // ---- Aegean Army and centre.
  u('maneuver', 'brigade', '11th Mechanised Brigade', base('Izmir (Gaziemir)', 38.32, 27.15), { ...mechBrigade, m60a3: 100 }, { personnel: 5000 }),
  u('maneuver', 'brigade', '57th Artillery and Training Brigade', base('Izmir', 38.42, 27.14), { t155_firtina: 36, m110: 24, truck: 200 }, { personnel: 3000 }),
  u('maneuver', 'brigade', 'Amphibious Marine Brigade', base('Foça', 38.67, 26.75), { aav7: 40, infantry_squad: 100, truck: 150 }, { personnel: 4500 }),
  u('maneuver', 'brigade', '1st Commando Brigade', base('Talas, Kayseri', 38.69, 35.55), commandoBrigade, { personnel: 5000, experience: 0.8 }),
  u('maneuver', 'brigade', 'Special Forces Command', base('Ankara (Gölbaşı)', 39.79, 32.8), { infantry_squad: 200, truck: 150 }, { personnel: 6000, readiness: 0.9, experience: 0.85 }),
  u('artillery', 'brigade', 'Rocket and Missile Command', base('Malatya', 38.35, 38.31), { t300_kasirga: 24, bora_tel: 12, j600t_yildirim: 12, t155_firtina: 100, truck: 400 }),
  u('air_defense', 'brigade', 'Army Air Defence', base('Ankara', 39.93, 32.85), { hisar_a: 24, hisar_o: 12, korkut: 40, stinger_team: 60 }),
  u('air_defense', 'battalion', 'S-400 Regiment (reserve)', base('Mürted (Akıncı)', 40.08, 32.57), { s400_launcher: 8 }, { readiness: 0.3 }),
  u('air_wing', 'brigade', 'Army Aviation Command', base('Güvercinlik, Ankara', 39.93, 32.74), { t129_atak: 60, ah1w: 10, s70a: 80, ch47f: 11 }),
  // ---- Air Force: F-16C/D ~245, F-4E 2020 ~30.
  u('air_wing', 'wing', '1st Main Jet Base', base('Eskişehir', 39.78, 30.58), { f16c: 40, f4e_2020: 30 }),
  u('air_wing', 'wing', '4th Main Jet Base', base('Akıncı', 40.08, 32.57), { f16c: 40, akinci_ucav: 12 }),
  u('air_wing', 'wing', '5th Main Jet Base', base('Merzifon', 40.83, 35.52), { f16c: 40 }),
  u('air_wing', 'wing', '6th Main Jet Base', base('Bandırma', 40.32, 27.98), { f16c: 40 }),
  u('air_wing', 'wing', '8th Main Jet Base', base('Diyarbakır', 37.89, 40.2), { f16c: 45, bayraktar_tb2: 40 }),
  u('air_wing', 'wing', '9th Main Jet Base', base('Balıkesir', 39.62, 27.93), { f16c: 40 }),
  u('air_wing', 'wing', '3rd Main Jet Base (AEW, tankers)', base('Konya', 37.98, 32.56), { e7t: 4, kc135r: 7, a400m: 10 }),
  u('air_wing', 'wing', 'Batman UAV Base', base('Batman', 37.93, 41.12), { bayraktar_tb2: 60, akinci_ucav: 12, anka_s: 20 }),
  // ---- Navy.
  u('surface_group', 'fleet', 'Northern Task Group', base('Gölcük', 40.72, 29.81), { barbaros: 4, yavuz: 2, istanbul_frigate: 1, ada_corvette: 2, patrol_craft: 10 }),
  u('surface_group', 'fleet', 'Southern Task Group', base('Aksaz', 36.9, 28.42), { gabya: 7, yavuz: 2, ada_corvette: 2, kilic_fac: 9 }),
  u('surface_group', 'task_group', 'Amphibious Task Group', base('Aksaz', 36.9, 28.42), { tcg_anadolu: 1, bayraktar_lst: 2, mine_hunter: 11 }),
  u('submarine', 'fleet', 'Submarine Fleet', base('Gölcük', 40.72, 29.81), { preveze: 4, gur: 4, atilay: 2, reis_214tn: 1 }),
];

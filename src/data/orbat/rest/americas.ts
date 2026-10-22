// Sources: IISS Military Balance 2025 country sections for Brazil, Argentina and Mexico;
// Brazilian Army and Navy unit lists (Exército Brasileiro, Marinha do Brasil); Argentine
// Ministry of Defence (F-16 deliveries from December 2024); SEDENA military regions.
// Equipment splits between formations are estimates.
import { base, nation } from './build';

const SRC = 'IISS Military Balance 2025';

// ---------------------------------------------------------------- Brazil
const br = nation('BRA', SRC, { readiness: 0.6, experience: 0.2 });
const motorised = { guarani: 40, m101: 18, infantry_squad: 180, truck: 400 };
const jungle = { infantry_squad: 200, m101: 12, truck: 150 };
const cavalry = { cascavel: 40, urutu: 40, guarani: 20, infantry_squad: 60, truck: 250 };
export const brazil = [
  br('maneuver', 'brigade', '6th Armoured Infantry Brigade', base('Santa Maria', -29.68, -53.81), { leopard1a5br: 110, m113: 120, m109a5: 18, infantry_squad: 60, truck: 400 }, { personnel: 5000 }),
  br('maneuver', 'brigade', '5th Armoured Cavalry Brigade', base('Ponta Grossa', -25.09, -50.16), { leopard1a5br: 110, m60a3: 70, m113: 100, m109a5: 18, infantry_squad: 50, truck: 400 }, { personnel: 5000 }),
  br('maneuver', 'brigade', '1st Mechanised Cavalry Brigade', base('Santiago', -29.19, -54.87), cavalry, { personnel: 3500 }),
  br('maneuver', 'brigade', '2nd Mechanised Cavalry Brigade', base('Uruguaiana', -29.75, -57.09), cavalry, { personnel: 3500 }),
  br('maneuver', 'brigade', '3rd Mechanised Cavalry Brigade', base('Bagé', -31.33, -54.1), cavalry, { personnel: 3500 }),
  br('maneuver', 'brigade', '4th Mechanised Cavalry Brigade', base('Dourados', -22.22, -54.81), cavalry, { personnel: 3500 }),
  br('maneuver', 'brigade', '15th Mechanised Infantry Brigade', base('Cascavel', -24.96, -53.46), { guarani: 120, m101: 18, infantry_squad: 120, truck: 300 }, { personnel: 4000 }),
  br('maneuver', 'brigade', '8th Motorised Infantry Brigade', base('Pelotas', -31.77, -52.34), motorised, { personnel: 4000 }),
  br('maneuver', 'brigade', '4th Motorised Infantry Brigade', base('Juiz de Fora', -21.76, -43.35), motorised, { personnel: 4000 }),
  br('maneuver', 'brigade', '9th Motorised Infantry Brigade', base('Rio de Janeiro', -22.88, -43.4), motorised, { personnel: 4000 }),
  br('maneuver', 'brigade', '3rd Motorised Infantry Brigade', base('Cristalina', -16.77, -47.61), motorised, { personnel: 4000 }),
  br('maneuver', 'brigade', '13th Motorised Infantry Brigade', base('Cuiabá', -15.6, -56.1), motorised, { personnel: 4000 }),
  br('maneuver', 'brigade', '7th Motorised Infantry Brigade', base('Natal', -5.79, -35.21), motorised, { personnel: 4000 }),
  br('maneuver', 'brigade', '10th Motorised Infantry Brigade', base('Recife', -8.05, -34.9), motorised, { personnel: 4000 }),
  br('maneuver', 'brigade', '6th Motorised Infantry Brigade', base('Salvador', -12.97, -38.5), motorised, { personnel: 4000 }),
  br('maneuver', 'brigade', '14th Motorised Infantry Brigade', base('São Paulo', -23.55, -46.63), motorised, { personnel: 4000 }),
  br('maneuver', 'brigade', '11th Light Infantry Brigade', base('Campinas', -22.9, -47.06), { infantry_squad: 180, m101: 18, truck: 300 }, { personnel: 4000 }),
  br('maneuver', 'brigade', '12th Light Infantry Brigade (Airmobile)', base('Caçapava', -23.1, -45.7), { infantry_squad: 180, hm1_pantera: 30, truck: 200 }, { personnel: 4000, airborne: true }),
  br('maneuver', 'brigade', 'Parachute Infantry Brigade', base('Rio de Janeiro', -22.86, -43.35), { infantry_squad: 180, truck: 150 }, { personnel: 4500, readiness: 0.8, airborne: true }),
  br('maneuver', 'brigade', 'Special Operations Brigade', base('Goiânia', -16.68, -49.25), { infantry_squad: 80, truck: 60 }, { personnel: 2000, readiness: 0.85 }),
  br('maneuver', 'brigade', '1st Jungle Infantry Brigade', base('Boa Vista', 2.82, -60.67), jungle, { personnel: 3500 }),
  br('maneuver', 'brigade', '2nd Jungle Infantry Brigade', base('São Gabriel da Cachoeira', -0.13, -67.09), jungle, { personnel: 3500 }),
  br('maneuver', 'brigade', '16th Jungle Infantry Brigade', base('Tefé', -3.35, -64.71), jungle, { personnel: 3500 }),
  br('maneuver', 'brigade', '17th Jungle Infantry Brigade', base('Porto Velho', -8.76, -63.9), jungle, { personnel: 3500 }),
  br('maneuver', 'brigade', '23rd Jungle Infantry Brigade', base('Marabá', -5.37, -49.12), jungle, { personnel: 3500 }),
  br('maneuver', 'brigade', '18th Border Brigade', base('Corumbá', -19.01, -57.65), jungle, { personnel: 3000 }),
  br('maneuver', 'division', 'Military Police (state forces, mobilisable reserve)', base('Brasília', -15.79, -47.88), { infantry_squad: 4000, truck: 3000 }, { personnel: 400000, readiness: 0.3, experience: 0.4, source: 'IISS Military Balance 2025 (paramilitary: state military police)' }),
  br('maneuver', 'division', 'Fleet Marine Force', base('Ilha do Governador, Rio', -22.8, -43.2), { aav7: 23, piranha: 30, infantry_squad: 300, m101: 18, truck: 300 }, { personnel: 16000 }),
  br('artillery', 'brigade', 'Missile and Rocket Command (ASTROS)', base('Formosa', -15.54, -47.33), { astros2: 54, truck: 120 }),
  br('air_defense', 'brigade', '1st Anti-Aircraft Artillery Brigade', base('Guarujá', -23.99, -46.26), { flakpanzer_gepard: 34, rbs70: 40 }),
  br('air_wing', 'brigade', 'Army Aviation Command', base('Taubaté', -23.03, -45.55), { hm1_pantera: 34, hm4_jaguar: 16, as550_fennec: 36 }),
  // FAB: Gripen E ~10, F-5EM ~45, A-1M ~25, A-29 ~70.
  br('air_wing', 'wing', 'Anápolis AB (1st GDA)', base('Anápolis', -16.23, -48.96), { gripen_e: 10, e99: 5 }),
  br('air_wing', 'wing', 'Canoas AB (1/14 GAv)', base('Canoas', -29.95, -51.15), { f5em: 15 }),
  br('air_wing', 'wing', 'Santa Cruz AB (1st GAvCa)', base('Santa Cruz, Rio', -22.93, -43.72), { f5em: 15, kc390: 6 }),
  br('air_wing', 'wing', 'Manaus AB', base('Manaus', -3.04, -60.05), { f5em: 15, a29: 20 }),
  br('air_wing', 'wing', 'Santa Maria AB (1/10, 3/10 GAv)', base('Santa Maria', -29.71, -53.69), { a1m_amx: 25 }),
  br('air_wing', 'wing', 'Boa Vista and Porto Velho ABs', base('Porto Velho', -8.71, -63.9), { a29: 30 }),
  br('air_wing', 'wing', 'Campo Grande AB', base('Campo Grande', -20.47, -54.67), { a29: 20, kc390: 10 }),
  br('surface_group', 'fleet', 'Esquadra (Fleet)', base('Niterói (Mocanguê)', -22.88, -43.12), { niteroi: 4, tamandare: 1, barroso_corvette: 1, inhauma_corvette: 1, atlantico: 1, bahia_lpd: 1 }),
  br('surface_group', 'flotilla', 'Northern and Amazon Flotillas', base('Belém', -1.45, -48.5), { patrol_craft: 25, river_patrol: 15 }),
  br('submarine', 'flotilla', 'Submarine Force', base('Itaguaí', -22.92, -43.84), { riachuelo: 3, tupi: 2, tikuna: 1 }),
  br('air_wing', 'wing', 'Naval Aviation', base('São Pedro da Aldeia', -22.81, -42.09), { s70b: 6, super_lynx: 8, af1_skyhawk: 3 }),
];

// ---------------------------------------------------------------- Argentina
const ar = nation('ARG', SRC, { readiness: 0.45, experience: 0.15 });
const mountain = { infantry_squad: 150, oto_melara_mod56: 18, truck: 200 };
export const argentina = [
  ar('maneuver', 'brigade', '1st Armoured Cavalry Brigade', base('Tandil', -37.32, -59.13), { tam: 80, vci_tam: 60, m113: 40, vca_palmaria: 9, infantry_squad: 40, truck: 250 }, { personnel: 3500 }),
  ar('maneuver', 'brigade', '2nd Armoured Cavalry Brigade', base('Paraná', -31.73, -60.53), { tam: 80, vci_tam: 60, m113: 40, vca_palmaria: 9, infantry_squad: 40, truck: 250 }, { personnel: 3500 }),
  ar('maneuver', 'brigade', '10th Mechanised Infantry Brigade', base('La Plata', -34.92, -57.95), { tam: 25, m113: 100, infantry_squad: 100, truck: 250 }, { personnel: 3500 }),
  ar('maneuver', 'brigade', '9th Mechanised Infantry Brigade', base('Comodoro Rivadavia', -45.86, -67.48), { tam: 20, m113: 80, infantry_squad: 100, truck: 250 }, { personnel: 3000 }),
  ar('maneuver', 'brigade', '11th Mechanised Infantry Brigade', base('Río Gallegos', -51.62, -69.22), { tam: 25, m113: 80, infantry_squad: 100, truck: 250 }, { personnel: 3000 }),
  ar('maneuver', 'brigade', '4th Parachute Brigade', base('Córdoba', -31.42, -64.18), { infantry_squad: 120, truck: 150 }, { personnel: 3000, airborne: true }),
  ar('maneuver', 'brigade', '5th Mountain Brigade', base('Salta', -24.79, -65.41), mountain, { personnel: 3000 }),
  ar('maneuver', 'brigade', '6th Mountain Brigade', base('Neuquén', -38.95, -68.06), mountain, { personnel: 3000 }),
  ar('maneuver', 'brigade', '8th Mountain Brigade', base('Mendoza', -32.89, -68.83), mountain, { personnel: 3000 }),
  ar('maneuver', 'brigade', '3rd Jungle Brigade', base('Resistencia', -27.46, -58.98), { infantry_squad: 130, truck: 150 }, { personnel: 2500 }),
  ar('maneuver', 'brigade', '12th Jungle Brigade', base('Posadas', -27.37, -55.9), { infantry_squad: 130, truck: 150 }, { personnel: 2500 }),
  ar('maneuver', 'division', 'Gendarmería Nacional', base('Buenos Aires', -34.6, -58.38), { infantry_squad: 800, truck: 1000 }, { personnel: 40000, readiness: 0.4, source: 'IISS Military Balance 2025 (paramilitary)' }),
  ar('maneuver', 'brigade', 'Naval Infantry Command', base('Baterías, Puerto Belgrano', -38.97, -62.1), { lvtp7: 10, infantry_squad: 100, truck: 100 }, { personnel: 2500 }),
  ar('air_wing', 'wing', 'II Air Brigade (F-16)', base('Río Cuarto', -33.09, -64.26), { f16a: 6 }),
  ar('air_wing', 'wing', 'V Air Brigade (A-4AR)', base('Villa Reynolds', -33.73, -65.38), { a4ar: 6 }),
  ar('air_wing', 'wing', 'IV Air Brigade (Pampa, Pucará)', base('Mendoza', -32.83, -68.79), { ia63_pampa: 12, ia58_pucara: 6, c130h: 4 }),
  ar('surface_group', 'fleet', 'Sea Fleet', base('Puerto Belgrano', -38.89, -62.1), { almirante_brown: 4, espora_corvette: 6, gowind_opv: 4 }),
  ar('submarine', 'flotilla', 'Submarine Force', base('Mar del Plata', -38.03, -57.53), { salta_209: 1, santa_cruz_tr1700: 1 }, { readiness: 0.3 }),
];

// ---------------------------------------------------------------- Mexico
const mx = nation('MEX', SRC, { readiness: 0.55, experience: 0.45 });
const region = { humvee: 80, dn_xi: 20, m101: 12, infantry_squad: 500, truck: 600 };
export const mexico = [
  ...([
    ['I Military Region', 'Mexico City', 19.43, -99.13],
    ['II Military Region', 'Mexicali', 32.62, -115.45],
    ['III Military Region', 'Mazatlán', 23.24, -106.41],
    ['IV Military Region', 'Monterrey', 25.67, -100.31],
    ['V Military Region', 'Guadalajara', 20.67, -103.35],
    ['VI Military Region', 'Veracruz', 19.17, -96.13],
    ['VII Military Region', 'Tuxtla Gutiérrez', 16.75, -93.12],
    ['VIII Military Region', 'Oaxaca', 17.06, -96.73],
    ['IX Military Region', 'Acapulco', 16.85, -99.82],
    ['X Military Region', 'Mérida', 20.97, -89.62],
    ['XI Military Region', 'Torreón', 25.54, -103.41],
    ['XII Military Region', 'Irapuato', 20.68, -101.35],
  ] as const).map(([name, place, lat, lon]) => mx('maneuver', 'division', name, base(place, lat, lon), region, { personnel: 15000 })),
  mx('maneuver', 'brigade', '1st Armoured Brigade', base('Mexico City (Campo Militar 1)', 19.45, -99.22), { erc90_sagaie: 100, dn_xi: 50, humvee: 50, infantry_squad: 60, truck: 200 }, { personnel: 4000 }),
  mx('maneuver', 'brigade', 'Parachute Rifle Brigade', base('Mexico City', 19.4, -99.08), { infantry_squad: 120, truck: 100 }, { personnel: 3000, airborne: true }),
  mx('maneuver', 'division', 'Guardia Nacional', base('Mexico City', 19.42, -99.15), { humvee: 400, infantry_squad: 3000, truck: 2500 }, { personnel: 130000, readiness: 0.45 }),
  mx('maneuver', 'division', 'Naval Infantry', base('Veracruz', 19.2, -96.13), { infantry_squad: 600, truck: 400 }, { personnel: 21000 }),
  mx('air_wing', 'wing', 'Santa Lucía AB', base('Santa Lucía', 19.75, -99.01), { f5e: 4, pc7: 30, c130h: 4, uh60m: 40, mi17: 20 }),
  mx('surface_group', 'flotilla', 'Gulf and Caribbean Naval Force', base('Veracruz', 19.2, -96.13), { reformador: 1, oaxaca_opv: 4, holzinger_opv: 4, patrol_craft: 20 }),
  mx('surface_group', 'flotilla', 'Pacific Naval Force', base('Manzanillo', 19.05, -104.32), { durango_opv: 4, oaxaca_opv: 4, patrol_craft: 20 }),
];

// ---------------------------------------------------------------- Venezuela
// IISS Military Balance 2025 (Venezuela): about 123,000 active (army 63,000, navy 25,500, air force
// 11,500, National Guard 23,000) and some 220,000 in the Bolivarian Militia. 81 AMX-30V and 92 T-72B1,
// 123 BMP-3, 114 BTR-80A, 48 2S19, Smerch and BM-21; S-300VM, Buk-M2E and Pechora-2M; Su-30MK2 (21 left
// after losses), F-16A/B (a handful flying) and K-8W. The Mariscal Sucre frigate and the Type 209
// submarine are left out: the catalog has neither class. Division names follow the army's
// regional commands; equipment splits are estimates.
const ve = nation('VEN', SRC, { readiness: 0.5, experience: 0.2 });
const jungleVe = { infantry_squad: 250, msta_s: 12, truck: 300 };
export const venezuela = [
  ve('maneuver', 'brigade', '41st Armoured Brigade', base('Valencia', 10.16, -68.0), { t72: 92, bmp3: 60, msta_s: 12, infantry_squad: 60, truck: 300 }, { personnel: 4500 }),
  ve('maneuver', 'brigade', '11th Armoured Brigade', base('Maracaibo', 10.65, -71.64), { amx30: 81, btr80: 60, infantry_squad: 60, truck: 300 }, { personnel: 4000 }),
  ve('maneuver', 'brigade', '42nd Parachute Infantry Brigade', base('Maracay', 10.25, -67.6), { infantry_squad: 150, truck: 100 }, { personnel: 3000, readiness: 0.7 }),
  ve('maneuver', 'division', '2nd Infantry Division', base('San Cristóbal', 7.77, -72.22), { infantry_squad: 300, bmp3: 30, btr80: 30, truck: 400 }, { personnel: 9000 }),
  ve('maneuver', 'division', '3rd Infantry Division', base('Caracas', 10.48, -66.9), { infantry_squad: 300, bmp3: 33, btr80: 24, truck: 400 }, { personnel: 9000 }),
  ve('maneuver', 'division', '5th Jungle Infantry Division', base('Ciudad Guayana', 8.3, -62.7), jungleVe, { personnel: 8000 }),
  ve('maneuver', 'division', '6th Jungle Infantry Division', base('Ciudad Bolívar', 8.12, -63.55), jungleVe, { personnel: 8000 }),
  ve('maneuver', 'division', '9th Motorised Cavalry Division', base('San Fernando de Apure', 7.89, -67.47), { infantry_squad: 200, msta_s: 12, truck: 300 }, { personnel: 6000 }),
  ve('artillery', 'brigade', 'Rocket Artillery Group', base('Valencia', 10.18, -67.95), { smerch: 12, bm21: 24, truck: 80 }),
  ve('maneuver', 'division', 'Naval Infantry', base('Puerto Cabello', 10.47, -68.01), { infantry_squad: 200, truck: 150 }, { personnel: 7000 }),
  ve('maneuver', 'division', 'National Guard', base('Caracas', 10.5, -66.92), { infantry_squad: 800, truck: 500 }, { personnel: 23000, readiness: 0.45 }),
  ve('maneuver', 'division', 'Bolivarian Militia', base('Caracas', 10.46, -66.85), { militia_squad: 2000, truck: 300 }, { personnel: 100000, readiness: 0.3, experience: 0.05, territorial: true }),
  ve('air_defense', 'brigade', 'Aerospace Defence Command', base('Caracas', 10.5, -66.95), { s300vm_launcher: 12, buk_m2: 12, s125_pechora: 24 }),
  ve('air_wing', 'wing', 'El Libertador AB', base('Maracay', 10.25, -67.65), { su30mk2: 11, mi17: 20, mi35: 8, c130h: 3 }),
  ve('air_wing', 'wing', 'Gen. José Antonio Anzoátegui AB', base('Barcelona', 10.11, -64.69), { su30mk2: 10, k8: 8 }),
  ve('air_wing', 'wing', 'Teniente Vicente Landaeta Gil AB', base('Barquisimeto', 10.07, -69.32), { f16a: 6, k8: 9 }),
  ve('surface_group', 'flotilla', 'Venezuelan Navy', base('Puerto Cabello', 10.48, -68.01), { patrol_craft: 12 }),
];

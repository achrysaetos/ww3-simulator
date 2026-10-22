/*
 * Italy, 2025-26.
 * Sources: IISS Military Balance 2025 (~200 C1 Ariete, ~125 being upgraded; Typhoon ~94,
 * F-35A/B, Tornado IDS, AV-8B+; Cavour, Trieste; 2 Horizon, Durand de la Penne, 10 FREMM,
 * Thaon di Revel PPA; 4 Todaro + 4 Sauro SSK); esercito.difesa.it, aeronautica.difesa.it and
 * marina.difesa.it unit pages. Ariete float and training holdings are an estimate. Garibaldi
 * was decommissioned in 2024 and is excluded.
 */
import { add, base, forNation } from './build';

const u = forNation('ITA', 'IISS Military Balance 2025; Italian MoD unit pages');

const ACTIVE = { readiness: 0.65 };
const TANK_REGT = { ariete: 50 };
const MECH_REGT = { dardo: 40, infantry_squad: 27 };
const WHEELED_REGT = { freccia: 50, infantry_squad: 27 };
const LIGHT_REGT = { vamtac: 50, infantry_squad: 27 };
const taranto = base('Stazione navale Mar Grande, Taranto', 40.47, 17.23);
const laSpezia = base('Base navale della Spezia', 44.1, 9.83);

export const ita = [
  // Divisione "Vittorio Veneto"
  u('Brigata corazzata "Ariete"', 'maneuver', 'brigade', base('Pordenone', 45.96, 12.66), add(TANK_REGT, TANK_REGT, MECH_REGT, { centauro: 30, pzh2000: 18, truck: 400 }), { ...ACTIVE, personnel: 4500 }),
  u('Brigata di cavalleria "Pozzuolo del Friuli"', 'maneuver', 'brigade', base('Gorizia', 45.94, 13.62), add(LIGHT_REGT, { centauro: 40, aav7: 30, truck: 250 }), { ...ACTIVE, personnel: 4000 }),
  u('Brigata paracadutisti "Folgore"', 'maneuver', 'brigade', base('Livorno', 43.55, 10.31), add(LIGHT_REGT, LIGHT_REGT, LIGHT_REGT, { truck: 200 }), { readiness: 0.8, personnel: 4500, airborne: true }),
  u('Brigata aeromobile "Friuli"', 'air_wing', 'brigade', base('Bologna', 44.49, 11.34), { a129: 40, nh90: 40, ch47f: 16 }, { ...ACTIVE, personnel: 3000 }),

  // Divisione "Acqui"
  u('Brigata bersaglieri "Garibaldi"', 'maneuver', 'brigade', base('Caserta', 41.07, 14.33), add(TANK_REGT, MECH_REGT, MECH_REGT, { centauro: 20, pzh2000: 18, truck: 400 }), { ...ACTIVE, personnel: 4500 }),
  u('Brigata meccanizzata "Pinerolo"', 'maneuver', 'brigade', base('Bari', 41.12, 16.87), add(WHEELED_REGT, WHEELED_REGT, WHEELED_REGT, { centauro: 20, fh70: 18, truck: 350 }), { ...ACTIVE, personnel: 4500 }),
  u('Brigata meccanizzata "Aosta"', 'maneuver', 'brigade', base('Messina', 38.19, 15.55), add(WHEELED_REGT, WHEELED_REGT, { centauro: 20, fh70: 18, truck: 300 }), { ...ACTIVE, personnel: 4000 }),
  u('Brigata meccanizzata "Sassari"', 'maneuver', 'brigade', base('Sassari', 40.73, 8.56), add(WHEELED_REGT, WHEELED_REGT, { centauro: 20, truck: 250 }), { ...ACTIVE, personnel: 3500 }),
  u('Brigata meccanizzata "Granatieri di Sardegna"', 'maneuver', 'brigade', base('Roma', 41.9, 12.5), add(WHEELED_REGT, WHEELED_REGT, { truck: 200 }), { ...ACTIVE, personnel: 3000 }),

  // Alpini
  u('Brigata alpina "Julia"', 'maneuver', 'brigade', base('Udine', 46.06, 13.24), add(LIGHT_REGT, LIGHT_REGT, LIGHT_REGT, { fh70: 18, truck: 250 }), { ...ACTIVE, personnel: 4500 }),
  u('Brigata alpina "Taurinense"', 'maneuver', 'brigade', base('Torino', 45.07, 7.69), add(LIGHT_REGT, LIGHT_REGT, LIGHT_REGT, { fh70: 18, truck: 250 }), { ...ACTIVE, personnel: 4500 }),

  // Supports
  u('Comando Artiglieria (5° Rgt "Superga" MLRS, 52° Rgt)', 'artillery', 'brigade', base('Bracciano', 42.1, 12.18), { m270a2: 14, pzh2000: 24 }, { ...ACTIVE, personnel: 2000, extraMagazine: { gmlrs: 168 } }),
  u('Comando Artiglieria Controaerei (SAMP/T)', 'air_defense', 'brigade', base('Sabaudia', 41.3, 13.03), { samp_t: 24, truck: 80 }, { ...ACTIVE, personnel: 1500 }),
  u('Ariete float and Scuola di Cavalleria', 'maneuver', 'battalion', base('Lecce', 40.35, 18.17), { ariete: 50 }, { readiness: 0.2, personnel: 500 }),
  u('Italian contingent, NATO Multinational Battle Group Bulgaria', 'maneuver', 'battalion', base('Novo Selo, Bulgaria', 42.42, 26.56), { freccia: 20, centauro: 10, infantry_squad: 9 }, { readiness: 0.85, personnel: 750 }),
  u('Italian contingent, Multinational Brigade Latvia', 'maneuver', 'battalion', base('Ādaži, Latvia', 57.08, 24.32), { dardo: 14, infantry_squad: 6 }, { readiness: 0.85, personnel: 250 }),

  // Aeronautica Militare
  u('4° Stormo', 'air_wing', 'wing', base('Grosseto', 42.76, 11.07), { typhoon: 28 }, ACTIVE),
  u('36° Stormo', 'air_wing', 'wing', base('Gioia del Colle', 40.77, 16.93), { typhoon: 28 }, ACTIVE),
  u('37° Stormo', 'air_wing', 'wing', base('Trapani-Birgi, Sicily', 37.91, 12.49), { typhoon: 18 }, ACTIVE),
  u('51° Stormo', 'air_wing', 'wing', base('Istrana', 45.68, 12.08), { typhoon: 18 }, ACTIVE),
  u('32° Stormo', 'air_wing', 'wing', base('Amendola', 41.54, 15.72), { f35a: 24, f35b: 6, mq9a: 6 }, ACTIVE),
  u('6° Stormo (NATO nuclear sharing)', 'air_wing', 'wing', base('Ghedi', 45.43, 10.27), { tornado_ids: 30, f35a: 8 }, ACTIVE),
  u('50° Stormo', 'air_wing', 'wing', base('Piacenza', 44.91, 9.72), { tornado_ecr: 10 }, { readiness: 0.4 }),
  u('14° Stormo', 'logistics', 'wing', base('Pratica di Mare', 41.66, 12.45), { kc767: 4 }, ACTIVE),
  u('46ª Brigata Aerea', 'logistics', 'wing', base('Pisa', 43.68, 10.39), { c130j: 15 }, ACTIVE),

  // Marina Militare
  u('Gruppo Aerei Imbarcati', 'air_wing', 'wing', base('Grottaglie', 40.52, 17.4), { av8b: 12, f35b: 8 }, ACTIVE),
  u('Gruppo portaerei (Cavour)', 'surface_group', 'task_group', taranto, { cv_cavour: 1, ddg_horizon: 1, ffg_fremm: 2, merlin: 8 }, { readiness: 0.7, personnel: 1800 }),
  u('1ª Divisione Navale', 'surface_group', 'flotilla', laSpezia, { ddg_horizon: 1, ffg_fremm: 4, ffg_thaon_di_revel: 2 }, { readiness: 0.65, personnel: 1500 }),
  u('2ª Divisione Navale', 'surface_group', 'flotilla', taranto, { ddg_durand_de_la_penne: 1, ffg_fremm: 4, ffg_thaon_di_revel: 2 }, { readiness: 0.65, personnel: 1400 }),
  u('3ª Divisione Navale (amphibious)', 'surface_group', 'task_group', base('Brindisi', 40.64, 17.94), { lha_trieste: 1 }, { readiness: 0.6, personnel: 1000 }),
  u('Comando Sommergibili', 'submarine', 'flotilla', taranto, { ssk_todaro: 4, ssk_sauro: 4 }, { readiness: 0.6, personnel: 8 * 50 }),
];

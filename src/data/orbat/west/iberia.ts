/*
 * Spain and Portugal, 2025-26.
 * Sources: IISS Military Balance 2025 (Spain: 219 Leopard 2E + ~88 Leopard 2A4 after transfers
 * to Ukraine; Typhoon ~70, EF-18M ~75, AV-8B+ 12; 5 F-100, 4 Santa María; Juan Carlos I;
 * 2 S-80 + 1 Agosta. Portugal: 34 Leopard 2A6; F-16AM/BM ~28; 2 Bartolomeu Dias + 2 Vasco
 * da Gama; 2 Tridente); ejercito.defensa.gob.es, ejercitodelaire.defensa.gob.es, armada.
 * defensa.gob.es; emgfa.pt. Storage/training Leopard 2E counts are an estimate.
 */
import { add, base, forNation } from './build';

const es = forNation('ESP', 'IISS Military Balance 2025; Spanish MoD unit pages');
const pt = forNation('PRT', 'IISS Military Balance 2025; EMGFA unit pages');

const ACTIVE = { readiness: 0.6 };
const ES_HEAVY = { leopard2e: 65, pizarro: 80, m109a5: 18, infantry_squad: 36, truck: 350 };
const ES_MEDIUM = { piranha5: 60, vamtac: 80, centauro: 20, l118: 18, infantry_squad: 54, truck: 300 };
const rota = base('Base Naval de Rota', 36.62, -6.33);

export const iberia = [
  // Spain: División "San Marcial" and División "Castillejos"
  es('Brigada "Guadarrama" XII', 'maneuver', 'brigade', base('El Goloso, Madrid', 40.56, -3.7), ES_HEAVY, { ...ACTIVE, personnel: 4000 }),
  es('Brigada "Guzmán el Bueno" X', 'maneuver', 'brigade', base('Cerro Muriano, Córdoba', 37.99, -4.77), ES_HEAVY, { ...ACTIVE, personnel: 4000 }),
  es('Brigada "Aragón" I', 'maneuver', 'brigade', base('Zaragoza', 41.65, -0.88), add(ES_MEDIUM, { leopard2a4: 30 }), { ...ACTIVE, personnel: 3800 }),
  es('Brigada "Extremadura" XI', 'maneuver', 'brigade', base('Badajoz', 38.88, -6.97), ES_MEDIUM, { ...ACTIVE, personnel: 3500 }),
  es('Brigada "Galicia" VII', 'maneuver', 'brigade', base('Pontevedra', 42.43, -8.64), ES_MEDIUM, { ...ACTIVE, personnel: 3500 }),
  es('Brigada "Rey Alfonso XIII" II de la Legión', 'maneuver', 'brigade', base('Viator, Almería', 36.89, -2.43), ES_MEDIUM, { readiness: 0.7, personnel: 3500 }),
  es('Brigada "Almogávares" VI de Paracaidistas', 'maneuver', 'brigade', base('Paracuellos de Jarama', 40.5, -3.53), { infantry_squad: 72, vamtac: 80, l118: 12, truck: 200 }, { readiness: 0.75, personnel: 3500 }),
  es('Comandancia General de Ceuta', 'maneuver', 'brigade', base('Ceuta', 35.89, -5.31), { leopard2a4: 16, pizarro: 20, infantry_squad: 30 }, { readiness: 0.7, personnel: 3000 }),
  es('Comandancia General de Melilla', 'maneuver', 'brigade', base('Melilla', 35.29, -2.94), { leopard2a4: 16, pizarro: 20, infantry_squad: 30 }, { readiness: 0.7, personnel: 3000 }),
  es('Mando de Canarias', 'maneuver', 'brigade', base('Las Palmas de Gran Canaria', 28.1, -15.41), { infantry_squad: 54, vamtac: 60 }, { readiness: 0.6, personnel: 4000 }),
  es('Leopard 2E training and reserve holdings', 'maneuver', 'battalion', base('Academia de Caballería, Valladolid', 41.65, -4.72), { leopard2e: 74, leopard2a4: 26 }, { readiness: 0.2, personnel: 300 }),
  es('Spanish contingent, Multinational Brigade Latvia', 'maneuver', 'battalion', base('Ādaži, Latvia', 57.08, 24.32), { leopard2e: 15, pizarro: 15, nasams: 3, infantry_squad: 9 }, { readiness: 0.85, personnel: 600 }),
  es('Spanish Patriot battery (NATO Active Fence, Türkiye)', 'air_defense', 'battalion', base('Incirlik AB, Türkiye', 37.0, 35.43), { patriot_pac3: 6 }, { readiness: 0.85, personnel: 150 }),
  es('Mando de Artillería Antiaérea', 'air_defense', 'brigade', base('Madrid', 40.42, -3.7), { patriot_pac3: 12, nasams: 12 }, { ...ACTIVE, personnel: 2000 }),
  es('Fuerzas Aeromóviles del Ejército de Tierra', 'air_wing', 'brigade', base('Colmenar Viejo', 40.66, -3.77), { tiger: 18, nh90: 30, ch47f: 17 }, { ...ACTIVE, personnel: 2500 }),

  es('Ala 11', 'air_wing', 'wing', base('Base Aérea de Morón', 37.17, -5.62), { typhoon: 35 }, ACTIVE),
  es('Ala 14', 'air_wing', 'wing', base('Base Aérea de Los Llanos, Albacete', 38.95, -1.86), { typhoon: 25 }, ACTIVE),
  es('Ala 12', 'air_wing', 'wing', base('Base Aérea de Torrejón', 40.5, -3.45), { ef18m: 30 }, ACTIVE),
  es('Ala 15', 'air_wing', 'wing', base('Base Aérea de Zaragoza', 41.67, -1.04), { ef18m: 30 }, ACTIVE),
  es('Ala 46', 'air_wing', 'wing', base('Gando AB, Gran Canaria', 27.93, -15.39), { ef18m: 15 }, ACTIVE),
  es('Ala 31', 'logistics', 'wing', base('Base Aérea de Zaragoza', 41.67, -1.04), { a400m: 13, a330_mrtt: 3 }, ACTIVE),
  es('Flotilla de Aeronaves (9ª Escuadrilla)', 'air_wing', 'squadron', base('Rota air station', 36.64, -6.35), { av8b: 12 }, ACTIVE),

  es('Grupo de Acción Naval 1', 'surface_group', 'task_group', rota, { lhd_juan_carlos: 1, lpd_rotterdam: 2, ffg_santa_maria: 4 }, { readiness: 0.6, personnel: 2500 }),
  es('Grupo de Acción Naval 2', 'surface_group', 'flotilla', base('Arsenal de Ferrol', 43.48, -8.24), { ffg_f100: 5 }, { readiness: 0.65, personnel: 5 * 220 }),
  es('Flotilla de Submarinos', 'submarine', 'flotilla', base('Arsenal de Cartagena', 37.6, -0.98), { ssk_s80: 2, ssk_agosta: 1 }, { readiness: 0.55, personnel: 3 * 40 }),

  // Portugal
  pt('Brigada Mecanizada', 'maneuver', 'brigade', base('Santa Margarida', 39.42, -8.31), { leopard2a6: 34, m113: 100, m109a5: 18, infantry_squad: 36, truck: 200 }, { readiness: 0.6, personnel: 3000 }),
  pt('Brigada de Intervenção', 'maneuver', 'brigade', base('Coimbra', 40.21, -8.43), { pandur2: 100, infantry_squad: 54, truck: 150 }, { readiness: 0.6, personnel: 3000 }),
  pt('Brigada de Reação Rápida', 'maneuver', 'brigade', base('Tancos', 39.47, -8.35), { infantry_squad: 54, truck: 100 }, { readiness: 0.7, personnel: 2500 }),
  pt('Portuguese contingent, NATO Forward Land Forces Romania', 'maneuver', 'battalion', base('Cincu, Romania', 45.92, 24.8), { pandur2: 12, infantry_squad: 9 }, { readiness: 0.8, personnel: 200 }),
  pt('Base Aérea n.º 5', 'air_wing', 'wing', base('Monte Real', 39.83, -8.89), { f16am: 28 }, ACTIVE),
  pt('Esquadrilha de Escoltas Oceânicos', 'surface_group', 'flotilla', base('Base Naval de Lisboa, Alfeite', 38.67, -9.15), { ffg_bartolomeu_dias: 2, ffg_vasco_da_gama: 2 }, { readiness: 0.5, personnel: 4 * 180 }),
  pt('Esquadrilha de Submarinos', 'submarine', 'flotilla', base('Base Naval de Lisboa, Alfeite', 38.67, -9.15), { ssk_tridente: 2 }, { readiness: 0.6, personnel: 2 * 33 }),
];

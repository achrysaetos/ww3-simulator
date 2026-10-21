/*
 * France, 2025-26.
 * Sources: IISS Military Balance 2025 (~200 Leclerc in four regiments; Rafale B/C/M,
 * Mirage 2000D RMV and 2000-5F; 1 CVN, 2 Horizon, 8 FREMM, La Fayette, FDI, 6 Floréal;
 * 4 SSBN, 5 SSN); Loi de programmation militaire 2024-2030; defense.gouv.fr unit pages;
 * FAS Nuclear Notebook "French nuclear weapons, 2025" (~290 warheads; ~50 ASMP-A/ASN4G-era
 * air-launched weapons for the Forces aériennes stratégiques and the carrier's FANu;
 * one SSBN always at sea, sometimes two). CAESAR holdings after transfers to Ukraine.
 */
import { add, base, forNation } from './build';

const u = forNation('FRA', 'IISS Military Balance 2025; LPM 2024-2030; FAS Nuclear Notebook 2025');

const toulon = base('Base navale de Toulon', 43.12, 5.93);
const brest = base('Base navale de Brest', 48.38, -4.49);
const ileLongue = base("Base opérationnelle de l'Île Longue", 48.3, -4.52);

const ACTIVE = { readiness: 0.75 };
const MECH_INF_REGT = { vbci: 70, infantry_squad: 27 };
const MOTOR_INF_REGT = { griffon: 60, infantry_squad: 27 };
const CAV_REGT = { jaguar_erbc: 24, vbl: 20 };

export const fra = [
  // 1re Division
  u('7e Brigade blindée', 'maneuver', 'brigade', base('Besançon', 47.24, 6.02), add({ leclerc: 100, caesar: 16, truck: 400 }, MECH_INF_REGT, MECH_INF_REGT), { ...ACTIVE, personnel: 7000 }),
  u('9e Brigade d’infanterie de marine', 'maneuver', 'brigade', base('Poitiers', 46.58, 0.34), add(MOTOR_INF_REGT, MOTOR_INF_REGT, CAV_REGT, { caesar: 8, truck: 300 }), { ...ACTIVE, personnel: 6500 }),
  u('27e Brigade d’infanterie de montagne', 'maneuver', 'brigade', base('Varces-Allières-et-Risset', 45.09, 5.68), add(MOTOR_INF_REGT, MOTOR_INF_REGT, CAV_REGT, { caesar: 8, truck: 300 }), { ...ACTIVE, personnel: 6000 }),
  u('Brigade franco-allemande (French element)', 'maneuver', 'brigade', base('Müllheim', 47.81, 7.63), add(MOTOR_INF_REGT, CAV_REGT), { ...ACTIVE, personnel: 2500 }),

  // 3e Division
  u('2e Brigade blindée', 'maneuver', 'brigade', base('Illkirch-Graffenstaden', 48.53, 7.71), add({ leclerc: 100, caesar: 16, truck: 400 }, MECH_INF_REGT, MECH_INF_REGT), { ...ACTIVE, personnel: 7000 }),
  u('6e Brigade légère blindée', 'maneuver', 'brigade', base('Nîmes', 43.84, 4.36), add(MOTOR_INF_REGT, MOTOR_INF_REGT, CAV_REGT, CAV_REGT, { caesar: 8, truck: 300 }), { ...ACTIVE, personnel: 6500 }),
  u('11e Brigade parachutiste', 'maneuver', 'brigade', base('Toulouse-Balma', 43.61, 1.49), { infantry_squad: 90, vbl: 40, caesar: 8, truck: 250 }, { readiness: 0.85, personnel: 7500 }),
  u('1er Régiment d’artillerie (LRU)', 'artillery', 'battalion', base('Bourogne', 47.56, 6.92), { lru: 9, truck: 60 }, { ...ACTIVE, personnel: 900, extraMagazine: { gmlrs: 108 } }),
  u('4e Brigade d’aérocombat', 'air_wing', 'brigade', base('Clermont-Ferrand', 45.78, 3.08), { tiger: 67, nh90: 60 }, { ...ACTIVE, personnel: 4500 }),
  u('Mission Aigle (NATO Forward Land Forces Romania)', 'maneuver', 'battalion', base('Cincu, Romania', 45.92, 24.8), add(MECH_INF_REGT, { caesar: 4 }), { readiness: 0.85, personnel: 1000 }),
  u('Forces françaises stationnées à Djibouti', 'maneuver', 'battalion', base('Djibouti, Djibouti', 11.55, 43.15), { infantry_squad: 15, vbl: 12, mirage2000_5: 4 }, { readiness: 0.85, personnel: 1500 }),

  // Armée de l'Air et de l'Espace
  u('Forces aériennes stratégiques (EC 1/4 Gascogne, EC 2/4 La Fayette)', 'strategic', 'wing', base('BA 113 Saint-Dizier', 48.64, 4.9), { rafale_b: 40 }, { readiness: 0.9, extraMagazine: { asmp_a: 40 } }),
  u('Escadron de transformation Rafale 3/4 Aquitaine', 'air_wing', 'squadron', base('BA 113 Saint-Dizier', 48.64, 4.9), { rafale_b: 16 }, { readiness: 0.6 }),
  u('30e Escadre de chasse (EC 2/30 Normandie-Niémen, EC 3/30 Lorraine)', 'air_wing', 'wing', base('BA 118 Mont-de-Marsan', 43.91, -0.5), { rafale_c: 40 }, ACTIVE),
  u('3e Escadre de chasse (Mirage 2000D RMV)', 'air_wing', 'wing', base('BA 133 Nancy-Ochey', 48.58, 5.95), { mirage2000d: 48 }, ACTIVE),
  u('Escadron de chasse 1/2 Cigognes', 'air_wing', 'squadron', base('BA 116 Luxeuil-Saint-Sauveur', 47.78, 6.36), { mirage2000_5: 18 }, ACTIVE),
  u('Base aérienne 104 Al Dhafra', 'air_wing', 'squadron', base('Al Dhafra AB, UAE', 24.25, 54.55), { rafale_c: 6 }, { readiness: 0.85 }),
  u('Centre d’expertise aérienne militaire', 'air_wing', 'squadron', base('BA 118 Mont-de-Marsan', 43.91, -0.5), { rafale_c: 6 }, { readiness: 0.5 }),
  u('Groupement aérien de ravitaillement et de transport stratégique (Phénix)', 'logistics', 'wing', base('BA 125 Istres', 43.52, 4.92), { a330_mrtt: 15 }, ACTIVE),
  u('Escadre aérienne de commandement et de conduite 36 (E-3F)', 'air_wing', 'squadron', base('BA 702 Avord', 47.05, 2.63), { e3f: 4 }, ACTIVE),
  u('Brigade aérienne d’appui et de projection (A400M, C-130J)', 'logistics', 'wing', base('BA 123 Orléans-Bricy', 47.99, 1.76), { a400m: 25, c130j: 4 }, ACTIVE),
  u('Brigade aérienne du contrôle de l’espace aérien (SAMP/T)', 'air_defense', 'brigade', base('BA 702 Avord', 47.05, 2.63), { samp_t: 32, truck: 100 }, { ...ACTIVE, personnel: 2000 }),

  // Marine nationale
  u('Groupe aéronaval (Charles de Gaulle)', 'surface_group', 'task_group', toulon, { cvn_charles_de_gaulle: 1, ddg_horizon: 1, ffg_fremm: 2, rafale_m: 30, e2c: 3, nh90: 4 }, { readiness: 0.8, personnel: 3300, extraMagazine: { asmp_a: 10 } }),
  u('Flottilles de chasse embarquée (shore-based Rafale M)', 'air_wing', 'wing', base('BAN Landivisiau', 48.53, -4.15), { rafale_m: 11 }, { readiness: 0.6 }),
  u('Force d’action navale, Toulon', 'surface_group', 'flotilla', toulon, { ddg_horizon: 1, ffg_fremm: 4, ffg_la_fayette: 3, lhd_mistral: 3 }, { readiness: 0.7, personnel: 3500 }),
  u('Force d’action navale, Brest', 'surface_group', 'flotilla', brest, { ffg_fremm: 2, ffg_la_fayette: 1, ffg_fdi: 1 }, { readiness: 0.7, personnel: 1000 }),
  u('Frégates de surveillance outre-mer (Floréal class)', 'surface_group', 'flotilla', base('Fort-de-France, Martinique', 14.6, -61.07), { ffg_floreal: 6 }, { readiness: 0.7, personnel: 6 * 90 }),
  u('Flottille 23F/21F (Atlantique 2)', 'air_wing', 'wing', base('BAN Lann-Bihoué', 47.76, -3.44), { atlantique2: 18 }, ACTIVE),
  // France moves heavy equipment overseas on chartered RO-RO ships under standing strategic-freight contracts.
  u('Affrètement stratégique (chartered RO-RO)', 'surface_group', 'task_group', toulon, { military_roro: 2 }, { readiness: 0.6, personnel: 2 * 20 }),
  u('Escadrille des sous-marins nucléaires d’attaque', 'submarine', 'flotilla', toulon, { ssn_suffren: 3, ssn_rubis: 2 }, { readiness: 0.7, personnel: 5 * 65 }),
  u('Force océanique stratégique, SSBN on deterrent patrol', 'strategic', 'flotilla', base('North-east Atlantic patrol area', 47, -15), { ssbn_triomphant: 1 }, { readiness: 1, personnel: 111 }),
  u('Force océanique stratégique, SSBNs at Île Longue', 'strategic', 'flotilla', ileLongue, { ssbn_triomphant: 3 }, { readiness: 0.4, personnel: 3 * 111 }),
];

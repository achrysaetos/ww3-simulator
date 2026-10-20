/*
 * Germany, 2025-26.
 * Sources: IISS Military Balance 2025 (~310 Leopard 2A6/2A7V/2A7A1; ~350 Puma; Typhoon ~138;
 * Tornado ~85 incl. ECR; F123/F124/F125 frigates; 10 K130; 6 Type 212A); bundeswehr.de unit
 * pages; Panzerbrigade 45 build-up plan (activated in Lithuania April 2025, full strength
 * 2027: PzBtl 203 and PzGrenBtl 122 relocating). Patriot fire units after transfers to Ukraine
 * are an estimate (nine fire units). Tank battalions are 44 Leopard 2 each.
 */
import { add, base, forNation } from './build';

const u = forNation('DEU', 'IISS Military Balance 2025; bundeswehr.de unit pages');

const ACTIVE = { readiness: 0.65 };
const TANK_BN = { leopard2a7: 44 };
const PUMA_BN = { puma_ifv: 44, infantry_squad: 27 };
const MARDER_BN = { marder: 44, infantry_squad: 27 };
const ARTY_BN = { pzh2000: 18, mars2: 6 };

export const deu = [
  // 10. Panzerdivision
  u('Panzerbrigade 12', 'maneuver', 'brigade', base('Cham', 49.22, 12.66), add(TANK_BN, PUMA_BN, MARDER_BN, ARTY_BN, { fennek: 24, truck: 400 }), { ...ACTIVE, personnel: 5000 }),
  u('Panzergrenadierbrigade 37', 'maneuver', 'brigade', base('Frankenberg (Sachsen)', 50.91, 13.04), add(TANK_BN, PUMA_BN, PUMA_BN, { fennek: 24, truck: 400 }), { ...ACTIVE, personnel: 5000 }),
  u('Gebirgsjägerbrigade 23', 'maneuver', 'brigade', base('Bad Reichenhall', 47.73, 12.88), { infantry_squad: 81, boxer: 40, pzh2000: 6, truck: 300 }, { ...ACTIVE, personnel: 4500 }),
  u('Deutsch-Französische Brigade (German element)', 'maneuver', 'brigade', base('Müllheim', 47.81, 7.63), { infantry_squad: 27, boxer: 30, pzh2000: 12, truck: 150 }, { ...ACTIVE, personnel: 2500 }),

  // 1. Panzerdivision
  u('Panzerlehrbrigade 9', 'maneuver', 'brigade', base('Munster', 52.99, 10.09), add(TANK_BN, PUMA_BN, PUMA_BN, ARTY_BN, { fennek: 24, truck: 400 }), { ...ACTIVE, personnel: 5000 }),
  u('Panzerbrigade 21', 'maneuver', 'brigade', base('Augustdorf', 51.9, 8.73), add(PUMA_BN, MARDER_BN, ARTY_BN, { fennek: 24, truck: 350 }), { ...ACTIVE, personnel: 4500 }),
  u('Panzergrenadierbrigade 41', 'maneuver', 'brigade', base('Neubrandenburg', 53.56, 13.26), add(MARDER_BN, MARDER_BN, { boxer: 40, truck: 350 }), { ...ACTIVE, personnel: 4500 }),
  u('Panzerbataillon 414 (German-Dutch)', 'maneuver', 'battalion', base('Lohheide (Bergen-Hohne)', 52.8, 9.93), { leopard2a6: 26 }, { ...ACTIVE, personnel: 500 }),
  u('Panzerbataillon 363', 'maneuver', 'battalion', base('Hardheim', 49.61, 9.47), TANK_BN, { readiness: 0.5, personnel: 500 }),

  // Lithuania
  u('Panzerbrigade 45 (Litauen Brigade)', 'maneuver', 'brigade', base('Rūdninkai, Lithuania', 54.38, 25.04), add(TANK_BN, PUMA_BN, { truck: 200 }), { readiness: 0.6, personnel: 2500 }),

  // Division Schnelle Kräfte
  u('Luftlandebrigade 1', 'maneuver', 'brigade', base('Saarlouis', 49.31, 6.75), { infantry_squad: 72, fennek: 12, truck: 200 }, { readiness: 0.75, personnel: 4000 }),
  u('Kampfhubschrauberregiment 36', 'air_wing', 'brigade', base('Fritzlar', 51.11, 9.29), { tiger: 50 }, { readiness: 0.4, personnel: 1200 }),
  u('Transporthubschrauberregimenter 10 und 30', 'air_wing', 'brigade', base('Faßberg', 52.92, 10.18), { nh90: 80 }, { readiness: 0.5, personnel: 2000 }),

  // Training base and float
  u('Ausbildungszentrum Munster (armour school and float)', 'maneuver', 'battalion', base('Munster', 52.99, 10.09), { leopard2a6: 26, leopard2a7: 18, puma_ifv: 30 }, { readiness: 0.4, personnel: 1500 }),
  u('Artillerieschule und Raketenartillerie', 'artillery', 'battalion', base('Idar-Oberstein', 49.71, 7.31), { pzh2000: 30, mars2: 12 }, { readiness: 0.5, personnel: 1500, extraMagazine: { gmlrs: 216 } }),

  // Luftwaffe
  u('Taktisches Luftwaffengeschwader 31 "Boelcke"', 'air_wing', 'wing', base('Fliegerhorst Nörvenich', 50.83, 6.66), { typhoon: 32 }, ACTIVE),
  u('Taktisches Luftwaffengeschwader 71 "Richthofen"', 'air_wing', 'wing', base('Fliegerhorst Wittmund', 53.55, 7.67), { typhoon: 32 }, ACTIVE),
  u('Taktisches Luftwaffengeschwader 73 "Steinhoff"', 'air_wing', 'wing', base('Fliegerhorst Laage', 53.92, 12.28), { typhoon: 42 }, { readiness: 0.55 }),
  u('Taktisches Luftwaffengeschwader 74', 'air_wing', 'wing', base('Fliegerhorst Neuburg', 48.71, 11.21), { typhoon: 32 }, ACTIVE),
  u('Taktisches Luftwaffengeschwader 33 (NATO nuclear sharing)', 'air_wing', 'wing', base('Fliegerhorst Büchel', 50.17, 7.06), { tornado_ids: 40 }, { readiness: 0.7 }),
  u('Taktisches Luftwaffengeschwader 51 "Immelmann"', 'air_wing', 'wing', base('Fliegerhorst Schleswig-Jagel', 54.46, 9.52), { tornado_ids: 25, tornado_ecr: 15 }, ACTIVE),
  u('Lufttransportgeschwader 62', 'logistics', 'wing', base('Fliegerhorst Wunstorf', 52.46, 9.43), { a400m: 40 }, ACTIVE),
  u('Flugabwehrraketengeschwader 1', 'air_defense', 'wing', base('Husum', 54.48, 9.05), { patriot_pac3: 54, iris_t_slm: 6, truck: 200 }, { readiness: 0.7, personnel: 3000, extraMagazine: { pac3_mse: 120 } }),
  u('Flugabwehrraketengruppe 61 (Skyranger 30)', 'air_defense', 'battalion', base('Todendorf', 54.33, 10.65), { skyranger: 10 }, { readiness: 0.5, personnel: 400 }),

  // Marine
  u('Einsatzflottille 2 (frigates)', 'surface_group', 'flotilla', base('Marinestützpunkt Wilhelmshaven', 53.52, 8.13), { ffg_f123: 4, ffg_f124: 3, ffg_f125: 4, egv_berlin: 3 }, { readiness: 0.6, personnel: 3000 }),
  u('Einsatzflottille 1 (corvettes)', 'surface_group', 'flotilla', base('Marinestützpunkt Warnemünde', 54.17, 12.08), { corvette_k130: 10 }, { readiness: 0.65, personnel: 650 }),
  u('1. Ubootgeschwader', 'submarine', 'flotilla', base('Marinestützpunkt Eckernförde', 54.47, 9.84), { ssk_type212a: 6 }, { readiness: 0.5, personnel: 6 * 28 }),
  u('Marinefliegergeschwader 3 "Graf Zeppelin"', 'air_wing', 'wing', base('Marinefliegerstützpunkt Nordholz', 53.77, 8.66), { p8a: 4, nh90: 18 }, ACTIVE),
];

/*
 * Netherlands, Belgium and Luxembourg, 2025-26.
 * Sources: IISS Military Balance 2025 (Netherlands: 18 Leopard 2A6 leased from Germany in
 * PzBtl 414, CV9035NL, PzH 2000, Patriot, F-35A ~40 in-country of 52, 4 De Zeven Provinciën
 * + 2 Karel Doorman FFG, 3 Walrus SSK; Belgium: F-16AM/BM with first F-35A in 2025, 2 Karel
 * Doorman FFG; Luxembourg: one reconnaissance battalion); defensie.nl, mil.be, armee.lu.
 * Netherlands F-35As at Luke AFB for training are excluded.
 */
import { base, forNation } from './build';

const nl = forNation('NLD', 'IISS Military Balance 2025; defensie.nl');
const be = forNation('BEL', 'IISS Military Balance 2025; mil.be');
const lu = forNation('LUX', 'IISS Military Balance 2025; armee.lu');

const ACTIVE = { readiness: 0.65 };
const denHelder = base('Marinehaven Den Helder', 52.96, 4.76);

export const benelux = [
  nl('11 Luchtmobiele Brigade', 'maneuver', 'brigade', base('Schaarsbergen', 52.02, 5.87), { infantry_squad: 54, truck: 200 }, { readiness: 0.8, personnel: 3500 }),
  nl('13 Lichte Brigade', 'maneuver', 'brigade', base('Oirschot', 51.5, 5.31), { infantry_squad: 54, boxer: 60, truck: 250 }, { ...ACTIVE, personnel: 3500 }),
  nl('43 Gemechaniseerde Brigade', 'maneuver', 'brigade', base('Havelte', 52.77, 6.24), { cv90: 120, infantry_squad: 36, truck: 300 }, { ...ACTIVE, personnel: 3500 }),
  nl('Dutch tank company, Panzerbataillon 414', 'maneuver', 'battalion', base('Lohheide (Bergen-Hohne)', 52.8, 9.93), { leopard2a6: 18 }, { ...ACTIVE, personnel: 150 }),
  nl('41 Afdeling Veldartillerie', 'artillery', 'battalion', base('Oldebroek', 52.41, 5.9), { pzh2000: 18 }, { ...ACTIVE, personnel: 600 }),
  nl('Defensie Grondgebonden Luchtverdedigingscommando', 'air_defense', 'brigade', base('Vredepeel', 51.53, 5.86), { patriot_pac3: 18, nasams: 6 }, { ...ACTIVE, personnel: 1000, extraMagazine: { pac3_mse: 48 } }),
  nl('Vliegbasis Leeuwarden (322 and 323 Squadrons)', 'air_wing', 'wing', base('Vliegbasis Leeuwarden', 53.23, 5.76), { f35a: 24 }, ACTIVE),
  nl('Vliegbasis Volkel (312 and 313 Squadrons)', 'air_wing', 'wing', base('Vliegbasis Volkel', 51.66, 5.69), { f35a: 20 }, ACTIVE),
  nl('Defensie Helikopter Commando', 'air_wing', 'wing', base('Vliegbasis Gilze-Rijen', 51.57, 4.93), { ah64e: 28, ch47f: 20, nh90: 20 }, ACTIVE),
  nl('Multinational MRTT Unit', 'logistics', 'squadron', base('Vliegbasis Eindhoven', 51.45, 5.37), { a330_mrtt: 9 }, ACTIVE),
  nl('Netherlands Maritime Force (frigates and amphibious)', 'surface_group', 'flotilla', denHelder, { ffg_de_zeven_provincien: 4, ffg_karel_doorman: 2, lpd_rotterdam: 2 }, { readiness: 0.6, personnel: 1800 }),
  nl('Onderzeedienst', 'submarine', 'flotilla', denHelder, { ssk_walrus: 3 }, { readiness: 0.5, personnel: 3 * 55 }),

  be('Motorized Brigade', 'maneuver', 'brigade', base('Leopoldsburg', 51.12, 5.25), { griffon: 60, jaguar_erbc: 20, infantry_squad: 54, truck: 250 }, { ...ACTIVE, personnel: 3500 }),
  be('Light Brigade', 'maneuver', 'brigade', base('Marche-en-Famenne', 50.22, 5.34), { infantry_squad: 54, truck: 150 }, { readiness: 0.7, personnel: 3000 }),
  be('Belgian contingent, NATO Forward Land Forces Romania', 'maneuver', 'battalion', base('Cincu, Romania', 45.92, 24.8), { infantry_squad: 9, griffon: 8 }, { readiness: 0.8, personnel: 250 }),
  be('2nd Tactical Wing', 'air_wing', 'wing', base('Florennes Air Base', 50.24, 4.65), { f16am: 20, f35a: 6 }, ACTIVE),
  be('10th Tactical Wing (NATO nuclear sharing)', 'air_wing', 'wing', base('Kleine-Brogel Air Base', 51.17, 5.47), { f16am: 18 }, ACTIVE),
  be('15th Air Transport Wing', 'logistics', 'wing', base('Melsbroek', 50.9, 4.49), { a400m: 7 }, ACTIVE),
  be('Belgian Navy frigates', 'surface_group', 'flotilla', base('Naval Base Zeebrugge', 51.33, 3.2), { ffg_karel_doorman: 2 }, { readiness: 0.55, personnel: 2 * 145 }),

  lu('Luxembourg Army Reconnaissance Battalion', 'maneuver', 'battalion', base('Caserne Grand-Duc Jean, Diekirch', 49.87, 6.16), { infantry_squad: 12, truck: 40 }, { readiness: 0.6, personnel: 900 }),
];

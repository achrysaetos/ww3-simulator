/*
 * Norway, Denmark, Sweden and Finland, 2025-26.
 * Sources: IISS Military Balance 2025 (Norway: 36 Leopard 2A4NO, F-35A, 4 Nansen, 6 Ula;
 * Denmark: 44 Leopard 2A7DK, F-16AM ~24 remaining as F-35A arrive, 3 Iver Huitfeldt + 2 Absalon;
 * Sweden: ~110 Strv 122, ~94 Gripen C/D, Visby, 3 Gotland + 1 Södermanland; Finland: ~200
 * Leopard 2A4/2A6, 62 F/A-18C/D, Hamina); forsvaret.no, forsvaret.dk, forsvarsmakten.se and
 * puolustusvoimat.fi unit pages. Home Guard and Finnish wartime reserve lines aggregate many
 * local units; Finland's mobilised strength (280,000) is not all modelled as standing brigades.
 */
import { base, forNation } from './build';

const no = forNation('NOR', 'IISS Military Balance 2025; forsvaret.no');
const dk = forNation('DNK', 'IISS Military Balance 2025; forsvaret.dk');
const se = forNation('SWE', 'IISS Military Balance 2025; forsvarsmakten.se');
const fi = forNation('FIN', 'IISS Military Balance 2025; puolustusvoimat.fi');

const ACTIVE = { readiness: 0.7 };
const SE_MECH = { cv90: 60, archer: 12, infantry_squad: 36, truck: 300 };

export const nordic = [
  // Norway
  no('Brigade Nord', 'maneuver', 'brigade', base('Setermoen', 68.86, 18.35), { leopard2a4: 36, cv90: 140, k9_thunder: 24, infantry_squad: 54, truck: 500 }, { ...ACTIVE, personnel: 4500 }),
  no('Finnmark Brigade', 'maneuver', 'brigade', base('Porsangmoen', 70.05, 25.0), { cv90: 20, infantry_squad: 27, truck: 100 }, { readiness: 0.6, personnel: 1500 }),
  no('His Majesty the King’s Guard', 'maneuver', 'battalion', base('Huseby, Oslo', 59.95, 10.66), { infantry_squad: 30 }, ACTIVE),
  no('Home Guard (Heimevernet, aggregate of 11 districts)', 'maneuver', 'division', base('Oslo', 59.91, 10.75), { infantry_squad: 400, truck: 300 }, { readiness: 0.4, personnel: 40000, territorial: true }),
  no('Air Defence Battalion (NASAMS)', 'air_defense', 'battalion', base('Ørland Air Station', 63.7, 9.6), { nasams: 12 }, ACTIVE),
  no('132 Air Wing', 'air_wing', 'wing', base('Ørland Air Station', 63.7, 9.6), { f35a: 34 }, ACTIVE),
  no('Evenes forward operating base (F-35A QRA)', 'air_wing', 'squadron', base('Evenes Air Station', 68.49, 16.68), { f35a: 4, p8a: 5 }, ACTIVE),
  no('Royal Norwegian Navy frigate and corvette flotilla', 'surface_group', 'flotilla', base('Haakonsvern, Bergen', 60.33, 5.25), { ffg_nansen: 4, corvette_skjold: 6 }, { readiness: 0.6, personnel: 4 * 120 + 6 * 20 }),
  no('Submarine Flotilla', 'submarine', 'flotilla', base('Haakonsvern, Bergen', 60.33, 5.25), { ssk_ula: 6 }, { readiness: 0.55, personnel: 6 * 21 }),

  // Denmark
  dk('1st Brigade', 'maneuver', 'brigade', base('Holstebro', 56.36, 8.62), { leopard2a7: 44, cv90: 44, piranha5: 60, caesar: 6, infantry_squad: 36, truck: 300 }, { ...ACTIVE, personnel: 4000 }),
  dk('2nd Brigade', 'maneuver', 'brigade', base('Slagelse', 55.4, 11.35), { piranha5: 80, infantry_squad: 36, truck: 200 }, { readiness: 0.5, personnel: 3000 }),
  dk('Danish contingent, Multinational Brigade Latvia', 'maneuver', 'battalion', base('Ādaži, Latvia', 57.08, 24.32), { piranha5: 20, infantry_squad: 9 }, { readiness: 0.85, personnel: 700 }),
  dk('Fighter Wing Skrydstrup', 'air_wing', 'wing', base('Flyvestation Skrydstrup', 55.22, 9.26), { f16am: 24, f35a: 14 }, ACTIVE),
  dk('1st Squadron (frigates)', 'surface_group', 'flotilla', base('Flådestation Korsør', 55.33, 11.14), { ffg_iver_huitfeldt: 3 }, { readiness: 0.6, personnel: 3 * 165 }),
  dk('2nd Squadron (Absalon class)', 'surface_group', 'flotilla', base('Flådestation Frederikshavn', 57.44, 10.54), { ffg_absalon: 2 }, { readiness: 0.6, personnel: 2 * 100 }),

  // Sweden
  se('Norrbotten Brigade (MekB 19)', 'maneuver', 'brigade', base('Boden', 65.83, 21.69), { ...SE_MECH, strv122: 30 }, { ...ACTIVE, personnel: 5000 }),
  se('Skaraborg Brigade (MekB 4)', 'maneuver', 'brigade', base('Skövde', 58.39, 13.85), { ...SE_MECH, strv122: 40 }, { ...ACTIVE, personnel: 5000 }),
  se('South Scania Brigade (MekB 7)', 'maneuver', 'brigade', base('Revinge', 55.7, 13.47), { ...SE_MECH, strv122: 20 }, { ...ACTIVE, personnel: 5000 }),
  se('Gotland Regiment (P 18)', 'maneuver', 'battalion', base('Visby, Gotland', 57.64, 18.3), { strv122: 10, cv90: 12, archer: 6, infantry_squad: 9 }, { readiness: 0.8, personnel: 600 }),
  se('Swedish contingent, Multinational Brigade Latvia', 'maneuver', 'battalion', base('Ādaži, Latvia', 57.08, 24.32), { strv122: 10, cv90: 20, infantry_squad: 9 }, { readiness: 0.85, personnel: 550 }),
  se('Air Defence Regiment (Lv 6)', 'air_defense', 'brigade', base('Halmstad', 56.67, 12.86), { patriot_pac3: 16, rbs70: 30 }, { ...ACTIVE, personnel: 1500, extraMagazine: { pac3_mse: 48 } }),
  se('Skaraborg Wing (F 7)', 'air_wing', 'wing', base('Såtenäs', 58.43, 12.71), { gripen_c: 30, gripen_e: 4 }, ACTIVE),
  se('Blekinge Wing (F 17)', 'air_wing', 'wing', base('Ronneby', 56.27, 15.27), { gripen_c: 30 }, ACTIVE),
  se('Norrbotten Wing (F 21)', 'air_wing', 'wing', base('Luleå-Kallax', 65.54, 22.12), { gripen_c: 30 }, ACTIVE),
  se('3rd Naval Warfare Flotilla', 'surface_group', 'flotilla', base('Karlskrona', 56.16, 15.59), { corvette_visby: 5 }, { readiness: 0.7, personnel: 5 * 45 }),
  se('1st Submarine Flotilla', 'submarine', 'flotilla', base('Karlskrona', 56.16, 15.59), { ssk_gotland: 3, ssk_sodermanland: 1 }, { readiness: 0.7, personnel: 4 * 27 }),
  se('Amphibious Regiment (Amf 1)', 'missile', 'battalion', base('Berga', 59.07, 18.12), { rbs15_coastal: 8, infantry_squad: 18 }, { ...ACTIVE, personnel: 1200 }),

  // Finland
  fi('Armoured Brigade', 'maneuver', 'brigade', base('Parola', 61.05, 24.37), { leopard2a6: 80, leopard2a4: 40, cv90: 100, k9_thunder: 24, infantry_squad: 54, truck: 400 }, { ...ACTIVE, personnel: 5000 }),
  fi('Karelia Brigade', 'maneuver', 'brigade', base('Vekaranjärvi', 60.97, 26.72), { leopard2a6: 20, leopard2a4: 40, bmp2: 60, k9_thunder: 48, infantry_squad: 54, truck: 400 }, { ...ACTIVE, personnel: 5000 }),
  fi('Jaeger Brigade', 'maneuver', 'brigade', base('Sodankylä', 67.42, 26.59), { infantry_squad: 54, patria_amv: 40, truck: 200 }, { ...ACTIVE, personnel: 3000 }),
  fi('Kainuu Brigade', 'maneuver', 'brigade', base('Kajaani', 64.22, 27.73), { infantry_squad: 54, truck: 200 }, { ...ACTIVE, personnel: 3000 }),
  fi('Pori Brigade', 'maneuver', 'brigade', base('Säkylä', 61.04, 22.34), { infantry_squad: 54, patria_amv: 60, truck: 200 }, { ...ACTIVE, personnel: 3500 }),
  fi('Guard Jaeger Regiment', 'maneuver', 'brigade', base('Santahamina, Helsinki', 60.15, 25.05), { infantry_squad: 40, patria_amv: 30 }, { ...ACTIVE, personnel: 2500 }),
  fi('Army Academy artillery (M270)', 'artillery', 'battalion', base('Niinisalo', 61.85, 22.48), { m270a1: 40, k9_thunder: 24 }, { ...ACTIVE, personnel: 1500, extraMagazine: { gmlrs: 480 } }),
  fi('Wartime reserve infantry (aggregate of local and regional forces)', 'maneuver', 'army', base('Tampere', 61.5, 23.76), { infantry_squad: 2000, truck: 2000 }, { readiness: 0.4, personnel: 180000, territorial: true }),
  fi('Air defence (NASAMS)', 'air_defense', 'battalion', base('Helsinki', 60.17, 24.94), { nasams: 12 }, ACTIVE),
  fi('Karelia Air Wing', 'air_wing', 'wing', base('Rissala, Kuopio', 63.01, 27.8), { fa18cd: 30 }, ACTIVE),
  fi('Lapland Air Wing', 'air_wing', 'wing', base('Rovaniemi', 66.56, 25.83), { fa18cd: 30 }, ACTIVE),
  fi('Coastal Fleet', 'surface_group', 'flotilla', base('Upinniemi', 60.03, 24.36), { corvette_hamina: 4 }, { ...ACTIVE, personnel: 4 * 30 }),
];

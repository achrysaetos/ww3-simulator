/*
 * US Army and Army National Guard, late 2025 / 2026.
 * Sources: IISS Military Balance 2025 (US Army: 11 armd, 6 mech (Stryker), 14 lt inf/abn
 * bde active; ARNG 5 armd, 2 mech, 20 lt inf bde; ~2,640 M1A1/M1A2 active); army.mil and
 * home.army.mil installation pages for stationing; CRS IF11426 (Army Prepositioned Stocks);
 * US Army Europe and Africa fact sheets (2025); 2024 US-German statement on long-range fires
 * in Germany from 2026. Rotational units in Poland and Korea are named nominally because the
 * rotation in a given month changes; the brigade set is right.
 */
import { add, base, forNation, scale, swap } from './build';
import { US_ABCT, US_CAB, US_HIMARS_BN, US_IBCT, US_MLRS_BN, US_PATRIOT_BN, US_SBCT, US_THAAD_BTY } from './templates';

const SRC = 'IISS Military Balance 2025; army.mil unit pages; CRS IF11426';
const u = forNation('USA', SRC);

const fortBliss = base('Fort Bliss, TX', 31.81, -106.42);
const fortHood = base('Fort Hood, TX', 31.13, -97.78);
const fortRiley = base('Fort Riley, KS', 39.06, -96.79);
const fortStewart = base('Fort Stewart, GA', 31.87, -81.61);
const fortCarson = base('Fort Carson, CO', 38.74, -104.79);
const jblm = base('Joint Base Lewis-McChord, WA', 47.09, -122.58);
const fortBragg = base('Fort Bragg, NC', 35.14, -79.0);
const fortCampbell = base('Fort Campbell, KY', 36.66, -87.47);
const fortDrum = base('Fort Drum, NY', 44.05, -75.76);
const fortPolk = base('Fort Polk, LA', 31.05, -93.21);
const fortSill = base('Fort Sill, OK', 34.65, -98.4);
const fortMoore = base('Fort Moore, GA', 32.36, -84.95);
const fortWainwright = base('Fort Wainwright, AK', 64.83, -147.6);
const jber = base('Joint Base Elmendorf-Richardson, AK', 61.25, -149.8);
const fortGreely = base('Fort Greely, AK', 63.98, -145.72);
const vandenberg = base('Vandenberg SFB, CA', 34.73, -120.57);
const schofield = base('Schofield Barracks, HI', 21.49, -158.06);
const wheeler = base('Wheeler AAF, HI', 21.48, -158.04);
const fortShafter = base('Fort Shafter, HI', 21.35, -157.88);
const annistonDepot = base('Anniston Army Depot, AL', 33.63, -85.97);

const vilseck = base('Rose Barracks, Vilseck', 49.61, 11.8);
const vicenza = base('Caserma Del Din, Vicenza', 45.55, 11.55);
const ansbach = base('Katterbach Kaserne, Ansbach', 49.3, 10.58);
const grafenwoehr = base('Grafenwöhr Training Area', 49.7, 11.94);
const kaiserslautern = base('Rhine Ordnance Barracks, Kaiserslautern', 49.44, 7.77);
const baumholder = base('Smith Barracks, Baumholder', 49.65, 7.33);
const mainzKastel = base('Mainz-Kastel Station', 50.01, 8.3);
const zagan = base('Żagań, Poland', 51.62, 15.32);
const powidz = base('Powidz, Poland', 52.38, 17.85);
const poznan = base('Camp Kościuszko, Poznań', 52.41, 16.93);
const rzeszow = base('Rzeszów-Jasionka, Poland', 50.11, 22.02);
const redzikowo = base('Redzikowo, Poland', 54.48, 17.1);
const pabrade = base('Pabradė, Lithuania', 54.98, 25.76);
const deveselu = base('Deveselu, Romania', 44.08, 24.09);
const eygelshoven = base('Eygelshoven, Netherlands', 50.89, 6.06);
const dulmen = base('Dülmen, Germany', 51.83, 7.28);
const humphreys = base('Camp Humphreys, Korea', 36.96, 127.03);
const suwon = base('Suwon AB, Korea', 37.24, 127.0);
const seongju = base('Seongju, Korea', 35.95, 128.25);
const campCarroll = base('Camp Carroll, Korea', 35.99, 128.4);
const zama = base('Camp Zama, Japan', 35.5, 139.39);
const kadena = base('Kadena AB, Okinawa', 26.35, 127.77);
const guam = base('Andersen AFB, Guam', 13.58, 144.93);
const luzon = base('Northern Luzon, Philippines', 17.6, 121.7);
const arifjan = base('Camp Arifjan, Kuwait', 28.93, 48.1);
const diegoGarcia = base('Diego Garcia, BIOT', -7.31, 72.41);

const ACTIVE = { readiness: 0.85, personnel: 4200 };
const SBCT_P = { readiness: 0.85, personnel: 4500 };
const IBCT_P = { readiness: 0.85, personnel: 4400 };
const ARNG = { readiness: 0.55 };
const SEPV2_ABCT = swap(US_ABCT, 'm1a2_sepv3', 'm1a2_sepv2');
/** Army Prepositioned Stock brigade set: full equipment, a caretaker workforce, troops fly in to draw it. */
const APS = { readiness: 0.3, personnel: 300 };

const divisionEnablers = (div: string, b: typeof fortBliss, cab = US_CAB) => [
  u(`Combat Aviation Brigade, ${div}`, 'air_wing', 'brigade', b, cab, { readiness: 0.8, personnel: 2800 }),
  u(`Division Artillery, ${div}`, 'artillery', 'battalion', b, { m777a2: 6, truck: 60 }, { readiness: 0.8, personnel: 800 }),
  u(`Division Sustainment Brigade, ${div}`, 'logistics', 'brigade', b, { truck: 900 }, { readiness: 0.8, personnel: 2000 }),
];

export const usaArmy = [
  // 1st Armored Division
  u('1st Armored Brigade Combat Team, 1st Armored Division', 'maneuver', 'brigade', fortBliss, US_ABCT, ACTIVE),
  u('2nd Armored Brigade Combat Team, 1st Armored Division', 'maneuver', 'brigade', fortBliss, US_ABCT, ACTIVE),
  u('3rd Armored Brigade Combat Team, 1st Armored Division', 'maneuver', 'brigade', fortBliss, US_ABCT, ACTIVE),
  ...divisionEnablers('1st Armored Division', fortBliss),

  // 1st Cavalry Division
  u('1st Armored Brigade Combat Team, 1st Cavalry Division', 'maneuver', 'brigade', fortHood, US_ABCT, ACTIVE),
  u('2nd Armored Brigade Combat Team, 1st Cavalry Division', 'maneuver', 'brigade', fortHood, US_ABCT, ACTIVE),
  u('3rd Armored Brigade Combat Team, 1st Cavalry Division', 'maneuver', 'brigade', fortHood, US_ABCT, ACTIVE),
  ...divisionEnablers('1st Cavalry Division', fortHood, add(US_CAB, { ah64e: 24 })),

  // 1st Infantry Division (2nd ABCT on the Korea rotation, nominal)
  u('1st Armored Brigade Combat Team, 1st Infantry Division', 'maneuver', 'brigade', fortRiley, US_ABCT, ACTIVE),
  u('2nd Armored Brigade Combat Team, 1st Infantry Division (Korea rotation)', 'maneuver', 'brigade', humphreys, SEPV2_ABCT, ACTIVE),
  ...divisionEnablers('1st Infantry Division', fortRiley),

  // 3rd Infantry Division (1st ABCT on the Poland/Baltic rotation, nominal)
  u('1st Armored Brigade Combat Team, 3rd Infantry Division (Poland rotation)', 'maneuver', 'brigade', zagan, US_ABCT, ACTIVE),
  u('2nd Armored Brigade Combat Team, 3rd Infantry Division', 'maneuver', 'brigade', fortStewart, US_ABCT, ACTIVE),
  ...divisionEnablers('3rd Infantry Division', fortStewart),

  // 4th Infantry Division
  u('1st Stryker Brigade Combat Team, 4th Infantry Division', 'maneuver', 'brigade', fortCarson, US_SBCT, SBCT_P),
  u('2nd Stryker Brigade Combat Team, 4th Infantry Division', 'maneuver', 'brigade', fortCarson, US_SBCT, SBCT_P),
  u('3rd Armored Brigade Combat Team, 4th Infantry Division', 'maneuver', 'brigade', fortCarson, SEPV2_ABCT, ACTIVE),
  ...divisionEnablers('4th Infantry Division', fortCarson),

  // 7th Infantry Division / 2nd Infantry Division brigades at JBLM
  u('1st Stryker Brigade Combat Team, 2nd Infantry Division', 'maneuver', 'brigade', jblm, US_SBCT, SBCT_P),
  u('2nd Stryker Brigade Combat Team, 2nd Infantry Division', 'maneuver', 'brigade', jblm, US_SBCT, SBCT_P),
  u('16th Combat Aviation Brigade, 7th Infantry Division', 'air_wing', 'brigade', jblm, { uh60m: 30, ch47f: 12, hh60m: 12 }, { readiness: 0.8, personnel: 2200 }),

  // 82nd Airborne Division
  u('1st Brigade Combat Team, 82nd Airborne Division', 'maneuver', 'brigade', fortBragg, US_IBCT, { ...IBCT_P, readiness: 0.9, airborne: true }),
  u('2nd Brigade Combat Team, 82nd Airborne Division', 'maneuver', 'brigade', fortBragg, US_IBCT, { ...IBCT_P, readiness: 0.9, airborne: true }),
  u('3rd Brigade Combat Team, 82nd Airborne Division', 'maneuver', 'brigade', fortBragg, US_IBCT, { ...IBCT_P, readiness: 0.9, airborne: true }),
  ...divisionEnablers('82nd Airborne Division', fortBragg),

  // 101st Airborne Division (Air Assault)
  u('1st Brigade Combat Team, 101st Airborne Division', 'maneuver', 'brigade', fortCampbell, US_IBCT, { ...IBCT_P, airborne: true }),
  u('2nd Brigade Combat Team, 101st Airborne Division', 'maneuver', 'brigade', fortCampbell, US_IBCT, { ...IBCT_P, airborne: true }),
  u('3rd Brigade Combat Team, 101st Airborne Division', 'maneuver', 'brigade', fortCampbell, US_IBCT, { ...IBCT_P, airborne: true }),
  ...divisionEnablers('101st Airborne Division', fortCampbell, { ah64e: 48, uh60m: 60, hh60m: 15, ch47f: 24, truck: 250 }),

  // 10th Mountain Division
  u('1st Brigade Combat Team, 10th Mountain Division', 'maneuver', 'brigade', fortDrum, US_IBCT, IBCT_P),
  u('2nd Brigade Combat Team, 10th Mountain Division', 'maneuver', 'brigade', fortDrum, US_IBCT, IBCT_P),
  u('3rd Brigade Combat Team, 10th Mountain Division', 'maneuver', 'brigade', fortPolk, US_IBCT, IBCT_P),
  ...divisionEnablers('10th Mountain Division', fortDrum),

  // 25th Infantry Division
  u('2nd Brigade Combat Team, 25th Infantry Division', 'maneuver', 'brigade', schofield, US_IBCT, IBCT_P),
  u('3rd Brigade Combat Team, 25th Infantry Division', 'maneuver', 'brigade', schofield, US_IBCT, IBCT_P),
  ...divisionEnablers('25th Infantry Division', wheeler),

  // 11th Airborne Division (Arctic)
  u('1st Infantry Brigade Combat Team, 11th Airborne Division', 'maneuver', 'brigade', fortWainwright, US_IBCT, IBCT_P),
  u('2nd Infantry Brigade Combat Team (Airborne), 11th Airborne Division', 'maneuver', 'brigade', jber, US_IBCT, { ...IBCT_P, airborne: true }),
  u('Aviation Task Force, 11th Airborne Division', 'air_wing', 'battalion', fortWainwright, { ah64e: 12, uh60m: 20, ch47f: 12, hh60m: 6 }, { readiness: 0.8, personnel: 1200 }),

  // Forward-based in Europe
  u('2nd Cavalry Regiment', 'maneuver', 'brigade', vilseck, { ...US_SBCT, stryker_icv: 54, stryker_dragoon: 81, stryker_shorad: 12 }, { readiness: 0.9, personnel: 4500 }),
  u('173rd Airborne Brigade', 'maneuver', 'brigade', vicenza, US_IBCT, { readiness: 0.9, personnel: 3800, airborne: true }),
  u('12th Combat Aviation Brigade', 'air_wing', 'brigade', ansbach, add(US_CAB, { ah64e: 24 }), { readiness: 0.85, personnel: 2600 }),
  u('Rotational Combat Aviation Brigade (Poland)', 'air_wing', 'brigade', powidz, US_CAB, { readiness: 0.85, personnel: 2200 }),
  u('V Corps Forward Command Post', 'logistics', 'corps', poznan, { truck: 200 }, { readiness: 0.9, personnel: 1000 }),
  u('Task Force Pabradė (ABCT battalion task force)', 'maneuver', 'battalion', pabrade, scale(US_ABCT, 0.3), { readiness: 0.9, personnel: 1100 }),
  u('41st Field Artillery Brigade', 'artillery', 'brigade', grafenwoehr, add(US_MLRS_BN, US_MLRS_BN), { readiness: 0.9, personnel: 1500, extraMagazine: { gmlrs: 864, atacms: 72, prsm_inc1: 24 } }),
  u('56th Multi-Domain Command, Long-Range Fires Battalion (2nd MDTF)', 'missile', 'battalion', mainzKastel, { typhon_launcher: 4, truck: 40 }, { readiness: 0.6, personnel: 500, extraMagazine: { tomahawk_blk5: 32, sm6: 16 } }),
  // A battalion mixes PAC-3 MSE and GEM-T launchers (an M903 holds 12 MSE or 4 GEM-T): 6 of 24 carry GEM-T, rounds unchanged.
  u('5th Battalion, 7th Air Defense Artillery Regiment', 'air_defense', 'battalion', baumholder, { ...US_PATRIOT_BN, patriot_pac3: 18, patriot_pac2: 6 }, { readiness: 0.9, personnel: 600, extraMagazine: { pac3_mse: 168, pac2_gem_t: 24 } }),
  u('5th Battalion, 4th Air Defense Artillery Regiment (M-SHORAD)', 'air_defense', 'battalion', ansbach, { stryker_shorad: 36, avenger: 12, truck: 60 }, { readiness: 0.9, personnel: 600 }),
  u('10th Army Air and Missile Defense Command, Patriot Task Force (Poland)', 'air_defense', 'battalion', rzeszow, scale(US_PATRIOT_BN, 0.5), { readiness: 0.9, personnel: 300 }),
  u('Aegis Ashore Missile Defense System Romania', 'air_defense', 'battalion', deveselu, { aegis_ashore: 1 }, { readiness: 0.9, personnel: 200 }),
  u('Aegis Ashore Missile Defense System Poland', 'air_defense', 'battalion', redzikowo, { aegis_ashore: 1 }, { readiness: 0.85, personnel: 200 }),
  u('21st Theater Sustainment Command', 'logistics', 'corps', kaiserslautern, { truck: 1500 }, { readiness: 0.85, personnel: 4000 }),

  // Korea
  u('210th Field Artillery Brigade', 'artillery', 'brigade', humphreys, add(US_MLRS_BN, US_MLRS_BN), { readiness: 0.9, personnel: 1400, extraMagazine: { gmlrs: 864, atacms: 72 } }),
  u('2nd Combat Aviation Brigade', 'air_wing', 'brigade', humphreys, US_CAB, { readiness: 0.9, personnel: 2400 }),
  u('2nd Battalion, 1st Air Defense Artillery Regiment', 'air_defense', 'battalion', humphreys, US_PATRIOT_BN, { readiness: 0.9, personnel: 600, extraMagazine: { pac3_mse: 96 } }),
  u('6th Battalion, 52nd Air Defense Artillery Regiment', 'air_defense', 'battalion', suwon, US_PATRIOT_BN, { readiness: 0.9, personnel: 600, extraMagazine: { pac3_mse: 96 } }),
  u('Battery D, 2nd ADA Regiment (THAAD Korea)', 'air_defense', 'battalion', seongju, US_THAAD_BTY, { readiness: 0.9, personnel: 100, extraMagazine: { thaad_interceptor: 48 } }),

  // Middle East: a THAAD battery has been in Israel since October 2024 and fired ~100-150 rounds in the June 2025 war (US DoD; CSIS 2025).
  u('Battery B, 2nd ADA Regiment (THAAD Israel)', 'air_defense', 'battalion', base('Nevatim', 31.21, 35.01), US_THAAD_BTY, { readiness: 0.9, personnel: 100, extraMagazine: { thaad_interceptor: 48 } }),

  // Japan, Guam, Philippines
  u('1st Battalion, 1st Air Defense Artillery Regiment', 'air_defense', 'battalion', kadena, US_PATRIOT_BN, { readiness: 0.9, personnel: 600, extraMagazine: { pac3_mse: 96 } }),
  u('38th Air Defense Artillery Brigade', 'air_defense', 'brigade', zama, { truck: 50 }, { readiness: 0.9, personnel: 300 }),
  u('Task Force Talon (THAAD Guam)', 'air_defense', 'battalion', guam, US_THAAD_BTY, { readiness: 0.9, personnel: 100, extraMagazine: { thaad_interceptor: 48 } }),
  u('Typhon Battery, 3rd Multi-Domain Task Force (Philippines)', 'missile', 'battalion', luzon, { typhon_launcher: 4, truck: 30 }, { readiness: 0.8, personnel: 200, extraMagazine: { tomahawk_blk5: 24, sm6: 16 } }),
  u('3rd Multi-Domain Task Force', 'missile', 'battalion', fortShafter, US_HIMARS_BN, { readiness: 0.8, personnel: 1500, extraMagazine: { gmlrs: 432, prsm_inc1: 36 } }),
  u('94th Army Air and Missile Defense Command, 1st Bn 62nd ADA', 'air_defense', 'battalion', fortShafter, scale(US_PATRIOT_BN, 0.5), { readiness: 0.85, personnel: 300 }),

  // CONUS fires
  u('1st Multi-Domain Task Force', 'missile', 'brigade', jblm, add(US_HIMARS_BN, { typhon_launcher: 4 }), { readiness: 0.85, personnel: 2000, extraMagazine: { gmlrs: 432, prsm_inc1: 36, tomahawk_blk5: 24, sm6: 8 } }),
  u('Battery B, 5th Battalion, 3rd Field Artillery (Dark Eagle)', 'missile', 'battalion', jblm, { lrhw_launcher: 4, truck: 20 }, { readiness: 0.7, personnel: 150, extraMagazine: { lrhw: 8 } }),
  u('17th Field Artillery Brigade', 'artillery', 'brigade', jblm, add(US_HIMARS_BN, US_HIMARS_BN), { readiness: 0.85, personnel: 1600, extraMagazine: { gmlrs: 864, prsm_inc1: 36 } }),
  u('18th Field Artillery Brigade', 'artillery', 'brigade', fortBragg, add(US_HIMARS_BN, US_HIMARS_BN, US_HIMARS_BN), { readiness: 0.9, personnel: 2200, extraMagazine: { gmlrs: 1296, atacms: 72, prsm_inc1: 36 } }),
  u('75th Field Artillery Brigade', 'artillery', 'brigade', fortSill, add(US_MLRS_BN, US_HIMARS_BN), { readiness: 0.85, personnel: 1600, extraMagazine: { gmlrs: 864, atacms: 48 } }),
  u('214th Field Artillery Brigade', 'artillery', 'brigade', fortSill, add(US_HIMARS_BN, US_MLRS_BN), { readiness: 0.85, personnel: 1600, extraMagazine: { gmlrs: 864 } }),
  u('428th Field Artillery Brigade (training)', 'artillery', 'brigade', fortSill, { m109a7: 24, m777a2: 30, m119a3: 18, m142_himars: 12 }, { readiness: 0.5, personnel: 1500 }),

  // CONUS air and missile defense
  u('1st Battalion, 43rd Air Defense Artillery Regiment', 'air_defense', 'battalion', fortBliss, US_PATRIOT_BN, { readiness: 0.85, personnel: 600, extraMagazine: { pac3_mse: 96 } }),
  u('3rd Battalion, 43rd Air Defense Artillery Regiment', 'air_defense', 'battalion', fortBliss, US_PATRIOT_BN, { readiness: 0.85, personnel: 600, extraMagazine: { pac3_mse: 96 } }),
  u('5th Battalion, 52nd Air Defense Artillery Regiment', 'air_defense', 'battalion', fortBliss, US_PATRIOT_BN, { readiness: 0.85, personnel: 600, extraMagazine: { pac3_mse: 96 } }),
  u('2nd Battalion, 43rd Air Defense Artillery Regiment', 'air_defense', 'battalion', fortBliss, US_PATRIOT_BN, { readiness: 0.85, personnel: 600, extraMagazine: { pac3_mse: 96 } }),
  u('1st Battalion, 44th Air Defense Artillery Regiment', 'air_defense', 'battalion', fortHood, US_PATRIOT_BN, { readiness: 0.85, personnel: 600, extraMagazine: { pac3_mse: 96 } }),
  u('4th Battalion, 5th Air Defense Artillery Regiment', 'air_defense', 'battalion', fortHood, US_PATRIOT_BN, { readiness: 0.85, personnel: 600, extraMagazine: { pac3_mse: 96 } }),
  u('1st Battalion, 7th Air Defense Artillery Regiment', 'air_defense', 'battalion', fortBragg, US_PATRIOT_BN, { readiness: 0.85, personnel: 600, extraMagazine: { pac3_mse: 96 } }),
  u('3rd Battalion, 4th Air Defense Artillery Regiment', 'air_defense', 'battalion', fortBragg, US_PATRIOT_BN, { readiness: 0.85, personnel: 600, extraMagazine: { pac3_mse: 96 } }),
  u('3rd Battalion, 2nd Air Defense Artillery Regiment', 'air_defense', 'battalion', fortSill, US_PATRIOT_BN, { readiness: 0.85, personnel: 600, extraMagazine: { pac3_mse: 96 } }),
  u('4th Battalion, 3rd Air Defense Artillery Regiment', 'air_defense', 'battalion', fortSill, US_PATRIOT_BN, { readiness: 0.85, personnel: 600, extraMagazine: { pac3_mse: 96 } }),
  u('11th ADA Brigade THAAD batteries (A-2, A-4, B-2 ADA)', 'air_defense', 'battalion', fortBliss, scale(US_THAAD_BTY, 3), { readiness: 0.85, personnel: 300, extraMagazine: { thaad_interceptor: 96 } }),
  u('69th ADA Brigade THAAD batteries (E-3, A-3 ADA)', 'air_defense', 'battalion', fortHood, scale(US_THAAD_BTY, 2), { readiness: 0.85, personnel: 200, extraMagazine: { thaad_interceptor: 48 } }),
  u('49th Missile Defense Battalion (Ground-based Midcourse Defense)', 'air_defense', 'battalion', fortGreely, { gmd_interceptor_silo: 40 }, { readiness: 0.9, personnel: 300 }),
  u('Ground-based Midcourse Defense, Vandenberg', 'air_defense', 'battalion', vandenberg, { gmd_interceptor_silo: 4 }, { readiness: 0.9, personnel: 100 }),

  // Training base
  u('194th Armored Brigade (Armor School)', 'maneuver', 'brigade', fortMoore, { m1a2_sepv2: 100, m2a3_bradley: 60, m3a3_bradley: 20 }, { readiness: 0.5, personnel: 3000 }),
  u('198th Infantry Brigade (Infantry School)', 'maneuver', 'brigade', fortMoore, { infantry_squad: 60, m2a3_bradley: 40 }, { readiness: 0.4, personnel: 3000 }),

  // Army Prepositioned Stocks and the depot float (IISS counts these in the active inventory)
  u('APS-2 Armored Brigade Set (Powidz)', 'maneuver', 'brigade', powidz, SEPV2_ABCT, APS),
  u('APS-2 Armored Brigade Set (Eygelshoven)', 'maneuver', 'brigade', eygelshoven, SEPV2_ABCT, APS),
  u('APS-2 Fires and Sustainment Set (Dülmen)', 'artillery', 'brigade', dulmen, { m109a6: 36, m270a1: 18, truck: 900 }, APS),
  u('APS-4 Armored Brigade Set (Camp Carroll)', 'maneuver', 'brigade', campCarroll, SEPV2_ABCT, APS),
  u('APS-5 Armored Brigade Set (Camp Arifjan)', 'maneuver', 'brigade', arifjan, SEPV2_ABCT, APS),
  u('APS-3 Afloat Armored Brigade Set', 'maneuver', 'brigade', diegoGarcia, SEPV2_ABCT, APS),
  u('Army Materiel Command tank float and depot pipeline', 'logistics', 'brigade', annistonDepot, { m1a2_sepv2: 300, m1a1_sa: 300, m2a3_bradley: 400 }, { readiness: 0.2, personnel: 500 }),

  // Army National Guard divisions
  u('30th Armored Brigade Combat Team (NC ARNG)', 'maneuver', 'brigade', base('Clinton, NC', 35.0, -78.32), SEPV2_ABCT, ARNG),
  u('116th Cavalry Brigade Combat Team (ID ARNG)', 'maneuver', 'brigade', base('Boise, ID', 43.6, -116.2), SEPV2_ABCT, ARNG),
  u('155th Armored Brigade Combat Team (MS ARNG)', 'maneuver', 'brigade', base('Tupelo, MS', 34.26, -88.7), SEPV2_ABCT, ARNG),
  u('278th Armored Cavalry Regiment (TN ARNG)', 'maneuver', 'brigade', base('Knoxville, TN', 35.96, -83.92), SEPV2_ABCT, ARNG),
  u('1st Armored Brigade Combat Team, 34th Infantry Division (MN ARNG)', 'maneuver', 'brigade', base('Camp Ripley, MN', 46.08, -94.35), SEPV2_ABCT, ARNG),
  u('56th Stryker Brigade Combat Team, 28th Infantry Division (PA ARNG)', 'maneuver', 'brigade', base('Philadelphia, PA', 40.0, -75.1), US_SBCT, ARNG),
  u('81st Stryker Brigade Combat Team (WA ARNG)', 'maneuver', 'brigade', base('Seattle, WA', 47.6, -122.3), US_SBCT, ARNG),
  ...([
    ['27th Infantry Brigade Combat Team (NY ARNG)', 'Syracuse, NY', 43.05, -76.15],
    ['29th Infantry Brigade Combat Team (HI ARNG)', 'Schofield Barracks, HI', 21.49, -158.06],
    ['32nd Infantry Brigade Combat Team (WI ARNG)', 'Camp Douglas, WI', 43.92, -90.27],
    ['33rd Infantry Brigade Combat Team (IL ARNG)', 'Urbana, IL', 40.11, -88.2],
    ['37th Infantry Brigade Combat Team (OH ARNG)', 'Columbus, OH', 39.96, -83.0],
    ['39th Infantry Brigade Combat Team (AR ARNG)', 'Little Rock, AR', 34.75, -92.29],
    ['41st Infantry Brigade Combat Team (OR ARNG)', 'Portland, OR', 45.52, -122.68],
    ['45th Infantry Brigade Combat Team (OK ARNG)', 'Norman, OK', 35.22, -97.44],
    ['48th Infantry Brigade Combat Team (GA ARNG)', 'Macon, GA', 32.84, -83.63],
    ['53rd Infantry Brigade Combat Team (FL ARNG)', 'Pinellas Park, FL', 27.84, -82.7],
    ['76th Infantry Brigade Combat Team (IN ARNG)', 'Indianapolis, IN', 39.77, -86.16],
    ['79th Infantry Brigade Combat Team (CA ARNG)', 'San Diego, CA', 32.9, -117.0],
    ['86th Infantry Brigade Combat Team (Mountain) (VT ARNG)', 'Jericho, VT', 44.5, -72.99],
    ['2nd Infantry Brigade Combat Team, 28th Infantry Division (PA ARNG)', 'Washington, PA', 40.17, -80.25],
    ['44th Infantry Brigade Combat Team (NJ ARNG)', 'Lawrenceville, NJ', 40.3, -74.73],
    ['116th Infantry Brigade Combat Team (VA ARNG)', 'Staunton, VA', 38.15, -79.07],
    ['2nd Infantry Brigade Combat Team, 34th Infantry Division (IA ARNG)', 'Boone, IA', 42.06, -93.88],
    ['72nd Infantry Brigade Combat Team (TX ARNG)', 'Houston, TX', 29.76, -95.37],
    ['56th Infantry Brigade Combat Team, 36th Infantry Division (TX ARNG)', 'Fort Worth, TX', 32.75, -97.33],
    ['256th Infantry Brigade Combat Team (LA ARNG)', 'Lafayette, LA', 30.22, -92.02],
  ] as const).map(([name, bname, lat, lon]) => u(name, 'maneuver', 'brigade', base(bname, lat, lon), US_IBCT, ARNG)),
  u('36th Combat Aviation Brigade (TX ARNG)', 'air_wing', 'brigade', base('Austin, TX', 30.27, -97.74), US_CAB, ARNG),
  u('Attack Reconnaissance Battalions, ARNG (1-130 NC, 1-211 UT, 1-149 TX, 1-285 AZ)', 'air_wing', 'brigade', base('Morrisville, NC', 35.82, -78.83), { ah64e: 72, truck: 60 }, ARNG),
  u('ARNG Combat Aviation Brigades lift aggregate (28th, 29th, 34th, 35th, 38th, 40th, 42nd)', 'air_wing', 'brigade', base('Fort Indiantown Gap, PA', 40.43, -76.58), { uh60m: 210, ch47f: 56, hh60m: 42 }, ARNG),
  u('45th Field Artillery Brigade (OK ARNG)', 'artillery', 'brigade', base('Altus, OK', 34.64, -99.33), US_HIMARS_BN, { ...ARNG, extraMagazine: { gmlrs: 432 } }),
  u('65th Field Artillery Brigade (UT ARNG)', 'artillery', 'brigade', base('Spanish Fork, UT', 40.11, -111.65), US_HIMARS_BN, { ...ARNG, extraMagazine: { gmlrs: 432 } }),
  u('115th Field Artillery Brigade (WY ARNG)', 'artillery', 'brigade', base('Cheyenne, WY', 41.14, -104.82), US_HIMARS_BN, { ...ARNG, extraMagazine: { gmlrs: 432 } }),
  u('130th Field Artillery Brigade (KS ARNG)', 'artillery', 'brigade', base('Manhattan, KS', 39.18, -96.57), US_HIMARS_BN, { ...ARNG, extraMagazine: { gmlrs: 432 } }),
  u('142nd Field Artillery Brigade (AR ARNG)', 'artillery', 'brigade', base('Fayetteville, AR', 36.06, -94.16), US_MLRS_BN, { ...ARNG, extraMagazine: { gmlrs: 432 } }),
  u('169th Field Artillery Brigade (CO ARNG)', 'artillery', 'brigade', base('Aurora, CO', 39.73, -104.83), US_HIMARS_BN, { ...ARNG, extraMagazine: { gmlrs: 432 } }),
  u('197th Field Artillery Brigade (NH ARNG)', 'artillery', 'brigade', base('Manchester, NH', 42.99, -71.46), US_HIMARS_BN, { ...ARNG, extraMagazine: { gmlrs: 432 } }),
  u('263rd Army Air and Missile Defense Command (SC ARNG, Avenger)', 'air_defense', 'brigade', base('Anderson, SC', 34.5, -82.65), { avenger: 72, truck: 100 }, ARNG),
];

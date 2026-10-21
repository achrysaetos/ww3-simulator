/*
 * US Navy surface, submarine and aviation forces, 2026 posture.
 * Sources: IISS Military Balance 2025 (11 CVN; 9 CG remaining after 2025-26 retirements;
 * 77 Arleigh Burke and 3 Zumwalt DDG; 49-50 SSN; 4 SSGN; 14 SSBN in usa-strategic.ts);
 * Naval Vessel Register and navy.mil homeport pages; USNI Fleet Tracker (2025) for
 * carrier / air wing pairing and maintenance status; CNAF air wing composition (four
 * strike fighter squadrons, one of them F-35C in transitioned wings; VAQ 5 EA-18G; VAW 5
 * E-2D; HSM 11 MH-60R; HSC 8 MH-60S; VRM det 3 CMV-22B). Escort assignment of one cruiser
 * and three destroyers per strike group is the standard plan; real groups vary.
 */
import { add, base, forNation, type Kit } from './build';

const u = forNation('USA', 'IISS Military Balance 2025; Naval Vessel Register; USNI Fleet Tracker 2025');

const sanDiego = base('Naval Base San Diego, CA', 32.68, -117.13);
const norfolk = base('Naval Station Norfolk, VA', 36.95, -76.33);
const yokosuka = base('Fleet Activities Yokosuka', 35.29, 139.67);
const everett = base('Naval Station Everett, WA', 47.99, -122.22);
const bremerton = base('Puget Sound Naval Shipyard, Bremerton', 47.56, -122.63);
const newportNews = base('Newport News Shipbuilding, VA', 36.98, -76.43);
const mayport = base('Naval Station Mayport, FL', 30.39, -81.42);
const pearl = base('Pearl Harbor, HI', 21.35, -157.95);
const rota = base('Naval Station Rota', 36.62, -6.33);
const groton = base('Naval Submarine Base New London, CT', 41.39, -72.09);
const apra = base('Joint Region Marianas, Guam', 13.44, 144.65);
const sasebo = base('Fleet Activities Sasebo', 33.16, 129.72);
const bahrain = base('NSA Bahrain', 26.21, 50.61);
const bangor = base('Naval Base Kitsap-Bangor, WA', 47.72, -122.71);
const kingsBay = base('Naval Submarine Base Kings Bay, GA', 30.8, -81.52);

const CVW: Kit = { fa18ef: 44, ea18g: 5, e2d: 5, mh60r: 11, mh60s: 8, cmv22b: 3 };
const CVW_F35C: Kit = { ...CVW, fa18ef: 34, f35c: 10 };
const csg = (carrier: Kit, wing: Kit, escorts: Kit): Kit => add(carrier, wing, { cg_ticonderoga: 1 }, escorts);
const CSG_P = (n: number) => ({ personnel: n });
const DEPLOYABLE = { readiness: 0.8 };

export const usaNavy = [
  // Carrier strike groups (carrier + embarked air wing + escorts)
  u('Carrier Strike Group 1 (Carl Vinson, CVW-2)', 'surface_group', 'task_group', sanDiego, csg({ cvn_nimitz: 1 }, CVW_F35C, { ddg_arleigh_burke_flt2a: 3 }), { ...DEPLOYABLE, ...CSG_P(7500) }),
  u('Carrier Strike Group 3 (Abraham Lincoln, CVW-9)', 'surface_group', 'task_group', sanDiego, csg({ cvn_nimitz: 1 }, CVW_F35C, { ddg_arleigh_burke_flt2a: 2, ddg_arleigh_burke_flt1: 1 }), { ...DEPLOYABLE, ...CSG_P(7500) }),
  u('Carrier Strike Group 9 (Theodore Roosevelt, CVW-11)', 'surface_group', 'task_group', sanDiego, csg({ cvn_nimitz: 1 }, CVW_F35C, { ddg_arleigh_burke_flt2a: 2, ddg_arleigh_burke_flt1: 1 }), { ...DEPLOYABLE, ...CSG_P(7500) }),
  u('Carrier Strike Group 5 (George Washington, CVW-5)', 'surface_group', 'task_group', yokosuka, csg({ cvn_nimitz: 1 }, CVW_F35C, { ddg_arleigh_burke_flt2a: 2, ddg_arleigh_burke_flt1: 1 }), { readiness: 0.9, personnel: 7500 }),
  u('Carrier Strike Group 11 (Nimitz, CVW-17)', 'surface_group', 'task_group', norfolk, csg({ cvn_nimitz: 1 }, CVW, { ddg_arleigh_burke_flt2a: 2, ddg_arleigh_burke_flt1: 1 }), { readiness: 0.5, personnel: 7500 }),
  u('Carrier Strike Group 12 (Gerald R. Ford, CVW-8)', 'surface_group', 'task_group', norfolk, csg({ cvn_ford: 1 }, CVW, { ddg_arleigh_burke_flt2a: 2, ddg_arleigh_burke_flt3: 1 }), { ...DEPLOYABLE, ...CSG_P(7300) }),
  u('Carrier Strike Group 2 (George H.W. Bush, CVW-7)', 'surface_group', 'task_group', norfolk, csg({ cvn_nimitz: 1 }, CVW, { ddg_arleigh_burke_flt2a: 2, ddg_arleigh_burke_flt1: 1 }), { ...DEPLOYABLE, ...CSG_P(7500) }),
  u('Carrier Strike Group 8 (Dwight D. Eisenhower, CVW-3)', 'surface_group', 'task_group', norfolk, csg({ cvn_nimitz: 1 }, CVW, { ddg_arleigh_burke_flt2a: 2, ddg_arleigh_burke_flt1: 1 }), { readiness: 0.4, personnel: 7500 }),
  u('Carrier Strike Group 10 (Harry S. Truman, CVW-1)', 'surface_group', 'task_group', norfolk, csg({ cvn_nimitz: 1 }, CVW, { ddg_arleigh_burke_flt2a: 2, ddg_arleigh_burke_flt1: 1 }), { readiness: 0.6, personnel: 7500 }),
  u('USS Ronald Reagan (CVN-76) in maintenance', 'surface_group', 'task_group', bremerton, { cvn_nimitz: 1 }, { readiness: 0.2, personnel: 3000 }),
  u('USS John C. Stennis (CVN-74) in refueling overhaul', 'surface_group', 'task_group', newportNews, { cvn_nimitz: 1 }, { readiness: 0.05, personnel: 2000 }),

  // Destroyer squadrons not assigned to a strike group
  u('Destroyer Squadron 15 (Forward Deployed Naval Forces Japan)', 'surface_group', 'flotilla', yokosuka, { ddg_arleigh_burke_flt1: 4, ddg_arleigh_burke_flt2a: 4 }, { readiness: 0.9, personnel: 8 * 320 }),
  u('Destroyer Squadron 60 (Forward Deployed Naval Forces Europe)', 'surface_group', 'flotilla', rota, { ddg_arleigh_burke_flt1: 2, ddg_arleigh_burke_flt2a: 3 }, { readiness: 0.9, personnel: 5 * 320 }),
  u('Destroyer Squadron 31', 'surface_group', 'flotilla', pearl, { ddg_arleigh_burke_flt1: 4, ddg_arleigh_burke_flt2a: 3 }, { readiness: 0.75, personnel: 7 * 320 }),
  u('Naval Surface Group Southwest destroyers (DESRON 1, 21, 23)', 'surface_group', 'flotilla', sanDiego, { ddg_arleigh_burke_flt1: 3, ddg_arleigh_burke_flt2a: 6, ddg_arleigh_burke_flt3: 1, ddg_zumwalt: 3 }, { readiness: 0.7, personnel: 13 * 320 }),
  u('Destroyer Squadron 9', 'surface_group', 'flotilla', everett, { ddg_arleigh_burke_flt2a: 4 }, { readiness: 0.75, personnel: 4 * 320 }),
  u('Naval Surface Force Atlantic destroyers (DESRON 2, 22, 26, 28)', 'surface_group', 'flotilla', norfolk, { ddg_arleigh_burke_flt1: 5, ddg_arleigh_burke_flt2a: 5, ddg_arleigh_burke_flt3: 1 }, { readiness: 0.7, personnel: 11 * 320 }),
  u('Destroyer Squadron 14', 'surface_group', 'flotilla', mayport, { ddg_arleigh_burke_flt1: 3, ddg_arleigh_burke_flt2a: 2 }, { readiness: 0.75, personnel: 5 * 320 }),

  // Littoral combat ships
  u('Littoral Combat Ship Squadron Two', 'surface_group', 'flotilla', mayport, { lcs_freedom: 8 }, { readiness: 0.6, personnel: 8 * 100 }),
  u('Littoral Combat Ship Squadron One', 'surface_group', 'flotilla', sanDiego, { lcs_independence: 11 }, { readiness: 0.6, personnel: 11 * 100 }),
  u('Commander Task Force 55 (5th Fleet mine countermeasures LCS)', 'surface_group', 'flotilla', bahrain, { lcs_mcm: 4 }, { readiness: 0.75, personnel: 4 * 100 }),

  // Amphibious forces (the embarked Marine units are in usa-marines.ts)
  u('Amphibious Squadron 11 (Forward Deployed, Sasebo)', 'surface_group', 'task_group', sasebo, { lha_america: 1, lpd_san_antonio: 2, lsd_whidbey_island: 1 }, { readiness: 0.85, personnel: 2800 }),
  u('Expeditionary Strike Group 3 amphibious ships', 'surface_group', 'task_group', sanDiego, { lha_america: 1, lhd_wasp: 3, lpd_san_antonio: 6, lsd_whidbey_island: 3 }, { readiness: 0.65, personnel: 9000 }),
  u('Expeditionary Strike Group 2 amphibious ships', 'surface_group', 'task_group', norfolk, { lhd_wasp: 4, lpd_san_antonio: 5, lsd_whidbey_island: 4 }, { readiness: 0.65, personnel: 9500 }),

  // Strategic sealift for the Army's heavy forces: vehicles and cargo sail, troops fly. MSC surge
  // sealift keeps about 15 LMSRs in Reduced Operating Status; MARAD's Ready Reserve Force holds
  // about 40 ships, mostly RO-RO, at 5-10 days' notice, and GAO found its 2019 activation reached
  // only ~40% readiness (MSC fact sheets; MARAD RRF; GAO-20-536). An RRF RO-RO has roughly half an
  // LMSR's deck, so the RRF appears as LMSR equivalents.
  u('MSC surge sealift, Atlantic and Gulf (LMSR)', 'surface_group', 'task_group', base('Charleston, SC', 32.78, -79.93), { lmsr: 10 }, { readiness: 0.8, personnel: 10 * 30 }),
  u('MSC surge sealift, Pacific (LMSR)', 'surface_group', 'task_group', sanDiego, { lmsr: 5 }, { readiness: 0.8, personnel: 5 * 30 }),
  u('Ready Reserve Force RO-RO, Atlantic and Gulf (LMSR equivalents)', 'surface_group', 'task_group', base('Port Arthur and Beaumont, TX', 29.6, -93.8), { lmsr: 12 }, { readiness: 0.5, personnel: 12 * 30 }),
  u('Ready Reserve Force RO-RO, Pacific (LMSR equivalents)', 'surface_group', 'task_group', base('Alameda, CA', 37.77, -122.3), { lmsr: 5 }, { readiness: 0.5, personnel: 5 * 30 }),

  // Combat logistics force
  u('Military Sealift Command combat logistics force (Atlantic)', 'logistics', 'task_group', norfolk, { t_ao: 8, t_ake: 6 }, { readiness: 0.8, personnel: 1800 }),
  u('Military Sealift Command combat logistics force (Pacific)', 'logistics', 'task_group', sanDiego, { t_ao: 8, t_ake: 8 }, { readiness: 0.8, personnel: 2000 }),

  // Attack and guided-missile submarines
  u('Submarine Squadron 4', 'submarine', 'flotilla', groton, { ssn_virginia: 6, ssn_los_angeles: 3 }, { readiness: 0.7, personnel: 9 * 135 }),
  u('Submarine Squadron 12', 'submarine', 'flotilla', groton, { ssn_virginia: 6, ssn_los_angeles: 2 }, { readiness: 0.7, personnel: 8 * 135 }),
  u('Submarine Squadron 6', 'submarine', 'flotilla', norfolk, { ssn_virginia: 4, ssn_los_angeles: 4 }, { readiness: 0.7, personnel: 8 * 135 }),
  u('Submarine Squadron 1', 'submarine', 'flotilla', pearl, { ssn_virginia: 3, ssn_los_angeles: 4 }, { readiness: 0.7, personnel: 7 * 135 }),
  u('Submarine Squadron 7', 'submarine', 'flotilla', pearl, { ssn_virginia: 4, ssn_los_angeles: 3 }, { readiness: 0.7, personnel: 7 * 135 }),
  u('Submarine Squadron 15', 'submarine', 'flotilla', apra, { ssn_los_angeles: 5 }, { readiness: 0.85, personnel: 5 * 135 }),
  u('Submarine Squadron 11', 'submarine', 'flotilla', sanDiego, { ssn_virginia: 2, ssn_los_angeles: 1 }, { readiness: 0.7, personnel: 3 * 135 }),
  u('Submarine Development Squadron 5 (Seawolf class)', 'submarine', 'flotilla', bangor, { ssn_seawolf: 3 }, { readiness: 0.7, personnel: 3 * 140 }),
  u('Submarine Squadron 19 guided-missile submarines', 'submarine', 'flotilla', bangor, { ssgn_ohio: 2 }, { readiness: 0.75, personnel: 2 * 160 }),
  u('Submarine Squadron 16 guided-missile submarines', 'submarine', 'flotilla', kingsBay, { ssgn_ohio: 2 }, { readiness: 0.75, personnel: 2 * 160 }),

  // Shore-based naval aviation
  u('Strike Fighter Wing Atlantic (VFA-106 fleet replacement squadron)', 'air_wing', 'wing', base('NAS Oceana, VA', 36.82, -76.03), { fa18ef: 50 }, { readiness: 0.5 }),
  u('Strike Fighter Wing Pacific (VFA-122 and VFA-125 fleet replacement squadrons)', 'air_wing', 'wing', base('NAS Lemoore, CA', 36.33, -119.95), { fa18ef: 45, f35c: 30 }, { readiness: 0.5 }),
  u('Electronic Attack Wing Pacific (VAQ-129 and expeditionary squadrons)', 'air_wing', 'wing', base('NAS Whidbey Island, WA', 48.35, -122.65), { ea18g: 60 }, { readiness: 0.75 }),
  u('Naval Aviation Warfighting Development Center', 'air_wing', 'wing', base('NAS Fallon, NV', 39.42, -118.7), { fa18ef: 20 }, { readiness: 0.6 }),
  u('Air Test and Evaluation Squadrons VX-9 and VX-23', 'air_wing', 'squadron', base('NAWS China Lake, CA', 35.69, -117.69), { fa18ef: 10, f35c: 6, ea18g: 4 }, { readiness: 0.4 }),
  u('Patrol and Reconnaissance Wing 11', 'air_wing', 'wing', base('NAS Jacksonville, FL', 30.24, -81.68), { p8a: 50, mq4c: 4 }, { readiness: 0.8 }),
  u('Patrol and Reconnaissance Wing 10', 'air_wing', 'wing', base('NAS Whidbey Island, WA', 48.35, -122.65), { p8a: 50 }, { readiness: 0.8 }),
  u('Unmanned Patrol Squadron 19 (Guam detachment)', 'air_wing', 'squadron', base('Andersen AFB, Guam', 13.58, 144.93), { mq4c: 4 }, { readiness: 0.8 }),
];

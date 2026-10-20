// Sources: IISS Military Balance 2025 (Australia); Defence Strategic Review 2023 (brigade
// roles); RAN and RAAF unit pages. Vehicle splits between brigades are estimates.
import { base, nation } from './build';

const u = nation('AUS', 'IISS Military Balance 2025; Defence Strategic Review 2023', { readiness: 0.85, experience: 0.5 });

export const australia = [
  u('maneuver', 'brigade', '3rd Brigade (Armoured)', base('Lavarack Barracks, Townsville', -19.3, 146.77), { m1a1: 30, boxer_crv: 40, m113as4: 120, bushmaster: 100, m777: 18, infantry_squad: 60, truck: 400 }, { personnel: 4500 }),
  u('maneuver', 'brigade', '1st Brigade', base('Robertson Barracks, Darwin', -12.44, 130.97), { m1a1: 15, boxer_crv: 30, m113as4: 80, bushmaster: 100, m777: 18, infantry_squad: 60, truck: 350 }, { personnel: 4000 }),
  u('maneuver', 'brigade', '7th Brigade', base('Gallipoli Barracks, Brisbane', -27.4, 152.95), { m1a1: 14, boxer_crv: 30, m113as4: 80, bushmaster: 120, m777: 18, infantry_squad: 70, truck: 350 }, { personnel: 4000 }),
  u('artillery', 'brigade', '10th Brigade (Fires)', base('Edinburgh, Adelaide', -34.71, 138.62), { himars: 12, nasams: 6, rbs70: 30, truck: 120 }, { personnel: 1500 }),
  u('maneuver', 'division', '2nd Division (Reserve)', base('Randwick, Sydney', -33.91, 151.24), { bushmaster: 150, infantry_squad: 200, truck: 300 }, { personnel: 8000, readiness: 0.5 }),
  u('maneuver', 'brigade', 'Special Operations Command', base('Holsworthy, Sydney', -33.99, 150.95), { infantry_squad: 100, bushmaster: 40, truck: 80 }, { personnel: 2500, readiness: 0.95, experience: 0.8 }),
  u('air_wing', 'brigade', '16th Aviation Brigade', base('Townsville', -19.25, 146.77), { ah64e: 12, tiger_arh: 18, uh60m: 40, ch47f: 14 }),

  u('air_wing', 'wing', '81 Wing (F-35A)', base('RAAF Williamtown', -32.79, 151.83), { f35a: 48, e7a: 6 }),
  u('air_wing', 'squadron', '75 Squadron', base('RAAF Tindal', -14.52, 132.38), { f35a: 24 }),
  u('air_wing', 'wing', '82 Wing (Super Hornet/Growler)', base('RAAF Amberley', -27.64, 152.71), { fa18f: 24, ea18g: 11, kc30a: 7, c17: 8 }),
  u('air_wing', 'wing', '92 Wing (Maritime Patrol)', base('RAAF Edinburgh', -34.7, 138.62), { p8a: 14, mq4c: 2 }),

  u('surface_group', 'flotilla', 'Fleet Base East Surface Group', base('Garden Island, Sydney', -33.86, 151.23), { hobart: 3, anzac: 3, canberra_lhd: 2, choules_lsd: 1, supply_aor: 2 }),
  u('surface_group', 'flotilla', 'Fleet Base West Surface Group', base('HMAS Stirling', -32.24, 115.69), { anzac: 3, huon_mcm: 2 }),
  u('surface_group', 'flotilla', 'Patrol Forces', base('HMAS Coonawarra, Darwin', -12.44, 130.86), { arafura_opv: 3, cape_patrol: 8 }),
  u('submarine', 'flotilla', 'Submarine Force', base('HMAS Stirling', -32.24, 115.69), { collins: 6 }),
  u('air_wing', 'wing', 'Fleet Air Arm', base('HMAS Albatross, Nowra', -34.95, 150.54), { mh60r: 24 }),
];

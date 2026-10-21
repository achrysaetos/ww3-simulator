/*
 * United Kingdom, 2025-26.
 * Sources: IISS Military Balance 2025 (213 Challenger 2; ~110 Typhoon FGR4 in front-line
 * and OCU use; F-35B; 6 Type 45; 8 Type 23 after retirements; 6 SSN; 4 SSBN); British Army
 * "Future Soldier" (2021) brigade structure; UK MoD Strategic Defence Review 2025; Royal Navy
 * and RAF station pages. Challenger 3 conversion pipeline counts at RBSL Telford are an
 * estimate from the 148-vehicle programme schedule. UK warheads: FAS Nuclear Notebook 2024.
 */
import { add, base, forNation } from './build';

const u = forNation('GBR', 'IISS Military Balance 2025; British Army Future Soldier; UK MoD SDR 2025');

const bulford = base('Bulford Camp', 51.19, -1.75);
const tidworth = base('Tidworth Camp', 51.24, -1.66);
const catterick = base('Catterick Garrison', 54.37, -1.71);
const larkhill = base('Larkhill Garrison', 51.2, -1.81);
const colchester = base('Colchester Garrison', 51.88, 0.9);
const portsmouth = base('HMNB Portsmouth', 50.8, -1.11);
const devonport = base('HMNB Devonport', 50.38, -4.18);
const faslane = base('HMNB Clyde, Faslane', 56.07, -4.82);
const lossiemouth = base('RAF Lossiemouth', 57.71, -3.34);
const coningsby = base('RAF Coningsby', 53.09, -0.17);

const ACTIVE = { readiness: 0.75 };
const ARMOURED_INF_BN = { warrior_ifv: 44, infantry_squad: 30 };
const LIGHT_BN = { foxhound: 50, jackal: 20, infantry_squad: 27 };

export const gbr = [
  // 3rd (UK) Division
  u('12th Armoured Brigade Combat Team', 'maneuver', 'brigade', bulford, add({ challenger2: 56, ajax: 40, truck: 350 }, ARMOURED_INF_BN, ARMOURED_INF_BN), { ...ACTIVE, personnel: 5000 }),
  u('20th Armoured Brigade Combat Team', 'maneuver', 'brigade', tidworth, add({ challenger2: 42, ajax: 40, truck: 350 }, ARMOURED_INF_BN), { ...ACTIVE, personnel: 4500 }),
  u('1st Deep Recce Strike Brigade Combat Team', 'artillery', 'brigade', larkhill, { m270a2: 26, archer: 14, ajax: 50, truck: 300 }, { ...ACTIVE, personnel: 3500, extraMagazine: { gmlrs: 600 } }),
  u('7 Air Defence Group', 'air_defense', 'brigade', base('Baker Barracks, Thorney Island', 50.81, -0.92), { camm_launcher: 24, stinger_team: 30, truck: 100 }, { ...ACTIVE, personnel: 1500 }),
  u('Royal Wessex Yeomanry (reserve armour)', 'maneuver', 'battalion', base('Bovington Camp', 50.69, -2.24), { challenger2: 20 }, { readiness: 0.4, personnel: 450 }),
  u('Challenger 3 conversion pipeline (RBSL Telford)', 'logistics', 'battalion', base('Telford', 52.68, -2.45), { challenger2: 66, challenger3: 8 }, { readiness: 0.1, personnel: 200 }),
  u('Operation Cabrit Battlegroup (eFP Estonia)', 'maneuver', 'battalion', base('Tapa Army Base', 59.26, 25.96), add({ challenger2: 14 }, ARMOURED_INF_BN), { readiness: 0.9, personnel: 900 }),

  // 1st (UK) Division
  u('7th Light Mechanised Brigade Combat Team', 'maneuver', 'brigade', base('Kendrew Barracks, Cottesmore', 52.73, -0.65), add(LIGHT_BN, LIGHT_BN, LIGHT_BN, { l118: 18, truck: 300 }), { readiness: 0.7, personnel: 4500 }),
  u('4th Light Brigade Combat Team', 'maneuver', 'brigade', catterick, add(LIGHT_BN, LIGHT_BN, { l118: 12, truck: 250 }), { readiness: 0.65, personnel: 3500 }),
  u('11th Security Force Assistance Brigade', 'maneuver', 'brigade', base('Aldershot Garrison', 51.25, -0.76), { infantry_squad: 30, foxhound: 40 }, { readiness: 0.6, personnel: 1500 }),

  // Global Response Force
  u('16 Air Assault Brigade Combat Team', 'maneuver', 'brigade', colchester, { infantry_squad: 60, jackal: 30, l118: 18, truck: 200 }, { readiness: 0.85, personnel: 4500 }),
  u('3 Commando Brigade, Royal Marines', 'maneuver', 'brigade', base('Stonehouse Barracks, Plymouth', 50.37, -4.16), { infantry_squad: 72, l118: 18, truck: 200 }, { readiness: 0.85, personnel: 4000 }),
  u('1st Aviation Brigade Combat Team', 'air_wing', 'brigade', base('Wattisham Flying Station', 52.13, 0.96), { ah64e: 50, wildcat: 34 }, { readiness: 0.75, personnel: 2500 }),
  u('Joint Helicopter Command Chinook Wing', 'air_wing', 'wing', base('RAF Odiham', 51.23, -0.94), { ch47f: 60 }, ACTIVE),

  // Royal Air Force
  u('RAF Coningsby Typhoon Force (3, XI, 12, 29, 41 Squadrons)', 'air_wing', 'wing', coningsby, { typhoon: 60 }, ACTIVE),
  u('RAF Lossiemouth Typhoon Force (1, II, 6, IX Squadrons)', 'air_wing', 'wing', lossiemouth, { typhoon: 48 }, ACTIVE),
  u('RAF Lossiemouth maritime and AEW wing (120, 201 and 8 Squadrons)', 'air_wing', 'wing', lossiemouth, { p8a: 9, e7a: 3 }, ACTIVE),
  u('Lightning Force (617 Sqn, 809 NAS, 207 OCU)', 'air_wing', 'wing', base('RAF Marham', 52.65, 0.55), { f35b: 40 }, ACTIVE),
  u('1435 Flight', 'air_wing', 'squadron', base('RAF Mount Pleasant, Falklands', -51.82, -58.45), { typhoon: 4, camm_launcher: 4 }, { readiness: 0.9, personnel: 600 }),
  u('RAF Brize Norton air mobility wing', 'logistics', 'wing', base('RAF Brize Norton', 51.75, -1.58), { a330_mrtt: 14, a400m: 22, c17a: 8 }, ACTIVE),
  u('RAF Waddington ISTAR wing', 'air_wing', 'wing', base('RAF Waddington', 53.17, -0.52), { rc135: 3, mq9b: 10 }, ACTIVE),
  u('British Forces Cyprus (RAF Akrotiri)', 'air_wing', 'wing', base('RAF Akrotiri, Cyprus', 34.59, 32.99), { truck: 50 }, { readiness: 0.9, personnel: 2000 }),

  // Royal Navy
  u('UK Carrier Strike Group (HMS Prince of Wales)', 'surface_group', 'task_group', portsmouth, { cv_queen_elizabeth: 1, ddg_type45: 2, ffg_type23: 2, tide_tanker: 1, merlin: 14 }, { readiness: 0.75, personnel: 2400 }),
  u('HMS Queen Elizabeth (refit)', 'surface_group', 'task_group', base('Rosyth Dockyard', 56.02, -3.45), { cv_queen_elizabeth: 1 }, { readiness: 0.15, personnel: 700 }),
  u('Portsmouth Flotilla destroyers', 'surface_group', 'flotilla', portsmouth, { ddg_type45: 4 }, { readiness: 0.5, personnel: 4 * 190 }),
  u('Devonport Flotilla frigates', 'surface_group', 'flotilla', devonport, { ffg_type23: 4, merlin: 10 }, { readiness: 0.65, personnel: 4 * 185 }),
  u('Northern Waters frigates (Type 23 TAS)', 'surface_group', 'flotilla', base('HMNB Clyde, Faslane', 56.07, -4.82), { ffg_type23: 2, wildcat: 6 }, { readiness: 0.7, personnel: 2 * 185 }),
  // Four Point-class RO-RO under the MoD's strategic sealift contract (Foreland Shipping); two sail on charter, two lie at reduced readiness.
  u('Strategic Sealift Service (Point class)', 'surface_group', 'task_group', base('Marchwood Military Port', 50.89, -1.44), { military_roro: 4 }, { readiness: 0.6, personnel: 4 * 20 }),
  u('Royal Fleet Auxiliary tankers', 'logistics', 'task_group', base('Marchwood', 50.9, -1.44), { tide_tanker: 3 }, { readiness: 0.6, personnel: 400 }),
  u('Faslane Flotilla attack submarines', 'submarine', 'flotilla', faslane, { ssn_astute: 5, ssn_trafalgar: 1 }, { readiness: 0.6, personnel: 6 * 98 }),
  u('Continuous At-Sea Deterrent patrol (Vanguard class)', 'strategic', 'flotilla', base('North Atlantic patrol area', 58, -20), { ssbn_vanguard: 1 }, { readiness: 1, personnel: 135 }),
  u('Faslane Flotilla ballistic missile submarines in port', 'strategic', 'flotilla', faslane, { ssbn_vanguard: 3 }, { readiness: 0.4, personnel: 3 * 135 }),
];

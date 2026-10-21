/*
 * Greece, 2025-26.
 * Sources: IISS Military Balance 2025 (MBT ~1,228: 170 Leopard 2A6HEL, 353 Leopard 2A4,
 * ~500 Leopard 1A4/1A5, ~205 M48A5MOLF; F-16 Block 30/50/52+ incl. F-16V upgrades, 24 Rafale,
 * ~24 Mirage 2000-5; F-4E retired 2024; 4 Hydra, ~8 Elli, 1 FDI Kimon; 4 Type 214 + 7 Type 209);
 * army.gr, haf.gr and hellenicnavy.gr unit pages. Brigade allocation of Leopard 1 and M48
 * fleets is an estimate from published brigade types.
 */
import { add, base, forNation } from './build';

const u = forNation('GRC', 'IISS Military Balance 2025; Hellenic MoD unit pages');

const ACTIVE = { readiness: 0.6 };
const MECH_BDE = { leopard1a5: 100, bmp1: 60, m113: 60, m109a5: 18, infantry_squad: 36, truck: 250 };
const ARMD_BDE = { m113: 60, m109a5: 18, infantry_squad: 18, truck: 250 };
const ISLAND = (m48: number) => ({ m48a5: m48, m113: 30, m110a2: 6, infantry_squad: 27, truck: 80 });

export const grc = [
  u('25th Armoured Brigade', 'maneuver', 'brigade', base('Stefanoviki', 39.42, 22.69), add(ARMD_BDE, { leopard2a6: 170 }), { ...ACTIVE, personnel: 3500 }),
  u('21st Armoured Brigade', 'maneuver', 'brigade', base('Komotini', 41.12, 25.4), add(ARMD_BDE, { leopard2a4: 120 }), { ...ACTIVE, personnel: 3000 }),
  u('23rd Armoured Brigade', 'maneuver', 'brigade', base('Polykastro', 40.99, 22.57), add(ARMD_BDE, { leopard2a4: 120 }), { ...ACTIVE, personnel: 3000 }),
  u('24th Armoured Brigade', 'maneuver', 'brigade', base('Litochoro', 40.1, 22.5), add(ARMD_BDE, { leopard2a4: 113 }), { ...ACTIVE, personnel: 3000 }),
  u('7th Mechanized Brigade', 'maneuver', 'brigade', base('Sapes', 41.02, 25.7), MECH_BDE, { ...ACTIVE, personnel: 3000 }),
  u('30th Mechanized Brigade', 'maneuver', 'brigade', base('Didymoteicho', 41.35, 26.5), MECH_BDE, { ...ACTIVE, personnel: 3000 }),
  u('31st Mechanized Brigade', 'maneuver', 'brigade', base('Feres', 40.9, 26.17), MECH_BDE, { ...ACTIVE, personnel: 3000 }),
  u('33rd Mechanized Brigade', 'maneuver', 'brigade', base('Kilkis', 41.0, 22.87), MECH_BDE, { ...ACTIVE, personnel: 3000 }),
  u('34th Mechanized Brigade', 'maneuver', 'brigade', base('Kozani', 40.3, 21.79), MECH_BDE, { ...ACTIVE, personnel: 3000 }),
  u('95th Higher Military Command of the Dodecanese', 'maneuver', 'brigade', base('Rhodes', 36.4, 28.1), ISLAND(60), { readiness: 0.7, personnel: 3500 }),
  u('98th Higher Military Command (Lesbos)', 'maneuver', 'brigade', base('Mytilene, Lesbos', 39.1, 26.5), ISLAND(40), { readiness: 0.7, personnel: 3000 }),
  u('79th Higher Military Command (Samos)', 'maneuver', 'brigade', base('Samos', 37.75, 26.95), ISLAND(40), { readiness: 0.7, personnel: 2500 }),
  u('80th Higher Military Command (Kos)', 'maneuver', 'brigade', base('Kos', 36.85, 27.15), ISLAND(25), { readiness: 0.7, personnel: 2000 }),
  u('88th Military Command (Lemnos)', 'maneuver', 'brigade', base('Lemnos', 39.9, 25.2), ISLAND(40), { readiness: 0.7, personnel: 2500 }),
  u('71st Airmobile Brigade', 'maneuver', 'brigade', base('Nea Santa, Kilkis', 40.85, 22.87), { infantry_squad: 54, ah64d: 28, ch47f: 15, truck: 150 }, { ...ACTIVE, personnel: 3500 }),
  u('32nd Marine Brigade', 'maneuver', 'brigade', base('Volos', 39.36, 22.94), { infantry_squad: 54, m113: 40, truck: 100 }, { ...ACTIVE, personnel: 2500 }),
  u('Army artillery (MLRS and M110)', 'artillery', 'brigade', base('Thessaloniki', 40.64, 22.94), { m270a1: 36, m110a2: 60, m109a5: 30 }, { ...ACTIVE, personnel: 3000, extraMagazine: { atacms: 40 } }),
  u('Hellenic Air Force Patriot wing', 'air_defense', 'wing', base('Tanagra', 38.34, 23.56), { patriot_pac3: 36 }, { ...ACTIVE, personnel: 1500 }),

  u('110th Combat Wing', 'air_wing', 'wing', base('Larissa', 39.65, 22.47), { f16_blk70: 40 }, ACTIVE),
  u('111th Combat Wing', 'air_wing', 'wing', base('Nea Anchialos', 39.22, 22.79), { f16c: 40 }, ACTIVE),
  u('114th Combat Wing', 'air_wing', 'wing', base('Tanagra', 38.34, 23.56), { mirage2000_5: 24, rafale_c: 24 }, ACTIVE),
  u('115th Combat Wing', 'air_wing', 'wing', base('Souda Bay, Crete', 35.53, 24.15), { f16_blk70: 36 }, ACTIVE),
  u('116th Combat Wing', 'air_wing', 'wing', base('Araxos', 38.15, 21.42), { f16c: 30 }, ACTIVE),

  u('Frigate Command', 'surface_group', 'flotilla', base('Salamis Naval Base', 37.95, 23.53), { ffg_hydra: 4, ffg_elli: 8, ffg_fdi: 1 }, { readiness: 0.65, personnel: 13 * 180 }),
  u('Submarine Command', 'submarine', 'flotilla', base('Salamis Naval Base', 37.95, 23.53), { ssk_type214: 4, ssk_type209: 7 }, { readiness: 0.6, personnel: 11 * 35 }),
];

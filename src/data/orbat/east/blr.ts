import type { OrbatEntry } from '../types';
import { at, merge, mix, unit, type Base, type Kit } from './build';

/*
 * Belarus, 2025. IISS Military Balance 2025: ~500 T-72B/B3 MBT, ~58 combat-capable aircraft,
 * Iskander-M and Polonez delivered 2022-2023. Brigade garrisons are the long-standing ones.
 * Russian non-strategic nuclear weapons stored in Belarus since 2023 are not modelled here.
 */

const BLR = 'BLR';
const BAF = { readiness: 0.6, experience: 0.2 };

const MECH_BDE: Kit = merge(mix(120, { t72b3: 0.6, t72b: 0.4 }), { bmp2: 100, btr82a: 30, '2s19_msta': 18, '2s3': 18, bm21_grad: 18, strela10: 6, infantry_squad: 120, truck: 450 });
const AIRMOBILE_BDE: Kit = { btr82a: 60, bmd2: 20, '2s9': 12, d30: 12, infantry_squad: 110, truck: 200 };
const bde = (name: string, base: Base, kit: Kit, kind: OrbatEntry['kind'] = 'maneuver', personnel?: number): OrbatEntry => unit(BLR, name, kind, 'brigade', base, kit, personnel ? { ...BAF, personnel } : BAF);
/** IISS 2025: Army ~11,700 and Special Operations Forces ~5,900 active; brigades keep cadres filled on mobilisation. */
const MECH_PERSONNEL = 3000, AIRMOBILE_PERSONNEL = 2500;

export const blr: OrbatEntry[] = [
  bde('6th Guards Mechanised Brigade', at('Grodno', 53.68, 24.1), MECH_BDE, 'maneuver', MECH_PERSONNEL),
  bde('11th Guards Mechanised Brigade', at('Slonim', 53.09, 25.32), MECH_BDE, 'maneuver', MECH_PERSONNEL),
  bde('19th Guards Mechanised Brigade', at('Zaslonovo', 54.8, 29.0), MECH_BDE, 'maneuver', MECH_PERSONNEL),
  bde('120th Guards Mechanised Brigade', at('Uruchye, Minsk', 53.95, 27.68), MECH_BDE, 'maneuver', MECH_PERSONNEL),
  { ...bde('38th Guards Air Assault Brigade', at('Brest', 52.1, 24.1), AIRMOBILE_BDE, 'maneuver', AIRMOBILE_PERSONNEL), airborne: true },
  { ...bde('103rd Guards Airborne Brigade', at('Vitebsk', 55.19, 30.2), AIRMOBILE_BDE, 'maneuver', AIRMOBILE_PERSONNEL), airborne: true },
  bde('5th Spetsnaz Brigade', at('Maryina Gorka', 53.5, 28.15), { infantry_squad: 80, truck: 60 }),
  bde('51st Guards Artillery Brigade', at('Asipovichy', 53.3, 28.65), { '2s19_msta': 18, '2s7m': 12, '2a65': 18, bm27: 12, truck: 200 }, 'artillery'),
  bde('336th Rocket Artillery Brigade', at('Asipovichy rocket range', 53.32, 28.55), { polonez_launcher: 12, bm30: 6, truck: 80 }, 'artillery'),
  bde('465th Missile Brigade', at('Tsel, Asipovichy', 53.25, 28.75), { iskander_m_tel: 4, truck: 30 }, 'missile'),
  bde('15th Anti-Aircraft Missile Brigade', at('Gatovo', 53.83, 27.5), { s300pm_launcher: 12, s400_launcher: 8, truck: 50 }, 'air_defense'),
  bde('120th Anti-Aircraft Missile Brigade', at('Baranovichi AD', 53.15, 26.05), { tor_m2: 12, buk_m2: 12, truck: 50 }, 'air_defense'),
  bde('1146th Anti-Aircraft Missile Regiment', at('Brest AD', 52.12, 24.1), { s300pm_launcher: 12, truck: 30 }, 'air_defense'),
  unit(BLR, '61st Fighter Air Base', 'air_wing', 'wing', at('Baranovichi', 53.11, 26.0), { mig29: 30, su30sm: 8 }, BAF),
  unit(BLR, '116th Guards Assault Air Base', 'air_wing', 'wing', at('Lida', 53.88, 25.36), { su25: 20, yak130: 12 }, BAF),
  unit(BLR, '50th Mixed Air Base', 'air_wing', 'wing', at('Machulishchy', 53.77, 27.58), { il76: 2, mi8amtsh: 12 }, BAF),
  unit(BLR, '181st Helicopter Air Base', 'air_wing', 'wing', at('Pruzhany', 52.55, 24.47), { mi24p: 12, mi8amtsh: 16 }, BAF),
];

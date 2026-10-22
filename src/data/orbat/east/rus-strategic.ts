import type { OrbatEntry } from '../types';
import { at, unit, type Base, type Kit } from './build';

/*
 * Strategic Rocket Forces divisions, 2025. Launcher counts per FAS Nuclear Notebook,
 * "Russian nuclear weapons, 2025" (Kristensen, Korda et al.), which puts deployed ICBMs
 * near 330. Sarmat is not modelled as deployed: FAS found no evidence of a Sarmat regiment
 * on combat duty, and the September 2024 Plesetsk test ended in a silo explosion.
 * The bombers and SSBNs live in rus-aerospace.ts and rus-navy.ts.
 *
 * Magazines count reentry vehicles, and a launcher's standard load is one, so MIRV loads beyond
 * the first go in extraMagazine. FAS (2025) puts about 870 warheads on Russian ICBMs: the R-36M2
 * carries 10, Yars up to 4 but is assessed downloaded to about 2 on average to meet New START,
 * Topol-M and Avangard 1 each.
 */

const RUS = 'RUS';
const SRF = { readiness: 0.85, experience: 0.5 };
/** Reentry vehicles beyond the first, per launcher: the munition and how many. */
const MIRV: Record<string, [munition: string, extra: number]> = { yars_mobile: ['yars', 1], yars_silo: ['yars', 1], r36m2_silo: ['r36m2', 9] };
const div = (name: string, base: Base, equipment: Kit): OrbatEntry => {
  const extraMagazine: Kit = {};
  for (const [launcher, n] of Object.entries(equipment)) {
    const mirv = MIRV[launcher];
    if (mirv) extraMagazine[mirv[0]] = (extraMagazine[mirv[0]] ?? 0) + n * mirv[1];
  }
  return unit(RUS, name, 'strategic', 'division', base, equipment, { ...SRF, extraMagazine });
};

const srf: OrbatEntry[] = [
  div('54th Guards Missile Division', at('Teykovo', 56.86, 40.53), { yars_mobile: 18, topol_m_mobile: 18 }),
  div('14th Missile Division', at('Yoshkar-Ola', 56.64, 47.9), { yars_mobile: 27 }),
  div('39th Guards Missile Division', at('Novosibirsk (Pashino)', 55.15, 83.0), { yars_mobile: 27 }),
  div('29th Guards Missile Division', at('Irkutsk', 52.29, 104.3), { yars_mobile: 27 }),
  div('42nd Missile Division', at('Nizhny Tagil (Svobodny)', 57.95, 60.15), { yars_mobile: 27 }),
  div('35th Missile Division', at('Barnaul (Sibirsky)', 53.35, 83.95), { yars_mobile: 27 }),
  div('7th Guards Missile Division', at('Vypolzovo (Ozerny)', 57.85, 33.65), { yars_mobile: 18 }),
  div('28th Guards Missile Division', at('Kozelsk', 54.03, 35.77), { yars_silo: 30 }),
  div('60th Missile Division', at('Tatishchevo (Svetly)', 51.7, 45.6), { topol_m_silo: 60 }),
  div('13th Red Banner Missile Division', at('Dombarovsky (Yasny)', 51.1, 59.85), { avangard_silo: 12, r36m2_silo: 13 }),
  div('62nd Missile Division', at('Uzhur (Solnechny)', 55.32, 89.83), { r36m2_silo: 21 }),
];

// Announced as deployed in Belarus in December 2025; launcher count is an estimate.
const oreshnik = unit(RUS, 'Oreshnik IRBM Regiment (Belarus)', 'missile', 'brigade', at('Krichev, Mogilev', 53.7, 31.7), { oreshnik_tel: 2, truck: 20 }, SRF);

export const rusStrategic: OrbatEntry[] = [...srf, oreshnik];

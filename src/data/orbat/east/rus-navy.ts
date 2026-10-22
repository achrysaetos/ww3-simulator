import type { OrbatEntry } from '../types';
import { at, unit, type Base, type Kit } from './build';

/*
 * Russian Navy by fleet, late 2025. Hull counts follow IISS Military Balance 2025 and
 * fleet assignments in open-source registers (e.g. russianships.info), adjusted for 2024-2025
 * losses: the Black Sea Fleet lost roughly a third of its 2022 combatants (Moskva, Sergey
 * Kotov, Ivanovets, Tsiklon, Rostov-on-Don, several Ropuchas) and withdrew to Novorossiysk.
 * SSBN divisions are 'strategic' formations: they are the sea leg of the triad.
 */

const RUS = 'RUS';
const READY = { readiness: 0.6, experience: 0.5 };

const SEVEROMORSK = at('Severomorsk', 69.07, 33.42);
const GADZHIYEVO = at('Gadzhiyevo', 69.25, 33.33);
const BALTIYSK = at('Baltiysk', 54.65, 19.92);
const NOVOROSSIYSK = at('Novorossiysk', 44.72, 37.79);
const VLADIVOSTOK = at('Vladivostok (Fokino)', 43.11, 131.89);
const VILYUCHINSK = at('Vilyuchinsk', 52.93, 158.41);

const surface = (name: string, base: Base, equipment: Kit, extra = READY): OrbatEntry => unit(RUS, name, 'surface_group', 'flotilla', base, equipment, extra);
const subs = (name: string, base: Base, equipment: Kit, extra = READY): OrbatEntry => unit(RUS, name, 'submarine', 'flotilla', base, equipment, extra);
/**
 * SSBN magazines count reentry vehicles: the boat's load is one per tube, the rest of each MIRVed missile goes in
 * extraMagazine. FAS (2025) puts about 640 warheads on Russian SLBMs: Bulava carries up to 6 and is assessed at 4;
 * Sineva up to 4, with Delta IV boats rotating through overhaul, so about 2 per tube across the class.
 */
const SLBM_EXTRA: Record<string, [munition: string, perBoat: number]> = { borei: ['bulava', 48], borei_a: ['bulava', 48], delta_iv: ['sineva', 16] };
const ssbn = (name: string, base: Base, equipment: Kit): OrbatEntry => {
  const extraMagazine: Kit = {};
  for (const [boat, n] of Object.entries(equipment)) {
    const [munition, perBoat] = SLBM_EXTRA[boat];
    extraMagazine[munition] = (extraMagazine[munition] ?? 0) + n * perBoat;
  }
  return unit(RUS, name, 'strategic', 'flotilla', base, equipment, { readiness: 0.7, experience: 0.6, extraMagazine });
};
/**
 * Russia keeps one or two SSBNs on patrol in peacetime, inside the Barents and Okhotsk bastions (FAS Nuclear Notebook
 * 2025; Kofman, CNA 2020 on the bastion concept). Patrol rates are not published; one boat per fleet is an estimate.
 */
const BARENTS_BASTION = at('Barents Sea bastion', 73, 40);
const OKHOTSK_BASTION = at('Sea of Okhotsk bastion', 55, 150);

const northern: OrbatEntry[] = [
  surface('Admiral Kuznetsov (long refit)', at('35th Shipyard, Murmansk', 69.1, 33.1), { kuznetsov: 1 }, { readiness: 0.05, experience: 0.3 }),
  surface('43rd Missile Ship Division', SEVEROMORSK, { kirov: 1, slava: 1, udaloy: 2 }),
  surface('Northern Fleet Frigate Group', at('Severomorsk frigate pier', 69.05, 33.4), { admiral_gorshkov: 3 }, { readiness: 0.7, experience: 0.5 }),
  surface('Admiral Nakhimov (post-modernisation trials)', at('Sevmash, Severodvinsk', 64.58, 39.8), { kirov: 1 }, { readiness: 0.3, experience: 0.2 }),
  surface('Kola Flotilla of Diverse Forces', at('Polyarny', 69.2, 33.47), { grisha: 6, ropucha: 2, ivan_gren: 2 }),
  ssbn('31st Submarine Division, SSBN on patrol', BARENTS_BASTION, { borei_a: 1 }),
  ssbn('31st Submarine Division', GADZHIYEVO, { borei: 1, borei_a: 1, delta_iv: 5 }),
  subs('11th Submarine Division', at('Zaozyorsk', 69.4, 32.45), { yasen: 1, yasen_m: 2, oscar_ii: 2 }),
  subs('24th Submarine Division', at('Gadzhiyevo SSN pier', 69.26, 33.3), { akula: 2, sierra: 2 }),
  subs('161st Submarine Brigade', at('Polyarny submarine base', 69.19, 33.45), { kilo_877: 4 }),
  unit(RUS, '536th Coastal Missile Brigade', 'missile', 'brigade', at('Snezhnogorsk', 69.19, 33.25), { bastion_p_launcher: 8, bal_launcher: 4, truck: 40 }, READY),
];

const baltic: OrbatEntry[] = [
  surface('12th Surface Ship Division', BALTIYSK, { neustrashimy: 2, steregushchiy: 4 }),
  surface('36th Missile Boat Brigade', at('Baltiysk missile boats', 54.64, 19.9), { buyan_m: 2, karakurt: 4, molniya: 4 }),
  // Ust-Luga to Baltiysk rail and vehicle ferries (Ambal, Baltiysk, Marshal Rokossovsky): Kaliningrad's sea bridge.
  surface('Kaliningrad sea bridge RO-RO ferries', at('Baltiysk ferry terminal', 54.65, 19.92), { military_roro: 3 }, { readiness: 0.8, experience: 0.4 }),
  surface('71st Landing Ship Brigade', at('Baltiysk landing ships', 54.66, 19.95), { ropucha: 3 }),
  subs('Baltic Fleet Submarine Group', at('Baltiysk submarine pier', 54.64, 19.93), { kilo_636: 1, lada: 1 }),
  unit(RUS, '25th Coastal Missile Regiment', 'missile', 'brigade', at('Donskoye, Kaliningrad', 54.9, 20.1), { bastion_p_launcher: 4, bal_launcher: 4, truck: 30 }, READY),
];

const blackSea: OrbatEntry[] = [
  surface('Black Sea Fleet 30th Surface Ship Division', NOVOROSSIYSK, { admiral_grigorovich: 2, krivak: 2 }, { readiness: 0.5, experience: 0.6 }),
  surface('Black Sea Fleet 41st Missile Boat Brigade', at('Novorossiysk missile boats', 44.7, 37.8), { buyan_m: 4, karakurt: 2, bykov: 3 }, { readiness: 0.5, experience: 0.6 }),
  // Oboronlogistika's Sparta-class RO-RO ships, the "Syrian Express" (Ursa Major sank in December 2024).
  surface('Oboronlogistika RO-RO ships', at('Novorossiysk commercial port', 44.72, 37.8), { military_roro: 3 }, { readiness: 0.7, experience: 0.6 }),
  surface('Black Sea Fleet 197th Landing Ship Brigade', at('Novorossiysk landing ships', 44.73, 37.82), { ropucha: 4 }, { readiness: 0.4, experience: 0.6 }),
  subs('4th Submarine Brigade', at('Novorossiysk submarine base', 44.71, 37.77), { kilo_636: 4 }, { readiness: 0.6, experience: 0.6 }),
  unit(RUS, '15th Coastal Missile Brigade', 'missile', 'brigade', at('Sevastopol coastal', 45.1, 33.55), { bastion_p_launcher: 6, bal_launcher: 4, truck: 40 }, { readiness: 0.55, experience: 0.6 }),
  unit(RUS, '11th Coastal Missile Brigade', 'missile', 'brigade', at('Utash, Anapa', 45.02, 37.35), { bastion_p_launcher: 8, bal_launcher: 4, truck: 40 }, READY),
];

const pacific: OrbatEntry[] = [
  surface('36th Surface Ship Division', VLADIVOSTOK, { slava: 1, udaloy: 4, sovremenny: 1 }),
  surface('Pacific Fleet Corvette Brigade', at('Vladivostok Ulysses Bay', 43.08, 131.95), { steregushchiy: 6 }),
  surface('Pacific Fleet Landing Ship Brigade', at('Fokino', 42.97, 132.4), { ropucha: 4 }),
  ssbn('25th Submarine Division, SSBN on patrol', OKHOTSK_BASTION, { borei_a: 1 }),
  ssbn('25th Submarine Division', VILYUCHINSK, { borei: 2, borei_a: 2 }),
  subs('10th Submarine Division', at('Vilyuchinsk SSGN pier', 52.92, 158.43), { yasen_m: 2, oscar_ii: 2, akula: 2 }),
  subs('19th Submarine Brigade', at('Vladivostok submarine base', 43.1, 131.87), { kilo_636: 6, kilo_877: 3 }),
  unit(RUS, '72nd Coastal Missile Regiment', 'missile', 'brigade', at('Smolyaninovo', 43.18, 132.43), { bastion_p_launcher: 4, bal_launcher: 4, truck: 30 }, READY),
  unit(RUS, '520th Coastal Missile Brigade', 'missile', 'brigade', at('Petropavlovsk coastal', 53.05, 158.6), { bastion_p_launcher: 4, bal_launcher: 4, truck: 30 }, READY),
  unit(RUS, 'Kuril Coastal Missile Battalion', 'missile', 'battalion', at('Iturup coastal (nearest map land: southern Sakhalin)', 46.15, 143.85), { bastion_p_launcher: 4, bal_launcher: 4, truck: 20 }, READY),
];

const caspian: OrbatEntry[] = [
  surface('Caspian Flotilla', at('Kaspiysk naval base', 42.88, 47.65), { gepard: 2, buyan_m: 6 }, { readiness: 0.65, experience: 0.5 }),
];

export const rusNavy: OrbatEntry[] = [...northern, ...baltic, ...blackSea, ...pacific, ...caspian];

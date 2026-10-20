import type { OrbatEntry } from '../types';
import { at, scale, unit, type Base, type Kit } from './build';

/*
 * Russian strategic and army air defence, late 2025.
 *
 * VKS S-400 regiments: 2 battalions x 8 launchers plus a Pantsir battery (IISS MB 2025 lists
 * ~56 S-400 battalions). Regiment numbering follows open-source compilations and is
 * approximate. Regiments in Crimea and the occupied south carry lower strength after
 * repeated Ukrainian ATACMS/Neptune/drone strikes on launchers and radars in 2023-2025.
 */

const RUS = 'RUS';
const S400: Kit = { s400_launcher: 16, pantsir_s1: 6, truck: 40 };
const S300PM: Kit = { s300pm_launcher: 12, pantsir_s1: 4, truck: 30 };
const AD = { readiness: 0.75, experience: 0.6 };

const s400 = (name: string, base: Base, strength = 1): OrbatEntry => unit(RUS, name, 'air_defense', 'brigade', base, scale(S400, strength), AD);
const s300 = (name: string, base: Base, strength = 1): OrbatEntry => unit(RUS, name, 'air_defense', 'brigade', base, scale(S300PM, strength), AD);

const vks: OrbatEntry[] = [
  // Moscow: 1st Air and Missile Defence Army
  s400('93rd Guards AD Regiment', at('Zvenigorod', 55.73, 36.86)),
  s400('210th Guards AD Regiment', at('Dmitrov', 56.34, 37.52)),
  s400('606th Guards AD Regiment', at('Elektrostal', 55.79, 38.44)),
  s400('612th Guards AD Regiment', at('Dolgoprudny', 55.94, 37.5)),
  s400('614th Guards AD Regiment', at('Pestovo', 56.1, 37.8)),
  s400('549th Guards AD Regiment', at('Kurilovo', 55.38, 37.33)),
  s300('108th AD Regiment', at('Naro-Fominsk', 55.39, 36.73)),
  unit(RUS, 'A-135/A-235 Moscow ABM System', 'air_defense', 'brigade', at('Sofrino', 56.17, 37.95), { a135_silo: 68 }, AD),
  // Leningrad MD
  s400('1488th AD Regiment', at('Zelenogorsk', 60.2, 29.7)),
  s400('1544th AD Regiment', at('Vlasyevo', 59.75, 30.0)),
  s300('500th AD Regiment', at('Gostilitsy', 59.73, 29.62)),
  s400('183rd Guards AD Regiment', at('Gvardeysk, Kaliningrad', 54.65, 21.07)),
  s400('1545th AD Regiment', at('Znamensk, Kaliningrad', 54.62, 21.23)),
  // Northern Fleet
  s400('1528th AD Regiment', at('Severodvinsk', 64.56, 39.83)),
  s400('531st Guards AD Regiment', at('Polyarny', 69.2, 33.45)),
  s400('583rd AD Regiment', at('Olenegorsk', 68.15, 33.46)),
  s400('33rd AD Regiment', at('Rogachevo, Novaya Zemlya', 71.6, 52.47)),
  // Southern MD and occupied territory
  s400('1537th AD Regiment', at('Novorossiysk', 44.72, 38.1)),
  s400('1536th AD Regiment', at('Rostov-on-Don', 47.24, 39.7)),
  s400('1721st AD Regiment', at('Sochi', 43.6, 40.1)),
  s400('12th AD Regiment', at('Sevastopol', 45.1, 33.52), 0.5),
  s400('18th Guards AD Regiment', at('Feodosia', 45.03, 35.38), 0.5),
  s300('3rd AD Regiment', at('Dzhankoi, Crimea', 45.71, 34.39), 0.5),
  // Central MD
  s400('511th AD Regiment', at('Engels', 51.48, 46.2)),
  s400('590th AD Regiment', at('Novosibirsk', 55.03, 82.92)),
  s300('185th AD Regiment', at('Yekaterinburg', 56.84, 60.6)),
  // Eastern MD and Pacific Fleet
  s400('1533rd AD Regiment', at('Vladivostok', 43.12, 131.9)),
  s400('1529th Guards AD Regiment', at('Khabarovsk', 48.48, 135.08)),
  s400('1532nd Guards AD Regiment', at('Petropavlovsk-Kamchatsky', 53.04, 158.65)),
  s400('1530th AD Regiment', at('Yuzhno-Sakhalinsk AD', 47.0, 142.75)),
  s300('1724th AD Regiment', at('Nakhodka', 43.1, 132.88)),
];

// Ground Forces army/district AD brigades: Buk-M2/M3 (3 bns x 6 TELARs) or S-300V4.
const BUK: Kit = { buk_m3: 12, buk_m2: 6, truck: 40 };
const S300V4: Kit = { s300v4_launcher: 12, truck: 40 };
const deployed = { readiness: 0.65, experience: 0.7 };
const army: OrbatEntry[] = [
  unit(RUS, '49th AD Brigade (1st GTA)', 'air_defense', 'brigade', at('Kupiansk axis AD', 49.85, 38.05), scale(BUK, 0.7), deployed),
  unit(RUS, '53rd AD Brigade', 'air_defense', 'brigade', at('Kursk AD', 51.65, 36.1), scale(BUK, 0.7), deployed),
  unit(RUS, '90th AD Brigade (20th CAA)', 'air_defense', 'brigade', at('Svatove AD', 49.41, 38.16), scale(BUK, 0.7), deployed),
  unit(RUS, '67th AD Brigade (58th CAA)', 'air_defense', 'brigade', at('Melitopol AD', 46.85, 35.37), scale(BUK, 0.65), deployed),
  unit(RUS, '77th AD Brigade (49th CAA)', 'air_defense', 'brigade', at('Nova Kakhovka AD', 46.75, 33.4), scale(BUK, 0.6), deployed),
  unit(RUS, '297th AD Brigade (2nd CAA)', 'air_defense', 'brigade', at('Donetsk AD', 48.0, 37.8), scale(BUK, 0.65), deployed),
  unit(RUS, '61st AD Brigade (41st CAA)', 'air_defense', 'brigade', at('Horlivka AD', 48.3, 38.05), scale(BUK, 0.65), deployed),
  unit(RUS, '8th AD Brigade (5th CAA)', 'air_defense', 'brigade', at('Ussuriysk', 43.8, 131.95), scale(BUK, 0.6), { readiness: 0.6, experience: 0.4 }),
  unit(RUS, '202nd AD Brigade (6th CAA)', 'air_defense', 'brigade', at('Belgorod AD', 50.6, 36.6), scale(S300V4, 0.7), deployed),
  unit(RUS, '38th AD Brigade (EMD)', 'air_defense', 'brigade', at('Ussuriysk S-300V4', 43.75, 131.9), scale(S300V4, 0.8), { readiness: 0.6, experience: 0.4 }),
];

export const rusAirDefense: OrbatEntry[] = [...vks, ...army];

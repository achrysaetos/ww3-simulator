import type { OrbatEntry } from '../types';
import { at, unit, type Base } from './build';

/*
 * PLA Rocket Force, 2025: six launch bases (61-66) and their brigades.
 *
 * Launcher totals by class are calibrated to the DoD China Military Power Report 2024
 * (ICBM ~550 launchers incl. ~320 new silos; IRBM ~250; MRBM ~300; SRBM ~200; GLCM ~150) and
 * reloads to its missile-per-launcher ratios (IRBM ~2, MRBM ~4, SRBM ~4.5). Brigade numbers,
 * garrisons and missile types follow FAS Nuclear Notebook "Chinese nuclear weapons, 2025"
 * and are approximate. Per-brigade launcher counts are estimates.
 *
 * The three new silo fields are split into loaded and empty silos. CMPR 2024 says "at least
 * some" are loaded; ~30 loaded is an estimate. Empty silos stay in the order of battle
 * because an adversary cannot tell them apart and must target them.
 */

const CHN = 'CHN';
const PLARF = { readiness: 0.8, experience: 0.3 };

type Kind = 'df41' | 'df31ag' | 'df5b' | 'df26' | 'df21a' | 'df21d' | 'df17' | 'df16' | 'df15b' | 'df11a' | 'cj10';
// Launcher platform, launchers per brigade, reload missiles per launcher.
const KIND: Record<Kind, { tel: string; launchers: number; reloads: number; strategic: boolean }> = {
  df41: { tel: 'df41_tel', launchers: 14, reloads: 0, strategic: true },
  df31ag: { tel: 'df31ag_tel', launchers: 16, reloads: 0, strategic: true },
  df5b: { tel: 'df5b_silo', launchers: 6, reloads: 0, strategic: true },
  df26: { tel: 'df26_tel', launchers: 30, reloads: 1, strategic: false },
  df21a: { tel: 'df21_tel', launchers: 18, reloads: 3, strategic: false },
  df21d: { tel: 'df21d_tel', launchers: 30, reloads: 3, strategic: false },
  df17: { tel: 'df17_tel', launchers: 24, reloads: 3, strategic: false },
  df16: { tel: 'df16_tel', launchers: 48, reloads: 3, strategic: false },
  df15b: { tel: 'df15_tel', launchers: 48, reloads: 3, strategic: false },
  df11a: { tel: 'df11_tel', launchers: 48, reloads: 3, strategic: false },
  cj10: { tel: 'cj10_tel', launchers: 48, reloads: 0, strategic: false },
};

const brigade = (num: number, kind: Kind, base: Base): OrbatEntry => {
  const k = KIND[kind];
  return unit(CHN, `${num} Brigade (Base ${Math.floor(num / 10)}, ${kind.toUpperCase()})`, k.strategic ? 'strategic' : 'missile', 'brigade', base,
    { [k.tel]: k.launchers, truck: k.launchers * 3 },
    { ...PLARF, ...(k.reloads ? { extraMagazine: { [kind]: k.launchers * k.reloads } } : {}) });
};

const brigades: OrbatEntry[] = [
  // Base 61, Huangshan: the Taiwan-facing base
  brigade(611, 'df26', at('Chizhou', 30.66, 117.49)),
  brigade(612, 'df21a', at('Jingdezhen', 29.27, 117.18)),
  brigade(613, 'df15b', at('Shangrao', 28.45, 117.94)),
  brigade(614, 'df17', at("Yong'an", 25.94, 117.36)),
  brigade(615, 'df11a', at('Meizhou', 24.29, 116.12)),
  brigade(616, 'df17', at('Ganzhou', 25.83, 114.93)),
  brigade(617, 'df16', at('Jinhua PLARF', 29.1, 119.6)),
  brigade(618, 'df17', at('Ganzhou south', 25.6, 115.0)),
  // Base 62, Kunming
  brigade(621, 'df21a', at('Yibin', 28.77, 104.62)),
  brigade(622, 'df31ag', at('Yuxi', 24.35, 102.54)),
  brigade(623, 'cj10', at('Liuzhou PLARF', 24.33, 109.42)),
  brigade(624, 'df21d', at('Danzhou, Hainan', 19.52, 109.58)),
  brigade(625, 'df26', at('Jianshui', 23.62, 102.83)),
  brigade(626, 'df26', at('Qingyuan', 23.68, 113.05)),
  brigade(627, 'df17', at('Puning', 23.3, 116.17)),
  // Base 63, Huaihua
  brigade(631, 'df5b', at('Jingzhou (Hunan)', 26.58, 109.68)),
  brigade(632, 'df31ag', at('Shaoyang', 27.24, 111.47)),
  brigade(633, 'df5b', at('Huitong', 26.87, 109.72)),
  brigade(634, 'df26', at('Yiyang', 28.55, 112.36)),
  brigade(635, 'df21a', at('Yichun', 27.8, 114.38)),
  brigade(636, 'df16', at('Shaoguan PLARF', 24.8, 113.58)),
  brigade(637, 'df17', at('Huaihua', 27.55, 110.0)),
  brigade(638, 'cj10', at('Huaihua south', 27.3, 110.2)),
  // Base 64, Lanzhou
  brigade(641, 'df31ag', at('Hancheng', 35.48, 110.44)),
  brigade(642, 'df31ag', at('Datong (Qinghai)', 36.93, 101.68)),
  brigade(643, 'df41', at('Tianshui', 34.58, 105.72)),
  brigade(644, 'df41', at('Hanzhong', 33.07, 107.03)),
  brigade(645, 'df41', at('Yinchuan PLARF', 38.5, 106.2)),
  brigade(646, 'df26', at('Korla PLARF', 41.75, 86.15)),
  brigade(647, 'df21a', at('Xining PLARF', 36.65, 101.75)),
  // Base 65, Shenyang
  brigade(651, 'df21a', at('Dalian PLARF', 39.1, 121.6)),
  brigade(652, 'df26', at('Tonghua PLARF', 41.72, 125.94)),
  brigade(653, 'df21d', at('Laiwu', 36.2, 117.67)),
  brigade(654, 'df26', at('Dengshahe', 39.25, 121.9)),
  brigade(655, 'df17', at('Tonghua east', 41.7, 126.2)),
  brigade(656, 'df31ag', at('Laiwu north', 36.4, 117.6)),
  // Base 66, Luoyang
  brigade(661, 'df5b', at('Lingbao', 34.52, 110.89)),
  brigade(662, 'df5b', at('Luanchuan', 33.78, 111.61)),
  brigade(663, 'df31ag', at('Nanyang', 33.0, 112.53)),
  brigade(664, 'df41', at('Luoyang PLARF', 34.6, 112.3)),
  brigade(665, 'cj10', at('Luoyang west', 34.5, 111.9)),
  brigade(666, 'df26', at('Xinyang PLARF', 32.15, 114.1)),
  brigade(667, 'df5b', at('Luoning', 34.39, 111.65)),
];

const siloField = (name: string, base: Base, loaded: number, total: number): OrbatEntry =>
  unit(CHN, name, 'strategic', 'brigade', base, { df41_silo: loaded, icbm_silo_empty: total - loaded }, PLARF);
const silos: OrbatEntry[] = [
  siloField('Yumen Silo Field', at('Yumen', 40.1, 96.6), 10, 120),
  siloField('Hami Silo Field', at('Hami', 42.3, 92.5), 10, 110),
  siloField('Hanggin Banner Silo Field', at('Hanggin Banner, Ordos', 40.2, 107.7), 10, 90),
];

export const chnPlarf: OrbatEntry[] = [...brigades, ...silos];

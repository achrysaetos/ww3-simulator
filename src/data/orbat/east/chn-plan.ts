import type { OrbatEntry } from '../types';
import { at, unit, type Base, type Kit } from './build';

/*
 * PLA Navy by theater-command fleet and the China Coast Guard, late 2025.
 *
 * Submarine totals follow the DoD China Military Power Report 2024 (6 SSBN, 6 SSN, 48 SSK);
 * surface hulls follow IISS Military Balance 2025 plus commissionings through 2025 (Fujian,
 * commissioned November 2025 at Sanya). Hull-to-fleet assignments are approximate; the
 * carrier groups take escorts out of their fleet's flotilla so no hull is counted twice.
 * Type 052C counts include the two older Type 052B; Type 054A includes the first Type 054B.
 */

const CHN = 'CHN';
const PLAN = { readiness: 0.75, experience: 0.3 };
const group = (name: string, base: Base, equipment: Kit, echelon: 'flotilla' | 'task_group' = 'flotilla'): OrbatEntry =>
  unit(CHN, name, 'surface_group', echelon, base, equipment, PLAN);
const subs = (name: string, base: Base, equipment: Kit): OrbatEntry => unit(CHN, name, 'submarine', 'flotilla', base, equipment, PLAN);

const QINGDAO = at('Qingdao', 36.07, 120.38);
const ZHOUSHAN = at('Zhoushan', 29.98, 122.2);
const ZHANJIANG = at('Zhanjiang', 21.2, 110.4);
const SANYA = at('Sanya Yulin', 18.22, 109.55);

const northern: OrbatEntry[] = [
  group('Liaoning Carrier Strike Group', at('Qingdao carrier pier', 36.0, 120.3), { cv_liaoning: 1, type055: 1, type052d: 2, type054a: 1, type901: 1 }, 'task_group'),
  group('Northern TC Navy 1st Destroyer Flotilla', QINGDAO, { type055: 2, type052d: 6, type052c: 1, type051c: 2, type054a: 8 }),
  group('Northern TC Navy Corvette and Landing Flotilla', at('Lushun', 38.8, 121.25), { type056a: 12, type022: 20, type071: 1 }),
  subs('Northern TC Navy Submarine Base', at('Jianggezhuang', 36.11, 120.6), { type093: 2, type093b: 1, type039a: 6, type039: 4 }),
];

const eastern: OrbatEntry[] = [
  group('Eastern TC Navy 3rd Destroyer Flotilla', ZHOUSHAN, { type055: 2, type052d: 7, type052c: 3, sovremenny: 4 }),
  group('Eastern TC Navy Frigate Flotilla', at('Ningbo naval base', 29.9, 121.85), { type054a: 14 }),
  group('Eastern TC Navy Corvette and Landing Flotilla', at('Shanghai Wusong', 31.4, 121.5), { type056a: 20, type022: 30, type071: 3, type075: 1 }),
  subs('Eastern TC Navy Submarine Flotilla', at('Xiangshan', 29.5, 121.85), { kilo_636: 10, kilo_877: 2, type039a: 8, type039: 4 }),
];

const southern: OrbatEntry[] = [
  group('Shandong Carrier Strike Group', SANYA, { cv_shandong: 1, type055: 1, type052d: 2, type054a: 1, type901: 1 }, 'task_group'),
  group('Fujian Carrier Strike Group', at('Sanya carrier pier', 18.25, 109.6), { cv_fujian: 1, type055: 1, type052d: 2, type054a: 1 }, 'task_group'),
  group('Southern TC Navy 2nd Destroyer Flotilla', ZHANJIANG, { type055: 1, type052d: 9, type052c: 4, type054a: 13 }),
  group('Southern TC Navy Corvette Flotilla', at('Haikou naval base', 20.03, 110.3), { type056a: 20, type022: 30 }),
  group('Southern TC Navy Amphibious Flotilla', at('Zhanjiang amphibious base', 21.25, 110.45), { type071: 4, type075: 3 }),
  unit(CHN, 'Hainan SSBN Flotilla', 'strategic', 'flotilla', at('Longpo, Hainan', 18.21, 109.69), { type094: 6 }, { readiness: 0.7, experience: 0.3 }),
  subs('Southern TC Navy Submarine Flotilla', at('Yulin submarine base', 18.23, 109.68), { type093: 2, type093b: 1, type039a: 10, type039: 4 }),
];

// China Coast Guard: ~150 cutters over 1,000 t and several hundred smaller patrol craft (CMPR 2024).
const CCG = { readiness: 0.8, experience: 0.35 };
const coastGuard: OrbatEntry[] = [
  unit(CHN, 'China Coast Guard North Sea Bureau', 'surface_group', 'flotilla', at('Qingdao CCG', 36.05, 120.33), { ccg_cutter: 30, ccg_patrol: 80 }, CCG),
  unit(CHN, 'China Coast Guard East Sea Bureau', 'surface_group', 'flotilla', at('Shanghai CCG', 31.25, 121.55), { ccg_cutter: 60, ccg_patrol: 150 }, CCG),
  unit(CHN, 'China Coast Guard South Sea Bureau', 'surface_group', 'flotilla', at('Sanya CCG', 18.25, 109.5), { ccg_cutter: 60, ccg_patrol: 150 }, CCG),
];

export const chnPlan: OrbatEntry[] = [...northern, ...eastern, ...southern, ...coastGuard];

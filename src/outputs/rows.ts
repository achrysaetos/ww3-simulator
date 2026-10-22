import type { NationId } from '../core/types';
import type { Outputs, RaceItem, WorkaroundId } from './types';

/** One scalar of an Outputs record, for tables and ensemble ranges. */
export interface OutputRow {
  /** Stable across runs: `UKR civilians_killed`, `RUS interceptors_zero_day`. */
  key: string;
  nation: NationId;
  label: string;
  unit: string;
  /** Infinity for a stock that does not run out within the projection. */
  value: number;
}

const RACE_ROWS: RaceItem[] = ['shells', 'ammo', 'interceptors', 'drones'];
const WORKAROUND_LABEL: Record<WorkaroundId, string> = {
  trade_rerouting: 'trade still arriving under sanctions',
  dual_use_imports: 'chip needs met',
  shadow_fleet: 'energy exports still moving',
  foreign_arms: 'planned arms aid arriving',
};

/** The rows that answer "what did it cost, and who is winning the production race", for `nations`. */
export function outputRows(o: Outputs, nations: readonly NationId[]): OutputRow[] {
  const rows: OutputRow[] = [];
  for (const nation of nations) {
    const n = o.nations[nation];
    if (!n) continue;
    const row = (key: string, label: string, unit: string, value: number) => rows.push({ key: `${nation} ${key}`, nation, label: `${nation} ${label}`, unit, value });
    const h = n.humanitarian;
    row('military_casualties', 'military killed and wounded', 'people', h.militaryCasualties);
    row('civilians_killed', 'civilians killed', 'people', h.civiliansKilled);
    row('displaced', 'displaced at home and abroad', 'people', h.idps + h.refugees);
    row('power', 'grid intact', 'share', h.power);
    for (const r of n.race) {
      if (!RACE_ROWS.includes(r.item)) continue;
      if (r.item === 'shells') {
        row('shells_fired_per_day', 'shells fired a day', 'rounds', r.usedPerMonth / 30);
        row('shells_supplied_per_day', 'shells made or shipped in a day', 'rounds', (r.producedPerMonth + r.aidPerMonth) / 30);
        continue;
      }
      if (r.stock !== null) row(`${r.item}_stock`, `${r.item} left`, r.unit, r.stock);
      row(`${r.item}_zero_day`, `${r.item} run out on day`, 'day', r.ranOutDay ?? r.zeroDay ?? Infinity);
    }
    for (const w of n.workarounds) row(`workaround_${w.id}`, WORKAROUND_LABEL[w.id], 'share', w.level);
  }
  return rows;
}

/**
 * Break a scenario's strike events down by nation and munition for air/missile calibration.
 * npx tsx scripts/air-breakdown.ts <scenario> <days> [seed] [nations,comma,separated]
 */
import { createSession } from '../src/scenarios';
import type { SimEvent } from '../src/core/types';

const [scenario = 'ukraine-2026', days = '14', seed = '1', only] = process.argv.slice(2);
const s = createSession(scenario, Number(seed));
const keep = only?.split(',');
const rows = new Map<string, { fired: number; intercepted: number; raids: number }>();
const ticks = Math.round((Number(days) * 24) / s.world.dtHours);
for (let i = 0; i < ticks; i++)
  for (const e of s.engine.step(s.world) as SimEvent[]) {
    if (e.type !== 'strike' || (keep && !keep.includes(e.by))) continue;
    const m = s.engine.catalog.munitions.get(e.munition);
    const k = `${e.by}\t${m?.kind ?? '?'}\t${e.munition}`;
    const r = rows.get(k) ?? { fired: 0, intercepted: 0, raids: 0 };
    r.fired += e.fired;
    r.intercepted += e.intercepted;
    r.raids++;
    rows.set(k, r);
  }
console.log('by\tkind\tmunition\tfired\tintercepted\traids');
for (const [k, r] of [...rows].sort((a, b) => b[1].fired - a[1].fired)) console.log(`${k}\t${r.fired}\t${r.intercepted}\t${r.raids}`);

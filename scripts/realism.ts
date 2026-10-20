/**
 * Run a scenario and print measured outcomes as JSON for calibration.
 * npx tsx scripts/realism.ts <scenario> <days> [seed] [nations,comma,separated]
 */
import { measureRun } from '../src/metrics';
import { createSession } from '../src/scenarios';

const [scenario = 'ukraine-2026', days = '30', seed = '1', only] = process.argv.slice(2);
const s = createSession(scenario, Number(seed));
const m = measureRun(s.engine, s.world, s.map, Number(days));
const keep = only?.split(',');
if (keep) m.nations = Object.fromEntries(Object.entries(m.nations).filter(([k]) => keep.includes(k)));
console.log(JSON.stringify(m, null, 1));

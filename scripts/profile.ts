/**
 * Per-system step time on a real scenario. Run: npx tsx scripts/profile.ts [scenario] [days]
 */
import { createSession } from '../src/scenarios';

const [scenario = 'ww3-2027', days = '5'] = process.argv.slice(2);
const s = createSession(scenario, 1);
const totals = new Map<string, { ms: number; worst: number }>();
for (const sys of s.engine.systems) {
  const step = sys.step.bind(sys);
  (sys as { step: typeof step }).step = (w, ctx) => {
    const t = performance.now();
    step(w, ctx);
    const dt = performance.now() - t;
    const r = totals.get(sys.id) ?? { ms: 0, worst: 0 };
    r.ms += dt;
    r.worst = Math.max(r.worst, dt);
    totals.set(sys.id, r);
  };
}
const ticks = Number(days) * Math.round(24 / s.world.dtHours);
const t0 = performance.now();
s.engine.run(s.world, ticks);
const total = performance.now() - t0;
console.log(`${scenario}: ${Object.keys(s.world.formations).length} formations, ${ticks} ticks, mean ${(total / ticks).toFixed(1)} ms/tick`);
for (const [id, r] of [...totals].sort((a, b) => b[1].ms - a[1].ms)) console.log(`  ${id.padEnd(14)} mean ${(r.ms / ticks).toFixed(1).padStart(7)} ms  worst ${r.worst.toFixed(1).padStart(7)} ms`);

/**
 * Per-system step time on a real scenario. Run: npx tsx scripts/profile.ts [scenario] [days]
 * "commands" is the rest of the tick: queued orders applied before the systems step.
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
const cpu0 = process.cpuUsage();
const t0 = performance.now();
s.engine.run(s.world, ticks);
const total = performance.now() - t0;
const cpu = process.cpuUsage(cpu0);
let systems = 0;
for (const r of totals.values()) systems += r.ms;
totals.set('commands', { ms: total - systems, worst: NaN });
console.log(`${scenario}: ${Object.keys(s.world.formations).length} formations, ${ticks} ticks, mean ${(total / ticks).toFixed(1)} ms/tick wall, ${((cpu.user + cpu.system) / 1000 / ticks).toFixed(1)} ms/tick CPU`);
for (const [id, r] of [...totals].sort((a, b) => b[1].ms - a[1].ms))
  console.log(`  ${id.padEnd(14)} mean ${(r.ms / ticks).toFixed(1).padStart(7)} ms ${((100 * r.ms) / total).toFixed(1).padStart(5)}%  worst ${r.worst.toFixed(1).padStart(7)} ms`);

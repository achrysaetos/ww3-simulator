/**
 * Ensemble forecast: npm run ensemble -- --scenario ukraine-2026 --days 30 --runs 16 --sweep tagged
 *   [--method lhs|oat] [--seeds 1,2,3,4] [--workers N] [--metrics casualties:RUS,net_cells:RUS>0] [--json]
 * lhs draws every swept param together over --runs runs (forecast mode: ranges and probabilities).
 * oat moves one param at a time across --runs levels with the rest at their defaults (stress-test
 * mode: tipping points). --sweep takes 'tagged' (every estimated, judgment or contested param) or
 * a comma list of param ids.
 */
import { paramRegistry } from '../core/params';
import { defaultMetrics, metric, sampleRuns, sweptParams, type EnsembleInput, type EnsembleReport, type Flip } from '../forecast';
import { runAll } from '../forecast/pool';
import { summarize } from '../forecast/report';
import { createSession } from '../scenarios';
import { CliError } from './args';
import { parseEnsembleArgs, type EnsembleArgs } from './ensemble-args';

function fail(message: string, code: number): never {
  console.error(`error: ${message}`);
  process.exit(code);
}

let args: EnsembleArgs;
let input: EnsembleInput;
try {
  args = parseEnsembleArgs(process.argv.slice(2));
  const probe = createSession(args.scenario, args.seeds[0]);
  const metrics = args.metrics ?? defaultMetrics(probe.world);
  metrics.forEach(metric);
  sweptParams(args.sweep);
  input = {
    world: args.scenario,
    ticks: Math.round((args.days * 24) / probe.world.dtHours),
    runs: sampleRuns(args.runs, { seeds: args.seeds, sweep: args.sweep, method: args.method }),
    metrics,
  };
} catch (e) {
  fail((e as Error).message, e instanceof CliError ? 2 : 1);
}

const t0 = performance.now();
const results = await runAll(input, {
  workers: args.workers,
  onProgress: (done, total) => process.stderr.write(`\r${done}/${total} runs, ${((performance.now() - t0) / 1000).toFixed(0)} s`),
});
process.stderr.write('\n');
const report = summarize(input, results);
const seconds = (performance.now() - t0) / 1000;

if (args.json) console.log(JSON.stringify({ ...report, seconds, results }, null, 2));
else print(report, seconds);

function fmt(x: number): string {
  if (!Number.isFinite(x)) return String(x);
  const a = Math.abs(x);
  return a >= 1000 ? Math.round(x).toLocaleString('en-US') : a >= 10 ? x.toFixed(0) : a >= 1 ? x.toFixed(1) : x.toFixed(2);
}

function flipLine(f: Flip): string {
  const outcome = f.flipsOutcome ? `FLIPS the outcome at ${fmt(f.tipping!)}` : f.significant ? 'moves the cost' : 'within seed noise';
  return `${f.param} [${f.tag}] -> ${f.metric}: ${f.effect >= 0 ? '+' : ''}${fmt(f.effect)} across its range (r ${f.r.toFixed(2)}), ${outcome}`;
}

function print(r: EnsembleReport, seconds: number): void {
  const tags = new Map<string, number>();
  for (const s of r.swept) tags.set(s.tag, (tags.get(s.tag) ?? 0) + 1);
  console.log(`${r.world}: ${r.runs} runs of ${args.days} days in ${seconds.toFixed(0)} s, ${r.mode} mode`);
  console.log(r.mode === 'forecast'
    ? '  forecast: every swept param drawn together; ranges and probabilities below'
    : '  stress test: one param at a time; read tipping points, not probabilities');
  console.log(`  swept ${r.swept.length} of ${paramRegistry().length} params (${[...tags].map(([t, n]) => `${n} ${t}`).join(', ')})`);
  console.log('\nmetric                         p10        p50        p90        min        max   P(met)');
  for (const [id, m] of Object.entries(r.metrics))
    console.log(`${id.padEnd(26)} ${[m.p10, m.p50, m.p90, m.min, m.max].map((x) => fmt(x).padStart(10)).join(' ')}   ${m.pMet === undefined ? '' : `${(m.pMet * 100).toFixed(0)}%`}`);
  console.log('  units: ' + Object.entries(r.metrics).map(([id, m]) => `${id} ${m.unit}`).join('; '));
  console.log('\ntop 3 assumptions');
  r.top3.forEach((f, i) => console.log(`  ${i + 1}. ${flipLine(f)}`));
  console.log('\nstrongest effects');
  for (const f of r.flips.slice(0, 10)) console.log(`  ${flipLine(f)}`);
}

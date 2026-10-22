/**
 * Headless run: npm run sim -- --scenario ww3-2027 --days 30 [--seed 1] [--quiet] [--report] [--save run.json]
 * Resume a saved run: npm run sim -- --resume run.json --days 30 [--save later.json]
 * Prints notable events as they happen and a daily line per belligerent; --report ends with the
 * after-action report: war cost, the production race and economic workarounds.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { currentDate } from '../core/engine';
import type { NationId, SimEvent, World } from '../core/types';
import { involved, OutputsRecorder } from '../outputs';
import { createSession, SCENARIOS } from '../scenarios';
import { resumeRun, saveRun } from '../scenarios/save';
import { CliError, parseArgs, type CliArgs } from './args';
import { formatOutputs } from './outputs-report';

let args: CliArgs;
try {
  args = parseArgs(process.argv.slice(2));
} catch (e) {
  if (!(e instanceof CliError)) throw e;
  console.error(`error: ${e.message}`);
  process.exit(2);
}
if (args.list) {
  for (const s of SCENARIOS) console.log(`${s.id.padEnd(18)} ${s.name}: ${s.summary}`);
  process.exit(0);
}
const { days, quiet, resume: resumeFrom, save: saveTo } = args;

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}
function load(path: string) {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    return fail(`cannot read ${path}: ${(e as Error).message}`);
  }
  try {
    return resumeRun(text);
  } catch (e) {
    return fail(`cannot resume ${path}: ${(e as Error).message}`);
  }
}

const t0 = performance.now();
const { engine, world, map, scenarioId } = start();
function start() {
  if (resumeFrom) {
    const r = load(resumeFrom);
    console.log(`${r.scenario.id}: resumed ${resumeFrom} at ${currentDate(r.world).toISOString().slice(0, 13)} (tick ${r.world.tick}) in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    return { ...r, scenarioId: r.scenario.id };
  }
  const scenarioId = args.scenario;
  const s = createSession(scenarioId, args.seed);
  console.log(`${scenarioId}: ${s.placement.placed} formations placed in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  const unknown = Object.keys(s.placement.unknownPlatforms);
  if (unknown.length) console.log(`  ${unknown.length} ORBAT equipment ids not in catalog: ${unknown.slice(0, 20).join(' ')}${unknown.length > 20 ? ' ...' : ''}`);
  return { ...s, scenarioId };
}

const name = (n: NationId) => world.nations[n]?.name ?? n;
function describe(e: SimEvent): string | null {
  switch (e.type) {
    case 'war_declared': return `WAR      ${name(e.by)} declares war on ${name(e.on)} (${e.reason})`;
    case 'peace': return `PEACE    ${name(e.a)} and ${name(e.b)}: ${e.terms}`;
    case 'nuclear_detonation': return `NUCLEAR  ${name(e.by)} detonates ${e.yieldKt} kt near ${nearestCity(e.node)}: ${Math.round(e.casualties).toLocaleString()} casualties`;
    case 'escalation': return `ESCALATE ${name(e.a)} / ${name(e.b)} -> ${e.level}`;
    case 'nuclear_alert': return `ALERT    ${name(e.nation)} nuclear forces ${e.stage}: ${e.ready}/${e.of} warheads ready (${e.reason})`;
    case 'capitulation': return `SURRENDER ${name(e.nation)} capitulates to ${e.to.map(name).join(', ')}`;
    case 'formation_destroyed': return quiet ? null : `LOST     ${name(e.nation)} ${world.formations[e.formation]?.name ?? e.formation}`;
    default: return null;
  }
}
function nearestCity(node: number): string {
  let best = '', bestD = Infinity;
  for (const c of map.cities) {
    const d = (c.lat - map.lat[node]) ** 2 + (c.lon - map.lon[node]) ** 2;
    if (d < bestD) { bestD = d; best = c.name; }
  }
  return best;
}
function belligerents(w: World): NationId[] {
  const s = new Set<NationId>();
  for (const [k, r] of Object.entries(w.relations)) if (r.atWar) for (const n of k.split('|')) s.add(n as NationId);
  return [...s];
}
function territory(w: World, n: NationId): number {
  let c = 0;
  for (let i = 0; i < map.landCount; i++) if (w.control[i] === n) c++;
  return c;
}

const ticksPerDay = Math.round(24 / world.dtHours);
const startTerritory = new Map(Object.keys(world.nations).map((n) => [n, territory(world, n as NationId)]));
const recorder = args.report ? new OutputsRecorder(engine.catalog) : undefined;
recorder?.observe(world);
let stepMs = 0, worst = 0;
for (let day = 1; day <= days; day++) {
  const battles = new Map<NationId, { lost: number; kia: number }>();
  for (let i = 0; i < ticksPerDay; i++) {
    const s = performance.now();
    const events = engine.step(world);
    const dt = performance.now() - s;
    stepMs += dt;
    worst = Math.max(worst, dt);
    recorder?.observe(world);
    for (const e of events) {
      const line = describe(e);
      if (line) console.log(`  ${currentDate(world).toISOString().slice(0, 13)}  ${line}`);
      if (e.type === 'battle')
        for (const [n, losses] of Object.entries(e.losses)) {
          const b = battles.get(n as NationId) ?? { lost: 0, kia: 0 };
          b.lost += Object.values(losses).reduce((a, x) => a + x, 0);
          b.kia += e.casualties[n as NationId] ?? 0;
          battles.set(n as NationId, b);
        }
    }
  }
  if (!quiet || day === days) {
    const rows = belligerents(world)
      .map((n) => {
        const nat = world.nations[n];
        const b = battles.get(n);
        const dTerr = territory(world, n) - (startTerritory.get(n) ?? 0);
        return `${n} sup ${(nat.warSupport * 100).toFixed(0)}% mob ${(nat.mobilization * 100).toFixed(0)}%${dTerr ? ` terr ${dTerr > 0 ? '+' : ''}${dTerr}` : ''}${b ? ` lost ${Math.round(b.lost)} cas ${Math.round(b.kia)}` : ''}`;
      });
    console.log(`day ${world.tick / ticksPerDay} ${currentDate(world).toISOString().slice(0, 10)} | ${rows.join(' | ') || 'no wars'}`);
  }
}
if (recorder) {
  const fighting = belligerents(world).sort();
  const order = [...fighting, ...involved(world).filter((n) => !fighting.includes(n))];
  console.log(formatOutputs(recorder.outputs(world, map), order, name).join('\n'));
}
if (saveTo) {
  writeFileSync(saveTo, saveRun(scenarioId, world));
  console.log(`saved tick ${world.tick} to ${saveTo}; continue with --resume ${saveTo}`);
}
console.log(`ran ${days} days: mean tick ${(stepMs / (days * ticksPerDay)).toFixed(1)} ms, worst ${worst.toFixed(1)} ms, ${Object.keys(world.formations).length} formations`);

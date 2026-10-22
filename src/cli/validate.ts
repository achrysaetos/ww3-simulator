/**
 * Held-out validation: npm run validate -- [--cases karabakh-2020,kursk-2024] [--runs 8] [--seeds 1,2,3,4]
 *   [--sweep tagged|none] [--workers N] [--json]
 * Runs every case's ensemble (seeds crossed with a Latin hypercube over the tagged params) and scores
 * each question against what happened and against the naive baseline. Prints scores; never fails on them.
 * --cases also takes the tuned-on band cases, ukraine-2026-60d and baltic-2027-21d.
 */
import { sampleRuns } from '../forecast';
import { caseById } from '../validation/cases';
import { runJobs, type CaseJob } from '../validation/ensemble';
import { formatTable } from '../validation/report';
import { scoreCase } from '../validation/score';
import { CliError } from './args';
import { parseValidateArgs, type ValidateArgs } from './validate-args';

let args: ValidateArgs;
try {
  args = parseValidateArgs(process.argv.slice(2));
} catch (e) {
  console.error(`error: ${(e as Error).message}`);
  process.exit(e instanceof CliError ? 2 : 1);
}

const specs = args.sweep === 'tagged'
  ? sampleRuns(args.runs, { seeds: args.seeds, sweep: 'tagged', method: 'lhs' })
  : Array.from({ length: args.runs }, (_, i) => ({ seed: args.seeds[i % args.seeds.length] }));
const cases = args.cases.map(caseById);
const jobs: CaseJob[] = cases.flatMap((c) => specs.map((spec) => ({ caseId: c.id, spec })));

const t0 = performance.now();
const results = await runJobs(jobs, {
  workers: args.workers,
  onProgress: (done, total) => process.stderr.write(`\r${done}/${total} runs, ${((performance.now() - t0) / 1000).toFixed(0)} s`),
});
process.stderr.write('\n');
const scores = cases.flatMap((c) => scoreCase(c, results.filter((_, i) => jobs[i].caseId === c.id)));
const seconds = (performance.now() - t0) / 1000;

if (args.json) console.log(JSON.stringify({ seconds, sweep: args.sweep, seeds: args.seeds, runs: args.runs, scores, results: results.map((r, i) => ({ caseId: jobs[i].caseId, ...r })) }, null, 2));
else {
  console.log(`validation: ${cases.length} cases x ${args.runs} runs in ${seconds.toFixed(0)} s, seeds ${args.seeds.join(',')}, ${args.sweep === 'tagged' ? 'tagged params drawn by Latin hypercube' : 'params at defaults'}`);
  console.log(formatTable(cases, scores));
}

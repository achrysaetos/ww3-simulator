import { sampleRuns } from '../forecast/sample';
import { runPooled } from '../forecast/pool';
import type { RunSpec } from '../forecast/run';
import { runCase, type CaseResult } from './run';
import { quantile } from './score';

export interface CaseJob {
  caseId: string;
  spec: RunSpec;
}

/** Runs case draws on worker threads (0 workers: serially here); results land in job order. */
export function runJobs(jobs: readonly CaseJob[], opts: { workers?: number; onProgress?: (done: number, total: number) => void } = {}): Promise<CaseResult[]> {
  return runPooled(jobs, { worker: new URL('./worker-boot.mjs', import.meta.url), serial: (j) => runCase(j.caseId, j.spec) }, opts);
}

/**
 * A band checked over an ensemble instead of one seed (issue #2 section 2): `runs` draws, the seeds
 * cycled across a Latin hypercube over every estimated, judgment and contested param.
 */
export async function ensemble(caseId: string, runs = 8, seeds: readonly number[] = [1, 2, 3, 4], workers = 2): Promise<CaseResult[]> {
  const specs = sampleRuns(runs, { seeds, sweep: 'tagged', method: 'lhs' });
  return runJobs(specs.map((spec) => ({ caseId, spec })), { workers });
}

export interface Spread {
  p10: number;
  p50: number;
  p90: number;
  values: number[];
}

export function spread(results: readonly CaseResult[], question: string): Spread {
  const values = results.map((r) => r.values[question]).sort((a, b) => a - b);
  return { p10: quantile(values, 0.1), p50: quantile(values, 0.5), p90: quantile(values, 0.9), values };
}

/**
 * The ensemble form of a band: the median run lands inside it (which puts the p10-p90 spread across
 * it too). Returns why it fails, with every run's value, or undefined.
 */
export function bandProblem(s: Spread, lo: number, hi: number): string | undefined {
  if (s.p50 >= lo && s.p50 <= hi) return undefined;
  return `p50 ${s.p50.toFixed(2)} outside ${lo}-${hi}; p10 ${s.p10.toFixed(2)}, p90 ${s.p90.toFixed(2)}, runs ${s.values.map((v) => v.toFixed(2)).join(', ')}`;
}

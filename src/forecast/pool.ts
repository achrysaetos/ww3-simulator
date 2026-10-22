/**
 * The Node pool for ensembles: one worker thread per core, each stepping whole runs through
 * `runOne`. Results land by run index, so the report is the same whatever finishes first and
 * equals a serial run. Node only; the browser gets its own pool over the same `runOne`.
 */
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { summarize, type EnsembleReport } from './report';
import { runOne, type EnsembleInput, type RunResult } from './run';

export interface EnsembleOptions {
  /** Worker threads; 0 runs serially in this thread. Default: one per core, at most one per run. */
  workers?: number;
  onProgress?: (done: number, total: number, result: RunResult) => void;
}

export async function runEnsemble(input: EnsembleInput, opts: EnsembleOptions = {}): Promise<EnsembleReport> {
  const results = await runAll(input, opts);
  return summarize(input, results);
}

export async function runAll(input: EnsembleInput, opts: EnsembleOptions = {}): Promise<RunResult[]> {
  const total = input.runs.length;
  const workers = Math.min(opts.workers ?? availableParallelism(), total);
  const results: RunResult[] = new Array(total);
  if (workers <= 0) {
    input.runs.forEach((spec, i) => {
      results[i] = runOne(input, spec);
      opts.onProgress?.(i + 1, total, results[i]);
    });
    return results;
  }
  const pool = Array.from({ length: workers }, () => new Worker(new URL('./worker-boot.mjs', import.meta.url), { execArgv: [], workerData: { input } }));
  let next = 0, done = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      const feed = (w: Worker) => {
        if (next < total) w.postMessage({ index: next, spec: input.runs[next++] });
      };
      for (const w of pool) {
        w.on('message', (m: { index: number; result?: RunResult; error?: string }) => {
          if (m.error !== undefined) return reject(new Error(`run ${m.index} failed: ${m.error}`));
          results[m.index] = m.result!;
          done++;
          opts.onProgress?.(done, total, m.result!);
          if (done === total) resolve();
          else feed(w);
        });
        w.on('error', reject);
        w.on('exit', (code) => {
          if (done < total) reject(new Error(`ensemble worker exited with code ${code} after ${done} of ${total} runs`));
        });
        feed(w);
      }
    });
  } finally {
    await Promise.all(pool.map((w) => w.terminate()));
  }
  return results;
}

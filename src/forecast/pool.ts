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

export function runAll(input: EnsembleInput, opts: EnsembleOptions = {}): Promise<RunResult[]> {
  return runPooled(input.runs, { worker: new URL('./worker-boot.mjs', import.meta.url), workerData: { input }, serial: (spec) => runOne(input, spec) }, opts);
}

/**
 * How to run one kind of job. `worker` is a thread entry that answers `{ index, job }` with
 * `{ index, result }` or `{ index, error }`; `serial` does the same job in this thread.
 */
export interface PoolTarget<J, R> {
  worker: URL;
  workerData?: unknown;
  serial: (job: J) => R;
}

/** Runs jobs on worker threads, whole jobs per message. Results land by job index, so the output equals a serial run. */
export async function runPooled<J, R>(jobs: readonly J[], target: PoolTarget<J, R>, opts: { workers?: number; onProgress?: (done: number, total: number, result: R) => void } = {}): Promise<R[]> {
  const total = jobs.length;
  const workers = Math.min(opts.workers ?? availableParallelism(), total);
  const results: R[] = new Array(total);
  if (workers <= 0) {
    jobs.forEach((job, i) => {
      results[i] = target.serial(job);
      opts.onProgress?.(i + 1, total, results[i]);
    });
    return results;
  }
  const pool = Array.from({ length: workers }, () => new Worker(target.worker, { execArgv: [], workerData: target.workerData }));
  let next = 0, done = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      const feed = (w: Worker) => {
        if (next < total) w.postMessage({ index: next, job: jobs[next++] });
      };
      for (const w of pool) {
        w.on('message', (m: { index: number; result?: R; error?: string }) => {
          if (m.error !== undefined) return reject(new Error(`run ${m.index} failed: ${m.error}`));
          results[m.index] = m.result!;
          done++;
          opts.onProgress?.(done, total, m.result!);
          if (done === total) resolve();
          else feed(w);
        });
        w.on('error', reject);
        w.on('exit', (code) => {
          if (done < total) reject(new Error(`pool worker exited with code ${code} after ${done} of ${total} runs`));
        });
        feed(w);
      }
    });
  } finally {
    await Promise.all(pool.map((w) => w.terminate()));
  }
  return results;
}

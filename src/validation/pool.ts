/**
 * Runs case draws on worker threads, one whole run per message. Results land by job index, so the
 * output equals a serial run whatever finishes first. Node only.
 */
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { RunSpec } from '../forecast/run';
import { runCase, type CaseResult } from './run';

export interface CaseJob {
  caseId: string;
  spec: RunSpec;
}

export interface PoolOptions {
  /** Worker threads; 0 runs serially in this thread. Default: one per core, at most one per job. */
  workers?: number;
  onProgress?: (done: number, total: number) => void;
}

export async function runJobs(jobs: readonly CaseJob[], opts: PoolOptions = {}): Promise<CaseResult[]> {
  const total = jobs.length;
  const workers = Math.min(opts.workers ?? availableParallelism(), total);
  const results: CaseResult[] = new Array(total);
  if (workers <= 0) {
    jobs.forEach((j, i) => {
      results[i] = runCase(j.caseId, j.spec);
      opts.onProgress?.(i + 1, total);
    });
    return results;
  }
  const pool = Array.from({ length: workers }, () => new Worker(new URL('./worker-boot.mjs', import.meta.url), { execArgv: [] }));
  let next = 0, done = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      const feed = (w: Worker) => {
        if (next < total) w.postMessage({ index: next, job: jobs[next++] });
      };
      for (const w of pool) {
        w.on('message', (m: { index: number; result?: CaseResult; error?: string }) => {
          if (m.error !== undefined) return reject(new Error(`${jobs[m.index].caseId} run ${m.index} failed: ${m.error}`));
          results[m.index] = m.result!;
          done++;
          opts.onProgress?.(done, total);
          if (done === total) resolve();
          else feed(w);
        });
        w.on('error', reject);
        w.on('exit', (code) => {
          if (done < total) reject(new Error(`validation worker exited with code ${code} after ${done} of ${total} runs`));
        });
        feed(w);
      }
    });
  } finally {
    await Promise.all(pool.map((w) => w.terminate()));
  }
  return results;
}

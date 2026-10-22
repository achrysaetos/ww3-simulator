/**
 * The ensemble's Node pool when it also reads Outputs: one worker thread per core, each stepping
 * whole runs through `runWithOutputs`. Results land by run index, so the report is the same
 * whatever finishes first and equals a serial run, as forecast/pool does for metrics alone.
 */
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { NationId } from '../core/types';
import type { EnsembleInput } from '../forecast';
import { runWithOutputs, type OutputsRun } from './outputs-run';

export async function runAllWithOutputs(
  input: EnsembleInput & { world: string },
  nations: readonly NationId[],
  opts: { workers?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<OutputsRun[]> {
  const total = input.runs.length;
  const workers = Math.min(opts.workers ?? availableParallelism(), total);
  const out: OutputsRun[] = new Array(total);
  if (workers <= 0) {
    input.runs.forEach((spec, i) => {
      out[i] = runWithOutputs(input, spec, nations);
      opts.onProgress?.(i + 1, total);
    });
    return out;
  }
  const pool = Array.from({ length: workers }, () => new Worker(new URL('./outputs-worker-boot.mjs', import.meta.url), { execArgv: [], workerData: { input, nations } }));
  let next = 0, done = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      const feed = (w: Worker) => {
        if (next < total) w.postMessage({ index: next, spec: input.runs[next++] });
      };
      for (const w of pool) {
        w.on('message', (m: { index: number; run?: OutputsRun; error?: string }) => {
          if (m.error !== undefined) return reject(new Error(`run ${m.index} failed: ${m.error}`));
          out[m.index] = m.run!;
          done++;
          opts.onProgress?.(done, total);
          if (done === total) resolve();
          else feed(w);
        });
        w.on('error', reject);
        w.on('exit', (code) => {
          if (done < total) reject(new Error(`outputs worker exited with code ${code} after ${done} of ${total} runs`));
        });
        feed(w);
      }
    });
  } finally {
    await Promise.all(pool.map((w) => w.terminate()));
  }
  return out;
}

import { parentPort } from 'node:worker_threads';
import type { CaseJob } from './ensemble';
import { runCase } from './run';

const port = parentPort!;

port.on('message', ({ index, job }: { index: number; job: CaseJob }) => {
  try {
    port.postMessage({ index, result: runCase(job.caseId, job.spec) });
  } catch (e) {
    port.postMessage({ index, error: e instanceof Error ? (e.stack ?? e.message) : String(e) });
  }
});

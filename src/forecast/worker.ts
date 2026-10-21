import { parentPort, workerData } from 'node:worker_threads';
import { runOne, type EnsembleInput, type RunSpec } from './run';

const input = (workerData as { input: EnsembleInput }).input;
const port = parentPort!;

port.on('message', ({ index, spec }: { index: number; spec: RunSpec }) => {
  try {
    port.postMessage({ index, result: runOne(input, spec) });
  } catch (e) {
    port.postMessage({ index, error: e instanceof Error ? (e.stack ?? e.message) : String(e) });
  }
});

import { parentPort, workerData } from 'node:worker_threads';
import type { NationId } from '../core/types';
import type { EnsembleInput, RunSpec } from '../forecast';
import { runWithOutputs } from './outputs-run';

const { input, nations } = workerData as { input: EnsembleInput & { world: string }; nations: NationId[] };
const port = parentPort!;

port.on('message', ({ index, spec }: { index: number; spec: RunSpec }) => {
  try {
    port.postMessage({ index, run: runWithOutputs(input, spec, nations) });
  } catch (e) {
    port.postMessage({ index, error: e instanceof Error ? (e.stack ?? e.message) : String(e) });
  }
});

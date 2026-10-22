import { parentPort } from 'node:worker_threads';
import { runOperation, warmOperationForecast, type OperationForecastInput } from './operation';
import type { RunSpec } from './run';

const port = parentPort!;
/** The forecast this worker is running draws for; sent once per forecast with its first draw. */
let current: { job: number; input: OperationForecastInput } | undefined;

port.on('message', (m: { job: number; input?: OperationForecastInput; index: number; spec: RunSpec }) => {
  try {
    if (m.input) current = { job: m.job, input: m.input };
    if (!current || current.job !== m.job) throw new Error(`no input for forecast ${m.job}`);
    port.postMessage({ job: m.job, index: m.index, run: runOperation(current.input, m.spec) });
  } catch (e) {
    port.postMessage({ job: m.job, index: m.index, error: e instanceof Error ? (e.stack ?? e.message) : String(e) });
  }
});
// Load the map, catalog and systems before the first forecast asks, so a warm pool answers in run time alone.
warmOperationForecast();
port.postMessage({ ready: true });

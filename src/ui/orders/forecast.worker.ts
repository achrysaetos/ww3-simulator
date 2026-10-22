/// <reference lib="webworker" />
import { runOperation, warmOperationForecast, type OperationForecastInput } from '../../forecast/operation';
import type { DrawReply, DrawRequest } from './forecaster';

const scope = self as unknown as DedicatedWorkerGlobalScope;
/** The forecast this worker draws for: its input comes once, with the first draw it is given. */
let current: { job: number; input: OperationForecastInput } | undefined;

scope.onmessage = (ev: MessageEvent<DrawRequest>) => {
  const { job, index, input, spec } = ev.data;
  let reply: DrawReply;
  try {
    if (input) current = { job, input };
    if (current?.job !== job) throw new Error(`no input for forecast ${job}`);
    reply = { job, index, run: runOperation(current.input, spec) };
  } catch (e) {
    reply = { job, index, error: e instanceof Error ? e.message : String(e) };
  }
  scope.postMessage(reply);
};
warmOperationForecast();

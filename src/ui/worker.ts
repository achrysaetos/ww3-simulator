/// <reference lib="webworker" />
import { SimHost } from './host';
import type { FromWorker, ToWorker } from './snapshot';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const host = new SimHost((m: FromWorker) => scope.postMessage(m));
scope.onmessage = (ev: MessageEvent<ToWorker>) => host.handle(ev.data);

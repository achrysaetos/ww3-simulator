/// <reference lib="webworker" />
import { SimHost } from './host';
import type { FromWorker, ToWorker } from './snapshot';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const host = new SimHost((m: FromWorker, transfer: Transferable[] = []) => scope.postMessage(m, transfer));
scope.onmessage = (ev: MessageEvent<ToWorker>) => host.handle(ev.data);

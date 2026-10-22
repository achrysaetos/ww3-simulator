/**
 * A standing pool of worker threads for operation forecasts. The workers load the map and systems once and then answer
 * forecast after forecast, so the staff's estimate costs only its runs. Draws land by index, so a pooled forecast equals
 * a serial one. Node only; the browser's worker runs the same `runOperation`.
 */
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { loadMap } from '../data/load';
import { operationRuns, summarizeOperation, type OperationForecast, type OperationForecastInput, type OperationRun } from './operation';

type Reply = { ready: true } | { job: number; index: number; run?: OperationRun; error?: string };

export class OperationForecastPool {
  private readonly workers: Worker[];
  private readonly ready: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  private job = 0;

  constructor(size = Math.min(8, availableParallelism())) {
    this.workers = Array.from({ length: Math.max(1, size) }, () => new Worker(new URL('./operation-worker-boot.mjs', import.meta.url), { execArgv: [] }));
    this.ready = Promise.all(this.workers.map((w) => new Promise<void>((resolve, reject) => {
      const onMessage = (m: Reply) => {
        if ('ready' in m) {
          w.off('message', onMessage);
          resolve();
        }
      };
      w.on('message', onMessage);
      w.once('error', reject);
    }))).then(() => undefined);
  }

  /** Resolves once every worker has loaded the simulation. */
  warm(): Promise<void> {
    return this.ready;
  }

  /** One forecast of `runs` draws. Forecasts asked for together run one after another. */
  forecast(input: OperationForecastInput, runs = 8): Promise<OperationForecast> {
    const next = this.queue.then(() => this.run(input, runs));
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async run(input: OperationForecastInput, runs: number): Promise<OperationForecast> {
    await this.ready;
    const job = ++this.job;
    const specs = operationRuns(runs);
    const results: OperationRun[] = new Array(specs.length);
    let next = 0, done = 0;
    const sent = new Set<Worker>();
    const listeners: [Worker, (m: Reply) => void][] = [];
    const cleanup = () => listeners.forEach(([w, f]) => w.off('message', f));
    await new Promise<void>((resolve, reject) => {
      const feed = (w: Worker) => {
        if (next >= specs.length) return;
        const index = next++;
        w.postMessage({ job, index, spec: specs[index], ...(sent.has(w) ? {} : { input }) });
        sent.add(w);
      };
      for (const w of this.workers) {
        const onMessage = (m: Reply) => {
          if ('ready' in m || m.job !== job) return;
          if (m.error !== undefined) {
            cleanup();
            return reject(new Error(`forecast run ${m.index} failed: ${m.error}`));
          }
          results[m.index] = m.run!;
          if (++done === specs.length) {
            cleanup();
            resolve();
          } else feed(w);
        };
        listeners.push([w, onMessage]);
        w.on('message', onMessage);
        feed(w);
      }
    });
    return summarizeOperation(input, loadMap(), results);
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
  }
}

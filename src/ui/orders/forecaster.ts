/**
 * The staff forecast in the browser: the draws of `forecastOperation` (forecast/operation.ts) spread
 * over a few Web Workers, then summarised on the page exactly as the serial forecast summarises them.
 * The input is built in the sim worker from the player's believed world (host.ts 'forecast'), never
 * from the truth.
 */
import type { GameMap } from '../../core/map';
import { operationRuns, summarizeOperation, type OperationForecast, type OperationForecastInput, type OperationRun } from '../../forecast/operation';
import type { RunSpec } from '../../forecast/run';

/** One draw for a worker. The input comes with a job's first draw to each worker, which keeps it for the rest. */
export interface DrawRequest { job: number; index: number; input?: OperationForecastInput; spec: RunSpec }
export type DrawReply = { job: number; index: number; run: OperationRun } | { job: number; index: number; error: string };

/** What the forecaster needs of a Worker, so a test can stand one in. */
export interface DrawWorker {
  postMessage(m: DrawRequest): void;
  onmessage: ((ev: MessageEvent<DrawReply>) => void) | null;
}

/** Runs per forecast: A2b's default ensemble (forecast/operation.ts forecastOperation). */
export const FORECAST_RUNS = 8;
/** Days the planner war-games a plan over: long enough for a brigade-sized push to reach its objective or stall. */
export const FORECAST_DAYS = 10;

interface Job {
  id: number;
  input: OperationForecastInput;
  specs: RunSpec[];
  next: number;
  results: (OperationRun | undefined)[];
  done: number;
  seen: Set<DrawWorker>;
  onProgress(done: number, total: number): void;
  resolve(f: OperationForecast): void;
  reject(e: Error): void;
}

export class Forecaster {
  private workers: DrawWorker[] = [];
  private readonly idle: DrawWorker[] = [];
  private job: Job | null = null;
  private jobs = 0;

  constructor(private readonly map: GameMap, private readonly spawn: () => DrawWorker, private readonly size: number) {}

  /** Forecast `input` over `runs` draws. A newer call supersedes this one, whose promise then never settles. */
  run(input: OperationForecastInput, runs = FORECAST_RUNS, onProgress: (done: number, total: number) => void = () => {}): Promise<OperationForecast> {
    if (!this.workers.length) {
      this.workers = Array.from({ length: this.size }, () => this.spawn());
      for (const w of this.workers) {
        w.onmessage = (ev) => this.receive(w, ev.data);
        this.idle.push(w);
      }
    }
    return new Promise((resolve, reject) => {
      const specs = operationRuns(runs);
      this.job = { id: ++this.jobs, input, specs, next: 0, results: new Array(specs.length), done: 0, seen: new Set(), onProgress, resolve, reject };
      onProgress(0, specs.length);
      while (this.idle.length && this.dispatch(this.idle.pop()!));
    });
  }

  /** Gives `w` the current job's next draw; false when there is none left, and `w` goes idle. */
  private dispatch(w: DrawWorker): boolean {
    const job = this.job;
    if (!job || job.next >= job.specs.length) {
      if (!this.idle.includes(w)) this.idle.push(w);
      return false;
    }
    const index = job.next++;
    w.postMessage({ job: job.id, index, spec: job.specs[index], ...(job.seen.has(w) ? {} : { input: job.input }) });
    job.seen.add(w);
    return true;
  }

  private receive(w: DrawWorker, m: DrawReply): void {
    const job = this.job;
    if (job && m.job === job.id) {
      if ('error' in m) {
        this.job = null;
        job.reject(new Error(m.error));
      } else {
        job.results[m.index] = m.run;
        job.onProgress(++job.done, job.specs.length);
        if (job.done === job.specs.length) {
          this.job = null;
          job.resolve(summarizeOperation(job.input, this.map, job.results as OperationRun[]));
        }
      }
    }
    this.dispatch(w);
  }
}

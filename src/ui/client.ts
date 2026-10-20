import { loadMap } from '../data/load';
import type { Command, FormationId, NationId, SimEvent } from '../core/types';
import { applySnapshot, emptyClientState, type ClientState, type FromWorker, type SessionMeta, type ToWorker } from './snapshot';

export interface LoggedEvent {
  seq: number;
  event: SimEvent;
}

const LOG_LIMIT = 2_000;

/**
 * Main-thread handle on the simulation worker. Holds the decoded mirror of the
 * World and notifies React and the map renderer when a snapshot lands.
 */
export class SimClient {
  readonly map = loadMap();
  state: ClientState = emptyClientState(this.map.size);
  meta: SessionMeta | null = null;
  log: LoggedEvent[] = [];
  version = 0;
  stepMs = 0;
  error: string | null = null;
  inFlight = false;
  private seq = 0;
  private readonly worker: Worker;
  private readonly listeners = new Set<() => void>();

  constructor(scenario: string) {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.receive(ev.data);
    this.worker.onerror = (ev) => {
      this.error = ev.message || 'worker failed to load';
      this.notify();
    };
    this.send({ type: 'init', scenario });
  }

  private receive(msg: FromWorker) {
    if (msg.type === 'error') {
      this.error = msg.message;
      this.inFlight = false;
    } else {
      if (msg.type === 'ready') this.meta = msg.meta;
      else {
        if (msg.stepMs !== undefined) {
          this.stepMs = msg.stepMs;
          this.inFlight = false;
        }
      }
      applySnapshot(this.state, msg.snapshot);
      for (const event of msg.snapshot.events) this.log.push({ seq: this.seq++, event });
      if (this.log.length > LOG_LIMIT) this.log.splice(0, this.log.length - LOG_LIMIT);
    }
    this.notify();
  }

  private notify() {
    this.version++;
    for (const l of this.listeners) l();
  }

  private send(m: ToWorker) {
    this.worker.postMessage(m);
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };

  getVersion = () => this.version;

  step(n: number) {
    if (this.inFlight || !this.meta) return false;
    this.inFlight = true;
    this.send({ type: 'step', n });
    return true;
  }

  command(c: Command) {
    this.send({ type: 'command', command: c });
  }

  playAs(nation: NationId) {
    this.send({ type: 'play_as', nation });
  }

  focus(nation?: NationId, formation?: FormationId) {
    this.send({ type: 'focus', nation, formation });
  }
}

import { loadMap } from '../data/load';
import type { Command, FormationId, NationId, SimEvent } from '../core/types';
import { PlaceNamer, type Namer } from './events';
import { EventFeed } from './feed';
import {
  applySnapshot, emptyClientState, type ClientState, type FromWorker, type NationCard, type RunStats, type ScenarioCard, type SessionMeta, type ToWorker,
} from './snapshot';

/**
 * Main-thread handle on the simulation worker. Holds the decoded mirror of the
 * World and notifies React and the map renderer when a snapshot lands. Every
 * snapshot is acked once applied, which is what paces the worker.
 */
export class SimClient {
  readonly map = loadMap();
  readonly places = new PlaceNamer(this.map);
  state: ClientState = emptyClientState(this.map.size);
  scenarios: ScenarioCard[] = [];
  nationCards = new Map<NationId, NationCard>();
  meta: SessionMeta | null = null;
  /** The nation the player took command of at start. */
  playing: NationId | null = null;
  starting = false;
  readonly feed = new EventFeed();
  private formationNames = new Map<FormationId, string>();
  private namesVersion = -1;
  version = 0;
  stats: RunStats = { stepMs: 0, achievedTps: 0 };
  ticksPerSec = 0;
  error: string | null = null;
  private readonly worker: Worker;
  private readonly listeners = new Set<() => void>();

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.receive(ev.data);
    this.worker.onerror = (ev) => {
      this.error = ev.message || 'worker failed to load';
      this.notify();
    };
  }

  private receive(msg: FromWorker) {
    switch (msg.type) {
      case 'error':
        this.error = msg.message;
        this.ticksPerSec = 0;
        this.starting = false;
        break;
      case 'hello':
        this.scenarios = msg.scenarios;
        this.nationCards = new Map(msg.nations.map((n) => [n.id, n]));
        break;
      case 'ready':
      case 'snapshot':
        if (msg.type === 'ready') {
          this.meta = msg.meta;
          this.starting = false;
        } else this.stats = msg.stats;
        applySnapshot(this.state, msg.snapshot, this.meta!.nationIds, this.nationCards);
        this.send({ type: 'ack' });
        this.record(msg.snapshot.events);
        break;
    }
    this.notify();
  }

  readonly namer: Namer = {
    nation: (id) => this.nationCards.get(id)?.name ?? id,
    formation: (id) => this.formationNames.get(id),
    item: (id) => this.namer.known(id) ?? id.replace(/_/g, ' '),
    known: (id) => this.meta?.platforms[id]?.name ?? this.meta?.munitions[id]?.name,
    place: this.places,
  };

  private record(events: readonly SimEvent[]) {
    if (!events.length) return;
    if (this.namesVersion !== this.state.rosterVersion) {
      for (const f of this.state.formations) this.formationNames.set(f.entry.id, f.entry.name);
      this.namesVersion = this.state.rosterVersion;
    }
    this.feed.record(events, this.namer);
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

  start(scenario: string, nation: NationId, seed = 1) {
    this.starting = true;
    this.playing = nation;
    this.notify();
    this.send({ type: 'start', scenario, nation, seed });
  }

  setSpeed(ticksPerSec: number) {
    this.ticksPerSec = ticksPerSec;
    this.send({ type: 'speed', ticksPerSec });
    this.notify();
  }

  step() {
    if (this.meta && !this.ticksPerSec) this.send({ type: 'step' });
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

import { loadMap } from '../data/load';
import type { Command, FormationId, NationId, SimEvent } from '../core/types';
import { describeResult, PlaceNamer, type Namer } from './events';
import { EventFeed } from './feed';
import { readSlot, writeSlot, type SlotInfo } from './slot';
import type { Action, Card } from './staff/advice';
import { StaffDesk } from './staff/desk';
import {
  applySnapshot, emptyClientState, type ClientState, type FromWorker, type NationCard, type RunStats, type ScenarioCard, type SessionMeta, type ToWorker,
} from './snapshot';

export interface Notice { text: string; tone: 'info' | 'error'; seq: number }

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
  /** The nation the player commands, fixed for the session: a new game is how you play another. */
  playing: NationId | null = null;
  starting = false;
  /** Bumped each time a game starts or loads, so the UI remounts with fresh state. */
  sessionId = 0;
  feed = new EventFeed();
  /** The player's staff for this session: advisor cards, the brief, and what came of each order given from them. */
  desk: StaffDesk | null = null;
  private formationNames = new Map<FormationId, string>();
  private namesVersion = -1;
  version = 0;
  stats: RunStats = { stepMs: 0, achievedTps: 0 };
  ticksPerSec = 0;
  error: string | null = null;
  /** The latest thing the engine answered to a command, or a save or load reported, for a toast. */
  notice: Notice | null = null;
  /** The quick-save slot's contents, when one exists. */
  slot: SlotInfo | null = null;
  private saveTo: 'download' | 'slot' | null = null;
  private noticeSeq = 0;
  private readonly worker: Worker;
  private readonly listeners = new Set<() => void>();

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.receive(ev.data);
    this.worker.onerror = (ev) => {
      this.error = ev.message || 'worker failed to load';
      this.notify();
    };
    void readSlot().then((s) => {
      if (!s) return;
      this.slot = { scenario: s.scenario, tick: s.tick, savedAt: s.savedAt };
      this.notify();
    });
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
      case 'refused':
        this.say(`Order not sent: ${msg.reason}`, 'error');
        break;
      case 'load_failed':
        this.starting = false;
        this.say(`Could not load the save: ${msg.message}`, 'error');
        break;
      case 'saved':
        void this.store(msg.text, msg.scenario, msg.tick);
        return;
      case 'closed':
        this.reset();
        break;
      case 'ready':
      case 'snapshot':
        if (msg.type === 'ready') {
          this.reset();
          this.sessionId++;
          this.meta = msg.meta;
          this.playing = msg.playing;
          this.starting = false;
          this.desk = new StaffDesk(this.map, msg.meta, msg.playing, this.namer);
        } else this.stats = msg.stats;
        applySnapshot(this.state, msg.snapshot, this.meta!.nationIds, this.nationCards);
        this.send({ type: 'ack' });
        this.record(msg.snapshot.events);
        this.answer(msg.snapshot.events);
        this.desk?.observe(this.state, msg.snapshot.events, this.state.focusNation?.id === this.playing ? this.state.focusNation : undefined);
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

  /**
   * Toast the engine's answers to the player's commands: every refusal, and the acceptance of an order
   * with when it takes effect. Other acceptances were already announced when the command was sent.
   */
  private answer(events: readonly SimEvent[]) {
    for (const e of events) {
      if (e.type !== 'command_result' || e.nation !== this.playing) continue;
      if (!e.ok) this.say(describeResult(e, this.namer), 'error');
      else if (e.command === 'order') this.say(describeResult(e, this.namer), 'info');
    }
  }

  private say(text: string, tone: Notice['tone']) {
    this.notice = { text, tone, seq: ++this.noticeSeq };
  }

  /** Forget the previous session's mirror, so a new or loaded game starts clean. */
  private reset() {
    this.state = emptyClientState(this.map.size);
    this.feed = new EventFeed();
    this.desk = null;
    this.formationNames.clear();
    this.namesVersion = -1;
    this.meta = null;
    this.playing = null;
    this.ticksPerSec = 0;
    this.stats = { stepMs: 0, achievedTps: 0 };
    this.error = null;
  }

  private async store(text: string, scenario: string, tick: number) {
    const to = this.saveTo;
    this.saveTo = null;
    const name = `ww3-${scenario}-D${Math.floor((tick * (this.meta?.dtHours ?? 6)) / 24)}.json`;
    if (to === 'download') {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      this.say(`Saved as ${name}.`, 'info');
    } else if (to === 'slot') {
      const info = { scenario, tick, savedAt: new Date().toISOString() };
      if (await writeSlot({ ...info, text })) {
        this.slot = info;
        this.say("Saved to this browser's quick-save slot.", 'info');
      } else this.say('This browser would not store the save. Use Download instead.', 'error');
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

  start(scenario: string, nation: NationId, seed = 1) {
    this.starting = true;
    this.notify();
    this.send({ type: 'start', scenario, nation, seed });
  }

  /** Save the running game as a file download or into the browser's quick-save slot. */
  save(to: 'download' | 'slot') {
    if (!this.meta) return;
    this.saveTo = to;
    this.send({ type: 'save' });
  }

  /** Resume from save text: a chosen file's, or the quick-save slot's when omitted. */
  async load(text?: string) {
    const body = text ?? (await readSlot())?.text;
    if (!body) {
      this.say('The quick-save slot is empty.', 'error');
      this.notify();
      return;
    }
    this.starting = true;
    this.notify();
    this.send({ type: 'load', text: body });
  }

  /** End the game and go back to the start screen. */
  quit() {
    this.send({ type: 'quit' });
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

  /** The player pressed a button on a staff card: a command goes to the engine and the card waits for its answer. */
  act(card: Card, action: Action) {
    if (!this.desk) return;
    this.desk.act(card, action);
    if (action.kind === 'command') this.command(action.command);
    this.notify();
  }

  /** Redraw after a change that lives only in the page, such as dismissing a card. */
  touch() {
    this.notify();
  }

  focus(nation?: NationId, formation?: FormationId) {
    this.send({ type: 'focus', nation, formation });
  }
}

import { loadMap } from '../data/load';
import { COMMAND_DOMAINS, type Command, type FormationId, type NationId, type NodeId, type SimEvent } from '../core/types';
import type { OperationForecast, OperationForecastInput, OperationPlan } from '../forecast/operation';
import { FORECAST_RUNS, Forecaster, type DrawWorker } from './orders/forecaster';
import type { DragKit } from './drag/kit';
import type { PriorityEffect } from '../systems/logistics';
import { OrderTracks } from './orders/tracks';
import { GameClock } from './clock';
import { describeResult, humanizeReason, PlaceNamer, type Namer } from './events';
import { EventFeed } from './feed';
import { glidesFrom, nodesOf } from './glide';
import { nationName } from './placeNames';
import { dtHoursIn, readSlot, writeSlot, type SlotInfo } from './slot';
import type { Action, Card } from './staff/advice';
import { StaffDesk } from './staff/desk';
import { roleById, type Delegation, type RoleId } from './staff/roles';
import {
  applySnapshot, emptyClientState, type ClientState, type FromWorker, type NationCard, type ScenarioCard, type SessionMeta, type Snapshot, type ToWorker,
} from './snapshot';

export interface Notice { text: string; tone: 'info' | 'error'; seq: number }

/** Web Workers for the staff forecast: one core stays with the simulation and one with the page. */
const forecastWorkers = () => Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 2));

/**
 * Main-thread handle on the simulation worker. Holds the decoded mirror of the
 * World and notifies React and the map renderer when a tick is shown. Its clock
 * paces the game: the worker steps only when the clock asks for the next tick.
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
  /** The time the player sees, for the session; null on the start screen. */
  clock: GameClock | null = null;
  /** Where each formation that stepped to a neighbouring node in the latest tick came from, for the map to glide it. */
  glides: ReadonlyMap<FormationId, NodeId> = new Map();
  error: string | null = null;
  /** The latest thing the engine answered to a command, or a save or load reported, for a toast. */
  notice: Notice | null = null;
  /** The quick-save slot's contents, when one exists. */
  slot: SlotInfo | null = null;
  /**
   * Domains the role picked at start hands to or takes from the staff, until the engine applies
   * the delegation on the first tick; empty for a loaded game.
   */
  openingDelegation: Partial<Delegation> = {};
  /** The player's orders from sent to answered, for the map and the unit card. */
  tracks = new OrderTracks();
  private startRole: RoleId | null = null;
  private saveTo: 'download' | 'slot' | null = null;
  private noticeSeq = 0;
  private readonly worker: Worker;
  private readonly listeners = new Set<() => void>();
  private asked = 0;
  private readonly waiting = new Map<number, { resolve(v: never): void; reject(e: Error): void }>();
  private forecaster: Forecaster | null = null;
  /** Snapshots from the engine's prefetched tick on, not yet shown. */
  private queued: Snapshot[] = [];
  private readonly answered = new WeakSet<Snapshot>();
  private readonly clockListeners = new Set<() => void>();
  private frame = 0;

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.receive(ev.data);
    this.worker.onerror = (ev) => {
      this.error = ev.message || 'worker failed to load';
      this.notify();
    };
    void readSlot().then((s) => {
      if (!s) return;
      this.slot = { scenario: s.scenario, tick: s.tick, savedAt: s.savedAt, dtHours: dtHoursIn(s.text) };
      this.notify();
    });
  }

  private receive(msg: FromWorker) {
    switch (msg.type) {
      case 'error':
        this.error = msg.message;
        this.clock?.setRate(0, performance.now());
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
      case 'drag_kit':
        this.settle(msg.seq, msg.kit);
        return;
      case 'supply_effect':
        this.settle(msg.seq, msg.effect);
        return;
      case 'forecast_input':
        if (msg.input) this.settle(msg.seq, msg.input);
        else this.settle(msg.seq, new Error(msg.reason ?? 'the staff cannot forecast this plan'));
        return;
      case 'ready':
        this.reset();
        this.sessionId++;
        this.meta = msg.meta;
        this.playing = msg.playing;
        this.starting = false;
        this.desk = new StaffDesk(this.map, msg.meta, msg.playing, this.namer);
        this.clock = new GameClock(msg.meta.dtHours, msg.snapshot.tick, performance.now());
        this.apply(msg.snapshot);
        this.openingDelegation = this.pendingDelegation();
        break;
      case 'snapshot':
        // Snapshots are diffs, so a new tick waits with everything sent after it until the clock reaches the tick it extends.
        if (this.clock?.arrived(msg.snapshot.tick)) {
          this.queued.push(msg.snapshot);
          this.run(performance.now());
          return;
        }
        if (this.queued.length) {
          this.queued.push(msg.snapshot);
          this.answerEarly(msg.snapshot);
          break;
        }
        this.apply(msg.snapshot);
        break;
    }
    this.notify();
  }

  /**
   * A focus change or a refusal sent while a tick waits answers at once, even paused: the focus
   * details are whole values rather than diffs, so they can go ahead of the tick they came with.
   */
  private answerEarly(snap: Snapshot) {
    this.state.focusNation = snap.focusNation;
    this.state.focusFormation = snap.focusFormation;
    this.state.focusContact = snap.focusContact;
    this.answer(snap.events);
    this.tracks.observe(snap.events, this.state.tick, (r) => humanizeReason(r, this.namer));
    this.answered.add(snap);
  }

  private apply(snap: Snapshot) {
    applySnapshot(this.state, snap, this.meta!.nationIds, this.nationCards);
    if (snap.history) this.record(snap.history);
    this.record(snap.events);
    if (!this.answered.delete(snap)) {
      this.answer(snap.events);
      this.tracks.observe(snap.events, this.state.tick, (r) => humanizeReason(r, this.namer));
    }
    this.desk?.observe(this.state, snap.events, this.state.focusNation?.id === this.playing ? this.state.focusNation : undefined);
  }

  /** The next held tick, with the snapshots that came after it at the same tick, and which formations glide in it. */
  private applyTick() {
    const before = nodesOf(this.state.formations);
    this.apply(this.queued.shift()!);
    while (this.queued[0]?.tick === this.state.tick) this.apply(this.queued.shift()!);
    this.glides = glidesFrom(before, this.state.formations, this.map);
    this.notify();
  }

  readonly namer: Namer = {
    nation: (id) => nationName(id, this.nationCards.get(id)?.name),
    formation: (id) => this.formationNames.get(id),
    item: (id) => this.namer.known(id) ?? id.replace(/_/g, ' '),
    known: (id) => this.meta?.platforms[id]?.name ?? this.meta?.munitions[id]?.name,
    domain: (id) => this.meta?.platforms[id]?.domain,
    place: this.places,
  };

  private pendingDelegation(): Partial<Delegation> {
    const role = this.startRole ? roleById(this.startRole) : undefined;
    const ai = this.state.focusNation?.authority.ai;
    this.startRole = null;
    if (!role || !ai) return {};
    return Object.fromEntries(COMMAND_DOMAINS.filter((k) => ai[k] !== role.ai[k]).map((k) => [k, role.ai[k]]));
  }

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
      else if (e.command === 'order' || e.operation) this.say(describeResult(e, this.namer), 'info');
    }
  }

  private settle(seq: number, value: unknown) {
    const w = this.waiting.get(seq);
    if (!w) return;
    this.waiting.delete(seq);
    if (value instanceof Error) w.reject(value);
    else w.resolve(value as never);
  }

  private ask<T>(m: (seq: number) => ToWorker): Promise<T> {
    const seq = ++this.asked;
    return new Promise<T>((resolve, reject) => {
      this.waiting.set(seq, { resolve: resolve as (v: never) => void, reject });
      this.send(m(seq));
    });
  }

  /** What a drag of `formations` aims with, from the player's picture of the war; null when none of them can be dragged. */
  dragKit(formations: readonly FormationId[]): Promise<DragKit | null> {
    return this.ask((seq) => ({ type: 'drag_kit', seq, formations: [...formations] }));
  }

  /** What giving `node` the player's supply priority would move; null when the player does not hold it. */
  supplyEffect(node: NodeId): Promise<PriorityEffect | null> {
    return this.ask((seq) => ({ type: 'supply_effect', seq, node }));
  }

  /** The staff's forecast for a plan, from the player's picture of the war. */
  async forecast(plan: OperationPlan, days: number, onProgress: (done: number, total: number) => void): Promise<OperationForecast> {
    const input = await this.ask<OperationForecastInput>((seq) => ({ type: 'forecast', seq, plan, days }));
    this.forecaster ??= new Forecaster(this.map, () => new Worker(new URL('./orders/forecast.worker.ts', import.meta.url), { type: 'module' }) as unknown as DrawWorker, forecastWorkers());
    return this.forecaster.run(input, FORECAST_RUNS, onProgress);
  }

  /** Sends the player's order and follows it on the map until the engine answers. */
  order(c: Extract<Command, { type: 'order' }>, label: string) {
    this.tracks.sent(c.formation, label, c.order.target ?? null, this.state.tick);
    this.command(c);
    this.notify();
  }

  private say(text: string, tone: Notice['tone']) {
    this.notice = { text, tone, seq: ++this.noticeSeq };
  }

  /** Forget the previous session's mirror, so a new or loaded game starts clean. */
  private reset() {
    this.state = emptyClientState(this.map.size);
    this.feed = new EventFeed();
    this.tracks = new OrderTracks();
    this.desk = null;
    this.formationNames.clear();
    this.namesVersion = -1;
    this.meta = null;
    this.playing = null;
    this.clock = null;
    this.glides = new Map();
    this.queued = [];
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.error = null;
  }

  private async store(text: string, scenario: string, tick: number) {
    const to = this.saveTo;
    this.saveTo = null;
    const dtHours = dtHoursIn(text);
    const name = `ww3-${scenario}-D${Math.floor((tick * dtHours) / 24)}.json`;
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
        this.slot = { ...info, dtHours };
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

  start(scenario: string, nation: NationId, role?: RoleId, seed = 1) {
    this.clock?.setRate(0, performance.now());
    this.starting = true;
    this.notify();
    this.startRole = role ?? null;
    this.send({ type: 'start', scenario, nation, seed, role });
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
    this.clock?.setRate(0, performance.now());
    this.starting = true;
    this.startRole = null;
    this.notify();
    this.send({ type: 'load', text: body });
  }

  /** End the game and go back to the start screen. */
  quit() {
    this.send({ type: 'quit' });
  }

  /** Game hours per real second the clock runs at: 0 pauses, Infinity runs as fast as the engine steps. */
  get speed(): number {
    return this.clock?.rate ?? 0;
  }

  /** The clock's pace in engine ticks, for tests that think in ticks. */
  get ticksPerSec(): number {
    return this.clock ? this.clock.rate / this.clock.dtHours : 0;
  }

  setSpeed(hoursPerSec: number) {
    if (!this.clock) return;
    this.clock.setRate(hoursPerSec, performance.now());
    this.run(performance.now());
    this.notify();
  }

  step() {
    if (!this.clock) return;
    if (this.clock.step()) this.send({ type: 'step' });
    this.run(performance.now());
  }

  /** The clock's whole hours since tick 0, which change far more often than snapshots land. */
  shownHour = () => (this.clock ? Math.floor(this.clock.shown) : 0);

  subscribeClock = (fn: () => void) => {
    this.clockListeners.add(fn);
    return () => void this.clockListeners.delete(fn);
  };

  /** One frame of the clock: run the shown time, ask for the next tick when it is due, and keep going while the clock runs. */
  private readonly run = (now: number) => {
    this.frame = 0;
    const c = this.clock;
    if (!c) return;
    const hour = this.shownHour();
    for (let due = c.advance(now); due; due = c.advance(now)) {
      if (due === 'ask') this.send({ type: 'step' });
      else this.applyTick();
    }
    if (this.shownHour() !== hour) for (const l of this.clockListeners) l();
    if (c.rate && !this.frame) this.frame = requestAnimationFrame(this.run);
  };

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

  focus(nation?: NationId, formation?: FormationId) {
    this.send({ type: 'focus', nation, formation });
  }
}

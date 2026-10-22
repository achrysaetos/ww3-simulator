/**
 * The player's staff over time: the events it keeps in mind, a day-by-day record for the brief
 * and the top bar, the cards in front of the player, and what became of each card the player
 * acted on. One desk per game session; it holds UI state only and never touches the World.
 */
import type { GameMap } from '../../core/map';
import type { FormationId, MunitionKind, NationId, NodeId, SimEvent } from '../../core/types';
import type { Namer } from '../events';
import type { ClientState, NationDetail, SessionMeta } from '../snapshot';
import { advise, answerOf, isDecision, RAID_KINDS, RECENT_TICKS, type Action, type Answer, type Card, type CommandAction, type Situation } from './advice';

/** One game day, as the staff saw it. */
export interface Day {
  day: number;
  /** Land cells held at the latest tick of the day. */
  held: number;
  warSupport: number;
  ammo: number;
  raids: { fired: number; intercepted: number };
  gained: NodeId[];
  lost: NodeId[];
}

/** What became of a card the player acted on. */
export interface Sent {
  card: Card;
  action: CommandAction;
  tick: number;
  answer: Answer | null;
  /** No answer came in time. */
  silent: boolean;
}

export const BRIEF_CADENCES = ['matters', 'daily', 'weekly'] as const;
export type BriefCadence = (typeof BRIEF_CADENCES)[number];

const DAYS_KEPT = 15;
/** Ticks to wait for an answer that is not an order in transit. */
const ANSWER_TICKS = 3;
/** Ticks an answered card stays on the table before it folds away. */
const SHOW_ANSWER_TICKS = 4;
const BRIEF_HOUR = 6;

const KEPT: ReadonlySet<SimEvent['type']> = new Set(['strike', 'nuclear_detonation', 'nuclear_alert', 'node_captured', 'command_result', 'war_declared', 'peace', 'capitulation', 'message', 'shortage']);

export class StaffDesk {
  recent: SimEvent[] = [];
  readonly days: Day[] = [];
  /** Bumped on every change the UI shows. */
  version = 0;
  private pool: Card[] = [];
  private readonly dismissed = new Set<string>();
  private readonly sent = new Map<string, Sent>();
  /** Decisions already put in front of the player in a brief. */
  private readonly briefed = new Set<string>();
  private lastBriefDay = -1;
  private tick = 0;
  /** The highest nuclear step any war the player is in has reached: 0 none, 1 an alert, 2 a detonation. */
  nuclearStep = 0;
  /** The player's orders still moving down a degraded chain of command: hours until each arrives, by formation. */
  inTransit = new Map<FormationId, number>();

  constructor(private readonly map: GameMap, private readonly meta: SessionMeta, readonly me: NationId, private readonly namer: Namer) {}

  /** Take in one snapshot's worth of the world, as the player sees it. */
  observe(state: ClientState, events: readonly SimEvent[], d: NationDetail | undefined): void {
    this.tick = state.tick;
    for (const e of events) if (KEPT.has(e.type) && (e.type !== 'strike' || this.involvesMe(e, state))) this.recent.push(e);
    const from = state.tick - RECENT_TICKS;
    if (this.recent.length && this.recent[0].tick < from) this.recent = this.recent.filter((e) => e.tick >= from);
    if (!d) return;
    const enemies = new Set(d.enemies);
    for (const e of events) {
      if (e.type === 'nuclear_detonation') this.nuclearStep = 2;
      else if (e.type === 'nuclear_alert' && (enemies.has(e.nation) || e.nation === this.me)) this.nuclearStep = Math.max(this.nuclearStep, 1);
    }
    this.record(state, events, d);
    const situation: Situation = {
      me: this.me, tick: state.tick, dtHours: this.meta.dtHours, map: this.map, nationIds: this.meta.nationIds, control: state.control,
      formations: state.formations, nations: state.nations, d, recent: this.recent, namer: this.namer, ammoPerDay: this.ammoPerDay(),
      munitionKind: (id) => this.meta.munitions[id]?.kind as MunitionKind | undefined,
      unitCostUsdM: (id) => this.meta.munitions[id]?.costUsdM ?? this.meta.platforms[id]?.costUsdM ?? 0,
    };
    this.pool = advise(situation);
    this.inTransit = new Map();
    for (const e of this.recent) {
      if (e.type !== 'command_result' || e.nation !== this.me || e.command !== 'order' || !e.formation) continue;
      const left = e.ok && e.code === 'relayed' ? (e.etaHours ?? 0) - (state.tick - e.tick) * this.meta.dtHours : 0;
      if (left > 0) this.inTransit.set(e.formation, left);
      else this.inTransit.delete(e.formation);
    }
    for (const [key, s] of this.sent) {
      if (!s.answer?.final) {
        const a = answerOf(s.action.command, s.tick, situation);
        if (a) s.answer = a;
        else if (!s.answer && state.tick - s.tick > ANSWER_TICKS) s.silent = true;
      }
      const settled = s.answer?.final || s.silent;
      if (settled && state.tick - s.tick > SHOW_ANSWER_TICKS + ANSWER_TICKS) this.sent.delete(key);
    }
    this.version++;
  }

  private involvesMe(e: Extract<SimEvent, { type: 'strike' }>, state: ClientState): boolean {
    const i = this.meta.nationIds.indexOf(this.me);
    return e.by === this.me || state.control[e.target] === i;
  }

  private record(state: ClientState, events: readonly SimEvent[], d: NationDetail): void {
    const day = Math.floor((state.tick * this.meta.dtHours) / 24);
    let rec = this.days[this.days.length - 1];
    if (!rec || rec.day !== day) {
      rec = { day, held: d.nodesHeld, warSupport: 0, ammo: 0, raids: { fired: 0, intercepted: 0 }, gained: [], lost: [] };
      this.days.push(rec);
      if (this.days.length > DAYS_KEPT) this.days.shift();
    }
    rec.held = d.nodesHeld;
    rec.warSupport = state.nations.get(this.me)?.warSupport ?? 0;
    rec.ammo = d.bulk.ammo;
    const mine = this.meta.nationIds.indexOf(this.me);
    for (const e of events) {
      if (e.type === 'strike' && e.by !== this.me && state.control[e.target] === mine && RAID_KINDS[this.meta.munitions[e.munition]?.kind as MunitionKind]) {
        rec.raids.fired += e.fired;
        rec.raids.intercepted += e.intercepted;
      } else if (e.type === 'node_captured' && !this.map.isSea(e.node)) {
        if (e.to === this.me) rec.gained.push(e.node);
        else if (e.from === this.me) rec.lost.push(e.node);
      }
    }
  }

  /** Net national ammunition used per day over the last full days on record. */
  private ammoPerDay(): number | null {
    const full = this.days.slice(0, -1).slice(-4);
    if (full.length < 2) return null;
    return (full[0].ammo - full[full.length - 1].ammo) / (full.length - 1);
  }

  /** Land cells gained (positive) or lost over the last `n` days. */
  frontChange(n: number): number | null {
    if (this.days.length < 2) return null;
    const now = this.days[this.days.length - 1];
    const then = this.days.find((x) => x.day >= now.day - n) ?? this.days[0];
    return now.held - then.held;
  }

  /** Cards on the table: fresh ones the player has not dismissed or acted on. */
  get cards(): Card[] {
    return this.pool.filter((c) => !this.dismissed.has(c.key) && !this.sent.has(c.key));
  }

  /** Cards the player acted on, newest first, with the engine's answer once it comes. */
  get answered(): Sent[] {
    return [...this.sent.values()].sort((a, b) => b.tick - a.tick);
  }

  /** Decisions for the Daily Brief, most pressing first. */
  get decisions(): Card[] {
    return this.cards.filter(isDecision);
  }

  /** The player chose an action: record a command so its answer can be shown, or put the card away. */
  act(card: Card, action: Action): void {
    if (action.kind === 'command') this.sent.set(card.key, { card, action, tick: this.tick, answer: null, silent: false });
    else if (action.kind === 'later') this.dismissed.add(card.key);
    this.version++;
  }

  dismiss(key: string): void {
    this.dismissed.add(key);
    this.sent.delete(key);
    this.version++;
  }

  /**
   * Whether the Daily Brief should open now: at once for an urgent decision not yet briefed;
   * otherwise at 06:00 by the chosen cadence, and under 'matters' only with a new decision waiting.
   */
  briefDue(date: Date, cadence: BriefCadence): boolean {
    const fresh = this.decisions.filter((c) => !this.briefed.has(c.key));
    if (fresh.some((c) => c.urgent)) return true;
    const day = Math.floor((this.tick * this.meta.dtHours) / 24);
    if (date.getUTCHours() !== BRIEF_HOUR || day === this.lastBriefDay || day === 0) return false;
    if (cadence === 'daily') return true;
    if (cadence === 'weekly') return day % 7 === 0;
    return fresh.length > 0;
  }

  /** The brief is open: what it shows now counts as briefed. */
  briefOpened(): void {
    for (const c of this.decisions) this.briefed.add(c.key);
    this.lastBriefDay = Math.floor((this.tick * this.meta.dtHours) / 24);
    this.version++;
  }

  /** The days since the last brief, for the brief's overnight column (at least the last one). */
  since(days: number): Day[] {
    return this.days.slice(-Math.max(1, days));
  }
}

/**
 * The player's staff over time: the events it keeps in mind, a day-by-day record for the top
 * bar, the cards behind crises and alerts, and what became of each card the player acted on.
 * One desk per game session; it holds UI state only and never touches the World.
 */
import type { GameMap } from '../../core/map';
import type { FormationId, MunitionKind, NationId, SimEvent } from '../../core/types';
import type { Namer } from '../events';
import type { ClientState, NationDetail, SessionMeta } from '../snapshot';
import { advise, answerOf, isDecision, RECENT_TICKS, type Action, type Answer, type Card, type CommandAction, type Situation } from './advice';

/** One game day, as the staff saw it. */
export interface Day {
  day: number;
  /** Land cells held at the latest tick of the day. */
  held: number;
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

const DAYS_KEPT = 15;
/** Ticks to wait for an answer that is not an order in transit. */
const ANSWER_TICKS = 3;
/** Ticks an answered card stays on the table before it folds away. */
const SHOW_ANSWER_TICKS = 4;
/** New decisions put in front of the player per game day, at most; the rest wait their turn. Urgent ones never wait. */
const NEW_DECISIONS_PER_DAY = 2;
/** Days before the staff raises the same subject again (the key's first two parts: "peace|RUS"). */
const SUBJECT_REST_DAYS = 3;
const subjectOf = (key: string) => key.split('|').slice(0, 2).join('|');
/** Which waiting decisions take the day's allowance first: a threat before a chance. Stable sort keeps the staff's order within a topic. */
const FIRST: Record<Card['topic'], number> = { nuclear: 0, threat: 1, diplomacy: 2 };

const KEPT: ReadonlySet<SimEvent['type']> = new Set(['strike', 'nuclear_detonation', 'nuclear_alert', 'node_captured', 'command_result', 'war_declared', 'peace', 'capitulation', 'message', 'shortage', 'formation_destroyed']);

export class StaffDesk {
  recent: SimEvent[] = [];
  readonly days: Day[] = [];
  /** Bumped on every change the UI shows. */
  version = 0;
  private pool: Card[] = [];
  private readonly dismissed = new Set<string>();
  /** Cards the player acted on whose answer has been shown and folded away: the decision is taken. */
  private readonly done = new Set<string>();
  private readonly sent = new Map<string, Sent>();
  /** Live alerts already raised, so each is raised once. */
  private readonly alerted = new Set<string>();
  /** Live alerts new in the latest snapshot, for the page to raise as a toast. */
  alerts: Card[] = [];
  /** When each decision was first put on the table, for the daily allowance. */
  private readonly debut = new Map<string, number>();
  /** When each subject last had a new decision put on the table. */
  private readonly raised = new Map<string, number>();
  private tick = 0;
  private readonly ongoing: ReadonlySet<string>;
  /** The highest nuclear step any war the player is in has reached: 0 none, 1 an alert, 2 a detonation. */
  nuclearStep = 0;
  /** The player's orders still moving down a degraded chain of command: hours until each arrives, by formation. */
  inTransit = new Map<FormationId, number>();

  constructor(private readonly map: GameMap, private readonly meta: SessionMeta, readonly me: NationId, private readonly namer: Namer) {
    this.ongoing = new Set(meta.scenario.ongoing);
  }

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
    this.record(state, d);
    const situation: Situation = {
      me: this.me, ongoing: this.ongoing, tick: state.tick, dtHours: this.meta.dtHours, map: this.map, nationIds: this.meta.nationIds, control: state.control,
      formations: state.formations, nations: state.nations, d, recent: this.recent, namer: this.namer,
      munitionKind: (id) => this.meta.munitions[id]?.kind as MunitionKind | undefined,
    };
    this.pool = this.allow(advise(situation), state.tick);
    this.alerts = this.pool.filter((c) => c.tone === 'live' && state.tick - c.tick <= 1 && !this.alerted.has(c.key));
    for (const c of this.alerts) this.alerted.add(c.key);
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
      if (settled && state.tick - s.tick > SHOW_ANSWER_TICKS + ANSWER_TICKS) {
        this.sent.delete(key);
        this.done.add(key);
      }
    }
    this.version++;
  }

  private involvesMe(e: Extract<SimEvent, { type: 'strike' }>, state: ClientState): boolean {
    const i = this.meta.nationIds.indexOf(this.me);
    return e.by === this.me || state.control[e.target] === i
      || e.effects.some((x) => x.kind === 'ship_hits' && state.formations.some((f) => f.entry.id === x.formation && f.entry.nation === this.me));
  }

  private record(state: ClientState, d: NationDetail): void {
    const day = Math.floor((state.tick * this.meta.dtHours) / 24);
    let rec = this.days[this.days.length - 1];
    if (!rec || rec.day !== day) {
      rec = { day, held: d.nodesHeld };
      this.days.push(rec);
      if (this.days.length > DAYS_KEPT) this.days.shift();
    }
    rec.held = d.nodesHeld;
  }

  /**
   * Hold back new decisions beyond the day's allowance, so a quiet week and a busy hour both
   * read as a staff bringing a few things at a time. A held card keeps its place in the queue.
   */
  private allow(cards: Card[], tick: number): Card[] {
    const ticksPerDay = Math.max(1, Math.round(24 / this.meta.dtHours));
    let today = 0;
    for (const [key, t] of this.debut) {
      if (Math.floor(t / ticksPerDay) === Math.floor(tick / ticksPerDay)) today++;
      else if (tick - t > 7 * ticksPerDay && !cards.some((c) => c.key === key)) this.debut.delete(key);
    }
    const waiting = cards.filter((c) => isDecision(c) && !c.urgent && !this.debut.has(c.key) && !this.dismissed.has(c.key) && !this.sent.has(c.key) && !this.done.has(c.key));
    const held = new Set<string>();
    for (const c of waiting.sort((a, b) => FIRST[a.topic] - FIRST[b.topic])) {
      const subject = subjectOf(c.key);
      if (today >= NEW_DECISIONS_PER_DAY || tick - (this.raised.get(subject) ?? -Infinity) < SUBJECT_REST_DAYS * ticksPerDay) {
        held.add(c.key);
        continue;
      }
      this.debut.set(c.key, tick);
      this.raised.set(subject, tick);
      today++;
    }
    return cards.filter((c) => !held.has(c.key));
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
    return this.pool.filter((c) => !this.dismissed.has(c.key) && !this.sent.has(c.key) && !this.done.has(c.key));
  }

  /** Cards the player acted on, newest first, with the engine's answer once it comes. */
  get answered(): Sent[] {
    return [...this.sent.values()].sort((a, b) => b.tick - a.tick);
  }

  /** The player chose an action: record a command so its answer can be shown, or put the card away. */
  act(card: Card, action: Action): void {
    if (action.kind === 'command') this.sent.set(card.key, { card, action, tick: this.tick, answer: null, silent: false });
    else if (action.kind === 'later') this.dismissed.add(card.key);
    this.version++;
  }
}

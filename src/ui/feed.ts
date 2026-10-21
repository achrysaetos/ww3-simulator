import type { NationId, NodeId, SimEvent } from '../core/types';
import { CATEGORY_OF, EVENT_CATEGORIES, describeEvent, eventNations, eventNode, eventTag, isEmptyFight, type EventCategory, type Namer } from './events';

/** One log row: an event in words, or several identical ones folded together. */
export interface LoggedEvent {
  seq: number;
  /** The latest occurrence. */
  event: SimEvent;
  text: string;
  tag: string;
  nations: NationId[];
  node: NodeId | null;
  /** Occurrences folded into this row, and the tick of the first. */
  repeats: number;
  firstTick: number;
}

/** Rows kept per category, so a flood of fights never pushes out the diplomacy record. */
export const ROWS_PER_CATEGORY = 600;
/** An identical line within this many ticks (a week of 6-hour ticks) folds into the earlier row. */
export const FOLD_TICKS = 28;

const perCategory = <T>(make: () => T) => Object.fromEntries(EVENT_CATEGORIES.map((c) => [c, make()])) as Record<EventCategory, T>;

/**
 * The event log the player reads: events worded once on arrival, fights that cost nothing dropped,
 * and a line repeated within a week folded into one row with a count.
 */
export class EventFeed {
  /** Rows per category, oldest first. */
  readonly rows = perCategory<LoggedEvent[]>(() => []);
  /** Rows ever logged per category, unaffected by the cap. */
  readonly counts = perCategory(() => 0);
  /** Bumped whenever a row is added or folded. */
  version = 0;
  private seq = 0;
  private readonly recent = new Map<string, LoggedEvent>();

  record(events: readonly SimEvent[], namer: Namer): void {
    if (!events.length) return;
    for (const event of events) {
      if (isEmptyFight(event)) continue;
      const cat = CATEGORY_OF[event.type];
      const text = describeEvent(event, namer);
      const key = `${cat}|${text}`;
      const rows = this.rows[cat];
      const prev = this.recent.get(key);
      if (prev && event.tick - prev.event.tick <= FOLD_TICKS) {
        rows.splice(rows.indexOf(prev), 1);
        prev.event = event;
        prev.repeats++;
        prev.seq = this.seq++;
        rows.push(prev);
        continue;
      }
      const row: LoggedEvent = { seq: this.seq++, event, text, tag: eventTag(event), nations: eventNations(event), node: eventNode(event), repeats: 1, firstTick: event.tick };
      rows.push(row);
      this.recent.set(key, row);
      this.counts[cat]++;
      if (rows.length > ROWS_PER_CATEGORY) for (const old of rows.splice(0, rows.length - ROWS_PER_CATEGORY)) this.recent.delete(`${cat}|${old.text}`);
    }
    this.version++;
  }

  /** The newest `limit` rows across the categories not switched off, optionally only those involving `only`. */
  newest(off: ReadonlySet<EventCategory>, only: NationId | null, limit: number): LoggedEvent[] {
    const lists = EVENT_CATEGORIES.filter((c) => !off.has(c)).map((c) => this.rows[c]);
    const at = lists.map((l) => l.length - 1);
    const out: LoggedEvent[] = [];
    while (out.length < limit) {
      let best = -1;
      for (let i = 0; i < lists.length; i++) if (at[i] >= 0 && (best < 0 || lists[i][at[i]].seq > lists[best][at[best]].seq)) best = i;
      if (best < 0) break;
      const row = lists[best][at[best]--];
      if (!only || row.nations.includes(only)) out.push(row);
    }
    return out;
  }
}

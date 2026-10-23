import type { GameMap } from '../../core/map';
import type { EventCategory } from '../events';
import type { EventFeed, LoggedEvent } from '../feed';

/** What a news desk would run: wars, peace, nuclear moments, cities changing hands, warships hit, and politics. */
const OFF: ReadonlySet<EventCategory> = new Set(['combat', 'economy']);
const NEWSWORTHY_MESSAGE = /protest|arms aid|funding|warns|deterrence|offers peace|for help|capitulat|surrender/i;

export interface Headline {
  seq: number;
  text: string;
  tick: number;
}

/**
 * The newest headlines. A war that was already being fought when the scenario opens (`ongoing`,
 * "RUS>UKR") is declared again at the first tick; it runs as the war going on, not as news of one starting.
 */
export function headlines(feed: EventFeed, map: GameMap, ongoing: ReadonlySet<string> = new Set(), limit = 6): Headline[] {
  const cities = new Set(map.cities.map((c) => c.node));
  const keep = (r: LoggedEvent) => {
    const e = r.event;
    if (e.type === 'node_captured') return cities.has(e.node);
    if (e.type === 'command_result') return false;
    if (e.type === 'strike') return e.effects.some((x) => x.kind === 'ship_hits');
    if (e.type === 'message') return NEWSWORTHY_MESSAGE.test(e.text);
    return true;
  };
  const text = (r: LoggedEvent) => (r.event.type === 'war_declared' && ongoing.has(`${r.event.by}>${r.event.on}`) ? r.text.replace(/^(.+?) declares war on (.+?): .*$/, '$1 and $2 remain at war') : r.text);
  return feed.newest(OFF, null, 600).filter(keep).slice(0, limit).map((r) => ({ seq: r.seq, text: text(r), tick: r.event.tick }));
}

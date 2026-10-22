import type { GameMap } from '../../core/map';
import type { EventCategory } from '../events';
import type { EventFeed, LoggedEvent } from '../feed';

/** What a news desk would run: wars, peace, nuclear moments, cities changing hands, and politics. */
const OFF: ReadonlySet<EventCategory> = new Set(['combat', 'strikes', 'economy']);
const NEWSWORTHY_MESSAGE = /protest|arms aid|funding|warns|deterrence|offers peace|capitulat|surrender/i;

export interface Headline {
  seq: number;
  text: string;
  tick: number;
}

export function headlines(feed: EventFeed, map: GameMap, limit = 6): Headline[] {
  const cities = new Set(map.cities.map((c) => c.node));
  const keep = (r: LoggedEvent) => {
    const e = r.event;
    if (e.type === 'node_captured') return cities.has(e.node);
    if (e.type === 'command_result') return false;
    if (e.type === 'message') return NEWSWORTHY_MESSAGE.test(e.text);
    return true;
  };
  return feed.newest(OFF, null, 200).filter(keep).slice(0, limit).map((r) => ({ seq: r.seq, text: r.text, tick: r.event.tick }));
}

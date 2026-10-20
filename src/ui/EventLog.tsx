import { useMemo, useState } from 'react';
import type { NationId, NodeId } from '../core/types';
import type { SimClient } from './client';
import { CATEGORY_OF, EVENT_CATEGORIES, describeEvent, eventNations, eventNode, type EventCategory, type PlaceNamer } from './events';

interface Props {
  client: SimClient;
  places: PlaceNamer;
  playAs: NationId | null;
  version: number;
  onFocus(node: NodeId): void;
}

const SHOWN = 250;

export function EventLog({ client, places, playAs, version, onFocus }: Props) {
  const [off, setOff] = useState<Set<EventCategory>>(() => new Set(['economy']));
  const [mine, setMine] = useState(false);
  const nameOf = (id: NationId) => client.state.nations.get(id)?.name ?? id;
  const counts = useMemo(() => {
    const c: Partial<Record<EventCategory, number>> = {};
    for (const { event } of client.log) c[CATEGORY_OF[event.type]] = (c[CATEGORY_OF[event.type]] ?? 0) + 1;
    return c;
  }, [version, client.log]);

  const rows = [];
  for (let i = client.log.length - 1; i >= 0 && rows.length < SHOWN; i--) {
    const { seq, event } = client.log[i];
    const cat = CATEGORY_OF[event.type];
    if (off.has(cat)) continue;
    if (mine && playAs && !eventNations(event).includes(playAs)) continue;
    const node = eventNode(event);
    const hours = event.tick * (client.meta?.dtHours ?? 6);
    rows.push(
      <li key={seq} className={`ev ev-${cat}`} onClick={() => node !== null && onFocus(node)} style={{ cursor: node !== null ? 'pointer' : 'default' }}>
        <span className="ev-time mono">D+{Math.floor(hours / 24)} {String(hours % 24).padStart(2, '0')}:00</span>
        <span className={`ev-tag ${cat}`}>{cat}</span>
        <span className="ev-text">{describeEvent(event, nameOf, places, client.meta)}</span>
      </li>,
    );
  }

  const toggle = (c: EventCategory) => setOff((s) => {
    const n = new Set(s);
    if (n.has(c)) n.delete(c); else n.add(c);
    return n;
  });

  return (
    <div className="eventlog">
      <div className="ev-filters">
        <span className="ev-title">Event log</span>
        {EVENT_CATEGORIES.map((c) => (
          <button key={c} className={`chip-btn ${off.has(c) ? '' : 'on'} ${c}`} onClick={() => toggle(c)}>
            {c} <span className="mono">{counts[c] ?? 0}</span>
          </button>
        ))}
        <label className="chk"><input type="checkbox" checked={mine} disabled={!playAs} onChange={(e) => setMine(e.target.checked)} /> involving {playAs ?? 'my nation'} only</label>
      </div>
      <ul className="ev-list" data-testid="event-log">
        {rows.length ? rows : <li className="muted pad">No events yet. Advance time to see the war unfold.</li>}
      </ul>
    </div>
  );
}

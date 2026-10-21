import { memo, useMemo, useState } from 'react';
import type { NationId, NodeId } from '../core/types';
import type { SimClient } from './client';
import { EVENT_CATEGORIES, type EventCategory } from './events';
import type { LoggedEvent } from './feed';

interface Props {
  client: SimClient;
  playAs: NationId | null;
  logVersion: number;
  onFocus(node: NodeId): void;
}

const SHOWN = 250;

function stamp(tick: number, dtHours: number): string {
  const hours = tick * dtHours;
  return `D+${Math.floor(hours / 24)} ${String(hours % 24).padStart(2, '0')}:00`;
}

const Row = memo(function Row({ row, seq, repeats, dtHours, onFocus }: { row: LoggedEvent; seq: number; repeats: number; dtHours: number; onFocus(node: NodeId): void }) {
  const { node } = row;
  const when = repeats > 1 ? `${stamp(row.firstTick, dtHours)}–${stamp(row.event.tick, dtHours).replace(/ .*/, '')}` : stamp(row.event.tick, dtHours);
  return (
    <li data-seq={seq} className={`ev ev-${row.tag}`} onClick={() => node !== null && onFocus(node)} style={{ cursor: node !== null ? 'pointer' : 'default' }}>
      <span className="ev-time mono">{when}</span>
      <span className={`ev-tag ${row.tag}`}>{row.tag}</span>
      <span className="ev-text">{row.text}{repeats > 1 && <span className="ev-repeat mono" title="Identical reports folded into one line"> ×{repeats}</span>}</span>
    </li>
  );
});

export function EventLog({ client, playAs, logVersion, onFocus }: Props) {
  const [off, setOff] = useState<Set<EventCategory>>(() => new Set(['economy']));
  const [mine, setMine] = useState(false);
  const only = mine ? playAs : null;
  const rows = useMemo(() => client.feed.newest(off, only, SHOWN), [client, off, only, logVersion]);
  const dtHours = client.meta?.dtHours ?? 6;

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
            {c} <span className="mono">{client.feed.counts[c]}</span>
          </button>
        ))}
        <label className="chk"><input type="checkbox" checked={mine} disabled={!playAs} onChange={(e) => setMine(e.target.checked)} /> involving {playAs ? client.namer.nation(playAs) : 'my nation'} only</label>
      </div>
      <ul className="ev-list" data-testid="event-log">
        {rows.length ? rows.map((r) => <Row key={r.seq} row={r} seq={r.seq} repeats={r.repeats} dtHours={dtHours} onFocus={onFocus} />) : <li className="muted pad">No events yet. Advance time to see the war unfold.</li>}
      </ul>
    </div>
  );
}

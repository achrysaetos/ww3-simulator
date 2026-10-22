import type { NodeId } from '../../core/types';
import type { IntelSource } from '../../systems/intel';
import type { Palette } from '../colors';
import type { PlaceNamer } from '../events';
import type { ContactDetail } from '../snapshot';
import { Bar, Section, Stat, fmtNum } from '../widgets';
import { fixAge, isStale } from './contacts';

const SOURCE_WORD: Record<IntelSource, string> = {
  base: 'its known peacetime base',
  territory: 'observers on our own ground',
  contact: 'our troops in contact with it',
  airborne: 'airborne reconnaissance',
  satellite: 'satellite imagery',
  naval: 'naval sensors',
};

interface Props {
  contact: ContactDetail;
  nationName: string;
  palette: Palette;
  places: PlaceNamer;
  onFocus(node: NodeId): void;
  onClose(): void;
}

/**
 * A foreign formation as the player's intelligence holds it: where and when it was last fixed,
 * how far off that fix may be by now, and what it was estimated to field. Never its orders,
 * supply or true position.
 */
export function ContactPanel({ contact: c, nationName, palette, places, onFocus, onClose }: Props) {
  const stale = isStale(c);
  return (
    <div className="panel-scroll" data-testid="contact-panel">
      <div className="nation-head">
        <span className="swatch" style={{ background: palette.of(c.nation).css }} />
        <div style={{ flex: 1 }}>
          <div className="nation-name" data-testid="formation-name">{c.name}</div>
          <div className="nation-sub">{nationName} · {c.kind.replace(/_/g, ' ')} {c.echelon.replace(/_/g, ' ')} · <span className={`status ${stale ? 'routed' : 'active'}`}>{stale ? 'lost track' : 'intel contact'}</span></div>
        </div>
        <button className="ghost" onClick={onClose} title="Deselect">✕</button>
      </div>
      <Section title="What we know">
        <p className="activity" data-testid="contact-fix">
          Last fixed {fixAge(c.ageHours)} ago {places.at(c.node)}, by {SOURCE_WORD[c.source]}. It may have moved since: it is probably within about {fmtNum(Math.round(c.errorKm))} km of that fix, the ring on the map.
        </p>
        {stale && <p className="tt-warn small">This fix is too old to plan or strike against. Find it again before committing forces.</p>}
        <div className="stat-grid">
          <Stat label="Fix age">{fixAge(c.ageHours)}</Stat>
          <Stat label="Error, km">±{fmtNum(Math.round(c.errorKm))}</Stat>
          <Stat label="Est. platforms">~{fmtNum(Math.round(c.strength))}</Stat>
        </div>
        <Bar label="Confidence" value={c.confidence} tone={stale ? 'bad' : c.confidence < 0.6 ? 'warn' : 'good'} />
        <div className="row gap">
          <button onClick={() => onFocus(c.node)} data-testid="contact-show">Show last fix</button>
        </div>
      </Section>
    </div>
  );
}

/**
 * The Decide layer in the top bar: the flags you can drop your own on, and the peace needle. LiveTopBar owns the
 * snapshot; this file only draws.
 */
import type { NationId } from '../../core/types';
import { Flag } from '../flags';
import { Gauge } from '../map/TopBar';
import type { NationDetail } from '../snapshot';
import type { FlagTarget, Needle } from './flags';
import './diplomacy.css';

const STANCE_WORD: Record<FlagTarget['stance'], string> = { enemy: 'at war with you', ally: 'fighting beside you', pending: 'deciding on its treaty call', neutral: 'not in the war' };

export function FlagRow({ row, detail, name, over, dragging }: { row: FlagTarget[]; detail: NationDetail; name(n: NationId): string; over: NationId | null; dragging: boolean }) {
  if (!row.length) return null;
  return (
    <div className={`ww-flagrow ${dragging ? 'live' : ''}`} data-testid="flag-row" role="list" aria-label="Nations">
      {row.map((t) => {
        const offered = detail.peaceOffers.find((o) => (o.from === t.nation && o.to === detail.id) || (o.from === detail.id && o.to === t.nation));
        return (
          <span key={t.nation} role="listitem" className={`ww-flagrow-flag ${t.stance} ${over === t.nation ? 'over' : ''}`} data-flag={t.nation} data-stance={t.stance} data-testid={`flag-${t.nation}`} title={`${name(t.nation)}, ${STANCE_WORD[t.stance]}`}>
            <Flag id={t.nation} name={name(t.nation)} width={30} />
            {offered && <i className={`ww-flagrow-offer ${offered.from === detail.id ? 'ours' : 'theirs'}`} title={offered.from === detail.id ? 'Your peace offer is on the table' : `${name(t.nation)} has offered peace`} />}
          </span>
        );
      })}
    </div>
  );
}

/** The peace needle: how far the main enemy's war support still has to fall before it takes terms. */
export function PeaceGauge({ needle, name }: { needle: Needle | null; name(n: NationId): string }) {
  if (!needle) return null;
  const text = needle.ready ? 'They’d sign' : needle.gap === null ? 'Their call' : `${needle.gap} pts off`;
  const tone = needle.ready ? 'good' : needle.value === null ? 'muted' : needle.value >= 0.7 ? 'warn' : 'bad';
  return <Gauge label={`Peace · ${name(needle.nation)}`} value={needle.value} text={text} tone={tone} title={needle.words} testid="peace-needle" />;
}

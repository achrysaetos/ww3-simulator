import { useEffect, useState } from 'react';
import type { NationId } from '../../core/types';
import { Flag } from '../flags';
import { advisorOf } from '../staff/advisors';
import type { Sent } from '../staff/desk';
import { Portrait } from '../staff/Portrait';
import { AnswerLine } from '../staff/WarRoom';
import type { Crisis, CrisisOption } from './crisis';
import './crisis.css';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const pad = (n: number) => String(n).padStart(2, '0');
/** NATO date-time group: day, hour, minute, zone, month, year. */
const dtg = (d: Date) => `${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}Z ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
const SEGMENTS = 10;

interface Props {
  crisis: Crisis;
  me: NationId;
  nation: string;
  scenario: string;
  date: Date;
  defcon: number;
  /** The option taken, once the player chose. */
  chosen: number | null;
  sent: Sent | undefined;
  paused: boolean;
  onChoose(i: number): void;
  onClose(): void;
}

function Countdown({ c }: { c: Crisis }) {
  if (c.hoursLeft === null) {
    return (
      <div className="cr-clock">
        <span className="cr-clock-l">The clock</span>
        <span className="cr-clock-v ww-mono">Stopped</span>
      </div>
    );
  }
  const days = Math.floor(c.hoursLeft / 24), hours = Math.round(c.hoursLeft % 24);
  const lit = Math.max(1, Math.round((c.hoursLeft / (c.windowHours ?? c.hoursLeft)) * SEGMENTS));
  return (
    <div className="cr-clock">
      <span className="cr-clock-l">Answer due in</span>
      <span className="cr-clock-v ww-mono">{pad(days)}<small>d</small> {pad(hours)}<small>h</small></span>
      <span className="cr-clock-bar" aria-hidden="true">{Array.from({ length: SEGMENTS }, (_, i) => <i key={i} className={i < lit ? 'on' : ''} />)}</span>
    </div>
  );
}

function Option({ o, i, me, onChoose, disabled }: { o: CrisisOption; i: number; me: NationId; onChoose(i: number): void; disabled: boolean }) {
  const who = advisorOf(me, o.advisor);
  return (
    <section className={`cr-opt ${o.tone} ${o.recommended ? 'rec' : ''}`} data-testid="crisis-option">
      <header>
        <h3 className="ww-title">{o.title}</h3>
        {o.irreversible && <span className="cr-irrev">Irreversible</span>}
        {o.recommended && !o.irreversible && <span className="cr-irrev rec">Staff advice</span>}
      </header>
      <p>{o.text}</p>
      <div className="cr-who">
        <Portrait advisor={who} size={46} />
        <div>
          <span className="ww-label">{who.title}</span>
          <q>{o.quote}</q>
        </div>
      </div>
      <button type="button" className="cr-btn" onClick={() => onChoose(i)} disabled={disabled} data-testid={`crisis-choose-${i + 1}`}>
        <span>{o.button}</span><span className="ww-kbd">{i + 1}</span>
      </button>
    </section>
  );
}

/** A decision that stops the clock: the situation, the deadline, and two or three options each argued by an adviser. */
export function CrisisScreen(p: Props) {
  const { crisis: c } = p;
  const [shown, setShown] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(id); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = Number(e.key);
      if (p.chosen === null && Number.isInteger(k) && k >= 1 && k <= c.options.length) { e.preventDefault(); e.stopPropagation(); p.onChoose(k - 1); }
      else if (p.chosen !== null && (e.key === 'Enter' || e.key === 'Escape')) { e.preventDefault(); e.stopPropagation(); p.onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
  const chosen = p.chosen === null ? null : c.options[p.chosen];
  const tone = c.kind === 'peace' ? 'blue' : 'red';
  return (
    <div className={`cr-root ${tone} ${shown ? 'in' : ''}`} role="alertdialog" aria-modal="true" aria-label={c.headline} data-testid="crisis">
      <div className="cr-tint" aria-hidden="true" />
      <div className="cr-frame" aria-hidden="true"><i className="tl" /><i className="tr" /></div>
      <header className="cr-band">
        <span className="ww-mono cr-dtg">DTG {dtg(p.date)}</span>
        <span className="cr-flash">Flash</span>
        <span className="cr-source">{c.source}</span>
        <span className="ww-mono cr-event">{c.card.key.split('|')[0].toUpperCase()}-{pad(p.date.getUTCDate())}{pad(p.date.getUTCHours())} · Tier 1</span>
      </header>
      <div className="cr-who-am-i">
        <div className={`cr-defcon ${p.defcon <= 2 ? 'hot' : ''}`}><span>Defcon</span><b>{p.defcon}</b></div>
        <div className="cr-nation"><span className="ww-label">{p.scenario}</span><Flag id={p.me} name={p.nation} width={30} /><span className="ww-title">{p.nation}</span></div>
      </div>

      <h1 className="cr-headline ww-title">{c.headline}</h1>
      <p className="cr-sub">{c.sub}</p>
      <Countdown c={c} />

      <aside className="cr-facts" aria-label="Situation">
        <div className="cr-facts-h"><span>Situation</span><span className="ww-chip red">Your intel</span></div>
        <dl>
          {c.facts.map((f) => <div key={f.label} className={f.tone ?? ''}><dt>{f.label}</dt><dd className="ww-mono">{f.value}</dd></div>)}
        </dl>
      </aside>

      {chosen ? (
        <div className="cr-result ww-glass" data-testid="crisis-result">
          <span className="ww-label">You chose</span>
          <h3 className={`ww-title ${chosen.tone}`}>{chosen.title}</h3>
          {p.sent ? <AnswerLine sent={p.sent} paused={p.paused} /> : <div className="ww-answer waiting"><i className="ww-pulse" aria-hidden="true" /><span>Orders going out…</span></div>}
          <button type="button" className="ww-btn gold" onClick={p.onClose} data-testid="crisis-close">Return to the map <span className="ww-kbd">Enter</span></button>
        </div>
      ) : (
        <div className={`cr-opts n${c.options.length}`}>
          <p className="cr-verdict">{c.verdict} · The clock is stopped · <b>This decision is yours</b></p>
          {c.options.map((o, i) => <Option key={o.title} o={o} i={i} me={p.me} onChoose={p.onChoose} disabled={false} />)}
        </div>
      )}
    </div>
  );
}

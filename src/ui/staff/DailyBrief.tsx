import { useEffect } from 'react';
import type { GameMap } from '../../core/map';
import type { NationId, NodeId } from '../../core/types';
import type { Action, Card, CommandAction } from './advice';
import { advisorOf } from './advisors';
import { BRIEF_CADENCES, type BriefCadence, type Day, type Sent } from './desk';
import type { Headline } from './ticker';
import { MiniMap } from './MiniMap';
import { Portrait } from './Portrait';
import { AnswerLine, TopicIcon } from './WarRoom';

const TOPIC_LABEL: Record<Card['topic'], string> = {
  threat: 'Threat', opportunity: 'Opportunity', supply: 'Supply', diplomacy: 'Diplomacy', nuclear: 'Nuclear', command: 'Command', news: 'World',
};
const DEPT: Record<string, string> = {
  chief: 'Operations', intel: 'Intelligence', air: 'Air', navy: 'Navy', economy: 'Economy', foreign: 'Foreign affairs', security: 'National security',
};
const CADENCE_LABEL: Record<BriefCadence, string> = { daily: 'Every morning', matters: 'Only when it matters', weekly: 'Weekly' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export interface BriefProps {
  me: NationId;
  date: Date;
  day: number;
  cards: readonly Card[];
  sent: ReadonlyMap<string, Sent>;
  days: readonly Day[];
  world: readonly Headline[];
  /** Log entries about the player's nation since the last brief. */
  reports: number;
  cadence: BriefCadence;
  map: GameMap;
  control: Uint16Array;
  controlVersion: number;
  mine: number;
  enemies: ReadonlySet<number>;
  place(node: NodeId): string;
  onCadence(c: BriefCadence): void;
  onAct(card: Card, action: Action): void;
  onShow(node: NodeId): void;
  onLog(): void;
  onClose(): void;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/**
 * The morning brief: the decisions only the player can take, each with the staff's recommended
 * answer and one button, beside what happened overnight. Time stays stopped while it is open.
 */
export function DailyBrief(p: BriefProps) {
  const open = p.cards.filter((c) => !p.sent.has(c.key));
  const approvable = open.filter((c): c is Card & { primary: CommandAction } => c.primary?.kind === 'command');
  const approveAll = () => { for (const c of approvable) p.onAct(c, c.primary); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'Escape') { e.preventDefault(); p.onClose(); return; }
      if (e.key === 'a' || e.key === 'A') { e.preventDefault(); approveAll(); return; }
      const n = Number(e.key);
      const c = Number.isInteger(n) && n >= 1 ? p.cards[n - 1] : undefined;
      if (c?.primary?.kind === 'command' && !p.sent.has(c.key)) { e.preventDefault(); p.onAct(c, c.primary); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const recent = p.days.slice(-2);
  const gained = recent.flatMap((d) => d.gained), lost = recent.flatMap((d) => d.lost);
  const raids = recent.reduce((a, d) => ({ fired: a.fired + d.raids.fired, intercepted: a.intercepted + d.raids.intercepted }), { fired: 0, intercepted: 0 });
  const support = p.days.at(-1)?.warSupport ?? 0;
  const supportDelta = p.days.length > 1 ? Math.round((support - p.days[Math.max(0, p.days.length - 2)].warSupport) * 100) : 0;
  const week = p.days.slice(-7);
  const weekNet = week.reduce((a, d) => a + d.gained.length - d.lost.length, 0);
  const peak = Math.max(1, ...week.map((d) => Math.abs(d.gained.length - d.lost.length)));
  const names = (nodes: NodeId[]) => [...new Set(nodes.map((n) => p.place(n).replace(/^near /, '')))].slice(0, 2).join(', ');
  const d = p.date;

  return (
    <div className="ww-brief-back" role="dialog" aria-modal="true" aria-label="Daily brief" data-testid="daily-brief">
      <div className="ww-brief-file ww-label"><span className="ww-gold">File {pad(p.day, 3)}</span> General staff of the armed forces</div>
      <div className="ww-brief ww-glass ww-corners">
        <header className="ww-brief-head">
          <svg width="40" height="46" viewBox="0 0 40 46" aria-hidden="true"><path d="M20 2 L37 8 L37 22 C37 33 29 41 20 44 C11 41 3 33 3 22 L3 8 Z" fill="rgba(255,181,71,0.08)" stroke="#ffb547" strokeWidth="1.6" /><path d="M20 13 L22.9 19.6 L30 20.2 L24.6 24.8 L26.3 31.8 L20 28 L13.7 31.8 L15.4 24.8 L10 20.2 L17.1 19.6 Z" fill="#ffb547" /></svg>
          <div className="ww-brief-title">
            <span className="ww-label">For the supreme commander</span>
            <span className="ww-title">Daily brief</span>
          </div>
          <div className="ww-brief-asof">
            <span className="ww-label">Situation as of</span>
            <span className="ww-mono">D+{p.day} · {pad(d.getUTCHours())}:00 · {d.getUTCDate()} {MONTHS[d.getUTCMonth()]} {d.getUTCFullYear()}</span>
          </div>
          <span className="ww-stamp" aria-hidden="true">Top secret // eyes only</span>
          <div className="ww-brief-stopped">
            <span className="ww-chip gold"><svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="1" width="3" height="10" fill="currentColor" /><rect x="7" y="1" width="3" height="10" fill="currentColor" /></svg> Time is stopped</span>
            <span className="ww-muted">{open.length ? `${open.length} ${open.length === 1 ? 'decision' : 'decisions'} waiting` : 'Nothing waiting'}</span>
          </div>
        </header>

        <div className="ww-brief-body">
          <ol className="ww-brief-items">
            {p.cards.map((c, i) => {
              const who = c.role ? advisorOf(p.me, c.role) : null;
              const sent = p.sent.get(c.key);
              return (
                <li key={c.key} className="ww-brief-item" data-testid="brief-item">
                  {c.node !== undefined ? (
                    <div className="ww-brief-thumb">
                      <span className="ww-brief-num">{i + 1}</span>
                      <MiniMap map={p.map} control={p.control} version={p.controlVersion} mine={p.mine} enemies={p.enemies} node={c.node} label={p.place(c.node).replace(/^near /, '')} />
                    </div>
                  ) : (
                    <div className="ww-brief-thumb plain"><span className="ww-brief-num">{i + 1}</span><TopicIcon topic={c.topic} /></div>
                  )}
                  <div className="ww-brief-main">
                    <div className="ww-brief-kicker"><TopicIcon topic={c.topic} /><span className="ww-label">{TOPIC_LABEL[c.topic]}{c.role ? ` · ${DEPT[c.role]}` : ''}</span>{c.chip && <span className={`ww-chip ${c.urgent ? 'red' : 'gold'}`}>{c.chip}</span>}</div>
                    <h3 className="ww-title">{c.title}</h3>
                    <p>{c.text}</p>
                    {who && (
                      <div className="ww-brief-rec">
                        <Portrait advisor={who} size={36} />
                        <div>
                          <span className="ww-brief-who"><b>{who.name}</b> {who.title}</span>
                          {c.ask && <span className="ww-brief-ask">{c.ask}</span>}
                          {c.cost && <span className="ww-brief-cost"><span className="ww-label">{c.cost.label}</span> {c.cost.text}</span>}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="ww-brief-side">
                    {c.figure && <div className="ww-brief-fig"><span className="ww-mono">{c.figure.value}{c.figure.unit && <small>{c.figure.unit}</small>}</span><span className="ww-label">{c.figure.caption}</span></div>}
                    {sent ? <AnswerLine sent={sent} paused /> : (
                      <>
                        {c.primary && <button type="button" className="ww-btn gold" onClick={() => p.onAct(c, c.primary!)} data-testid="brief-approve">{c.primary.kind === 'command' ? 'Approve' : c.primary.label}<span className="ww-kbd">{i + 1}</span></button>}
                        {c.node !== undefined && <button type="button" className="ww-btn" onClick={() => p.onShow(c.node!)}>Show on map</button>}
                        <button type="button" className="ww-btn ghost" onClick={() => p.onAct(c, c.secondary?.kind === 'command' ? c.secondary : { kind: 'later', label: 'Not now' })}>{c.secondary?.kind === 'command' ? c.secondary.label : 'Not now'}</button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
            {!p.cards.length && <li className="ww-brief-empty">No decisions need you this morning. Your staff is carrying out its plans.</li>}
          </ol>

          <aside className="ww-brief-overnight">
            <div className="ww-brief-oh"><span className="ww-title">{recent.length > 1 ? 'Since yesterday' : 'Today'}</span><span className="ww-mono ww-muted" data-testid="brief-window">{recent.length ? `Day ${recent[0].day + 1} → ${pad(d.getUTCHours())}:00 today` : ''}</span></div>
            <div className="ww-brief-sec">
              <span className="ww-label">Front</span>
              {gained.length > 0 && <div className="ww-brief-row"><span><span className="ww-up">▲</span> Gained {gained.length} {gained.length === 1 ? 'cell' : 'cells'}{names(gained) && ` at ${names(gained)}`}</span><b className="ww-up">+{gained.length}</b></div>}
              {lost.length > 0 && <div className="ww-brief-row"><span><span className="ww-down">▼</span> Lost {lost.length} {lost.length === 1 ? 'cell' : 'cells'}{names(lost) && ` near ${names(lost)}`}</span><b className="ww-down">−{lost.length}</b></div>}
              {!gained.length && !lost.length && <div className="ww-brief-row ww-muted">The line held where it stood.</div>}
            </div>
            <div className="ww-brief-sec">
              <span className="ww-label">Air raid</span>
              {raids.fired ? (
                <>
                  <div className="ww-brief-row"><span>{raids.fired.toLocaleString('en-US')} missiles and drones fired at us</span></div>
                  <div className="ww-brief-row"><span>Intercepted</span><b className="ww-blue">{Math.round((raids.intercepted / raids.fired) * 100)}%</b></div>
                  <span className="ww-bar"><i style={{ width: `${Math.round((raids.intercepted / raids.fired) * 100)}%` }} /></span>
                </>
              ) : <div className="ww-brief-row ww-muted">No raids on our ground.</div>}
            </div>
            <div className="ww-brief-sec">
              <span className="ww-label">Home front</span>
              <div className="ww-brief-row"><span>War support</span><b>{Math.round(support * 100)}% <span className={supportDelta >= 0 ? 'ww-up' : 'ww-down'}>{supportDelta >= 0 ? '▲' : '▼'}{Math.abs(supportDelta)}</span></b></div>
            </div>
            <div className="ww-brief-sec">
              <span className="ww-label">World</span>
              {p.world.slice(0, 2).map((h) => <div key={h.seq} className="ww-brief-row ww-brief-news">{h.text}</div>)}
              {!p.world.length && <div className="ww-brief-row ww-muted">Quiet.</div>}
            </div>
            <div className="ww-brief-week">
              <div className="ww-brief-oh"><span className="ww-label">Front this week</span><span className={`ww-mono ${weekNet > 0 ? 'ww-up' : weekNet < 0 ? 'ww-down' : ''}`}>{weekNet > 0 ? '+' : ''}{weekNet} {Math.abs(weekNet) === 1 ? 'cell' : 'cells'}</span></div>
              <div className="ww-brief-chart" role="img" aria-label={`Net cells gained each day this week: ${week.map((x) => x.gained.length - x.lost.length).join(', ')}`}>
                {week.map((x) => {
                  const net = x.gained.length - x.lost.length;
                  const h = Math.round((Math.abs(net) / peak) * 26);
                  const wd = new Date(d.getTime() - (p.day - x.day) * 864e5).getUTCDay();
                  return (
                    <div key={x.day} className="ww-brief-bar">
                      <i className={net > 0 ? 'up' : net < 0 ? 'down' : 'flat'} style={{ height: Math.max(2, h), [net < 0 ? 'top' : 'bottom']: '50%' }} />
                      <span>{WEEKDAYS[wd]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="ww-brief-settled"><span className="ww-muted">{p.reports.toLocaleString('en-US')} reports in the log since yesterday.</span><button type="button" className="ww-link" onClick={p.onLog}>Read the log</button></div>
          </aside>
        </div>

        <footer className="ww-brief-foot">
          <span className="ww-label">Brief me</span>
          <div className="ww-seg" role="group" aria-label="When the brief opens">
            {BRIEF_CADENCES.map((c) => <button key={c} type="button" className={p.cadence === c ? 'on' : ''} aria-pressed={p.cadence === c} onClick={() => p.onCadence(c)} data-testid={`cadence-${c}`}>{CADENCE_LABEL[c]}</button>)}
          </div>
          <span className="ww-grow" />
          <button type="button" className="ww-btn" onClick={p.onClose} data-testid="brief-close">Go to the map <span className="ww-kbd">Esc</span></button>
          {approvable.length > 0 && (
            <button type="button" className="ww-btn gold ww-brief-all" onClick={approveAll} data-testid="brief-approve-all">
              <span><span className="ww-brief-all-t">Approve {approvable.length === 1 ? 'the recommendation' : `all ${approvable.length} recommendations`}</span><small>{approvable.map((c) => c.primary.label).join(' · ')}</small></span>
              <span className="ww-kbd">A</span>
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

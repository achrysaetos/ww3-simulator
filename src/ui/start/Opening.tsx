import { useEffect, useState } from 'react';
import type { NationId } from '../../core/types';
import type { Briefing, Objective } from '../briefing';
import { Flag } from '../flags';
import { advisorOf } from '../staff/advisors';
import { Portrait } from '../staff/Portrait';
import type { CommandRole } from '../staff/roles';
import type { OpeningFacts } from './openingFacts';
import './opening.css';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');
const pct = (x: number) => `${Math.round(x * 100)}%`;
const DOMAIN_NAME = { land: 'land', air: 'the air war', naval: 'the navy', homefront: 'the home front', strategic: 'war, peace and nuclear release' } as const;

/** The cinematic beat while the camera falls from orbit to the theatre: letterbox, place, date. */
const HOLD_MS = 3000, OUT_MS = 600;

export function OpeningTitle({ scenario, theatre, date, onDone }: { scenario: string; theatre: string; date: Date; onDone(): void }) {
  const [phase, setPhase] = useState<'wait' | 'in' | 'out'>('wait');
  useEffect(() => {
    // The first frames of a new game are busy building the map; the beat starts once the page paints, and
    // leaves on a timer rather than a CSS clock, so a slow frame never skips it.
    let id = 0, raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        setPhase('in');
        id = window.setTimeout(() => {
          setPhase('out');
          id = window.setTimeout(onDone, OUT_MS);
        }, HOLD_MS);
      });
    });
    const skip = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onDone(); } };
    window.addEventListener('keydown', skip, true);
    return () => { cancelAnimationFrame(raf); clearTimeout(id); window.removeEventListener('keydown', skip, true); };
  }, []);
  return (
    <div className={`op-title ${phase === 'wait' ? '' : 'go'} ${phase === 'out' ? 'out' : ''}`} onClick={onDone} data-testid="opening-title" role="presentation">
      <i className="op-bar op-bar-top" />
      <i className="op-bar op-bar-bottom" />
      <div className="op-words">
        <span className="op-kicker ww-mono">{pad(date.getUTCHours())}:00Z · {date.getUTCDate()} {MONTHS[date.getUTCMonth()].toUpperCase()} {date.getUTCFullYear()}</span>
        <span className="op-name ww-title">{scenario}</span>
        <span className="op-place ww-label">Theatre · {theatre}</span>
      </div>
      <span className="op-skip ww-label">Click to skip</span>
    </div>
  );
}

interface SituationProps {
  me: NationId;
  nation: string;
  scenario: { name: string; summary: string };
  date: Date;
  day: number;
  briefing: Briefing;
  objectives: Objective[];
  facts: OpeningFacts;
  name(id: NationId): string;
  role: CommandRole | null;
  staffRuns: string[];
  youRun: string[];
  onShow?(): void;
  onClose(): void;
}

/** The opening situation report in the Chief of Staff's voice, from the player's own view; reopens from the Game menu. */
export function SituationCard(p: SituationProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); p.onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
  const chief = advisorOf(p.me, 'chief');
  const f = p.facts;
  const d = p.date;
  const atWar = f.enemies.length > 0;
  const foes = f.enemies.map(p.name);
  const tiles: { label: string; value: string; unit?: string; caption: string; tone?: 'red' | 'gold' | 'blue' }[] = [
    { label: 'At war with', value: atWar ? (foes.length > 2 ? `${foes.length} nations` : foes.join(' & ')) : 'No one', caption: atWar ? (f.enemyWarheads ? `${f.enemyWarheads.toLocaleString('en-US')} enemy warheads` : 'No enemy warheads') : f.treatyCalls ? `${f.treatyCalls} ${f.treatyCalls === 1 ? 'ally calls' : 'allies call'} on us to fight` : 'At peace, for now', tone: atWar || f.treatyCalls ? 'red' : undefined },
    { label: 'Our forces', value: String(f.own.land), unit: 'formations', caption: `${f.own.air} air wings · ${f.own.naval} naval groups`, tone: 'blue' },
    { label: 'Enemy contacts', value: String(f.contacts), unit: 'known', caption: atWar ? (f.contested ? `${f.contested} cells under attack` : 'No ground under attack') : 'No enemy yet', tone: atWar ? 'red' : undefined },
    { label: 'War support', value: pct(f.warSupport), caption: `${pct(f.mobilised)} mobilised${f.warheads ? ` · ${f.warheads.toLocaleString('en-US')} warheads` : ''}`, tone: f.warSupport < 0.4 ? 'red' : 'gold' },
  ];
  return (
    <div className="ww-brief-back op-back" role="dialog" aria-modal="true" aria-label="Situation report" data-testid="briefing">
      <div className="ww-brief-file ww-label op-file"><span className="ww-gold">Sitrep 001</span> General staff · {p.nation}</div>
      <div className="ww-brief ww-glass ww-corners op-card">
        <header className="ww-brief-head">
          <Flag id={p.me} name={p.nation} width={54} className="op-flag" />
          <div className="ww-brief-title">
            <span className="ww-label">For the {!p.role || p.role.id === 'brigade' ? 'Supreme Commander' : p.role.name}</span>
            <span className="ww-title">Situation</span>
          </div>
          <div className="ww-brief-asof">
            <span className="ww-label">{p.scenario.name}</span>
            <span className="ww-mono">D+{p.day} · {pad(d.getUTCHours())}:00 · {d.getUTCDate()} {MONTHS[d.getUTCMonth()]} {d.getUTCFullYear()}</span>
          </div>
          <span className="ww-stamp" aria-hidden="true">Secret // noforn</span>
          <div className="ww-brief-stopped">
            <span className="ww-chip gold"><svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="1" width="3" height="10" fill="currentColor" /><rect x="7" y="1" width="3" height="10" fill="currentColor" /></svg> Time is stopped</span>
            <span className="ww-muted">Six hours a turn</span>
          </div>
        </header>

        <div className="op-body">
          <div className="op-main">
            <div className="op-voice">
              <Portrait advisor={chief} size={64} />
              <div>
                <span className="op-who"><b>{chief.name}</b> {chief.title}</span>
                <p className="op-quote">“Commander. {p.briefing.text}”</p>
              </div>
            </div>
            <div className="op-tiles">
              {tiles.map((t) => (
                <div key={t.label} className={`op-tile ${t.tone ?? ''}`}>
                  <span className="ww-label">{t.label}</span>
                  <span className="op-tile-v ww-title">{t.value}{t.unit && <small>{t.unit}</small>}</span>
                  <span className="op-tile-c">{t.caption}</span>
                </div>
              ))}
            </div>
          </div>
          <aside className="op-side">
            <div className="ww-brief-sec">
              <span className="ww-label">Objectives</span>
              <ul className="op-obj" data-testid="objectives">
                {p.objectives.map((o) => <li key={o.label} className={o.met ? 'met' : ''}><i>{o.met ? '✓' : ''}</i>{o.label}</li>)}
                {!p.objectives.length && <li className="ww-muted">No fixed objectives: your aims are your own.</li>}
              </ul>
            </div>
            <div className="ww-brief-sec">
              <span className="ww-label">How you command</span>
              <p className="op-role">{p.youRun.length ? <>You decide <b>{p.youRun.join(', ')}</b>.</> : 'You decide everything.'} {p.staffRuns.length ? <>Your staff runs <b>{p.staffRuns.join(', ')}</b>.</> : 'Your staff only advises.'}</p>
              <ul className="op-keys">
                <li><span className="ww-kbd">Space</span>Run or stop the clock</li>
                <li><span className="ww-kbd">Click</span>A counter to command it</li>
                <li><span className="ww-kbd">N</span>Nation: hand a domain to your staff or take it back</li>
              </ul>
            </div>
            <p className="op-note ww-muted">{p.briefing.reminder}</p>
          </aside>
        </div>

        <footer className="ww-brief-foot">
          <span className="ww-muted op-foot-note">Crises stop the clock and wait for your answer.</span>
          <span className="ww-grow" />
          {p.onShow && <button type="button" className="ww-btn" onClick={p.onShow}>Show me the front</button>}
          <button type="button" className="ww-btn gold op-go" onClick={p.onClose} data-testid="briefing-close" autoFocus>Take command <span className="ww-kbd">Enter</span></button>
        </footer>
      </div>
    </div>
  );
}

export const domainNames = (keys: readonly (keyof typeof DOMAIN_NAME)[]) => keys.map((k) => DOMAIN_NAME[k]);

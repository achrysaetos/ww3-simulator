/**
 * The shared in-game top bar from the redesign kit: the nation you command,
 * the clock and speed, a few headline figures, and two needles: peace and nukes.
 * Presentational only; the caller supplies the numbers.
 */
import type { PointerEvent, ReactNode } from 'react';
import { Flag } from '../flags';
import './TopBar.css';

export interface TopBarStat {
  label: string;
  value: string;
  tone?: 'good' | 'warn' | 'bad';
}

export interface TopBarProps {
  nation: { id: string; name: string };
  subtitle: string;
  date: Date | null;
  /** Days since the scenario began. */
  day: number;
  /** Game hours a real second; 0 is paused. */
  speed: number;
  speeds: readonly number[];
  onSpeed(speed: number): void;
  stats: TopBarStat[];
  /** 5 calm .. 1 nuclear use, shown as the nukes needle; null hides it. */
  defcon: number | null;
  /** Makes the player's own flag a drag handle (the diplomacy drag). */
  grip?: { onPointerDown(e: PointerEvent): void };
  /** Under the bar on the left: the flags the player's own can be dropped on. */
  row?: ReactNode;
  /** Before the nukes needle: the peace needle. */
  gauges?: ReactNode;
}

/**
 * The week on the ground in one figure: cells gained or lost, and the player's formations destroyed
 * (surrendered encircled, overrun). Ground taken while whole formations are lost is not a good week.
 */
export function frontStat(cells: number | null, lost: number): TopBarStat {
  const ground = !cells ? 'Holding' : `${cells > 0 ? '+' : ''}${cells} cells`;
  const tone = (cells ?? 0) < 0 || lost > 2 ? 'bad' : lost > 0 ? 'warn' : (cells ?? 0) > 0 ? 'good' : undefined;
  return { label: 'Front · 7d', value: lost ? `${ground} · ${lost} lost` : ground, ...(tone ? { tone } : {}) };
}

const DEFCON_WORDS: Record<number, string> = {
  5: 'At peace.', 3: 'At war, no nuclear alert.', 2: 'A nuclear power has its warheads on alert.', 1: 'Nuclear weapons have been used.',
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function SpeedIcon({ n }: { n: number }) {
  if (n === 0) return <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="1" width="3" height="10" fill="currentColor" /><rect x="7" y="1" width="3" height="10" fill="currentColor" /></svg>;
  const w = 6 * n + 2;
  return (
    <svg width={w} height="12" viewBox={`0 0 ${w} 12`} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => <path key={i} d={`M${1 + 6 * i} 1 L${6 + 6 * i} 6 L${1 + 6 * i} 11 Z`} fill="currentColor" />)}
    </svg>
  );
}

/** A half-dial with one needle, 0 at the left and 1 at the right. */
export function Gauge({ label, value, text, tone, title, testid }: { label: string; value: number | null; text: string; tone: 'good' | 'warn' | 'bad' | 'muted'; title: string; testid: string }) {
  const v = value === null ? 0 : Math.min(1, Math.max(0, value));
  const a = Math.PI * (1 - v), r = 15, cx = 18, cy = 18;
  const nx = cx + r * Math.cos(a), ny = cy - r * Math.sin(a);
  return (
    <div className={`ww-gauge ${tone}`} title={title} data-testid={testid} data-value={value === null ? '' : v.toFixed(3)}>
      <svg width="36" height="21" viewBox="0 0 36 21" aria-hidden="true">
        <path d={`M3 18 A${r} ${r} 0 0 1 33 18`} fill="none" className="ww-gauge-track" strokeWidth="3" />
        {value !== null && v > 0 && <path d={`M3 18 A${r} ${r} 0 0 1 ${nx.toFixed(2)} ${ny.toFixed(2)}`} fill="none" className="ww-gauge-fill" strokeWidth="3" />}
        {value !== null && <line x1={cx} y1={cy} x2={nx.toFixed(2)} y2={ny.toFixed(2)} className="ww-gauge-needle" strokeWidth="1.6" strokeLinecap="round" />}
        <circle cx={cx} cy={cy} r="1.8" className="ww-gauge-needle-hub" />
      </svg>
      <div className="ww-gauge-words">
        <span className="ww-label">{label}</span>
        <span className="ww-mono">{text}</span>
      </div>
    </div>
  );
}

export function TopBar(p: TopBarProps) {
  const d = p.date;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <header className="ww-topbar" data-testid="topbar">
      <div className="ww-topbar-side">
        {p.grip
          ? <span className="ww-ownflag" onPointerDown={p.grip.onPointerDown} data-testid="own-flag" title="Drag your flag onto another nation's to offer peace or ask for help"><Flag id={p.nation.id} name={p.nation.name} /></span>
          : <Flag id={p.nation.id} name={p.nation.name} />}
        <div className="ww-topbar-who">
          <span className="ww-title">{p.nation.name}</span>
          <span className="ww-label">{p.subtitle}</span>
        </div>
      </div>
      <div className="ww-topbar-mid">
        <div className="ww-glass ww-clock" data-testid="clock">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M11.5 10.5 A5.5 5.5 0 1 1 6 2.2 A4.5 4.5 0 0 0 11.5 10.5 Z" fill="#9fc2e8" /></svg>
          <span className="ww-mono ww-clock-day">D+{p.day}</span>
          <span className="ww-mono ww-clock-date">{d ? `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : '--'}</span>
          <span className="ww-mono ww-clock-time">{d ? `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : '--:--'}</span>
          <div className="ww-speeds" role="group" aria-label="Game speed">
            {p.speeds.map((s, i) => {
              const label = s ? `${s} game ${s === 1 ? 'hour' : 'hours'} a second, ${i}` : 'Pause, Space';
              return (
                <button key={s} type="button" className={p.speed === s ? 'on' : ''} aria-label={label} title={label} aria-pressed={p.speed === s} onClick={() => p.onSpeed(s)} data-testid={`speed-${s}`}>
                  <SpeedIcon n={i} />
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="ww-topbar-side ww-topbar-stats">
        {p.stats.map((s) => (
          <div key={s.label} className="ww-stat">
            <span className="ww-label">{s.label}</span>
            <span className={`ww-mono ${s.tone ?? ''}`}>{s.value}</span>
          </div>
        ))}
        {p.gauges}
        {p.defcon !== null && (
          <Gauge label="Nukes" value={(5 - p.defcon) / 4} text={`Defcon ${p.defcon}`} tone={p.defcon <= 2 ? 'bad' : p.defcon <= 3 ? 'warn' : 'muted'} title={DEFCON_WORDS[p.defcon] ?? ''} testid="defcon" />
        )}
      </div>
      {p.row}
    </header>
  );
}

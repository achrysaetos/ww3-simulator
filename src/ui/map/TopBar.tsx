/**
 * The shared in-game top bar from the redesign kit: the nation you command,
 * the clock and speed, and a few headline figures with a DEFCON-style chip.
 * Presentational only; the caller supplies the numbers.
 */
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
  speed: number;
  speeds: readonly number[];
  onSpeed(speed: number): void;
  stats: TopBarStat[];
  /** 5 calm .. 1 nuclear use; null hides the chip. */
  defcon: number | null;
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

export function TopBar(p: TopBarProps) {
  const d = p.date;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <header className="ww-topbar" data-testid="topbar">
      <div className="ww-topbar-side">
        <Flag id={p.nation.id} name={p.nation.name} />
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
            {p.speeds.map((s, i) => (
              <button key={s} type="button" className={p.speed === s ? 'on' : ''} aria-label={s ? `Speed ${i}` : 'Pause, Space'} aria-pressed={p.speed === s} onClick={() => p.onSpeed(s)} data-testid={`speed-${s}`}>
                <SpeedIcon n={i} />
              </button>
            ))}
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
        {p.defcon !== null && <span className={`ww-chip ${p.defcon <= 2 ? 'red' : 'gold'} ww-defcon`}>Defcon {p.defcon}</span>}
      </div>
    </header>
  );
}

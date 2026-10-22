import { useEffect, useState } from 'react';
import type { FormationKind } from '../../core/types';
import type { OptionKey, OrderOption } from './options';

/** What each slot says and its key. A strike is named for what fires it. */
export const OPTION_LABEL: Record<OptionKey, { label: string; key: string }> = {
  attack: { label: 'Attack', key: 'A' }, strike: { label: 'Strike', key: 'S' }, move: { label: 'Move', key: 'M' }, defend: { label: 'Hold', key: 'D' },
  plan: { label: 'Plan offensive', key: 'P' }, reserve: { label: 'Reserve', key: 'R' }, air_superiority: { label: 'Air cover', key: 'C' },
  patrol: { label: 'Patrol', key: 'T' }, blockade: { label: 'Blockade', key: 'B' }, air_assault: { label: 'Air assault', key: 'Q' },
  escort: { label: 'Escort', key: 'E' }, embark: { label: 'Embark', key: 'K' },
};

export function optionLabel(o: OrderOption, kinds: readonly FormationKind[]): string {
  if (o.key === 'strike') return kinds.every((k) => k === 'air_wing') ? 'Air strike' : kinds.every((k) => k === 'artillery') ? 'Artillery strike' : 'Strike';
  if (o.key === 'move' && kinds.length && kinds.every((k) => k === 'air_wing')) return 'Rebase';
  return OPTION_LABEL[o.key].label;
}

const ICON: Partial<Record<OptionKey, string>> = {
  attack: 'M3 15 L13.5 4.5 M6.5 4 H14 V11.5',
  strike: 'M9 4.4 A4.6 4.6 0 1 0 9.01 4.4 M9 1.5 V5 M9 13 V16.5 M1.5 9 H5 M13 9 H16.5',
  move: 'M2 9 H4.5 M6.5 9 H9 M10 4.5 L14.5 9 L10 13.5',
  defend: 'M9 2 L15 4.5 V9 C15 12.5 12.5 15 9 16.5 C5.5 15 3 12.5 3 9 V4.5 Z',
  plan: 'M2.5 15 C4.5 8.5 8.5 5.5 15 5 M11.5 2 L15 5 L12 8.6',
  reserve: 'M3 6 H15 M3 9 H15 M3 12 H15',
  air_superiority: 'M9 2 L11 8 L16 10 L11 11 L9 16 L7 11 L2 10 L7 8 Z',
  patrol: 'M9 3 A6 6 0 1 1 3 9 M3 5 V9 H7',
  blockade: 'M2 9 H16 M5 5 V13 M9 5 V13 M13 5 V13',
  air_assault: 'M3 14 L9 4 L15 14 M6 10 H12',
};

export interface RadialProps {
  x: number;
  y: number;
  title: string;
  /** Who holds the place, coloured by side. */
  holder: { text: string; tone: 'friend' | 'enemy' | 'neutral' };
  /** What the player's intelligence puts there. */
  estimate: string | null;
  /** Null while the engine is being asked. */
  options: OrderOption[] | null;
  kinds: readonly FormationKind[];
  /** The text for an option's detail card: what it does, when, or why it is refused. */
  detail(o: OrderOption): { lines: string[]; tone: 'ok' | 'warn' | 'refused' };
  onPick(o: OrderOption): void;
  onClose(): void;
}

const R_OUT = 104, R_IN = 50, R_HOT = 112, R_CORE = 44, GAP = 0.035;

const polar = (r: number, a: number): [number, number] => [r * Math.sin(a), -r * Math.cos(a)];
function segment(a0: number, a1: number, rOut: number, rIn: number): string {
  const [x0, y0] = polar(rOut, a0), [x1, y1] = polar(rOut, a1), [x2, y2] = polar(rIn, a1), [x3, y3] = polar(rIn, a0);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${rOut} ${rOut} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)} A${rIn} ${rIn} 0 ${large} 0 ${x3.toFixed(1)} ${y3.toFixed(1)} Z`;
}

/** The order wheel (redesign ops.png): the place in the middle, one slot per order the selection can take, the first one ready on top. */
export function Radial({ x, y, title, holder, estimate, options, kinds, detail, onPick, onClose }: RadialProps) {
  const [hot, setHot] = useState(0);
  const list = options ?? [];
  const n = Math.max(list.length, 4);
  const step = (2 * Math.PI) / n;
  useEffect(() => {
    const first = list.findIndex((o) => o.ok.length > 0);
    setHot(first < 0 ? 0 : first);
  }, [options]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key === 'Enter') {
        const o = list[hot];
        if (o?.ok.length) { e.stopPropagation(); e.preventDefault(); onPick(o); }
        return;
      }
      const o = list.find((x) => OPTION_LABEL[x.key].key.toLowerCase() === e.key.toLowerCase());
      if (!o) return;
      e.stopPropagation();
      e.preventDefault();
      if (o.ok.length) onPick(o);
      else setHot(list.indexOf(o));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [options, hot, onPick, onClose]);

  const W = typeof window === 'undefined' ? 1440 : window.innerWidth, H = typeof window === 'undefined' ? 900 : window.innerHeight;
  const cx = Math.max(160, Math.min(W - 160, x)), cy = Math.max(170, Math.min(H - 170, y));
  const shown = list[hot];
  const card = shown ? detail(shown) : null;
  const cardLeft = cx + 150 + 300 > W;

  return (
    <div className="ww-radial-layer" data-testid="radial" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <svg className="ww-radial" style={{ left: cx - 160, top: cy - 160 }} width="320" height="320" viewBox="-160 -160 320 320" role="menu" aria-label={`Orders for ${title}`}>
        <defs>
          <radialGradient id="ww-radial-scrim"><stop offset="0.55" stopColor="#04070c" stopOpacity="0.62" /><stop offset="1" stopColor="#04070c" stopOpacity="0" /></radialGradient>
          <linearGradient id="ww-rseg-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffd27f" /><stop offset="1" stopColor="#f0a136" /></linearGradient>
          <linearGradient id="ww-rseg-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgba(26,40,62,0.94)" /><stop offset="1" stopColor="rgba(10,16,27,0.94)" /></linearGradient>
          <filter id="ww-radial-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <circle r="156" fill="url(#ww-radial-scrim)" />
        <circle r={R_HOT + 2} fill="none" stroke="#9fc2e8" strokeOpacity="0.18" />
        {Array.from({ length: 72 }, (_, i) => {
          const a = (i / 72) * 2 * Math.PI, long = i % 6 === 0;
          const [x0, y0] = polar(R_HOT + 4, a), [x1, y1] = polar(R_HOT + (long ? 10 : 7), a);
          return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke="#9fc2e8" strokeOpacity="0.35" />;
        })}
        {Array.from({ length: n }, (_, i) => {
          const o = list[i];
          const a0 = i * step - step / 2 + GAP, a1 = i * step + step / 2 - GAP;
          const on = !!o && i === hot && o.ok.length > 0;
          const off = !o || !o.ok.length;
          const [lx, ly] = polar((R_OUT + R_IN) / 2, i * step);
          const label = o ? optionLabel(o, kinds) : '';
          return (
            <g
              key={i}
              className={`ww-rseg ${on ? 'on' : ''} ${off ? 'off' : ''} ${!o ? 'empty' : ''}`}
              role={o ? 'menuitem' : undefined}
              aria-label={o ? `${label}, key ${OPTION_LABEL[o.key].key}${off ? `, unavailable: ${detail(o).lines[0]}` : ''}` : undefined}
              aria-disabled={off || undefined}
              data-testid={o ? `radial-${o.key}` : undefined}
              onPointerEnter={() => o && setHot(i)}
              onClick={() => o?.ok.length && onPick(o)}
            >
              {on && <path d={segment(a0, a1, R_OUT + 6, R_IN)} fill="#ffb547" fillOpacity="0.45" filter="url(#ww-radial-glow)" />}
              <path d={segment(a0, a1, on ? R_OUT + 6 : R_OUT, R_IN)} fill={on ? 'url(#ww-rseg-gold)' : 'url(#ww-rseg-glass)'} stroke={on ? '#ffe0a8' : '#96c3f0'} strokeOpacity={on ? 1 : 0.32} strokeWidth={on ? 1.2 : 1} />
              {on && <path d={`M${polar(R_HOT, a0).join(' ')} A${R_HOT} ${R_HOT} 0 0 1 ${polar(R_HOT, a1).join(' ')}`} fill="none" stroke="#ffb547" strokeWidth="3" filter="url(#ww-radial-glow)" />}
              {o && (
                <g transform={`translate(${lx.toFixed(1)} ${ly.toFixed(1)})`} className="ww-rseg-label">
                  {ICON[o.key] && <path d={ICON[o.key]} transform="translate(-9 -30)" fill="none" stroke="currentColor" strokeWidth={on ? 2.2 : 1.7} strokeLinecap="round" strokeLinejoin="round" />}
                  {label.split(' ').length > 1 && label.length > 9
                    ? <text y="-1" textAnchor="middle">{label.split(' ')[0]}<tspan x="0" dy="13">{label.split(' ').slice(1).join(' ')}</tspan></text>
                    : <text y="4" textAnchor="middle">{label}</text>}
                  <g transform={`translate(0 ${label.length > 9 && label.includes(' ') ? 25 : 18})`}><rect x="-8" y="-8" width="16" height="15" rx="2.5" className="ww-rseg-kbd" /><text y="3.5" textAnchor="middle" className="ww-rseg-key">{OPTION_LABEL[o.key].key}</text></g>
                </g>
              )}
            </g>
          );
        })}
        {!options && <circle r={(R_OUT + R_IN) / 2} fill="none" stroke="#ffb547" strokeOpacity="0.6" strokeWidth="2" strokeDasharray="14 10" className="ww-radial-spin" />}
        <circle r={R_CORE} fill="#0b0f18" fillOpacity="0.96" stroke={holder.tone === 'enemy' ? '#ff4d4f' : holder.tone === 'friend' ? '#4aa3ff' : '#8fa6c0'} strokeOpacity="0.75" strokeWidth="1.5" />
        <circle r={R_CORE - 5} fill="none" stroke={holder.tone === 'enemy' ? '#ff4d4f' : '#4aa3ff'} strokeOpacity="0.3" strokeDasharray="2 3" />
      </svg>
      <div className="ww-radial-core" style={{ left: cx - 42, top: cy - 42 }}>
        <span className="ww-title">{title}</span>
        <span className={`ww-radial-holder ${holder.tone}`}>{holder.text}</span>
        {estimate && <span className="ww-radial-est">{estimate}</span>}
      </div>
      {card && shown && (
        <div className={`ww-radial-card ${card.tone}`} style={cardLeft ? { right: W - (cx - 150), top: cy - 132 } : { left: cx + 150, top: cy - 132 }} data-testid="radial-detail" role="status">
          <span className="ww-title">{optionLabel(shown, kinds)}</span>
          {card.lines.map((l, i) => <span key={i} className={i === 0 ? 'lead' : ''}>{l}</span>)}
          {shown.ok.length > 0 && <span className="ww-radial-keys"><span className="ww-kbd">LMB</span> Issue <span className="ww-kbd">Esc</span> Cancel</span>}
        </div>
      )}
    </div>
  );
}

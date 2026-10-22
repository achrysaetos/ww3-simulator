import type { FormationKind } from '../../core/types';

/** A friendly unit counter as an inline SVG, in the kit's frame (KIT.md "NATO unit counter"). */
export function UnitGlyph({ kind, hostile = false }: { kind: FormationKind; hostile?: boolean }) {
  const mark = (() => {
    switch (kind) {
      case 'maneuver': return <><path d="M0 0 L30 20 M30 0 L0 20" /><ellipse cx="15" cy="10" rx="7" ry="4" fill="none" /></>;
      case 'artillery': return <circle cx="15" cy="10" r="3" fill="#fff" stroke="none" />;
      case 'air_defense': return <path d="M5 16 Q15 2 25 16" fill="none" />;
      case 'missile': return <path d="M8 15 L22 5 M17 5 H22 V10" fill="none" />;
      case 'logistics': return <path d="M0 14 H30" />;
      default: return <path d="M0 0 L30 20 M30 0 L0 20" />;
    }
  })();
  return (
    <svg className={`ww-glyph ${hostile ? 'hostile' : ''}`} width="24" height="16" viewBox="0 0 30 20" aria-hidden="true">
      <rect x="0.75" y="0.75" width="28.5" height="18.5" rx="1.5" />
      <g stroke="#fff" strokeWidth="1.5">{mark}</g>
    </svg>
  );
}

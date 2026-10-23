import { pillText } from './estimate';
import type { Aim, IntentKind } from './gesture';
import './drag.css';

const KICKER: Record<IntentKind, string> = {
  attack: 'Attack', naval_attack: 'Attack', strike: 'Strike', move_hold: 'Move and hold', hold_front: 'Hold the front',
  patrol: 'Counter-air patrol', sea_patrol: 'Patrol', blockade: 'Blockade', rebase: 'Rebase',
};

/** The drag's verdict beside the cursor: what letting go here orders, and how it is likely to go. */
export function Pill({ aim, x, y, width, height }: { aim: Aim | null; x: number; y: number; width: number; height: number }) {
  const t = aim ? pillText(aim.pill) : null;
  const going = aim?.going.length ?? 0;
  const kicker = !aim ? 'Order' : aim.pill.kind === 'refused' ? 'Cannot order' : `${KICKER[aim.intent!]}${going > 1 ? ` · ${going} units` : ''}`;
  // Beside the cursor, flipped to the other side near the right or bottom edge so it stays on screen.
  const left = x + 300 > width ? x - 18 : x + 18, top = y + 110 > height ? y - 14 : y + 14;
  const style = { left, top, transform: `translate(${left < x ? '-100%' : '0'}, ${top < y ? '-100%' : '0'})` };
  return (
    <div className={`ww-pill ${t?.tone ?? 'wait'}`} style={style} data-testid="pill" data-tone={t?.tone ?? 'wait'} role="status">
      <span className="ww-pill-kicker">{kicker}</span>
      <b className="ww-pill-main">{t?.primary ?? 'Reading the picture…'}</b>
      {t?.secondary && <span className="ww-pill-sub">{t.secondary}</span>}
    </div>
  );
}

import { pillText } from './estimate';
import type { Aim, IntentKind } from './gesture';
import './drag.css';

const KICKER: Record<IntentKind, string> = {
  attack: 'Attack', naval_attack: 'Attack', strike: 'Strike', move_hold: 'Move and hold', hold_front: 'Hold the front',
  patrol: 'Counter-air patrol', sea_patrol: 'Patrol', blockade: 'Blockade', rebase: 'Rebase',
};

export type PillTone = ReturnType<typeof pillText>['tone'] | 'wait';

export interface PillWords { kicker: string; primary: string; secondary?: string; tone: PillTone }

/** A drag's verdict beside the cursor, flipped to the other side near the right or bottom edge of its `width` x `height` box so it stays on screen. */
export function PillCard({ words, x, y, width, height, fixed }: { words: PillWords; x: number; y: number; width: number; height: number; fixed?: boolean }) {
  const left = x + 300 > width ? x - 18 : x + 18, top = y + 110 > height ? y - 14 : y + 14;
  const style = { left, top, transform: `translate(${left < x ? '-100%' : '0'}, ${top < y ? '-100%' : '0'})`, ...(fixed ? { position: 'fixed' as const, zIndex: 40 } : {}) };
  return (
    <div className={`ww-pill ${words.tone}`} style={style} data-testid="pill" data-tone={words.tone} role="status">
      <span className="ww-pill-kicker">{words.kicker}</span>
      <b className="ww-pill-main">{words.primary}</b>
      {words.secondary && <span className="ww-pill-sub">{words.secondary}</span>}
    </div>
  );
}

/** The order drag's pill: what letting go here orders, and how it is likely to go. */
export function Pill({ aim, x, y, width, height }: { aim: Aim | null; x: number; y: number; width: number; height: number }) {
  const t = aim ? pillText(aim.pill) : null;
  const going = aim?.going.length ?? 0;
  const kicker = !aim ? 'Order' : aim.pill.kind === 'refused' ? 'Cannot order' : `${KICKER[aim.intent!]}${going > 1 ? ` · ${going} units` : ''}`;
  const words: PillWords = t ? { kicker, ...t } : { kicker, primary: 'Reading the picture…', tone: 'wait' };
  return <PillCard words={words} x={x} y={y} width={width} height={height} />;
}

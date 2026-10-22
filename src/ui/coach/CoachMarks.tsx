import { useEffect, useLayoutEffect, useState } from 'react';
import { COACH_STEPS, type CoachStep } from './coach';
import './coach.css';

interface Box { x: number; y: number; w: number; h: number }
const PAD = 8;
const CARD_W = 340;

function boxOf(step: CoachStep): Box | null {
  const el = document.querySelector(step.target);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { x: r.left - PAD, y: r.top - PAD, w: r.width + 2 * PAD, h: r.height + 2 * PAD };
}

/** Where the card goes beside the lit box, kept on screen. */
function cardAt(step: CoachStep, b: Box): { left: number; top: number } {
  const vw = window.innerWidth, vh = window.innerHeight, gap = 18;
  const clampX = (x: number) => Math.max(16, Math.min(vw - CARD_W - 16, x));
  const clampY = (y: number) => Math.max(16, Math.min(vh - 230, y));
  switch (step.side) {
    case 'right': return { left: clampX(b.x + b.w + gap), top: clampY(b.y) };
    case 'left': return { left: clampX(b.x - CARD_W - gap), top: clampY(b.y) };
    case 'below': return { left: clampX(b.x + b.w / 2 - CARD_W / 2), top: clampY(b.y + b.h + gap) };
    case 'above': return { left: clampX(b.x + b.w / 2 - CARD_W / 2), top: clampY(b.y - 200 - gap) };
    case 'centre': return { left: clampX(vw / 2 - CARD_W / 2), top: clampY(vh * 0.36) };
  }
}

/** The first-session tour: one lit part of the screen at a time, a sentence on what it is for. */
export function CoachMarks({ onDone, steps = COACH_STEPS }: { onDone(): void; steps?: readonly CoachStep[] }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const step = steps[i];

  useLayoutEffect(() => {
    if (!step) return;
    const measure = () => setBox(step.side === 'centre' ? null : boxOf(step));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [step]);

  // A step whose target is not on screen (a narrow window hides some panels) is passed over.
  useEffect(() => {
    if (step && step.side !== 'centre' && !document.querySelector(step.target)) setI((x) => x + 1);
  }, [step]);

  useEffect(() => {
    if (!step) onDone();
  }, [step]);

  const next = () => setI((x) => x + 1);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onDone(); }
      else if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); next(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  if (!step) return null;
  const at = box ? cardAt(step, box) : cardAt(step, { x: 0, y: 0, w: 0, h: 0 });
  const last = i === steps.length - 1;
  return (
    <div className="cm-root" role="dialog" aria-label="Tour" data-testid="coach">
      {box ? (
        <div className="cm-hole" style={{ left: box.x, top: box.y, width: box.w, height: box.h }}><i /><b /></div>
      ) : <div className="cm-dim" />}
      <div className={`cm-card ww-glass ww-corners ${step.side}`} style={{ left: at.left, top: at.top, width: CARD_W }} key={step.id} data-testid={`coach-${step.id}`}>
        <div className="cm-head">
          <span className="ww-label">Tour · {i + 1} / {steps.length}</span>
          <span className="cm-dots" aria-hidden="true">{steps.map((s, k) => <i key={s.id} className={k === i ? 'on' : k < i ? 'done' : ''} />)}</span>
        </div>
        <h3 className="ww-title">{step.title}</h3>
        <p>{step.text}</p>
        <div className="cm-foot">
          {step.key && <span className="cm-key"><span className="ww-kbd">{step.key}</span></span>}
          <span className="ww-grow" />
          {!last && <button type="button" className="ww-btn ghost small" onClick={onDone} data-testid="coach-skip">Skip tour</button>}
          <button type="button" className="ww-btn gold small" onClick={next} data-testid="coach-next">{last ? 'Done' : 'Next'} <span className="ww-kbd">Enter</span></button>
        </div>
      </div>
    </div>
  );
}

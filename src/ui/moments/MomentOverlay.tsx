import { useEffect } from 'react';
import type { Moment } from './moments';
import './moments.css';

const KICKER: Record<Moment['kind'], string> = { nuclear: 'Flash · Nuclear', capital: 'Flash · Capital', war: 'Flash · War', carrier: 'Flash · Naval', fleet: 'Flash · Naval', breakthrough: 'Flash · Front' };
export const MOMENT_MS = 4200;

function Mark({ kind }: { kind: Moment['kind'] }) {
  if (kind === 'nuclear') return <svg width="54" height="54" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 8 m-1.6 0 a1.6 1.6 0 1 0 3.2 0 a1.6 1.6 0 1 0 -3.2 0 M8 6 L5 1.5 A7 7 0 0 1 11 1.5 Z M6.3 9 L1.3 9 A7 7 0 0 0 4.3 14.2 Z M9.7 9 L14.7 9 A7 7 0 0 1 11.7 14.2 Z" fill="currentColor" /></svg>;
  if (kind === 'capital') return <svg width="54" height="54" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 L9.8 6 L14.5 6.3 L10.9 9.3 L12 14 L8 11.4 L4 14 L5.1 9.3 L1.5 6.3 L6.2 6 Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>;
  if (kind === 'war') return <svg width="54" height="54" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 13 L13 3 M10.5 3 L13 3 L13 5.5 M13 13 L3 3 M5.5 3 L3 3 L3 5.5 M2 14 L4 12 M14 14 L12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" /></svg>;
  if (kind === 'carrier' || kind === 'fleet') return <svg width="54" height="54" viewBox="0 0 16 16" aria-hidden="true"><path d="M1 9 L15 9 L13 12.5 L3 12.5 Z M9 9 L9 6 L11 6 L11 9 M1 14.5 C3 13.5 5 15.5 8 14.5 C11 13.5 13 15.5 15 14.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>;
  return <svg width="54" height="54" viewBox="0 0 16 16" aria-hidden="true"><path d="M1 12 L6 7 L9 10 L15 4 M11 4 L15 4 L15 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

/** A moment lands: a flash across the screen and a title band, gone after a few seconds or on a click. */
export function MomentOverlay({ moment, onDone }: { moment: Moment; onDone(): void }) {
  useEffect(() => {
    const id = setTimeout(onDone, MOMENT_MS);
    return () => clearTimeout(id);
  }, [moment.key]);
  return (
    <div className={`mo-root ${moment.kind} ${moment.tone}`} onClick={onDone} role="alert" data-testid="moment">
      <div className="mo-flash" aria-hidden="true" />
      <div className="mo-band">
        <span className="mo-mark"><Mark kind={moment.kind} /></span>
        <div className="mo-words">
          <span className="mo-kicker">{KICKER[moment.kind]}</span>
          <span className="mo-title ww-title">{moment.title}</span>
          <span className="mo-sub">{moment.sub}</span>
        </div>
      </div>
    </div>
  );
}

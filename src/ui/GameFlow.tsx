import { useRef, useState, type ReactNode } from 'react';
import type { NationId } from '../core/types';
import type { Briefing, Objective, Outcome } from './briefing';
import type { SimClient } from './client';

/** Save, load, briefing and quit, behind one button in the top bar. */
export function GameMenu({ client, onBriefing, onQuit }: { client: SimClient; onBriefing(): void; onQuit(): void }) {
  const [open, setOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const act = (f: () => void) => () => { setOpen(false); f(); };
  const slotDay = client.slot ? Math.floor((client.slot.tick * (client.meta?.dtHours ?? 6)) / 24) : 0;
  return (
    <div className="game-menu">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="game-menu">Game ▾</button>
      {open && (
        <div className="game-menu-list" role="menu">
          <button role="menuitem" onClick={act(onBriefing)} data-testid="menu-briefing">Briefing and objectives</button>
          <button role="menuitem" onClick={act(() => client.save('slot'))} data-testid="menu-quicksave">Quick save</button>
          <button role="menuitem" onClick={act(() => client.save('download'))} data-testid="menu-download">Download save file</button>
          <button role="menuitem" disabled={!client.slot} onClick={act(() => void client.load())} data-testid="menu-quickload">
            Load quick save{client.slot ? ` (${client.slot.scenario}, D+${slotDay})` : ''}
          </button>
          <button role="menuitem" onClick={act(() => file.current?.click())} data-testid="menu-load-file">Load save file…</button>
          <button role="menuitem" className="danger-text" onClick={act(onQuit)} data-testid="menu-quit">Quit to start screen…</button>
        </div>
      )}
      <LoadFileInput client={client} inputRef={file} />
    </div>
  );
}

export function LoadFileInput({ client, inputRef }: { client: SimClient; inputRef: React.RefObject<HTMLInputElement | null> }) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept=".json,application/json"
      hidden
      data-testid="load-file"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (f) void f.text().then((t) => client.load(t));
      }}
    />
  );
}

export interface Confirmation { title: string; text: string; yes: string; onYes(): void }

export function ConfirmDialog({ c, onClose }: { c: Confirmation; onClose(): void }) {
  return (
    <div className="modal-back" role="dialog" aria-modal="true">
      <div className="modal" data-testid="confirm-dialog">
        <h2>{c.title}</h2>
        <p>{c.text}</p>
        <div className="row gap end">
          <button onClick={onClose} data-testid="confirm-no" autoFocus>Cancel</button>
          <button className="danger" onClick={() => { onClose(); c.onYes(); }} data-testid="confirm-yes">{c.yes}</button>
        </div>
      </div>
    </div>
  );
}

export function ObjectiveList({ items }: { items: Objective[] }) {
  if (!items.length) return <p className="muted small">No fixed objectives: your aims are your own.</p>;
  return (
    <ul className="objectives" data-testid="objectives">
      {items.map((o) => <li key={o.label} className={o.met ? 'met' : 'open'}><span className="obj-mark">{o.met ? '✓' : '○'}</span>{o.label}</li>)}
    </ul>
  );
}

interface BriefingProps {
  client: SimClient;
  nation: NationId;
  briefing: Briefing;
  objectives: Objective[];
  delegated: string[];
  kept: string[];
  onClose(): void;
}

export function BriefingDialog({ client, nation, briefing, objectives, delegated, kept, onClose }: BriefingProps) {
  const name = client.namer.nation(nation);
  const sc = client.meta?.scenario;
  return (
    <div className="modal-back" role="dialog" aria-modal="true">
      <div className="modal briefing" data-testid="briefing">
        <h2>{sc?.name ?? 'Briefing'} · {name}</h2>
        <p className="muted small">{sc?.summary}</p>
        <p>{briefing.text}</p>
        <h3 className="modal-h">Objectives</h3>
        <ObjectiveList items={objectives} />
        <h3 className="modal-h">How you command</h3>
        <ul className="brief-list">
          <li>{delegated.length ? <>Your AI delegate runs <b>{delegated.join(', ')}</b>.</> : 'You run everything yourself.'} {kept.length ? <>You decide <b>{kept.join(', ')}</b>.</> : ''} Change this under Command authority on the Nation tab; any order you give a unit takes it off the delegate.</li>
          <li>The clock is paused. Press space or a speed button to run it, or Step to advance six hours.</li>
          <li>Click a counter on the map or a row under Forces to command a unit. Ground units cross the sea by strategic deployment (airlift or cargo ships) or by amphibious lift.</li>
          <li>Treaty calls and peace offers pause the game and wait for your answer.</li>
          <li>{briefing.reminder}</li>
          <li>Save, load and quit are under the Game menu.</li>
        </ul>
        <div className="row gap end">
          <button className="primary" onClick={onClose} data-testid="briefing-close" autoFocus>Take command</button>
        </div>
      </div>
    </div>
  );
}

const OUTCOME_TITLE: Record<Outcome['kind'], string> = { victory: 'Victory', defeat: 'Defeat', peace: 'The war is over' };

export function EndDialog({ outcome, objectives, children, onContinue, onQuit }: { outcome: Outcome; objectives: Objective[]; children?: ReactNode; onContinue(): void; onQuit(): void }) {
  return (
    <div className="modal-back" role="dialog" aria-modal="true">
      <div className={`modal end ${outcome.kind}`} data-testid="end-screen">
        <h2 data-testid="end-title">{OUTCOME_TITLE[outcome.kind]}</h2>
        <p>{outcome.text}</p>
        {children}
        <h3 className="modal-h">Objectives</h3>
        <ObjectiveList items={objectives} />
        <div className="row gap end">
          <button onClick={onContinue} data-testid="end-continue">Keep watching</button>
          <button className="primary" onClick={onQuit} data-testid="end-quit">Back to start screen</button>
        </div>
      </div>
    </div>
  );
}

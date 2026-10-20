import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { FormationId, NationId, NodeId, Posture, TargetClass } from '../core/types';
import type { SimClient } from './client';
import { Palette } from './colors';
import { EventLog } from './EventLog';
import { PlaceNamer } from './events';
import { FormationList, FormationPanel } from './FormationPanel';
import { MapView } from './MapView';
import { NationPanel } from './NationPanel';
import { NuclearDialog } from './NuclearDialog';
import { StartScreen } from './StartScreen';
import type { Overlays } from './renderer';

const SPEEDS = [0, 1, 5, 20] as const;
type Speed = (typeof SPEEDS)[number];
const OVERLAY_LABELS: Record<keyof Overlays, string> = { air: 'Air control', sea: 'Sea control', infra: 'Infrastructure damage', fallout: 'Fallout', cities: 'Cities', seaZones: 'Sea zones' };

export function App({ client }: { client: SimClient }) {
  useSyncExternalStore(client.subscribe, client.getVersion);
  const palette = useMemo(() => new Palette((id) => client.nationCards.get(id as NationId)?.blocs ?? []), [client]);
  if (!client.meta || !client.playing) return <StartScreen client={client} palette={palette} />;
  return <Command client={client} palette={palette} initialNation={client.playing} />;
}

function Command({ client, palette, initialNation }: { client: SimClient; palette: Palette; initialNation: NationId }) {
  const version = client.version;
  const places = useMemo(() => new PlaceNamer(client.map), [client]);
  const focusHandle = useRef<((n: NodeId) => void) | null>(null);

  const [playAs, setPlayAs] = useState<NationId>(initialNation);
  const [selected, setSelected] = useState<FormationId | null>(null);
  const [pending, setPending] = useState<{ posture: Posture; targetClass?: TargetClass } | null>(null);
  const [nuclearPick, setNuclearPick] = useState(false);
  const [nuclearTarget, setNuclearTarget] = useState<NodeId | null>(null);
  const speed = client.ticksPerSec as Speed;
  const setSpeed = (s: Speed) => client.setSpeed(s);
  const [overlays, setOverlays] = useState<Overlays>({ air: true, sea: true, infra: true, fallout: true, cities: true, seaZones: true });
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => client.focus(playAs, selected ?? undefined), [client, playAs, selected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'Escape') { setPending(null); setNuclearPick(false); }
      if (e.key === ' ') { e.preventDefault(); client.setSpeed(client.ticksPerSec ? 0 : 1); }
      if (e.key === '.') client.step();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [client]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const choose = (id: NationId) => {
    setPlayAs(id);
    setSelected(null);
    setPending(null);
    client.playAs(id);
  };

  const selectFormation = (id: FormationId | null) => {
    setSelected(id);
    setPending(null);
  };

  const onTarget = (node: NodeId) => {
    if (nuclearPick) {
      setNuclearPick(false);
      setNuclearTarget(node);
      return;
    }
    if (!pending || !selected) return;
    client.command({ type: 'order', nation: playAs, formation: selected, order: { posture: pending.posture, target: node, targetClass: pending.targetClass } });
    setToast(`${pending.posture.replace(/_/g, ' ')} order sent → ${places.name(node)}. Takes effect next tick.`);
    setPending(null);
  };

  const date = client.state.date ? new Date(client.state.date) : null;
  const hours = client.state.tick * (client.meta?.dtHours ?? 6);
  const nations = [...client.state.nations.values()].sort((a, b) => a.name.localeCompare(b.name));
  const selectedView = selected ? client.state.formations.find((f) => f.entry.id === selected) : undefined;
  const targeting = nuclearPick ? 'nuclear' : pending ? 'order' : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">◆</span> WW3 <span className="brand-sub">Strategic Command</span></div>
        <div className="clock" data-testid="clock">
          <div className="clock-date mono">{date ? date.toUTCString().slice(5, 22) + 'Z' : 'Initializing…'}</div>
          <div className="clock-sub mono">D+{Math.floor(hours / 24)} · tick {client.state.tick} · {client.meta?.scenario.name}</div>
        </div>
        <div className="perf mono" data-testid="perf" title="Engine time for the last tick, and ticks actually completed per second against the requested speed">
          <div>{client.stats.stepMs ? `${client.stats.stepMs.toFixed(0)} ms/tick` : '—'}</div>
          <div className={speed && client.stats.achievedTps && client.stats.achievedTps < speed * 0.9 ? 'lagging' : ''}>
            {speed ? `${client.stats.achievedTps.toFixed(1)} / ${speed} t/s` : 'paused'}
          </div>
        </div>
        <div className="time-ctl" role="group" aria-label="Time controls">
          {SPEEDS.map((s) => (
            <button key={s} className={speed === s ? 'active' : ''} onClick={() => setSpeed(s)} data-testid={`speed-${s}`} title={s ? `${s} ticks per second` : 'Pause (space)'}>
              {s ? `${s}×` : '❚❚'}
            </button>
          ))}
          <button onClick={() => client.step()} disabled={speed !== 0} title="Advance one tick (.)" data-testid="step">Step ▸</button>
        </div>
        <div className="play-as">
          <span>Playing</span>
          <select value={playAs} onChange={(e) => choose(e.target.value as NationId)} data-testid="play-as">
            {nations.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </div>
      </header>

      <aside className="left">
        <NationPanel client={client} palette={palette} playAs={playAs} onCommand={(c) => { client.command(c); setToast(`${c.type.replace(/_/g, ' ')} sent. Takes effect next tick.`); }} onNuclear={() => { setPending(null); setNuclearPick(true); }} />
      </aside>

      <main className="center">
        <MapView
          client={client}
          palette={palette}
          places={places}
          playAs={playAs}
          selected={selected}
          targeting={targeting}
          overlays={overlays}
          onSelectFormation={selectFormation}
          onTarget={onTarget}
          focusHandle={focusHandle}
        />
        <div className="overlay-ctl">
          {(Object.keys(OVERLAY_LABELS) as (keyof Overlays)[]).map((k) => (
            <label key={k} className="chk"><input type="checkbox" checked={overlays[k]} onChange={(e) => setOverlays((o) => ({ ...o, [k]: e.target.checked }))} /> {OVERLAY_LABELS[k]}</label>
          ))}
        </div>
        <div className="legend">
          <span><i className="lg-front" /> Front line</span>
          <span><i className="lg-air" /> Air control</span>
          <span><i className="lg-infra" /> Infra damage</span>
          <span><i className="lg-fallout" /> Fallout</span>
        </div>
        {targeting && <div className={`target-banner ${targeting}`}>{targeting === 'nuclear' ? 'Select nuclear aim point' : `Select target: ${pending?.posture.replace(/_/g, ' ')}`} · Esc to cancel</div>}
        {toast && <div className="toast" data-testid="toast">{toast}</div>}
        {client.error && <div className="toast error">Simulation error: {client.error}</div>}
      </main>

      <aside className="right">
        {selected && selectedView ? (
          <FormationPanel
            client={client}
            palette={palette}
            places={places}
            playAs={playAs}
            pending={pending?.posture ?? null}
            onPickPosture={(p, targetClass) => { setNuclearPick(false); setPending(p ? { posture: p, targetClass } : null); }}
            onImmediate={(p) => { client.command({ type: 'order', nation: playAs, formation: selected, order: { posture: p } }); setToast(`${p} order sent.`); setPending(null); }}
            onClose={() => selectFormation(null)}
            onFocus={(n) => focusHandle.current?.(n)}
          />
        ) : (
          <FormationList client={client} palette={palette} places={places} playAs={playAs} onSelect={(id, node) => { selectFormation(id); focusHandle.current?.(node); }} />
        )}
      </aside>

      <footer className="bottom">
        <EventLog client={client} places={places} playAs={playAs} version={version} onFocus={(n) => focusHandle.current?.(n)} />
      </footer>

      {nuclearTarget !== null && (
        <NuclearDialog
          client={client}
          places={places}
          nation={playAs}
          target={nuclearTarget}
          onCancel={() => setNuclearTarget(null)}
          onRelease={(c) => { client.command(c); setNuclearTarget(null); setToast('Emergency action message transmitted.'); }}
        />
      )}
    </div>
  );
}

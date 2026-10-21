import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { COMMAND_DOMAINS, type Command, type FormationId, type FormationKind, type NationId, type NodeId, type Order, type Posture, type TargetClass } from '../core/types';
import { DEFAULT_DELEGATION, DOMAIN_OF_KIND } from '../systems/orders';
import type { SimClient } from './client';
import { Palette } from './colors';
import { briefingFor, objectives as objectivesOf, outcome as outcomeOf } from './briefing';
import { Decisions } from './Decisions';
import { BriefingDialog, ConfirmDialog, EndDialog, GameMenu, type Confirmation } from './GameFlow';
import { EventLog } from './EventLog';
import { FormationList, FormationPanel, GROUND_KINDS, type Command as CommandHolder } from './FormationPanel';
import { MapView } from './MapView';
import { DOMAIN_LABEL, NationPanel } from './NationPanel';
import { NuclearDialog } from './NuclearDialog';
import { Routes } from './routes';
import type { LoggedEvent } from './feed';
import { StartScreen } from './StartScreen';
import type { Overlays } from './renderer';

const SPEEDS = [0, 1, 5, 20] as const;
type Speed = (typeof SPEEDS)[number];
const OVERLAY_LABELS: Record<keyof Overlays, string> = { air: 'Air control', sea: 'Sea control', infra: 'Infrastructure damage', fallout: 'Fallout', cities: 'Cities', seaZones: 'Sea zones' };
const TABS = [['nation', 'Nation'], ['forces', 'Forces'], ['log', 'Log']] as const;
type Tab = (typeof TABS)[number][0];
/** Ticks to watch for the engine refusing an order the player just gave. */
const WATCH_TICKS = 8;
const FORM_CONTROLS = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON']);

interface Toast { text: string; tone: 'info' | 'error' }
/** Waiting on the engine's word about something the player just did: a refused order, a landing team split off, a launch. */
interface Watch { untilTick: number; seenSeq: number; match(row: LoggedEvent): Toast | null; timeout?: Toast }

export function App({ client }: { client: SimClient }) {
  useSyncExternalStore(client.subscribe, client.getVersion);
  const palette = useMemo(() => new Palette((id) => client.nationCards.get(id as NationId)?.blocs ?? []), [client]);
  if (!client.meta || !client.playing) return <StartScreen client={client} palette={palette} />;
  return <Command key={client.sessionId} client={client} palette={palette} initialNation={client.playing} />;
}

function Command({ client, palette, initialNation }: { client: SimClient; palette: Palette; initialNation: NationId }) {
  const places = client.places;
  const routes = useMemo(() => new Routes(client.map), [client]);
  const focusHandle = useRef<((n: NodeId) => void) | null>(null);

  const [playAs, setPlayAs] = useState<NationId>(initialNation);
  const [selected, setSelected] = useState<FormationId | null>(null);
  const [pending, setPending] = useState<{ posture: Posture; targetClass?: TargetClass; lift?: 'air' | 'sea' } | null>(null);
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const [briefingOpen, setBriefingOpen] = useState(true);
  const [endSeen, setEndSeen] = useState<string | null>(null);
  const [nuclearPick, setNuclearPick] = useState(false);
  const [nuclearTarget, setNuclearTarget] = useState<NodeId | null>(null);
  const [tab, setTab] = useState<Tab>('forces');
  const speed = client.ticksPerSec as Speed;
  const setSpeed = (s: Speed) => client.setSpeed(s);
  const [overlays, setOverlays] = useState<Overlays>({ air: true, sea: true, infra: true, fallout: true, cities: true, seaZones: true });
  const [toast, setToast] = useState<Toast | null>(null);
  const watch = useRef<Watch | null>(null);
  const lastSeq = () => client.feed.newest(new Set(), null, 1)[0]?.seq ?? -1;

  const nationOptions = useMemo(
    () => [...client.nationCards.values()].sort((a, b) => a.name.localeCompare(b.name)).map((n) => <option key={n.id} value={n.id}>{n.name}</option>),
    [client.nationCards],
  );
  const d = client.state.focusNation?.id === playAs ? client.state.focusNation : undefined;
  const ai = d?.authority.ai ?? DEFAULT_DELEGATION;
  const heldKey = d?.authority.held.join(',') ?? '';
  const held = useMemo(() => new Set(heldKey ? heldKey.split(',') : []), [heldKey]);
  const commandOf = (id: FormationId, kind: FormationKind): CommandHolder => (held.has(id) ? 'player' : ai[DOMAIN_OF_KIND[kind]] ? 'delegate' : 'none');

  useEffect(() => client.focus(playAs, selected ?? undefined), [client, playAs, selected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setPending(null); setNuclearPick(false); setNuclearTarget(null); return; }
      if (FORM_CONTROLS.has((e.target as HTMLElement).tagName)) return;
      if (e.key === ' ') { e.preventDefault(); client.setSpeed(client.ticksPerSec ? 0 : 1); }
      if (e.key === '.') client.step();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [client]);

  const noticeSeq = client.notice?.seq;
  useEffect(() => {
    if (client.notice) setToast({ text: client.notice.text, tone: client.notice.tone });
  }, [client, noticeSeq]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.tone === 'error' ? 9000 : 3500);
    return () => clearTimeout(id);
  }, [toast]);

  // A treaty call is the player's to answer: stop the clock when one arrives.
  const callsKey = d?.treatyCalls.map((c) => `${c.war}|${c.treaty}|${c.reconsidered}`).join(',') ?? '';
  const seenCalls = useRef('');
  useEffect(() => {
    const fresh = callsKey.split(',').some((k) => k && !seenCalls.current.split(',').includes(k));
    seenCalls.current = callsKey;
    if (fresh && client.ticksPerSec) {
      client.setSpeed(0);
      setToast({ tone: 'info', text: 'Paused: a treaty call needs your decision.' });
    }
  }, [client, callsKey]);

  // Surface what the engine said about an order the player just gave (a refusal, a landing team split off).
  useEffect(() => {
    const w = watch.current;
    if (!w) return;
    for (const r of client.feed.newest(new Set(), playAs, 60).reverse()) {
      if (r.seq <= w.seenSeq) continue;
      const t = w.match(r);
      if (t) {
        setToast(t);
        watch.current = null;
        return;
      }
    }
    if (client.state.tick > w.untilTick) {
      if (w.timeout) setToast(w.timeout);
      watch.current = null;
    }
  }, [client, client.feed.version, client.state.tick, playAs]);

  const choose = (id: NationId) => {
    const go = () => {
      setPlayAs(id);
      setSelected(null);
      setPending(null);
      everEnemies.current = new Set();
      setEndSeen(null);
      client.playAs(id);
    };
    const me = client.state.nations.get(playAs);
    if (me?.status !== 'war') return go();
    setConfirm({
      title: `Switch to ${client.namer.nation(id)}?`,
      text: `${me.name} is at war. Your AI delegate will take over all of ${me.name}'s forces and decisions, and you will command ${client.namer.nation(id)} from now on.`,
      yes: `Play as ${client.namer.nation(id)}`,
      onYes: go,
    });
  };

  const quit = () => setConfirm({
    title: 'Quit to the start screen?',
    text: 'The war in progress ends here. Save it first from the Game menu if you want to come back to it.',
    yes: 'Quit',
    onYes: () => client.quit(),
  });

  const selectFormation = useCallback((id: FormationId | null) => {
    setSelected(id);
    setPending(null);
    if (id) setTab('forces');
  }, []);
  const focusNode = useCallback((n: NodeId) => focusHandle.current?.(n), []);
  const pickFromList = useCallback((id: FormationId, node: NodeId) => {
    selectFormation(id);
    focusNode(node);
  }, [selectFormation, focusNode]);

  const sendCommand = (c: Command, label: string) => {
    client.command(c);
    setToast({ tone: 'info', text: `${label}. Takes effect next tick.` });
  };

  /** The player's order also takes the formation from the AI delegate. */
  const sendOrder = (formation: FormationId, order: Omit<Order, 'issuedTick'>, label: string) => {
    const name = client.state.formations.find((f) => f.entry.id === formation)?.entry.name ?? 'Formation';
    const seenSeq = lastSeq();
    client.command({ type: 'hold', nation: playAs, formations: [formation], held: true });
    client.command({ type: 'order', nation: playAs, formation, order });
    watch.current = {
      untilTick: client.state.tick + WATCH_TICKS,
      seenSeq,
      match: (r) => (r.event.type === 'message' && r.text.startsWith(name) ? { tone: /refused|no land route|cannot|no friendly/.test(r.text) ? 'error' : 'info', text: r.text } : null),
    };
    setToast({ tone: 'info', text: `${label}. Takes effect next tick; now under your command.` });
  };

  const onTarget = (node: NodeId) => {
    if (nuclearPick) {
      setNuclearPick(false);
      setNuclearTarget(node);
      return;
    }
    if (!pending || !selected) return;
    const f = client.state.formations.find((x) => x.entry.id === selected);
    const across = !!f && GROUND_KINDS.has(f.entry.kind) && f.status === 'active' && routes.overseas(f.node, node);
    if (across && pending.posture === 'attack') {
      setToast({
        tone: 'error',
        text: `${f!.entry.name} cannot attack ${places.name(node)} overland: it lies across the sea. Give it a Move order to deploy there by air or cargo ship, or embark it on amphibious lift to land under fire.`,
      });
      setPending(null);
      return;
    }
    if (across && pending.posture === 'move') {
      const how = pending.lift === 'sea' ? 'by sealift' : pending.lift === 'air' ? 'by airlift' : 'by air if it can fly, otherwise by sea';
      sendOrder(selected, { posture: 'move', target: node, ...(pending.lift ? { lift: pending.lift } : {}) }, `Deploying ${f!.entry.name} to ${places.name(node)} ${how}`);
      setPending(null);
      return;
    }
    sendOrder(selected, { posture: pending.posture, target: node, targetClass: pending.targetClass }, `${pending.posture.replace(/_/g, ' ')} order sent → ${places.name(node)}`);
    setPending(null);
  };

  const releaseAll = () => {
    if (!held.size) return;
    client.command({ type: 'hold', nation: playAs, formations: [...held] as FormationId[], held: false });
    setToast({ tone: 'info', text: `${held.size} formations handed back to the AI delegate.` });
  };

  const date = client.state.date ? new Date(client.state.date) : null;
  const hours = client.state.tick * (client.meta?.dtHours ?? 6);
  const selectedView = selected ? client.state.formations.find((f) => f.entry.id === selected) : undefined;
  const targeting = nuclearPick ? 'nuclear' : pending ? 'order' : null;
  const centre = useRef<HTMLElement>(null);
  // On a phone the panel sits below the map: bring the map back into view to pick the target.
  useEffect(() => {
    if (targeting && matchMedia('(max-width: 760px)').matches) centre.current?.scrollIntoView({ block: 'start' });
  }, [targeting]);
  const delegatedNames = COMMAND_DOMAINS.filter((k) => ai[k]).map((k) => DOMAIN_LABEL[k].name);
  const keptNames = COMMAND_DOMAINS.filter((k) => !ai[k]).map((k) => DOMAIN_LABEL[k].name);

  const nationIds = client.meta?.nationIds ?? [];
  const briefing = useMemo(() => briefingFor(client.map, client.meta?.scenario.id ?? '', playAs), [client, playAs]);
  const everEnemies = useRef(new Set<NationId>());
  for (const e of d?.enemies ?? []) everEnemies.current.add(e);
  const objectives = objectivesOf(client.state, nationIds, briefing, playAs, d?.enemies ?? [], everEnemies.current);
  const ending = d ? outcomeOf(client.state, playAs, d.enemies, everEnemies.current, objectives) : null;
  const endKey = ending ? `${ending.kind}|${ending.text}` : null;
  useEffect(() => {
    if (endKey && endKey !== endSeen && client.ticksPerSec) client.setSpeed(0);
  }, [client, endKey, endSeen]);

  const releaseNuclear = (c: Extract<Command, { type: 'nuclear_release' }>) => {
    const seenSeq = lastSeq();
    client.command(c);
    setNuclearTarget(null);
    watch.current = {
      untilTick: client.state.tick + 2,
      seenSeq,
      match: (r) => {
        const e = r.event;
        if (e.type === 'message' && /^nuclear release refused/.test(e.text)) return { tone: 'error', text: r.text };
        if (e.type === 'nuclear_detonation' && e.by === playAs) return { tone: 'info', text: `Launch confirmed. ${r.text}` };
        if (e.type === 'strike' && e.by === playAs && e.munition === c.munition) return { tone: 'info', text: `Launch confirmed. ${r.text}` };
        return null;
      },
      timeout: { tone: 'error', text: 'No launch was reported: the release order was not carried out.' },
    };
    setToast({ tone: 'info', text: 'Release order sent. Waiting for the launch report; advance time if paused.' });
  };

  return (
    <div className="app" data-tab={tab}>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">◆</span> WW3 <span className="brand-sub">Strategic Command</span></div>
        <button
          className={`delegate-pill ${delegatedNames.length ? 'on' : 'off'}`}
          onClick={() => setTab('nation')}
          data-testid="delegate-pill"
          title={`AI delegate commands: ${delegatedNames.join(', ') || 'nothing'}. You decide: ${keptNames.join(', ') || 'nothing'}. Change it under Command authority.`}
        >
          {delegatedNames.length === COMMAND_DOMAINS.length ? 'AI runs everything' : delegatedNames.length ? `AI delegate: ${COMMAND_DOMAINS.filter((k) => ai[k]).map((k) => SHORT[k]).join(' · ')}` : 'No AI delegate'}
          {keptNames.length > 0 && delegatedNames.length > 0 && <span className="muted"> · you: {COMMAND_DOMAINS.filter((k) => !ai[k]).map((k) => SHORT[k]).join(' · ')}</span>}
        </button>
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
        <GameMenu client={client} onBriefing={() => setBriefingOpen(true)} onQuit={quit} />
        <div className="play-as">
          <span>Playing</span>
          <select value={playAs} onChange={(e) => choose(e.target.value as NationId)} data-testid="play-as">
            {nationOptions}
          </select>
        </div>
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)} data-testid={`tab-${k}`}>{label}</button>
        ))}
      </nav>

      <aside className="left">
        <NationPanel client={client} palette={palette} playAs={playAs} objectives={objectives} onCommand={sendCommand} onNuclear={() => { setPending(null); setNuclearPick(true); }} />
      </aside>

      <main className="center" ref={centre}>
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
        <details className="overlay-ctl">
          <summary>Layers</summary>
          {(Object.keys(OVERLAY_LABELS) as (keyof Overlays)[]).map((k) => (
            <label key={k} className="chk"><input type="checkbox" checked={overlays[k]} onChange={(e) => setOverlays((o) => ({ ...o, [k]: e.target.checked }))} /> {OVERLAY_LABELS[k]}</label>
          ))}
        </details>
        <div className="legend">
          <span><i className="lg-front" /> Front line</span>
          <span><i className="lg-contest" /> Advance within a cell</span>
          <span><i className="lg-air" /> Air control</span>
          <span><i className="lg-infra" /> Infra damage</span>
          <span><i className="lg-fallout" /> Fallout</span>
        </div>
        {d && <Decisions client={client} d={d} onCommand={sendCommand} />}
        {targeting && <div className={`target-banner ${targeting}`}>{targeting === 'nuclear' ? 'Select nuclear aim point' : pending?.lift ? `Select destination overseas: deploy by ${pending.lift === 'air' ? 'airlift' : 'sealift'}` : `Select target: ${pending?.posture.replace(/_/g, ' ')}`} · Esc to cancel</div>}
        {toast && <div className={`toast ${toast.tone}`} data-testid="toast" role="status">{toast.text}</div>}
        {client.error && <div className="toast error">Simulation error: {client.error}</div>}
      </main>

      <aside className="right">
        {selected && selectedView ? (
          <FormationPanel
            client={client}
            palette={palette}
            places={places}
            routes={routes}
            playAs={playAs}
            command={commandOf(selectedView.entry.id, selectedView.entry.kind)}
            domainLabel={DOMAIN_LABEL[DOMAIN_OF_KIND[selectedView.entry.kind]].what}
            pending={pending?.posture ?? null}
            onPickPosture={(p, targetClass, lift) => { setNuclearPick(false); setPending(p ? { posture: p, targetClass, lift } : null); }}
            pendingLift={pending?.lift ?? null}
            onImmediate={(p) => { sendOrder(selected, { posture: p }, `${p.replace(/_/g, ' ')} order sent`); setPending(null); }}
            onOrder={sendOrder}
            onHold={(h) => sendCommand({ type: 'hold', nation: playAs, formations: [selected], held: h }, h ? `${selectedView.entry.name} taken under your command` : `${selectedView.entry.name} handed to the AI delegate`)}
            onClose={() => selectFormation(null)}
            onFocus={focusNode}
          />
        ) : (
          <FormationList client={client} palette={palette} places={places} playAs={playAs} commandOf={commandOf} onSelect={pickFromList} onReleaseAll={releaseAll} />
        )}
      </aside>

      <footer className="bottom">
        <EventLog client={client} playAs={playAs} logVersion={client.feed.version} onFocus={focusNode} />
      </footer>

      {nuclearTarget !== null && (
        <NuclearDialog
          client={client}
          places={places}
          nation={playAs}
          target={nuclearTarget}
          onCancel={() => setNuclearTarget(null)}
          onRelease={releaseNuclear}
        />
      )}
      {briefingOpen && (
        <BriefingDialog client={client} nation={playAs} briefing={briefing} objectives={objectives} delegated={delegatedNames} kept={keptNames} onClose={() => setBriefingOpen(false)} />
      )}
      {ending && endKey !== endSeen && !briefingOpen && (
        <EndDialog outcome={ending} objectives={objectives} onContinue={() => setEndSeen(endKey)} onQuit={() => client.quit()} />
      )}
      {confirm && <ConfirmDialog c={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

const SHORT: Record<(typeof COMMAND_DOMAINS)[number], string> = { land: 'land', air: 'air', naval: 'naval', homefront: 'home front', strategic: 'strategic' };

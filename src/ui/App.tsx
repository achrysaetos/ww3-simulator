import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { COMMAND_DOMAINS, type Command, type CommandDomain, type FormationId, type FormationKind, type NationId, type NodeId, type Order, type Posture, type TargetClass } from '../core/types';
import { DEFAULT_DELEGATION, DOMAIN_OF_KIND } from '../systems/orders';
import type { SimClient } from './client';
import { Palette } from './colors';
import { briefingFor, objectives as objectivesOf, outcome as outcomeOf } from './briefing';
import { coachDue, markCoachDone } from './coach/coach';
import { MomentOverlay } from './moments/MomentOverlay';
import { momentsOf, type Moment } from './moments/moments';
import { CoachMarks } from './coach/CoachMarks';
import { CrisisScreen } from './crisis/CrisisScreen';
import { answered, nextCrisis, type Crisis, type CrisisContext } from './crisis/crisis';
import { ConfirmDialog, EndDialog, GameMenu, type Confirmation } from './GameFlow';
import { crisesOn } from './prefs';
import { EventLog } from './EventLog';
import { humanizeReason } from './events';
import { FormationList, FormationPanel, type Command as CommandHolder } from './FormationPanel';
import { GROUND_KINDS, postureLabel } from './orders/postures';
import { useOrders } from './orders/useOrders';
import './orders/orders.css';
import { MapView, openingFocus } from './MapView';
import { frontStat, TopBar, type TopBarStat } from './map/TopBar';
import { ContactPanel } from './map/ContactPanel';
import { DOMAIN_LABEL, NationPanel } from './NationPanel';
import { NuclearDialog } from './NuclearDialog';
import { OutputsPanel } from './outputs/OutputsPanel';
import { Routes } from './routes';
import type { LoggedEvent } from './feed';
import { domainNames, OpeningTitle, SituationCard } from './start/Opening';
import { openingFacts } from './start/openingFacts';
import { StartScreen } from './start/StartScreen';
import { shortName } from './start/scenarioInfo';
import type { Overlays } from './renderer';
import type { Action, Card, Drawer, Mark } from './staff/advice';
import { DailyBrief } from './staff/DailyBrief';
import { BRIEF_CADENCES, type BriefCadence } from './staff/desk';
import { operations } from './staff/operations';
import { OperationsPanel } from './staff/OperationsPanel';
import { roleOf } from './staff/roles';
import { StaffPanel } from './staff/StaffPanel';
import { headlines } from './staff/ticker';
import { WarRoom } from './staff/WarRoom';
import './staff/staff.css';

const SPEEDS = [0, 1, 5, 20] as const;
const OVERLAY_LABELS: Record<keyof Overlays, string> = { air: 'Air control', sea: 'Sea control', infra: 'Infrastructure damage', fallout: 'Fallout', weather: 'Weather', cities: 'Cities', seaZones: 'Sea zones' };
/** Air, sea and weather draw as blocky squares at theatre zoom, so they start off. */
const DEFAULT_OVERLAYS: Overlays = { air: false, sea: false, infra: true, fallout: true, weather: false, cities: true, seaZones: false };
const DRAWERS: { id: Drawer; label: string; key: string }[] = [
  { id: 'forces', label: 'Forces', key: 'F' },
  { id: 'nation', label: 'Nation', key: 'N' },
  { id: 'log', label: 'Log', key: 'L' },
  { id: 'cost', label: 'War cost', key: 'C' },
];
const DRAWER_TITLE: Record<Drawer, string> = { forces: 'Forces', nation: 'Nation', log: 'Event log', cost: 'War cost' };
const FORM_CONTROLS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);
const CADENCE_KEY = 'ww3.briefCadence';
/** Postures whose target can lie far from the unit: picking one frames the map wide (BA-13). */
const RANGED: ReadonlySet<Posture> = new Set(['strike', 'air_superiority', 'patrol', 'blockade', 'air_assault']);

interface Toast { text: string; tone: 'info' | 'error' }
/** Waiting on the engine's word about a nuclear release: the launch, or nothing. */
interface Watch { untilTick: number; seenSeq: number; match(row: LoggedEvent): Toast | null; timeout?: Toast }

function readCadence(): BriefCadence {
  try {
    const v = localStorage.getItem(CADENCE_KEY);
    return BRIEF_CADENCES.includes(v as BriefCadence) ? (v as BriefCadence) : 'matters';
  } catch {
    return 'matters';
  }
}

export function App({ client }: { client: SimClient }) {
  useSyncExternalStore(client.subscribe, client.getVersion);
  const palette = useMemo(() => new Palette((id) => client.nationCards.get(id as NationId)?.blocs ?? []), [client]);
  if (!client.meta || !client.playing || !client.desk) return <StartScreen client={client} palette={palette} />;
  return <Command key={client.sessionId} client={client} palette={palette} playAs={client.playing} />;
}

function Command({ client, palette, playAs }: { client: SimClient; palette: Palette; playAs: NationId }) {
  const places = client.places;
  const desk = client.desk!;
  const routes = useMemo(() => new Routes(client.map), [client]);
  const focusHandle = useRef<((n: NodeId, frame?: 'close' | 'wide', marks?: readonly Mark[]) => void) | null>(null);

  const [selected, setSelected] = useState<FormationId | null>(null);
  const [pending, setPending] = useState<{ posture: Posture; targetClass?: TargetClass; lift?: 'air' | 'sea' } | null>(null);
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  // A new game opens on the cinematic title, then the situation report; a loaded one on the report.
  const [opening, setOpening] = useState<'title' | 'card' | null>(() => (client.state.tick === 0 ? 'title' : 'card'));
  const briefingOpen = opening !== null;
  // The first turn runs under the title, so the opening wars are declared and the staff has read them when the report opens.
  useEffect(() => {
    if (opening === 'title' && client.state.tick === 0) client.step();
  }, []);
  const [endSeen, setEndSeen] = useState<string | null>(null);
  const [nuclearPick, setNuclearPick] = useState(false);
  const [nuclearTarget, setNuclearTarget] = useState<NodeId | null>(null);
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [brief, setBrief] = useState<{ cards: Card[]; resume: number } | null>(null);
  const [cadence, setCadence] = useState<BriefCadence>(readCadence);
  const [layersOpen, setLayersOpen] = useState(false);
  const [overlays, setOverlays] = useState<Overlays>(DEFAULT_OVERLAYS);
  const [delegating, setDelegating] = useState<Partial<Record<CommandDomain, boolean>>>(() => client.openingDelegation);
  const [toast, setToast] = useState<Toast | null>(null);
  const [crisis, setCrisis] = useState<{ c: Crisis; resume: number; chosen: number | null } | null>(null);
  const shownCrises = useRef(new Set<string>());
  const [coach, setCoach] = useState(false);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [lastMoment, setLastMoment] = useState<Moment | null>(null);
  const moments = useRef<Moment[]>([]);
  const capitals = useMemo(() => new Map(client.map.data.nations.flatMap((x, i) => (x.capital ? [[x.capital.cell as NodeId, client.map.nationIds[i]] as const] : []))), [client]);
  const coachOffered = useRef(false);
  const watch = useRef<Watch | null>(null);
  const lastSeq = () => client.feed.newest(new Set(), null, 1)[0]?.seq ?? -1;
  const speed = client.ticksPerSec;

  const d = client.state.focusNation?.id === playAs ? client.state.focusNation : undefined;
  const ai = d?.authority.ai ?? DEFAULT_DELEGATION;
  const heldKey = d?.authority.held.join(',') ?? '';
  const held = useMemo(() => new Set(heldKey ? heldKey.split(',') : []), [heldKey]);
  const commandOf = useCallback((id: FormationId, kind: FormationKind): CommandHolder => (held.has(id) ? 'player' : ai[DOMAIN_OF_KIND[kind]] ? 'delegate' : 'none'), [held, ai]);

  useEffect(() => client.focus(playAs, selected ?? undefined), [client, playAs, selected]);

  const aiKey = COMMAND_DOMAINS.map((k) => +ai[k]).join('');
  useEffect(() => {
    setDelegating((p) => {
      const left = Object.fromEntries(Object.entries(p).filter(([k, v]) => ai[k as CommandDomain] !== v));
      return Object.keys(left).length === Object.keys(p).length ? p : left;
    });
  }, [aiKey]);

  const noticeSeq = client.notice?.seq;
  useEffect(() => {
    if (client.notice) setToast({ text: client.notice.text, tone: client.notice.tone });
  }, [client, noticeSeq]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.tone === 'error' ? 9000 : 3500);
    return () => clearTimeout(id);
  }, [toast]);

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

  const nationIds = client.meta?.nationIds ?? [];
  const briefing = useMemo(() => briefingFor(client.map, client.meta?.scenario.id ?? '', playAs), [client, playAs]);
  const everEnemies = useRef(new Set<NationId>());
  /** The player's formations destroyed so far, as of each game day seen, for the week's front figure. */
  const lostByDay = useRef(new Map<number, number>());
  for (const e of d?.enemies ?? []) everEnemies.current.add(e);
  const objectives = objectivesOf(client.state, nationIds, briefing, playAs, d?.enemies ?? [], everEnemies.current);
  const ending = d ? outcomeOf(client.state, playAs, d.enemies, everEnemies.current, objectives) : null;
  const endKey = ending ? `${ending.kind}|${ending.text}` : null;
  useEffect(() => {
    if (endKey && endKey !== endSeen && client.ticksPerSec) client.setSpeed(0);
  }, [client, endKey, endSeen]);

  const openBrief = useCallback(() => {
    setBrief((b) => b ?? { cards: desk.decisions, resume: client.ticksPerSec });
    desk.briefOpened();
    client.setSpeed(0);
  }, [client, desk]);
  const closeBrief = useCallback(() => {
    setBrief((b) => {
      if (b?.resume) client.setSpeed(b.resume);
      return null;
    });
  }, [client]);

  const crisisContext = (): CrisisContext | null => d ? {
    me: playAs, tick: client.state.tick, dtHours: client.meta?.dtHours ?? 6, d, nations: client.state.nations,
    name: (id) => shortName(id, client.nationCards),
    capital: (id) => {
      const i = client.map.nationIds.indexOf(id);
      const cell = i < 0 ? undefined : client.map.data.nations[i].capital?.cell;
      return cell === undefined ? undefined : (cell as NodeId);
    },
  } : null;

  // A crisis stops the clock and takes the screen; otherwise the brief opens itself when a decision
  // needs the player (or each morning, by the player's setting).
  useEffect(() => {
    if (brief || crisis || coach || briefingOpen || (endKey && endKey !== endSeen) || !client.state.date) return;
    const ctx = crisesOn() ? crisisContext() : null;
    const next = ctx && nextCrisis(desk.cards, shownCrises.current, ctx);
    if (next) {
      shownCrises.current.add(next.key);
      desk.markBriefed(next.key);
      setCrisis({ c: next, resume: client.ticksPerSec, chosen: null });
      client.setSpeed(0);
      if (next.node !== undefined) focusHandle.current?.(next.node, 'wide');
      return;
    }
    if (!coachOffered.current) {
      coachOffered.current = true;
      if (coachDue()) return setCoach(true);
    }
    if (desk.briefDue(new Date(client.state.date), cadence)) openBrief();
  }, [client.state.tick, desk.version, brief, crisis, coach, briefingOpen, cadence]);

  const chooseCrisis = (i: number) => {
    if (!crisis) return;
    const o = crisis.c.options[i];
    if (o.defer) return closeCrisis();
    if (o.action.kind === 'show') {
      setCrisis(null);
      focusHandle.current?.(o.action.node, 'wide', o.action.marks);
      return;
    }
    client.act(crisis.c.card, o.action);
    if (o.action.kind !== 'command') return closeCrisis();
    setCrisis({ ...crisis, chosen: i });
    // The engine answers on the next turn: run it now, so the answer shows while the crisis is still open.
    if (!client.ticksPerSec) client.step();
  };
  const closeCrisis = () => {
    if (crisis?.resume) client.setSpeed(crisis.resume);
    setCrisis(null);
  };

  // Moments of dread and triumph, from each turn's events as the player knows them.
  useEffect(() => {
    if (!d || !client.state.latestEvents.length) return;
    const seen = new Set(moments.current.map((m) => m.key));
    const found = momentsOf(client.state.latestEvents, {
      me: playAs, enemies: new Set(d.enemies), capitals, isSea: (node) => client.map.isSea(node),
      platformClass: (id) => client.meta?.platforms[id]?.class,
      place: (node) => places.name(node).replace(/^(near|off) /, ''), at: (node) => places.at(node),
      name: (id) => client.namer.nation(id),
      formation: (id) => {
        const f = client.state.formations.find((x) => x.entry.id === id);
        return f && { name: f.entry.name, nation: f.entry.nation, kind: f.entry.kind, strength: f.status === 'destroyed' ? 0 : f.strength, node: f.node };
      },
      opening: new Set((client.meta?.scenario.wars ?? []).map(([a, b]) => `${a}>${b}`)),
      capitalOf: (id) => [...capitals].find(([, n]) => n === id)?.[0],
    });
    moments.current.push(...found.filter((m) => !seen.has(m.key)).slice(0, 2));
  }, [client.state.latestEvents]);
  useEffect(() => {
    if (moment || crisis || opening || brief || coach || !moments.current.length) return;
    const next = moments.current.shift()!;
    if (next.tick < client.state.tick - 8) return;
    setMoment(next);
    setLastMoment(next);
    focusHandle.current?.(next.node, 'wide');
  }, [client.state.tick, moment, crisis, opening, brief, coach]);

  const toggleDrawer = useCallback((id: Drawer) => setDrawer((cur) => (cur === id ? null : id)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (brief || opening || crisis || coach || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        if (pending || nuclearPick) { setPending(null); setNuclearPick(false); setNuclearTarget(null); }
        else setDrawer(null);
        return;
      }
      if (FORM_CONTROLS.has((e.target as HTMLElement).tagName)) return;
      const k = e.key.toLowerCase();
      if (e.key === ' ') { e.preventDefault(); client.setSpeed(client.ticksPerSec ? 0 : 1); }
      else if (e.key === '.') client.step();
      else if (k >= '1' && k <= '3') client.setSpeed(SPEEDS[Number(k)]);
      else if (k === 'b') openBrief();
      else {
        const dr = DRAWERS.find((x) => x.key.toLowerCase() === k);
        if (dr) toggleDrawer(dr.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [client, brief, opening, crisis, coach, pending, nuclearPick, openBrief, toggleDrawer]);

  const quit = () => setConfirm({
    title: 'Quit to the start screen?',
    text: 'The war in progress ends here. Save it first from the Game menu if you want to come back to it.',
    yes: 'Quit',
    onYes: () => client.quit(),
  });

  const selectFormation = useCallback((id: FormationId | null) => {
    setSelected(id);
    setPending(null);
    if (id) setDrawer('forces');
  }, []);
  const focusNode = useCallback((n: NodeId) => focusHandle.current?.(n), []);
  const pickFromList = useCallback((id: FormationId, node: NodeId) => {
    selectFormation(id);
    focusHandle.current?.(node, 'wide');
  }, [selectFormation]);

  const date = client.state.date ? new Date(client.state.date) : null;
  const day = date && client.meta ? Math.max(0, Math.floor((date.getTime() - new Date(client.meta.scenario.startDate).getTime()) / 864e5)) : 0;
  const orders = useOrders({
    client, playAs, places, selected, enemies: d?.enemies ?? [],
    dayOf: (n) => `D+${day + n}`,
    select: (id) => { setSelected(id); setPending(null); },
    pickTarget: (posture, targetClass) => {
      setNuclearPick(false);
      setPending({ posture, targetClass });
      if (selectedView && (RANGED.has(posture) || selectedView.entry.kind === 'air_wing')) focusHandle.current?.(selectedView.node, 'wide');
    },
    toast: (text, tone) => setToast({ text, tone }),
  });

  const sendCommand = (c: Command, label: string) => {
    client.command(c);
    setToast({ tone: 'info', text: `${label}. ${client.ticksPerSec ? 'Takes effect next tick.' : 'Takes effect when the clock runs.'}` });
  };

  /** The engine answers next tick (client.answer): accepted, the order takes the formation from the AI delegate; refused, the delegate keeps it. */
  const sendOrder = (formation: FormationId, order: Omit<Order, 'issuedTick'>, label: string) => {
    client.order({ type: 'order', nation: playAs, formation, order }, label);
    setToast({ tone: 'info', text: `${label}. ${client.ticksPerSec ? 'Awaiting acknowledgement next tick.' : 'Acknowledged when the clock runs.'}` });
  };

  /** Asks the engine first: a target it would refuse keeps the picker open and says why. */
  const sendChecked = (formation: FormationId, order: Omit<Order, 'issuedTick'>, label: string, node: NodeId) => {
    void client.options([formation], node).then((r) => {
      const o = r.options.find((x) => x.key === order.posture);
      const no = o && !o.ok.length ? o.refused.find((x) => x.formation === formation) : undefined;
      if (no) {
        setToast({ tone: 'error', text: `${places.name(node)}: ${humanizeReason(no.reason, client.namer)}. Pick another target, or Esc.` });
        return;
      }
      sendOrder(formation, order, label);
      setPending(null);
    });
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
      sendOrder(selected, { posture: 'move', target: node, ...(pending.lift ? { lift: pending.lift } : {}) }, `Deploying ${f!.entry.name} to ${places.to(node)} ${how}`);
      setPending(null);
      return;
    }
    const what = f ? postureLabel(f.entry.kind, pending.posture) : pending.posture.replace(/_/g, ' ');
    sendChecked(selected, { posture: pending.posture, target: node, targetClass: pending.targetClass }, `${what} → ${places.name(node)}`, node);
  };

  const releaseAll = () => {
    if (!held.size) return;
    client.command({ type: 'hold', nation: playAs, formations: [...held] as FormationId[], held: false });
    setToast({ tone: 'info', text: `${held.size} formations handed back to the AI delegate.` });
  };

  const delegate = (commands: Command[]) => {
    const want: Partial<Record<CommandDomain, boolean>> = {};
    for (const c of commands) {
      if (c.type !== 'delegate') continue;
      client.command(c);
      want[c.domain] = c.ai;
    }
    if (!Object.keys(want).length) return;
    setDelegating((p) => ({ ...p, ...want }));
    if (!client.ticksPerSec) setToast({ tone: 'info', text: 'Your staff takes the change when the clock runs.' });
  };

  const act = (card: Card, action: Action) => {
    if (action.kind === 'show') { focusHandle.current?.(action.node, action.marks ? 'wide' : 'close', action.marks); closeBrief(); }
    else if (action.kind === 'unit') { selectFormation(action.formation); focusHandle.current?.(action.node, 'wide'); }
    else if (action.kind === 'open') setDrawer(action.drawer);
    client.act(card, action);
  };

  const selectedView = selected ? client.state.formations.find((f) => f.entry.id === selected) : undefined;
  const targeting = nuclearPick ? 'nuclear' : pending ? 'order' : null;
  const want = { ...ai, ...delegating };
  const focusAt = useMemo(() => (client.meta ? openingFocus(client.map, client.meta.scenario, playAs) : null), [client, playAs]);
  const theatreName = focusAt === null ? '' : `${shortName(client.map.owner[focusAt] as NationId, client.nationCards)} · ${places.name(focusAt).replace(/^near /, '')}`;
  const n = client.state.nations.get(playAs);
  const mineIdx = nationIds.indexOf(playAs);
  const enemiesKey = d?.enemies.join(',') ?? '';
  const enemyIdx = useMemo(() => new Set(enemiesKey ? enemiesKey.split(',').map((e) => nationIds.indexOf(e as NationId)) : []), [enemiesKey, nationIds]);

  const ops = useMemo(() => operations({
    me: playAs, map: client.map, nationIds, control: client.state.control, contest: client.state.contest, formations: client.state.formations,
    planned: client.state.ops, tick: client.state.tick, enemies: d?.enemies ?? [], places, commandOf,
  }), [client.state.tick, client.state.formations, client.state.ops, commandOf, enemiesKey]);
  const ongoing = useMemo(() => new Set(client.meta?.scenario.ongoing ?? []), [client.meta]);
  const news = useMemo(() => headlines(client.feed, client.map, ongoing), [client.feed.version, ongoing]);
  const pinned = lastMoment && lastMoment.tick >= client.state.tick - 8 ? lastMoment : null;
  const front = desk.frontChange(7);
  const lostNow = client.state.formations.filter((f) => f.entry.nation === playAs && f.status === 'destroyed').length;
  if (!lostByDay.current.has(day) || lostByDay.current.get(day)! < lostNow) lostByDay.current.set(day, lostNow);
  const weekAgo = [...lostByDay.current].filter(([d]) => d >= day - 7).sort((a, b) => a[0] - b[0])[0]?.[1] ?? lostNow;
  const atWar = (d?.enemies.length ?? 0) > 0;
  const defcon = desk.nuclearStep === 2 ? 1 : desk.nuclearStep === 1 ? 2 : atWar ? 3 : 5;
  const role = roleOf(want);
  const stats: TopBarStat[] = n ? [
    ...(atWar ? [frontStat(front, lostNow - weekAgo)] : []),
    { label: 'War support', value: `${Math.round(n.warSupport * 100)}%`, tone: n.warSupport < 0.4 ? 'bad' : undefined },
    { label: 'Economy', value: d?.economy ? `${Math.round(d.economy.gdpIndex * 100)}%` : '—', tone: d?.economy && d.economy.gdpIndex < 0.85 ? 'warn' : undefined },
    { label: 'Mobilised', value: `${Math.round(n.mobilization * 100)}%` },
  ] : [];
  const reportsSince = useMemo(() => client.feed.newest(new Set(), playAs, 400).filter((r) => r.event.tick >= client.state.tick - 24 / (client.meta?.dtHours ?? 6)).length, [brief]);

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

  const dock = (
    <div className="ww-dock" role="toolbar" aria-label="Game">
      <button type="button" className="ww-dock-btn" onClick={() => client.step()} disabled={speed !== 0} title="Advance six hours (.)" data-testid="step" aria-label="Step six hours">
        <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true"><path d="M1 1 L8 6 L1 11 Z" fill="currentColor" /><rect x="10" y="1" width="2.4" height="10" fill="currentColor" /></svg>
      </button>
      <i className="ww-dock-sep" aria-hidden="true" />
      {DRAWERS.map((x) => (
        <button key={x.id} type="button" className={`ww-dock-btn ${drawer === x.id ? 'on' : ''}`} aria-pressed={drawer === x.id} onClick={() => toggleDrawer(x.id)} data-testid={`drawer-${x.id}`}>
          {x.label}<span className="ww-kbd">{x.key}</span>
        </button>
      ))}
      <button type="button" className="ww-dock-btn" onClick={openBrief} data-testid="open-brief">Brief<span className="ww-kbd">B</span>{desk.decisions.length > 0 && <i className="ww-dock-count">{desk.decisions.length}</i>}</button>
      <div className="ww-layers">
        <button type="button" className={`ww-dock-btn ${layersOpen ? 'on' : ''}`} aria-expanded={layersOpen} onClick={() => setLayersOpen((o) => !o)} data-testid="layers">Layers</button>
        {layersOpen && (
          <div className="ww-glass ww-popover" role="group" aria-label="Map layers">
            {(Object.keys(OVERLAY_LABELS) as (keyof Overlays)[]).map((k) => (
              <label key={k} className="ww-check"><input type="checkbox" checked={overlays[k]} onChange={(e) => setOverlays((o) => ({ ...o, [k]: e.target.checked }))} /> {OVERLAY_LABELS[k]}</label>
            ))}
          </div>
        )}
      </div>
      <GameMenu client={client} onBriefing={() => setOpening('card')} onQuit={quit} />
    </div>
  );

  return (
    <div className={`ww-shell ${drawer ? 'drawer-open' : ''} ${targeting ? 'targeting' : ''} ${orders.planning ? 'planning' : ''} ${crisis || opening === 'title' ? 'hud-off' : ''}`} data-testid="shell">
      <MapView
        client={client}
        palette={palette}
        places={places}
        playAs={playAs}
        selected={selected}
        targeting={targeting}
        overlays={overlays}
        orders={orders.overlay}
        onSelectFormation={selectFormation}
        onTarget={onTarget}
        onContext={orders.openRadial}
        onPlanClick={orders.planClick}
        focusHandle={focusHandle}
      />
      <TopBar
        nation={{ id: playAs, name: client.namer.nation(playAs) }}
        subtitle={`${role?.name ?? 'Supreme Commander'} · ${client.meta?.scenario.name ?? ''}`}
        date={date}
        day={day}
        speed={speed}
        speeds={SPEEDS}
        onSpeed={(s) => client.setSpeed(s)}
        stats={stats}
        defcon={defcon}
      />
      {dock}

      <div className="ww-hud-left">
        <OperationsPanel
          ops={ops}
          inTransit={desk.inTransit.size}
          onShow={(node) => focusHandle.current?.(node)}
          onOpen={(id) => {
            const op = client.state.ops.find((o) => o.id === id);
            if (!op) return;
            orders.openOperation(op);
            focusHandle.current?.(op.objectives[0] ?? op.axis[0], 'wide');
          }}
          onForces={() => setDrawer('forces')}
        />
        <StaffPanel me={playAs} ai={ai} pending={delegating} formations={client.state.formations} onDelegate={delegate} />
      </div>

      <WarRoom cards={desk.cards} answered={desk.answered} me={playAs} paused={!speed} onAct={act} onDismiss={(k) => { desk.dismiss(k); client.touch(); }} />

      {drawer && (
        <aside className="ww-drawer ww-glass" aria-label={DRAWER_TITLE[drawer]} data-testid={`drawer-panel-${drawer}`}>
          <header className="ww-drawer-head">
            <span className="ww-title">{drawer === 'forces' && selectedView ? (selectedView.contact ? 'Intel contact' : 'Unit') : DRAWER_TITLE[drawer]}</span>
            <button type="button" className="ww-dock-btn" onClick={() => setDrawer(null)} aria-label="Close drawer, Esc">Esc</button>
          </header>
          <div className="ww-drawer-body">
            {drawer === 'nation' && (
              <NationPanel client={client} palette={palette} playAs={playAs} objectives={objectives} onCommand={sendCommand} onNuclear={() => { setPending(null); setNuclearPick(true); }} />
            )}
            {drawer === 'cost' && <OutputsPanel view={client.state.outputs} name={(id) => client.state.nations.get(id)?.name ?? client.namer.nation(id)} />}
            {drawer === 'log' && <EventLog client={client} playAs={playAs} logVersion={client.feed.version} onFocus={focusNode} />}
            {drawer === 'forces' && (selected && selectedView?.contact && client.state.focusContact?.id === selected ? (
              <ContactPanel
                contact={client.state.focusContact}
                nationName={client.state.nations.get(client.state.focusContact.nation)?.name ?? client.state.focusContact.nation}
                palette={palette}
                places={places}
                onFocus={focusNode}
                onClose={() => selectFormation(null)}
              />
            ) : selected && selectedView ? (
              <FormationPanel
                client={client}
                palette={palette}
                places={places}
                routes={routes}
                playAs={playAs}
                command={commandOf(selectedView.entry.id, selectedView.entry.kind)}
                domainLabel={DOMAIN_LABEL[DOMAIN_OF_KIND[selectedView.entry.kind]].what}
                pending={pending?.posture ?? null}
                onPickPosture={(p, targetClass, lift) => {
                  setNuclearPick(false);
                  setPending(p ? { posture: p, targetClass, lift } : null);
                  if (p && (RANGED.has(p) || lift || selectedView.entry.kind === 'air_wing')) focusHandle.current?.(selectedView.node, 'wide');
                }}
                pendingLift={pending?.lift ?? null}
                onImmediate={(p) => { sendOrder(selected, { posture: p }, `${p.replace(/_/g, ' ')} order sent`); setPending(null); }}
                onOrder={sendOrder}
                onHold={(h) => sendCommand({ type: 'hold', nation: playAs, formations: [selected], held: h }, h ? `${selectedView.entry.name} taken under your command` : `${selectedView.entry.name} handed to the AI delegate`)}
                onClose={() => selectFormation(null)}
                onFocus={focusNode}
                inTransitHours={desk.inTransit.get(selected)}
              />
            ) : (
              <FormationList client={client} palette={palette} places={places} playAs={playAs} commandOf={commandOf} onSelect={pickFromList} onReleaseAll={releaseAll} />
            ))}
          </div>
        </aside>
      )}

      <footer className="ww-ticker" aria-label="News" data-testid="ticker">
        {(pinned || (news.length > 0 && news[0].tick >= client.state.tick - 4)) && <span className="ww-chip red">Breaking</span>}
        {pinned && <span className="fresh ww-moment-line" data-testid="ticker-moment">{pinned.headline}</span>}
        {news.map((h, i) => <span key={h.seq} className={i === 0 && !pinned ? 'fresh' : ''}>{(i > 0 || pinned) && <i className="ww-muted"> · </i>}{h.text}</span>)}
        {!news.length && <span className="ww-muted">No news from the wider world.</span>}
      </footer>

      {targeting && (
        <div className={`ww-target-banner ww-glass ${targeting}`} data-testid="target-banner">
          <span>{targeting === 'nuclear' ? 'Select the nuclear aim point' : pending?.lift ? `Select the destination overseas: deploy by ${pending.lift === 'air' ? 'airlift' : 'sealift'}` : `Select the target: ${pending?.posture.replace(/_/g, ' ')}`}</span>
          <button type="button" className="ww-btn small" onClick={() => { setPending(null); setNuclearPick(false); }} data-testid="cancel-target">Cancel <span className="ww-kbd">Esc</span></button>
        </div>
      )}
      {orders.panel}
      {orders.radial}
      {toast && <div className={`ww-toast ww-glass ${toast.tone}`} data-testid="toast" role="status">{toast.text}</div>}
      {client.error && <div className="ww-toast ww-glass error">Simulation error: {client.error}</div>}

      {brief && date && (
        <DailyBrief
          me={playAs}
          date={date}
          day={day}
          cards={brief.cards.filter((c) => desk.answered.some((s) => s.card.key === c.key) || desk.cards.some((o) => o.key === c.key))}
          sent={new Map(desk.answered.map((s) => [s.card.key, s]))}
          days={desk.days}
          world={news}
          reports={reportsSince}
          cadence={cadence}
          map={client.map}
          control={client.state.control}
          controlVersion={client.state.controlVersion}
          mine={mineIdx}
          enemies={enemyIdx}
          place={(node) => places.name(node)}
          onCadence={(c) => {
            setCadence(c);
            try { localStorage.setItem(CADENCE_KEY, c); } catch { /* a private window keeps the default */ }
          }}
          onAct={act}
          onShow={(node) => { closeBrief(); focusNode(node); }}
          onLog={() => { closeBrief(); setDrawer('log'); }}
          onClose={closeBrief}
        />
      )}
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
      {opening === 'title' && date && (
        <OpeningTitle scenario={client.meta?.scenario.name ?? ''} theatre={theatreName} date={date} onDone={() => setOpening('card')} />
      )}
      {opening === 'card' && date && (
        <SituationCard
          me={playAs}
          nation={client.namer.nation(playAs)}
          scenario={client.meta!.scenario}
          date={date}
          day={day}
          briefing={briefing}
          objectives={objectives}
          facts={openingFacts(client.state, playAs, d)}
          name={(id) => shortName(id, client.nationCards)}
          role={roleOf(want)}
          youRun={domainNames(COMMAND_DOMAINS.filter((k) => !want[k]))}
          staffRuns={domainNames(COMMAND_DOMAINS.filter((k) => want[k]))}
          cards={desk.cards}
          onClose={() => setOpening(null)}
        />
      )}
      {ending && endKey !== endSeen && !briefingOpen && !brief && !crisis && (
        <EndDialog outcome={ending} objectives={objectives} onContinue={() => setEndSeen(endKey)} onQuit={() => client.quit()} />
      )}
      {moment && <MomentOverlay moment={moment} onDone={() => setMoment(null)} />}
      {coach && <CoachMarks onDone={() => { markCoachDone(); setCoach(false); }} />}
      {crisis && date && (
        <CrisisScreen
          crisis={crisis.chosen !== null && crisisContext() ? answered(crisis.c, crisisContext()!) : crisis.c}
          me={playAs}
          nation={client.namer.nation(playAs)}
          scenario={client.meta?.scenario.name ?? ''}
          date={date}
          defcon={defcon}
          chosen={crisis.chosen}
          sent={desk.answered.find((x) => x.card.key === crisis.c.key)}
          paused={!speed}
          onChoose={chooseCrisis}
          onClose={closeCrisis}
        />
      )}
      {confirm && <ConfirmDialog c={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

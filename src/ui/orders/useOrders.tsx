/**
 * The orders the player gives from the map: the radial menu on a right-click, and the battle planner
 * with its staff forecast. The engine answers every question asked here (orders/options.ts), and the
 * forecast is war-gamed from the player's intelligence picture, never the truth.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormationId, FormationKind, NationId, NodeId, Operation, Posture, TargetClass } from '../../core/types';
import type { SimClient } from '../client';
import { humanizeReason, namePlaces, type PlaceNamer } from '../events';
import { fixAge } from '../map/contacts';
import { NO_NATION } from '../snapshot';
import { FORECAST_DAYS, FORECAST_RUNS } from './forecaster';
import { NEEDS_TARGET } from './postures';
import type { OrderOption, OptionsResult } from './options';
import { draftOf, freshName, newDraft, planCommand, planKey, planOf, type Planning } from './plan';
import { PlanPanel } from './PlanPanel';
import { optionLabel, Radial } from './Radial';

export interface OrdersHost {
  client: SimClient;
  playAs: NationId;
  places: PlaceNamer;
  selected: FormationId | null;
  enemies: readonly NationId[];
  dayOf(d: number): string;
  select(id: FormationId | null): void;
  /** Hands a targeted order to the map's target picker. */
  pickTarget(posture: Posture, targetClass?: TargetClass): void;
  toast(text: string, tone: 'info' | 'error'): void;
}

interface RadialState {
  x: number;
  y: number;
  node: NodeId;
  /** Opened on the player's own unit with nothing else selected: targeted orders then ask for their target. */
  onUnit: boolean;
  result: OptionsResult | null;
}

/** What the map draws of the orders being given. */
export interface OrdersOverlay {
  plan: { formations: FormationId[]; waypoints: NodeId[]; objective: NodeId | null; axis: NodeId[] | null; drawing: boolean } | null;
  /** The operation the planner has open, drawn bright. */
  focusOp: string | null;
}

const hours = (h: number) => (h < 1 ? 'within the hour' : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`);
const isForm = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');

export function useOrders(h: OrdersHost) {
  const { client, playAs, places } = h;
  const [radial, setRadial] = useState<RadialState | null>(null);
  const [planning, setPlanning] = useState<Planning | null>(null);
  const planningRef = useRef(planning);
  planningRef.current = planning;
  const hostRef = useRef(h);
  hostRef.current = h;

  const view = (id: FormationId) => client.state.formations.find((f) => f.entry.id === id);
  const kindsOf = (ids: readonly FormationId[]) => ids.map((id) => view(id)?.entry.kind).filter((k): k is FormationKind => !!k);
  const placeOf = (n: NodeId) => places.name(n);

  const openRadial = useCallback((node: NodeId, hit: readonly FormationId[], x: number, y: number) => {
    const { selected, select } = hostRef.current;
    const own = hit.filter((id) => client.state.formations.find((f) => f.entry.id === id)?.entry.nation === playAs);
    const onUnit = !selected && own.length > 0;
    const formations = selected ? [selected] : onUnit ? [own[0]] : [];
    if (onUnit) select(own[0]);
    setRadial({ x, y, node, onUnit, result: null });
    void client.options(formations, node).then((result) => setRadial((r) => (r && r.node === node && r.x === x ? { ...r, result: onUnit ? targetLater(result) : result } : r)));
  }, [client, playAs]);

  const startPlan = useCallback((formations: FormationId[], objective: NodeId | null) => {
    setRadial(null);
    setPlanning({ stage: objective === null ? 'drawing' : 'review', draft: newDraft(formations, objective, freshName(client.state.ops)), forecast: { status: 'idle' } });
  }, [client]);

  const openOperation = useCallback((op: Operation) => {
    setRadial(null);
    setPlanning({ stage: 'review', draft: draftOf(op), forecast: { status: 'idle' } });
  }, []);

  const pick = (o: OrderOption) => {
    const r = radial;
    setRadial(null);
    if (!r) return;
    if (o.key === 'plan') return startPlan(o.ok, r.node);
    if (r.onUnit && NEEDS_TARGET.has(o.key)) return h.pickTarget(o.key, o.targetClass);
    const label = `${optionLabel(o, kindsOf(o.ok))}${NEEDS_TARGET.has(o.key) ? ` ${placeOf(r.node)}` : ''}`;
    for (const c of o.commands) if (c.type === 'order') client.order(c, label);
    if (!h.selected && o.ok.length === 1) h.select(o.ok[0]);
    const who = o.ok.length === 1 ? (view(o.ok[0])?.entry.name ?? '1 unit') : `${o.ok.length} units`;
    h.toast(`${label}: ${who}. ${o.delayHours >= 1 ? `The order reaches them in about ${hours(o.delayHours)}.` : 'They have it next turn.'}`, 'info');
  };

  /** A click on the map while planning: a unit joins or leaves the force, a cell routes the arrow or sets the objective. */
  const planClick = useCallback((node: NodeId, hit: readonly FormationId[], shift: boolean) => {
    const p = planningRef.current;
    if (!p) return;
    const own = hit.filter((id) => client.state.formations.find((f) => f.entry.id === id && f.entry.nation === playAs && f.status !== 'destroyed'));
    if (own.length && !shift) {
      const id = own[0];
      const has = p.draft.formations.includes(id);
      const other = has ? undefined : client.state.ops.find((o) => o.id !== p.draft.operation && (o.phase === 'launched' || o.phase === 'stalled') && o.formations.includes(id));
      if (other) {
        hostRef.current.toast(`${view(id)?.entry.name ?? 'That unit'} is already committed to ${other.name}.`, 'error');
        return;
      }
      setPlanning({ ...p, draft: { ...p.draft, formations: has ? p.draft.formations.filter((x) => x !== id) : [...p.draft.formations, id] } });
      return;
    }
    if (shift) {
      setPlanning({ ...p, stage: 'drawing', draft: { ...p.draft, waypoints: [...p.draft.waypoints, node] } });
      return;
    }
    setPlanning({ ...p, stage: 'review', draft: { ...p.draft, objective: node } });
  }, [client, playAs]);

  const close = useCallback(() => setPlanning(null), []);
  const redraw = useCallback(() => setPlanning((p) => p && { ...p, stage: 'drawing', draft: { ...p.draft, waypoints: [], objective: null } }), []);

  const op = planning?.draft.operation ? client.state.ops.find((o) => o.id === planning.draft.operation) : undefined;

  const launch = useCallback(() => {
    const p = planningRef.current;
    if (!p) return;
    const cmd = planCommand(p.draft, playAs, true);
    if (!cmd) return;
    client.command(cmd);
    if (p.draft.operation) client.command({ type: 'launch_operation', nation: playAs, operation: p.draft.operation });
    hostRef.current.toast(`${p.draft.name ?? 'The operation'} goes to the staff. ${client.ticksPerSec ? 'It launches next turn.' : 'It launches when the clock runs.'}`, 'info');
    setPlanning(null);
  }, [client, playAs]);

  const save = () => {
    const cmd = planning && planCommand(planning.draft, playAs, false);
    if (!cmd) return;
    client.command(cmd);
    h.toast('Plan filed as a draft. Open it from Operations to launch it.', 'info');
    setPlanning(null);
  };

  const callOff = () => {
    if (!op) return;
    client.command({ type: 'cancel_operation', nation: playAs, operation: op.id });
    h.toast(`${op.name} is called off. Its units hold where they stand.`, 'info');
    setPlanning(null);
  };

  const plan = planning ? planOf(planning.draft, playAs) : null;
  const key = plan ? planKey(plan) : null;
  const stage = planning?.stage;
  useEffect(() => {
    const p = planningRef.current;
    if (!p || stage !== 'review' || !plan || !key) return;
    const f = p.forecast;
    if (f.status !== 'idle' && f.key === key) return;
    const total = FORECAST_RUNS;
    setPlanning((x) => x && { ...x, forecast: { status: 'running', key, done: 0, total } });
    const same = (x: Planning | null) => !!x && x.forecast.status !== 'idle' && x.forecast.key === key;
    const t = setTimeout(() => {
      client.forecast(plan, FORECAST_DAYS, (done, of) => setPlanning((x) => (same(x) && x!.forecast.status === 'running' ? { ...x!, forecast: { status: 'running', key, done, total: of } } : x)))
        .then((forecast) => setPlanning((x) => (same(x) ? { ...x!, forecast: { status: 'done', key, forecast } } : x)))
        .catch((e: unknown) => setPlanning((x) => (same(x) ? { ...x!, forecast: { status: 'failed', key, reason: e instanceof Error ? e.message : String(e) } } : x)));
    }, 200);
    return () => clearTimeout(t);
  }, [key, stage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isForm(e.target) || radial) return;
      const p = planningRef.current;
      const k = e.key.toLowerCase();
      if (!p) {
        const sel = hostRef.current.selected;
        const f = sel ? client.state.formations.find((x) => x.entry.id === sel) : undefined;
        if (k === 'p' && f && f.entry.nation === playAs) {
          e.stopPropagation();
          startPlan([f.entry.id], null);
        }
        return;
      }
      const running = op && (op.phase === 'launched' || op.phase === 'stalled');
      if (e.key === 'Escape') close();
      else if (e.key === 'Enter' && p.stage === 'review' && !running) launch();
      else if (k === 'r') redraw();
      else if (e.key === 'Backspace' && p.stage === 'drawing') setPlanning({ ...p, draft: { ...p.draft, waypoints: p.draft.waypoints.slice(0, -1) } });
      else return;
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [client, playAs, radial, op, launch, close, redraw, startPlan]);

  const forecastAxis = planning?.forecast.status === 'done' ? planning.forecast.forecast.axis : null;
  const overlay: OrdersOverlay = {
    plan: planning ? { formations: planning.draft.formations, waypoints: planning.draft.waypoints, objective: planning.draft.objective, axis: forecastAxis ?? (op ? op.axis : null), drawing: planning.stage === 'drawing' } : null,
    focusOp: op?.id ?? null,
  };

  const radialView = radial && (() => {
    const owner = client.state.control[radial.node];
    const ids = client.meta?.nationIds ?? [];
    const holder = owner === NO_NATION ? null : (ids[owner] as NationId | undefined);
    const tone = holder === playAs ? 'friend' : holder && h.enemies.includes(holder) ? 'enemy' : 'neutral';
    const contacts = client.state.formations.filter((f) => f.node === radial.node && f.contact);
    const youngest = contacts.reduce((a, f) => Math.min(a, f.contact!.ageHours), Infinity);
    const r = radial.result;
    const kinds = kindsOf(r?.formations.length ? r.formations : r?.options.flatMap((o) => o.ok) ?? []);
    return (
      <Radial
        x={radial.x}
        y={radial.y}
        title={placeOf(radial.node)}
        holder={{ text: holder ? `Held by ${client.namer.nation(holder)}` : 'Unclaimed', tone }}
        estimate={contacts.length ? `${contacts.length} enemy ${contacts.length === 1 ? 'unit' : 'units'} · seen ${fixAge(youngest)} ago` : null}
        options={r?.options ?? null}
        kinds={kinds}
        detail={(o) => detail(o, radial.onUnit, (id) => view(id)?.entry.name ?? id, (r) => humanizeReason(r, client.namer))}
        onPick={pick}
        onClose={() => setRadial(null)}
      />
    );
  })();

  const units = planning ? planning.draft.formations.map(view).filter((f) => !!f) : [];
  const panel = planning && (
    <PlanPanel
      planning={planning}
      op={op && { ...op, progress: { ...op.progress, note: namePlaces(op.progress.note, places) } }}
      units={units}
      from={units[0] ? placeOf(units[0].node) : 'your lines'}
      objective={planning.draft.objective === null ? null : placeOf(planning.draft.objective)}
      via={planning.draft.waypoints.map(placeOf)}
      dayOf={h.dayOf}
      onLaunch={launch}
      onSave={save}
      onRedraw={redraw}
      onCancelOperation={callOff}
      onClose={close}
      onRemove={(id) => setPlanning((p) => p && { ...p, draft: { ...p.draft, formations: p.draft.formations.filter((x) => x !== id) } })}
    />
  );

  return { radial: radialView, panel, planning: planning !== null, overlay, openRadial, planClick, openOperation, startPlan };
}

/** On the player's own unit, a targeted order is not judged against the unit's own cell: it waits for its target. */
function targetLater(r: OptionsResult): OptionsResult {
  return { ...r, options: r.options.map((o) => (o.key !== 'plan' && NEEDS_TARGET.has(o.key) ? { ...o, ok: r.formations, refused: [], commands: [], etaHours: undefined, warn: undefined } : o)) };
}

function detail(o: OrderOption, onUnit: boolean, name: (id: FormationId) => string, words: (reason: string) => string): { lines: string[]; tone: 'ok' | 'warn' | 'refused' } {
  if (!o.ok.length) {
    const first = o.refused[0];
    if (!first) return { lines: ['No unit of yours can do this here.'], tone: 'refused' };
    const more = o.refused.length - 1;
    return { lines: [`${name(first.formation)}: ${words(first.reason)}.`, ...(more > 0 ? [`${more} more ${more === 1 ? 'unit is' : 'units are'} refused too.`] : [])], tone: 'refused' };
  }
  const who = o.ok.length === 1 ? name(o.ok[0]) : `${o.ok.length} units`;
  if (o.key === 'plan') {
    return { lines: [`Plan an offensive here with ${who}.`, 'The staff war-games it from your intelligence before you launch.', ...(o.warn ? [o.warn] : [])], tone: o.warn ? 'warn' : 'ok' };
  }
  if (onUnit && NEEDS_TARGET.has(o.key)) return { lines: [`${who}.`, 'Then click the target on the map.'], tone: 'ok' };
  const lines = [`${who}.`];
  lines.push(o.delayHours >= 1 ? `Order arrives in ${hours(o.delayHours)} down the chain of command.` : 'Order arrives next turn.');
  if (o.etaHours !== undefined) lines.push(`On target about ${hours(o.etaHours)} after that.`);
  const refused = o.refused.length;
  if (refused) lines.push(`${refused} of the selection cannot: ${words(o.refused[0].reason)}.`);
  if (o.warn) lines.push(`Warning: ${o.warn}.`);
  return { lines, tone: o.warn ? 'warn' : 'ok' };
}

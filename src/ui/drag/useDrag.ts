/**
 * The order gesture on the map: press one of your counters, drag, read the pill, let go on the target. Every
 * pointer move aims on the page from the kit the worker built at the press, so the sim never waits on the cursor.
 */
import { useEffect, useRef, useState } from 'react';
import type { FormationId, NodeId } from '../../core/types';
import type { SimClient } from '../client';
import type { PlaceNamer } from '../events';
import { FORECAST_DAYS } from '../orders/forecaster';
import type { MapRenderer } from '../renderer';
import { pillText, type Band } from './estimate';
import { aim, type Aim, type IntentKind } from './gesture';
import type { DragKit } from './kit';

/** Pixels a press travels before it is a drag rather than a click: the same threshold as a pan. */
const DRAG_PX = 4;
/** How long the cursor rests on an attack target before the staff war-games it. */
const DWELL_MS = 400;
/** Turns a kit serves before a fresher one is asked for: one game day. */
const KIT_TICKS = 4;

type DragState =
  | { phase: 'idle' }
  | { phase: 'armed'; press: number; ids: FormationId[]; at: [number, number]; kit: DragKit | null }
  | { phase: 'dragging'; press: number; ids: FormationId[]; kit: DragKit | null; aim: Aim | null; start: [number, number]; cursor: [number, number]; rest: number | null; refreshing: boolean };

/** What the map draws while a drag is on: the arrow from the counter to the cursor, the target cell, the frontage cells, the strike ring. */
export interface DragOverlay {
  /** Screen points: where the press landed and where the cursor is. */
  start: [number, number];
  end: [number, number];
  aim: Aim;
  tone: ReturnType<typeof pillText>['tone'];
  /** The longest strike reach among the units going, drawn around the strongest of them; 0 when not a strike. */
  ringKm: number;
  ringAt: NodeId;
}

export interface DragHost {
  client: SimClient;
  renderer: { current: MapRenderer | null };
  places: PlaceNamer;
  playAs: string | null;
  selected: FormationId | null;
  /** The counters under a screen point, topmost first. */
  hitAt(x: number, y: number): FormationId[];
  invalidate(): void;
}

const VERB: Record<IntentKind, string> = {
  attack: 'Attack', naval_attack: 'Attack', strike: 'Strike', move_hold: 'Move to', hold_front: 'Hold the front at',
  patrol: 'Patrol over', sea_patrol: 'Patrol', blockade: 'Blockade', rebase: 'Rebase to',
};

const keyOf = (a: Aim) => `${a.target.node}|${a.target.contact ?? ''}|${a.going.join(',')}`;
/** Aim timings for the e2e drive: the latest, the worst, and the total over every move. */
const perf = () => ((window as unknown as { __drag?: { lastAimMs: number; maxAimMs: number; totalAimMs: number; aims: number } }).__drag ??= { lastAimMs: 0, maxAimMs: 0, totalAimMs: 0, aims: 0 });

export function useDrag(host: DragHost) {
  const hostRef = useRef(host);
  hostRef.current = host;
  const state = useRef<DragState>({ phase: 'idle' });
  const presses = useRef(0);
  const refined = useRef<{ key: string; band: Band } | null>(null);
  const asked = useRef<string | null>(null);
  const overlay = useRef<DragOverlay | null>(null);
  const [view, setView] = useState<{ aim: Aim | null; x: number; y: number } | null>(null);

  const reset = () => {
    const s = state.current;
    if (s.phase === 'dragging' && s.rest !== null) clearTimeout(s.rest);
    state.current = { phase: 'idle' };
    refined.current = asked.current = null;
    overlay.current = null;
    setView(null);
    hostRef.current.invalidate();
  };

  const requestKit = (press: number, ids: FormationId[]) => {
    void hostRef.current.client.dragKit(ids).then((kit) => {
      const s = state.current;
      if (s.phase === 'idle' || s.press !== press) return;
      s.kit = kit;
      if (s.phase === 'dragging') {
        s.refreshing = false;
        aimAt(s, s.cursor[0], s.cursor[1]);
      }
    });
  };

  const show = (s: Extract<DragState, { phase: 'dragging' }>, x: number, y: number) => {
    const a = s.aim;
    if (!a || !s.kit) overlay.current = null;
    else {
      const going = s.kit.units.filter((u) => a.going.includes(u.id));
      const striker = a.intent === 'strike' ? going.reduce((b, u) => (u.strikeKm > b.strikeKm ? u : b), going[0]) : undefined;
      overlay.current = { start: s.start, end: [x, y], aim: a, tone: pillText(a.pill).tone, ringKm: striker?.strikeKm ?? 0, ringAt: striker?.node ?? s.kit.units[0].node };
    }
    setView({ aim: a, x, y });
    hostRef.current.invalidate();
  };

  const aimAt = (s: Extract<DragState, { phase: 'dragging' }>, x: number, y: number) => {
    const h = hostRef.current, r = h.renderer.current;
    s.cursor = [x, y];
    const node = r?.pick(x, y) ?? null;
    if (!s.kit || node === null || !r) {
      s.aim = null;
      return show(s, x, y);
    }
    const contact = h.hitAt(x, y).find((id) => s.kit!.contacts[id]) ?? null;
    const t0 = performance.now();
    const a = aim(s.kit, { node, contact }, h.client.map, h.client.state.control);
    const ms = performance.now() - t0, p = perf();
    p.lastAimMs = ms;
    p.maxAimMs = Math.max(p.maxAimMs, ms);
    p.totalAimMs += ms;
    p.aims++;
    const key = keyOf(a);
    if (refined.current?.key === key) a.pill.refined = refined.current.band;
    s.aim = a;
    if (s.rest !== null) clearTimeout(s.rest);
    s.rest = a.pill.kind === 'take' && asked.current !== key ? window.setTimeout(() => dwell(s.press, a), DWELL_MS) : null;
    if (h.client.state.tick - s.kit.tick >= KIT_TICKS && !s.refreshing) {
      s.refreshing = true;
      requestKit(s.press, s.ids);
    }
    show(s, x, y);
  };

  /** The cursor rested on an attack: the staff war-games it from the player's beliefs, as the planner did. */
  const dwell = (press: number, a: Aim) => {
    const h = hostRef.current;
    const key = keyOf(a);
    asked.current = key;
    const plan = { nation: h.client.playing!, kind: 'offensive' as const, objectives: [a.target.node], formations: a.going };
    h.client.forecast(plan, FORECAST_DAYS, () => {}).then((f) => {
      const s = state.current;
      if (s.phase !== 'dragging' || s.press !== press || !s.aim || keyOf(s.aim) !== key) return;
      const p = f.pObjectiveByDay[f.pObjectiveByDay.length - 1] ?? 0;
      refined.current = { key, band: { lo: p, mid: p, hi: p } };
      s.aim = { ...s.aim, pill: { ...s.aim.pill, refined: refined.current.band } };
      show(s, s.cursor[0], s.cursor[1]);
    }, () => {});
  };

  /** A press: true when it landed on one of the player's own counters, which then drags instead of panning. */
  const down = (x: number, y: number): boolean => {
    const h = hostRef.current;
    const hit = h.hitAt(x, y);
    if (!hit.length || !h.playAs) return false;
    const own = new Set(h.client.state.formations.filter((f) => f.entry.nation === h.playAs && f.status === 'active').map((f) => f.entry.id));
    const mine = hit.filter((id) => own.has(id));
    if (!mine.length) return false;
    // A unit picked out of its stack drags alone; otherwise the whole counter goes.
    const ids = h.selected && mine.includes(h.selected) ? [h.selected] : mine;
    const press = ++presses.current;
    state.current = { phase: 'armed', press, ids, at: [x, y], kit: null };
    requestKit(press, ids);
    return true;
  };

  /** True while the press is the drag's, so the map neither pans nor hovers. */
  const move = (x: number, y: number): boolean => {
    const s = state.current;
    if (s.phase === 'idle') return false;
    if (s.phase === 'armed') {
      if (Math.hypot(x - s.at[0], y - s.at[1]) <= DRAG_PX) return true;
      const d: DragState = { phase: 'dragging', press: s.press, ids: s.ids, kit: s.kit, aim: null, start: s.at, cursor: [x, y], rest: null, refreshing: false };
      state.current = d;
      aimAt(d, x, y);
      return true;
    }
    aimAt(s, x, y);
    return true;
  };

  /** A release: true when it ended a drag (the orders went, or nothing did); false for a press that never moved, which the map treats as a click. */
  const up = (): boolean => {
    const s = state.current;
    if (s.phase === 'idle') return false;
    if (s.phase === 'armed') {
      state.current = { phase: 'idle' };
      return false;
    }
    const a = s.aim;
    if (a?.intent && a.commands.length) {
      const h = hostRef.current;
      const label = `${VERB[a.intent]} ${h.places.name(a.target.node).replace(/^near /, '')}`;
      for (const c of a.commands) if (c.type === 'order') h.client.order(c, label);
    }
    reset();
    return true;
  };

  const cancel = () => {
    if (state.current.phase !== 'idle') reset();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || state.current.phase === 'idle') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      reset();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return { down, move, up, cancel, view, overlay };
}

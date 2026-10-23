/**
 * The supply gesture: press the supply handle on the map, drag it onto your ground, read what priority there would
 * move, let go to give it. The staff works out each cell on the worker; the pill waits for the cell under the cursor.
 */
import { useEffect, useRef, useState } from 'react';
import type { Command, NationId, NodeId } from '../../core/types';
import type { PriorityEffect } from '../../systems/logistics';
import type { SimClient } from '../client';
import type { PlaceNamer } from '../events';
import type { MapRenderer } from '../renderer';
import type { PillWords } from './Pill';
import { supplyWords } from './supply';

const DRAG_PX = 4;

const placeOf = (places: PlaceNamer, n: NodeId) => places.name(n).replace(/^near /, '');

export interface SupplyDragHost {
  client: SimClient;
  renderer: { current: MapRenderer | null };
  canvas: { current: HTMLCanvasElement | null };
  places: PlaceNamer;
  playAs: string | null;
  onCommand(c: Command, label: string): void;
  invalidate(): void;
}

type DragState =
  | { phase: 'idle' }
  | { phase: 'armed'; at: [number, number] }
  | { phase: 'dragging'; node: NodeId | null; effect: PriorityEffect | null | undefined };

export function useSupplyDrag(host: SupplyDragHost) {
  const hostRef = useRef(host);
  hostRef.current = host;
  const state = useRef<DragState>({ phase: 'idle' });
  const aim = useRef<NodeId | null>(null);
  const [view, setView] = useState<{ x: number; y: number; words: PillWords } | null>(null);

  useEffect(() => {
    const reset = () => {
      state.current = { phase: 'idle' };
      aim.current = null;
      setView(null);
      hostRef.current.invalidate();
    };
    const show = (x: number, y: number) => {
      const s = state.current;
      if (s.phase !== 'dragging') return;
      const h = hostRef.current;
      const words = s.node === null ? { kicker: 'Supply priority', primary: 'Drop on your front', tone: 'wait' as const } : supplyWords(s.effect, placeOf(h.places, s.node));
      setView({ x, y, words });
    };
    const move = (e: PointerEvent) => {
      const s = state.current, h = hostRef.current, c = h.canvas.current, r = h.renderer.current;
      if (s.phase === 'idle' || !c || !r) return;
      if (s.phase === 'armed' && Math.hypot(e.clientX - s.at[0], e.clientY - s.at[1]) <= DRAG_PX) return;
      const rect = c.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top;
      const picked = r.pick(x, y);
      const node = picked !== null && picked < h.client.map.landCount ? picked : null;
      if (s.phase === 'armed' || node !== s.node) {
        state.current = { phase: 'dragging', node, effect: undefined };
        aim.current = node;
        h.invalidate();
        if (node !== null)
          void h.client.supplyEffect(node).then((effect) => {
            const d = state.current;
            if (d.phase !== 'dragging' || d.node !== node) return;
            d.effect = effect;
            show(x, y);
          });
      }
      show(x, y);
    };
    const up = () => {
      const s = state.current, h = hostRef.current;
      if (s.phase === 'dragging' && s.node !== null && s.effect && h.playAs)
        h.onCommand({ type: 'supply_priority', nation: h.playAs as NationId, node: s.node }, `Supply priority to ${placeOf(h.places, s.node)}`);
      if (s.phase !== 'idle') reset();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || state.current.phase === 'idle') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      reset();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', reset);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', reset);
      window.removeEventListener('keydown', key, true);
    };
  }, []);

  const grip = (e: React.PointerEvent) => {
    if (e.button !== 0 || !hostRef.current.playAs) return;
    e.preventDefault();
    e.stopPropagation();
    state.current = { phase: 'armed', at: [e.clientX, e.clientY] };
  };

  const clear = () => {
    const h = hostRef.current;
    if (h.playAs) h.onCommand({ type: 'supply_priority', nation: h.playAs as NationId, node: null }, 'Supply priority cleared');
  };

  return { grip, clear, view, aim };
}

/** The supply handle over the map: what has priority now, a grip to drag it, and a way to clear it. */
export function SupplyHandle({ priority, place, grip, clear }: { priority: NodeId | null; place: string | null; grip(e: React.PointerEvent): void; clear(): void }) {
  return (
    <div className="map-supply ww-glass" data-testid="supply-handle">
      <span className="map-supply-grip" onPointerDown={grip} data-testid="supply-grip" title="Drag onto your front to give it first call on supplies">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="1.5" y="4" width="11" height="8.5" fill="none" stroke="currentColor" strokeWidth="1.2" /><path d="M1.5 4 L4 1.5 H10 L12.5 4 M7 4 V12.5" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
        <span className="ww-label">Supply</span>
        <span className="ww-mono" data-testid="supply-priority">{priority === null ? 'no priority' : `priority ${place}`}</span>
      </span>
      {priority !== null && <button type="button" className="map-supply-clear" onClick={clear} aria-label="Clear supply priority" title="Clear supply priority" data-testid="supply-clear">×</button>}
    </div>
  );
}

/**
 * The diplomacy gesture in the top bar: press your own flag, drag it onto another nation's flag, read the pill, let go.
 * The aim is the pure aimFlag over the latest snapshot, so the pill follows the war as the clock runs.
 */
import { useEffect, useRef, useState } from 'react';
import type { Command, NationId } from '../../core/types';
import type { NationDetail } from '../snapshot';
import { aimFlag, type FlagAim, type FlagContext, type FlagTarget } from './flags';

/** Pixels a press travels before it is a drag: the map's threshold. */
const DRAG_PX = 4;

type DragState =
  | { phase: 'idle' }
  | { phase: 'armed'; at: [number, number] }
  | { phase: 'dragging'; cursor: [number, number]; over: FlagTarget | null };

export interface FlagDragHost {
  detail: NationDetail | undefined;
  row: FlagTarget[];
  ctx: FlagContext;
  onCommand(c: Command, label: string): void;
}

/** The flag under a screen point, by its `data-flag` attribute. */
function flagAt(x: number, y: number, row: FlagTarget[]): FlagTarget | null {
  const el = document.elementFromPoint(x, y)?.closest('[data-flag]');
  const id = el?.getAttribute('data-flag') as NationId | null | undefined;
  return (id && row.find((t) => t.nation === id)) || null;
}

export function useFlagDrag(host: FlagDragHost) {
  const hostRef = useRef(host);
  hostRef.current = host;
  const state = useRef<DragState>({ phase: 'idle' });
  const [view, setView] = useState<{ x: number; y: number; over: FlagTarget | null } | null>(null);

  const aimOf = (over: FlagTarget | null): FlagAim | null => {
    const h = hostRef.current;
    return over && h.detail ? aimFlag(h.detail, over, h.ctx) : null;
  };

  useEffect(() => {
    const reset = () => {
      state.current = { phase: 'idle' };
      setView(null);
    };
    const move = (e: PointerEvent) => {
      const s = state.current;
      if (s.phase === 'idle') return;
      if (s.phase === 'armed' && Math.hypot(e.clientX - s.at[0], e.clientY - s.at[1]) <= DRAG_PX) return;
      const over = flagAt(e.clientX, e.clientY, hostRef.current.row);
      state.current = { phase: 'dragging', cursor: [e.clientX, e.clientY], over };
      setView({ x: e.clientX, y: e.clientY, over });
    };
    const up = () => {
      const s = state.current;
      if (s.phase === 'dragging') {
        const send = aimOf(s.over)?.send;
        if (send) hostRef.current.onCommand(send.command, send.label);
      }
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

  const grip = {
    onPointerDown(e: React.PointerEvent) {
      if (e.button !== 0 || !hostRef.current.detail) return;
      e.preventDefault();
      e.stopPropagation();
      state.current = { phase: 'armed', at: [e.clientX, e.clientY] };
    },
  };

  return { grip, dragging: view !== null, view: view && { ...view, aim: aimOf(view.over) } };
}

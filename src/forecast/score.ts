import type { GameMap } from '../core/map';
import type { NationId } from '../core/types';

/** Mean squared error of probability forecasts against what happened: 0 is perfect, lower is better. */
export function brier(p: readonly number[], happened: readonly boolean[]): number {
  if (p.length !== happened.length || !p.length) throw new Error(`brier needs matching, non-empty forecasts and outcomes (${p.length} vs ${happened.length})`);
  let s = 0;
  for (let i = 0; i < p.length; i++) s += (p[i] - (happened[i] ? 1 : 0)) ** 2;
  return s / p.length;
}

/**
 * Mean natural-log likelihood of what happened: 0 is perfect, higher is better. Forecasts are held
 * inside [eps, 1 - eps] so one confident miss costs a finite amount.
 */
export function logScore(p: readonly number[], happened: readonly boolean[], eps = 1e-3): number {
  if (p.length !== happened.length || !p.length) throw new Error(`logScore needs matching, non-empty forecasts and outcomes (${p.length} vs ${happened.length})`);
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const q = Math.min(1 - eps, Math.max(eps, p[i]));
    s += Math.log(happened[i] ? q : 1 - q);
  }
  return s / p.length;
}

/**
 * "The front stays where it is" (issue #2 section 2): the chance each cell changes hands, `eps` for
 * every cell. A mechanism that cannot beat this baseline is a candidate to simplify.
 */
export function persistenceBaseline(cells: readonly number[], eps = 0.02): number[] {
  if (!(eps > 0 && eps < 0.5)) throw new Error(`persistence eps must be in (0, 0.5), got ${eps}`);
  return cells.map(() => eps);
}

/** Land cells next to a land cell another nation holds: where a front can move. */
export function frontCells(map: GameMap, control: readonly NationId[]): number[] {
  const out: number[] = [];
  for (let n = 0; n < map.landCount; n++) {
    if (!control[n]) continue;
    for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
      const m = map.adj[k];
      if (m < map.landCount && control[m] && control[m] !== control[n]) {
        out.push(n);
        break;
      }
    }
  }
  return out;
}

export interface FrontScore {
  questions: number;
  model: { brier: number; log: number };
  baseline: { brier: number; log: number };
  /** 1 - model Brier / baseline Brier: above 0 the model beats "the front stays put". */
  skill: number;
}

/**
 * Scores an ensemble on "does this cell change hands by the horizon?" for each of `cells`. The model's
 * probability is the share of runs in which the cell changed hands; the baseline is persistence.
 */
export function scoreFront(opts: {
  cells: readonly number[];
  /** Cells that did change hands between the start and the horizon. */
  observedChanged: Iterable<number>;
  runs: readonly { changedCells: readonly number[] }[];
  eps?: number;
}): FrontScore {
  if (!opts.runs.length) throw new Error('scoreFront needs at least one run');
  const observed = new Set(opts.observedChanged);
  const changes = new Map<number, number>();
  for (const r of opts.runs) for (const c of r.changedCells) changes.set(c, (changes.get(c) ?? 0) + 1);
  const happened = opts.cells.map((c) => observed.has(c));
  const model = opts.cells.map((c) => (changes.get(c) ?? 0) / opts.runs.length);
  const base = persistenceBaseline(opts.cells, opts.eps);
  const m = { brier: brier(model, happened), log: logScore(model, happened) };
  const b = { brier: brier(base, happened), log: logScore(base, happened) };
  return { questions: opts.cells.length, model: m, baseline: b, skill: 1 - m.brier / b.brier };
}

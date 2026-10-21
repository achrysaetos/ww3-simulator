import { paramDef, type ParamTag } from '../core/params';
import { metric } from './metrics';
import type { EnsembleInput, RunResult } from './run';

export interface MetricSummary {
  label: string;
  unit: string;
  threshold?: number;
  p10: number;
  p50: number;
  p90: number;
  min: number;
  max: number;
  mean: number;
  /** Goal metrics: share of runs above the threshold. */
  pMet?: number;
}

/** How one swept param moves one metric across the runs. */
export interface Flip {
  param: string;
  tag: ParamTag;
  metric: string;
  /** Change in the metric from the low to the high end of the param's range, in the metric's unit, from a least-squares line. */
  effect: number;
  /** Correlation between the param and the metric over the runs used. */
  r: number;
  /** |r| above 2/sqrt(runs): unlikely (about 5%) to be seed noise alone. */
  significant: boolean;
  /** Goal metrics: the param value at which the fitted line crosses the threshold, when that is inside the range. */
  tipping?: number;
  /** A significant line crosses the goal threshold inside the range and the runs saw both outcomes: the assumption decides who meets the goal, not only what it costs. */
  flipsOutcome: boolean;
}

export interface EnsembleReport {
  /** forecast: every swept param drawn together (ranges, probabilities). stress: one param at a time (what must be true for an outcome). */
  mode: 'forecast' | 'stress';
  world: string;
  ticks: number;
  runs: number;
  swept: { id: string; tag: ParamTag }[];
  metrics: Record<string, MetricSummary>;
  /** Every swept param against every metric, outcome flips first, then by |r|. */
  flips: Flip[];
  /** The three params that matter most, one entry each, outcome flips first. */
  top3: Flip[];
}

function quantile(sorted: readonly number[], q: number): number {
  if (!sorted.length) return NaN;
  const at = (sorted.length - 1) * q, lo = Math.floor(at), hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

function fit(xs: readonly number[], ys: readonly number[]): { slope: number; intercept: number; r: number } {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  return { slope, intercept: my - slope * mx, r: sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0 };
}

const rank = (f: Flip) => [f.flipsOutcome ? 1 : 0, f.significant ? 1 : 0, Math.abs(f.r)];
const byRank = (a: Flip, b: Flip) => {
  const x = rank(a), y = rank(b);
  return y[0] - x[0] || y[1] - x[1] || y[2] - x[2];
};

export function summarize(input: EnsembleInput, results: readonly RunResult[]): EnsembleReport {
  const metrics: Record<string, MetricSummary> = {};
  for (const id of input.metrics) {
    const m = metric(id);
    const values = results.map((r) => r.values[id]).sort((a, b) => a - b);
    metrics[id] = {
      label: m.label,
      unit: m.unit,
      threshold: m.threshold,
      p10: quantile(values, 0.1),
      p50: quantile(values, 0.5),
      p90: quantile(values, 0.9),
      min: values[0],
      max: values[values.length - 1],
      mean: values.reduce((a, b) => a + b, 0) / values.length,
      pMet: m.threshold === undefined ? undefined : values.filter((v) => v > m.threshold!).length / values.length,
    };
  }

  const swept = [...new Set(results.flatMap((r) => Object.keys(r.spec.params ?? {})))].sort();
  const stress = results.every((r) => Object.keys(r.spec.params ?? {}).length <= 1);
  const flips: Flip[] = [];
  for (const id of swept) {
    const def = paramDef(id);
    if (!def) continue;
    const value = (r: RunResult) => r.spec.params?.[id] ?? def.value;
    // A one-at-a-time sweep reads each param off its own runs and the baseline; a joint draw reads every run.
    const own = results.filter((r) => Object.keys(r.spec.params ?? {}).every((k) => k === id));
    const used = new Set(own.map(value)).size >= 2 ? own : results;
    const xs = used.map(value);
    const [lo, hi] = def.range;
    for (const mid of input.metrics) {
      const m = metric(mid);
      const ys = used.map((r) => r.values[mid]);
      const { slope, intercept, r } = fit(xs, ys);
      const significant = Math.abs(r) > 2 / Math.sqrt(used.length);
      const cross = m.threshold !== undefined && slope !== 0 ? (m.threshold - intercept) / slope : undefined;
      const tipping = cross !== undefined && cross >= lo && cross <= hi ? cross : undefined;
      const bothOutcomes = m.threshold !== undefined && ys.some((y) => y > m.threshold!) && ys.some((y) => y <= m.threshold!);
      flips.push({ param: id, tag: def.tag, metric: mid, effect: slope * (hi - lo), r, significant, tipping, flipsOutcome: significant && tipping !== undefined && bothOutcomes });
    }
  }
  flips.sort(byRank);
  const top3: Flip[] = [];
  for (const f of flips) if (top3.length < 3 && !top3.some((t) => t.param === f.param)) top3.push(f);

  return {
    mode: stress ? 'stress' : 'forecast',
    world: typeof input.world === 'string' ? input.world : `fork at tick ${input.world.tick}`,
    ticks: input.ticks,
    runs: results.length,
    swept: swept.flatMap((id) => {
      const d = paramDef(id);
      return d ? [{ id, tag: d.tag }] : [];
    }),
    metrics,
    flips,
    top3,
  };
}

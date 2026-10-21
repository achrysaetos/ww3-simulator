import { paramDef, paramRegistry, type ParamDef, type ParamTag } from '../core/params';
import { Rng } from '../core/rng';
// The systems define their params as they load; sampling must see all of them.
import '../systems';
import type { RunSpec } from './run';

/** Tags whose ranges are real uncertainty, swept by `sweep: 'tagged'`. Observed and scenario params stay at their values. */
const UNCERTAIN: ReadonlySet<ParamTag> = new Set(['estimated', 'judgment', 'contested']);

export interface SampleOptions {
  /** Seeds, cycled across runs (lhs) or repeated for every level (oat). */
  seeds: readonly number[];
  sweep: readonly string[] | 'tagged';
  /**
   * lhs: a Latin hypercube over every swept param at once, for ranges and probabilities (forecast mode).
   * oat: one param at a time across its range with the rest at their defaults, for tipping points (stress-test mode).
   */
  method: 'lhs' | 'oat';
  /** Seeds the hypercube's own draws. */
  sampleSeed?: number;
}

/** The params a sweep covers, in id order so the draws do not depend on module load order. */
export function sweptParams(sweep: SampleOptions['sweep']): ParamDef[] {
  if (sweep === 'tagged') return paramRegistry().filter((d) => UNCERTAIN.has(d.tag)).sort((a, b) => (a.id < b.id ? -1 : 1));
  return [...new Set(sweep)].sort().map((id) => paramDef(id) ?? fail(`unknown param ${id}`));
}

function fail(message: string): never {
  throw new Error(message);
}

/**
 * Run specs for an ensemble. lhs gives `n` runs. oat gives, per seed, one run at the defaults plus
 * `n` evenly spaced levels (ends included) of each swept param, so `n` must be at least 2.
 */
export function sampleRuns(n: number, opts: SampleOptions): RunSpec[] {
  if (!opts.seeds.length) throw new Error('sampleRuns needs at least one seed');
  const params = sweptParams(opts.sweep);
  if (opts.method === 'oat') {
    if (n < 2) throw new Error('an oat sweep needs at least 2 levels per param');
    const out: RunSpec[] = [];
    for (const seed of opts.seeds) {
      out.push({ seed });
      for (const d of params)
        for (let i = 0; i < n; i++) out.push({ seed, params: { [d.id]: d.range[0] + ((d.range[1] - d.range[0]) * i) / (n - 1) } });
    }
    return out;
  }
  const rng = new Rng(opts.sampleSeed ?? 1);
  const strata = params.map(() => shuffle(rng, n));
  return Array.from({ length: n }, (_, i) => ({
    seed: opts.seeds[i % opts.seeds.length],
    params: Object.fromEntries(params.map((d, j) => [d.id, d.range[0] + ((d.range[1] - d.range[0]) * (strata[j][i] + rng.next())) / n])),
  }));
}

function shuffle(rng: Rng, n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = rng.int(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

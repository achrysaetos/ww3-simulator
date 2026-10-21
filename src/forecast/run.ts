import { Engine } from '../core/engine';
import { overrideProblem, withParams } from '../core/params';
import type { Command, World } from '../core/types';
import { loadCatalog } from '../data/catalog';
import { loadMap } from '../data/load';
import { createSession } from '../scenarios';
import { SYSTEMS } from '../systems';
import { eventTally, metric, snapshotFront, type RunTrace } from './metrics';

/** One draw: a seed and the params it overrides (the rest keep their defaults). */
export interface RunSpec {
  seed: number;
  params?: Record<string, number>;
}

export interface EnsembleInput {
  /**
   * A scenario id, or a World to fork mid-game (plain JSON, so it can go to a worker; each run steps
   * its own copy, and its future randomness is drawn fresh from the run's seed).
   */
  world: string | World;
  /** Commands queued before the first tick: the plan being tested. */
  plan?: Command[];
  ticks: number;
  runs: RunSpec[];
  /** Metric specs (see `metric`). */
  metrics: string[];
}

export interface RunResult {
  spec: RunSpec;
  values: Record<string, number>;
  /** Land cells whose controller at the end differs from the start, ascending. */
  changedCells: number[];
}

let forkEngine: Engine | undefined;

function start(input: EnsembleInput, spec: RunSpec): { engine: Engine; world: World } {
  const problem = spec.params && overrideProblem(spec.params);
  if (problem) throw new Error(problem);
  if (typeof input.world === 'string') {
    const id = input.world;
    const s = withParams(spec.params, () => createSession(id, spec.seed));
    if (spec.params && Object.keys(spec.params).length) s.world.params = { ...spec.params };
    return s;
  }
  const world = structuredClone(input.world);
  world.seed = spec.seed;
  world.rngState = spec.seed;
  const params = { ...world.params, ...spec.params };
  if (Object.keys(params).length) world.params = params;
  return { engine: (forkEngine ??= new Engine(loadMap(), loadCatalog(), SYSTEMS)), world };
}

/** Steps one draw and measures it. Pure in its inputs: the same input and spec give the same result in any thread. */
export function runOne(input: EnsembleInput, spec: RunSpec): RunResult {
  const metrics = input.metrics.map(metric);
  const { engine, world } = start(input, spec);
  const { map } = engine;
  world.pending.push(...structuredClone(input.plan ?? []));
  const front = snapshotFront(world);
  const tally = eventTally(map);
  for (let i = 0; i < input.ticks; i++) tally.add(engine.step(world));
  const trace: RunTrace = { map, start: front, end: world, casualties: tally.casualties, days: (input.ticks * world.dtHours) / 24 };
  const changedCells: number[] = [];
  for (let n = 0; n < map.landCount; n++) if (front.control[n] !== world.control[n]) changedCells.push(n);
  return { spec, values: Object.fromEntries(metrics.map((m) => [m.id, m.measure(trace)])), changedCells };
}

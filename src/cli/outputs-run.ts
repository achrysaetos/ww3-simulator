import { overrideProblem, withParams } from '../core/params';
import type { NationId } from '../core/types';
import type { EnsembleInput, RunResult, RunSpec } from '../forecast';
import { eventTally, metric, snapshotFront, type RunTrace } from '../forecast/metrics';
import { outputRows, OutputsRecorder, type OutputRow } from '../outputs';
import { createSession } from '../scenarios';

export interface OutputsRun {
  result: RunResult;
  rows: OutputRow[];
}

/**
 * forecast's runOne for a scenario id, sampling Outputs on the way so one pass gives both the
 * ensemble metrics and the war-cost rows for `nations`. Pure in its inputs, as runOne is.
 */
export function runWithOutputs(input: EnsembleInput & { world: string }, spec: RunSpec, nations: readonly NationId[]): OutputsRun {
  const problem = spec.params && overrideProblem(spec.params);
  if (problem) throw new Error(problem);
  const metrics = input.metrics.map(metric);
  const { engine, world, map } = withParams(spec.params, () => createSession(input.world, spec.seed));
  if (spec.params && Object.keys(spec.params).length) world.params = { ...spec.params };
  world.pending.push(...structuredClone(input.plan ?? []));
  const front = snapshotFront(world);
  const tally = eventTally(map);
  const recorder = new OutputsRecorder(engine.catalog);
  recorder.observe(world);
  for (let i = 0; i < input.ticks; i++) {
    tally.add(engine.step(world));
    recorder.observe(world);
  }
  const trace: RunTrace = { map, start: front, end: world, casualties: tally.casualties, days: (input.ticks * world.dtHours) / 24 };
  const changedCells: number[] = [];
  for (let n = 0; n < map.landCount; n++) if (front.control[n] !== world.control[n]) changedCells.push(n);
  return {
    result: { spec, values: Object.fromEntries(metrics.map((m) => [m.id, m.measure(trace)])), changedCells },
    rows: outputRows(recorder.outputs(world, map), nations),
  };
}

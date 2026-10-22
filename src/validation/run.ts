import { overrideProblem, withParams } from '../core/params';
import { snapshotFront } from '../forecast/metrics';
import type { RunSpec } from '../forecast/run';
import { measureRun } from '../metrics';
import { caseById } from './cases';

export interface CaseResult {
  spec: RunSpec;
  /** Each question's value in this run, by question id. */
  values: Record<string, number>;
}

/** Steps one draw of a case and answers its questions. Pure in its inputs, so a worker thread gives the same result. */
export function runCase(caseId: string, spec: RunSpec): CaseResult {
  const c = caseById(caseId);
  const problem = spec.params && overrideProblem(spec.params);
  if (problem) throw new Error(problem);
  const { engine, world, map } = withParams(spec.params, () => c.setup(spec.seed));
  if (spec.params && Object.keys(spec.params).length) world.params = { ...world.params, ...spec.params };
  const start = snapshotFront(world);
  const metrics = measureRun(engine, world, map, c.days);
  const run = { map, start, end: world, metrics, days: c.days };
  return { spec, values: Object.fromEntries(c.questions.map((q) => [q.id, q.measure(run)])) };
}

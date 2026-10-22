import { brier, logScore } from '../forecast/score';
import type { CaseResult } from './run';
import type { Provenance, Question, ValidationCase } from './types';

export interface QuestionScore {
  caseId: string;
  question: string;
  label: string;
  unit: string;
  provenance: Provenance;
  observed: { lo: number; hi: number };
  combatantOnly: boolean;
  runs: number;
  p10: number;
  p50: number;
  p90: number;
  /** The model's chance that the outcome lands in the observed range: runs in range, smoothed for a finite ensemble. */
  pModel: number;
  pBaseline: number;
  baselineValue: number;
  baselineLabel: string;
  model: { brier: number; log: number };
  baseline: { brier: number; log: number };
  /** Lower Brier than the baseline. */
  beats: boolean;
}

export function quantile(sorted: readonly number[], q: number): number {
  if (!sorted.length) return NaN;
  const at = (sorted.length - 1) * q, lo = Math.floor(at), hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

const inRange = (v: number, o: { lo: number; hi: number }) => v >= o.lo && v <= o.hi;

/**
 * Scores one question as "does the outcome land in the observed range?", which happened by
 * definition. The model's probability is the share of runs in range with half a run added on each
 * side, (k + 0.5) / (n + 1), so 8 runs say at most 94%: a finite ensemble never claims certainty.
 * The baseline is scored as an ensemble of the same size that always gives its point forecast, so
 * the model beats it only by landing more runs in range, never through the smoothing alone.
 */
export function scoreQuestion(c: ValidationCase, q: Question, results: readonly CaseResult[]): QuestionScore {
  // A run where the question has no answer (a share of nothing fired) counts as a miss and stays out of the quantiles.
  const values = results.map((r) => r.values[q.id]).filter((v) => !Number.isNaN(v)).sort((a, b) => a - b);
  const smoothed = (k: number) => (k + 0.5) / (results.length + 1);
  const pModel = smoothed(values.filter((v) => inRange(v, q.observed)).length);
  const pBaseline = smoothed(inRange(q.baseline.value, q.observed) ? results.length : 0);
  const model = { brier: brier([pModel], [true]), log: logScore([pModel], [true]) };
  const baseline = { brier: brier([pBaseline], [true]), log: logScore([pBaseline], [true]) };
  return {
    caseId: c.id,
    question: q.id,
    label: q.label,
    unit: q.unit,
    provenance: q.provenance ?? c.provenance,
    observed: { lo: q.observed.lo, hi: q.observed.hi },
    combatantOnly: q.observed.sources.every((s) => s.tag === 'combatant'),
    runs: results.length,
    p10: quantile(values, 0.1),
    p50: quantile(values, 0.5),
    p90: quantile(values, 0.9),
    pModel,
    pBaseline,
    baselineValue: q.baseline.value,
    baselineLabel: q.baseline.label,
    model,
    baseline,
    beats: model.brier < baseline.brier,
  };
}

export const scoreCase = (c: ValidationCase, results: readonly CaseResult[]): QuestionScore[] => c.questions.map((q) => scoreQuestion(c, q, results));

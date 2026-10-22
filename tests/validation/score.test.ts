import { describe, expect, it } from 'vitest';
import type { CaseResult } from '../../src/validation/run';
import { scoreQuestion } from '../../src/validation/score';
import type { Question, ValidationCase } from '../../src/validation/types';

const question = (baseline: number, lo = 10, hi = 20): Question => ({
  id: 'q',
  label: 'q',
  unit: 'u',
  observed: { lo, hi, sources: [{ cite: 'test', tag: 'independent' }] },
  baseline: { value: baseline, label: 'test' },
  measure: () => 0,
});
const kase = (q: Question): ValidationCase => ({
  id: 'c', name: 'c', period: 'p', provenance: 'held-out', contamination: '', representation: '', days: 1, questions: [q],
  setup: () => { throw new Error('not run'); },
});
const runs = (...values: number[]): CaseResult[] => values.map((v, i) => ({ spec: { seed: i }, values: { q: v } }));

describe('scoreQuestion', () => {
  it('a model that lands more runs in the observed range than the baseline beats it', () => {
    const q = question(0);
    const s = scoreQuestion(kase(q), q, runs(12, 15, 30, 5));
    expect(s.pModel).toBeCloseTo(2.5 / 5);
    expect(s.pBaseline).toBeCloseTo(0.5 / 5);
    expect(s.model.brier).toBeCloseTo(0.25);
    expect(s.baseline.brier).toBeCloseTo(0.81);
    expect(s.beats).toBe(true);
  });

  it('a model that never lands in range does not beat a baseline that misses too', () => {
    const q = question(0);
    const s = scoreQuestion(kase(q), q, runs(30, 40, 50));
    expect(s.model.brier).toBe(s.baseline.brier);
    expect(s.beats).toBe(false);
  });

  it('when persistence was right, a model always in range only ties it', () => {
    const q = question(0, 0, 0);
    expect(scoreQuestion(kase(q), q, runs(0, 0, 0)).beats).toBe(false);
    expect(scoreQuestion(kase(q), q, runs(0, 0, 1)).beats).toBe(false);
  });

  it('a run with no answer counts as a miss and stays out of the quantiles', () => {
    const q = question(0);
    const s = scoreQuestion(kase(q), q, runs(NaN, 15, 16));
    expect(s.runs).toBe(3);
    expect(s.pModel).toBeCloseTo(2.5 / 4);
    expect(s.p10).toBeCloseTo(15.1);
    expect(s.p90).toBeCloseTo(15.9);
  });

  it('flags a range only combatants vouch for and takes a question-level provenance', () => {
    const q: Question = { ...question(0), provenance: 'tuned-on', observed: { lo: 1, hi: 2, sources: [{ cite: 'a', tag: 'combatant' }] } };
    const s = scoreQuestion(kase(q), q, runs(1));
    expect(s.combatantOnly).toBe(true);
    expect(s.provenance).toBe('tuned-on');
  });
});

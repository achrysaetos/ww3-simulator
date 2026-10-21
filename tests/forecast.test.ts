import { describe, expect, it } from 'vitest';
import { parseEnsembleArgs } from '../src/cli/ensemble-args';
import { paramDef } from '../src/core/params';
import { brier, logScore, metric, persistenceBaseline, runOne, sampleRuns, scoreFront, summarize, sweptParams, type EnsembleInput, type RunResult } from '../src/forecast';
import { runAll } from '../src/forecast/pool';
import type { Command, NationId, World } from '../src/core/types';
import { createSession } from '../src/scenarios';

const UKRAINE_METRICS = ['territory_changed', 'net_cells:RUS>0', 'ground_km2:RUS', 'advance_km:RUS', 'casualties:RUS', 'casualties:UKR'];

describe('ensemble runs on ukraine-2026', () => {
  const input: EnsembleInput = {
    world: 'ukraine-2026',
    ticks: 4,
    runs: [
      { seed: 1 },
      { seed: 1, params: { 'land.KILL_ZONE_COMMIT': 0.6, 'land.ENGAGED_HOURS_PER_DAY': 2.5 } },
      { seed: 2, params: { 'ai.ATTACK_RATIO': 2 } },
    ],
    metrics: UKRAINE_METRICS,
  };

  it('gives identical results for identical run specs, and different ones when a param moves', () => {
    const [a, b] = [runOne(input, input.runs[1]), runOne(input, input.runs[1])];
    expect(b).toEqual(a);
    expect(a.values['casualties:RUS']).toBeGreaterThan(0);
    expect(runOne(input, input.runs[0]).values).not.toEqual(a.values);
  }, 300_000);

  it('gets the same results from the worker pool as from a serial run', async () => {
    const serial = await runAll(input, { workers: 0 });
    const progress: number[] = [];
    const pooled = await runAll(input, { workers: 2, onProgress: (done) => progress.push(done) });
    expect(pooled).toEqual(serial);
    expect(progress).toEqual([1, 2, 3]);
  }, 300_000);

  it('forks a mid-game World and runs a plan on its own copy', () => {
    const s = createSession('ukraine-2026', 1);
    s.engine.run(s.world, 4);
    const fork = JSON.parse(JSON.stringify(s.world)) as World;
    const before = JSON.stringify(fork);
    const plan: Command[] = [{ type: 'set_mobilization', nation: 'UKR' as NationId, level: 1 }];
    const forked: EnsembleInput = { world: fork, plan, ticks: 4, runs: [], metrics: ['casualties:RUS', 'ground_km2:RUS'] };
    const a = runOne(forked, { seed: 9 });
    expect(runOne(forked, { seed: 9 })).toEqual(a);
    expect(JSON.stringify(fork)).toBe(before);
    expect(a.values['casualties:RUS']).toBeGreaterThan(0);
  }, 300_000);
});

describe('sampleRuns', () => {
  it('draws a Latin hypercube: one run per stratum of each param, inside its range, seeds cycled', () => {
    const n = 16;
    const runs = sampleRuns(n, { seeds: [1, 2, 3, 4], sweep: 'tagged', method: 'lhs' });
    expect(runs).toEqual(sampleRuns(n, { seeds: [1, 2, 3, 4], sweep: 'tagged', method: 'lhs' }));
    expect(runs.map((r) => r.seed)).toEqual(Array.from({ length: n }, (_, i) => [1, 2, 3, 4][i % 4]));
    const swept = sweptParams('tagged');
    expect(swept.every((d) => d.tag !== 'observed' && d.tag !== 'scenario')).toBe(true);
    for (const d of swept) {
      const strata = runs.map((r) => Math.floor(((r.params![d.id] - d.range[0]) / (d.range[1] - d.range[0])) * n)).sort((a, b) => a - b);
      expect(strata, d.id).toEqual(Array.from({ length: n }, (_, i) => i));
    }
  });

  it('moves one param at a time across evenly spaced levels for a stress test', () => {
    const runs = sampleRuns(3, { seeds: [7], sweep: ['land.KILL_ZONE_COMMIT', 'ai.ATTACK_RATIO'], method: 'oat' });
    expect(runs).toEqual([
      { seed: 7 },
      { seed: 7, params: { 'ai.ATTACK_RATIO': 2 } },
      { seed: 7, params: { 'ai.ATTACK_RATIO': 3 } },
      { seed: 7, params: { 'ai.ATTACK_RATIO': 4 } },
      { seed: 7, params: { 'land.KILL_ZONE_COMMIT': 0.15 } },
      { seed: 7, params: { 'land.KILL_ZONE_COMMIT': 0.375 } },
      { seed: 7, params: { 'land.KILL_ZONE_COMMIT': 0.6 } },
    ]);
    expect(() => sampleRuns(3, { seeds: [1], sweep: ['land.NOPE'], method: 'oat' })).toThrow('unknown param land.NOPE');
  });
});

describe('summarize', () => {
  // Synthetic runs: the goal metric is a line in KILL_ZONE_COMMIT crossing 0 at 0.4, plus seed noise; ATTACK_RATIO does nothing.
  const kz = paramDef('land.KILL_ZONE_COMMIT')!;
  const runs = sampleRuns(40, { seeds: [1, 2, 3, 4, 5], sweep: ['land.KILL_ZONE_COMMIT', 'ai.ATTACK_RATIO'], method: 'lhs' });
  const noise = (i: number) => ((i * 7919) % 13) / 13 - 0.5;
  const results: RunResult[] = runs.map((spec, i) => ({
    spec,
    values: { 'net_cells:RUS>0': 10 * (spec.params!['land.KILL_ZONE_COMMIT'] - 0.4) + 0.2 * noise(i), 'casualties:RUS': 1000 + 100 * noise(i) },
    changedCells: [],
  }));
  const input: EnsembleInput = { world: 'ukraine-2026', ticks: 120, runs, metrics: ['net_cells:RUS>0', 'casualties:RUS'] };
  const report = summarize(input, results);

  it('reports ranges and the share of runs meeting a goal', () => {
    const m = report.metrics['net_cells:RUS>0'];
    expect(m.min).toBeLessThan(m.p10);
    expect(m.p10).toBeLessThan(m.p50);
    expect(m.p90).toBeLessThan(m.max);
    expect(m.pMet).toBeCloseTo((kz.range[1] - 0.4) / (kz.range[1] - kz.range[0]), 1);
    expect(report.metrics['casualties:RUS'].pMet).toBeUndefined();
    expect(report.mode).toBe('forecast');
  });

  it('names the assumption that flips the outcome, with its tipping point, ahead of noise', () => {
    const [top] = report.top3;
    expect(top.param).toBe('land.KILL_ZONE_COMMIT');
    expect(top.flipsOutcome).toBe(true);
    expect(top.tipping).toBeCloseTo(0.4, 1);
    expect(top.effect).toBeCloseTo(10 * (kz.range[1] - kz.range[0]), 0);
    const noiseOnly = report.flips.filter((f) => f.param === 'ai.ATTACK_RATIO');
    expect(noiseOnly.every((f) => !f.flipsOutcome)).toBe(true);
    expect(report.top3.map((f) => f.param)).toEqual(['land.KILL_ZONE_COMMIT', 'ai.ATTACK_RATIO']);
  });

  it('reads a one-at-a-time sweep as a stress test, each param off its own runs', () => {
    const oat = sampleRuns(5, { seeds: [1], sweep: ['land.KILL_ZONE_COMMIT', 'ai.ATTACK_RATIO'], method: 'oat' });
    const res: RunResult[] = oat.map((spec) => ({ spec, values: { 'net_cells:RUS>0': 10 * ((spec.params?.['land.KILL_ZONE_COMMIT'] ?? kz.value) - 0.4) }, changedCells: [] }));
    const r = summarize({ ...input, runs: oat, metrics: ['net_cells:RUS>0'] }, res);
    expect(r.mode).toBe('stress');
    const [top] = r.top3;
    expect(top.param).toBe('land.KILL_ZONE_COMMIT');
    expect(top.tipping).toBeCloseTo(0.4, 6);
    expect(r.flips.find((f) => f.param === 'ai.ATTACK_RATIO')!.effect).toBe(0);
  });
});

describe('scoring against "the front stays put"', () => {
  it('computes Brier and log scores', () => {
    expect(brier([1, 0, 0.5], [true, false, true])).toBeCloseTo(0.25 / 3, 12);
    expect(logScore([0.5, 0.5], [true, false])).toBeCloseTo(Math.log(0.5), 12);
    expect(logScore([1], [false])).toBeCloseTo(Math.log(1e-3), 12);
    expect(persistenceBaseline([3, 4], 0.05)).toEqual([0.05, 0.05]);
  });

  it('scores model runs that saw the observed front move above persistence, and runs that moved the wrong cells below it', () => {
    const cells = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
    const observedChanged = [12, 13];
    const right = scoreFront({ cells, observedChanged, runs: [{ changedCells: [12, 13] }, { changedCells: [12] }, { changedCells: [13, 14] }, { changedCells: [12, 13] }] });
    expect(right.questions).toBe(10);
    expect(right.model.brier).toBeLessThan(right.baseline.brier);
    expect(right.model.log).toBeGreaterThan(right.baseline.log);
    expect(right.skill).toBeGreaterThan(0);

    const wrong = scoreFront({ cells, observedChanged, runs: [{ changedCells: [16, 17] }, { changedCells: [18, 19] }] });
    expect(wrong.skill).toBeLessThan(0);

    const still = scoreFront({ cells, observedChanged: [], runs: [{ changedCells: [] }] });
    expect(still.model.brier).toBe(0);
    expect(still.skill).toBe(1);
  });
});

describe('metric specs and CLI flags', () => {
  it('parses metric specs and refuses malformed ones', () => {
    expect(metric('net_cells:RUS>0').threshold).toBe(0);
    expect(metric('casualties:UKR').threshold).toBeUndefined();
    expect(() => metric('casualties')).toThrow('needs a nation');
    expect(() => metric('territory_changed:RUS')).toThrow('takes no nation');
    expect(() => metric('morale:RUS')).toThrow('unknown metric kind');
  });

  it('parses ensemble flags', () => {
    expect(parseEnsembleArgs(['--scenario', 'ukraine-2026', '--days', '30', '--runs', '16', '--sweep', 'tagged'])).toEqual({
      scenario: 'ukraine-2026', days: 30, runs: 16, seeds: [1, 2, 3, 4], sweep: 'tagged', method: 'lhs', workers: undefined, metrics: undefined, json: false,
    });
    expect(parseEnsembleArgs(['--method', 'oat', '--sweep', 'ai.ATTACK_RATIO,land.KILL_ZONE_COMMIT', '--json']).sweep).toEqual(['ai.ATTACK_RATIO', 'land.KILL_ZONE_COMMIT']);
    expect(() => parseEnsembleArgs(['--scenario', 'ukraine-2022'])).toThrow('unknown scenario');
    expect(() => parseEnsembleArgs(['--method', 'grid'])).toThrow('lhs or oat');
  });
});

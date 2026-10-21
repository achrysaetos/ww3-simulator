import { describe, expect, it, vi } from 'vitest';
import { measureRun, type RunMetrics } from '../src/metrics';
import type { EconomyMetrics } from '../src/metrics/economy';
import { createSession } from '../src/scenarios';

/** Munition run-down and war-economy bands for a global war, measured on 90 days of ww3-2027. */
vi.setConfig({ testTimeout: 900_000 });

const DAYS = 90;
const SEEDS = [1, 2];
const runs = new Map<number, RunMetrics>();
const run = (seed: number) => runs.get(seed) ?? runs.set(seed, (() => { const s = createSession('ww3-2027', seed); return measureRun(s.engine, s.world, s.map, DAYS); })()).get(seed)!;
const eco = (seed: number, nation: string): EconomyMetrics => run(seed).nations[nation].economy!;
const held = (e: EconomyMetrics, item: string, at: 0 | 1) => (e.items[item]?.fielded[at] ?? 0) + (e.items[item]?.stockpile[at] ?? 0);

describe.each(SEEDS)('ww3-2027 war economy, seed %i', (seed) => {
  it('the US builds 100-250 PAC-3 MSE in 90 days (Lockheed: 550 in 2024, 650/yr planned, surge ramps over ~2 years)', () => {
    const n = eco(seed, 'USA').produced.pac3_mse ?? 0;
    expect(n).toBeGreaterThanOrEqual(100);
    expect(n).toBeLessThanOrEqual(250);
  });

  it('the US builds 25-60 SM-6 in 90 days (CRS RL32109: ~125/yr bought FY2024-25)', () => {
    const n = eco(seed, 'USA').produced.sm6 ?? 0;
    expect(n).toBeGreaterThanOrEqual(25);
    expect(n).toBeLessThanOrEqual(60);
  });

  it('US interceptor stocks run down faster than industry replaces them (CSIS 2023-25; THAAD used ~25% of its inventory in 12 days of June 2025)', () => {
    const us = eco(seed, 'USA');
    for (const item of ['pac3_mse', 'thaad_int']) expect(held(us, item, 1)).toBeLessThan(held(us, item, 0));
  });

  it('Russia and China keep defence under 15% of GDP 90 days in (judgment; Korea-war US peaked at 14%)', () => {
    expect(eco(seed, 'RUS').defenseSharePct).toBeLessThanOrEqual(15);
    expect(eco(seed, 'CHN').defenseSharePct).toBeLessThanOrEqual(15);
  });

  it('no major oil producer runs its forces dry (judgment: at most 3 shortage days)', () => {
    for (const n of ['USA', 'RUS', 'CHN']) expect(eco(seed, n).shortageDays.fuel ?? 0).toBeLessThanOrEqual(3);
  });

  it('North Korean shells keep reaching Russia while both fight (NIS: ~2-3M rounds a year in 2024)', () => {
    const n = eco(seed, 'RUS').aid['PRK>RUS:shell_152'] ?? 0;
    expect(n).toBeGreaterThan(400_000);
  });
});

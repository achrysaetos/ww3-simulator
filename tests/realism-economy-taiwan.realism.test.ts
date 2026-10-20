import { describe, expect, it, vi } from 'vitest';
import { measureRun, type RunMetrics } from '../src/metrics';
import type { EconomyMetrics } from '../src/metrics/economy';
import { createSession } from '../src/scenarios';

/** Blockade and war-economy bands for a Chinese attack on Taiwan, measured on 90 days of taiwan-2027. */
vi.setConfig({ testTimeout: 900_000 });

const DAYS = 90;
const SEEDS = [1, 2];
const runs = new Map<number, RunMetrics>();
const run = (seed: number) => runs.get(seed) ?? runs.set(seed, (() => { const s = createSession('taiwan-2027', seed); return measureRun(s.engine, s.world, s.map, DAYS); })()).get(seed)!;
const eco = (seed: number, nation: string): EconomyMetrics => run(seed).nations[nation].economy!;
const firstWeek = (series: number[], test: (x: number) => boolean) => series.findIndex(test);

describe.each(SEEDS)('taiwan-2027 war economy, seed %i', (seed) => {
  it('Taiwan feels an energy shortfall within 4 weeks of a blockade as ~11 days of LNG run out (CPC; Taiwan imports ~97% of its energy)', () => {
    const w = eco(seed, 'TWN').weekly;
    const blockade = firstWeek(w.tradeBlocked, (x) => x >= 0.5);
    expect(blockade).toBeGreaterThanOrEqual(0);
    const short = firstWeek(w.energySupply, (x) => x < 0.9);
    expect(short).toBeGreaterThan(blockade);
    expect(short - blockade).toBeLessThanOrEqual(4);
  });

  it('Taiwan does not fall off an energy cliff in the first 6 weeks: coal (~36 days) and oil (~90+ days) reserves hold (judgment: supply >= 0.5)', () => {
    const w = eco(seed, 'TWN').weekly;
    const blockade = firstWeek(w.tradeBlocked, (x) => x >= 0.5);
    for (const x of w.energySupply.slice(0, blockade + 7)) expect(x).toBeGreaterThanOrEqual(0.5);
  });

  it('Taiwan loses 15-65% of output at war (Bloomberg Economics 2024: -40% in a war; judgment for the bounds at 90 days)', () => {
    expect(eco(seed, 'TWN').gdpIndex).toBeGreaterThanOrEqual(0.35);
    expect(eco(seed, 'TWN').gdpIndex).toBeLessThanOrEqual(0.85);
  });

  it('China loses no more than 15% of output in the first 90 days (Bloomberg Economics 2024: -11% over a year of war)', () => {
    expect(eco(seed, 'CHN').gdpIndex).toBeGreaterThanOrEqual(0.85);
    expect(eco(seed, 'CHN').gdpIndex).toBeLessThan(1);
  });

  it('China fuels its forces from national supply: no fuel shortage (judgment: at most 3 days)', () => {
    expect(eco(seed, 'CHN').shortageDays.fuel ?? 0).toBeLessThanOrEqual(3);
  });

  it('China keeps defence under 15% of GDP 90 days in (judgment: ~1.7% peacetime; Korea-war US peaked at 14%)', () => {
    expect(eco(seed, 'CHN').defenseSharePct).toBeLessThanOrEqual(15);
  });
});

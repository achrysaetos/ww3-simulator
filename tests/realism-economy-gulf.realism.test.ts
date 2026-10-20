import { describe, expect, it, vi } from 'vitest';
import { measureRun, type RunMetrics } from '../src/metrics';
import { createSession } from '../src/scenarios';

/** Energy-shock bands for an Iran-Israel war with Hormuz in play, measured on 60 days of gulf-2027. */
vi.setConfig({ testTimeout: 900_000 });

const DAYS = 60;
const SEEDS = [1, 2];
const runs = new Map<number, RunMetrics>();
const run = (seed: number) => runs.get(seed) ?? runs.set(seed, (() => { const s = createSession('gulf-2027', seed); return measureRun(s.engine, s.world, s.map, DAYS); })()).get(seed)!;

describe.each(SEEDS)('gulf-2027 energy shock, seed %i', (seed) => {
  it('when Gulf exports are mostly cut, world energy prices rise 1.4-3.5x (EIA/IEA Hormuz scenarios: USD 120-200+/bbl from ~USD 75)', () => {
    const iran = run(seed).nations.IRN.economy!;
    // Only meaningful if the run actually closed the strait.
    expect(Math.max(...iran.weekly.tradeBlocked)).toBeGreaterThan(0.5);
    expect(iran.energyPrice).toBeGreaterThanOrEqual(1.4);
    expect(iran.energyPrice).toBeLessThanOrEqual(3.5);
  });
});

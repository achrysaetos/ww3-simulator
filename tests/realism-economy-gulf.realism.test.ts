import { describe, expect, it, vi } from 'vitest';
import { measureRun, type RunMetrics } from '../src/metrics';
import { createSession } from '../src/scenarios';

/**
 * Energy-shock bands for an Iran-Israel war with Hormuz in play, measured on 60 days of gulf-2027.
 * The price must follow physical disruption, not the existence of a war: each weekly sample pairs
 * the world price with the share of world energy exports lost that week.
 */
vi.setConfig({ testTimeout: 900_000 });

const DAYS = 60;
const SEEDS = [1, 2];
const runs = new Map<number, RunMetrics>();
const run = (seed: number) => runs.get(seed) ?? runs.set(seed, (() => { const s = createSession('gulf-2027', seed); return measureRun(s.engine, s.world, s.map, DAYS); })()).get(seed)!;
const weeks = (seed: number) => {
  const w = run(seed).nations.IRN.economy!.weekly;
  return w.energyPrice.map((price, i) => ({ price, lost: w.energyExportsLost[i] }));
};

describe.each(SEEDS)('gulf-2027 energy shock, seed %i', (seed) => {
  it('with Hormuz open, a war in the Gulf lifts prices at most 30% (June 2025 Israel-Iran war: Brent +10-15%; Abqaiq 2019, ~5% of world oil offline: +15% peak)', () => {
    const open = weeks(seed).filter((x) => x.lost < 0.05);
    expect(open.length).toBeGreaterThan(0);
    for (const x of open) expect(x.price).toBeLessThanOrEqual(1.3);
  });

  it('when Gulf exports are cut by half or more, prices rise 1.4-3.5x (Goldman 2025: Hormuz flows halved for a month, Brent ~USD 110 from ~70; EIA/IEA full closure +50-150%)', () => {
    // Hormuz carries ~20% of world oil and LNG (EIA 2023), so half of it is ~10% of world energy exports.
    for (const x of weeks(seed).filter((w) => w.lost >= 0.1)) {
      expect(x.price).toBeGreaterThanOrEqual(1.4);
      expect(x.price).toBeLessThanOrEqual(3.5);
    }
  });
});

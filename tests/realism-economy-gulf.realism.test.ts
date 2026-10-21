import { describe, expect, it, vi } from 'vitest';
import { measureRun, type RunMetrics } from '../src/metrics';
import { createSession } from '../src/scenarios';
import { geography } from '../src/systems/naval/geography';

/** Energy-shock bands for an Iran-Israel war with Hormuz in play, measured on 60 days of gulf-2027. */
vi.setConfig({ testTimeout: 900_000 });

const DAYS = 60;
const SEEDS = [1, 2];
const runs = new Map<number, { m: RunMetrics; hormuzMines: number }>();
const run = (seed: number) =>
  runs.get(seed) ??
  runs.set(seed, (() => {
    const s = createSession('gulf-2027', seed);
    const m = measureRun(s.engine, s.world, s.map, DAYS);
    const zones = geography(s.map).chokepoints.find((c) => c.def.name === 'Strait of Hormuz')!.nodes;
    const hormuzMines = zones.reduce((a, n) => a + Object.values(s.world.slices.naval.mines[n] ?? {}).reduce((x, k) => x + k, 0), 0);
    return { m, hormuzMines };
  })()).get(seed)!;

describe.each(SEEDS)('gulf-2027 energy shock, seed %i', (seed) => {
  it('when Gulf exports are mostly cut, world energy prices rise 1.4-3.5x (EIA/IEA Hormuz scenarios: USD 120-200+/bbl from ~USD 75)', () => {
    const { m, hormuzMines } = run(seed);
    const iran = m.nations.IRN.economy!;
    // Only meaningful if the run actually closed the strait: mined, or Iran's own exports cut.
    expect(hormuzMines > 0 || Math.max(...iran.weekly.tradeBlocked) > 0.5).toBe(true);
    expect(iran.energyPrice).toBeGreaterThanOrEqual(1.4);
    expect(iran.energyPrice).toBeLessThanOrEqual(3.5);
  });
});

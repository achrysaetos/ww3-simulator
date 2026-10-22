import { describe, expect, it } from 'vitest';
import { withParams } from '../src/core/params';
import type { NationId, World } from '../src/core/types';
import { createSession } from '../src/scenarios';
import { DRONE_BAND_MAX } from '../src/systems/c2/tables';
import { DRONE_FIRE, KILL_ZONE_COMMIT, POSITIONAL_INTENSITY } from '../src/systems/land/tables';

const DIALS = { 'era.TRANSPARENCY': 1, 'era.STRIKE_COST_RATIO': 1, 'era.EW': 1 };

function run(ticks: number, params?: Record<string, number>) {
  const s = createSession('ukraine-2026', 1);
  if (params) s.world.params = params;
  const casualties: Record<string, number> = {};
  s.engine.run(s.world, ticks, (_, events) => {
    for (const e of events) if (e.type === 'battle' && (e.domain ?? 'land') === 'land') for (const [n, k] of Object.entries(e.casualties)) casualties[n] = (casualties[n] ?? 0) + k;
  });
  return { world: s.world, total: Object.values(casualties).reduce((a, b) => a + b, 0) };
}

/** Mean share of a nation's commanded formations' fire left after jamming. */
function guided(world: World, nation: string): number {
  const xs = Object.entries(world.slices.c2.formations).filter(([id]) => world.formations[id as keyof World['formations']].nation === (nation as NationId)).map(([, c]) => c.guided);
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

describe('era dials', () => {
  it('read exactly the calibrated constants at the default era, whatever those are set to', () => {
    for (const x of [0.2, 0.3, 0.45]) expect(withParams({ 'land.KILL_ZONE_COMMIT': x }, KILL_ZONE_COMMIT)).toBe(x);
    for (const x of [0.15, 0.25, 0.4]) expect(withParams({ 'land.POSITIONAL_INTENSITY': x }, POSITIONAL_INTENSITY)).toBe(x);
    for (const x of [0.3, 1, 1.7]) expect(withParams({ 'land.DRONE_FIRE': x }, DRONE_FIRE)).toBe(x);
    for (const x of [0.5, 0.8, 0.95]) expect(withParams({ 'c2.DRONE_BAND_MAX': x }, DRONE_BAND_MAX)).toBe(x);
  });

  it('at their defaults leave a 30-day ukraine-2026 run exactly as it runs without them', () => {
    expect(JSON.stringify(run(120, DIALS).world.slices)).toBe(JSON.stringify(run(120).world.slices));
  }, 300_000);

  it('cheaper strikes kill more, a more transparent battlefield commits fewer to the kill zone, and denser EW jams more drone fire', () => {
    const base = run(20).total;
    expect(run(20, { 'era.STRIKE_COST_RATIO': 2 }).total).toBeGreaterThan(1.1 * base);
    expect(run(20, { 'era.STRIKE_COST_RATIO': 0.5 }).total).toBeLessThan(base);
    expect(run(20, { 'era.TRANSPARENCY': 2 }).total).toBeLessThan(0.8 * base);
    expect(run(20, { 'era.TRANSPARENCY': 0.5 }).total).toBeGreaterThan(1.2 * base);
    const dense = run(4, { 'era.EW': 1.5 }).world, sparse = run(4, { 'era.EW': 0.5 }).world, now = run(4).world;
    for (const side of ['UKR', 'RUS']) {
      expect(guided(dense, side)).toBeLessThan(guided(now, side));
      expect(guided(now, side)).toBeLessThan(guided(sparse, side));
    }
  }, 300_000);
});

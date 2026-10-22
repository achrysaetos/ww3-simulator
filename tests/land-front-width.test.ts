import { describe, expect, it } from 'vitest';
import { snapshotFront } from '../src/forecast/metrics';
import { createSession } from '../src/scenarios';
import { groundKm2On } from '../src/validation/cases/measure';
import type { CaseRun } from '../src/validation/types';

/**
 * Russia's 2024-25 offensive pressed most of the front and took 3,500-5,000 km2 a year on ~1,000 km of it (ISW,
 * DeepState): a few km a day on narrow axes, little elsewhere. The front law once moved each pressed cell's whole
 * ~45 km width at the pace of its axis, so ukraine-2026 gained 50,000-300,000 km2 a year (p10-p90 of 8 runs). An
 * assault now moves only the sector its committed platforms fill.
 */
describe('ukraine-2026 front width', () => {
  it('Russia gains well under 20,000 km2 a year, counting partial advances, over 30 days', () => {
    const days = 30;
    const { engine, world, map } = createSession('ukraine-2026', 1);
    const start = snapshotFront(world);
    for (let i = 0; i < (days * 24) / world.dtHours; i++) engine.step(world);
    const run = { map, start, end: world, days } as unknown as CaseRun;
    const perYear = (groundKm2On(run, 'RUS', 'UKR') * 365) / days;
    console.log(`ukraine-2026 seed 1, ${days} days: Russia gains ${perYear.toFixed(0)} km2 a year`);
    expect(perYear).toBeGreaterThan(0);
    expect(perYear).toBeLessThan(20_000);
  }, 600_000);
});

import { describe, expect, it } from 'vitest';
import { atWar } from '../src/core/engine';
import { CSTO_OTHERS, NATO, nukesWithoutThreshold, runPolitics, type PoliticsRun, status } from './realism-politics.fixture';

/**
 * Russo-Ukrainian War, 60 days from the late-2025 line. Calibrated against 2022-25: no NATO
 * member and not China went to war; the CSTO was never invoked (Russia is the aggressor,
 * and even Kursk 2024 brought only DPRK troops under Russian command, no declaration).
 * The last case guards the premise the politics rest on: the front moves by kilometres a
 * month (ISW 2025), so Ukraine never threatens Moscow inside two months.
 */
const runs = new Map<number, PoliticsRun>();
const run = (seed: number) => runs.get(seed) ?? runs.set(seed, runPolitics('ukraine-2026', seed, 60)).get(seed)!;

describe.each([1, 2, 3])('ukraine-2026 seed %i, 60 days', (seed) => {
  it('stays a Russia-Ukraine war: no NATO member, not China', () => {
    const r = run(seed);
    expect(r.entries.some((e) => e.by === 'RUS' && e.on === 'UKR')).toBe(true);
    expect(NATO.filter((m) => status(r, m) !== 'peace')).toEqual([]);
    expect(status(r, 'CHN')).toBe('peace');
    expect(NATO.filter((m) => atWar(r.world, 'PRK' as never, m))).toEqual([]);
  }, 600_000);

  it("Russia's treaty partners enter only after a serious invasion of Russia, never for its own offensive", () => {
    const r = run(seed);
    const invaded = r.seriouslyInvaded.get('RUS' as never) ?? Infinity;
    const partners = r.entries.filter((e) => [...CSTO_OTHERS, 'PRK'].includes(e.by));
    for (const e of partners) expect(e.day, `${e.by} ${e.reason}`).toBeGreaterThanOrEqual(invaded);
    if (invaded === Infinity) expect(CSTO_OTHERS.filter((m) => status(r, m) !== 'peace')).toEqual([]);
  }, 600_000);

  it('Ukraine does not overrun Russia: Moscow unthreatened and under 2% of its people held [land realism]', () => {
    expect(run(seed).seriouslyInvaded.get('RUS' as never)).toBeUndefined();
  }, 600_000);

  it('no nuclear use in the first 30 days unless a data threshold was crossed', () => {
    expect(nukesWithoutThreshold(run(seed), 30)).toEqual([]);
  }, 600_000);
});

import { describe, expect, it } from 'vitest';
import { atWar } from '../src/core/engine';
import { EUROPE, fightsAny, runPolitics, type PoliticsRun, status } from './realism-politics.fixture';

/**
 * China attacks Taiwan. Whether the US intervenes is the guarantor's call under the TRA
 * (CSIS 2023 assumes it does); Japan fights when its territory, including US bases on
 * Okinawa, is struck, not by choosing to; North Korea's 1961 treaty is defensive and
 * does not trigger for China's own war; nobody in Europe is involved.
 */
const runs = new Map<number, PoliticsRun>();
const run = (seed: number) => runs.get(seed) ?? runs.set(seed, runPolitics('taiwan-2027', seed, 30)).get(seed)!;

describe.each([1, 2, 3])('taiwan-2027 seed %i, 30 days', (seed) => {
  it('China fights no European nation', () => {
    expect(fightsAny(run(seed), 'CHN', EUROPE)).toEqual([]);
  }, 600_000);

  it('the US decides on the TRA within a week', () => {
    const r = run(seed);
    const joined = r.entries.some((e) => e.by === 'USA' && e.reason.includes('US-TWN-TRA'));
    const declined = r.declined.some((t) => t.startsWith('USA declines to honour US-TWN-TRA'));
    expect(joined !== declined).toBe(true);
  }, 600_000);

  it('Japan fights only once China strikes Japanese territory', () => {
    const r = run(seed);
    const first = r.entries.find((e) => (e.by === 'JPN' && e.on === 'CHN') || (e.by === 'CHN' && e.on === 'JPN'));
    if (first) expect(first).toMatchObject({ by: 'CHN', on: 'JPN', reason: 'strike on JPN territory' });
    else expect(atWar(r.world, 'JPN' as never, 'CHN' as never)).toBe(false);
  }, 600_000);

  it("North Korea's and Russia's treaties with China do not pull them into China's war", () => {
    const r = run(seed);
    expect(status(r, 'PRK')).toBe('peace');
    expect(status(r, 'RUS')).toBe('peace');
  }, 600_000);
});

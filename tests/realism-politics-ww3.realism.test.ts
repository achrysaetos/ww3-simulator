import { describe, expect, it } from 'vitest';
import { EUROPE, NATO, enteredOn, fightsAny, runPolitics, type PoliticsRun } from './realism-politics.fixture';

/**
 * Four simultaneous wars. Each stays a coalition of its own: Article 5 still holds in
 * Europe, and China does not end up at war with Europe because Russia is.
 */
const ATTACKED = ['EST', 'LVA', 'LTU', 'POL'];
const OTHERS = NATO.filter((m) => !ATTACKED.includes(m));

const runs = new Map<number, PoliticsRun>();
const run = (seed: number) => runs.get(seed) ?? runs.set(seed, runPolitics('ww3-2027', seed, 14)).get(seed)!;

describe.each([1, 2, 3])('ww3-2027 seed %i, 14 days', (seed) => {
  it('China fights no European nation', () => {
    expect(fightsAny(run(seed), 'CHN', EUROPE)).toEqual([]);
  }, 600_000);

  it('at least 90% of the other NATO members fight Russia, the US among them', () => {
    const r = run(seed);
    const joined = OTHERS.filter((m) => enteredOn(r, m, 'RUS') !== undefined);
    expect(joined.length).toBeGreaterThanOrEqual(Math.ceil(0.9 * OTHERS.length));
    expect(joined).toContain('USA');
  }, 600_000);
});

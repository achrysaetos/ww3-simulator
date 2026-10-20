import { describe, expect, it } from 'vitest';
import { EUROPE, NATO, enteredOn, fightsAny, nukesWithoutThreshold, runPolitics, type PoliticsRun, status } from './realism-politics.fixture';

/**
 * Russia attacks Estonia, Latvia and Lithuania. Article 5 is expected to hold: the US, UK,
 * Germany and Poland are near-certain (eFP framework nations, frontline states, nuclear
 * guarantors), Hungary and Turkey less so; each member decides after days, not at once.
 */
const ATTACKED = ['EST', 'LVA', 'LTU'];
const OTHERS = NATO.filter((m) => !ATTACKED.includes(m));
const CORE = ['USA', 'GBR', 'DEU', 'POL'];

const runs = new Map<number, PoliticsRun>();
const run = (seed: number) => runs.get(seed) ?? runs.set(seed, runPolitics('baltic-2027', seed, 30)).get(seed)!;

describe.each([1, 2, 3])('baltic-2027 seed %i, 30 days', (seed) => {
  it('at least 90% of the other NATO members fight Russia within 14 days, most within a week, the core in every run', () => {
    const r = run(seed);
    const joined = OTHERS.filter((m) => (enteredOn(r, m, 'RUS') ?? Infinity) <= 14);
    expect(joined.length).toBeGreaterThanOrEqual(Math.ceil(0.9 * OTHERS.length));
    expect(OTHERS.filter((m) => (enteredOn(r, m, 'RUS') ?? Infinity) <= 7).length).toBeGreaterThan(OTHERS.length / 2);
    for (const m of CORE) expect(enteredOn(r, m, 'RUS'), m).toBeLessThanOrEqual(14);
  }, 600_000);

  it('allies decide over days, not in the tick of the attack', () => {
    const r = run(seed);
    const days = OTHERS.map((m) => enteredOn(r, m, 'RUS')).filter((d) => d !== undefined);
    expect(Math.min(...days)).toBeGreaterThanOrEqual(1);
  }, 600_000);

  it('stays a European war: China and the CSTO stay out', () => {
    const r = run(seed);
    expect(status(r, 'CHN')).toBe('peace');
    expect(fightsAny(r, 'CHN', EUROPE)).toEqual([]);
    for (const m of ['KAZ', 'KGZ', 'TJK']) expect(status(r, m), m).toBe('peace');
  }, 600_000);

  it('no nuclear use in 30 days unless a data threshold was crossed', () => {
    expect(nukesWithoutThreshold(run(seed), 30)).toEqual([]);
  }, 600_000);
});

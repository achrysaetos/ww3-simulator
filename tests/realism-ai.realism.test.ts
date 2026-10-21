import { describe, expect, it } from 'vitest';
import type { NationId, World } from '../src/core/types';
import { createSession } from '../src/scenarios';
import { defenseShare } from '../src/systems/economy';

/**
 * Who fights and how hard each belligerent mobilizes, on whole scenario runs.
 * Mobilization is read through the economy's defence curve, 2% + 48% x level^2 of GDP.
 */
const DAYS = 90;
const SEEDS = [1, 2, 3];

interface Run {
  world: World;
  /** Every nation at war at any point in the run. */
  belligerents: NationId[];
  /** Daily samples of each tracked nation's mobilization and defence share of GDP. */
  daily: Record<string, { mob: number[]; defense: number[] }>;
}

function simulate(scenario: string, seed: number, track: string[]): Run {
  const s = createSession(scenario, seed);
  const perDay = Math.round(24 / s.world.dtHours);
  const daily: Run['daily'] = Object.fromEntries(track.map((n) => [n, { mob: [], defense: [] }]));
  const belligerents = new Set<NationId>();
  for (let i = 1; i <= DAYS * perDay; i++) {
    s.engine.step(s.world);
    for (const n of Object.keys(s.world.nations) as NationId[]) if (s.world.nations[n].status === 'war') belligerents.add(n);
    if (i % perDay) continue;
    for (const n of track) {
      const nation = s.world.nations[n as NationId];
      daily[n].mob.push(nation.mobilization);
      daily[n].defense.push(defenseShare(nation));
    }
  }
  return { world: s.world, belligerents: [...belligerents].sort(), daily };
}

const cache = new Map<string, Run>();
const run = (scenario: string, seed: number, track: string[] = []) =>
  cache.get(`${scenario}|${seed}`) ?? cache.set(`${scenario}|${seed}`, simulate(scenario, seed, track)).get(`${scenario}|${seed}`)!;
const ukraine = (seed: number) => run('ukraine-2026', seed, ['RUS', 'UKR']);
const baltic = (seed: number) => run('baltic-2027', seed);

describe.each(SEEDS)('ukraine-2026 seed %i, 90 days', (seed) => {
  it('stays Russia and Ukraine, Belarus at most: no third state has entered the war in 2022-2026 (judgment on Belarus, which hosts Russian forces)', () => {
    const r = ukraine(seed);
    expect(r.belligerents).toEqual(expect.arrayContaining(['RUS', 'UKR']));
    expect(r.belligerents.filter((n) => !['RUS', 'UKR', 'BLR'].includes(n))).toEqual([]);
  }, 600_000);

  it('Russia holds a partial war economy throughout: mobilization 0.3-0.4, defence 5.5-10% of GDP (SIPRI 2025: 7.1% in 2024; no general call-up since Sept 2022)', () => {
    const { mob, defense } = ukraine(seed).daily.RUS;
    expect(Math.min(...mob)).toBeGreaterThanOrEqual(0.3);
    expect(Math.max(...mob)).toBeLessThanOrEqual(0.4);
    expect(Math.min(...defense)).toBeGreaterThanOrEqual(0.055);
    expect(Math.max(...defense)).toBeLessThanOrEqual(0.1);
  }, 600_000);

  it('Ukraine stays on a total war footing throughout: mobilization 0.65-0.9, defence 25-40% of GDP (SIPRI 2025: 34% in 2024; general mobilization since Feb 2022; the floor is a judgment set by its ~30k-a-month draft)', () => {
    const { mob, defense } = ukraine(seed).daily.UKR;
    expect(Math.min(...mob)).toBeGreaterThanOrEqual(0.65);
    expect(Math.max(...mob)).toBeLessThanOrEqual(0.9);
    expect(Math.min(...defense)).toBeGreaterThanOrEqual(0.25);
    expect(Math.max(...defense)).toBeLessThanOrEqual(0.4);
  }, 600_000);
});

describe.each(SEEDS)('baltic-2027 seed %i, 90 days', (seed) => {
  it('pulls NATO in: the US, Poland and Germany fight Russia (North Atlantic Treaty Art. 5)', () => {
    expect(baltic(seed).belligerents).toEqual(expect.arrayContaining(['RUS', 'EST', 'LVA', 'LTU', 'USA', 'POL', 'DEU']));
  }, 600_000);

  it('mobilizes by threat: Latvia and Lithuania, invaded or with their capitals under the guns, order total mobilization; members far from Russia stay partial (Ukraine 2022 vs the US in 1991 and 2003)', () => {
    const r = baltic(seed);
    const target = (n: string) => r.world.slices.economy.nations[n as NationId].mobilizationTarget;
    for (const n of ['LVA', 'LTU']) expect(target(n), n).toBeGreaterThanOrEqual(0.65);
    for (const n of ['PRT', 'ESP', 'CAN', 'ITA']) expect(target(n), n).toBeLessThan(0.3);
  }, 600_000);
});

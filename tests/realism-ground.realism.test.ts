import { beforeAll, describe, expect, it } from 'vitest';
import type { GameMap } from '../src/core/map';
import type { NationId, World } from '../src/core/types';
import { createSession } from '../src/scenarios';
import { caseById } from '../src/validation/cases';
import { bandProblem, ensemble, spread } from '../src/validation/ensemble';
import type { CaseResult } from '../src/validation/run';

interface GroundRun {
  world: World;
  map: GameMap;
  days: number;
  start: readonly (NationId | undefined)[];
  /** Control on each day boundary, for "the offensive has stalled by day N". */
  daily: (NationId | undefined)[][];
  casualties: Map<NationId, number>;
  /** Tanks knocked out in battle before repair or replacement, the quantity Oryx counts. */
  tanks: Map<NationId, number>;
  landBattles: number;
  capitulated: NationId[];
}

function runGround(scenario: string, seed: number, days: number): GroundRun {
  const s = createSession(scenario, seed);
  const { map, catalog } = s.engine;
  const perDay = Math.round(24 / s.world.dtHours);
  const r: GroundRun = { world: s.world, map, days, start: [...s.world.control], daily: [], casualties: new Map(), tanks: new Map(), landBattles: 0, capitulated: [] };
  const add = (m: Map<NationId, number>, n: NationId, k: number) => m.set(n, (m.get(n) ?? 0) + k);
  for (let i = 0; i < days * perDay; i++) {
    for (const e of s.engine.step(s.world)) {
      if (e.type === 'capitulation') r.capitulated.push(e.nation);
      if (e.type !== 'battle' || e.node >= map.landCount) continue;
      r.landBattles++;
      for (const [n, c] of Object.entries(e.casualties)) add(r.casualties, n as NationId, c);
      for (const [n, lost] of Object.entries(e.losses))
        for (const [pid, k] of Object.entries(lost)) if (catalog.platform(pid as never).class === 'mbt') add(r.tanks, n as NationId, k);
    }
    if ((i + 1) % perDay === 0) r.daily.push([...s.world.control]);
  }
  return r;
}

/**
 * Ground `by` took from any of `from` between two control snapshots, net of ground it lost back to them,
 * in 1-degree cells: a finer cell (Vilnius, Kaliningrad) counts by its share of a 1-degree square.
 */
function netGain(map: GameMap, before: readonly (NationId | undefined)[], after: readonly (NationId | undefined)[], by: string, from: readonly string[]): number {
  let n = 0;
  for (let i = 0; i < before.length; i++) {
    const cells = (2 * map.halfDeg[i]) ** 2;
    if (from.includes(before[i]!) && after[i] === by) n += cells;
    if (before[i] === by && from.includes(after[i]!)) n -= cells;
  }
  return n;
}

const memo = new Map<string, GroundRun>();
const run = (scenario: string, seed: number, days: number) => {
  const key = `${scenario}/${seed}/${days}`;
  return memo.get(key) ?? memo.set(key, runGround(scenario, seed, days)).get(key)!;
};

/**
 * The bands below are checked over an ensemble, not one seed at a time: 8 runs, seeds 1-4 across a
 * Latin hypercube of every estimated, judgment and contested param (src/validation/ensemble.ts).
 * The median run must land in the band. Single seeds at the defaults hid how much the outcome rests
 * on luck and on knobs: baltic-2027 seed 2 took half a cell against the 1-6 band, and A3's 16-run
 * ukraine-2026 sweep put Russian casualties at p10-p90 1,100-2,200 a day. The bands themselves and
 * their sources live with the cases in src/validation/cases/bands.ts.
 */
const bandOf = (caseId: string) => {
  const c = caseById(caseId);
  return (runs: readonly CaseResult[], question: string) => {
    const q = c.questions.find((x) => x.id === question)!;
    return bandProblem(spread(runs, question), q.observed.lo, q.observed.hi);
  };
};

/**
 * Russo-Ukrainian War from the late-2025 line. Russia gained about 3,500-5,000 km2 a year in
 * 2024-25 (ISW, DeepState), under one 1-degree cell in 60 days; 0-2 allows for a cell boundary
 * falling inside a slow advance. Russian killed and wounded ran about 1,000-1,500 a day in
 * 2024-25 (UK MoD, Ukrainian General Staff); the band is wider for a model whose casualties come
 * from crews and dismounts. Oryx confirmed about 3-5 Russian tanks a day in 2024 and roughly a
 * quarter of that for Ukraine, which defended.
 */
describe('ukraine-2026, 60 days, ensemble of 8', () => {
  const band = bandOf('ukraine-2026-60d');
  let runs: CaseResult[];
  // Eight 60-day runs on two workers outlast the realism suite's 10-minute default on a shared machine.
  beforeAll(async () => {
    runs = await ensemble('ukraine-2026-60d');
  }, 1_800_000);

  it('Russia nets 0-2 cells of Ukraine', () => {
    expect(band(runs, 'rus_net_cells')).toBeUndefined();
  });

  it('Russia loses 500-2,000 personnel a day, more than Ukraine', () => {
    expect(band(runs, 'rus_casualties_per_day')).toBeUndefined();
    expect(band(runs, 'ukr_minus_rus_casualties')).toBeUndefined();
  });

  it('Russia loses 2-8 tanks a day, Ukraine fewer, at least half a tank a day', () => {
    expect(band(runs, 'rus_tanks_per_day')).toBeUndefined();
    expect(band(runs, 'ukr_tanks_per_day')).toBeUndefined();
    expect(band(runs, 'ukr_minus_rus_tanks')).toBeUndefined();
  });

  it('nobody capitulates in any run', () => {
    expect(spread(runs, 'capitulations').values.every((v) => v === 0)).toBe(true);
  });
});

/**
 * RAND (Shlapak and Johnson, 2016) found Russian forces at Tallinn or Riga in 36-60 hours against
 * 2016 posture. With eFP brigades grown to brigades, Panzerbrigade 45 in Lithuania and Finland in
 * NATO the 2027 defence is thicker, against a Leningrad district army back in garrison by the
 * border (RUSSIA_WEST_2027 in src/scenarios), so the judgment band is ground taken but no
 * collapse: 1-6 Baltic cells in three weeks.
 */
describe('baltic-2027, 21 days, ensemble of 8', () => {
  it('Russia takes 1-6 cells of the Baltic states', async () => {
    expect(bandOf('baltic-2027-21d')(await ensemble('baltic-2027-21d'), 'baltic_cells')).toBeUndefined();
  }, 1_800_000);
});

/**
 * BB-8: a Russian main effort on Tallinn reaches the city or a cell next to it by day 18 on most of
 * seeds 1-6 (RAND's 36-60 hours against 2016 posture, slowed by the thicker 2027 defence above).
 */
describe('baltic-2027 seeds 1-6, 18 days', () => {
  it('Russia reaches Tallinn or a cell next to it by day 18 on a majority of seeds', () => {
    const seeds = [1, 2, 3, 4, 5, 6];
    const reached = seeds.filter((seed) => {
      const r = run('baltic-2027', seed, 18);
      const tallinn = r.map.nodeAt(59.44, 24.75);
      const control = r.world.control;
      return control[tallinn] === 'RUS' || [...r.map.neighbors(tallinn)].some((n) => n < r.map.landCount && control[n] === 'RUS');
    });
    expect(reached.length, `seeds that reached Tallinn: ${reached.join(', ') || 'none'}`).toBeGreaterThan(seeds.length / 2);
  }, 3_600_000);
});

/**
 * Korea 2027, a judgment band: the ROK-US defence behind the DMZ is deep and fortified, so a
 * conventional DPRK offensive culminates within about two weeks without taking Seoul.
 */
describe.each([1, 2])('korea-2027 seed %i, 21 days', (seed) => {
  it('the North attacks, stalls by day 14 and never takes Seoul', () => {
    const r = run('korea-2027', seed, 21);
    const seoul = r.map.nodeAt(37.57, 126.98);
    expect(r.landBattles).toBeGreaterThan(0);
    for (const day of r.daily) expect(day[seoul]).toBe('KOR');
    expect(netGain(r.map, r.daily[13], r.daily[20], 'PRK', ['KOR'])).toBeLessThanOrEqual(0);
  });
});

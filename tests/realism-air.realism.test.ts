import { beforeAll, describe, expect, it } from 'vitest';
import { measureRun, type RunMetrics, type StrikeWeaponClass } from '../src/metrics';
import { createSession } from '../src/scenarios';

const CREWED = new Set(['fighter', 'multirole', 'attack_aircraft', 'bomber', 'stealth_bomber', 'awacs', 'tanker', 'ew_aircraft', 'maritime_patrol', 'transport_aircraft', 'attack_helo', 'transport_helo', 'asw_helo']);

function run(scenario: string, days: number, seeds: number[]): RunMetrics[] {
  return seeds.map((seed) => {
    const s = createSession(scenario, seed);
    return measureRun(s.engine, s.world, s.map, days);
  });
}

const tally = (r: RunMetrics, by: string, on: string | undefined, classes: StrikeWeaponClass[]) => {
  const src = on ? r.nations[by]?.strikesOn[on] : r.nations[by]?.strikes;
  let fired = 0, intercepted = 0;
  for (const c of classes) {
    fired += src?.[c]?.fired ?? 0;
    intercepted += src?.[c]?.intercepted ?? 0;
  }
  return { fired, intercepted };
};
const pooledRate = (runs: RunMetrics[], by: string, on: string, classes: StrikeWeaponClass[]) => {
  const t = runs.map((r) => tally(r, by, on, classes));
  return t.reduce((a, x) => a + x.intercepted, 0) / t.reduce((a, x) => a + x.fired, 0);
};
const crewedLost = (r: RunMetrics, n: string) => Object.entries(r.nations[n]?.lossesByClass ?? {}).reduce((a, [c, k]) => a + (CREWED.has(c) ? k ?? 0 : 0), 0);
const MISSILES: StrikeWeaponClass[] = ['cruise_missile', 'ballistic_missile'];

describe('ukraine-2026, 30 days', () => {
  let runs: RunMetrics[];
  beforeAll(() => {
    runs = run('ukraine-2026', 30, [1, 2, 3]);
  });

  // UAF monthly tallies 2025: 2,500-6,300 Shahed/Geran-type drones a month (ISW, CSIS "Russia's Drone War" 2025).
  it('Russia launches 3,000-7,000 long-range one-way drones a month', () => {
    for (const r of runs) {
      const n = tally(r, 'RUS', undefined, ['one_way_drone']).fired;
      expect(n).toBeGreaterThanOrEqual(3000);
      expect(n).toBeLessThanOrEqual(7000);
    }
  });

  // UAF monthly tallies 2024-25: ~100-300 cruise and ballistic missiles a month, peaks near 400.
  it('Russia fires 100-400 cruise and ballistic missiles a month at Ukraine', () => {
    for (const r of runs) {
      const n = tally(r, 'RUS', 'UKR', MISSILES).fired;
      expect(n).toBeGreaterThanOrEqual(100);
      expect(n).toBeLessThanOrEqual(400);
    }
  });

  // UAF claims ~80-90 % of drones downed or lost to EW; independent counts are lower (judgment: 75-92 %).
  it('Ukraine downs 75-92 % of the drones (pooled over seeds)', () => {
    const rate = pooledRate(runs, 'RUS', 'UKR', ['one_way_drone']);
    expect(rate).toBeGreaterThanOrEqual(0.75);
    expect(rate).toBeLessThanOrEqual(0.92);
  });

  // Russia's MoD claimed hundreds of Ukrainian long-range drones downed in single nights in 2025 (337 on 11 March).
  // The scenario fields two launch units sized for ~500 a month, so this is a floor: launch sites a few hundred
  // km behind the line keep firing instead of falling to glide bombs in the first week.
  it('Ukraine launches at least 300 long-range one-way drones a month', () => {
    for (const r of runs) expect(tally(r, 'UKR', undefined, ['one_way_drone']).fired).toBeGreaterThanOrEqual(300);
  });

  // UAF claims ~70-80 % of cruise missiles and far fewer ballistic ones (CSIS Missile Threat 2025). Judgment: 40-80 % overall, pooled.
  it('Ukraine downs 40-80 % of the missiles (pooled over seeds)', () => {
    const rate = pooledRate(runs, 'RUS', 'UKR', MISSILES);
    expect(rate).toBeGreaterThanOrEqual(0.4);
    expect(rate).toBeLessThanOrEqual(0.8);
  });

  // 2022-25: the air over the front stays contested, neither side holds it (RUSI "Preliminary Lessons", 2022-24).
  it('neither side holds the air over the front', () => {
    for (const r of runs) for (const n of ['RUS', 'UKR']) expect(r.nations[n]?.frontAirControl ?? 0).toBeLessThan(0.1);
  });

  // Oryx 2023-25: a few fixed-wing and helicopter losses a month per side; peaks of ~20-30 in early 2022.
  // Judgment: the mean over seeds stays under 20 a month per side, not dozens.
  it('each side loses a few crewed aircraft a month, not dozens', () => {
    for (const n of ['RUS', 'UKR']) {
      const mean = runs.reduce((a, r) => a + crewedLost(r, n), 0) / runs.length;
      expect(mean).toBeLessThan(20);
    }
  });
});

describe('gulf-2027, 30 days', () => {
  let runs: RunMetrics[];
  beforeAll(() => {
    runs = run('gulf-2027', 30, [1, 2]);
  });

  // April 2024: ~99 % of ~320 drones and missiles intercepted with US, UK, French and Jordanian help; October 2024: most of ~180 ballistic missiles (IDF, US DoD).
  it('Israel and its partners intercept over 85 % of what Iran launches at Israel (pooled)', () => {
    const rate = pooledRate(runs, 'IRN', 'ISR', [...MISSILES, 'one_way_drone']);
    expect(rate).toBeGreaterThan(0.85);
  });

  // June 2025: THAAD fired ~100-150 rounds, about a quarter of US stocks, in 12 days; Arrow stocks ran short (WSJ, CSIS 2025).
  it('interceptor stocks deplete measurably within the month', () => {
    for (const r of runs) {
      const i = r.nations.ISR!.interceptors;
      expect(i.end).toBeLessThan(0.85 * i.start);
    }
  });

  // June 2025: ~550 ballistic missiles in 12 days, in waves on most nights (IDF, CSIS Missile Defense Project). The
  // scenario order of battle (src/data/orbat/east/irn.ts) holds ~900 MRBMs on ~110 launchers, so a month of open war
  // is salvos of hundreds.
  it('Iran fires salvos of hundreds (at least 300 ballistic missiles at Israel in 30 days)', () => {
    for (const r of runs) expect(tally(r, 'IRN', 'ISR', ['ballistic_missile']).fired).toBeGreaterThanOrEqual(300);
  });

  // October 2024 and June 2025: Israeli F-15I and F-35I flew 1,500-2,000 km to strike Iran with stand-off weapons.
  it('Israeli air strikes reach Iran (October 2024, June 2025)', () => {
    for (const r of runs) expect(tally(r, 'ISR', 'IRN', ['air_ordnance', 'glide_bomb']).fired).toBeGreaterThan(0);
  });
});

describe('taiwan-2027, first week', () => {
  let runs: RunMetrics[];
  beforeAll(() => {
    runs = run('taiwan-2027', 7, [1, 2]);
  });

  // CSIS 2023 "The First Battle of the Next War": PLARF opens with salvos of hundreds of SRBMs and cruise missiles on Taiwanese and US/Japanese bases.
  // CSIS assumes the US and Japan fight from the first day. The sim draws US entry on day 6 at odds of about 0.8
  // (diplomacy/wars.ts ambiguousResolve), with a second look a week later, and Japan comes in with it; so the Japan
  // clause is held on the runs where Japan is at war by day 6.
  it('the PLA fires hundreds of missiles at Taiwan and the bases in Japan', () => {
    const japanIn = (r: RunMetrics) => r.wars.some((w) => [w.a, w.b].sort().join() === 'CHN,JPN' && w.since < (7 * 24) / 6);
    expect(runs.some(japanIn)).toBe(true);
    for (const r of runs) {
      expect(tally(r, 'CHN', 'TWN', MISSILES).fired).toBeGreaterThan(300);
      if (japanIn(r)) expect(tally(r, 'CHN', 'JPN', MISSILES).fired).toBeGreaterThan(30);
    }
  });

  // CSIS 2023: ~90 % of US aircraft losses were on the ground. Held, like the Japan clause, on the runs where the
  // US has drawn entry by the end of the week.
  it('most US aircraft losses are on the ground', () => {
    const usIn = runs.filter((r) => r.nations.USA !== undefined);
    expect(usIn.length).toBeGreaterThan(0);
    for (const r of usIn) {
      const usa = r.nations.USA!;
      expect(usa.aircraftLostOnGround).toBeGreaterThan(0);
      expect(usa.aircraftLostOnGround).toBeGreaterThanOrEqual(0.5 * crewedLost(r, 'USA'));
    }
  });
});

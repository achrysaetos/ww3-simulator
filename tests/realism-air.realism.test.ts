import { beforeAll, describe, expect, it } from 'vitest';
import { measureRun, type RunMetrics, type StrikeWeaponClass } from '../src/metrics';
import type { Catalog } from '../src/core/catalog';
import type { Formation, FormationId, MunitionId, NationId, PlatformId, World } from '../src/core/types';
import { createSession } from '../src/scenarios';

const CREWED = new Set(['fighter', 'multirole', 'attack_aircraft', 'bomber', 'stealth_bomber', 'awacs', 'tanker', 'ew_aircraft', 'maritime_patrol', 'transport_aircraft', 'attack_helo', 'transport_helo', 'asw_helo']);

/** Israel's upper-tier missile defence rounds, launchers and warehouse together: Arrow 2 and 3, David's Sling, THAAD. */
const UPPER_TIER = ['arrow2', 'arrow3', 'stunner', 'thaad_int'];
const upperTier = new WeakMap<RunMetrics, { start: number; end: number }>();

function upperTierStock(world: World, nation: string): number {
  let n = 0;
  for (const m of UPPER_TIER) n += world.nations[nation as NationId]?.stockpile[m as MunitionId] ?? 0;
  for (const f of Object.values(world.formations)) if (f.nation === nation) for (const m of UPPER_TIER) n += f.magazine[m as MunitionId] ?? 0;
  return n;
}

/** Crewed aircraft aboard each ship group with a flight deck or hangar (its own and its embarked wings), and that deck space. */
function decks(world: World, catalog: Catalog): Map<FormationId, { nation: string; deck: number; aircraft: number }> {
  const out = new Map<FormationId, { nation: string; deck: number; aircraft: number }>();
  const crewed = (eq: Formation['equipment']) => Object.entries(eq).reduce((a, [p, n]) => a + (CREWED.has(catalog.platform(p as PlatformId).class) ? n : 0), 0);
  for (const f of Object.values(world.formations)) {
    if (f.status === 'destroyed' || f.kind === 'air_wing') continue;
    const deck = Object.entries(f.equipment).reduce((a, [p, n]) => a + (catalog.platform(p as PlatformId).capacity?.aircraft ?? 0) * n, 0);
    if (deck > 0) out.set(f.id, { nation: f.nation, deck, aircraft: crewed(f.equipment) });
  }
  for (const f of Object.values(world.formations)) {
    const host = f.status !== 'destroyed' && f.kind === 'air_wing' && f.embarkedOn ? out.get(f.embarkedOn) : undefined;
    if (host) host.aircraft += crewed(f.equipment);
  }
  return out;
}

/** Crewed aircraft each nation lost with the ships that carried them. */
const lostOnDeck = new WeakMap<RunMetrics, Record<string, number>>();

/** Runs each seed; `joins` answer their treaty calls yes at the deadline, where the AI would draw its answer. */
function run(scenario: string, days: number, seeds: number[], joins: string[] = []): RunMetrics[] {
  return seeds.map((seed) => {
    const s = createSession(scenario, seed);
    const start = upperTierStock(s.world, 'ISR');
    const onDeck: Record<string, number> = {};
    const engine = Object.assign(Object.create(s.engine), {
      step: (w: World) => {
        for (const j of w.slices.diplomacy.joins)
          if (joins.includes(j.nation) && w.tick + 1 >= j.dueTick) w.pending.push({ type: 'answer_treaty', nation: j.nation, war: j.war, treaty: j.treaty, join: true });
        const before = decks(w, s.catalog);
        const events = s.engine.step(w);
        const after = decks(w, s.catalog);
        for (const [id, b] of before) {
          const a = after.get(id);
          if (!a || a.deck < b.deck) onDeck[b.nation] = (onDeck[b.nation] ?? 0) + Math.max(0, b.aircraft - (a?.aircraft ?? 0));
        }
        return events;
      },
    });
    const r = measureRun(engine, s.world, s.map, days);
    upperTier.set(r, { start, end: upperTierStock(s.world, 'ISR') });
    lostOnDeck.set(r, onDeck);
    return r;
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
      const i = upperTier.get(r)!;
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
    runs = run('taiwan-2027', 7, [1, 2], ['USA']);
  });

  // CSIS 2023 "The First Battle of the Next War": PLARF opens with salvos of hundreds of SRBMs and cruise missiles on Taiwanese and US/Japanese bases.
  // CSIS assumes the US and Japan fight from the first day. The sim draws US entry on day 6 at odds of about 0.8
  // (diplomacy/wars.ts ambiguousResolve), and Japan comes in with it. These runs answer the US call yes at that
  // deadline, so they measure the war with the US and Japan in it, not the draw.
  it('the PLA fires hundreds of missiles at Taiwan and the bases in Japan', () => {
    const japanIn = (r: RunMetrics) => r.wars.some((w) => [w.a, w.b].sort().join() === 'CHN,JPN' && w.since < (7 * 24) / 6);
    for (const r of runs) {
      expect(japanIn(r)).toBe(true);
      expect(tally(r, 'CHN', 'TWN', MISSILES).fired).toBeGreaterThan(300);
      expect(tally(r, 'CHN', 'JPN', MISSILES).fired).toBeGreaterThan(30);
    }
  });

  // CSIS 2023: "about 90 percent" of US losses were "on the ground"; its 168-372 US aircraft lost include "the 96 Navy
  // fighter/attack aircraft lost on U.S. aircraft carriers", so aircraft that go down with their ship count with them.
  it('most US aircraft losses are on the ground or aboard ships, not in the air', () => {
    for (const r of runs) {
      expect(r.nations.USA).toBeDefined();
      const usa = r.nations.USA!;
      expect(usa.aircraftLostOnGround).toBeGreaterThan(0);
      expect(usa.aircraftLostOnGround + (lostOnDeck.get(r)!.USA ?? 0)).toBeGreaterThanOrEqual(0.5 * crewedLost(r, 'USA'));
    }
  });
});

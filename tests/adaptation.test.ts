import { beforeAll, describe, expect, it } from 'vitest';
import type { NationId, NodeId, SimEvent } from '../src/core/types';
import { createSession } from '../src/scenarios';
import { duelKey, measureEffect, PAIR_IDS, type Duel, type PairId } from '../src/systems/adaptation';
import { jammedHits } from '../src/systems/c2';

const RUS = 'RUS' as NationId, UKR = 'UKR' as NationId;

describe('adaptation over 180 days of ukraine-2026', () => {
  /** Per duel between Russia and Ukraine, the effect its measure has each day, as the hooks read it. */
  const effect = new Map<string, number[]>();
  const fielded: string[] = [];
  let duels: Record<string, Duel> = {};

  beforeAll(() => {
    const s = createSession('ukraine-2026', 1);
    const perDay = 24 / s.world.dtHours;
    for (let day = 0; day < 180; day++) {
      s.engine.run(s.world, perDay, (_, events: SimEvent[]) => {
        for (const e of events) if (e.type === 'message' && / has fielded /.test(e.text)) fielded.push(e.text);
      });
      for (const pair of PAIR_IDS)
        for (const [user, counter] of [[RUS, UKR], [UKR, RUS]]) {
          const k = duelKey(pair, user, counter);
          (effect.get(k) ?? effect.set(k, []).get(k)!).push(measureEffect(s.world, pair, user, counter));
        }
    }
    duels = s.world.slices.adaptation.duels;
  }, 600_000);

  it('a side fields a counter and the measure it answers loses effect', () => {
    const counters = fielded.filter((t) => !/new generation/.test(t));
    expect(counters.length).toBeGreaterThan(0);
    // Some duel's measure stood above its countered level and was then pushed down by at least a fifth.
    const fell = [...effect].filter(([, xs]) => {
      const peak = xs.indexOf(Math.max(...xs));
      return Math.min(...xs.slice(peak)) <= 0.8 * xs[peak];
    });
    expect(fell.map(([k]) => k)).not.toEqual([]);
  });

  it('a countered measure comes back as a new generation, which restarts the clock', () => {
    expect(fielded.some((t) => /new generation/.test(t))).toBe(true);
    expect(Object.values(duels).some((d) => d.gen > 0)).toBe(true);
  });

  it('notices only what a side lost: no outages, no hunt for hidden cyber access', () => {
    for (const k of [duelKey('cyber_hunting', RUS, UKR), duelKey('cyber_hunting', UKR, RUS)]) expect(duels[k]).toEqual({ stage: 'unnoticed', gen: 0, seen: 0 });
  });
});

describe('the drone-link hook reads the FPV duel', () => {
  it('a new FPV generation gets more drones through the same jamming than one the enemy has countered', () => {
    const s = createSession('ukraine-2026', 1);
    s.engine.run(s.world, 4);
    const jam = s.world.slices.c2.jam[RUS];
    const target = Number(Object.keys(jam).find((n) => jam[Number(n)].drone > 0.3)) as NodeId;
    const lancet = [...s.catalog.munitions.values()].find((m) => m.kind === 'loitering')!;
    const key = duelKey('fpv_jamming' as PairId, UKR, RUS);
    const through = (d: Duel) => {
      s.world.slices.adaptation.duels[key] = d;
      // A new tick for the lookup, so it reads the duel set here.
      s.world.tick++;
      return jammedHits(s.world, target, UKR, lancet, 10_000);
    };
    const countered = through({ stage: 'fielded', gen: 0 });
    const fresh = through({ stage: 'unnoticed', gen: 1, seen: 0 });
    expect(fresh).toBeGreaterThan(countered * 1.05);
  }, 120_000);
});

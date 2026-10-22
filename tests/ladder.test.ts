import { describe, expect, it } from 'vitest';
import { Engine, setAtWar } from '../src/core/engine';
import type { NationId } from '../src/core/types';
import { createSession } from '../src/scenarios';
import { economy, ladderOf, SEA } from '../src/systems/economy';

const n = (id: string) => id as NationId;
const TWN = n('TWN'), USA = n('USA'), CHN = n('CHN'), RUS = n('RUS');

/** A scenario world stepped by the economy alone, a day a tick, with `each` run before every day. */
function economyRun(scenario: string, params?: Record<string, number>) {
  const s = createSession(scenario, 1);
  if (params) s.world.params = { ...s.world.params, ...params };
  const engine = new Engine(s.map, s.catalog, [economy]);
  return {
    s,
    /** Opens the scenario's wars with a full tick, before the economy runs alone. */
    open: () => s.engine.step(s.world),
    days: (k: number, each: () => void = () => {}) => {
      s.world.dtHours = 24;
      for (let d = 0; d < k; d++) {
        each();
        engine.step(s.world);
      }
    },
    cut: (nation: NationId, cutoff: string) => ladderOf(s.world, s.map, nation).find((c) => c.cutoff === cutoff),
  };
}

describe('the workaround ladder', () => {
  it('climbs rung by rung under a blockade of Taiwan, and the blockader then closes the shadow trade', () => {
    const r = economyRun('taiwan-2027');
    const blockade = () => (r.s.world.theater.tradeBlocked[TWN] = 0.9);
    const at: Record<number, NonNullable<ReturnType<typeof r.cut>>> = {};
    for (const day of [14, 60, 150, 360, 420, 540]) {
      r.days(day - (Object.keys(at).map(Number).pop() ?? 0), blockade);
      at[day] = r.cut(TWN, SEA)!;
    }
    expect(at[14].kind).toBe('blockade');
    expect(at[14].coverage, 'no instant workaround for an island').toBe(0);
    // Rationing and price-driven demand cuts first (1-6 months), then blockade runners and neutral
    // suppliers (3-12 months), then substitution at home (1-3 years). An island has no overland rung.
    expect(at[60].rungs.ration).toBeGreaterThan(0);
    expect(at[60].rungs.neutral).toBe(0);
    expect(at[150].rungs.neutral).toBeGreaterThan(0);
    expect(at[150].rungs.substitute).toBe(0);
    expect(at[420].rungs.substitute).toBeGreaterThan(0);
    for (const c of Object.values(at)) expect(c.rungs.overland).toBe(0);
    expect(at[60].coverage).toBeGreaterThan(at[14].coverage);
    expect(at[150].coverage).toBeGreaterThan(at[60].coverage);
    expect(at[360].coverage).toBeGreaterThan(at[150].coverage);
    // Boarding and designations catch up with the runners once the blockade has run a year and more.
    expect(at[540].rungs.neutral).toBeLessThan(at[360].rungs.neutral);
  }, 120_000);

  it('gets energy past a blockade over land borders and through neutral runners, but not into an island', () => {
    const KOR = n('KOR');
    const energyAfter = (params?: Record<string, number>) => {
      const r = economyRun('taiwan-2027', params);
      r.days(270, () => {
        r.s.world.theater.tradeBlocked[TWN] = 0.9;
        r.s.world.theater.tradeBlocked[KOR] = 0.9;
      });
      const e = r.s.world.slices.economy.nations;
      return { twn: e[TWN].supply.energy, kor: e[KOR].supply.energy };
    };
    const none = { 'economy.ladder.rationBlockade': 0, 'economy.ladder.neutralBlockade': 0, 'economy.ladder.neutralIslandBlockade': 0, 'economy.ladder.substituteBlockade': 0, 'economy.ladder.overlandBlockade': 0 };
    const ladder = energyAfter(), stocks = energyAfter(none);
    // South Korea borders North Korea, so its blockade has an overland rung and the full runner rung.
    expect(ladder.kor).toBeGreaterThan(stocks.kor + 0.05);
    // Next to nothing ran the 1944-45 blockade of Japan (USSBS); energy demand restraint is already in the stock draw.
    expect(ladder.twn).toBeGreaterThan(stocks.twn);
    expect(ladder.twn).toBeLessThan(stocks.twn + 0.03);
  }, 120_000);

  it('opens the 2024 sanctions on Russia mature, at the 80% of trade Russia rerouted by 2023', () => {
    const r = economyRun('ukraine-2026');
    r.open();
    r.days(1);
    const c = r.cut(RUS, 'USA')!;
    expect(c.kind).toBe('sanctions');
    expect(c.coverage).toBeCloseTo(0.8, 6);
  }, 120_000);

  it('in a world war the belligerents split one neutral pool, so each gets less than in a war of two', () => {
    const neutralRung = (world: boolean) => {
      const r = economyRun(world ? 'ww3-2027' : 'peace-2027');
      if (world) {
        r.open();
        for (const [a, b] of [['USA', 'CHN'], ['USA', 'RUS'], ['JPN', 'CHN'], ['DEU', 'RUS'], ['FRA', 'RUS'], ['GBR', 'RUS'], ['KOR', 'CHN'], ['AUS', 'CHN'], ['ITA', 'RUS'], ['CAN', 'RUS']])
          setAtWar(r.s.world, n(a), n(b), true);
      } else setAtWar(r.s.world, USA, CHN, true);
      r.days(330);
      const pool = r.s.world.slices.economy.neutralPool;
      return { pool, usa: r.cut(USA, 'CHN')!.rungs.neutral, chn: r.cut(CHN, 'USA')!.rungs.neutral };
    };
    const two = neutralRung(false), all = neutralRung(true);
    expect(two.pool.askUsdB).toBeLessThan(two.pool.offerUsdB);
    expect(all.pool.askUsdB).toBeGreaterThan(all.pool.offerUsdB);
    for (const side of ['usa', 'chn'] as const) {
      expect(all[side]).toBeGreaterThan(0);
      expect(all[side]).toBeLessThan(0.8 * two[side]);
    }
  }, 300_000);
});

import { describe, expect, it } from 'vitest';
import { addFormation } from '../src/core/forces';
import type { NationId, NodeId, SimEvent } from '../src/core/types';
import { initialStockpiles } from '../src/data/industry';
import { economicStress, economy } from '../src/systems/economy';
import { id, testWorld } from '../src/testkit';

const USA = id.nation('USA'), RUS = id.nation('RUS'), JPN = id.nation('JPN'), DEU = id.nation('DEU');

/** A world whose ticks are whole days, so 30-day production reports line up with `months`. */
function dailyWorld(daysPerTick = 1) {
  const t = testWorld([economy]);
  t.world.dtHours = 24 * daysPerTick;
  const events: SimEvent[] = [];
  const days = (n: number) => {
    for (let i = 0; i < n / daysPerTick; i++) events.push(...t.engine.step(t.world));
  };
  /** Runs n 30-day periods and returns, per period, the units reported as `NATION:item`. */
  const months = (n: number): Record<string, number>[] => {
    const out: Record<string, number>[] = [];
    for (let m = 0; m < n; m++) {
      const before = events.length;
      days(30);
      const got: Record<string, number> = {};
      for (const e of events.slice(before)) if (e.type === 'production') got[`${e.nation}:${e.item}`] = (got[`${e.nation}:${e.item}`] ?? 0) + e.count;
      out.push(got);
    }
    return out;
  };
  const series = (ms: Record<string, number>[], key: string) => ms.map((m) => m[key] ?? 0);
  const shortages = (nation: NationId) => events.filter((e) => e.type === 'shortage' && e.nation === nation).map((e) => (e as { what: string }).what);
  return { ...t, events, days, months, series, shortages };
}


describe('economy performance', () => {
  it('steps all 193 nations with 3,000 formations well under the 50 ms budget', () => {
    const t = testWorld([economy]);
    const nations = Object.keys(t.world.nations) as NationId[];
    expect(nations.length).toBe(193);
    for (let i = 0; i < 3_000; i++) {
      const nation = nations[i % nations.length];
      addFormation(t.world, t.catalog, { nation, name: `f${i}`, kind: 'maneuver', echelon: 'brigade', node: t.world.nations[nation].capital as NodeId, equipment: { [id.platform('t_ifv')]: 40 } });
    }
    t.world.pending.push({ type: 'set_mobilization', nation: USA, level: 1 });
    const ctx = t.engine.context(t.world);
    for (let i = 0; i < 20; i++) economy.step(t.world, ctx);
    const ticks = 200;
    const start = performance.now();
    for (let i = 0; i < ticks; i++) economy.step(t.world, ctx);
    const ms = (performance.now() - start) / ticks;
    console.log(`economy.step: ${ms.toFixed(2)} ms/tick (193 nations, 3,000 formations)`);
    expect(ms).toBeLessThan(20);
  });
});

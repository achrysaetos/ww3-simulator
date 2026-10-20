import { describe, expect, it, vi } from 'vitest';
import { Engine } from '../src/core/engine';
import { addFormation } from '../src/core/forces';
import type { NationId, NodeId, SimEvent } from '../src/core/types';
import { initialStockpiles } from '../src/data/industry';
import { economicStress, economy } from '../src/systems/economy';
import { createWorld } from '../src/core/world';
import { loadMap } from '../src/data/load';
import { id, testCatalog, testWorld } from '../src/testkit';

// Several cases step the whole map daily for a simulated year; under a loaded machine they pass 5 s.
vi.setConfig({ testTimeout: 30_000 });

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

describe('economy: mobilization', () => {
  it('ramps war production over months, not days, and only for the nation that mobilizes', () => {
    const t = dailyWorld();
    t.world.pending.push({ type: 'set_mobilization', nation: USA, level: 1 });
    t.days(7);
    expect(t.world.nations[USA].mobilization).toBeGreaterThan(0);
    expect(t.world.nations[USA].mobilization).toBeLessThan(0.1);

    const first = t.months(1);
    const us = t.series(first, 'USA:shell_155'), de = t.series(first, 'DEU:shell_155');
    // Baseline is ~40k/month (US Army, early 2025); one month in, the line has barely moved.
    expect(us[0]).toBeGreaterThan(38_000);
    expect(us[0]).toBeLessThan(44_000);

    const rest = t.months(11);
    const later = t.series(rest, 'USA:shell_155'), deLater = t.series(rest, 'DEU:shell_155');
    expect(later[10]).toBeGreaterThan(1.4 * us[0]);
    expect(later[10]).toBeLessThan(100_000);
    for (let i = 1; i < later.length; i++) expect(later[i]).toBeGreaterThanOrEqual(later[i - 1] * 0.99);
    expect(Math.abs(deLater[10] - de[0]) / de[0]).toBeLessThan(0.02);
  });

  it('finances mobilization with debt that raises economic stress, and leaves a peacetime treasury alone', () => {
    const t = dailyWorld();
    t.world.pending.push({ type: 'set_mobilization', nation: USA, level: 1 });
    t.days(180);
    expect(t.world.nations[USA].treasuryUsdB).toBeLessThan(-1_000);
    expect(t.world.nations[DEU].treasuryUsdB).toBe(0);
    expect(economicStress(t.world, USA)).toBeGreaterThan(economicStress(t.world, DEU) + 0.2);
  });
});

describe('economy: industrial damage', () => {
  it('cuts output in proportion to the population-weighted industry destroyed, and nowhere else', () => {
    const t = dailyWorld();
    const [before] = t.months(1);

    const cells = t.map.nodesOf(USA).sort((a, b) => t.map.popShare[b] - t.map.popShare[a]);
    let destroyed = 0;
    for (const n of cells) {
      if (destroyed >= 0.5) break;
      t.world.theater.infrastructure[n] = 0;
      destroyed += t.map.popShare[n];
    }
    const [after] = t.months(1);
    const us = after['USA:shell_155'] / before['USA:shell_155'];
    expect(us).toBeGreaterThan(0.4);
    expect(us).toBeLessThan(0.55);
    expect(Math.abs(after['RUS:shell_152'] / before['RUS:shell_152'] - 1)).toBeLessThan(0.01);
  });

  it('loses the output of territory an enemy captures', () => {
    const t = dailyWorld();
    const [before] = t.series(t.months(1), 'USA:shell_155');
    const cells = t.map.nodesOf(USA).sort((a, b) => t.map.popShare[b] - t.map.popShare[a]).slice(0, 40);
    const share = cells.reduce((s, n) => s + t.map.popShare[n], 0);
    for (const n of cells) t.world.control[n] = id.nation('CAN');
    const [after] = t.series(t.months(1), 'USA:shell_155');
    expect(after / before).toBeCloseTo(1 - share, 1);
    expect(after).toBeLessThan(before * 0.95);
  });

  it('counts only territory lost after the start: baseline GDP already excludes what was occupied before', () => {
    const map = loadMap();
    const world = createWorld(map);
    const UKR = id.nation('UKR');
    const east = map.nodesOf(UKR).sort((a, b) => map.lon[b] - map.lon[a]);
    const occupied = east.slice(0, Math.round(east.length * 0.2));
    for (const n of occupied) world.control[n] = RUS;
    const engine = new Engine(map, testCatalog(), [economy]);
    engine.init(world);
    engine.run(world, 40);
    expect(world.slices.economy.nations[UKR].gdpIndex).toBeGreaterThan(0.99);

    const next = east.slice(occupied.length, occupied.length + Math.round(east.length * 0.2));
    const lost = next.reduce((s, n) => s + map.popShare[n], 0) / map.nodesOf(UKR).filter((n) => !occupied.includes(n)).reduce((s, n) => s + map.popShare[n], 0);
    for (const n of next) world.control[n] = RUS;
    engine.run(world, 4);
    expect(world.slices.economy.nations[UKR].integrity).toBeCloseTo(1 - lost, 2);
  });
});

describe('economy: blockade', () => {
  it('starves import-dependent Japan of energy in steps as LNG, coal and then oil stocks run out, but barely touches the US', () => {
    const t = dailyWorld();
    t.world.theater.tradeBlocked[JPN] = 0.8;
    t.world.theater.tradeBlocked[USA] = 0.8;
    t.days(7);
    expect(t.world.slices.economy.nations[JPN].supply.energy).toBe(1);

    // LNG (~3 weeks) and coal (~1 month) are gone; ~230 days of strategic oil still cover oil's share.
    t.days(53);
    const mid = t.world.slices.economy.nations[JPN].supply.energy;
    expect(mid).toBeLessThan(0.8);
    expect(mid).toBeGreaterThan(0.5);
    expect(t.shortages(JPN)).toContain('energy');

    // The oil reserve covers its share of a 70% shortfall for ~11 months.
    t.days(340);
    const jp = t.world.slices.economy.nations[JPN], us = t.world.slices.economy.nations[USA];
    expect(t.shortages(JPN)).toEqual(expect.arrayContaining(['energy', 'food']));
    expect(jp.supply.energy).toBeLessThan(0.4);
    expect(jp.gdpIndex).toBeLessThan(0.6);
    expect(economicStress(t.world, JPN)).toBeGreaterThan(0.4);

    expect(t.shortages(USA)).not.toContain('energy');
    expect(t.shortages(USA)).not.toContain('food');
    expect(us.supply.energy).toBe(1);
    expect(us.gdpIndex).toBeGreaterThan(0.9);
    expect(economicStress(t.world, USA)).toBeLessThan(0.1);
  });
});

describe('economy: sanctions', () => {
  const bloc = ['USA', 'JPN', 'KOR', 'TWN', 'DEU', 'NLD', 'GBR', 'FRA'];

  it('cuts a sanctioned nation off from foreign chips once its stockpile is gone: missiles fall, shells do not', () => {
    const t = dailyWorld(3);
    for (const s of bloc) t.world.pending.push({ type: 'sanction', nation: id.nation(s), target: RUS, on: true });
    const ms = t.months(20);
    const kh = t.series(ms, 'RUS:kh101'), shells = t.series(ms, 'RUS:shell_152');
    expect(t.world.relations['RUS|USA'].sanctions).toBe(true);
    // Stockpiled microelectronics keep the line going for the first months.
    expect(kh[1]).toBeGreaterThanOrEqual(kh[0] - 1);
    expect(kh[19]).toBeLessThan(0.75 * kh[0]);
    expect(t.shortages(RUS)).toContain('semiconductors');
    expect(Math.abs(shells[19] / shells[0] - 1)).toBeLessThan(0.02);
  });

  it('does nothing to a nation nobody sanctions, and lifting sanctions restores supply', () => {
    const t = dailyWorld(3);
    const kh = t.series(t.months(12), 'RUS:kh101');
    expect(Math.abs(kh[11] - kh[0])).toBeLessThanOrEqual(1);
    expect(t.shortages(RUS)).toEqual([]);

    for (const s of bloc) t.world.pending.push({ type: 'sanction', nation: id.nation(s), target: RUS, on: true });
    // Russia's ~9 months of stockpiled chips drain at the ~55% shortfall in about 16 months.
    t.days(520);
    expect(t.world.slices.economy.nations[RUS].supply.semiconductors).toBeLessThan(0.6);
    for (const s of bloc) t.world.pending.push({ type: 'sanction', nation: id.nation(s), target: RUS, on: false });
    t.days(2);
    expect(t.world.slices.economy.nations[RUS].supply.semiconductors).toBe(1);
  });
});

describe('economy: military fuel', () => {
  it('keeps an oil producer at war fuelled beyond its peacetime budget, without overfilling depots in peace', () => {
    const t = dailyWorld();
    t.world.pending.push({ type: 'set_mobilization', nation: RUS, level: 0.35 });
    const rus = t.world.nations[RUS], de = t.world.nations[DEU];
    // Russian forces in ukraine-2026 draw ~16-18k t/day; the defence budget buys ~4k t/day of it.
    rus.bulk.fuel = 327_000;
    let short = 0;
    for (let d = 0; d < 120; d++) {
      rus.bulk.fuel -= 17_000;
      if (rus.bulk.fuel < 0) short++;
      t.days(1);
    }
    expect(short).toBe(0);
    expect(rus.bulk.fuel).toBeGreaterThan(100_000);

    const depot = 6 * ((de.stats.milexUsd ?? 0) / 1e6) * 12 / 12;
    expect(de.bulk.fuel).toBeLessThanOrEqual(depot * 1.001);
  });
});

describe('economy: manpower', () => {
  it('trains reserves under mobilization up to a ceiling set by working-age population, and not in peacetime', () => {
    const t = testWorld([economy]);
    t.world.dtHours = 24 * 7;
    const POL = id.nation('POL');
    const pol = t.world.nations[POL], de = t.world.nations[DEU];
    const deStart = de.reserves, polStart = pol.reserves;
    t.world.pending.push({ type: 'set_mobilization', nation: POL, level: 1 });

    t.engine.run(t.world, 4);
    // A month in, most call-ups are still in the training pipeline, not yet reserves.
    const trained = pol.reserves - polStart, training = t.world.slices.economy.nations[POL].inTraining;
    expect(training).toBeGreaterThan(0);
    expect(trained).toBeLessThan(0.5 * (trained + training));

    t.engine.run(t.world, 23);
    const halfYear = pol.reserves - polStart;
    expect(halfYear).toBeGreaterThan(0.005 * pol.population);

    t.engine.run(t.world, 52 * 8);
    const ceiling = 0.12 * pol.population * ((pol.stats.workingAgePct ?? 65) / 65);
    const underArms = pol.reserves + t.world.slices.economy.nations[POL].inTraining;
    expect(underArms).toBeLessThanOrEqual(ceiling * 1.001);
    expect(underArms).toBeGreaterThan(ceiling * 0.95);
    const plateau = pol.reserves;
    t.engine.run(t.world, 52);
    expect(pol.reserves - plateau).toBeLessThan(0.01 * plateau);

    expect(de.reserves).toBe(deStart);
  });
});

describe('economy: produce command', () => {
  it('holds a line to an ordered rate, and refuses items a nation has no industry for', () => {
    const t = dailyWorld();
    t.world.pending.push({ type: 'produce', nation: USA, item: id.munition('pac3_mse'), ratePerMonth: 10 });
    t.world.pending.push({ type: 'produce', nation: USA, item: id.platform('t_mbt'), ratePerMonth: 50 });
    const pac3 = t.series(t.months(2), 'USA:pac3_mse');
    expect(pac3[1]).toBeGreaterThanOrEqual(9);
    expect(pac3[1]).toBeLessThanOrEqual(11);
    expect(t.world.nations[USA].stockpile[id.platform('t_mbt')]).toBeUndefined();
    expect(t.events.some((e) => e.type === 'message' && e.text.includes('t_mbt'))).toBe(true);
  });
});


describe('economy: initial stockpiles', () => {
  it('puts missiles in the stockpile and shells into bulk ammunition tons', () => {
    const { world } = testWorld();
    const us = initialStockpiles(world.nations[USA]);
    expect(us.stockpile[id.munition('tomahawk')]).toBeGreaterThan(1_000);
    expect(us.stockpile[id.munition('pac3_mse')]).toBeGreaterThan(1_000);
    expect(us.stockpile[id.munition('shell_155')]).toBeUndefined();
    // 1.5M rounds at ~60 kg each.
    expect(us.bulk.ammo).toBeGreaterThan(90_000);
    expect(us.bulk.fuel).toBeGreaterThan(0);
    expect(initialStockpiles(world.nations[id.nation('ISL')]).stockpile).toEqual({});
  });
});

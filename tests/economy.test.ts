import { describe, expect, it, vi } from 'vitest';
import { Engine, relationMut } from '../src/core/engine';
import { addFormation } from '../src/core/forces';
import type { NationId, NodeId, SimEvent } from '../src/core/types';
import { initialStockpiles } from '../src/data/industry';
import { economicStress, economy } from '../src/systems/economy';
import { sanctionDecisions } from '../src/systems/ai/strategy';
import { profiles } from '../src/data/nations';
import { createWorld } from '../src/core/world';
import { loadMap } from '../src/data/load';
import { loadCatalog } from '../src/data/catalog';
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
    // Stocks cover the first week; rationing trims non-priority use as LNG runs down.
    t.days(7);
    expect(t.world.slices.economy.nations[JPN].supply.energy).toBeGreaterThan(0.9);
    expect(t.shortages(JPN)).not.toContain('energy');

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

describe('economy: blockade by geography', () => {
  it('cuts an island nation off far more than one trading over land', () => {
    const t = dailyWorld();
    t.world.theater.tradeBlocked[JPN] = 0.8;
    t.world.theater.tradeBlocked[DEU] = 0.8;
    t.days(2);
    const jp = t.world.slices.economy.nations[JPN].tradeLoss, de = t.world.slices.economy.nations[DEU].tradeLoss;
    expect(jp).toBeGreaterThan(0.75);
    expect(de).toBeLessThan(0.5 * jp);
  });
});

describe('economy: allied ammunition', () => {
  it('tops up a treaty ally at war from a partner rich in shells, and nothing flows from states with no obligation', () => {
    const t = dailyWorld();
    const EST = id.nation('EST'), CHN = id.nation('CHN');
    const est = t.world.nations[EST];
    t.add({ nation: EST, name: 'Estonian brigade', kind: 'maneuver', echelon: 'brigade', node: est.capital, equipment: { [id.platform('t_mbt')]: 30 }, personnel: 4_000 });
    t.war('RUS', 'EST');
    est.bulk.ammo = 0;
    t.world.nations[USA].bulk.ammo = 160_000;
    t.days(10);
    const allied = t.world.slices.economy.allied;
    expect(allied['USA>EST']).toBeGreaterThan(0);
    expect(est.bulk.ammo).toBeGreaterThan(0);
    // Ten days at most 10% a month of the US stock.
    expect(allied['USA>EST']).toBeLessThanOrEqual(160_000 * 0.1 * (10 / 30.4) * 1.01);
    expect(Object.keys(allied).some((k) => k.startsWith(`${CHN}>`) || k.startsWith(`${RUS}>`))).toBe(false);
  });
});

describe('economy: grid strikes', () => {
  it('cuts the energy a nation gets when strikes wreck its grid, whatever fuel it holds, and restores it on repair', () => {
    const t = dailyWorld();
    const UKR = id.nation('UKR');
    const cells = t.map.nodesOf(UKR);
    const power: Record<number, number> = {};
    (t.world.theater as { power?: Record<number, number> }).power = power;
    for (const n of cells) power[n] = 0.5;
    t.days(2);
    const e = t.world.slices.economy.nations[UKR];
    // Half the grid gone takes about half of electricity, ~20% of final energy use.
    expect(e.supply.energy).toBeGreaterThan(0.85);
    expect(e.supply.energy).toBeLessThan(0.95);
    expect(t.world.slices.economy.nations[RUS].supply.energy).toBe(1);
    // Grid damage cuts energy, not industrial integrity.
    expect(t.world.slices.economy.nations[UKR].integrity).toBe(1);
    for (const n of cells) delete power[n];
    t.days(1);
    expect(e.supply.energy).toBe(1);
  });
});

describe('economy: energy price', () => {
  it('a Hormuz closure roughly doubles the world energy price, costing importers output and exporters none', () => {
    const t = dailyWorld();
    t.days(2);
    expect(t.world.slices.economy.energyPrice).toBe(1);
    for (const g of ['SAU', 'ARE', 'IRQ', 'KWT', 'QAT', 'IRN']) t.world.theater.tradeBlocked[id.nation(g)] = 0.9;
    t.days(10);
    const price = t.world.slices.economy.energyPrice;
    // EIA/IEA closure scenarios: USD 150-200/bbl from ~USD 75.
    expect(price).toBeGreaterThan(1.6);
    expect(price).toBeLessThan(3);
    const jp = t.world.slices.economy.nations[JPN];
    expect(jp.supply.energy).toBeGreaterThan(0.95);
    expect(jp.gdpIndex).toBeLessThan(0.99);
    expect(t.world.slices.economy.nations[USA].gdpIndex).toBe(1);
  });
});

describe('economy: military aid', () => {
  it('ships donor stocks to a nation at war, and stops when the donor fights the recipient or the war ends', () => {
    const t = dailyWorld();
    const UKR = id.nation('UKR'), PRK = id.nation('PRK');
    const ukr = t.world.nations[UKR], us = t.world.nations[USA];
    us.stockpile[id.munition('pac3_mse')] = 1_000;
    us.bulk.ammo = 100_000;
    t.days(30);
    expect(ukr.stockpile[id.munition('pac3_mse')]).toBeUndefined();

    t.war('RUS', 'UKR');
    t.world.nations[PRK].bulk.ammo = 480_000;
    const ammo0 = ukr.bulk.ammo, rus0 = t.world.nations[RUS].bulk.ammo;
    t.days(360);
    // ~100 PAC-3 a year from the US; ~2.5M North Korean shells a year (~150 kt) to Russia.
    expect(ukr.stockpile[id.munition('pac3_mse')]).toBeGreaterThan(90);
    expect(ukr.stockpile[id.munition('pac3_mse')]).toBeLessThan(110);
    expect(ukr.bulk.ammo - ammo0).toBeGreaterThan(30_000);
    expect(t.world.nations[RUS].bulk.ammo - rus0).toBeGreaterThan(100_000);
    expect(t.world.slices.economy.aid['PRK>RUS:shell_152'].delivered).toBeGreaterThan(2_200_000);

    const before = ukr.stockpile[id.munition('pac3_mse')];
    t.war('USA', 'UKR');
    t.days(60);
    expect(ukr.stockpile[id.munition('pac3_mse')]).toBe(before);
  });

  it("keeps Ukraine's 2024 ammunition inflow: home-made artillery and mortar rounds plus partners' shells", () => {
    const t = dailyWorld();
    const UKR = id.nation('UKR');
    const ukr = t.world.nations[UKR];
    t.war('RUS', 'UKR');
    const ammo0 = ukr.bulk.ammo;
    t.days(360);
    // ~2.4M rounds made at home in 2024 (~55 kt) and ~2.5M+ partner rounds, 1.5M of them via the
    // Czech initiative (~150 kt): a few hundred tons a day, against ~75 kt before either was counted.
    const inflow = ukr.bulk.ammo - ammo0;
    expect(inflow).toBeGreaterThan(150_000);
    expect(inflow).toBeLessThan(260_000);
    expect(t.world.slices.economy.aid['CZE>UKR:shell_155:market'].delivered).toBeGreaterThan(1_450_000);
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

describe('ai: sanctions policy', () => {
  it('has the West, and the EU as one bloc, sanction a state at war while its friends and neutrals trade on', () => {
    const world = createWorld(loadMap(), { profiles });
    expect(sanctionDecisions(world)).toEqual([]);
    relationMut(world, RUS, id.nation('UKR')).atWar = true;
    const by = sanctionDecisions(world).filter((c) => c.type === 'sanction' && c.target === RUS).map((c) => c.nation);
    expect(by).toEqual(expect.arrayContaining(['USA', 'GBR', 'JPN', 'DEU', 'ITA', 'HUN'].map(id.nation)));
    for (const n of ['CHN', 'IND', 'TUR', 'BLR', 'UKR']) expect(by).not.toContain(id.nation(n));
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

  it('fills depots no further than their peacetime capacity however far a nation mobilizes', () => {
    const t = dailyWorld();
    const TWN = id.nation('TWN');
    const tw = t.world.nations[TWN];
    t.world.pending.push({ type: 'set_mobilization', nation: TWN, level: 1 });
    t.world.theater.tradeBlocked[TWN] = 1;
    const depot = 6 * ((tw.stats.milexUsd ?? 0) / 1e6) * 12 / 12;
    let peak = 0;
    for (let d = 0; d < 90; d++) {
      t.days(1);
      peak = Math.max(peak, tw.bulk.fuel);
    }
    expect(peak).toBeLessThanOrEqual(depot * 1.001);
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

describe('economy: draft pool', () => {
  it("holds Ukraine's call-up to what its draft law yields at a high level, where a broad law would draft far more", () => {
    const t = testWorld([economy]);
    t.world.dtHours = 24;
    const UKR = id.nation('UKR'), POL = id.nation('POL');
    const e = t.world.slices.economy.nations;
    for (const n of [UKR, POL]) {
      t.world.nations[n].mobilization = 0.8;
      t.world.pending.push({ type: 'set_mobilization', nation: n, level: 0.8 });
    }
    t.engine.run(t.world, 30);
    const perMillion = (n: NationId) => e[n].recruited / (t.world.nations[n].population / 1e6);
    // Ukrainian MoD 2024: ~25-35k a month; band as in tests/realism-economy-ukraine.
    expect(e[UKR].recruited).toBeGreaterThanOrEqual(15_000);
    expect(e[UKR].recruited).toBeLessThanOrEqual(45_000);
    expect(perMillion(POL)).toBeGreaterThan(1.3 * perMillion(UKR));
  });

  it('calls up no one once the pool is spent, however high the mobilization', () => {
    const t = testWorld([economy]);
    t.world.dtHours = 24 * 7;
    const POL = id.nation('POL');
    const e = t.world.slices.economy.nations[POL];
    e.draftPool = 10_000;
    t.world.pending.push({ type: 'set_mobilization', nation: POL, level: 1 });
    t.engine.run(t.world, 12);
    expect(e.recruited).toBe(10_000);
    expect(e.draftPool).toBe(0);
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

  /** A daily world on the real catalog, whose items name real producers and unit costs. */
  function realWorld() {
    const map = loadMap();
    const engine = new Engine(map, loadCatalog(), [economy]);
    const world = createWorld(map, { seed: 1 });
    world.dtHours = 24;
    engine.init(world);
    return { engine, world };
  }

  it('builds a new line only as fast as the nation can put up plant, and charges the treasury for every unit', () => {
    const { engine, world } = realWorld();
    const b21 = id.platform('b21');
    const treasury0 = world.nations[USA].treasuryUsdB;
    world.pending.push({ type: 'produce', nation: USA, item: b21, ratePerMonth: 158 });
    engine.run(world, 360);
    const built = world.nations[USA].stockpile[b21] ?? 0;
    // A first B-21 line is a few airframes a year at most, and none come in the first year of a greenfield plant ramp.
    expect(built).toBeLessThanOrEqual(5);
    const e = world.slices.economy.nations[USA];
    expect(e.orderSpendUsdB).toBeCloseTo((built * 692) / 1000, 6);
    expect(treasury0 - world.nations[USA].treasuryUsdB).toBeGreaterThanOrEqual(e.orderSpendUsdB - 1e-9);
  });

  it('charges for ordered shells beyond what the defence budget buys, and nothing for the budgeted rate', () => {
    const { engine, world } = realWorld();
    const UKR = id.nation('UKR');
    const shell152 = id.munition('shell_152');
    world.pending.push({ type: 'produce', nation: UKR, item: shell152, ratePerMonth: 1_000_000 });
    engine.run(world, 90);
    const e = world.slices.economy.nations[UKR];
    const delivered = e.delivered[shell152] ?? 0;
    // 0.1% of Ukraine's manufacturing value added buys a 152 mm plant of a few hundred thousand rounds a year at most.
    expect(delivered).toBeLessThan(50_000);
    expect(e.orderSpendUsdB).toBeCloseTo((delivered * 0.002) / 1000, 6);
    const usa = world.slices.economy.nations[USA];
    expect(usa.orderSpendUsdB).toBe(0);
  });

  it('refuses a rate that is negative or not a number', () => {
    const { engine, world } = realWorld();
    const pac3 = id.munition('pac3_mse');
    const line = world.slices.economy.nations[USA].lines[pac3];
    for (const ratePerMonth of [Number.NaN, -5, Number.POSITIVE_INFINITY]) world.pending.push({ type: 'produce', nation: USA, item: pac3, ratePerMonth });
    const events = engine.step(world);
    expect(line.orderPerMonth).toBeNull();
    expect(events.filter((ev) => ev.type === 'message' && ev.text.includes('rate of zero or more')).length).toBe(3);
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

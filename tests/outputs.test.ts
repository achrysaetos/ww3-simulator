import { beforeAll, describe, expect, it } from 'vitest';
import { runWithOutputs } from '../src/cli/outputs-run';
import type { NationId, World } from '../src/core/types';
import { runOne } from '../src/forecast';
import { outputRanges, outputRows, outputsOf, OutputsRecorder, sampleOutputs, type ItemRace, type Outputs, type RaceItem } from '../src/outputs';
import { createSession } from '../src/scenarios';
import { outputsView } from '../src/ui/outputs/view';
import { SnapshotEncoder } from '../src/ui/snapshot';

const RUS = 'RUS' as NationId, UKR = 'UKR' as NationId, USA = 'USA' as NationId, DEU = 'DEU' as NationId, POL = 'POL' as NationId;
const PER_DAY = 4;

const race = (o: Outputs, n: NationId, item: RaceItem): ItemRace => {
  const r = o.nations[n]?.race.find((x) => x.item === item);
  if (!r) throw new Error(`${n} has no ${item} row on day ${o.day}`);
  return r;
};

/**
 * One ukraine-2026 run, read at day 30 and day 45, plus a branch at day 30 in which the large
 * non-Western economies join the sanctions on Russia.
 */
describe('outputs of ukraine-2026', () => {
  let s: ReturnType<typeof createSession>;
  let start: Outputs, d30: Outputs, d45: Outputs, sanctioned: Outputs;
  let fork: World;

  beforeAll(() => {
    s = createSession('ukraine-2026', 1);
    const rec = new OutputsRecorder(s.catalog);
    rec.observe(s.world);
    start = rec.outputs(s.world, s.map);
    const run = (days: number) => {
      for (let i = 0; i < days * PER_DAY; i++) {
        s.engine.step(s.world);
        rec.observe(s.world);
      }
    };
    run(30);
    d30 = rec.outputs(s.world, s.map);
    fork = structuredClone(s.world);
    const samples = [...rec.samples];
    run(15);
    d45 = rec.outputs(s.world, s.map);

    for (const by of ['CHN', 'IND', 'TUR', 'BRA', 'ARE', 'KAZ'] as NationId[]) fork.pending.push({ type: 'sanction', nation: by, target: RUS, on: true });
    for (let i = 0; i < PER_DAY; i++) s.engine.step(fork);
    sanctioned = outputsOf(fork, s.map, [...samples, sampleOutputs(fork, s.catalog)]);
  }, 300_000);

  it('counts civilian casualties within the order of OHCHR verified tolls', () => {
    // OHCHR verified 2,088 civilians killed in Ukraine in 2024 and more in 2025 (about 6-8 a day),
    // with three to five injured for each death. One a day to fifty a day spans the war's quiet
    // and its worst months outside the 2022 sieges.
    const perDay = (d45.nations[UKR].humanitarian.civiliansKilled - start.nations[UKR].humanitarian.civiliansKilled) / 45;
    expect(perDay).toBeGreaterThan(1);
    expect(perDay).toBeLessThan(50);
    expect(d45.nations[UKR].humanitarian.civiliansInjured).toBeGreaterThan(d45.nations[UKR].humanitarian.civiliansKilled);
  });

  it('counts military killed and wounded within the order of UK Defence Intelligence estimates', () => {
    // UK MoD daily updates put Russian casualties at ~1,000-1,500 a day through 2024-25.
    const perDay = (n: NationId) => d45.nations[n].humanitarian.militaryCasualties / 45;
    expect(start.nations[RUS]?.humanitarian.militaryCasualties ?? 0).toBe(0);
    expect(perDay(RUS)).toBeGreaterThan(300);
    expect(perDay(RUS)).toBeLessThan(3000);
    expect(perDay(UKR)).toBeGreaterThan(100);
    expect(perDay(UKR)).toBeLessThan(3000);
  });

  it('counts the displaced within the order of UNHCR and IOM figures', () => {
    // UNHCR: ~6.9M refugees from Ukraine worldwide in 2025, ~1.2M of them in Germany and ~1M in
    // Poland; IOM: ~3.7M displaced inside Ukraine.
    const h = d45.nations[UKR].humanitarian;
    expect(h.refugees).toBeGreaterThan(3e6);
    expect(h.refugees).toBeLessThan(12e6);
    expect(h.idps).toBeGreaterThan(1.5e6);
    expect(h.idps).toBeLessThan(10e6);
    expect(h.idps + h.refugees).toBeGreaterThanOrEqual(start.nations[UKR].humanitarian.idps + start.nations[UKR].humanitarian.refugees);
    for (const host of [DEU, POL]) {
      const n = d45.hosts.find((x) => x.nation === host)?.refugees ?? 0;
      expect(n, host).toBeGreaterThan(5e5);
      expect(n, host).toBeLessThan(2.5e6);
    }
  });

  it('races shell production against consumption within the order of CSIS, IISS and US Army figures', () => {
    const shells = (n: NationId) => race(d45, n, 'shells');
    // Russia made ~3-4M rounds a year by 2024-25 (Estonian intelligence, CSIS; Rheinmetall up to 4.5M).
    expect(shells(RUS).producedPerMonth * 12).toBeGreaterThan(2e6);
    expect(shells(RUS).producedPerMonth * 12).toBeLessThan(6e6);
    // US 155 mm output reached ~40k a month in early 2025 (US Army).
    expect(shells(USA).producedPerMonth).toBeGreaterThan(2e4);
    expect(shells(USA).producedPerMonth).toBeLessThan(1e5);
    // Russia fired ~10k rounds a day in 2024 (down from 20k+ in 2022) and Ukraine a third to a half as many.
    expect(shells(RUS).usedPerMonth / 30).toBeGreaterThan(5e3);
    expect(shells(RUS).usedPerMonth / 30).toBeLessThan(4e4);
    expect(shells(UKR).usedPerMonth / 30).toBeGreaterThan(1e3);
    expect(shells(UKR).usedPerMonth / 30).toBeLessThan(1.5e4);
    // Russia out-produces Ukraine in shells several times over; partners close part of the gap.
    expect(shells(RUS).producedPerMonth).toBeGreaterThan(3 * shells(UKR).producedPerMonth);
    expect(shells(UKR).aidPerMonth).toBeGreaterThan(shells(UKR).producedPerMonth);
    expect(race(d45, RUS, 'shells').monthly[0]).toMatchObject({ day: 30 });
  });

  it('projects when a falling stock will run dry, and reports the day it does', () => {
    const drones = race(d30, UKR, 'drones');
    expect(drones.zeroDay).not.toBeNull();
    expect(drones.zeroDay!).toBeLessThan(45);
    const later = race(d45, UKR, 'drones');
    expect(later.stock).toBeLessThan(1);
    expect(later.ranOutDay).not.toBeNull();
    expect(later.ranOutDay!).toBeGreaterThan(30);
    const interceptors = race(d30, UKR, 'interceptors');
    expect(interceptors.stock).toBeGreaterThan(0);
    expect(interceptors.zeroDay).toBeGreaterThan(30);
    expect(race(d45, UKR, 'interceptors').stock).toBeLessThan(interceptors.stock!);
  });

  it('reads sanctions workarounds from the trade and oil model', () => {
    const ids = (n: NationId, o = d45) => o.nations[n]?.workarounds.map((w) => w.id) ?? [];
    expect(ids(RUS)).toEqual(['trade_rerouting', 'dual_use_imports', 'shadow_fleet', 'foreign_arms']);
    expect(ids(UKR)).toEqual(['foreign_arms']);
    expect(ids(DEU)).toEqual([]);
    const trade = d45.nations[RUS].workarounds.find((w) => w.id === 'trade_rerouting')!;
    expect(trade.level).toBeCloseTo(1 - s.world.slices.economy.nations[RUS].tradeLoss, 6);
    // Western sanctions cut Russia's trade but rerouting holds most of it (Bank of Russia: goods imports near 2021 levels by 2023).
    expect(trade.level).toBeLessThan(1);
    expect(trade.status).toBe('holding');
    expect(d45.nations[RUS].workarounds.find((w) => w.id === 'foreign_arms')!.level).toBeGreaterThan(0.9);

    // China, India, Turkey, Brazil, the UAE and Kazakhstan joining in leave far fewer routes around the Western packages.
    const before = d30.nations[RUS].workarounds.find((w) => w.id === 'trade_rerouting')!;
    const after = sanctioned.nations[RUS].workarounds.find((w) => w.id === 'trade_rerouting')!;
    expect(after.level).toBeCloseTo(1 - fork.slices.economy.nations[RUS].tradeLoss, 6);
    expect(after.level).toBeLessThan(before.level - 0.03);
    expect(after.detail).toMatch(/^4[0-9] states sanction it/);
  });

  it('gives the viewer its own stocks but never the enemy\'s', () => {
    const v = outputsView(s.world, d45, UKR);
    expect(v.mine[0]).toBe(UKR);
    expect(v.enemies).toContain(RUS);
    expect(v.nations[UKR].humanitarian.needs).not.toBeNull();
    expect(v.nations[RUS].humanitarian.needs).toBeNull();
    for (const r of v.nations[RUS].race) {
      expect(r.zeroDay, r.item).toBeNull();
      if (r.item !== 'shells') expect([r.stock, r.usedPerMonth], r.item).toEqual([null, null]);
    }
    expect(v.nations[UKR].race.find((r) => r.item === 'interceptors')?.stock).toBeGreaterThan(0);
  });

  it('flattens to rows and p10/p50/p90 ranges', () => {
    const rows = outputRows(d45, [RUS, UKR]);
    const key = (k: string) => rows.find((r) => r.key === k)?.value;
    expect(key('UKR civilians_killed')).toBe(d45.nations[UKR].humanitarian.civiliansKilled);
    expect(key('UKR drones_zero_day')).toBe(race(d45, UKR, 'drones').ranOutDay);
    const ranges = outputRanges([rows, outputRows(d30, [RUS, UKR]), rows]);
    const killed = ranges.find((r) => r.key === 'UKR civilians_killed')!;
    expect(killed.runs).toBe(3);
    expect(killed.p50).toBe(d45.nations[UKR].humanitarian.civiliansKilled);
    expect(killed.p10).toBeLessThan(killed.p90);
  });

  it('reports who leads the race to produce and the race to adapt, and each cut-off\'s workaround coverage', () => {
    const rows = outputRows(d45, [RUS, UKR]);
    const key = (k: string) => rows.find((r) => r.key === k)?.value;
    // Russia out-builds Ukraine several times over in shells, missiles and drones (RUSI, ISW 2024-25).
    expect(key('RUS production_edge')).toBeGreaterThan(0.3);
    expect(key('UKR production_edge')).toBeLessThan(-0.3);
    // With one enemy, one side's adaptation edge is the other's loss.
    expect(key('RUS adaptation_edge')).toBeCloseTo(-key('UKR adaptation_edge')!, 9);
    // The 2024 Western sanctions open mature: 80% of the cut supply made good (Bank of Russia BoP).
    expect(key('RUS coverage_USA')).toBeCloseTo(0.8, 6);
    expect(d45.nations[RUS].ladder.find((c) => c.cutoff === 'USA')?.kind).toBe('sanctions');
  });
});

describe('reading outputs leaves the run alone', () => {
  it('a run sampled every tick ends in the same World as one never sampled', () => {
    const a = createSession('ukraine-2026', 3), b = createSession('ukraine-2026', 3);
    const rec = new OutputsRecorder(a.catalog, 6);
    for (let i = 0; i < 8; i++) {
      a.engine.step(a.world);
      rec.observe(a.world);
      rec.outputs(a.world, a.map);
      b.engine.step(b.world);
    }
    expect(JSON.stringify(a.world)).toBe(JSON.stringify(b.world));
  }, 60_000);

  it('the ensemble pass gives the same metrics as forecast runOne', () => {
    const input = { world: 'ukraine-2026', ticks: 8, runs: [{ seed: 2 }], metrics: ['territory_changed', 'casualties:RUS', 'ground_km2:RUS'] };
    const ours = runWithOutputs(input, input.runs[0], [RUS, UKR]);
    expect(ours.result).toEqual(runOne(input, input.runs[0]));
    expect(ours.rows.some((r) => r.key === 'RUS military_casualties')).toBe(true);
  }, 60_000);

  it('counts no drones in magazines once every launcher that fires them is gone', () => {
    const t = createSession('ukraine-2026', 1);
    const drones = () => sampleOutputs(t.world, t.catalog, [UKR]).nations[UKR].stock.drones ?? 0;
    const lyutyi = Object.values(t.world.formations).filter((f) => f.nation === UKR && (f.magazine as Record<string, number>).lyutyi > 0);
    const loaded = lyutyi.reduce((a, f) => a + (f.magazine as Record<string, number>).lyutyi, 0);
    expect(loaded).toBeGreaterThan(0);
    const before = drones();
    for (const f of Object.values(t.world.formations))
      if (f.nation === UKR) for (const pid of Object.keys(f.equipment)) if (t.catalog.platform(pid as never).loadout.some((l) => l.munition === 'lyutyi')) (f.equipment as Record<string, number>)[pid] = 0;
    const warehoused = (t.world.nations[UKR].stockpile as Record<string, number>).lyutyi ?? 0;
    expect(drones()).toBe(before - loaded - warehoused);
  });

  it('snapshots carry the War Cost reading once a game day', () => {
    const t = createSession('ukraine-2026', 1);
    t.world.nations[UKR].controlledBy = 'human';
    const enc = new SnapshotEncoder(t.map.nationIds, t.catalog, t.map.size);
    const sent: number[] = [];
    for (let i = 0; i <= 8; i++) {
      if (i) enc.collect(t.engine.step(t.world));
      if (enc.encode(t.world, t.map, { nation: UKR }).outputs) sent.push(t.world.tick);
    }
    expect(sent).toEqual([0, 4, 8]);
  }, 60_000);
});

/**
 * The race's run-out day projects the trailing month's net use in a straight line. Real stocks do not
 * fall in one: air-defence fire comes in bursts, the AI holds a reserve back, and a stock can empty at
 * once when its last launcher is destroyed. No straight-line, short-window or decaying burn rate is
 * right within a fixed tolerance across seeds; the straight line is a sound early warning.
 */
describe('the run-out projection on ukraine-2026, seeds 1-3', () => {
  const HORIZON = 30, LATE = 10, AT = [10, 15, 20, 25, 30];
  it(`flags every stock that runs dry within ${HORIZON} days, never more than ${LATE} days after it does`, () => {
    let warned = 0;
    for (const seed of [1, 2, 3]) {
      const s = createSession('ukraine-2026', seed);
      const rec = new OutputsRecorder(s.catalog);
      rec.observe(s.world);
      const projected = new Map<number, Outputs>();
      const stock: Record<string, number>[] = [];
      for (let day = 1; day <= AT[AT.length - 1] + HORIZON; day++) {
        for (let i = 0; i < PER_DAY; i++) {
          s.engine.step(s.world);
          rec.observe(s.world);
        }
        if (AT.includes(day)) projected.set(day, rec.outputs(s.world, s.map));
        const now = sampleOutputs(s.world, s.catalog, [RUS, UKR]).nations;
        stock[day] = Object.fromEntries([RUS, UKR].flatMap((n) => Object.entries(now[n].stock).map(([item, k]) => [`${n}:${item}`, k])));
      }
      for (const [day, o] of projected)
        for (const n of [RUS, UKR])
          for (const r of o.nations[n].race) {
            if (r.stock === null || r.stock < 1) continue;
            let dry: number | undefined;
            for (let d = day + 1; d <= day + HORIZON && dry === undefined; d++) if ((stock[d][`${n}:${r.item}`] ?? 0) < 1) dry = d;
            if (dry === undefined) continue;
            const label = `seed ${seed}: ${n} ${r.item} seen on day ${day}, dry on day ${dry}`;
            expect(r.zeroDay, label).not.toBeNull();
            expect(r.zeroDay!, label).toBeLessThanOrEqual(day + HORIZON);
            expect(dry, label).toBeGreaterThanOrEqual(r.zeroDay! - LATE);
            warned++;
          }
    }
    expect(warned).toBeGreaterThan(0);
  }, 900_000);
});

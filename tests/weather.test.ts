import { describe, expect, it } from 'vitest';
import type { NationId, World } from '../src/core/types';
import { jsonViolations } from '../src/scenarios/save';
import { buildPicture } from '../src/systems/air/picture';
import { applyLandOrder, landMovement } from '../src/systems/land';
import { bringUpToDate, regionOf, weather } from '../src/systems/weather';
import { nightHours } from '../src/systems/weather/climate';
import { airSortieFactor, amphibiousFactor, carrierFactor, exposureRate, groundFactor, smallCraftFactor } from '../src/systems/weather/effects';
import { id, testWorld } from '../src/testkit';

type Field = 'mud' | 'frozen' | 'waveM' | 'cyclone' | 'cloud';
type Sample = Record<Field, number>;
const FIELDS: Field[] = ['mud', 'frozen', 'waveM', 'cyclone', 'cloud'];

/** Daily weather at `regions` over a year from 1 January, for seeds 1-3, and per-month means of any reading of it. */
function simulateYear(year: number, regions: number[]) {
  const days: { month: number; at: Map<number, Sample> }[] = [];
  for (const seed of [1, 2, 3]) {
    const world = { seed, tick: 0, dtHours: 24, startDate: `${year}-01-01T00:00:00Z`, slices: {} } as unknown as World;
    for (let d = 0; d < 365; d++) {
      world.tick = d;
      const s = bringUpToDate(world);
      const at = new Map(regions.map((r) => [r, Object.fromEntries(FIELDS.map((f) => [f, s[f][r]])) as Sample]));
      days.push({ month: new Date(Date.UTC(year, 0, 1 + d)).getUTCMonth(), at });
    }
  }
  return (region: number, read: (s: Sample) => number): number[] => {
    const sums = new Array<number>(12).fill(0), counts = new Array<number>(12).fill(0);
    for (const { month, at } of days) {
      sums[month] += read(at.get(region)!);
      counts[month]++;
    }
    return sums.map((x, i) => x / counts[i]);
  };
}
const mean = (xs: number[], months: number[]) => months.reduce((a, m) => a + xs[m - 1], 0) / months.length;

describe('weather climatology', () => {
  const kyiv = regionOf(50.4, 30.5), strait = regionOf(24.5, 119.5), delhi = regionOf(28.6, 77.2), atlantic = regionOf(57, -20);
  const monthly = simulateYear(2027, [kyiv, strait, delhi, atlantic]);

  it('brings the rasputitsa to the Ukrainian plain with the spring thaw and the autumn rains, and freezes it hard in January', () => {
    const mud = monthly(kyiv, (s) => s.mud), frozen = monthly(kyiv, (s) => s.frozen);
    expect(mean(mud, [3, 4])).toBeGreaterThan(0.5);
    expect(mean(mud, [10, 11])).toBeGreaterThan(0.3);
    expect(mean(mud, [7, 8])).toBeLessThan(0.1);
    expect(frozen[0]).toBeGreaterThan(0.6);
    expect(frozen[6]).toBe(0);
  });

  it('keeps the Taiwan Strait rough under the winter monsoon, with April and October windows for a crossing', () => {
    const sea = monthly(strait, (s) => amphibiousFactor({ waveM: s.waveM, cyclone: s.cyclone === 1 }));
    expect(mean(monthly(strait, (s) => s.waveM), [12, 1, 2])).toBeGreaterThan(2);
    expect(sea[3]).toBeGreaterThan(0.6);
    expect(sea[9]).toBeGreaterThan(0.45);
    expect(mean(sea, [12, 1, 2])).toBeLessThan(0.35);
    // Typhoons close the strait on some summer days, never in winter.
    const cyclone = monthly(strait, (s) => s.cyclone);
    expect(mean(cyclone, [7, 8, 9])).toBeGreaterThan(0.03);
    expect(mean(cyclone, [12, 1, 2])).toBe(0);
  });

  it('clouds over South Asia and turns its plains to mud in the monsoon, and clears in the dry season', () => {
    const cloud = monthly(delhi, (s) => s.cloud), mud = monthly(delhi, (s) => s.mud);
    expect(mean(cloud, [7, 8])).toBeGreaterThan(0.7);
    expect(mean(cloud, [12, 1])).toBeLessThan(0.3);
    expect(mean(mud, [8, 9])).toBeGreaterThan(0.2);
    expect(mean(mud, [3, 4])).toBeLessThan(0.05);
  });

  it('raises North Atlantic winter seas past what carriers and landing craft work in', () => {
    const wave = monthly(atlantic, (s) => s.waveM);
    expect(mean(wave, [12, 1, 2])).toBeGreaterThan(3.5);
    expect(mean(wave, [6, 7, 8])).toBeLessThan(2.5);
  });

  it('lengthens the night toward the winter pole', () => {
    expect(nightHours(50.4, 355)).toBeGreaterThan(15.5);
    expect(nightHours(50.4, 172)).toBeLessThan(8.5);
    expect(nightHours(0, 80)).toBeCloseTo(12, 0);
    expect(nightHours(70, 355)).toBe(24);
  });
});

describe('weather system', () => {
  it('replays exactly from the seed, without moving the shared RNG stream', () => {
    const a = testWorld([weather], 7), b = testWorld([weather], 7), c = testWorld([weather], 8);
    const rng = a.world.rngState;
    for (const t of [a, b, c]) for (let i = 0; i < 12; i++) t.engine.step(t.world);
    expect(a.world.rngState).toBe(rng);
    expect(a.world.slices.weather).toEqual(b.world.slices.weather);
    expect(a.world.slices.weather.tempC).not.toEqual(c.world.slices.weather.tempC);
  });

  it('draws one day per day and spins up after a jump in the date, landing where a continuous run would', () => {
    const run = testWorld([weather], 3);
    run.world.startDate = '2026-03-01T00:00:00Z';
    run.engine.step(run.world);
    const day = run.world.slices.weather.day;
    for (let i = 0; i < 3; i++) run.engine.step(run.world);
    expect(run.world.slices.weather.day).toBe(day);
    const jumped = testWorld([weather], 3);
    jumped.world.startDate = '2026-03-01T00:00:00Z';
    jumped.world.tick = 3;
    jumped.engine.step(jumped.world);
    expect(jumped.world.slices.weather).toEqual(run.world.slices.weather);
  });

  it('keeps its state as plain JSON so saves carry it', () => {
    const t = testWorld([weather]);
    t.engine.step(t.world);
    expect(jsonViolations(t.world.slices.weather, 'weather')).toEqual([]);
  });
});

describe('weather effects', () => {
  it('slows cross-country movement in mud far more than road movement, and deep snow less than mud', () => {
    expect(groundFactor({ mud: 0, snowCm: 0 }, 0)).toBe(1);
    expect(groundFactor({ mud: 1, snowCm: 0 }, 0)).toBeCloseTo(0.3);
    expect(groundFactor({ mud: 1, snowCm: 0 }, 1)).toBeCloseTo(0.75);
    expect(groundFactor({ mud: 0, snowCm: 70 }, 0)).toBeGreaterThan(0.4);
    expect(groundFactor({ mud: 0, snowCm: 70 }, 0)).toBeLessThan(0.5);
  });

  it('cuts sorties under overcast and storms, and carrier decks in heavy seas', () => {
    const fair = { cloud: 0, windKt: 10, waveM: 1, cyclone: false };
    expect(airSortieFactor(fair, false)).toBe(1);
    expect(airSortieFactor({ ...fair, cloud: 1 }, false)).toBeCloseTo(0.6);
    expect(airSortieFactor({ ...fair, cyclone: true }, false)).toBeLessThan(0.2);
    expect(airSortieFactor({ ...fair, waveM: 6.5 }, true)).toBeLessThan(0.2);
    expect(carrierFactor(3)).toBe(1);
  });

  it('stops landing craft at sea state 5 and small boats sooner', () => {
    expect(amphibiousFactor({ waveM: 1.2, cyclone: false })).toBe(1);
    expect(amphibiousFactor({ waveM: 2.75, cyclone: false })).toBe(0);
    expect(smallCraftFactor({ waveM: 2, cyclone: false })).toBeLessThan(amphibiousFactor({ waveM: 2, cyclone: false }));
    expect(amphibiousFactor({ waveM: 0.5, cyclone: true })).toBe(0);
  });

  it('takes non-battle losses only in severe cold or heat', () => {
    expect(exposureRate(5)).toBe(0);
    expect(exposureRate(-25)).toBeGreaterThan(exposureRate(-15));
    expect(exposureRate(40)).toBeGreaterThan(0);
  });
});

describe('weather hooks', () => {
  const RUS = id.nation('RUS');

  it('a brigade marching across the Russian plain takes longer in the spring rasputitsa than in July', () => {
    const daysToArrive = (startDate: string | undefined) => {
      const t = testWorld(startDate ? [weather, landMovement] : [landMovement], 11);
      if (startDate) t.world.startDate = startDate;
      const target = t.nodeAt(51.7, 41.5);
      const f = t.add({ nation: RUS, name: 'x', kind: 'maneuver', echelon: 'brigade', node: t.nodeAt(51.7, 36.2), equipment: { [id.platform('t_mbt')]: 30, [id.platform('t_ifv')]: 40, [id.platform('t_inf')]: 40 } });
      f.supply.fuel = f.supplyCapacity.fuel;
      applyLandOrder(t.world, { type: 'order', nation: RUS, formation: f.id, order: { posture: 'move', target } }, t.engine.context(t.world));
      for (let i = 0; i < 400 && f.node !== target; i++) {
        f.supply.fuel = f.supplyCapacity.fuel;
        t.engine.step(t.world);
      }
      expect(f.node).toBe(target);
      return (t.world.tick * t.world.dtHours) / 24;
    };
    const spring = daysToArrive('2026-04-01T00:00:00Z'), summer = daysToArrive('2026-07-15T00:00:00Z'), none = daysToArrive(undefined);
    expect(spring).toBeGreaterThan(summer * 1.3);
    expect(summer).toBeLessThan(none * 1.1);
  });

  it('an air wing flies fewer sorties from a base under overcast, and as many as before without weather', () => {
    const sorties = (cloud: number | undefined) => {
      const t = testWorld(cloud === undefined ? [] : [weather], 5);
      const base = t.nodeAt(50.4, 30.5);
      t.add({ nation: 'UKR' as NationId, name: 'wing', kind: 'air_wing', echelon: 'wing', node: base, equipment: { [id.platform('t_fighter')]: 400 } });
      if (cloud !== undefined) {
        const s = t.world.slices.weather, r = regionOf(t.map.lat[base], t.map.lon[base]);
        s.cloud[r] = cloud;
        s.windKt[r] = 10;
        s.cyclone[r] = 0;
      }
      return buildPicture(t.world, t.engine.context(t.world), {}).groups.reduce((a, g) => a + g.sorties, 0);
    };
    const clear = sorties(0), overcast = sorties(1), none = sorties(undefined);
    expect(clear).toBeGreaterThan(50);
    expect(clear).toBe(none);
    expect(overcast / clear).toBeGreaterThan(0.5);
    expect(overcast / clear).toBeLessThan(0.7);
  });
});

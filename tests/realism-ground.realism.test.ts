import { describe, expect, it } from 'vitest';
import type { GameMap } from '../src/core/map';
import type { NationId, World } from '../src/core/types';
import { createSession } from '../src/scenarios';

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

/** Cells `by` took from any of `from` between two control snapshots, net of cells it lost back to them. */
function netGain(before: readonly (NationId | undefined)[], after: readonly (NationId | undefined)[], by: string, from: readonly string[]): number {
  let n = 0;
  for (let i = 0; i < before.length; i++) {
    if (from.includes(before[i]!) && after[i] === by) n++;
    if (before[i] === by && from.includes(after[i]!)) n--;
  }
  return n;
}

const perDay = (r: GroundRun, m: Map<NationId, number>, n: string) => (m.get(n as NationId) ?? 0) / r.days;
const memo = new Map<string, GroundRun>();
const run = (scenario: string, seed: number, days: number) => {
  const key = `${scenario}/${seed}/${days}`;
  return memo.get(key) ?? memo.set(key, runGround(scenario, seed, days)).get(key)!;
};

/**
 * Russo-Ukrainian War from the late-2025 line. Russia gained about 3,500-5,000 km2 a year in
 * 2024-25 (ISW, DeepState), under one 1-degree cell in 60 days; 0-2 allows for a cell boundary
 * falling inside a slow advance. Russian killed and wounded ran about 1,000-1,500 a day in
 * 2024-25 (UK MoD, Ukrainian General Staff); the band is wider for a model whose casualties come
 * from crews and dismounts. Oryx confirmed about 3-5 Russian tanks a day in 2024 and roughly a
 * quarter of that for Ukraine, which defended.
 */
describe.each([1, 2, 3])('ukraine-2026 seed %i, 60 days', (seed) => {
  const r = () => run('ukraine-2026', seed, 60);

  it('Russia nets 0-2 cells of Ukraine', () => {
    expect(netGain(r().start, r().world.control, 'RUS', ['UKR'])).toBeGreaterThanOrEqual(0);
    expect(netGain(r().start, r().world.control, 'RUS', ['UKR'])).toBeLessThanOrEqual(2);
  });

  it('Russia loses 500-2,000 personnel a day, more than Ukraine', () => {
    expect(perDay(r(), r().casualties, 'RUS')).toBeGreaterThanOrEqual(500);
    expect(perDay(r(), r().casualties, 'RUS')).toBeLessThanOrEqual(2000);
    expect(perDay(r(), r().casualties, 'UKR')).toBeLessThan(perDay(r(), r().casualties, 'RUS'));
  });

  it('Russia loses 2-8 tanks a day, Ukraine fewer, at least half a tank a day', () => {
    expect(perDay(r(), r().tanks, 'RUS')).toBeGreaterThanOrEqual(2);
    expect(perDay(r(), r().tanks, 'RUS')).toBeLessThanOrEqual(8);
    expect(perDay(r(), r().tanks, 'UKR')).toBeGreaterThanOrEqual(0.5);
    expect(perDay(r(), r().tanks, 'UKR')).toBeLessThan(perDay(r(), r().tanks, 'RUS'));
  });

  it('nobody capitulates', () => {
    expect(r().capitulated).toEqual([]);
  });
});

/**
 * RAND (Shlapak and Johnson, 2016) found Russian forces at Tallinn or Riga in 36-60 hours against
 * 2016 posture. With eFP brigades in place and Finland in NATO the 2027 defence is thicker, so the
 * judgment band is ground taken but no collapse: 1-6 Baltic cells in three weeks.
 */
describe.each([1, 2])('baltic-2027 seed %i, 21 days', (seed) => {
  it('Russia takes 1-6 cells of the Baltic states', () => {
    const r = run('baltic-2027', seed, 21);
    const taken = netGain(r.start, r.world.control, 'RUS', ['EST', 'LVA', 'LTU']) + netGain(r.start, r.world.control, 'BLR', ['EST', 'LVA', 'LTU']);
    expect(taken).toBeGreaterThanOrEqual(1);
    expect(taken).toBeLessThanOrEqual(6);
  });
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
    expect(netGain(r.daily[13], r.daily[20], 'PRK', ['KOR'])).toBeLessThanOrEqual(0);
  });
});

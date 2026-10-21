import { describe, expect, it } from 'vitest';
import { atWar } from '../src/core/engine';
import type { NationId, NodeId, World } from '../src/core/types';
import type { GameMap } from '../src/core/map';
import { createSession } from '../src/scenarios';
import { supplyFactor } from '../src/systems/logistics';

/**
 * Logistics bands: rearming from production, keeping armies regenerated, the shells
 * artillery draws, and sea supply to island bases and lodgements. "Judgment" marks
 * bounds set by hand around a point estimate.
 */

const LONG_RANGE = new Set(['iskander_m', 'kh101', 'kalibr']);
const MONTH_DAYS = 30;

interface Month {
  longRange: number;
  shahed: number;
  shahedBuilt: number;
  shells: Record<string, number>;
}

interface UkraineRun {
  months: Month[];
  front: Record<string, [number, number]>;
}

/** Manoeuvre formations within 500 km of ground a nation's enemy holds: the army in the theatre. */
function frontLine(world: World, map: GameMap, nation: NationId): number {
  const enemy: number[] = [];
  for (let n = 0; n < map.landCount; n++) if (world.control[n] && atWar(world, world.control[n], nation)) enemy.push(n);
  let count = 0;
  for (const f of Object.values(world.formations))
    if (f.nation === nation && f.kind === 'maneuver' && f.status !== 'destroyed' && f.status !== 'embarked' && f.node < map.landCount && enemy.some((n) => map.distanceKm(f.node, n as NodeId) <= 500)) count++;
  return count;
}

function runUkraine(seed: number, days: number): UkraineRun {
  const { world, map, engine } = createSession('ukraine-2026', seed);
  const perDay = Math.round(24 / world.dtHours);
  const nations = ['RUS', 'UKR'] as NationId[];
  engine.step(world);
  const front = Object.fromEntries(nations.map((n) => [n, [frontLine(world, map, n), 0]])) as UkraineRun['front'];
  const months: Month[] = [];
  const shellsNow = () => ({ ...world.slices.land.shellsFired });
  const builtNow = () => world.slices.economy.nations['RUS' as NationId].delivered['shahed136' as never] ?? 0;
  let shells0 = shellsNow(), built0 = builtNow(), m: Month = { longRange: 0, shahed: 0, shahedBuilt: 0, shells: {} };
  for (let i = 1; i < days * perDay; i++) {
    for (const e of engine.step(world))
      if (e.type === 'strike' && e.by === 'RUS') {
        if (LONG_RANGE.has(e.munition)) m.longRange += e.fired;
        else if (e.munition === 'shahed136') m.shahed += e.fired;
      }
    if ((i + 1) % (MONTH_DAYS * perDay) === 0) {
      const shells = shellsNow(), built = builtNow();
      for (const n of nations) m.shells[n] = ((shells[n] ?? 0) - (shells0[n] ?? 0)) / MONTH_DAYS;
      m.shahedBuilt = built - built0;
      months.push(m);
      [shells0, built0, m] = [shells, built, { longRange: 0, shahed: 0, shahedBuilt: 0, shells: {} }];
    }
  }
  for (const n of nations) front[n][1] = frontLine(world, map, n);
  return { months, front };
}

const memo = new Map<number, UkraineRun>();
const ukraine = (seed: number) => memo.get(seed) ?? memo.set(seed, runUkraine(seed, 90)).get(seed)!;
/** Months after the opening one, which spends stocks built up before the scenario. */
const settled = (r: UkraineRun) => r.months.slice(1);

describe.each([1, 2, 3])('ukraine-2026 seed %i, 90 days', (seed) => {
  // Russia launched ~2,700 Geran-2 a month by mid-2025 from Alabuga output (GUR); every round built is fired within weeks.
  // Judgment: after the opening month launches keep pace with production instead of stopping when the first loads are gone.
  it('Russia keeps launching Geran-2 at its production rate, 2,000-6,000 a month (GUR, UA MoD 2025)', () => {
    for (const m of settled(ukraine(seed))) {
      expect(m.shahed).toBeGreaterThanOrEqual(0.8 * m.shahedBuilt);
      expect(m.shahed).toBeGreaterThanOrEqual(2_000);
      expect(m.shahed).toBeLessThanOrEqual(6_000);
    }
  });

  // ~100-150 Iskander, Kh-101 and Kalibr a month in 2025 (UA Air Force monthly tallies via ISW), near production.
  // Judgment: 60-250 allows for the AI's salvo days falling unevenly across months.
  it('Russia fires 60-250 Iskander, Kh-101 and Kalibr a month after the opening salvo', () => {
    for (const m of settled(ukraine(seed))) {
      expect(m.longRange).toBeGreaterThanOrEqual(60);
      expect(m.longRange).toBeLessThanOrEqual(250);
    }
  });

  // Neither army hollowed out over 2023-25: both kept regenerating brigades from mobilised men (ISW, RUSI). Judgment: ±15%.
  it('the Russian and Ukrainian armies in the theatre stay within 15% of their starting brigade count', () => {
    const { front } = ukraine(seed);
    for (const n of ['RUS', 'UKR']) {
      const [start, end] = front[n];
      expect(end).toBeGreaterThanOrEqual(0.85 * start);
      expect(end).toBeLessThanOrEqual(1.15 * start);
    }
  });

  // Russia ~10-20k rounds a day in 2024-25, down from 40-60k in 2022; Ukraine ~2-7k (RUSI, ISW, Estonian intelligence).
  it('Russia fires 10-20k shells a day and Ukraine 2-7k', () => {
    for (const m of settled(ukraine(seed))) {
      expect(m.shells.UKR).toBeGreaterThanOrEqual(2_000);
      expect(m.shells.UKR).toBeLessThanOrEqual(7_000);
      expect(m.shells.RUS).toBeGreaterThanOrEqual(10_000);
      expect(m.shells.RUS).toBeLessThanOrEqual(20_000);
    }
  });
});

interface TaiwanRun {
  plaSurrenders: number;
  okinawaSupply: number;
}

function runTaiwan(seed: number, days: number): TaiwanRun {
  const { world, map, engine } = createSession('taiwan-2027', seed);
  const okinawa = map.nodeAt(26.3, 127.8);
  const out: TaiwanRun = { plaSurrenders: 0, okinawaSupply: Infinity };
  for (let i = 0; i < Math.round((days * 24) / world.dtHours); i++) {
    for (const e of engine.step(world)) if (e.type === 'message' && e.nation === 'CHN' && e.text.includes('surrendered after')) out.plaSurrenders++;
    if (Object.values(world.formations).some((f) => f.nation === 'USA' && f.node === okinawa && f.status !== 'destroyed'))
      out.okinawaSupply = Math.min(out.okinawaSupply, supplyFactor(world, map, okinawa, 'USA' as NationId));
  }
  return out;
}

const taiwan = new Map<number, TaiwanRun>();
const twn = (seed: number) => taiwan.get(seed) ?? taiwan.set(seed, runTaiwan(seed, 30)).get(seed)!;

describe.each([1, 2])('taiwan-2027 seed %i, 30 days', (seed) => {
  // A lodgement is fed over the beach while the sea lane holds, as at Normandy and Inchon; in CSIS's 2023 wargames PLA
  // forces ashore held for weeks and failed once US strikes sank the lift. Judgment: at most 5 surrenders in the first month.
  it('PLA forces ashore are supplied over the beach and do not surrender en masse in the first month', () => {
    expect(twn(seed).plaSurrenders).toBeLessThanOrEqual(5);
  });

  // Kadena and the Marine bases on Okinawa are supplied by sea through Naha and by air; the map flags no port there.
  it('US forces on Okinawa stay in supply', () => {
    expect(twn(seed).okinawaSupply).toBeGreaterThan(0);
  });
});

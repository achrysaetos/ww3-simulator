import { describe, expect, it } from 'vitest';
import type { GameMap } from '../src/core/map';
import type { Echelon, FormationId, NationId, NodeId } from '../src/core/types';
import { loadMap } from '../src/data/load';
import { GameClock } from '../src/ui/clock';
import { along, gliders, glidesFrom, nodesOf } from '../src/ui/glide';
import { dtHoursIn } from '../src/ui/slot';
import type { FormationView } from '../src/ui/snapshot';

/** A worker that takes `latencyMs` per tick, driven by 16 ms frames: what the page's clock sees. */
function play(clock: GameClock, latencyMs: number, seconds: number, onFrame?: (now: number, enginePending: boolean) => void) {
  let due: number | null = null, asked = 0;
  for (let now = 0; now <= seconds * 1000; now += 16) {
    if (due !== null && now >= due) {
      clock.delivered(clock.tick + 1);
      due = null;
    }
    if (clock.advance(now)) {
      expect(due, 'one tick in flight at a time').toBeNull();
      due = now + latencyMs;
      asked++;
    }
    onFrame?.(now, due !== null);
  }
  return asked;
}

describe('the game clock', () => {
  it('runs one game hour a real second at 1x, holding at the tick until the engine delivers the next', () => {
    const c = new GameClock(6, 0, 0);
    c.setRate(1, 0);
    expect(c.advance(0), 'asks for the first tick at once').toBe(true);
    expect(c.advance(4000), 'one request, however long the engine takes').toBe(false);
    expect(c.shown, 'holds at tick 0 while it computes').toBe(0);
    c.delivered(1);
    c.advance(7000);
    expect(c.shown).toBeCloseTo(3);
    expect(c.fraction).toBeCloseTo(0.5);
    expect(c.advance(9999)).toBe(false);
    expect(c.advance(10_000), 'asks for tick 2 when the shown time reaches tick 1').toBe(true);
    expect(c.shown).toBe(6);
    c.advance(30_000);
    expect(c.shown, 'never passes the engine').toBe(6);
  });

  it('keeps the shown time within one tick behind the engine, never ahead, at every frame', () => {
    for (const [rate, latency] of [[1, 120], [5, 400], [20, 700], [20, 5]] as const) {
      const c = new GameClock(6, 0, 0);
      c.setRate(rate, 0);
      play(c, latency, 30, () => {
        const behind = c.tick * 6 - c.shown;
        expect(behind).toBeGreaterThanOrEqual(0);
        expect(behind).toBeLessThanOrEqual(6);
      });
    }
  });

  it('paces at the set rate less only the holds, so a quick engine reads as a constant clock', () => {
    const c = new GameClock(6, 0, 0);
    c.setRate(1, 0);
    play(c, 100, 60);
    // Ten ticks of 6 h each hold about 0.1 s: 60 s shows a little under 60 h.
    expect(c.shown).toBeGreaterThan(58);
    expect(c.shown).toBeLessThanOrEqual(60);
    const fast = new GameClock(6, 0, 0);
    fast.setRate(5, 0);
    play(fast, 20, 12);
    expect(fast.shown).toBeGreaterThan(57);
    expect(fast.shown).toBeLessThanOrEqual(60);
  });

  it('pauses at once and resumes from where it stopped', () => {
    const c = new GameClock(6, 4, 0);
    c.delivered(5);
    c.setRate(5, 0);
    c.advance(400);
    c.setRate(0, 500);
    const at = c.shown;
    expect(at).toBeCloseTo(26.5);
    expect(c.advance(60_000)).toBe(false);
    expect(c.shown).toBe(at);
    c.setRate(1, 60_000);
    c.advance(61_000);
    expect(c.shown).toBeCloseTo(at + 1);
  });

  it('ignores snapshots that repeat the latest tick, which keep its request open', () => {
    const c = new GameClock(6, 0, 0);
    c.setRate(1, 0);
    expect(c.advance(0)).toBe(true);
    expect(c.delivered(0), 'a focus change re-sends tick 0').toBe(false);
    expect(c.advance(100)).toBe(false);
    expect(c.delivered(1)).toBe(true);
  });

  it('steps one tick on demand only while paused, shown at once', () => {
    const c = new GameClock(6, 2, 0);
    expect(c.step()).toBe(true);
    expect(c.step(), 'nothing more while one is on its way').toBe(false);
    c.delivered(3);
    expect(c.shown).toBe(18);
    expect(c.fraction).toBe(1);
    c.setRate(1, 0);
    expect(c.step(), 'not while the clock runs').toBe(false);
  });

  it('runs as fast as the engine steps at Infinity', () => {
    const c = new GameClock(6, 0, 0);
    c.setRate(Infinity, 0);
    expect(play(c, 30, 3)).toBeGreaterThan(90);
    expect(c.tick * 6 - c.shown).toBeLessThanOrEqual(6);
  });
});

let seq = 0;
function view(nation: string, node: number, echelon: Echelon = 'brigade', id = `f${seq++}`): FormationView {
  return {
    entry: { id: id as FormationId, name: id, nation: nation as NationId, kind: 'maneuver', echelon, platforms: 100 },
    node: node as NodeId, strength: 1, posture: 'defend', status: 'active', target: null, contact: null,
  };
}

describe('counters gliding between ticks', () => {
  const map = loadMap();
  const a = 1000 as NodeId;
  const [b] = [...map.neighbors(a)];
  const far = [...map.neighbors(b)].find((n) => n !== a && ![...map.neighbors(a)].includes(n))!;

  it('glides a formation that stepped to a neighbouring node and snaps everything else', () => {
    const before = nodesOf([view('UKR', a, 'brigade', 'step'), view('UKR', a, 'brigade', 'jump'), view('UKR', a, 'brigade', 'still')]);
    const now = [view('UKR', b, 'brigade', 'step'), view('UKR', far, 'brigade', 'jump'), view('UKR', a, 'brigade', 'still'), view('UKR', b, 'brigade', 'new')];
    expect(glidesFrom(before, now, map)).toEqual(new Map([['step', a]]));
  });

  it('moves formations that share an edge and a nation as one stack, strongest first', () => {
    const now = [view('UKR', b, 'brigade', 'x'), view('UKR', b, 'corps', 'y'), view('RUS', b, 'brigade', 'z'), view('UKR', a, 'brigade', 'still')];
    const from = new Map([['x', a], ['y', a], ['z', a]] as [FormationId, NodeId][]);
    const stacks = [...gliders(now, from)].map(([s, at]) => ({ nation: s.nation, node: s.node, at, ids: s.members.map((f) => f.entry.id) }));
    expect(stacks).toEqual([
      { nation: 'UKR', node: b, at: a, ids: ['y', 'x'] },
      { nation: 'RUS', node: b, at: a, ids: ['z'] },
    ]);
  });

  it('draws a glider the share of the way the clock is through the tick, the short way round the antimeridian', () => {
    expect(along(map, a, b, 0)).toEqual([map.lon[a], map.lat[a]]);
    expect(along(map, a, b, 1)[0]).toBeCloseTo(map.lon[b]);
    expect(along(map, a, b, 0.5)[1]).toBeCloseTo((map.lat[a] + map.lat[b]) / 2);
    const dateline = { lon: [179, -179], lat: [10, 12] } as unknown as GameMap;
    expect(along(dateline, 0 as NodeId, 1 as NodeId, 0.5)).toEqual([180, 11]);
  });
});

describe('the quick-save slot', () => {
  it("reads the save's hours per tick for its day, not a fixed six", () => {
    expect(dtHoursIn(JSON.stringify({ format: 'ww3-save', version: 3, scenario: 'x', world: { seed: 1, rngState: 1, tick: 40, dtHours: 3 } }))).toBe(3);
  });
});

import { describe, expect, it } from 'vitest';
import type { GameMap } from '../src/core/map';
import type { Echelon, FormationId, NationId, NodeId } from '../src/core/types';
import { loadMap } from '../src/data/load';
import { GameClock } from '../src/ui/clock';
import { along, gliders, glidesFrom, nodesOf } from '../src/ui/glide';
import { dtHoursIn } from '../src/ui/slot';
import type { FormationView } from '../src/ui/snapshot';

/** A worker that takes `latencyMs` per tick, driven by 16 ms frames from `from`: what the page's clock sees. */
function play(clock: GameClock, latencyMs: number, seconds: number, onFrame?: (engine: number) => void, from = 0) {
  let due: number | null = null, engine = clock.tick, asks = 0;
  for (let now = from; now <= from + seconds * 1000; now += 16) {
    if (due !== null && now >= due) {
      expect(clock.arrived(++engine)).toBe(true);
      due = null;
    }
    for (let a = clock.advance(now); a; a = clock.advance(now)) {
      if (a === 'apply') continue;
      expect(due, 'one tick in flight at a time').toBeNull();
      due = now + latencyMs;
      asks++;
    }
    onFrame?.(engine + (due === null ? 0 : 1));
  }
  return asks;
}

describe('the game clock', () => {
  it('runs one game hour a real second at 1x without holding when the engine keeps up', () => {
    const c = new GameClock(6, 0, 0);
    c.setRate(1, 0);
    play(c, 300, 60);
    // Only the first tick is waited for; after that each is asked a second early and lands before it is needed.
    expect(c.shown, "a hold on every tick would show about 57 h").toBeGreaterThan(59.5);
    expect(c.shown).toBeLessThanOrEqual(60);
    const fast = new GameClock(6, 0, 0);
    fast.setRate(5, 0);
    play(fast, 300, 12);
    expect(fast.shown, "a hold on every tick would show about 45 h").toBeGreaterThan(57.5);
  });

  it('asks for the next tick a second of real time before the shown time reaches the latest', () => {
    const c = new GameClock(6, 0, 0);
    c.setRate(1, 0);
    expect(c.advance(0)).toBe('ask');
    expect(c.advance(0)).toBeNull();
    c.arrived(1);
    expect(c.advance(0), 'the first tick is shown as soon as it lands').toBe('apply');
    expect(c.fraction).toBe(0);
    expect(c.advance(4900)).toBeNull();
    expect(c.shown).toBeCloseTo(4.9);
    expect(c.advance(5000)).toBe('ask');
    c.arrived(2);
    expect(c.advance(5500), 'held until the shown time reaches tick 1').toBeNull();
    expect(c.tick).toBe(1);
    expect(c.advance(6000)).toBe('apply');
    expect(c.tick).toBe(2);
    expect(c.fraction).toBe(0);
  });

  it('holds at the latest tick when the engine is late, never running past it', () => {
    const c = new GameClock(6, 0, 0);
    c.setRate(1, 0);
    play(c, 2500, 60, (engine) => {
      expect(c.shown).toBeLessThanOrEqual(c.tick * 6);
      expect(engine - c.tick).toBeLessThanOrEqual(1);
    });
    // Each 6 h tick takes 2.5 s against a 1 s lead: a 1.5 s hold every 7.5 s.
    expect(c.shown).toBeLessThan(52);
  });

  it('keeps the shown time within two ticks of the engine and never past an applied tick, at every frame', () => {
    for (const [rate, latency] of [[1, 120], [5, 400], [20, 700], [20, 5], [1, 3000]] as const) {
      const c = new GameClock(6, 0, 0);
      c.setRate(rate, 0);
      play(c, latency, 30, (engine) => {
        expect(c.shown).toBeLessThanOrEqual(c.tick * 6);
        expect(c.shown).toBeGreaterThanOrEqual((c.tick - 1) * 6);
        expect(engine * 6 - c.shown).toBeLessThanOrEqual(12);
      });
    }
  });

  it('pauses at once, lets the engine finish at most the one tick it was asked, and resumes from where it stopped', () => {
    const c = new GameClock(6, 0, 0);
    c.setRate(5, 0);
    play(c, 200, 3.3);
    c.setRate(0, 3300);
    const at = c.shown;
    let most = 0;
    expect(play(c, 200, 10, (engine) => (most = Math.max(most, engine - c.tick)), 3316), 'no tick asked while paused').toBe(0);
    expect(most).toBeLessThanOrEqual(1);
    expect(c.shown).toBe(at);
    c.setRate(1, 20_000);
    c.advance(21_000);
    expect(c.shown).toBeCloseTo(Math.min(at + 1, c.tick * 6));
  });

  it('ignores snapshots that repeat a tick it has', () => {
    const c = new GameClock(6, 0, 0);
    c.setRate(1, 0);
    expect(c.advance(0)).toBe('ask');
    expect(c.arrived(0), 'a focus change re-sends tick 0').toBe(false);
    expect(c.advance(100)).toBeNull();
    expect(c.arrived(1)).toBe(true);
    expect(c.arrived(1), 'a refusal re-sends the held tick').toBe(false);
  });

  it('steps one more tick on demand while paused, shown at once with anything held before it', () => {
    const c = new GameClock(6, 2, 0);
    expect(c.step()).toBe(true);
    expect(c.step(), 'one on its way serves').toBe(false);
    c.arrived(3);
    expect(c.advance(0)).toBe('apply');
    expect(c.shown).toBe(18);
    expect(c.advance(0)).toBeNull();
    c.setRate(1, 0);
    expect(c.advance(0)).toBe('ask');
    c.setRate(0, 10);
    c.arrived(4);
    expect(c.advance(20), 'paused, a tick that lands waits').toBeNull();
    expect(c.step(), 'a step asks one past it').toBe(true);
    c.arrived(5);
    expect(c.advance(30)).toBe('apply');
    expect(c.advance(30)).toBe('apply');
    expect(c.advance(30)).toBeNull();
    expect(c.shown).toBe(30);
    c.setRate(1, 40);
    expect(c.step(), 'not while the clock runs').toBe(false);
  });

  it('runs as fast as the engine steps at Infinity', () => {
    const c = new GameClock(6, 0, 0);
    c.setRate(Infinity, 0);
    expect(play(c, 30, 3)).toBeGreaterThan(90);
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

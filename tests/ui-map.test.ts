import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Echelon, FormationId, NationId, NodeId } from '../src/core/types';
import { Pacer } from '../src/ui/pacer';
import type { FormationView } from '../src/ui/snapshot';
import { clusterStacks, fanRows, gridSize, indexByNode } from '../src/ui/stacks';
import { applySnapshot, emptyClientState, nationCards, SnapshotEncoder } from '../src/ui/snapshot';
import { openingFocus } from '../src/ui/MapView';
import { loadMap } from '../src/data/load';
import { createSession, SCENARIOS } from '../src/scenarios';

let seq = 0;
function view(nation: string, node: number, echelon: Echelon, platforms = 100, status: FormationView['status'] = 'active'): FormationView {
  const id = `f${seq++}` as FormationId;
  return {
    entry: { id, name: id, nation: nation as NationId, kind: 'maneuver', echelon, platforms },
    node: node as NodeId, strength: 1, posture: 'defend', status, target: null, contact: null,
  };
}

/** Nodes laid out on a line, 10 projected units apart. */
const center = (n: NodeId) => [n * 10, 0] as const;

describe('counter stacking', () => {
  it('merges one nation per grid cell, leads with the highest echelon, and never mixes nations', () => {
    const brigade = view('POL', 0, 'brigade', 300);
    const corps = view('POL', 1, 'corps', 50);
    const division = view('POL', 2, 'division', 900);
    const enemy = view('RUS', 1, 'army');
    const stacks = clusterStacks(indexByNode([brigade, corps, division, enemy]), center, 64);
    expect(stacks).toHaveLength(2);
    const pol = stacks.find((s) => s.nation === 'POL')!;
    expect(pol.members.map((m) => m.entry.id)).toEqual([corps.entry.id, division.entry.id, brigade.entry.id]);
    expect(pol.node).toBe(1);
    expect(pol.nodes).toBe(3);
    expect(stacks.find((s) => s.nation === 'RUS')!.members).toEqual([enemy]);
  });

  it('splits into one stack per node once the grid is finer than the node spacing', () => {
    const fs = [view('USA', 0, 'brigade'), view('USA', 0, 'brigade'), view('USA', 1, 'brigade'), view('USA', 2, 'division')];
    expect(clusterStacks(indexByNode(fs), center, 64)).toHaveLength(1);
    const fine = clusterStacks(indexByNode(fs), center, 8);
    expect(fine.map((s) => [s.node, s.members.length, s.nodes]).sort()).toEqual([[0, 2, 1], [1, 1, 1], [2, 1, 1]]);
  });

  it('leaves destroyed and embarked formations off the map', () => {
    const byNode = indexByNode([view('USA', 0, 'brigade', 10, 'destroyed'), view('USA', 0, 'brigade', 10, 'embarked'), view('USA', 0, 'brigade', 10, 'routed')]);
    expect(byNode.get(0 as NodeId)).toHaveLength(1);
  });

  it('keeps the grid fixed while panning and doubles it each time the zoom halves', () => {
    expect(gridSize(34, 4)).toBe(gridSize(34, 3));
    expect(gridSize(34, 2)).toBe(2 * gridSize(34, 4));
    expect(gridSize(34, 1)).toBeGreaterThanOrEqual(34);
    expect(gridSize(34, 1) / 2).toBeLessThan(34);
  });
});

describe('counters at the front zoom of ukraine-2026, D+10', () => {
  it('fans the enemy attacking a held cell on the side its own ground lies, not behind the defenders', () => {
    const s = createSession('ukraine-2026', 1);
    const UKR = 'UKR' as NationId, RUS = 'RUS' as NationId;
    s.world.nations[UKR].controlledBy = 'human';
    s.engine.run(s.world, 40);
    const client = emptyClientState(s.map.size);
    applySnapshot(client, new SnapshotEncoder(s.map.nationIds, s.catalog, s.map.size).encode(s.world, s.map), s.map.nationIds, new Map(nationCards(s.map, {}).map((c) => [c.id, c])));
    const stacks = clusterStacks(indexByNode(client.formations), (n) => [s.map.lon[n], -s.map.lat[n]], 1e-6);
    const rows = fanRows(stacks, s.map, client.control, s.map.nationIds, () => 1);
    const ruIdx = s.map.nationIds.indexOf(RUS);
    let shared = 0;
    for (const ua of stacks.filter((x) => x.nation === UKR)) {
      const ru = stacks.find((x) => x.nation === RUS && x.node === ua.node);
      if (!ru) continue;
      const theirs = [...s.map.neighbors(ua.node)].filter((m) => m < s.map.landCount && client.control[m] === ruIdx);
      if (!theirs.length || !theirs.every((m) => s.map.lat[m] < s.map.lat[ua.node])) continue;
      shared++;
      expect(rows.get(ru)!, `node ${ua.node}`).toBeGreaterThan(rows.get(ua)!);
    }
    expect(shared).toBeGreaterThan(0);
  }, 300_000);
});

describe('engine pacing', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** A tick that takes `costMs` of wall time and sends a snapshot. */
  function rig(costMs: number) {
    let clock = 0, ticks = 0;
    const pacer: Pacer = new Pacer(() => {
      ticks++;
      clock += costMs;
      pacer.sent();
    }, () => clock + Date.now());
    return { pacer, ticks: () => ticks };
  }

  it('never starts a tick while a snapshot is unacked, however far behind the target rate', () => {
    const { pacer, ticks } = rig(150);
    pacer.setSpeed(20);
    vi.advanceTimersByTime(5_000);
    expect(ticks()).toBe(1);
    pacer.setSpeed(5);
    vi.advanceTimersByTime(5_000);
    expect(ticks()).toBe(1);
    pacer.ack();
    vi.advanceTimersByTime(0);
    expect(ticks()).toBe(2);
    vi.advanceTimersByTime(5_000);
    expect(ticks()).toBe(2);
  });

  it('runs at the requested rate when acks come back promptly, and reports it', () => {
    const { pacer, ticks } = rig(0);
    pacer.setSpeed(5);
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(200);
      pacer.ack();
    }
    expect(ticks()).toBeGreaterThanOrEqual(19);
    expect(ticks()).toBeLessThanOrEqual(21);
    expect(pacer.achievedTps).toBeCloseTo(5, 0);
  });

  it('reads neither above the requested rate when a slow tick ends just before a fast one, nor zero while slow ticks run', () => {
    let t = 0, cost = 900;
    const pacer: Pacer = new Pacer(() => {
      t += cost;
      pacer.sent();
    }, () => t);
    pacer.setSpeed(1);
    vi.advanceTimersByTime(0);
    pacer.ack();
    expect(pacer.achievedTps).toBeGreaterThan(0.5);
    t = 1000;
    cost = 50;
    vi.advanceTimersByTime(100);
    pacer.ack();
    expect(pacer.achievedTps).toBeLessThanOrEqual(1);
  });

  it('stops ticking when paused and steps once on demand only when nothing is in flight', () => {
    const { pacer, ticks } = rig(10);
    pacer.setSpeed(0);
    vi.advanceTimersByTime(1_000);
    expect(ticks()).toBe(0);
    pacer.step();
    pacer.step();
    expect(ticks()).toBe(1);
    pacer.ack();
    pacer.step();
    expect(ticks()).toBe(2);
    expect(pacer.achievedTps).toBe(0);
  });
});

describe('opening view', () => {
  const map = loadMap();
  const wars = (id: string) => SCENARIOS.find((s) => s.id === id)!.opening.flatMap((m): [NationId, NationId][] => (m.type === 'declare_war' ? [[m.nation, m.target]] : []));
  const TAIPEI = [25.04, 121.56], SEOUL = [37.57, 126.98], KYIV = [50.45, 30.52], WARSAW = [52.25, 20.99], JERUSALEM = [31.78, 35.22], TOKYO = [35.68, 139.69];

  it.each([
    ['taiwan-2027', 'USA', TAIPEI], ['taiwan-2027', 'CHN', TAIPEI], ['korea-2027', 'KOR', SEOUL], ['ukraine-2026', 'UKR', KYIV],
    ['ww3-2027', 'POL', WARSAW], ['ww3-2027', 'USA', TAIPEI], ['gulf-2027', 'IRN', JERUSALEM], ['peace-2027', 'JPN', TOKYO],
  ])('opens %s played as %s on the capital under attack', (id, playAs, [lat, lon]) => {
    expect(openingFocus(map, { wars: wars(id) }, playAs)).toBe(map.nodeAt(lat, lon));
  });
});

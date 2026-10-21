import { describe, expect, it } from 'vitest';
import { findPath } from '../src/core/path';
import { testWorld, id } from '../src/testkit';

describe('core', () => {
  it('loads the real map as one connected land+sea graph', () => {
    const { map } = testWorld();
    expect(map.landCount).toBeGreaterThan(15_000);
    expect(map.size - map.landCount).toBeGreaterThan(4_000);
    const kyiv = map.nodeAt(50.45, 30.52);
    expect(map.owner[kyiv]).toBe('UKR');
    expect(map.isSea(map.nodeAt(35, -40))).toBe(true);
  });

  it('routes a land path from Warsaw to Moscow and a sea path from Norfolk to Rotterdam', () => {
    const { map } = testWorld();
    const land = findPath(map, map.nodeAt(52.2, 21), map.nodeAt(55.75, 37.6), (a, b, km) => (map.isSea(b) ? Infinity : km))!;
    expect(land.length).toBeGreaterThan(8);
    expect(land.every((n) => !map.isSea(n))).toBe(true);
    const norfolk = map.nodeAt(36.9, -76.3), rotterdam = map.nodeAt(51.9, 4.5);
    const sea = findPath(map, norfolk, rotterdam, (a, b, km) => (map.isSea(b) || b === rotterdam ? km : Infinity))!;
    expect(sea).not.toBeNull();
    expect(sea.slice(0, -1).every((n) => map.isSea(n))).toBe(true);
  });

  it('finds the same path whatever searches ran before it', () => {
    const { map } = testWorld();
    const landKm = (_a: number, b: number, km: number) => (map.isSea(b as never) ? Infinity : km);
    const pairs = [[52.2, 21, 55.75, 37.6], [48.85, 2.35, 41.9, 12.5], [39.9, 116.4, 31.2, 121.5], [30, 31.2, 24.7, 46.7]].map(([a, b, c, d]) => [map.nodeAt(a, b), map.nodeAt(c, d)] as const);
    const run = () => pairs.map(([a, b]) => findPath(map, a, b, landKm));
    const first = run();
    expect(first.every((p) => p && p.length > 3)).toBe(true);
    const iceland = map.nodeAt(64.1, -21.9), berlin = map.nodeAt(52.5, 13.4);
    expect(findPath(map, berlin, iceland, landKm)).toBeNull();
    expect(findPath(map, berlin, map.nodeAt(40.4, -3.7), landKm, 5)).toBeNull();
    findPath(map, berlin, map.nodeAt(35.7, 139.7), (_a, _b, km) => km * 3);
    expect(run().reverse()).toEqual(first.reverse());
  });

  it('is deterministic for a given seed', () => {
    const run = () => {
      const t = testWorld([], 7);
      t.add({ nation: id.nation('USA'), name: 'x', kind: 'maneuver', echelon: 'brigade', node: t.nodeAt(40, -100), equipment: { [id.platform('t_mbt')]: 90 } });
      t.engine.run(t.world, 10);
      return JSON.stringify(t.world);
    };
    expect(run()).toBe(run());
  });
});

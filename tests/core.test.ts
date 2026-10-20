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

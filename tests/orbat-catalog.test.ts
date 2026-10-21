import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/core/world';
import { loadCatalog } from '../src/data/catalog';
import { loadMap } from '../src/data/load';
import { allOrbat } from '../src/data/orbat';
import { ALIASES } from '../src/data/orbat/aliases';
import { placeOrbat } from '../src/scenarios/build';

describe('orders of battle against the catalog', () => {
  it('places every formation with every piece of equipment and every magazine round', () => {
    const map = loadMap();
    const world = createWorld(map);
    const report = placeOrbat(world, map, loadCatalog(), allOrbat(map), ALIASES);
    expect(report.unknownPlatforms).toEqual({});
    expect(report.unknownMunitions).toEqual({});
    expect(report.placed).toBeGreaterThan(3000);
  });

  it('starts every land-based formation ashore, the 25th Infantry Division on Oahu among them: only ships, submarines and deterrent patrols start at sea', () => {
    const map = loadMap();
    const world = createWorld(map);
    placeOrbat(world, map, loadCatalog(), allOrbat(map), ALIASES);
    const afloat = Object.values(world.formations).filter((f) => map.isSea(f.node) && !['surface_group', 'submarine', 'strategic'].includes(f.kind));
    expect(afloat.map((f) => `${f.nation} ${f.name}`)).toEqual([]);
    const schofield = Object.values(world.formations).find((f) => f.name === '2nd Brigade Combat Team, 25th Infantry Division')!;
    expect(world.control[schofield.node]).toBe('USA');
    expect(map.distanceKm(schofield.node, map.nodeAt(21.3, -157.9))).toBeLessThan(150);
  });

  it('never aliases to a missing catalog id', () => {
    const catalog = loadCatalog();
    const dangling = Object.entries(ALIASES).filter(([, to]) => !catalog.platforms.has(to as never) && !catalog.munitions.has(to as never));
    expect(dangling).toEqual([]);
  });
});

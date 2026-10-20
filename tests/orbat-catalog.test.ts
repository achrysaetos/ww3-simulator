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

  it('never aliases to a missing catalog id', () => {
    const catalog = loadCatalog();
    const dangling = Object.entries(ALIASES).filter(([, to]) => !catalog.platforms.has(to as never) && !catalog.munitions.has(to as never));
    expect(dangling).toEqual([]);
  });
});

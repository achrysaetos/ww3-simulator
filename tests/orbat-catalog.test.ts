import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/core/world';
import { loadCatalog } from '../src/data/catalog';
import { loadMap } from '../src/data/load';
import { allOrbat } from '../src/data/orbat';
import { ALIASES } from '../src/data/orbat/aliases';
import { placeOrbat } from '../src/scenarios/build';
import { LAUNCHER } from '../src/systems/air/tables';
import type { MunitionId, PlatformId } from '../src/core/types';

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

  it('puts every ground launcher in a ground formation: an air wing flies only airframes, so a launcher in one never fires', () => {
    const map = loadMap();
    const world = createWorld(map);
    const catalog = loadCatalog();
    placeOrbat(world, map, catalog, allOrbat(map), ALIASES);
    const stranded = Object.values(world.formations).filter((f) => f.kind === 'air_wing' && Object.entries(f.equipment).some(([pid, n]) => n > 0 && LAUNCHER[catalog.platform(pid as PlatformId).class]));
    expect(stranded.map((f) => `${f.nation} ${f.name}`)).toEqual([]);
  });

  it('gives every interceptor an air-defence formation carries a launcher there that loads it: Ukraine\'s PAC-2 GEM-T among them', () => {
    const map = loadMap();
    const world = createWorld(map);
    const catalog = loadCatalog();
    placeOrbat(world, map, catalog, allOrbat(map), ALIASES);
    const orphans: string[] = [];
    for (const f of Object.values(world.formations)) {
      if (f.kind !== 'air_defense') continue;
      const loads = new Set<string>();
      for (const [pid, n] of Object.entries(f.equipment)) if (n > 0) for (const l of catalog.platform(pid as PlatformId).loadout) loads.add(l.munition);
      for (const [mid, n] of Object.entries(f.magazine)) {
        const kind = catalog.munitions.get(mid as MunitionId)?.kind;
        if (n > 0 && (kind === 'sam' || kind === 'abm') && !loads.has(mid)) orphans.push(`${f.nation} ${f.name}: ${mid}`);
      }
    }
    expect(orphans).toEqual([]);
  });

  it('never aliases to a missing catalog id', () => {
    const catalog = loadCatalog();
    const dangling = Object.entries(ALIASES).filter(([, to]) => !catalog.platforms.has(to as never) && !catalog.munitions.has(to as never));
    expect(dangling).toEqual([]);
  });
});

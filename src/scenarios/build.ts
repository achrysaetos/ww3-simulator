import type { Catalog } from '../core/catalog';
import { addFormation } from '../core/forces';
import type { GameMap } from '../core/map';
import type { MunitionId, NationId, PlatformId, World } from '../core/types';
import { initialStockpiles } from '../data/industry/stockpiles';
import type { OrbatEntry } from '../data/orbat/types';

export interface PlacementReport {
  placed: number;
  /** Equipment ids the catalog does not know, with the unit count dropped. */
  unknownPlatforms: Record<string, number>;
  unknownMunitions: Record<string, number>;
}

/**
 * Turn order-of-battle entries into formations on the map. `alias` maps ORBAT
 * equipment ids onto catalog ids where the two data sets name a system differently.
 */
export function placeOrbat(world: World, map: GameMap, catalog: Catalog, entries: readonly OrbatEntry[], alias: Readonly<Record<string, string>> = {}): PlacementReport {
  const report: PlacementReport = { placed: 0, unknownPlatforms: {}, unknownMunitions: {} };
  for (const e of entries) {
    if (!world.nations[e.nation as NationId]) continue;
    const equipment: Record<PlatformId, number> = {};
    for (const [raw, n] of Object.entries(e.equipment)) {
      const pid = (alias[raw] ?? raw) as PlatformId;
      if (!catalog.platforms.has(pid)) {
        report.unknownPlatforms[raw] = (report.unknownPlatforms[raw] ?? 0) + n;
        continue;
      }
      if (n > 0) equipment[pid] = (equipment[pid] ?? 0) + n;
    }
    if (!Object.keys(equipment).length) continue;
    const f = addFormation(world, catalog, {
      nation: e.nation as NationId,
      name: e.name,
      kind: e.kind,
      echelon: e.echelon,
      node: map.nodeAt(e.base.lat, e.base.lon),
      equipment,
      ...(e.readiness !== undefined && { readiness: e.readiness }),
      ...(e.experience !== undefined && { experience: e.experience }),
      ...(e.personnel !== undefined && { personnel: e.personnel }),
    });
    for (const [raw, n] of Object.entries(e.extraMagazine ?? {})) {
      const mid = (alias[raw] ?? raw) as MunitionId;
      if (!catalog.munitions.has(mid)) {
        report.unknownMunitions[raw] = (report.unknownMunitions[raw] ?? 0) + n;
        continue;
      }
      f.magazine[mid] = (f.magazine[mid] ?? 0) + n;
    }
    report.placed++;
  }
  return report;
}

/** National war reserves and the deployed-warhead count that matches what launchers actually hold. */
export function stockNations(world: World, catalog: Catalog): void {
  for (const n of Object.values(world.nations)) {
    const { stockpile, bulk } = initialStockpiles(n);
    for (const [id, count] of Object.entries(stockpile)) if (catalog.platforms.has(id as PlatformId) || catalog.munitions.has(id as MunitionId)) n.stockpile[id as PlatformId] = count;
    n.bulk = bulk;
  }
  const loaded = new Map<NationId, number>();
  for (const f of Object.values(world.formations))
    for (const [mid, count] of Object.entries(f.magazine))
      if (catalog.munitions.get(mid as MunitionId)?.yieldKt) loaded.set(f.nation, (loaded.get(f.nation) ?? 0) + count);
  for (const n of Object.values(world.nations)) if (n.nuclear.warheads > 0) n.nuclear.deployed = Math.min(n.nuclear.deployed, loaded.get(n.id) ?? 0);
}

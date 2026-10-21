import type { Catalog } from '../core/catalog';
import { addFormation } from '../core/forces';
import { relation } from '../core/engine';
import { haversineKm, type GameMap } from '../core/map';
import type { MunitionId, NationId, NodeId, PlatformId, World } from '../core/types';
import { initialStockpiles } from '../data/industry/stockpiles';
import type { OrbatEntry } from '../data/orbat/types';
import { HOSTILE_OPINION } from '../systems/diplomacy/escalation';
import { allied } from '../systems/land';

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
      node: baseCell(world, map, e.nation as NationId, e.base.lat, e.base.lon),
      equipment,
      ...(e.readiness !== undefined && { readiness: e.readiness }),
      ...(e.experience !== undefined && { experience: e.experience }),
      ...(e.personnel !== undefined && { personnel: e.personnel }),
      ...(e.territorial && { territorial: true as const }),
      ...(e.airborne && { airborne: true as const }),
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

/** A base this close to a cell its nation or an ally holds is taken to stand on that side of the border (judgment: under half a cell). */
const BORDER_BASE_KM = 50;

/**
 * The cell a formation based at (lat, lon) starts in. A 1-degree cell belongs to
 * whichever state holds most of it, so a base just inside a border can fall in a
 * neighbour's cell: Fort Bliss shares one with Ciudad Juarez, Baltiysk with
 * Poland, Vovchansk with Belgorod. A formation whose cell is held by a state that
 * cannot be hosting it moves to the nearest adjacent cell its own nation holds,
 * within BORDER_BASE_KM of the base. On a hostile state's soil, where no one bases
 * troops, an ally's cell will do (Pabrade, Lithuania, shares a cell with Belarus).
 * Hosts are allies; a formation on its own soil held by the enemy, or next to the
 * enemy's soil it holds, is deliberately placed across a live front and stays.
 */
function baseCell(world: World, map: GameMap, nation: NationId, lat: number, lon: number): NodeId {
  const node = map.nodeAt(lat, lon);
  const holder = world.control[node];
  if (map.isSea(node) || !holder || map.owner[node] === nation || allied(world, nation, holder)) return node;
  const hostile = relation(world, nation, holder).opinion <= HOSTILE_OPINION;
  let best = node, bestKm = BORDER_BASE_KM, bestOwn = false;
  for (const m of map.neighbors(node)) {
    if (map.isSea(m)) continue;
    const h = world.control[m];
    if (h === nation && map.owner[m] === holder) return node;
    const own = h === nation;
    if (!own && !(hostile && h && allied(world, nation, h))) continue;
    const km = kmToCell(map, m, lat, lon);
    if (km < BORDER_BASE_KM && ((own && !bestOwn) || ((own || !bestOwn) && km < bestKm))) [best, bestKm, bestOwn] = [m, km, own];
  }
  return best;
}

function kmToCell(map: GameMap, cell: NodeId, lat: number, lon: number): number {
  const half = map.halfDeg[cell];
  const clamp = (x: number, c: number) => Math.min(c + half, Math.max(c - half, x));
  return haversineKm(lat, lon, clamp(lat, map.lat[cell]), clamp(lon, map.lon[cell]));
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

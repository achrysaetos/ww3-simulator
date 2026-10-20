import { haversineKm, type GameMap } from '../../../core/map';
import type { OrbatEntry } from '../types';

const SEAGOING = new Set<OrbatEntry['kind']>(['surface_group', 'submarine']);

/**
 * Keep land and air formations on their own nation's land. The map is a 1-degree grid, so
 * a real coastal or border base (Naha, Taichung, Eilat, Amman) can fall in a cell that is
 * mostly sea or that the grid assigns to a neighbour. Such a base moves to the centre of
 * the nearest cell its nation owns and keeps its name. Ships keep their real port.
 */
export function placeOnOwnLand(map: GameMap, entries: OrbatEntry[]): OrbatEntry[] {
  const cellsByNation = new Map<string, number[]>();
  const cellsOf = (iso: string) => {
    let cells = cellsByNation.get(iso);
    if (!cells) cellsByNation.set(iso, (cells = map.nodesOf(iso as never)));
    return cells;
  };
  return entries.map((e) => {
    if (SEAGOING.has(e.kind)) return e;
    const node = map.nodeAt(e.base.lat, e.base.lon);
    if (node < map.landCount && map.owner[node] === e.nation) return e;
    let best = -1, bestKm = Infinity;
    for (const n of cellsOf(e.nation)) {
      const km = haversineKm(e.base.lat, e.base.lon, map.lat[n], map.lon[n]);
      if (km < bestKm) { bestKm = km; best = n; }
    }
    if (best < 0) return e;
    return { ...e, base: { name: e.base.name, lat: +map.lat[best].toFixed(2), lon: +map.lon[best].toFixed(2) } };
  });
}

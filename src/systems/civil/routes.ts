import type { GameMap } from '../../core/map';
import type { NationId, NodeId } from '../../core/types';

/** Where refugees from one nation can cross a land border, fixed by the map. */
export interface Exits {
  hosts: NationId[];
  /** For each origin cell, km to the nearest crossing into each host (row-major, `hosts.length` per cell). */
  km: Map<number, Float32Array>;
}

const cache = new WeakMap<GameMap, Map<NationId, Exits>>();

/** The land borders of `origin`, by the map's initial owners. Computed once per map and origin. */
export function exitsOf(map: GameMap, origin: NationId): Exits {
  let byMap = cache.get(map);
  if (!byMap) cache.set(map, (byMap = new Map()));
  const hit = byMap.get(origin);
  if (hit) return hit;
  const crossings = new Map<NationId, Set<number>>();
  const cells: number[] = [];
  for (let c = 0; c < map.landCount; c++) {
    if (map.owner[c] !== origin) continue;
    cells.push(c);
    for (let k = map.adjStart[c]; k < map.adjStart[c + 1]; k++) {
      const m = map.adj[k];
      const h = map.owner[m];
      if (m >= map.landCount || !h || h === origin) continue;
      (crossings.get(h) ?? crossings.set(h, new Set()).get(h)!).add(m);
    }
  }
  const hosts = [...crossings.keys()].sort();
  const km = new Map<number, Float32Array>();
  for (const c of cells) {
    const row = new Float32Array(hosts.length);
    hosts.forEach((h, i) => {
      let best = Infinity;
      for (const b of crossings.get(h)!) best = Math.min(best, map.distanceKm(c as NodeId, b as NodeId));
      row[i] = best;
    });
    km.set(c, row);
  }
  const exits = { hosts, km };
  byMap.set(origin, exits);
  return exits;
}

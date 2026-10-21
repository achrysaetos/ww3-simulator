import type { GameMap } from '../../core/map';
import type { NationId, NodeId, World } from '../../core/types';
import { cityPopWithin } from './effects';

/** Who lives in a node and how they are spread: one dominant city (Clark density) over an even rural background. */
export interface NodePopulation {
  /** Nation whose residents these are (the original owner; occupation does not move people). */
  nation: NationId;
  total: number;
  cityPop: number;
  /** People per km^2 outside the city. */
  background: number;
  areaKm2: number;
}

const cityPopByNode = new WeakMap<GameMap, Map<number, { largest: number; sum: number }>>();

function cityIndex(map: GameMap) {
  let idx = cityPopByNode.get(map);
  if (!idx) {
    idx = new Map();
    for (const c of map.cities) {
      const e = idx.get(c.node) ?? { largest: 0, sum: 0 };
      e.largest = Math.max(e.largest, c.pop);
      e.sum += c.pop;
      idx.set(c.node, e);
    }
    cityPopByNode.set(map, idx);
  }
  return idx;
}

export function cellAreaKm2(map: GameMap, node: NodeId): number {
  return (111.32 * 2 * map.halfDeg[node]) ** 2 * Math.max(0.05, Math.cos((map.lat[node] * Math.PI) / 180));
}

/**
 * Baseline residents of a node. City figures are metro populations (Natural Earth pop_max) and can exceed the cell's
 * gridded share when a metro straddles cells, so the node holds whichever is larger.
 */
export function nodePopulation(world: World, map: GameMap, node: NodeId): NodePopulation {
  const nation = map.owner[node];
  const areaKm2 = cellAreaKm2(map, node);
  const base = world.nations[nation]?.stats.population ?? 0;
  const cellPop = nation ? base * map.popShare[node] : 0;
  const city = cityIndex(map).get(node) ?? { largest: 0, sum: 0 };
  return {
    nation,
    total: Math.max(cellPop, city.sum),
    cityPop: city.largest,
    background: Math.max(0, cellPop - city.sum) / areaKm2,
    areaKm2,
  };
}

export function popWithin(p: NodePopulation, rKm: number): number {
  return cityPopWithin(p.cityPop, rKm) + p.background * Math.PI * rKm * rKm;
}

/** Share of the node's people still alive after earlier strikes and fallout. */
export function survivingShare(world: World, p: NodePopulation, node: NodeId): number {
  return p.total > 0 ? Math.max(0, 1 - (world.slices.strategic.killed[node] ?? 0) / p.total) : 0;
}

/** Record deaths in a node, capped by who is left; returns the deaths actually applied. */
export function recordDeaths(world: World, p: NodePopulation, node: NodeId, dead: number): number {
  const s = world.slices.strategic;
  const prior = s.killed[node] ?? 0;
  const applied = Math.max(0, Math.min(Math.round(dead), Math.round(p.total - prior)));
  if (applied === 0) return 0;
  s.killed[node] = prior + applied;
  s.totals.deaths += applied;
  const nation = world.nations[p.nation];
  if (nation) nation.population = Math.max(0, nation.population - applied);
  return applied;
}

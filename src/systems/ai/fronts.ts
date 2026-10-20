import type { GameMap } from '../../core/map';
import type { NationId, NodeId, World } from '../../core/types';
import type { ForceIndex, Sector } from './types';

/**
 * Every land adjacency whose two controllers are at war, as flat (friendly,
 * hostile) pairs in both directions. One pass over land cells; callers cache
 * it until control or the set of wars changes.
 */
export function hostileEdges(world: World, map: GameMap, enemies: Map<NationId, Set<NationId>>): Int32Array {
  const out: number[] = [];
  for (let n = 0; n < map.landCount; n++) {
    const foes = enemies.get(world.control[n]);
    if (!foes) continue;
    for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
      const m = map.adj[k];
      if (m < map.landCount && foes.has(world.control[m])) out.push(n, m);
    }
  }
  return Int32Array.from(out);
}

/** The nation plus everyone fighting at least one of its enemies and not fighting it. */
export function coBelligerents(nation: NationId, enemies: Map<NationId, Set<NationId>>): Set<NationId> {
  const mine = enemies.get(nation) ?? new Set<NationId>();
  const out = new Set<NationId>([nation]);
  for (const [n, foes] of enemies) {
    if (n === nation || mine.has(n)) continue;
    for (const f of foes) if (mine.has(f)) { out.add(n); break; }
  }
  return out;
}

const landComponent = new WeakMap<GameMap, Int32Array>();

/** Connected land masses, so armies are not sent to fronts they cannot walk to. */
export function landMass(map: GameMap): Int32Array {
  let comp = landComponent.get(map);
  if (comp) return comp;
  comp = new Int32Array(map.landCount).fill(-1);
  let next = 0;
  for (let s = 0; s < map.landCount; s++) {
    if (comp[s] >= 0) continue;
    const stack = [s];
    comp[s] = next;
    while (stack.length) {
      const n = stack.pop()!;
      for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
        const m = map.adj[k];
        if (m < map.landCount && comp[m] < 0) { comp[m] = next; stack.push(m); }
      }
    }
    next++;
  }
  landComponent.set(map, comp);
  return comp;
}

export function enemyPowerAt(node: number, index: ForceIndex, enemies: Set<NationId>): number {
  let p = 0;
  for (const f of index.groundAt.get(node) ?? []) if (enemies.has(f.nation)) p += index.power(f);
  return p;
}

/** Group a nation's front cells into connected sectors and weigh the threat facing each. */
export function sectorsFor(world: World, map: GameMap, edges: Int32Array, friends: Set<NationId>, enemies: Set<NationId>, index: ForceIndex): Sector[] {
  const touching = new Map<number, number[]>();
  for (let i = 0; i < edges.length; i += 2) {
    const n = edges[i], m = edges[i + 1];
    if (!friends.has(world.control[n]) || !enemies.has(world.control[m])) continue;
    (touching.get(n) ?? touching.set(n, []).get(n)!).push(m);
  }
  const power = new Map<number, number>();
  const powerAt = (n: number) => {
    let p = power.get(n);
    if (p === undefined) power.set(n, (p = enemyPowerAt(n, index, enemies)));
    return p;
  };

  const seen = new Set<number>();
  const sectors: Sector[] = [];
  for (const start of touching.keys()) {
    if (seen.has(start)) continue;
    const nodes: number[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const n = stack.pop()!;
      nodes.push(n);
      for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
        const m = map.adj[k];
        if (touching.has(m) && !seen.has(m)) { seen.add(m); stack.push(m); }
      }
    }
    const enemyNodes = new Set<number>();
    const pressure = new Map<number, number>();
    for (const n of nodes) {
      let p = 0;
      for (const m of touching.get(n)!) { enemyNodes.add(m); p += powerAt(m); }
      pressure.set(n, p);
    }
    const battleArea = new Set<NodeId>();
    for (const m of enemyNodes) {
      battleArea.add(m as NodeId);
      for (let k = map.adjStart[m]; k < map.adjStart[m + 1]; k++) {
        const j = map.adj[k];
        if (j < map.landCount && enemies.has(world.control[j])) battleArea.add(j as NodeId);
      }
    }
    let threat = 0;
    for (const n of battleArea) threat += powerAt(n);
    nodes.sort((a, b) => pressure.get(b)! - pressure.get(a)! || a - b);
    sectors.push({ nodes: nodes as NodeId[], enemyNodes: [...enemyNodes].sort((a, b) => a - b) as NodeId[], battleArea, threat, key: nodes[0] as NodeId });
  }
  return sectors.sort((a, b) => b.threat - a.threat || a.key - b.key);
}

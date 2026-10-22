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

/**
 * States outside a war that let a partner mount it from their soil, by guest. A defence pact
 * alone gives no such consent: Turkey's parliament refused the US 4th Infantry Division passage
 * into Iraq on 1 March 2003, and the Turkey-Azerbaijan Shusha Declaration (2021) promises help
 * if attacked, not a staging right. Belarus let Russia attack Ukraine from its soil in
 * February 2022 (Union State; the Allied Resolve exercise forces stayed and crossed).
 */
const STAGING_HOSTS: Readonly<Partial<Record<string, readonly string[]>>> = { RUS: ['BLR'] };

/**
 * Border cells of states outside the war that host the nation's forces and touch the enemy:
 * a front the nation can stage on and attack from. One sector, or none.
 */
export function stagingSector(world: World, map: GameMap, nation: NationId, friends: Set<NationId>, enemies: Set<NationId>, index: ForceIndex): Sector | undefined {
  const hosts = new Set<NationId>();
  for (const h of STAGING_HOSTS[nation] ?? []) {
    const n = world.nations[h as NationId];
    if (n && !friends.has(n.id) && !enemies.has(n.id) && n.status !== 'war') hosts.add(n.id);
  }
  if (!hosts.size) return undefined;
  const nodes: number[] = [];
  const enemyNodes = new Set<number>();
  for (let n = 0; n < map.landCount; n++) {
    if (!hosts.has(world.control[n])) continue;
    let touches = false;
    for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
      const m = map.adj[k];
      if (m < map.landCount && enemies.has(world.control[m])) { touches = true; enemyNodes.add(m); }
    }
    if (touches) nodes.push(n);
  }
  if (!nodes.length) return undefined;
  let threat = 0;
  for (const m of enemyNodes) threat += enemyPowerAt(m, index, enemies);
  const sorted = [...enemyNodes].sort((a, b) => a - b);
  return { nodes: nodes as NodeId[], enemyNodes: sorted as NodeId[], battleArea: new Set(sorted as NodeId[]), threat, key: nodes[0] as NodeId };
}

/**
 * The mirror of stagingSector: the coalition's cells on the border of a state outside the war that lets
 * an enemy stage on its soil, and the host's cells across from them. Russia attacked Kyiv from Belarus
 * in February 2022, and Ukraine has held that border with Operational Command North ever since, with
 * troops on it whether or not Russian ones stood opposite. The host is not at war and is no target, so
 * the sector names no enemy cell; its threat is the enemy power standing in `hostNodes`.
 */
export function hostBorder(world: World, map: GameMap, friends: Set<NationId>, enemies: Set<NationId>): { nodes: NodeId[]; hostNodes: NodeId[] } | undefined {
  const hosts = new Set<NationId>();
  for (const e of [...enemies].sort())
    for (const h of STAGING_HOSTS[e] ?? []) {
      const n = world.nations[h as NationId];
      if (n && !friends.has(n.id) && !enemies.has(n.id) && n.status !== 'war') hosts.add(n.id);
    }
  if (!hosts.size) return undefined;
  const nodes = new Set<number>();
  const hostNodes: number[] = [];
  for (let n = 0; n < map.landCount; n++) {
    if (!hosts.has(world.control[n])) continue;
    let touches = false;
    for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
      const m = map.adj[k];
      if (m < map.landCount && friends.has(world.control[m])) { touches = true; nodes.add(m); }
    }
    if (touches) hostNodes.push(n);
  }
  if (!nodes.size) return undefined;
  return { nodes: [...nodes].sort((a, b) => a - b) as NodeId[], hostNodes: hostNodes as NodeId[] };
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
      let p = 2 * powerAt(n);
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
    // Enemy troops already fighting inside the sector's own cells are the most immediate threat.
    let threat = 0;
    for (const n of battleArea) threat += powerAt(n);
    for (const n of nodes) threat += powerAt(n);
    nodes.sort((a, b) => pressure.get(b)! - pressure.get(a)! || a - b);
    sectors.push({ nodes: nodes as NodeId[], enemyNodes: [...enemyNodes].sort((a, b) => a - b) as NodeId[], battleArea, threat, key: nodes[0] as NodeId });
  }
  return sectors.sort((a, b) => b.threat - a.threat || a.key - b.key);
}

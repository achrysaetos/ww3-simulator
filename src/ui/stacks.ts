/**
 * Map counter aggregation. Thousands of formations cannot each get a counter
 * at world zoom, so counters merge into stacks: one per nation per cell of a
 * world-space grid whose size doubles each time the zoom halves. Because the
 * grid is fixed in projected coordinates, panning never reshuffles stacks;
 * only crossing a zoom level does. Zoomed in far enough, a cell holds one map
 * node, and further in a node's stack fans out into individual counters.
 */
import type { Echelon, NationId, NodeId } from '../core/types';
import type { FormationView } from './snapshot';

const ECHELON_RANK: Record<Echelon, number> = {
  battalion: 1, squadron: 1, flotilla: 2, brigade: 2, wing: 3, task_group: 3, division: 3, corps: 4, fleet: 5, army: 5,
};

/** Higher echelon first, then more operational platforms. */
export function weight(f: FormationView): number {
  return ECHELON_RANK[f.entry.echelon] * 1e6 + f.entry.platforms * f.strength;
}

export interface Stack {
  nation: NationId;
  /** Where the stack is drawn: its strongest member's node. */
  node: NodeId;
  /** Strongest first. */
  members: FormationView[];
  /** Distinct nodes the members occupy. */
  nodes: number;
}

/** Visible formations grouped by node, strongest first. Rebuild only when a snapshot lands. */
export function indexByNode(formations: readonly FormationView[]): Map<NodeId, FormationView[]> {
  const out = new Map<NodeId, FormationView[]>();
  for (const f of formations) {
    if (f.status === 'destroyed' || f.status === 'embarked') continue;
    const list = out.get(f.node);
    if (list) list.push(f);
    else out.set(f.node, [f]);
  }
  for (const list of out.values()) list.sort((a, b) => weight(b) - weight(a));
  return out;
}

/** Grid cell size in projected (zoom 1) units for a target on-screen cell of `cellPx` at zoom `k`, snapped to a power of two. */
export function gridSize(cellPx: number, k: number): number {
  return 2 ** Math.ceil(Math.log2(cellPx / k));
}

/**
 * Merge node groups into one stack per nation per grid cell. `center` gives a
 * node's projected position at zoom 1.
 */
export function clusterStacks(byNode: ReadonlyMap<NodeId, readonly FormationView[]>, center: (n: NodeId) => readonly [number, number], grid: number): Stack[] {
  const cells = new Map<string, { nation: NationId; members: FormationView[]; nodes: Set<NodeId> }>();
  for (const [node, list] of byNode) {
    const [x, y] = center(node);
    const cell = `${Math.floor(x / grid)},${Math.floor(y / grid)}`;
    for (const f of list) {
      const key = `${cell}|${f.entry.nation}`;
      let c = cells.get(key);
      if (!c) cells.set(key, (c = { nation: f.entry.nation, members: [], nodes: new Set() }));
      c.members.push(f);
      c.nodes.add(node);
    }
  }
  return [...cells.values()].map((c) => {
    c.members.sort((a, b) => weight(b) - weight(a));
    return { nation: c.nation, node: c.members[0].node, members: c.members, nodes: c.nodes.size };
  });
}

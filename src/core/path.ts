import type { GameMap } from './map';
import type { NodeId } from './types';

/**
 * Per-node search state, reused across searches on one map. An entry is live only when its stamp equals the
 * current search's, so starting a search costs nothing however many nodes the last one touched.
 */
interface Scratch {
  stamp: number;
  seen: Uint32Array;
  closed: Uint32Array;
  g: Float64Array;
  h: Float64Array;
  prev: Int32Array;
  heap: MinHeap;
  busy: boolean;
}

const scratchByMap = new WeakMap<GameMap, Scratch>();

function newScratch(size: number): Scratch {
  return { stamp: 0, seen: new Uint32Array(size), closed: new Uint32Array(size), g: new Float64Array(size), h: new Float64Array(size), prev: new Int32Array(size), heap: new MinHeap(), busy: false };
}

/**
 * A* over the map graph. `cost(from, to, km)` returns the cost of one edge, or
 * Infinity when the edge is impassable for this mover.
 */
export function findPath(
  map: GameMap,
  from: NodeId,
  to: NodeId,
  cost: (from: NodeId, to: NodeId, km: number) => number,
  maxExpanded = 200_000,
): NodeId[] | null {
  if (from === to) return [];
  let s = scratchByMap.get(map);
  if (!s) scratchByMap.set(map, (s = newScratch(map.size)));
  // A cost function that itself searches the same map gets its own buffers.
  else if (s.busy) s = newScratch(map.size);
  s.busy = true;
  try {
    return search(map, s, from, to, cost, maxExpanded);
  } finally {
    s.busy = false;
  }
}

function search(map: GameMap, s: Scratch, from: NodeId, to: NodeId, cost: (from: NodeId, to: NodeId, km: number) => number, maxExpanded: number): NodeId[] | null {
  if (s.stamp === 0xffffffff) {
    s.seen.fill(0);
    s.closed.fill(0);
    s.stamp = 0;
  }
  const stamp = ++s.stamp;
  const { seen, closed, g, h, prev, heap } = s;
  heap.clear();
  seen[from] = stamp;
  g[from] = 0;
  h[from] = map.distanceKm(from, to);
  heap.push(from, h[from]);
  let expanded = 0;
  while (heap.size) {
    const n = heap.pop();
    if (n === to) {
      const path: NodeId[] = [];
      for (let c = to as number; c !== from; c = prev[c]) path.push(c as NodeId);
      return path.reverse();
    }
    if (closed[n] === stamp) continue;
    closed[n] = stamp;
    if (++expanded > maxExpanded) return null;
    const gn = g[n];
    for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
      const m = map.adj[k];
      if (closed[m] === stamp) continue;
      const c = cost(n as NodeId, m as NodeId, map.adjKm[k]);
      if (!Number.isFinite(c)) continue;
      const gm = gn + c;
      if (seen[m] !== stamp) {
        seen[m] = stamp;
        h[m] = map.distanceKm(m as NodeId, to);
      } else if (gm >= g[m]) continue;
      g[m] = gm;
      prev[m] = n;
      heap.push(m, gm + h[m]);
    }
  }
  return null;
}

class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.ids.length;
  }
  clear() {
    this.ids.length = 0;
    this.keys.length = 0;
  }
  push(id: number, key: number) {
    const ids = this.ids, keys = this.keys;
    let i = ids.length;
    ids.push(id);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p];
      keys[i] = keys[p];
      i = p;
    }
    ids[i] = id;
    keys[i] = key;
  }
  pop(): number {
    const ids = this.ids, keys = this.keys;
    const top = ids[0];
    const id = ids.pop()!, key = keys.pop()!;
    if (ids.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, mk = key;
        if (l < ids.length && keys[l] < mk) { m = l; mk = keys[l]; }
        if (r < ids.length && keys[r] < mk) m = r;
        if (m === i) break;
        ids[i] = ids[m];
        keys[i] = keys[m];
        i = m;
      }
      ids[i] = id;
      keys[i] = key;
    }
    return top;
  }
}

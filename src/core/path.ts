import type { GameMap } from './map';
import type { NodeId } from './types';

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
  const g = new Map<number, number>([[from, 0]]);
  const prev = new Map<number, number>();
  const heap = new MinHeap();
  heap.push(from, map.distanceKm(from, to));
  const closed = new Set<number>();
  let expanded = 0;
  while (heap.size) {
    const n = heap.pop();
    if (n === to) {
      const path: NodeId[] = [];
      for (let c = to as number; c !== from; c = prev.get(c)!) path.push(c as NodeId);
      return path.reverse();
    }
    if (closed.has(n)) continue;
    closed.add(n);
    if (++expanded > maxExpanded) return null;
    const gn = g.get(n)!;
    for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
      const m = map.adj[k];
      if (closed.has(m)) continue;
      const c = cost(n as NodeId, m as NodeId, map.adjKm[k]);
      if (!Number.isFinite(c)) continue;
      const gm = gn + c;
      if (gm < (g.get(m) ?? Infinity)) {
        g.set(m, gm);
        prev.set(m, n);
        heap.push(m, gm + map.distanceKm(m as NodeId, to));
      }
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

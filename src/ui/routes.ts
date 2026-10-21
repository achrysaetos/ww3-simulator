import type { GameMap } from '../core/map';
import type { NodeId } from '../core/types';
import { geography } from '../systems/naval/geography';

/**
 * Land masses as the map's land edges join them, and the ports on each. The order panel uses it
 * to refuse a ground move across water before sending it, and to point a unit at a port.
 */
export class Routes {
  private readonly mass: Int32Array;
  readonly ports: readonly NodeId[];

  constructor(private readonly map: GameMap) {
    this.mass = new Int32Array(map.size).fill(-1);
    let next = 0;
    for (let start = 0; start < map.landCount; start++) {
      if (this.mass[start] >= 0) continue;
      const stack = [start];
      this.mass[start] = next;
      while (stack.length) {
        const n = stack.pop()!;
        for (const m of map.neighbors(n as NodeId)) {
          if (m >= map.landCount || this.mass[m] >= 0) continue;
          this.mass[m] = next;
          stack.push(m);
        }
      }
      next++;
    }
    this.ports = [...geography(map).portZone.keys()] as NodeId[];
  }

  /** True when no chain of land cells joins the two: a ground unit needs sealift. */
  overseas(from: NodeId, to: NodeId): boolean {
    return this.map.isSea(to) || this.mass[from] !== this.mass[to];
  }

  /** Nearest port on the same land mass that passes `ok`, by straight-line distance. */
  nearestPort(from: NodeId, ok: (port: NodeId) => boolean): NodeId | null {
    let best: NodeId | null = null, bestKm = Infinity;
    for (const p of this.ports) {
      if (this.mass[p] !== this.mass[from] || !ok(p)) continue;
      const km = this.map.distanceKm(from, p);
      if (km < bestKm) { bestKm = km; best = p; }
    }
    return best;
  }
}

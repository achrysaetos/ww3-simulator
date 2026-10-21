import { RIVER_LINES } from './rivers.data';

/** Rivers a land edge can cross, in a fixed order; `riverCrossings` stores index + 1. */
export const RIVER_NAMES: readonly string[] = Object.keys(RIVER_LINES).sort();

type Seg = [number, number, number, number];

/** River segments bucketed by the 1-degree square of each square their bounding box touches. */
function bucketSegments(): Map<number, { seg: Seg; river: number }[]> {
  const buckets = new Map<number, { seg: Seg; river: number }[]>();
  RIVER_NAMES.forEach((name, river) => {
    for (const line of RIVER_LINES[name])
      for (let i = 1; i < line.length; i++) {
        const seg: Seg = [line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]];
        for (let x = Math.floor(Math.min(seg[0], seg[2])); x <= Math.floor(Math.max(seg[0], seg[2])); x++)
          for (let y = Math.floor(Math.min(seg[1], seg[3])); y <= Math.floor(Math.max(seg[1], seg[3])); y++) {
            const k = y * 1000 + x;
            (buckets.get(k) ?? buckets.set(k, []).get(k)!).push({ seg, river });
          }
      }
  });
  return buckets;
}

const cross = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

function intersects(p: Seg, q: Seg): boolean {
  const d1 = cross(q[0], q[1], q[2], q[3], p[0], p[1]), d2 = cross(q[0], q[1], q[2], q[3], p[2], p[3]);
  const d3 = cross(p[0], p[1], p[2], p[3], q[0], q[1]), d4 = cross(p[0], p[1], p[2], p[3], q[2], q[3]);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/**
 * For each adjacency entry (parallel to `adj`), 1 + the index in RIVER_NAMES of a major river the
 * straight line between the two land cells' centres crosses, or 0. At half- to one-degree cells
 * that line stands for the way an army takes between them, so a river between two centres is one
 * the army must bridge.
 */
export function riverCrossings(lat: ArrayLike<number>, lon: ArrayLike<number>, adjStart: ArrayLike<number>, adj: ArrayLike<number>, landCount: number): Uint8Array {
  const out = new Uint8Array(adj.length);
  const buckets = bucketSegments();
  for (let n = 0; n < landCount; n++)
    for (let k = adjStart[n]; k < adjStart[n + 1]; k++) {
      const m = adj[k];
      if (m >= landCount) continue;
      const edge: Seg = [lon[n], lat[n], lon[m], lat[m]];
      // Edges across the antimeridian carry no rivers this table lists.
      if (Math.abs(edge[0] - edge[2]) > 180) continue;
      search: for (let x = Math.floor(Math.min(edge[0], edge[2])); x <= Math.floor(Math.max(edge[0], edge[2])); x++)
        for (let y = Math.floor(Math.min(edge[1], edge[3])); y <= Math.floor(Math.max(edge[1], edge[3])); y++)
          for (const s of buckets.get(y * 1000 + x) ?? [])
            if (intersects(edge, s.seg)) {
              out[k] = s.river + 1;
              break search;
            }
    }
  return out;
}

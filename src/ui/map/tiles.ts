/**
 * Which terrain tiles a frame needs. Tiles are equirectangular: z/x/y spans
 * 180/2^z degrees, x east from 180W, y south from 90N (scripts/build-tiles.ts).
 * The world exists to z3 and the theatres deeper, so a wanted tile resolves to
 * the deepest one the manifest has, and to a loaded ancestor while it loads.
 */
import { pxPerDeg, radius, unproject, type Camera, type Viewport } from '../view';

export const TILE_PX = 512;
export const MAX_Z = 8;

export interface TileKey {
  z: number;
  x: number;
  y: number;
}

export interface Manifest {
  tile: number;
  levels: Record<string, string[]>;
}

export const keyOf = (t: TileKey) => `${t.z}/${t.x}/${t.y}`;
export const spanOf = (z: number) => 180 / 2 ** z;

/** Level whose texels are about as dense as the screen's device pixels at the centre. */
export function levelFor(cam: Camera, dpr: number): number {
  const ppd = pxPerDeg(cam) * dpr;
  return Math.max(0, Math.min(MAX_Z, Math.ceil(Math.log2((ppd * 180 * 0.8) / TILE_PX))));
}

/** Lon/lat box the viewport shows, longitudes unwrapped around the camera so it can cross 180. */
export function viewBounds(cam: Camera, vp: Viewport): { w: number; s: number; e: number; n: number } {
  let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
  const add = (ll: [number, number] | null) => {
    if (!ll) return;
    const lon = cam.lon + ((((ll[0] - cam.lon) % 360) + 540) % 360) - 180;
    w = Math.min(w, lon); e = Math.max(e, lon); s = Math.min(s, ll[1]); n = Math.max(n, ll[1]);
  };
  const G = 10;
  for (let i = 0; i <= G; i++) for (let j = 0; j <= G; j++) add(unproject(cam, vp, (vp.width * i) / G, (vp.height * j) / G));
  const R = radius(cam), cx = vp.width / 2, cy = vp.height / 2;
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2, x = cx + Math.cos(a) * R * 0.999, y = cy + Math.sin(a) * R * 0.999;
    if (x >= 0 && y >= 0 && x <= vp.width && y <= vp.height) add(unproject(cam, vp, x, y));
  }
  // A visible pole puts every longitude in view.
  for (const pole of [90, -90]) {
    const p0 = cam.lat * Math.PI / 180, py = vp.height / 2 - R * Math.cos(p0) * Math.sign(pole);
    if (Math.abs(pole - cam.lat) < 90 && py >= 0 && py <= vp.height) {
      w = cam.lon - 180; e = cam.lon + 180;
      if (pole > 0) n = 90; else s = -90;
    }
  }
  if (w === Infinity) return { w: cam.lon, e: cam.lon, s: cam.lat, n: cam.lat };
  return { w, s, e, n };
}

/** Tiles at level z covering the view, wrapped into range. */
export function wantedTiles(cam: Camera, vp: Viewport, z: number): TileKey[] {
  const b = viewBounds(cam, vp), span = spanOf(z), cols = 2 ** (z + 1), rows = 2 ** z;
  const x0 = Math.floor((b.w + 180) / span), x1 = Math.floor((b.e + 180) / span);
  const y0 = Math.max(0, Math.floor((90 - b.n) / span)), y1 = Math.min(rows - 1, Math.floor((90 - b.s) / span));
  const out: TileKey[] = [], seen = new Set<number>();
  for (let xx = x0; xx <= Math.min(x1, x0 + cols - 1); xx++) {
    const x = ((xx % cols) + cols) % cols;
    if (seen.has(x)) continue;
    seen.add(x);
    for (let y = y0; y <= y1; y++) out.push({ z, x, y });
  }
  return out;
}

export class TileIndex {
  private readonly have: Set<string>;
  constructor(m: Manifest) {
    this.have = new Set(Object.entries(m.levels).flatMap(([z, keys]) => keys.map((k) => `${z}/${k}`)));
  }

  has(t: TileKey) {
    return this.have.has(keyOf(t));
  }

  /** The deepest tile the manifest has that contains `t`. */
  best(t: TileKey): TileKey {
    for (let z = t.z; z >= 0; z--) {
      const a = { z, x: t.x >> (t.z - z), y: t.y >> (t.z - z) };
      if (this.has(a)) return a;
    }
    return { z: 0, x: t.x >> t.z, y: 0 };
  }
}

export const parent = (t: TileKey): TileKey | null => (t.z === 0 ? null : { z: t.z - 1, x: t.x >> 1, y: t.y >> 1 });

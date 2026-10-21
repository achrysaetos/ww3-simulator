/**
 * The war situation as two lon/lat rasters the globe shader samples. Colour
 * carries meaning on this map, so territory is painted by its holder's
 * relation to the viewer, not by nation: only countries at war are tinted,
 * and ground held by someone other than its pre-war owner is hatched.
 */
import type { GameMap } from '../../core/map';
import { LAYER } from '../../systems/weather/effects';
import { NO_NATION } from '../snapshot';

export const Rel = { None: 0, Own: 1, Friend: 2, Enemy: 3, War: 4 } as const;
export type Rel = (typeof Rel)[keyof typeof Rel];

/** Degrees per texel. Control resolves the engine's finest cell (an eighth of a degree); overlays a quarter. */
export const MASK_RES = 0.125;
export const OVERLAY_RES = 0.25;
export const MASK_W = 360 / MASK_RES, MASK_H = 180 / MASK_RES;
export const OVERLAY_W = 360 / OVERLAY_RES, OVERLAY_H = 180 / OVERLAY_RES;

/**
 * Each nation's relation to the viewer. Friends share an enemy with the viewer
 * without fighting it. A spectator sees the first war from its defender's side.
 */
export function relations(nationIds: readonly string[], wars: readonly (readonly [string, string])[], playAs: string | null): Uint8Array {
  const viewer = playAs ?? wars[0]?.[1] ?? null;
  const enemies = new Set<string>(), atWar = new Set<string>();
  for (const [a, b] of wars) {
    atWar.add(a).add(b);
    if (a === viewer) enemies.add(b);
    if (b === viewer) enemies.add(a);
  }
  const friends = new Set<string>();
  for (const [a, b] of wars) {
    if (enemies.has(b) && a !== viewer && !enemies.has(a)) friends.add(a);
    if (enemies.has(a) && b !== viewer && !enemies.has(b)) friends.add(b);
  }
  return Uint8Array.from(nationIds, (id) =>
    id === viewer ? (atWar.has(id) ? Rel.Own : Rel.None) : enemies.has(id) ? Rel.Enemy : friends.has(id) ? Rel.Friend : atWar.has(id) ? Rel.War : Rel.None);
}

export interface Rect { x0: number; y0: number; x1: number; y1: number }

function texels(map: GameMap, n: number, res: number, w: number, h: number): Rect {
  const half = map.halfDeg[n];
  return {
    x0: Math.max(0, Math.round((map.lon[n] - half + 180) / res)),
    x1: Math.min(w, Math.round((map.lon[n] + half + 180) / res)),
    y0: Math.max(0, Math.round((90 - map.lat[n] - half) / res)),
    y1: Math.min(h, Math.round((90 - map.lat[n] + half) / res)),
  };
}

/** Texels the mask is smoothed over: two box passes of radius 1 round the cell staircase into a contour without swallowing a lone quarter-degree cell. */
const BLUR = 1;
const SMOOTH = 2 * BLUR;

const expand = (r: Rect, by: number): Rect => ({
  x0: Math.max(0, r.x0 - by), y0: Math.max(0, r.y0 - by), x1: Math.min(MASK_W, r.x1 + by), y1: Math.min(MASK_H, r.y1 + by),
});

/** One box-blur pass of radius `r` along x or y, in place over a w x h RGBA float region. */
function boxPass(a: Float32Array, w: number, h: number, r: number, alongX: boolean) {
  const n = alongX ? w : h, lines = alongX ? h : w, line = new Float32Array(n * 4);
  for (let l = 0; l < lines; l++) {
    const at = (i: number) => (alongX ? l * w + i : i * w + l) * 4;
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += a[at(Math.max(0, Math.min(n - 1, i))) + c];
      for (let i = 0; i < n; i++) {
        line[i * 4 + c] = sum / (2 * r + 1);
        sum += a[at(Math.min(n - 1, i + r + 1)) + c] - a[at(Math.max(0, i - r)) + c];
      }
    }
    for (let i = 0; i < n; i++) for (let c = 0; c < 4; c++) a[at(i) + c] = line[i * 4 + c];
  }
}

/**
 * Control mask, RGBA per texel: R friendly side, G enemy, B occupied, A
 * someone else's war. Repaints only cells whose holder or relation changed,
 * smooths around them, and reports the touched rectangle so the upload stays
 * small. `data` is the smoothed mask the shader samples.
 */
export class ControlMask {
  private readonly raw = new Uint8Array(MASK_W * MASK_H * 4);
  readonly data = new Uint8Array(MASK_W * MASK_H * 4);
  private readonly ownerIdx: Int32Array;
  private readonly painted: Uint32Array;
  private readonly rects: Rect[];

  constructor(private readonly map: GameMap, nationIds: readonly string[]) {
    this.ownerIdx = Int32Array.from({ length: map.landCount }, (_, n) => nationIds.indexOf(map.owner[n]));
    this.painted = new Uint32Array(map.landCount).fill(0xffffffff);
    this.rects = Array.from({ length: map.landCount }, (_, n) => texels(map, n, MASK_RES, MASK_W, MASK_H));
  }

  /** Returns the dirty rectangle, or null when nothing changed. */
  update(control: Uint16Array, rel: Uint8Array): Rect | null {
    let dirty: Rect | null = null;
    for (let n = 0; n < this.map.landCount; n++) {
      const holder = control[n];
      const r: number = holder === NO_NATION ? Rel.None : rel[holder];
      const occupied = r !== Rel.None && holder !== this.ownerIdx[n] && this.ownerIdx[n] >= 0 && rel[this.ownerIdx[n]] !== Rel.None ? 1 : 0;
      const code = r | (occupied << 3);
      if (this.painted[n] === code) continue;
      this.painted[n] = code;
      const px = [r === Rel.Own || r === Rel.Friend ? 255 : 0, r === Rel.Enemy ? 255 : 0, occupied ? 255 : 0, r === Rel.War ? 255 : 0];
      const t = this.rects[n];
      for (let y = t.y0; y < t.y1; y++) for (let x = t.x0; x < t.x1; x++) this.raw.set(px, (y * MASK_W + x) * 4);
      dirty = dirty ? { x0: Math.min(dirty.x0, t.x0), y0: Math.min(dirty.y0, t.y0), x1: Math.max(dirty.x1, t.x1), y1: Math.max(dirty.y1, t.y1) } : { ...t };
    }
    return dirty && this.smooth(dirty);
  }

  /** Re-smooths around a repainted rectangle; returns the rectangle of `data` that changed. */
  private smooth(dirty: Rect): Rect {
    const out = expand(dirty, SMOOTH), src = expand(dirty, 3 * SMOOTH);
    const w = src.x1 - src.x0, h = src.y1 - src.y0, a = new Float32Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      const from = ((src.y0 + y) * MASK_W + src.x0) * 4;
      for (let i = 0; i < w * 4; i++) a[y * w * 4 + i] = this.raw[from + i];
    }
    for (let k = 0; k < 2; k++) {
      boxPass(a, w, h, BLUR, true);
      boxPass(a, w, h, BLUR, false);
    }
    for (let y = out.y0; y < out.y1; y++) {
      const to = (y * MASK_W + out.x0) * 4, from = ((y - src.y0) * w + (out.x0 - src.x0)) * 4;
      for (let i = 0; i < (out.x1 - out.x0) * 4; i++) this.data[to + i] = Math.round(a[from + i]);
    }
    return out;
  }
}

export interface OverlayInput {
  air: Float32Array | null;
  sea: Float32Array | null;
  infra: Float32Array | null;
  fallout: Float32Array | null;
  weather: Float32Array | null;
}

type Rgba = readonly [number, number, number, number];
/** Side colours indexed by Rel. */
const SIDE: readonly (readonly [number, number, number])[] = [[150, 170, 190], [74, 163, 255], [74, 163, 255], [255, 77, 79], [255, 181, 71]];

/** Mud brown, snow white, rough sea and cyclones in deepening blue-violet; stronger with severity. */
function weatherColor(code: number): Rgba {
  const kind = Math.floor(code), s = code - kind;
  if (kind === LAYER.mud) return [150, 105, 55, 0.22 + 0.3 * s];
  if (kind === LAYER.snow) return [230, 238, 250, 0.16 + 0.26 * s];
  if (kind === LAYER.roughSea) return [70, 90, 200, 0.14 + 0.3 * s];
  return [170, 60, 220, 0.45];
}

/**
 * The toggleable layers composited into one premultiplied RGBA raster: air and
 * sea control in the holder's side colour, infrastructure damage, fallout and
 * weather. Rebuilt whole per snapshot; it is a quarter-degree grid.
 */
export class OverlayRaster {
  readonly data = new Uint8Array(OVERLAY_W * OVERLAY_H * 4);
  private readonly rects: Rect[];

  constructor(private readonly map: GameMap) {
    this.rects = Array.from({ length: map.size }, (_, n) => texels(map, n, OVERLAY_RES, OVERLAY_W, OVERLAY_H));
  }

  paint(input: OverlayInput, rel: Uint8Array) {
    this.data.fill(0);
    const { air, sea, infra, fallout, weather } = input;
    if (sea) for (let i = 0; i < sea.length; i += 3) this.blend(sea[i], [...SIDE[rel[sea[i + 1]]], 0.16 * sea[i + 2]]);
    if (air) for (let i = 0; i < air.length; i += 3) this.blend(air[i], [...SIDE[rel[air[i + 1]]], 0.12 * air[i + 2]]);
    if (infra) for (let i = 0; i < infra.length; i += 2) this.blend(infra[i], [255, 110, 40, Math.min(0.6, (1 - infra[i + 1]) * 0.8)]);
    if (fallout) for (let i = 0; i < fallout.length; i += 2) this.blend(fallout[i], [190, 255, 60, Math.min(0.65, fallout[i + 1] * 0.7)]);
    if (weather) for (let i = 0; i < weather.length; i += 2) this.blend(weather[i], weatherColor(weather[i + 1]));
  }

  /** Source-over in premultiplied space. */
  private blend(node: number, [r, g, b, a]: Rgba) {
    if (a <= 0) return;
    const t = this.rects[node], d = this.data, k = 1 - a;
    for (let y = t.y0; y < t.y1; y++) for (let x = t.x0; x < t.x1; x++) {
      const i = (y * OVERLAY_W + x) * 4;
      d[i] = r * a + d[i] * k;
      d[i + 1] = g * a + d[i + 1] * k;
      d[i + 2] = b * a + d[i + 2] * k;
      d[i + 3] = 255 * a + d[i + 3] * k;
    }
  }
}

/**
 * The war situation as two lon/lat rasters the globe shader samples. Colour
 * carries meaning on this map, so territory is painted by its holder's
 * relation to the viewer, not by nation: only countries at war are tinted,
 * and ground held by someone other than its pre-war owner is hatched.
 */
import type { GameMap } from '../../core/map';
import { LAYER } from '../../systems/weather/effects';
import { CONTEST_STRIDE, NO_NATION } from '../snapshot';

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

/**
 * Overlapping rectangles merged into their bounds. They are first pooled per POOL-texel square;
 * past MAX_POOLS squares the pools are returned as they are, which may overlap.
 */
export function clusters(rects: readonly Rect[]): Rect[] {
  const pooled = new Map<number, Rect>();
  for (const r of rects) {
    const k = Math.floor(r.x0 / POOL) * 4096 + Math.floor(r.y0 / POOL), p = pooled.get(k);
    pooled.set(k, p ? bounds([p, r]) : r);
  }
  if (pooled.size > MAX_POOLS) return [...pooled.values()];
  const out: Rect[] = [];
  for (const r of pooled.values()) {
    let m = r;
    for (let i = out.length - 1; i >= 0; i--) {
      const o = out[i];
      if (o.x0 < m.x1 && m.x0 < o.x1 && o.y0 < m.y1 && m.y0 < o.y1) {
        m = bounds([m, o]);
        out.splice(i, 1);
        i = out.length;
      }
    }
    out.push(m);
  }
  return out;
}

const POOL = 8;
const MAX_POOLS = 256;

export function bounds(rs: readonly Rect[]): Rect {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const r of rs) {
    b.x0 = Math.min(b.x0, r.x0);
    b.y0 = Math.min(b.y0, r.y0);
    b.x1 = Math.max(b.x1, r.x1);
    b.y1 = Math.max(b.y1, r.y1);
  }
  return b;
}

const area = (r: Rect) => (r.x1 - r.x0) * (r.y1 - r.y0);

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

const NO_CONTEST = new Float32Array(0);
/** How a cell is painted: holder code, attacker code, share pushed across, and the push's east and north. */
type Painting = [held: number, by: number, share: number, east: number, north: number];

/**
 * Control mask, RGBA per texel: R friendly side, G enemy, B occupied, A
 * someone else's war. A contested cell is painted as its attacker's from the
 * side the attack comes in, as far across as it has got, so the front line the
 * shader draws where the sides meet bulges into the cell as the attack presses.
 * Repaints only cells whose holder, relation or contest changed, smooths around
 * them, and reports the touched rectangle so the upload stays small. `data` is
 * the smoothed mask the shader samples.
 */
export class ControlMask {
  private readonly raw = new Uint8Array(MASK_W * MASK_H * 4);
  readonly data = new Uint8Array(MASK_W * MASK_H * 4);
  private readonly ownerIdx: Int32Array;
  /** Each land cell's last Painting. */
  private readonly painted: Float32Array;
  private readonly rects: Rect[];

  constructor(private readonly map: GameMap, nationIds: readonly string[]) {
    this.ownerIdx = Int32Array.from({ length: map.landCount }, (_, n) => nationIds.indexOf(map.owner[n]));
    this.painted = new Float32Array(map.landCount * 5).fill(NaN);
    this.rects = Array.from({ length: map.landCount }, (_, n) => texels(map, n, MASK_RES, MASK_W, MASK_H));
  }

  /** Returns the rectangles of `data` that changed, none when nothing did. `contest` is Snapshot.contest. */
  update(control: Uint16Array, rel: Uint8Array, contest: Float32Array = NO_CONTEST): Rect[] {
    const pushed = new Map<number, number>();
    for (let i = 0; i < contest.length; i += CONTEST_STRIDE) if (contest[i + 2] > 0 && (contest[i + 3] || contest[i + 4])) pushed.set(contest[i], i);
    const repainted: Rect[] = [];
    // Compared field by field, without a Painting per cell: a share of 0 is only ever painted as uncontested.
    const was = this.painted;
    for (let n = 0; n < this.map.landCount; n++) {
      const at = pushed.get(n), o = n * 5;
      const held = this.code(n, control[n], rel);
      if (at === undefined ? was[o] === held && was[o + 2] === 0 : was[o] === held && was[o + 1] === this.code(n, contest[at + 1], rel) && was[o + 2] === contest[at + 2] && was[o + 3] === contest[at + 3] && was[o + 4] === contest[at + 4]) continue;
      const now: Painting = at === undefined ? [held, 0, 0, 0, 0] : [held, this.code(n, contest[at + 1], rel), contest[at + 2], contest[at + 3], contest[at + 4]];
      was.set(now, o);
      this.paint(n, ...now);
      repainted.push(this.rects[n]);
    }
    // A texel of `data` depends on `raw` within SMOOTH of it, so each cluster smooths on its own, exactly;
    // one rectangle round them all is cheaper when their margins add up to more.
    const parts = clusters(repainted), all = parts.length > 1 ? [bounds(parts)] : parts;
    const cost = (rs: readonly Rect[]) => rs.reduce((a, r) => a + area(expand(r, 3 * SMOOTH)), 0);
    return (cost(all) < cost(parts) ? all : parts).map((r) => this.smooth(r));
  }

  /** The holder's relation to the viewer, with bit 3 set where it holds another side's ground. */
  private code(n: number, holder: number, rel: Uint8Array): number {
    const r: number = holder === NO_NATION ? Rel.None : rel[holder];
    const occupied = r !== Rel.None && holder !== this.ownerIdx[n] && this.ownerIdx[n] >= 0 && rel[this.ownerIdx[n]] !== Rel.None ? 1 : 0;
    return r | (occupied << 3);
  }

  /** Cell `n` in `held`'s colours, with the attacker's (`by`) over the `share` of it nearest where the attack comes from. */
  private paint(n: number, held: number, by: number, share: number, east: number, north: number) {
    const px = (code: number) => {
      const r = code & 7;
      return [r === Rel.Own || r === Rel.Friend ? 255 : 0, r === Rel.Enemy ? 255 : 0, code & 8 ? 255 : 0, r === Rel.War ? 255 : 0];
    };
    const h = px(held), a = px(by), t = this.rects[n];
    // Distance along the attack, in degrees of latitude, from the cell's centre; the attacker holds what lies behind `edge`.
    const k = Math.cos((this.map.lat[n] * Math.PI) / 180), along = k * Math.abs(east) + Math.abs(north);
    const edge = this.map.halfDeg[n] * along * (2 * share - 1), texel = MASK_RES * along;
    const out = [0, 0, 0, 0];
    for (let y = t.y0; y < t.y1; y++)
      for (let x = t.x0; x < t.x1; x++) {
        const s = ((x + 0.5) * MASK_RES - 180 - this.map.lon[n]) * k * east + (90 - (y + 0.5) * MASK_RES - this.map.lat[n]) * north;
        const w = share > 0 ? Math.min(1, Math.max(0, (edge - s) / texel + 0.5)) : 0;
        for (let c = 0; c < 4; c++) out[c] = Math.round(h[c] + (a[c] - h[c]) * w);
        this.raw.set(out, (y * MASK_W + x) * 4);
      }
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
 * weather, on a quarter-degree grid. Repaints only the cells whose layers changed.
 */
export class OverlayRaster {
  readonly data = new Uint8Array(OVERLAY_W * OVERLAY_H * 4);
  private readonly rects: Rect[];
  /** Each painted node's colours, bottom layer first, as of the last paint. */
  private painted = new Map<number, string>();

  constructor(private readonly map: GameMap) {
    this.rects = Array.from({ length: map.size }, (_, n) => texels(map, n, OVERLAY_RES, OVERLAY_W, OVERLAY_H));
  }

  /** Returns the rectangles of `data` that changed, none when nothing did. */
  paint(input: OverlayInput, rel: Uint8Array): Rect[] {
    const layers: [number, Rgba][] = [];
    const { air, sea, infra, fallout, weather } = input;
    if (sea) for (let i = 0; i < sea.length; i += 3) layers.push([sea[i], [...SIDE[rel[sea[i + 1]]], 0.16 * sea[i + 2]]]);
    if (air) for (let i = 0; i < air.length; i += 3) layers.push([air[i], [...SIDE[rel[air[i + 1]]], 0.12 * air[i + 2]]]);
    if (infra) for (let i = 0; i < infra.length; i += 2) layers.push([infra[i], [255, 110, 40, Math.min(0.6, (1 - infra[i + 1]) * 0.8)]]);
    if (fallout) for (let i = 0; i < fallout.length; i += 2) layers.push([fallout[i], [190, 255, 60, Math.min(0.65, fallout[i + 1] * 0.7)]]);
    if (weather) for (let i = 0; i < weather.length; i += 2) layers.push([weather[i], weatherColor(weather[i + 1])]);
    const now = new Map<number, string>();
    for (const [node, c] of layers) if (c[3] > 0) now.set(node, `${now.get(node) ?? ''}${c.join()};`);
    const changed: Rect[] = [];
    for (const [node, key] of now) if (this.painted.get(node) !== key) changed.push(this.rects[node]);
    for (const node of this.painted.keys()) if (!now.has(node)) changed.push(this.rects[node]);
    this.painted = now;
    // Cells can share a texel, so a changed rectangle is recomposited from every layer that reaches it.
    const dirty = clusters(changed.filter((r) => r.x1 > r.x0 && r.y1 > r.y0));
    for (const r of dirty) {
      for (let y = r.y0; y < r.y1; y++) this.data.fill(0, (y * OVERLAY_W + r.x0) * 4, (y * OVERLAY_W + r.x1) * 4);
      for (const [node, c] of layers) this.blend(node, c, r);
    }
    return dirty;
  }

  /** Source-over in premultiplied space, inside `clip`. */
  private blend(node: number, [r, g, b, a]: Rgba, clip: Rect) {
    if (a <= 0) return;
    const t = this.rects[node], d = this.data, k = 1 - a;
    const x0 = Math.max(t.x0, clip.x0), x1 = Math.min(t.x1, clip.x1), y0 = Math.max(t.y0, clip.y0), y1 = Math.min(t.y1, clip.y1);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * OVERLAY_W + x) * 4;
      d[i] = r * a + d[i] * k;
      d[i + 1] = g * a + d[i + 1] * k;
      d[i + 2] = b * a + d[i + 2] * k;
      d[i + 3] = 255 * a + d[i + 3] * k;
    }
  }
}

/**
 * Screen geometry. The base projection fits the globe to the canvas in CSS
 * pixels; pan and zoom are an affine transform on top, so cached Path2D
 * geometry stays valid until the canvas is resized.
 */
import { geoEqualEarth, type GeoProjection } from 'd3-geo';
import type { GameMap } from '../core/map';
import type { NodeId } from '../core/types';

export interface ViewTransform {
  k: number;
  x: number;
  y: number;
}

export const IDENTITY: ViewTransform = { k: 1, x: 0, y: 0 };
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 40;

export function baseProjection(width: number, height: number): GeoProjection {
  return geoEqualEarth().fitExtent([[6, 6], [width - 6, height - 6]], { type: 'Sphere' });
}

export function toScreen(proj: GeoProjection, t: ViewTransform, lon: number, lat: number): [number, number] | null {
  const p = proj([lon, lat]);
  return p ? [p[0] * t.k + t.x, p[1] * t.k + t.y] : null;
}

export function toLonLat(proj: GeoProjection, t: ViewTransform, sx: number, sy: number): [number, number] | null {
  const p = proj.invert?.([(sx - t.x) / t.k, (sy - t.y) / t.k]);
  if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[1]) > 90 || Math.abs(p[0]) > 180) return null;
  // Equal Earth's invert extrapolates outside the sphere; round-trip to reject clicks off the globe.
  const back = proj(p);
  if (!back || Math.hypot(back[0] - (sx - t.x) / t.k, back[1] - (sy - t.y) / t.k) > 0.5) return null;
  return p;
}

export function pickNode(map: GameMap, proj: GeoProjection, t: ViewTransform, sx: number, sy: number): NodeId | null {
  const ll = toLonLat(proj, t, sx, sy);
  return ll ? map.nodeAt(ll[1], ll[0]) : null;
}

/** Zoom about a screen point, clamped. */
export function zoomAt(t: ViewTransform, sx: number, sy: number, factor: number): ViewTransform {
  const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.k * factor));
  const f = k / t.k;
  return { k, x: sx - (sx - t.x) * f, y: sy - (sy - t.y) * f };
}

/** Center a lon/lat on screen at zoom k. */
export function centerOn(proj: GeoProjection, width: number, height: number, lon: number, lat: number, k: number): ViewTransform {
  const p = proj([lon, lat]) ?? [width / 2, height / 2];
  return { k, x: width / 2 - p[0] * k, y: height / 2 - p[1] * k };
}

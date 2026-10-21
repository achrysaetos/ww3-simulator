/**
 * Screen geometry. The map is one orthographic globe at every zoom: far out it
 * is a night Earth, close in the same projection is a flat-looking theatre or
 * front map, so zooming between them is continuous by construction. A camera
 * is the lon/lat under the screen centre and the globe's radius in CSS px.
 */
import type { GameMap } from '../core/map';
import type { NodeId } from '../core/types';

export interface Camera {
  lon: number;
  lat: number;
  /** log2 of the globe radius in CSS px. */
  zoom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export type ZoomBand = 'world' | 'theatre' | 'front';

const RAD = Math.PI / 180;
/** Where the semantic bands begin, in CSS px per degree of latitude. */
export const BAND_START: Record<ZoomBand, number> = { world: 0, theatre: 20, front: 260 };
/** Zoom each band's button flies to. A half-degree front cell is ~300 px wide at the front preset. */
export const BAND_PRESET: Record<Exclude<ZoomBand, 'world'>, number> = { theatre: 80, front: 600 };
/** Closest zoom: an eighth-degree cell (the engine's finest) still spans ~175 px, so nothing finer is implied. */
export const MAX_PX_PER_DEG = 1400;

export const radius = (c: Camera) => 2 ** c.zoom;
export const pxPerDeg = (c: Camera) => radius(c) * RAD;
export const zoomForPxPerDeg = (ppd: number) => Math.log2(ppd / RAD);
/** Globe radius that fits the whole Earth in the viewport with room for the atmosphere. */
export const worldZoom = (vp: Viewport) => Math.log2(0.42 * Math.min(vp.width, vp.height));
const minZoom = (vp: Viewport) => Math.log2(0.3 * Math.min(vp.width, vp.height));

export function bandOf(c: Camera): ZoomBand {
  const p = pxPerDeg(c);
  return p >= BAND_START.front ? 'front' : p >= BAND_START.theatre ? 'theatre' : 'world';
}

/** Screen position of a lon/lat, or null when it is on the far side of the globe. */
export function project(c: Camera, vp: Viewport, lon: number, lat: number): [number, number] | null {
  const l = (lon - c.lon) * RAD, p = lat * RAD, p0 = c.lat * RAD;
  const cp = Math.cos(p), sp = Math.sin(p), cp0 = Math.cos(p0), sp0 = Math.sin(p0), cl = Math.cos(l);
  if (sp0 * sp + cp0 * cp * cl < 0) return null;
  const R = radius(c);
  return [vp.width / 2 + R * cp * Math.sin(l), vp.height / 2 - R * (cp0 * sp - sp0 * cp * cl)];
}

/** Lon/lat under a screen point, or null off the globe. */
export function unproject(c: Camera, vp: Viewport, sx: number, sy: number): [number, number] | null {
  const R = radius(c);
  const x = (sx - vp.width / 2) / R, y = (vp.height / 2 - sy) / R, rho = Math.hypot(x, y);
  if (rho > 1) return null;
  if (rho === 0) return [c.lon, c.lat];
  const sc = rho, cc = Math.sqrt(1 - rho * rho), p0 = c.lat * RAD;
  const lat = Math.asin(cc * Math.sin(p0) + (y * sc * Math.cos(p0)) / rho);
  const lon = c.lon * RAD + Math.atan2(x * sc, rho * Math.cos(p0) * cc - y * Math.sin(p0) * sc);
  return [((((lon / RAD) + 540) % 360) - 180), lat / RAD];
}

export function pickNode(map: GameMap, c: Camera, vp: Viewport, sx: number, sy: number): NodeId | null {
  const ll = unproject(c, vp, sx, sy);
  return ll ? map.nodeAt(ll[1], ll[0]) : null;
}

export function clampCamera(c: Camera, vp: Viewport): Camera {
  return {
    lon: ((((c.lon + 180) % 360) + 360) % 360) - 180,
    lat: Math.max(-80, Math.min(80, c.lat)),
    zoom: Math.max(minZoom(vp), Math.min(zoomForPxPerDeg(MAX_PX_PER_DEG), c.zoom)),
  };
}

/** Rotate the globe so the content moves by (dx, dy) screen px near the centre. */
export function panBy(c: Camera, vp: Viewport, dx: number, dy: number): Camera {
  const R = radius(c);
  const cos = Math.max(0.2, Math.cos(c.lat * RAD));
  return clampCamera({ ...c, lon: c.lon - dx / (R * cos) / RAD, lat: c.lat + dy / R / RAD }, vp);
}

/** Pan so that a lon/lat lands on a screen point. Each step undershoots near the limb, so iterate to a fiftieth of a pixel. */
export function pinTo(c: Camera, vp: Viewport, lon: number, lat: number, sx: number, sy: number): Camera {
  let out = c;
  for (let i = 0; i < 24; i++) {
    const q = project(out, vp, lon, lat);
    if (!q || Math.hypot(sx - q[0], sy - q[1]) < 0.02) break;
    out = panBy(out, vp, sx - q[0], sy - q[1]);
  }
  return out;
}

/** Zoom about a screen point, keeping the ground under it fixed. */
export function zoomAt(c: Camera, vp: Viewport, sx: number, sy: number, factor: number): Camera {
  const ll = unproject(c, vp, sx, sy);
  const next = clampCamera({ ...c, zoom: c.zoom + Math.log2(factor) }, vp);
  return ll ? pinTo(next, vp, ll[0], ll[1], sx, sy) : next;
}

/** Shortest signed longitude difference b - a. */
const dLon = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

/** Great-circle angle between two lon/lats, degrees. */
export function arcDeg(lon0: number, lat0: number, lon1: number, lat1: number): number {
  const a = Math.sin(lat0 * RAD) * Math.sin(lat1 * RAD) + Math.cos(lat0 * RAD) * Math.cos(lat1 * RAD) * Math.cos((lon1 - lon0) * RAD);
  return Math.acos(Math.max(-1, Math.min(1, a))) / RAD;
}

/**
 * A camera path for a flight: the centre glides along the shortest way while
 * the zoom pulls out far enough to keep both ends in view, then settles in.
 */
export function flight(from: Camera, to: Camera, vp: Viewport): { at(t: number): Camera; ms: number } {
  const dist = arcDeg(from.lon, from.lat, to.lon, to.lat);
  const span = Math.min(vp.width, vp.height) / 2;
  // Zoom at which the whole trip fits on screen; the path dips to it mid-flight if both ends are closer in.
  const fit = Math.log2(span / Math.max(1e-6, Math.sin(Math.min(90, dist) * RAD))) - 0.3;
  const low = Math.min(from.zoom, to.zoom, Math.max(fit, worldZoom(vp)));
  const dz = Math.abs(from.zoom - to.zoom) + 2 * (Math.min(from.zoom, to.zoom) - low);
  const ms = Math.min(2600, 500 + 170 * dz + 6 * dist);
  const lon = dLon(from.lon, to.lon);
  return {
    ms,
    at(t) {
      const u = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
      const base = from.zoom + (to.zoom - from.zoom) * u;
      const dip = Math.max(0, Math.min(from.zoom, to.zoom) - low) * 4 * u * (1 - u);
      // Move the centre mostly while zoomed out, so the ground never streaks past at close zoom.
      const m = u * u * (3 - 2 * u);
      return { lon: from.lon + lon * m, lat: from.lat + (to.lat - from.lat) * m, zoom: base - dip };
    },
  };
}

/** Kilometres per CSS px at the screen centre. */
export const kmPerPx = (c: Camera) => 111.32 / pxPerDeg(c);

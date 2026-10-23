import { describe, expect, it } from 'vitest';

import { loadMap } from '../src/data/load';
import { ControlMask, MASK_RES, MASK_W, OVERLAY_W, OverlayRaster, Rel, relations, type Rect } from '../src/ui/map/situation';
import { levelFor, spanOf, TileIndex, wantedTiles, type TileKey } from '../src/ui/map/tiles';
import { scaleBar } from '../src/ui/map/ZoomControl';
import { NO_NATION } from '../src/ui/snapshot';
import { unproject, zoomForPxPerDeg, type Camera } from '../src/ui/view';

describe('side colours', () => {
  const ids = ['UKR', 'RUS', 'POL', 'BLR', 'IND', 'PAK', 'FRA'];
  const rel = (wars: [string, string][], playAs: string | null) => Object.fromEntries(ids.map((id, i) => [id, relations(ids, wars, playAs)[i]]));

  it('tints only nations at war, by their side relative to the player', () => {
    expect(rel([['RUS', 'UKR'], ['RUS', 'POL'], ['IND', 'PAK']], 'UKR')).toEqual({
      UKR: Rel.Own, RUS: Rel.Enemy, POL: Rel.Friend, BLR: Rel.None, IND: Rel.War, PAK: Rel.War, FRA: Rel.None,
    });
  });

  it('leaves the player untinted at peace, and shows a spectator the first war from the defender side', () => {
    expect(rel([['IND', 'PAK']], 'FRA').FRA).toBe(Rel.None);
    expect(rel([['RUS', 'UKR']], null)).toMatchObject({ UKR: Rel.Own, RUS: Rel.Enemy });
  });
});

describe('control mask', () => {
  const map = loadMap();
  const ids = map.nationIds as readonly string[];
  const at = (lat: number, lon: number) => map.nodeAt(lat, lon);
  const texel = (mask: ControlMask, lat: number, lon: number) => {
    const i = (Math.floor((90 - lat) / MASK_RES) * MASK_W + Math.floor((lon + 180) / MASK_RES)) * 4;
    return Array.from(mask.data.subarray(i, i + 4));
  };
  const control = () => Uint16Array.from({ length: map.size }, (_, n) => (n < map.landCount ? ids.indexOf(map.owner[n]) : NO_NATION));
  const ukr = ids.indexOf('UKR'), rus = ids.indexOf('RUS');
  const rel = relations(ids, [['RUS', 'UKR']], 'UKR');

  it('marks friendly and enemy ground, hatches occupied cells, and fades across the border', () => {
    const mask = new ControlMask(map, ids);
    const ctl = control();
    const melitopol = at(46.85, 35.37);
    ctl[melitopol] = rus;
    expect(mask.update(ctl, rel)).not.toEqual([]);
    expect(texel(mask, 50.45, 30.52)).toEqual([255, 0, 0, 0]);
    expect(texel(mask, 55.75, 37.62)).toEqual([0, 255, 0, 0]);
    const [, enemy, occupied] = texel(mask, map.lat[melitopol], map.lon[melitopol]);
    expect(enemy).toBeGreaterThan(128);
    expect(occupied).toBeGreaterThan(128);
    expect(texel(mask, 52.23, 21.01)).toEqual([0, 0, 0, 0]);
    // Smoothed: somewhere between Kharkiv and Belgorod both sides are partly present.
    const across = Array.from({ length: 40 }, (_, k) => texel(mask, 50.0 + k * 0.02, 36.6));
    expect(across.some(([f, e]) => f > 20 && f < 235 && e > 20 && e < 235)).toBe(true);
  });

  it('repaints only what changed and reports where', () => {
    const mask = new ControlMask(map, ids);
    const ctl = control();
    mask.update(ctl, rel);
    expect(mask.update(ctl, rel)).toEqual([]);
    const kharkiv = at(49.99, 36.23);
    ctl[kharkiv] = rus;
    const [dirty, ...more] = mask.update(ctl, rel);
    expect(more).toEqual([]);
    const x = (map.lon[kharkiv] + 180) / MASK_RES, y = (90 - map.lat[kharkiv]) / MASK_RES;
    expect(dirty.x0).toBeLessThan(x);
    expect(dirty.x1).toBeGreaterThan(x);
    expect(dirty.y0).toBeLessThan(y);
    expect(dirty.y1).toBeGreaterThan(y);
    expect((dirty.x1 - dirty.x0) * MASK_RES).toBeLessThan(3);
    expect(texel(mask, map.lat[kharkiv], map.lon[kharkiv])[1]).toBeGreaterThan(128);
    expect(ukr).toBeGreaterThanOrEqual(0);
  });

  it('pushes the front into a contested cell as far as the attacker has got, from the side it attacks from', () => {
    const mask = new ControlMask(map, ids);
    const ctl = control();
    const kharkiv = at(49.75, 36.25), north = at(50.25, 36.25);
    ctl[north] = rus;
    mask.update(ctl, rel);
    // Rows down the middle of Kharkiv's cell, north to south, that read more enemy than friendly.
    const enemyRows = () => Array.from({ length: 20 }, (_, k) => texel(mask, map.lat[kharkiv] + 0.24 - k * 0.025, map.lon[kharkiv])).filter(([f, e]) => e > f).length;
    const pressed = (share: number) => Float32Array.from([kharkiv, rus, share, 0, -1]);
    const before = enemyRows();
    expect(mask.update(ctl, rel, pressed(0.25))).not.toEqual([]);
    const quarter = enemyRows();
    mask.update(ctl, rel, pressed(0.75));
    const most = enemyRows();
    expect(quarter).toBeGreaterThan(before);
    expect(most).toBeGreaterThan(quarter + 5);
    expect(most).toBeLessThan(20);
    expect(texel(mask, map.lat[kharkiv] - 0.24, map.lon[kharkiv])[0]).toBeGreaterThan(128);
    expect(mask.update(ctl, rel, pressed(0.75))).toEqual([]);
    mask.update(ctl, rel);
    expect(enemyRows()).toBe(before);
  });
});

describe('incremental repaint', () => {
  const map = loadMap();
  const ids = map.nationIds as readonly string[];
  const rel = relations(ids, [['RUS', 'UKR']], 'UKR');
  const rus = ids.indexOf('RUS');
  /** Every texel where `a` and `b` differ lies inside one of `rects`. */
  const covered = (a: Uint8Array, b: Uint8Array, width: number, rects: readonly Rect[]) => {
    for (let i = 0; i < a.length; i += 4) {
      if (a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2] && a[i + 3] === b[i + 3]) continue;
      const x = (i / 4) % width, y = Math.floor(i / 4 / width);
      if (!rects.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1)) return false;
    }
    return true;
  };

  it('repaints far-apart changes as separate rectangles, matching a mask painted from scratch', () => {
    const ctl = Uint16Array.from({ length: map.size }, (_, n) => ids.indexOf(map.owner[n]));
    const mask = new ControlMask(map, ids);
    mask.update(ctl, rel);
    const before = mask.data.slice();
    ctl[map.nodeAt(49.99, 36.23)] = rus;
    ctl[map.nodeAt(46.48, 30.73)] = rus;
    const dirty = mask.update(ctl, rel);
    expect(dirty).toHaveLength(2);
    expect(covered(before, mask.data, MASK_W, dirty)).toBe(true);
    const fresh = new ControlMask(map, ids);
    fresh.update(ctl, rel);
    expect(Buffer.compare(mask.data, fresh.data)).toBe(0);
  });

  it('repaints only the overlay cells whose layers changed, matching a raster painted from scratch', () => {
    const kyiv = map.nodeAt(50.45, 30.52), odesa = map.nodeAt(46.48, 30.73), lviv = map.nodeAt(49.84, 24.03);
    const none = { air: null, sea: null, fallout: null, weather: null };
    const a = { ...none, infra: Float32Array.from([kyiv, 0.5, odesa, 0.7]) };
    const b = { ...none, infra: Float32Array.from([kyiv, 0.5, lviv, 0.2]) };
    const raster = new OverlayRaster(map);
    expect(raster.paint(a, rel).length).toBeGreaterThan(0);
    expect(raster.paint(a, rel)).toEqual([]);
    const before = raster.data.slice();
    const dirty = raster.paint(b, rel);
    expect(dirty.length).toBeGreaterThan(0);
    expect(covered(before, raster.data, OVERLAY_W, dirty)).toBe(true);
    const fresh = new OverlayRaster(map);
    fresh.paint(b, rel);
    expect(Buffer.compare(raster.data, fresh.data)).toBe(0);
    expect(raster.data.some((v) => v > 0)).toBe(true);
  });
});

describe('terrain tiles', () => {
  const vp = { width: 1440, height: 900 };
  const covers = (t: TileKey, lon: number, lat: number) => {
    const s = spanOf(t.z), w = -180 + t.x * s, n = 90 - t.y * s;
    return lon >= w - 1e-9 && lon <= w + s + 1e-9 && lat <= n + 1e-9 && lat >= n - s - 1e-9;
  };

  it.each<[string, Camera]>([
    ['the night globe', { lon: 22, lat: 38, zoom: Math.log2(378) }],
    ['a theatre', { lon: 33.6, lat: 48.3, zoom: zoomForPxPerDeg(80) }],
    ['a front', { lon: 35.85, lat: 47.42, zoom: zoomForPxPerDeg(560) }],
    ['the date line', { lon: 179.5, lat: 52, zoom: zoomForPxPerDeg(60) }],
    ['the pole', { lon: 10, lat: 78, zoom: zoomForPxPerDeg(25) }],
  ])('leaves no hole in the view over %s', (_, cam) => {
    const z = levelFor(cam, 1), tiles = wantedTiles(cam, vp, z);
    for (let i = 0; i <= 24; i++) for (let j = 0; j <= 24; j++) {
      const ll = unproject(cam, vp, (vp.width * i) / 24, (vp.height * j) / 24);
      if (ll) expect(tiles.some((t) => covers(t, ll[0], ll[1])), `${ll}`).toBe(true);
    }
    expect(tiles.length).toBeLessThan(80);
  });

  it('asks for finer tiles closer in, and falls back to the deepest tile that exists', () => {
    const levels = [20, 80, 200, 600, 1400].map((p) => levelFor({ lon: 0, lat: 0, zoom: zoomForPxPerDeg(p) }, 1));
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(levels[0]).toBeLessThan(levels[4]);
    const index = new TileIndex({ tile: 512, levels: { 0: ['0/0', '1/0'], 1: ['2/0'], 3: ['9/1'] } });
    expect(index.best({ z: 5, x: 38, y: 7 })).toEqual({ z: 3, x: 9, y: 1 });
    expect(index.best({ z: 5, x: 0, y: 7 })).toEqual({ z: 0, x: 0, y: 0 });
  });
});

describe('scale bar', () => {
  it('reads as a round distance no longer than the space it has', () => {
    for (const kmPerPx of [0.05, 0.2, 1.3, 7, 40]) {
      const { km, px } = scaleBar(kmPerPx);
      expect(px).toBeLessThanOrEqual(110);
      expect(px).toBeGreaterThan(40);
      expect([1, 2, 5]).toContain(Number((km / 10 ** Math.floor(Math.log10(km))).toFixed(6)));
    }
  });
});


/* global d3 */
// Runs inside headless Chromium for scripts/build-tiles.ts: one call to renderTile per tile.
// The colour recipe follows the redesign's map pipeline (ui-redesign/map-pipeline/theatre.html).
const TILE = 512;
const SRC = 'http://tiles.local/';
const dems = [];
const layers = {};

const mix = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

async function json(name) { return (await fetch(SRC + name)).json(); }

/** Halves a grid by 2x2 averaging, for tiles coarser than the source. */
function halve(g) {
  const rows = g.rows >> 1, cols = g.cols >> 1, z = new Int16Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = 2 * r * g.cols + 2 * c;
    z[r * cols + c] = (g.z[i] + g.z[i + 1] + g.z[i + g.cols] + g.z[i + g.cols + 1]) / 4;
  }
  return { ...g, rows, cols, z, step: g.step * 2, s: g.s + g.step / 2, w: g.w + g.step / 2 };
}

/** Polygons and lines split into parts with a bounding box each, so a tile only draws what overlaps it. */
function parts(fc, keep = () => true) {
  const out = [];
  for (const f of fc.features) {
    if (!f.geometry || !keep(f.properties || {})) continue;
    const g = f.geometry;
    const polys = g.type === 'MultiPolygon' ? g.coordinates.map((c) => ({ type: 'Polygon', coordinates: c }))
      : g.type === 'MultiLineString' ? g.coordinates.map((c) => ({ type: 'LineString', coordinates: c }))
        : [g];
    for (const geom of polys) {
      let w = 180, s = 90, e = -180, n = -90;
      const scan = (a) => { if (typeof a[0] === 'number') { w = Math.min(w, a[0]); e = Math.max(e, a[0]); s = Math.min(s, a[1]); n = Math.max(n, a[1]); } else a.forEach(scan); };
      scan(geom.coordinates);
      out.push({ geom, props: f.properties || {}, bbox: [w, s, e, n] });
    }
  }
  return out;
}

window.init = async (names) => {
  for (const name of names) {
    const meta = await json(name + '.json');
    const z = new Int16Array(await (await fetch(SRC + name + '.i16')).arrayBuffer());
    const g = { name, ...meta, z, wrap: name === 'world' };
    dems.push(g);
    if (name === 'world') for (let k = 0, h = g; k < 4; k++) dems.push((h = halve(h)));
  }
  const load = async (n, keep) => (layers[n] = parts(await json(n + '.geojson'), keep));
  await load('ne_110m_land');
  await load('ne_50m_land');
  await load('ne_10m_land');
  await load('ne_50m_lakes');
  await load('ne_10m_lakes', (p) => (p.scalerank ?? 0) <= 8);
  await load('ne_50m_rivers_lake_centerlines');
  await load('ne_10m_rivers_lake_centerlines');
  await load('ne_10m_roads', (p) => (p.scalerank ?? 9) <= 8 && p.featurecla !== 'Ferry');
  await load('ne_10m_railroads', (p) => (p.scalerank ?? 9) <= 8);
  await load('ne_10m_urban_areas');
  await load('ne_50m_admin_0_boundary_lines_land');
  await load('ne_10m_admin_0_boundary_lines_land');
  console.log('loaded', dems.length, 'grids');
};

/** The coarsest grid that still has a sample per pixel over the whole tile. */
function demFor(west, south, east, north, px) {
  const covering = dems.filter((g) => g.wrap || (g.w <= west + 1e-6 && g.s <= south + 1e-6 && g.w + (g.cols - 1) * g.step >= east - 1e-6 && g.s + (g.rows - 1) * g.step >= north - 1e-6));
  const fine = covering.filter((g) => g.step <= px * 1.05).sort((a, b) => b.step - a.step);
  return fine[0] ?? covering.sort((a, b) => a.step - b.step)[0];
}

function sampler(g) {
  return (lon, lat) => {
    let fc = (lon - g.w) / g.step;
    if (g.wrap) fc = ((fc % g.cols) + g.cols) % g.cols;
    const fr = clamp((lat - g.s) / g.step, 0, g.rows - 1.001);
    fc = clamp(fc, 0, g.cols - 1.001);
    const r = Math.floor(fr), c = Math.floor(fc), a = fr - r, b = fc - c, i = r * g.cols + c;
    const c1 = g.wrap && c + 1 >= g.cols ? i + 1 - g.cols : i + 1;
    return (g.z[i] * (1 - b) + g.z[c1] * b) * (1 - a) + (g.z[i + g.cols] * (1 - b) + g.z[c1 + g.cols] * b) * a;
  };
}

const AZ = [[315, 0.5], [270, 0.2], [0, 0.3]].map(([a, w]) => [((360 - a + 90) * Math.PI) / 180, w]);
const ALT = (45 * Math.PI) / 180;
function shade(gx, gy) {
  const slope = Math.atan(Math.hypot(gx, gy)), aspect = Math.atan2(gy, -gx);
  let h = 0;
  for (const [az, w] of AZ) h += w * (Math.cos(Math.PI / 2 - ALT) * Math.cos(slope) + Math.sin(Math.PI / 2 - ALT) * Math.sin(slope) * Math.cos(az - aspect));
  return Math.max(0, h);
}

/** Vertical exaggeration per level: coarse pixels average slopes away, so they need more. */
const EXAG = [34, 26, 20, 16, 12, 10, 9, 9];

window.renderTile = (z, x, y) => {
  const span = 180 / 2 ** z, west = -180 + x * span, north = 90 - y * span, east = west + span, south = north - span;
  const px = span / TILE;
  const PAD = 24;
  const proj = d3.geoIdentity().reflectY(true).scale(1 / px).translate([-west / px, north / px]).clipExtent([[-PAD, -PAD], [TILE + PAD, TILE + PAD]]);
  const overlaps = (b, m) => b[2] >= west - m && b[0] <= east + m && b[3] >= south - m && b[1] <= north + m;
  const draw = (ctx, list, fn, margin = px * PAD) => {
    const path = d3.geoPath(proj, ctx);
    for (const p of list) if (overlaps(p.bbox, margin)) { ctx.beginPath(); path(p.geom); fn(ctx, p.props); }
  };

  // Land mask: Natural Earth land minus lakes, antialiased.
  const mc = new OffscreenCanvas(TILE, TILE), m = mc.getContext('2d');
  m.fillStyle = '#000';
  m.fillRect(0, 0, TILE, TILE);
  draw(m, layers[z <= 1 ? 'ne_110m_land' : z <= 3 ? 'ne_50m_land' : 'ne_10m_land'], (c) => { c.fillStyle = '#fff'; c.fill(); });
  draw(m, layers[z <= 3 ? 'ne_50m_lakes' : 'ne_10m_lakes'], (c) => { c.fillStyle = '#000'; c.fill(); });
  const mask = m.getImageData(0, 0, TILE, TILE).data;

  const Z = sampler(demFor(west, south, east, north, px));
  const zf = EXAG[z] ?? 9;
  const canvas = new OffscreenCanvas(TILE, TILE), ctx = canvas.getContext('2d');
  const img = ctx.createImageData(TILE, TILE), d = img.data;
  const dy = px * 111320;
  for (let j = 0; j < TILE; j++) {
    const lat = north - (j + 0.5) * px, dx = Math.max(dy * 0.05, dy * Math.cos((lat * Math.PI) / 180));
    for (let i = 0; i < TILE; i++) {
      const lon = west + (i + 0.5) * px;
      const e = Z(lon, lat);
      const gx = (Z(lon + px, lat) - Z(lon - px, lat)) / (2 * dx), gy = (Z(lon, lat + px) - Z(lon, lat - px)) / (2 * dy);
      const k = (j * TILE + i) * 4, land = mask[k] / 255;
      let r = 0, g = 0, b = 0;
      if (land > 0) {
        const t = Math.pow(clamp(e / 1800, 0, 1), 0.55), f = 0.32 + 0.98 * shade(gx * zf, gy * zf);
        // The Antarctic ice sheet reads as cold slate, not as high desert.
        const ice = clamp((-62 - lat) / 4, 0, 1);
        r += land * mix(mix(34, 74, t), 52, ice) * f; g += land * mix(mix(42, 70, t), 62, ice) * f; b += land * mix(mix(44, 60, t), 76, ice) * f;
      }
      if (land < 1) {
        const t = Math.pow(clamp(-e / 2200, 0, 1), 0.5), f = 0.82 + 0.28 * shade(gx * 2, gy * 2), w = 1 - land;
        r += w * mix(18, 5, t) * f; g += w * mix(44, 13, t) * f; b += w * mix(64, 27, t) * f;
      }
      d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const lw = (base) => base * Math.min(1.6, 0.55 + 0.17 * z);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (z >= 5) draw(ctx, layers.ne_10m_urban_areas, (c) => { c.fillStyle = z >= 6 ? 'rgba(255,196,120,0.15)' : 'rgba(255,196,120,0.10)'; c.fill(); });
  if (z >= 6) {
    ctx.setLineDash([5, 4]);
    draw(ctx, layers.ne_10m_railroads, (c) => { c.strokeStyle = 'rgba(200,210,225,0.16)'; c.lineWidth = 1.1; c.stroke(); });
    ctx.setLineDash([]);
  }
  if (z >= 5) draw(ctx, layers.ne_10m_roads, (c, p) => {
    const major = /Major|Highway/i.test(p.type || '') || (p.scalerank ?? 9) <= 5;
    if (z === 5 && !major) return;
    c.strokeStyle = major ? `rgba(232,206,160,${z >= 6 ? 0.28 : 0.18})` : 'rgba(210,200,180,0.14)';
    c.lineWidth = major ? lw(1.7) : lw(1);
    c.stroke();
  });
  const maxRank = [3, 4, 5, 6, 7, 8, 9, 10][z] ?? 10;
  draw(ctx, layers[z <= 4 ? 'ne_50m_rivers_lake_centerlines' : 'ne_10m_rivers_lake_centerlines'], (c, p) => {
    const sr = p.scalerank ?? 8;
    if (sr > maxRank) return;
    c.strokeStyle = `rgba(105,160,205,${sr <= 4 ? 0.62 : 0.4})`;
    c.lineWidth = Math.max(0.6, lw(3.4 - 0.36 * sr));
    c.stroke();
  });
  ctx.shadowColor = 'rgba(90,170,230,0.55)';
  ctx.shadowBlur = z >= 4 ? 7 : 4;
  draw(ctx, layers[z <= 1 ? 'ne_110m_land' : z <= 3 ? 'ne_50m_land' : 'ne_10m_land'], (c) => { c.strokeStyle = 'rgba(120,185,230,0.32)'; c.lineWidth = lw(1.5); c.stroke(); });
  ctx.shadowBlur = 0;
  ctx.setLineDash(z >= 4 ? [7, 5] : [4, 3]);
  draw(ctx, layers[z <= 3 ? 'ne_50m_admin_0_boundary_lines_land' : 'ne_10m_admin_0_boundary_lines_land'], (c) => { c.strokeStyle = 'rgba(214,224,236,0.36)'; c.lineWidth = lw(1.4); c.stroke(); });
  ctx.setLineDash([]);

  // Alpha carries the land mask for the runtime tint. Water keeps alpha 160, not 0: the canvas
  // stores premultiplied colour, so a fully transparent pixel would lose its RGB on encode.
  const out = ctx.getImageData(0, 0, TILE, TILE), o = out.data;
  for (let k = 0; k < o.length; k += 4) o[k + 3] = 160 + Math.round((95 * mask[k]) / 255);
  ctx.putImageData(out, 0, 0);
  return canvas.convertToBlob({ type: 'image/webp', quality: 0.8 }).then((blob) => blob.arrayBuffer()).then((buf) => {
    let s = '';
    const u = new Uint8Array(buf);
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  });
};

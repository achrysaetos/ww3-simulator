/**
 * Offline terrain pipeline for the map. Downloads NOAA ETOPO 2022 relief
 * (15 arc-second grid, served by NOAA CoastWatch ERDDAP) and Natural Earth
 * vectors (public domain, naturalearthdata.com), then renders a pyramid of
 * equirectangular 512 px WebP tiles in headless Chromium: shaded relief and
 * bathymetry, lakes, rivers, roads, rails, urban areas, coast glow and borders
 * in RGB, and a land mask in alpha for the runtime territory tint.
 *
 * Place names come from GeoNames cities5000 (CC BY 4.0, geonames.org).
 *
 * Tile z/x/y spans 180/2^z degrees; x counts east from 180W, y south from 90N.
 * The whole world is cut to z3, the playable theatres deeper (THEATRES), the
 * opening fronts to z8.
 * Downloads are cached in .cache/tiles-src, so a rerun only re-renders.
 *
 *   npx tsx scripts/build-tiles.ts            # fetch what is missing, render everything
 *   npx tsx scripts/build-tiles.ts --only 6   # re-render one level
 *   npx tsx scripts/build-tiles.ts --keys 5/38/7,7/153/30   # re-render a few tiles to tune the look
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache/tiles-src');
const OUT = path.join(ROOT, 'public/tiles');
const ERDDAP = 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/ETOPO_2022_v1_15s.dods';
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const GEONAMES = 'https://download.geonames.org/export/dump/cities5000.zip';
const PLAYWRIGHT = '/opt/node-tools/node_modules/playwright/index.mjs';
const CHROMIUM = '/opt/pw-browsers/chromium';
export const TILE = 512;

type Box = readonly [west: number, south: number, east: number, north: number];

/** ETOPO grids: 15 arc-seconds is 240 samples per degree; `stride` thins that. */
interface Dem { name: string; box: Box; stride: number }

/** Coarse world grid for z0-z3, then finer grids that cover the deeper theatre tiles. */
const DEMS: Dem[] = [
  { name: 'world', box: [-180, -90, 180, 90], stride: 12 },
  { name: 'europe4', box: [-12, 30, 62, 72], stride: 4 },
  { name: 'asia4', box: [58, 0, 148, 50], stride: 4 },
  { name: 'europe2', box: [12, 40, 47, 62], stride: 2 },
  { name: 'mideast2', box: [30, 22, 63, 41], stride: 2 },
  { name: 'southasia2', box: [64, 18, 93, 38], stride: 2 },
  { name: 'korea2', box: [122, 32, 133, 44], stride: 2 },
  { name: 'taiwan2', box: [114, 19, 127, 29], stride: 2 },
  { name: 'ukraine1', box: [29, 43.5, 41.5, 52.5], stride: 1 },
  { name: 'baltic1', box: [19, 53, 30.5, 60.5], stride: 1 },
  { name: 'korea1', box: [124.5, 36, 130, 39.8], stride: 1 },
  { name: 'taiwan1', box: [118, 21.5, 123, 26.5], stride: 1 },
];

/** Deeper levels only where a war can be fought; elsewhere the map falls back to the z3 world. */
const THEATRES: { z: number; boxes: Box[] }[] = [
  { z: 4, boxes: [[-12, 30, 62, 72], [58, 0, 148, 50]] },
  { z: 5, boxes: [[-12, 30, 62, 72], [58, 0, 148, 50]] },
  { z: 6, boxes: [[12, 40, 47, 62], [30, 22, 63, 41], [64, 18, 93, 38], [122, 32, 133, 44], [114, 19, 127, 29]] },
  { z: 7, boxes: [[29, 43.5, 41.5, 52.5], [19, 53, 30.5, 60.5], [124.5, 36, 130, 39.8], [118, 21.5, 123, 26.5]] },
  // Front zoom over the lines that are fought over from the first day: Ukraine and the Korean DMZ.
  { z: 8, boxes: [[32.5, 46.2, 39.8, 50.4], [125.5, 37.4, 129.5, 38.7]] },
];
export const MAX_GLOBAL_Z = 3;
const PAGE = '<!doctype html><meta charset="utf-8"><script src="d3-array.min.js"></script><script src="d3-geo.min.js"></script><script src="page.js"></script>';

const NE_LAYERS = [
  'ne_10m_land', 'ne_50m_land', 'ne_110m_land', 'ne_10m_lakes', 'ne_50m_lakes',
  'ne_10m_rivers_lake_centerlines', 'ne_50m_rivers_lake_centerlines',
  'ne_10m_roads', 'ne_10m_railroads', 'ne_10m_urban_areas',
  'ne_10m_admin_0_boundary_lines_land', 'ne_50m_admin_0_boundary_lines_land',
  'ne_10m_populated_places_simple',
];

const span = (z: number) => 180 / 2 ** z;

export function tilesFor(z: number, box: Box): [number, number][] {
  const s = span(z), out: [number, number][] = [];
  const x0 = Math.floor((box[0] + 180) / s), x1 = Math.ceil((box[2] + 180) / s);
  const y0 = Math.floor((90 - box[3]) / s), y1 = Math.ceil((90 - box[1]) / s);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out.push([x, y]);
  return out;
}

/** ERDDAP sheds load with 503s; back off and try again. */
async function retry(get: () => Promise<Response>, what: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const res = await get();
    if (res.ok) return res;
    if (attempt === 6) throw new Error(`${what}: HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 5000 * attempt));
  }
}

async function fetchDem(d: Dem) {
  const file = path.join(CACHE, `${d.name}.i16`);
  if (fs.existsSync(file)) return;
  const P = 240, LAT0 = -90 + 0.5 / P, LON0 = -180 + 0.5 / P;
  const idx = (v: number, o: number, max: number) => Math.max(0, Math.min(max, Math.round((v - o) * P)));
  const r0 = idx(d.box[1], LAT0, 43199), r1 = idx(d.box[3], LAT0, 43199);
  const c0 = idx(d.box[0], LON0, 86399), c1 = idx(d.box[2], LON0, 86399);
  const rows = Math.floor((r1 - r0) / d.stride) + 1, cols = Math.floor((c1 - c0) / d.stride) + 1;
  const z = new Int16Array(rows * cols);
  // ERDDAP answers a few million cells per request comfortably.
  const band = Math.max(1, Math.floor(2e6 / cols));
  for (let r = 0; r < rows; r += band) {
    const n = Math.min(band, rows - r), a = r0 + r * d.stride, b = a + (n - 1) * d.stride;
    const url = `${ERDDAP}?z%5B${a}:${d.stride}:${b}%5D%5B${c0}:${d.stride}:${c0 + (cols - 1) * d.stride}%5D`;
    const res = await retry(() => fetch(url), `${d.name} rows ${r}`);
    const buf = Buffer.from(await res.arrayBuffer());
    let o = buf.indexOf('\nData:\n') + 7;
    const cnt = buf.readUInt32BE(o);
    o += 8;
    if (cnt !== n * cols) throw new Error(`${d.name}: expected ${n * cols} cells, got ${cnt}`);
    for (let i = 0; i < cnt; i++) z[r * cols + i] = Math.round(buf.readFloatBE(o + 4 * i));
    console.log(`  ${d.name} rows ${r + n}/${rows}`);
  }
  fs.writeFileSync(path.join(CACHE, `${d.name}.json`), JSON.stringify({ rows, cols, s: LAT0 + r0 / P, w: LON0 + c0 / P, step: d.stride / P }));
  fs.writeFileSync(file, Buffer.from(z.buffer));
}

async function fetchNe(layer: string) {
  const file = path.join(CACHE, `${layer}.geojson`);
  if (fs.existsSync(file)) return;
  const res = await fetch(`${NE}/${layer}.geojson`);
  if (!res.ok) throw new Error(`${layer}: HTTP ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`  ${layer} ${(fs.statSync(file).size / 1e6).toFixed(1)} MB`);
}

/** Runs `jobs` with at most `n` in flight. */
async function pool<T>(items: T[], n: number, job: (t: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: n }, async () => {
    for (let t = queue.shift(); t !== undefined; t = queue.shift()) await job(t);
  }));
}

/** City lights for the night globe: [lon, lat, population] for every Natural Earth populated place. */
function writeLights() {
  const pp = JSON.parse(fs.readFileSync(path.join(CACHE, 'ne_10m_populated_places_simple.geojson'), 'utf8'));
  const out: number[] = [];
  for (const f of pp.features) {
    const p = f.properties;
    out.push(Math.round(p.longitude * 100) / 100, Math.round(p.latitude * 100) / 100, Math.max(1e4, p.pop_max | 0));
  }
  fs.writeFileSync(path.join(OUT, 'lights.json'), JSON.stringify(out));
}

/**
 * Place names for the map labels, from GeoNames (CC BY 4.0): every town of
 * 5,000 or more inside a theatre, so the front zoom can name Orikhiv and
 * Tokmak, and cities of 150,000 or more elsewhere. Rows are
 * [name, lon, lat, population, 2 national capital | 1 regional capital | 0].
 */
async function writePlaces() {
  const zip = path.join(CACHE, 'cities5000.zip');
  if (!fs.existsSync(zip)) {
    const res = await retry(() => fetch(GEONAMES), 'geonames');
    fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  }
  const text = execFileSync('unzip', ['-p', zip, 'cities5000.txt'], { maxBuffer: 1 << 28 }).toString('utf8');
  const theatres = THEATRES.find((t) => t.z === 6)!.boxes;
  const inside = (lon: number, lat: number) => theatres.some((b) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3]);
  const rows: [string, number, number, number, number][] = [];
  for (const line of text.split('\n')) {
    const c = line.split('\t');
    if (c.length < 15) continue;
    const lat = Number(c[4]), lon = Number(c[5]), pop = Number(c[14]), code = c[7];
    if (code === 'PPLX') continue;
    const kind = code === 'PPLC' ? 2 : code === 'PPLA' ? 1 : 0;
    if (pop < 150_000 && kind < 2 && !inside(lon, lat)) continue;
    rows.push([c[1], Math.round(lon * 1000) / 1000, Math.round(lat * 1000) / 1000, pop, kind]);
  }
  rows.sort((a, b) => b[4] - a[4] || b[3] - a[3]);
  fs.writeFileSync(path.join(OUT, 'places.json'), JSON.stringify(rows));
  console.log(`places: ${rows.length}`);
}

async function render(only: number | null, keys: Set<string> | null) {
  const { chromium } = await import(PLAYWRIGHT);
  const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--js-flags=--max-old-space-size=8192'] });
  const page = await browser.newPage();
  page.on('console', (m: { text(): string }) => console.log('  page:', m.text()));
  page.on('pageerror', (e: Error) => console.log('  page error:', e.message));
  await page.route('http://tiles.local/**', async (route: { request(): { url(): string }; fulfill(o: object): Promise<void> }) => {
    const rel = new URL(route.request().url()).pathname.slice(1);
    if (rel === 'index.html') return route.fulfill({ contentType: 'text/html', body: PAGE });
    const file = rel === 'page.js' ? path.join(ROOT, 'scripts/build-tiles.page.js')
      : rel.startsWith('d3-') ? path.join(ROOT, 'node_modules', rel.replace('.min.js', ''), 'dist', rel)
        : path.join(CACHE, rel);
    await route.fulfill({ body: fs.readFileSync(file) });
  });
  await page.goto('http://tiles.local/index.html');
  await page.evaluate(`init(${JSON.stringify(DEMS.map((d) => d.name))})`);

  const want = new Map<number, Set<string>>();
  for (let z = 0; z <= MAX_GLOBAL_Z; z++) want.set(z, new Set(tilesFor(z, [-180, -90, 180, 90]).map(([x, y]) => `${x}/${y}`)));
  for (const { z, boxes } of THEATRES) {
    const set = want.get(z) ?? new Set<string>();
    for (const b of boxes) for (const [x, y] of tilesFor(z, b)) set.add(`${x}/${y}`);
    want.set(z, set);
  }
  const manifest: Record<number, string[]> = {};
  let bytes = 0;
  for (const [z, set] of want) {
    manifest[z] = [...set].sort();
    if (only !== null && z !== only) continue;
    let n = 0;
    for (const key of manifest[z]) {
      if (keys && !keys.has(`${z}/${key}`)) continue;
      const [x, y] = key.split('/').map(Number);
      const b64: string = await page.evaluate(`renderTile(${z}, ${x}, ${y})`);
      const file = path.join(OUT, String(z), String(x), `${y}.webp`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const buf = Buffer.from(b64, 'base64');
      fs.writeFileSync(file, buf);
      bytes += buf.length;
      if (++n % 20 === 0) console.log(`  z${z} ${n}/${set.size}`);
    }
    console.log(`z${z}: ${set.size} tiles`);
  }
  await browser.close();
  if (keys) return;
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ tile: TILE, levels: manifest }));
  console.log(`rendered ${(bytes / 1e6).toFixed(1)} MB`);
}

async function main() {
  const onlyAt = process.argv.indexOf('--only');
  const only = onlyAt > 0 ? Number(process.argv[onlyAt + 1]) : null;
  const keysAt = process.argv.indexOf('--keys');
  const keys = keysAt > 0 ? new Set(process.argv[keysAt + 1].split(',')) : null;
  fs.mkdirSync(CACHE, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  console.log('fetching sources');
  await pool(NE_LAYERS, 4, fetchNe);
  await pool(DEMS, 3, fetchDem);
  writeLights();
  await writePlaces();
  if (process.argv.includes('--fetch-only')) return;
  await render(only, keys);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();

/**
 * Land elevation and local relief from ETOPO 2022 (NOAA NCEI, public domain), read at 1 arc-minute.
 *
 * The 15 arc-second grid is fetched from NOAA's ERDDAP server every 4th sample in latitude bands and cached
 * as one int16 raster in .cache/. Local relief is the elevation range in a 5 x 5 sample window (about 9 km),
 * the moving window Hammond (1964) used to class landforms: under 90 m is plain, 90-300 m hills, over 300 m
 * mountains (Karagulle et al. 2017, the USGS global Hammond landforms, use the same breaks).
 */
import fs from 'node:fs';
import path from 'node:path';

const ERDDAP = 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/ETOPO_2022_v1_15s.dods';
/** Source grid: 15 arc-seconds, cell-centred, latitude ascending from the south pole. */
const SRC_PER_DEG = 240;
const SRC_LAT0 = -90 + 0.5 / SRC_PER_DEG;
const SRC_LON0 = -180 + 0.5 / SRC_PER_DEG;
const STRIDE = 4;
export const PER_DEG = SRC_PER_DEG / STRIDE;
const SOUTH = -56;
const NORTH = 84;
const ROW0 = Math.ceil((SOUTH - SRC_LAT0) * SRC_PER_DEG / STRIDE) * STRIDE;
const ROWS = (NORTH - SOUTH) * PER_DEG;
const COLS = 360 * PER_DEG;
const BAND = 300;
const WINDOW = 2;

export const HILL_RELIEF_M = 90;
export const MOUNTAIN_RELIEF_M = 300;

export interface Dem {
  /** Elevation in metres, row 0 southernmost, ROWS x COLS. */
  readonly z: Int16Array;
  /** Elevation range in the 5 x 5 window around each sample, metres. */
  readonly relief: Uint16Array;
}

const rowLat = (r: number) => SRC_LAT0 + (ROW0 + r * STRIDE) / SRC_PER_DEG;
const colLon = (c: number) => SRC_LON0 + (c * STRIDE) / SRC_PER_DEG;

/** Float32 array of an OPeNDAP binary (.dods) grid response: XDR big-endian, after the "Data:" marker. */
function parseDods(buf: Buffer, expected: number): Float32Array {
  const marker = buf.indexOf('\nData:\n');
  if (marker < 0) throw new Error(`ETOPO response has no data: ${buf.subarray(0, 300).toString()}`);
  let o = marker + 7;
  const n = buf.readUInt32BE(o);
  if (n !== expected || buf.readUInt32BE(o + 4) !== n) throw new Error(`ETOPO band holds ${n} values, expected ${expected}`);
  o += 8;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = buf.readFloatBE(o + 4 * i);
  return out;
}

/** One latitude band, cached on its own so an interrupted download resumes where it stopped. */
async function band(dir: string, r: number, rows: number): Promise<Int16Array> {
  const file = path.join(dir, `rows_${r}_${rows}.i16`);
  if (fs.existsSync(file) && fs.statSync(file).size === rows * COLS * 2) return new Int16Array(fs.readFileSync(file).buffer.slice(0));
  const a = ROW0 + r * STRIDE, b = a + (rows - 1) * STRIDE;
  const url = `${ERDDAP}?z%5B${a}:${STRIDE}:${b}%5D%5B0:${STRIDE}:${(COLS - 1) * STRIDE}%5D`;
  console.log('fetching ETOPO 2022', rowLat(r).toFixed(2), 'to', rowLat(r + rows - 1).toFixed(2));
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) {
      const z = Int16Array.from(parseDods(Buffer.from(await res.arrayBuffer()), rows * COLS), Math.round);
      fs.writeFileSync(file, z);
      return z;
    }
    if (attempt === 6) throw new Error(`${url}: ${res.status}`);
    console.log(`ETOPO server answered ${res.status}; retrying in ${10 * attempt} s`);
    await new Promise((done) => setTimeout(done, 10_000 * attempt));
  }
}

/** Range over a (2w+1)-wide window along rows, then along columns (longitude wraps). */
function localRelief(z: Int16Array): Uint16Array {
  const lo = new Int16Array(z.length), hi = new Int16Array(z.length);
  for (let r = 0; r < ROWS; r++) {
    const base = r * COLS;
    for (let c = 0; c < COLS; c++) {
      let mn = 32767, mx = -32768;
      for (let d = -WINDOW; d <= WINDOW; d++) {
        const v = z[base + ((c + d + COLS) % COLS)];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      lo[base + c] = mn;
      hi[base + c] = mx;
    }
  }
  const relief = new Uint16Array(z.length);
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      let mn = 32767, mx = -32768;
      for (let d = Math.max(0, r - WINDOW); d <= Math.min(ROWS - 1, r + WINDOW); d++) {
        const i = d * COLS + c;
        if (lo[i] < mn) mn = lo[i];
        if (hi[i] > mx) mx = hi[i];
      }
      relief[r * COLS + c] = mx - mn;
    }
  return relief;
}

export async function loadDem(cacheDir: string): Promise<Dem> {
  const dir = path.join(cacheDir, `etopo2022_${PER_DEG}ppd`);
  fs.mkdirSync(dir, { recursive: true });
  const z = new Int16Array(ROWS * COLS);
  for (let r = 0; r < ROWS; r += BAND) z.set(await band(dir, r, Math.min(BAND, ROWS - r)), r * COLS);
  return { z, relief: localRelief(z) };
}

export interface CellRelief {
  /** Land samples the statistics cover. */
  samples: number;
  /** Mean elevation of the cell's land samples, metres. */
  elevation: number;
  /** Mean local relief of the cell's land samples, metres. */
  ruggedness: number;
  /** Share of land samples whose local relief reaches the hill break. */
  hillShare: number;
  /** Share of land samples whose local relief reaches the mountain break. */
  mountainShare: number;
}

/** Relief statistics over the samples inside a square cell that `isLand` accepts; zeros when it has none. */
export function cellRelief(dem: Dem, lat: number, lon: number, half: number, isLand: (lat: number, lon: number) => boolean): CellRelief {
  const r0 = Math.max(0, Math.ceil((lat - half - rowLat(0)) * PER_DEG)), r1 = Math.min(ROWS - 1, Math.floor((lat + half - rowLat(0)) * PER_DEG - 1e-9));
  const c0 = Math.ceil((lon - half - colLon(0)) * PER_DEG), c1 = Math.floor((lon + half - colLon(0)) * PER_DEG - 1e-9);
  let n = 0, elev = 0, rug = 0, hill = 0, mtn = 0;
  for (let r = r0; r <= r1; r++)
    for (let cc = c0; cc <= c1; cc++) {
      const c = (cc + COLS) % COLS;
      if (!isLand(rowLat(r), colLon(c))) continue;
      const i = r * COLS + c, rel = dem.relief[i];
      n++;
      elev += dem.z[i];
      rug += rel;
      if (rel >= HILL_RELIEF_M) hill++;
      if (rel >= MOUNTAIN_RELIEF_M) mtn++;
    }
  if (!n) return { samples: 0, elevation: 0, ruggedness: 0, hillShare: 0, mountainShare: 0 };
  return { samples: n, elevation: elev / n, ruggedness: rug / n, hillShare: hill / n, mountainShare: mtn / n };
}

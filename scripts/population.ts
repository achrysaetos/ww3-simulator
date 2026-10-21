/**
 * Gridded population from GHS-POP R2023A (European Commission JRC, CC BY 4.0): residents in 2020 on a
 * 30 arc-second grid, summed here to 1/20 degree (about 5.5 km) between 56S and 84N, the band the map
 * covers. The 30 arc-second GeoTIFF is a tiled, LZW-compressed BigTIFF of float64; the sum is cached.
 */
import fs from 'node:fs';
import path from 'node:path';

const URL = 'https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_POP_GLOBE_R2023A/GHS_POP_E2020_GLOBE_R2023A_4326_30ss/V1-0/GHS_POP_E2020_GLOBE_R2023A_4326_30ss_V1_0.zip';
const TIF = 'GHS_POP_E2020_GLOBE_R2023A_4326_30ss_V1_0.tif';
const POP_PER_DEG = 20;
const NORTH = 84;
const SOUTH = -56;
const W = 360 * POP_PER_DEG;
const H = (NORTH - SOUTH) * POP_PER_DEG;

export interface Population {
  /** Visits every inhabited 1/20-degree pixel with its centre and residents. */
  each(visit: (lat: number, lon: number, residents: number) => void): void;
  /** Residents in the pixel holding a point, 0 outside the band. */
  at(lat: number, lon: number): number;
}

/** TIFF LZW (MSB-first codes, early change), as libtiff writes it. */
function lzw(src: Uint8Array, out: Uint8Array): void {
  const prefix = new Int32Array(4096), suffix = new Uint8Array(4096), length = new Int32Array(4096);
  for (let i = 0; i < 256; i++) { prefix[i] = -1; suffix[i] = i; length[i] = 1; }
  let next = 258, width = 9, bitPos = 0, o = 0, old = -1;
  const totalBits = src.length * 8;
  const write = (code: number) => {
    const len = length[code];
    let c = code;
    for (let i = len - 1; i >= 0; i--) { if (o + i < out.length) out[o + i] = suffix[c]; c = prefix[c]; }
    o += len;
  };
  const first = (code: number) => { while (prefix[code] >= 0) code = prefix[code]; return suffix[code]; };
  while (bitPos + width <= totalBits) {
    let code = 0;
    for (let i = 0; i < width; i++, bitPos++) code = (code << 1) | ((src[bitPos >> 3] >> (7 - (bitPos & 7))) & 1);
    if (code === 257) break;
    if (code === 256) { next = 258; width = 9; old = -1; continue; }
    if (old < 0) { write(code); old = code; continue; }
    if (code < next) {
      write(code);
      prefix[next] = old; suffix[next] = first(code); length[next] = length[old] + 1;
    } else {
      prefix[next] = old; suffix[next] = first(old); length[next] = length[old] + 1;
      write(next);
    }
    next++;
    old = code;
    if (next + 1 >= 1 << width && width < 12) width++;
  }
}

function aggregate(file: string): Float32Array {
  const fd = fs.openSync(file, 'r');
  const read = (pos: number, n: number) => { const b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, pos); return b; };
  const head = read(0, 16);
  if (head.toString('latin1', 0, 2) !== 'II' || head.readUInt16LE(2) !== 43) throw new Error(`${file}: not a little-endian BigTIFF`);
  const ifd = Number(head.readBigUInt64LE(8));
  const count = Number(read(ifd, 8).readBigUInt64LE(0));
  const entries = read(ifd + 8, count * 20);
  const tags = new Map<number, { type: number; n: number; raw: Buffer }>();
  for (let i = 0; i < count; i++) {
    const e = entries.subarray(i * 20, i * 20 + 20);
    tags.set(e.readUInt16LE(0), { type: e.readUInt16LE(2), n: Number(e.readBigUInt64LE(4)), raw: e.subarray(12) });
  }
  const size = { 3: 2, 4: 4, 12: 8, 16: 8 } as Record<number, number>;
  const values = (tag: number): number[] => {
    const t = tags.get(tag)!;
    const bytes = t.n * size[t.type];
    const buf = bytes <= 8 ? t.raw : read(Number(t.raw.readBigUInt64LE(0)), bytes);
    return Array.from({ length: t.n }, (_, i) =>
      t.type === 3 ? buf.readUInt16LE(i * 2) : t.type === 4 ? buf.readUInt32LE(i * 4) : t.type === 12 ? buf.readDoubleLE(i * 8) : Number(buf.readBigUInt64LE(i * 8)));
  };
  const [width] = values(256), [height] = values(257), [bits] = values(258), [compression] = values(259), [format] = values(339);
  const [tw] = values(322), [th] = values(323), offsets = values(324), counts = values(325);
  const [sx, sy] = values(33550), tie = values(33922);
  if (bits !== 64 || format !== 3 || compression !== 5) throw new Error(`${file}: expected LZW float64, got ${bits}-bit format ${format} compression ${compression}`);
  const across = Math.ceil(width / tw);
  const sum = new Float64Array(W * H);
  const tile = new Uint8Array(tw * th * 8);
  const px = new Float64Array(tile.buffer);
  for (let t = 0; t < offsets.length; t++) {
    tile.fill(0);
    lzw(read(offsets[t], counts[t]), tile);
    const ty = Math.floor(t / across) * th, tx = (t % across) * tw;
    for (let y = 0; y < th && ty + y < height; y++) {
      const lat = tie[4] - (ty + y + 0.5) * sy;
      if (lat >= NORTH || lat < SOUTH) continue;
      const gy = Math.floor((NORTH - lat) * POP_PER_DEG) * W;
      for (let x = 0; x < tw && tx + x < width; x++) {
        const v = px[y * tw + x];
        if (!(v > 0)) continue;
        const lon = tie[3] + (tx + x + 0.5) * sx;
        sum[gy + ((Math.floor((lon + 180) * POP_PER_DEG) % W) + W) % W] += v;
      }
    }
  }
  fs.closeSync(fd);
  return Float32Array.from(sum);
}

export async function loadPopulation(cacheDir: string, unzip: (zip: string, dir: string) => void): Promise<Population> {
  const dir = path.join(cacheDir, 'ghs-pop');
  const out = path.join(dir, `pop_${POP_PER_DEG}ppd.f32`);
  if (!fs.existsSync(out)) {
    fs.mkdirSync(dir, { recursive: true });
    const tif = path.join(dir, TIF);
    if (!fs.existsSync(tif)) {
      const zip = path.join(dir, 'ghs30ss.zip');
      if (!fs.existsSync(zip)) {
        console.log('downloading GHS-POP 2020 30 arc-second grid (480 MB)');
        const res = await fetch(URL);
        if (!res.ok) throw new Error(`GHS-POP: HTTP ${res.status}`);
        fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
      }
      unzip(zip, dir);
    }
    console.log('summing GHS-POP to', `1/${POP_PER_DEG} degree`);
    fs.writeFileSync(out, aggregate(tif));
  }
  const b = fs.readFileSync(out);
  const grid = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
  return {
    each(visit) {
      for (let i = 0; i < grid.length; i++)
        if (grid[i] > 0) visit(NORTH - (Math.floor(i / W) + 0.5) / POP_PER_DEG, ((i % W) + 0.5) / POP_PER_DEG - 180, grid[i]);
    },
    at(lat, lon) {
      if (lat >= NORTH || lat < SOUTH) return 0;
      return grid[Math.floor((NORTH - lat) * POP_PER_DEG) * W + ((Math.floor((lon + 180) * POP_PER_DEG) % W) + W) % W];
    },
  };
}

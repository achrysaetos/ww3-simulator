/**
 * The land half of the map graph: a raster of Natural Earth land, the square
 * cells laid over it, and which cells' land actually touches.
 *
 * Two cells are land neighbours when a land pixel labelled with one borders a
 * land pixel labelled with the other (8-connected). Each land pixel belongs to
 * the cell whose square contains it when that cell is its own nation's;
 * otherwise to the nearest cell of its nation on the same landmass, so a
 * Belgian sliver inside a French square joins Belgium, and Kinmen's northern
 * tip joins the Kinmen cell rather than the Chinese square it pokes into.
 * Land with no such cell (Ceuta, Gibraltar) stays with the square it lies in.
 */
import type { SquareIndex } from '../src/core/map';

/** Raster pixels per degree: 0.025 degrees, about 2.8 km, finer than any strait the map treats as water. */
const PX = 40;
const TOP = 84;
const BOTTOM = -56;
const W = 360 * PX;
const H = (TOP - BOTTOM) * PX;
/** Side of a pixel along a meridian, km. */
const PX_KM = (6371 * Math.PI) / 180 / PX;
/** A pixel joins its nation's nearest cell only within this distance, in degrees of latitude. */
const NEAR_DEG = 1;

export interface Part { owner: number; rings: number[][][] }
export interface Cell { lat: number; lon: number; half: number; owner: number }

const pixelX = (lon: number) => ((Math.floor((lon + 180) * PX) % W) + W) % W;
const pixelY = (lat: number) => Math.floor((TOP - lat) * PX);
const pixelLat = (y: number) => TOP - (y + 0.5) / PX;
const pixelLon = (x: number) => (x + 0.5) / PX - 180;

/** Land as sorted, disjoint horizontal runs per raster row, each tagged with its nation and its connected landmass. */
export class Raster {
  private constructor(
    readonly rowStart: Int32Array,
    readonly x0: Int32Array,
    readonly x1: Int32Array,
    readonly owner: Int32Array,
    readonly comp: Int32Array,
  ) {}

  /** Even-odd scanline fill of every part; a pixel is land when its centre is inside. */
  static build(parts: Part[]): Raster {
    const rows: number[][] = Array.from({ length: H }, () => []);
    for (const part of parts) {
      const xs = new Map<number, number[]>();
      for (const ring of part.rings) {
        let prev = ring[0][0];
        const pts = ring.map(([lon, lat]) => {
          while (lon - prev > 180) lon -= 360;
          while (lon - prev < -180) lon += 360;
          prev = lon;
          return [(lon + 180) * PX, (TOP - lat) * PX];
        });
        for (let i = 1; i < pts.length; i++) {
          const [xa, ya] = pts[i - 1], [xb, yb] = pts[i];
          if (ya === yb) continue;
          const lo = Math.max(0, Math.ceil(Math.min(ya, yb) - 0.5)), hi = Math.min(H - 1, Math.ceil(Math.max(ya, yb) - 0.5) - 1);
          for (let r = lo; r <= hi; r++) {
            const x = xa + ((xb - xa) * (r + 0.5 - ya)) / (yb - ya);
            (xs.get(r) ?? xs.set(r, []).get(r)!).push(x);
          }
        }
      }
      for (const [r, list] of xs) {
        list.sort((a, b) => a - b);
        for (let i = 0; i + 1 < list.length; i += 2) {
          let a = Math.ceil(list[i] - 0.5), b = Math.ceil(list[i + 1] - 0.5) - 1;
          if (a > b) continue;
          const shift = Math.floor(a / W) * W;
          a -= shift;
          b -= shift;
          if (b >= W) {
            rows[r].push(a, W - 1, part.owner, 0, Math.min(b - W, W - 1), part.owner);
          } else rows[r].push(a, b, part.owner);
        }
      }
    }
    const rowStart = new Int32Array(H + 1);
    const x0: number[] = [], x1: number[] = [], owner: number[] = [];
    for (let r = 0; r < H; r++) {
      const spans: [number, number, number][] = [];
      for (let i = 0; i < rows[r].length; i += 3) spans.push([rows[r][i], rows[r][i + 1], rows[r][i + 2]]);
      spans.sort((a, b) => a[0] - b[0]);
      for (const [a0, b, o] of spans) {
        const last = x0.length - 1;
        const a = last >= rowStart[r] ? Math.max(a0, x1[last] + 1) : a0;
        if (a > b) continue;
        if (last >= rowStart[r] && x1[last] + 1 === a && owner[last] === o) x1[last] = b;
        else { x0.push(a); x1.push(b); owner.push(o); }
      }
      rowStart[r + 1] = x0.length;
    }
    const raster = new Raster(rowStart, Int32Array.from(x0), Int32Array.from(x1), Int32Array.from(owner), new Int32Array(x0.length));
    raster.labelLandmasses();
    return raster;
  }

  /** Union-find over runs of one nation that touch, 8-connected. */
  private labelLandmasses() {
    const parent = Int32Array.from({ length: this.x0.length }, (_, i) => i);
    const find = (i: number): number => {
      while (parent[i] !== i) i = parent[i] = parent[parent[i]];
      return i;
    };
    const union = (a: number, b: number) => { parent[find(a)] = find(b); };
    for (let r = 0; r < H; r++) {
      const s = this.rowStart[r], e = this.rowStart[r + 1];
      for (let i = s + 1; i < e; i++) if (this.x1[i - 1] + 1 === this.x0[i] && this.owner[i - 1] === this.owner[i]) union(i - 1, i);
      if (e - s > 1 && this.x0[s] === 0 && this.x1[e - 1] === W - 1 && this.owner[s] === this.owner[e - 1]) union(s, e - 1);
      if (r + 1 === H) continue;
      let i = s, j = this.rowStart[r + 1];
      const je = this.rowStart[r + 2];
      while (i < e && j < je) {
        if (this.x0[i] <= this.x1[j] + 1 && this.x0[j] <= this.x1[i] + 1 && this.owner[i] === this.owner[j]) union(i, j);
        if (this.x1[i] < this.x1[j]) i++;
        else j++;
      }
    }
    for (let i = 0; i < parent.length; i++) this.comp[i] = find(i);
  }

  /** Run covering pixel (x, y), or -1 over water. */
  runAt(x: number, y: number): number {
    if (y < 0 || y >= H) return -1;
    let lo = this.rowStart[y], hi = this.rowStart[y + 1] - 1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (this.x1[m] < x) lo = m + 1;
      else if (this.x0[m] > x) hi = m - 1;
      else return m;
    }
    return -1;
  }

  /** Land area in km2 per landmass inside a box of whole pixels, with each landmass's nation. */
  landmassesIn(south: number, north: number, west: number, east: number): Map<number, { owner: number; km2: number }> {
    const out = new Map<number, { owner: number; km2: number }>();
    const xa = pixelX(west), xb = xa + Math.round((east - west) * PX) - 1;
    for (let y = pixelY(north - 0.5 / PX); y <= pixelY(south + 0.5 / PX); y++) {
      if (y < 0 || y >= H) continue;
      const pxKm2 = PX_KM ** 2 * Math.cos((pixelLat(y) * Math.PI) / 180);
      for (let run = this.rowStart[y]; run < this.rowStart[y + 1]; run++) {
        const px = Math.min(this.x1[run], xb) - Math.max(this.x0[run], xa) + 1;
        if (px <= 0) continue;
        const m = out.get(this.comp[run]) ?? { owner: this.owner[run], km2: 0 };
        m.km2 += px * pxKm2;
        out.set(this.comp[run], m);
      }
    }
    return out;
  }

  /** Nation index of the land at a point, or -1 over water. */
  ownerAt(lat: number, lon: number): number {
    const run = this.runAt(pixelX(lon), pixelY(lat));
    return run < 0 ? -1 : this.owner[run];
  }
}

function boxDistance(c: Cell, lat: number, lon: number): number {
  const dLat = Math.max(0, Math.abs(lat - c.lat) - c.half);
  const dLon = Math.max(0, Math.abs(((lon - c.lon + 540) % 360) - 180) - c.half) * Math.cos((lat * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

/** Assigns land pixels to cells and finds the cell pairs whose land touches. */
export class LandLabels {
  private readonly landmassesOf: Set<number>[];
  /** The landmass holding most of each cell's own land. */
  private readonly mainOf: Int32Array;
  /** Cell pairs whose land touches, keyed a * cells + b with a < b. */
  readonly contacts = new Set<number>();

  constructor(private readonly raster: Raster, private readonly grid: SquareIndex, private readonly cells: readonly Cell[]) {
    this.landmassesOf = cells.map(() => new Set());
    const px = cells.map(() => new Map<number, number>());
    this.walk((run, cell, x0, x1) => {
      if (cell < 0 || cells[cell].owner !== raster.owner[run]) return;
      const comp = raster.comp[run];
      this.landmassesOf[cell].add(comp);
      px[cell].set(comp, (px[cell].get(comp) ?? 0) + x1 - x0 + 1);
    });
    this.mainOf = Int32Array.from(px, (m) => { let best = -1, most = 0; for (const [c, n] of m) if (n > most) [best, most] = [c, n]; return best; });
    this.countContacts();
  }

  /**
   * The cell a land pixel belongs to, or -1. Land of the square's own nation stays in the square's cell unless it
   * is a second landmass there and a nearby cell of that nation stands on it: the tip of Sicily across the
   * Strait of Messina joins Sicily's cell, not Calabria's.
   */
  label(run: number, cell: number, lat: number, lon: number): number {
    const owner = this.raster.owner[run], comp = this.raster.comp[run];
    const home = cell >= 0 && this.cells[cell].owner === owner;
    if (home && this.mainOf[cell] === comp) return cell;
    let best = cell, bestD = NEAR_DEG;
    for (const n of this.grid.nearby(lat, lon)) {
      const c = this.cells[n];
      if (c.owner !== owner || n === cell || !(home ? this.mainOf[n] === comp : this.landmassesOf[n].has(comp))) continue;
      const d = boxDistance(c, lat, lon);
      if (d < bestD) [best, bestD] = [n, d];
    }
    return best;
  }

  /**
   * The cell for a point: the cell owning the land under it; over water, the containing cell when that
   * cell's nation holds the nearest shore within `radiusPx` pixels (Izmail's harbour on the Danube stays
   * Ukrainian), else the cell owning that shore (Singapore's Jurong port, in a square Johor wins); the
   * containing cell over open water; else -1.
   */
  pointLabel(lat: number, lon: number, radiusPx = 0): number {
    const x = pixelX(lon), y = pixelY(lat), home = this.grid.at(lat, lon);
    const onLand = this.raster.runAt(x, y);
    if (onLand >= 0) return this.label(onLand, home, lat, lon);
    const shore: [number, number, number][] = [];
    for (let r = 1; r <= radiusPx && !shore.length; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const xx = (x + dx + W) % W, yy = y + dy, run = this.raster.runAt(xx, yy);
          if (run >= 0) shore.push([run, xx, yy]);
        }
    if (home >= 0 && shore.some(([run]) => this.raster.owner[run] === this.cells[home].owner)) return home;
    for (const [run, xx, yy] of shore) {
      const la = pixelLat(yy), lo = pixelLon(xx), n = this.label(run, this.grid.at(la, lo), la, lo);
      if (n >= 0) return n;
    }
    return home;
  }

  /** Visits every run piece that lies in a single cell square (or outside any), with that square's cell. */
  private walk(visit: (run: number, cell: number, x0: number, x1: number, y: number, lat: number) => void) {
    const { raster, grid } = this;
    for (let y = 0; y < H; y++) {
      const lat = pixelLat(y);
      for (let run = raster.rowStart[y]; run < raster.rowStart[y + 1]; run++) {
        let x = raster.x0[run];
        const end = raster.x1[run];
        while (x <= end) {
          const lon = pixelLon(x);
          const cell = grid.at(lat, lon);
          const step = PX / grid.cellsPerDegree(lat, lon);
          const stop = Math.min(end, (Math.floor(x / step) + 1) * step - 1);
          visit(run, cell, x, stop, y, lat);
          x = stop + 1;
        }
      }
    }
  }

  private countContacts() {
    const N = this.cells.length;
    const touch = (a: number, b: number) => {
      if (a < 0 || b < 0 || a === b) return;
      this.contacts.add(a < b ? a * N + b : b * N + a);
    };
    let prev: number[] = [], row: number[] = [], rowY = -1;
    const flush = () => {
      for (let i = 3; i < row.length; i += 3) if (row[i - 2] + 1 === row[i]) touch(row[i - 1], row[i + 2]);
      if (row.length >= 6 && row[0] === 0 && row[row.length - 2] === W - 1) touch(row[2], row[row.length - 1]);
      let first = 0;
      for (let i = 0; i < prev.length; i += 3) {
        while (first < row.length && row[first + 1] + 1 < prev[i]) first += 3;
        for (let j = first; j < row.length && row[j] <= prev[i + 1] + 1; j += 3) touch(prev[i + 2], row[j + 2]);
      }
    };
    this.walk((run, cell, x0, x1, y, lat) => {
      if (y !== rowY) {
        if (rowY >= 0) flush();
        prev = rowY === y - 1 ? row : [];
        row = [];
        rowY = y;
      }
      // Land left with another nation's cell (a strip of Slovakia between Polish and Hungarian squares, the
      // Wakhan corridor) joins nothing: a border runs only where two nations' own land meets.
      const label = this.label(run, cell, lat, pixelLon((x0 + x1) >> 1));
      row.push(x0, x1, label >= 0 && this.cells[label].owner === this.raster.owner[run] ? label : -1);
    });
    flush();
  }
}

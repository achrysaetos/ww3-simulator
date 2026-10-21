import { chokepointsOf, type Chokepoint } from '../data/geo/chokepoints';
import type { NationId, NodeId, Terrain } from './types';
import { TERRAINS } from './types';

/** Shape of src/data/generated/world.json (built by scripts/build-data.ts). */
export interface WorldData {
  generated: string;
  terrainTypes: readonly string[];
  nations: { iso3: string; name: string; stats: Record<string, number>; capital: { name: string; cell: number } | null }[];
  /**
   * Land cells are squares: 1 degree, or 1/2 to 1/8 degree inside refined 1-degree squares. `adj` lists each
   * cell's land neighbours: cells whose land touches, or that a bridge or tunnel joins. `elevation` and
   * `ruggedness` are the mean elevation and mean local relief (range within about 9 km) of the cell's land, in metres.
   */
  cells: { lat: number[]; lon: number[]; half: number[]; owner: number[]; terrain: number[]; elevation: number[]; ruggedness: number[]; popShare: number[]; railKm: number[]; ports: number[]; airports: number[]; coastZone: number[]; adj: number[][] };
  cities: { name: string; nation: number; cell: number; pop: number; capital: boolean; lat: number; lon: number }[];
  sea: { res: number; lat: number[]; lon: number[]; neighbors: number[][] };
  /** Bridges and tunnels that join two land cells across water; each pair is also in `cells.adj`. */
  fixedLinks: { name: string; a: number; b: number }[];
}

export interface City { name: string; nation: NationId; node: NodeId; pop: number; capital: boolean; lat: number; lon: number }

/** Key of the 1-degree square holding a point: row from the north pole times 360 plus column from 180W. */
export const squareKey = (lat: number, lon: number) => Math.floor(90 - lat) * 360 + ((Math.floor(lon + 180) % 360) + 360) % 360;

/** Finds the cell whose square contains a point. Every 1-degree square holds cells of one size. */
export class SquareIndex {
  private readonly squares = new Map<number, { k: number; idx: Int32Array }>();
  private readonly near = new Map<number, number[]>();

  constructor(lat: ArrayLike<number>, lon: ArrayLike<number>, half: ArrayLike<number>, count = lat.length) {
    for (let n = 0; n < count; n++) {
      const key = squareKey(lat[n], lon[n]), k = Math.round(1 / (2 * half[n]));
      let sq = this.squares.get(key);
      if (!sq) this.squares.set(key, (sq = { k, idx: new Int32Array(k * k).fill(-1) }));
      if (sq.k !== k) throw new Error(`cells of two sizes in square ${key}`);
      sq.idx[subIndex(lat[n], lon[n], k)] = n;
    }
  }

  /** Cell whose square contains the point, or -1. */
  at(lat: number, lon: number): number {
    const sq = this.squares.get(squareKey(lat, lon));
    return sq ? sq.idx[subIndex(lat, lon, sq.k)] : -1;
  }

  /** Cells per degree in the 1-degree square holding the point. */
  cellsPerDegree(lat: number, lon: number): number {
    return this.squares.get(squareKey(lat, lon))?.k ?? 1;
  }

  /** Cells in the 3x3 block of 1-degree squares around a point. */
  nearby(lat: number, lon: number): number[] {
    const key = squareKey(lat, lon);
    let list = this.near.get(key);
    if (!list) {
      list = [];
      const r = Math.floor(key / 360), c = key % 360;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const sq = this.squares.get((r + dr) * 360 + ((c + dc + 360) % 360));
          if (sq) for (const n of sq.idx) if (n >= 0) list.push(n);
        }
      this.near.set(key, list);
    }
    return list;
  }
}

function subIndex(lat: number, lon: number, k: number): number {
  const top = 90 - Math.floor(90 - lat), left = Math.floor(lon + 180) - 180;
  const j = Math.min(k - 1, Math.floor((top - lat) * k));
  const i = Math.min(k - 1, Math.floor(((((lon - left) % 360) + 360) % 360) * k));
  return j * k + i;
}

/**
 * Static geography: one graph over land cells (1 degree, finer where it matters) and sea zones (3 degree).
 * Node ids 0..landCount-1 are land; landCount.. are sea. Immutable during a run.
 */
export class GameMap {
  readonly landCount: number;
  readonly size: number;
  readonly lat: Float32Array;
  readonly lon: Float32Array;
  /** Half the side of a node's square in degrees: 0.5 for most land cells, less in refined squares, 1.5 for sea zones. */
  readonly halfDeg: Float32Array;
  readonly terrain: Terrain[];
  /** Mean elevation of a land cell in metres (ETOPO 2022); 0 for sea. */
  readonly elevation: Float32Array;
  /** Mean local relief of a land cell in metres: the elevation range within about 9 km, averaged; 0 for sea. */
  readonly ruggedness: Float32Array;
  /** Initial owner per node; '' for sea. */
  readonly owner: NationId[];
  /** Share of owner's population/industry in this cell (sums to 1 per nation). */
  readonly popShare: Float32Array;
  readonly railKm: Float32Array;
  readonly ports: Uint8Array;
  readonly airports: Uint8Array;
  /** CSR adjacency. Neighbors of n are adj[adjStart[n] .. adjStart[n+1]). */
  readonly adjStart: Int32Array;
  readonly adj: Int32Array;
  /** Great-circle km to each neighbor, parallel to adj. */
  readonly adjKm: Float32Array;
  readonly cities: City[];
  /** Land edges that cross water by bridge or tunnel (the Channel Tunnel, the Crimean Bridge), for capacity limits. */
  readonly fixedLinks: { name: string; a: NodeId; b: NodeId }[];
  /** Bridges, tunnels and isthmuses that strikes can close (src/data/geo/chokepoints.ts); their state is `theater.chokepoints`. */
  readonly chokepoints: Chokepoint[];
  readonly nationIds: NationId[];
  private readonly cellIndex: SquareIndex;
  private readonly seaIndex: Map<number, number>;
  private readonly seaRes: number;
  private readonly cosLat: Float64Array;
  private readonly nearest: NearestIndex;

  constructor(readonly data: WorldData) {
    const { cells, sea } = data;
    this.nationIds = data.nations.map((n) => n.iso3 as NationId);
    this.landCount = cells.lat.length;
    this.size = this.landCount + sea.lat.length;
    this.seaRes = sea.res;
    const L = this.landCount;
    this.lat = new Float32Array(this.size);
    this.lon = new Float32Array(this.size);
    this.halfDeg = new Float32Array(this.size);
    this.popShare = new Float32Array(this.size);
    this.railKm = new Float32Array(this.size);
    this.ports = new Uint8Array(this.size);
    this.airports = new Uint8Array(this.size);
    this.terrain = new Array(this.size);
    this.elevation = new Float32Array(this.size);
    this.ruggedness = new Float32Array(this.size);
    this.owner = new Array(this.size);
    this.cellIndex = new SquareIndex(cells.lat, cells.lon, cells.half);
    for (let i = 0; i < L; i++) {
      this.lat[i] = cells.lat[i];
      this.lon[i] = cells.lon[i];
      this.halfDeg[i] = cells.half[i];
      this.terrain[i] = TERRAINS[cells.terrain[i]];
      this.elevation[i] = cells.elevation[i];
      this.ruggedness[i] = cells.ruggedness[i];
      this.owner[i] = this.nationIds[cells.owner[i]];
      this.popShare[i] = cells.popShare[i];
      this.railKm[i] = cells.railKm[i];
      this.ports[i] = Math.min(255, cells.ports[i]);
      this.airports[i] = Math.min(255, cells.airports[i]);
    }
    this.seaIndex = new Map();
    const seaCols = 360 / sea.res;
    for (let j = 0; j < sea.lat.length; j++) {
      const n = L + j;
      this.lat[n] = sea.lat[j];
      this.lon[n] = sea.lon[j];
      this.halfDeg[n] = sea.res / 2;
      this.terrain[n] = 'plain';
      this.owner[n] = '' as NationId;
      const r = Math.floor((90 - sea.lat[j]) / sea.res), c = Math.floor((sea.lon[j] + 180) / sea.res);
      this.seaIndex.set(r * seaCols + c, n);
    }
    this.cosLat = Float64Array.from(this.lat, (v) => Math.cos(v * TO_RAD));
    this.nearest = new NearestIndex(this.lat, this.lon, this.cosLat);

    const lists: number[][] = Array.from({ length: this.size }, () => []);
    const link = (a: number, b: number) => {
      if (a === b || lists[a].includes(b)) return;
      lists[a].push(b);
      lists[b].push(a);
    };
    for (let i = 0; i < L; i++) {
      for (const j of cells.adj[i]) link(i, j);
      if (cells.coastZone[i] >= 0) link(i, L + cells.coastZone[i]);
    }
    sea.neighbors.forEach((ns, j) => ns.forEach((k) => link(L + j, L + k)));

    this.adjStart = new Int32Array(this.size + 1);
    for (let n = 0; n < this.size; n++) this.adjStart[n + 1] = this.adjStart[n] + lists[n].length;
    this.adj = new Int32Array(this.adjStart[this.size]);
    this.adjKm = new Float32Array(this.adj.length);
    for (let n = 0; n < this.size; n++)
      lists[n].forEach((m, k) => {
        this.adj[this.adjStart[n] + k] = m;
        this.adjKm[this.adjStart[n] + k] = this.distanceKm(n as NodeId, m as NodeId);
      });

    this.fixedLinks = data.fixedLinks.map((l) => ({ name: l.name, a: l.a as NodeId, b: l.b as NodeId }));
    this.cities = data.cities.map((c) => ({ name: c.name, nation: this.nationIds[c.nation], node: c.cell as NodeId, pop: c.pop, capital: c.capital, lat: c.lat, lon: c.lon }));
    this.chokepoints = chokepointsOf(this);
  }

  isSea(n: NodeId): boolean {
    return n >= this.landCount;
  }

  isCoastal(n: NodeId): boolean {
    if (this.isSea(n)) return false;
    for (const m of this.neighbors(n)) if (this.isSea(m)) return true;
    return false;
  }

  *neighbors(n: NodeId): Iterable<NodeId> {
    for (let k = this.adjStart[n]; k < this.adjStart[n + 1]; k++) yield this.adj[k] as NodeId;
  }

  distanceKm(a: NodeId, b: NodeId): number {
    return havKm(this.lat[a], this.lon[a], this.lat[b], this.lon[b], this.cosLat[a], this.cosLat[b]);
  }

  /** Land cell containing the point, else the sea zone, else the nearest node. */
  nodeAt(lat: number, lon: number): NodeId {
    const land = this.cellIndex.at(lat, lon);
    if (land >= 0) return land as NodeId;
    const sr = Math.floor((90 - lat) / this.seaRes), sc = Math.floor((((lon + 180) % 360) + 360) % 360 / this.seaRes);
    const s = this.seaIndex.get(sr * (360 / this.seaRes) + sc);
    if (s !== undefined) return s as NodeId;
    return this.nearest.nearest(lat, lon) as NodeId;
  }

  /** All nodes within radius of a point, by straight-line distance. */
  nodesWithin(center: NodeId, radiusKm: number): NodeId[] {
    const out: NodeId[] = [];
    const la = this.lat[center], lo = this.lon[center];
    const dLat = radiusKm / 111;
    for (let n = 0; n < this.size; n++) {
      if (Math.abs(this.lat[n] - la) > dLat) continue;
      if (haversineKm(la, lo, this.lat[n], this.lon[n]) <= radiusKm) out.push(n as NodeId);
    }
    return out;
  }

  nodesOf(nation: NationId): NodeId[] {
    const out: NodeId[] = [];
    for (let n = 0; n < this.landCount; n++) if (this.owner[n] === nation) out.push(n as NodeId);
    return out;
  }
}

const TO_RAD = Math.PI / 180;
const EARTH_KM = 6371;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return havKm(lat1, lon1, lat2, lon2, Math.cos(lat1 * TO_RAD), Math.cos(lat2 * TO_RAD));
}

function havKm(lat1: number, lon1: number, lat2: number, lon2: number, cos1: number, cos2: number): number {
  const dLat = (lat2 - lat1) * TO_RAD, dLon = (lon2 - lon1) * TO_RAD;
  const h = Math.sin(dLat / 2) ** 2 + cos1 * cos2 * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

const ROWS = 180, COLS = 360;
const rowOf = (lat: number) => Math.min(ROWS - 1, Math.max(0, Math.floor(90 - lat)));
const colOf = (lon: number) => ((Math.floor(lon + 180) % COLS) + COLS) % COLS;

/**
 * Nearest node to a point by haversine km, ties to the lowest id. Nodes are bucketed by the 1-degree square
 * holding their centre; the search walks rings of squares outward until no unvisited square can hold a closer node.
 */
class NearestIndex {
  private readonly start = new Int32Array(ROWS * COLS + 1);
  private readonly nodes: Int32Array;
  /** First and last rows holding any node, so the bounds ignore empty polar rows. */
  private readonly minRow: number;
  private readonly maxRow: number;

  constructor(private readonly lat: Float32Array, private readonly lon: Float32Array, private readonly cosLat: Float64Array) {
    const key = (n: number) => rowOf(lat[n]) * COLS + colOf(lon[n]);
    for (let n = 0; n < lat.length; n++) this.start[key(n) + 1]++;
    for (let k = 0; k < ROWS * COLS; k++) this.start[k + 1] += this.start[k];
    const fill = this.start.slice(0, ROWS * COLS);
    this.nodes = new Int32Array(lat.length);
    for (let n = 0; n < lat.length; n++) this.nodes[fill[key(n)]++] = n;
    this.minRow = rowOf(lat.reduce((a, v) => Math.max(a, v), -90));
    this.maxRow = rowOf(lat.reduce((a, v) => Math.min(a, v), 90));
  }

  nearest(lat: number, lon: number): number {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return this.scan(lat, lon);
    const cosQ = Math.cos(lat * TO_RAD);
    const qr = rowOf(lat), qc = colOf(lon);
    const best = { n: -1, d: Infinity };
    // A ring of radius 180 would wrap onto squares already seen; by then a plain scan is as cheap.
    for (let r = 0; r < COLS / 2; r++) {
      for (const row of r ? [qr - r, qr + r] : [qr]) for (let dc = -r; dc <= r; dc++) this.visit(row, qc + dc, lat, lon, cosQ, best);
      for (let row = qr - r + 1; row < qr + r; row++) {
        this.visit(row, qc - r, lat, lon, cosQ, best);
        this.visit(row, qc + r, lat, lon, cosQ, best);
      }
      // 1 m of slack absorbs rounding in the bound so a node tied with the best is never skipped.
      if (this.outsideKm(r, qr, qc, lat, lon, cosQ) > best.d + 1e-3) return best.n;
    }
    return this.scan(lat, lon);
  }

  private visit(row: number, col: number, lat: number, lon: number, cosQ: number, best: { n: number; d: number }): void {
    if (row < 0 || row >= ROWS) return;
    const k = row * COLS + ((col % COLS) + COLS) % COLS;
    for (let i = this.start[k]; i < this.start[k + 1]; i++) {
      const n = this.nodes[i];
      const d = havKm(lat, lon, this.lat[n], this.lon[n], cosQ, this.cosLat[n]);
      if (d < best.d || (d === best.d && n < best.n)) { best.d = d; best.n = n; }
    }
  }

  /** Lower bound on the km from the point to any node outside the squares within r rings of (qr, qc). */
  private outsideKm(r: number, qr: number, qc: number, lat: number, lon: number, cosQ: number): number {
    const top = qr - r, bottom = qr + r;
    // Great-circle distance is at least the latitude difference.
    const north = top > this.minRow ? (90 - top - lat) * TO_RAD * EARTH_KM : Infinity;
    const south = bottom < this.maxRow ? (lat - (89 - bottom)) * TO_RAD * EARTH_KM : Infinity;
    // A node in the band but r+1 or more columns away is at least gap degrees of longitude away, at a latitude no
    // nearer the pole than the band's edge: hav(d) >= cos(lat1) cos(lat2) hav(dLon).
    const lo = Math.max(top, this.minRow), hi = Math.min(bottom, this.maxRow);
    if (lo > hi) return Math.min(north, south);
    const lon180 = lon - 360 * Math.floor((lon + 180) / 360);
    const gap = Math.min(qc + r + 1 - 180 - lon180, lon180 - (qc - r - 180));
    const edgeLat = Math.max(Math.abs(90 - lo), Math.abs(89 - hi));
    const h = cosQ * Math.max(0, Math.cos(edgeLat * TO_RAD)) * Math.sin((gap * TO_RAD) / 2) ** 2;
    const across = 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
    return Math.min(north, south, across);
  }

  private scan(lat: number, lon: number): number {
    let best = 0, bestD = Infinity;
    for (let n = 0; n < this.lat.length; n++) {
      const d = haversineKm(lat, lon, this.lat[n], this.lon[n]);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }
}

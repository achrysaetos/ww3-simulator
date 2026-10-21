import type { NationId, NodeId, Terrain } from './types';
import { TERRAINS } from './types';

/** Shape of src/data/generated/world.json (built by scripts/build-data.ts). */
export interface WorldData {
  generated: string;
  terrainTypes: readonly string[];
  nations: { iso3: string; name: string; stats: Record<string, number>; capital: { name: string; cell: number } | null }[];
  /**
   * Land cells are squares: 1 degree, or 1/2 to 1/8 degree inside refined 1-degree squares. `adj` lists each
   * cell's land neighbours: cells whose land touches, or that a bridge or tunnel joins.
   */
  cells: { lat: number[]; lon: number[]; half: number[]; owner: number[]; terrain: number[]; popShare: number[]; railKm: number[]; ports: number[]; airports: number[]; coastZone: number[]; adj: number[][] };
  cities: { name: string; nation: number; cell: number; pop: number; capital: boolean; lat: number; lon: number }[];
  sea: { res: number; lat: number[]; lon: number[]; neighbors: number[][] };
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
  readonly nationIds: NationId[];
  private readonly cellIndex: SquareIndex;
  private readonly seaIndex: Map<number, number>;
  private readonly seaRes: number;

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
    this.owner = new Array(this.size);
    this.cellIndex = new SquareIndex(cells.lat, cells.lon, cells.half);
    for (let i = 0; i < L; i++) {
      this.lat[i] = cells.lat[i];
      this.lon[i] = cells.lon[i];
      this.halfDeg[i] = cells.half[i];
      this.terrain[i] = TERRAINS[cells.terrain[i]];
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

    this.cities = data.cities.map((c) => ({ name: c.name, nation: this.nationIds[c.nation], node: c.cell as NodeId, pop: c.pop, capital: c.capital, lat: c.lat, lon: c.lon }));
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
    return haversineKm(this.lat[a], this.lon[a], this.lat[b], this.lon[b]);
  }

  /** Land cell containing the point, else the sea zone, else the nearest node. */
  nodeAt(lat: number, lon: number): NodeId {
    const land = this.cellIndex.at(lat, lon);
    if (land >= 0) return land as NodeId;
    const sr = Math.floor((90 - lat) / this.seaRes), sc = Math.floor((((lon + 180) % 360) + 360) % 360 / this.seaRes);
    const s = this.seaIndex.get(sr * (360 / this.seaRes) + sc);
    if (s !== undefined) return s as NodeId;
    let best = 0, bestD = Infinity;
    for (let n = 0; n < this.size; n++) {
      const d = haversineKm(lat, lon, this.lat[n], this.lon[n]);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best as NodeId;
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

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

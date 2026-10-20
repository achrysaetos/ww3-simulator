import type { NationId, NodeId, Terrain } from './types';
import { TERRAINS } from './types';

/** Shape of src/data/generated/world.json (built by scripts/build-data.ts). */
export interface WorldData {
  generated: string;
  terrainTypes: readonly string[];
  nations: { iso3: string; name: string; stats: Record<string, number>; capital: { name: string; cell: number } | null }[];
  cells: { res: number; cols: number; id: number[]; owner: number[]; terrain: number[]; popShare: number[]; railKm: number[]; ports: number[]; airports: number[]; coastZone: number[] };
  cities: { name: string; nation: number; cell: number; pop: number; capital: boolean; lat: number; lon: number }[];
  sea: { res: number; lat: number[]; lon: number[]; neighbors: number[][] };
}

export interface City { name: string; nation: NationId; node: NodeId; pop: number; capital: boolean; lat: number; lon: number }

/**
 * Static geography: one graph over land cells (1 degree) and sea zones (3 degree).
 * Node ids 0..landCount-1 are land; landCount.. are sea. Immutable during a run.
 */
export class GameMap {
  readonly landCount: number;
  readonly size: number;
  readonly lat: Float32Array;
  readonly lon: Float32Array;
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
  private readonly cellIndex: Map<number, number>;
  private readonly seaIndex: Map<number, number>;
  private readonly cellRes: number;
  private readonly cellCols: number;
  private readonly seaRes: number;

  constructor(readonly data: WorldData) {
    const { cells, sea } = data;
    this.nationIds = data.nations.map((n) => n.iso3 as NationId);
    this.landCount = cells.id.length;
    this.size = this.landCount + sea.lat.length;
    this.cellRes = cells.res;
    this.cellCols = cells.cols;
    this.seaRes = sea.res;
    const L = this.landCount;
    this.lat = new Float32Array(this.size);
    this.lon = new Float32Array(this.size);
    this.popShare = new Float32Array(this.size);
    this.railKm = new Float32Array(this.size);
    this.ports = new Uint8Array(this.size);
    this.airports = new Uint8Array(this.size);
    this.terrain = new Array(this.size);
    this.owner = new Array(this.size);
    this.cellIndex = new Map();
    for (let i = 0; i < L; i++) {
      const id = cells.id[i];
      this.cellIndex.set(id, i);
      this.lat[i] = 90 - (Math.floor(id / cells.cols) + 0.5) * cells.res;
      this.lon[i] = -180 + ((id % cells.cols) + 0.5) * cells.res;
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
      const id = cells.id[i], r = Math.floor(id / cells.cols), c = id % cells.cols;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dy && !dx) continue;
          const j = this.cellIndex.get((r + dy) * cells.cols + ((c + dx + cells.cols) % cells.cols));
          if (j !== undefined) link(i, j);
        }
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
    const r = Math.floor((90 - lat) / this.cellRes), c = Math.floor((((lon + 180) % 360) + 360) % 360 / this.cellRes);
    const land = this.cellIndex.get(r * this.cellCols + c);
    if (land !== undefined) return land as NodeId;
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

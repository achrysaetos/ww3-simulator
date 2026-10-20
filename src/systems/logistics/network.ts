import { relationKey } from '../../core/engine';
import type { GameMap } from '../../core/map';
import type { NationId, World } from '../../core/types';
import {
  AIRLIFT_FACTOR, DECAY_HALF_KM, DEPOT_POP_SHARE, FRONTLINE_CAPACITY, FRONTLINE_COST, FULL_PORT, MAX_DEPOTS, MIN_FACTOR, MIN_RAIL_KM,
  PORT_HANDLING_KM, RAIL_COST_PER_KM, RAIL_CUT_INFRASTRUCTURE, SEA_COST_PER_KM, TERRAIN_ROAD_COST,
} from './tables';

/**
 * Nations whose depots, ports, and territory pool into one supply network: a nation
 * plus every bloc partner it is not at war with. Nations with the same membership
 * share one computed network, so NATO costs one search, not thirty.
 */
export function networkMembers(world: World, nation: NationId): NationId[] {
  const self = world.nations[nation];
  const out = [nation];
  if (!self || self.blocs.length === 0) return out;
  for (const other of Object.values(world.nations)) {
    if (other.id === nation || other.status === 'capitulated' || other.status === 'collapsed') continue;
    if (!other.blocs.some((b) => self.blocs.includes(b))) continue;
    if (world.relations[relationKey(nation, other.id)]?.atWar) continue;
    out.push(other.id);
  }
  return out.sort();
}

export const networkKey = (members: readonly NationId[]): string => members.join(',');

const enum Mode { Road, Rail, Port, Sea, Closed }

/** Per-map facts the search reuses every run: edge modes and base costs, and each nation's depots. */
interface StaticNet {
  mode: Uint8Array; // per adjacency entry
  railCost: Float32Array;
  roadCost: Float32Array;
  portCap: Float32Array; // per node
  depots: Map<NationId, Int32Array>;
}

const staticCache = new WeakMap<GameMap, StaticNet>();

function staticNet(map: GameMap): StaticNet {
  const hit = staticCache.get(map);
  if (hit) return hit;
  const E = map.adj.length;
  const mode = new Uint8Array(E), railCost = new Float32Array(E), roadCost = new Float32Array(E);
  const portCap = new Float32Array(map.size);
  for (let n = 0; n < map.landCount; n++) portCap[n] = Math.min(1, map.ports[n] / FULL_PORT);
  for (let u = 0; u < map.size; u++)
    for (let k = map.adjStart[u]; k < map.adjStart[u + 1]; k++) {
      const v = map.adj[k], km = map.adjKm[k];
      const uSea = u >= map.landCount, vSea = v >= map.landCount;
      if (uSea && vSea) {
        mode[k] = Mode.Sea;
        roadCost[k] = km * SEA_COST_PER_KM;
      } else if (uSea || vSea) {
        const land = uSea ? v : u;
        mode[k] = portCap[land] > 0 ? Mode.Port : Mode.Closed;
        roadCost[k] = PORT_HANDLING_KM + km * SEA_COST_PER_KM;
      } else {
        const rail = Math.min(map.railKm[u], map.railKm[v]);
        roadCost[k] = km * TERRAIN_ROAD_COST[map.terrain[v]];
        if (rail >= MIN_RAIL_KM) {
          mode[k] = Mode.Rail;
          // Sparse single-track lines carry less: cost rises as track density falls below 100 km per cell.
          railCost[k] = km * RAIL_COST_PER_KM * Math.sqrt(100 / Math.min(100, rail));
        } else mode[k] = Mode.Road;
      }
    }

  const depots = new Map<NationId, Int32Array>();
  const cells = new Map<NationId, number[]>();
  for (let n = 0; n < map.landCount; n++) {
    const o = map.owner[n];
    if (map.popShare[n] > 0) (cells.get(o) ?? cells.set(o, []).get(o)!).push(n);
  }
  for (const [i, nat] of map.data.nations.entries()) {
    const id = map.nationIds[i];
    const list = (cells.get(id) ?? []).sort((a, b) => map.popShare[b] - map.popShare[a] || a - b);
    const chosen: number[] = nat.capital ? [nat.capital.cell] : [];
    let share = 0;
    for (const n of list) {
      if (share >= DEPOT_POP_SHARE || chosen.length >= MAX_DEPOTS) break;
      if (!chosen.includes(n)) chosen.push(n);
      share += map.popShare[n];
    }
    depots.set(id, Int32Array.from(chosen));
  }
  const net = { mode, railCost, roadCost, portCap, depots };
  staticCache.set(map, net);
  return net;
}

export function depotsOf(map: GameMap, nation: NationId): readonly number[] {
  return Array.from(staticNet(map).depots.get(nation) ?? []);
}

const FRIENDLY = 1, ENEMY = 2;

/**
 * Supply throughput factor (0..1) at every node for one network: the share of
 * nominal tonnage that reaches a formation there. A best-first search from the
 * members' depots over friendly land, ports and sea, where each route carries
 * `capacity x decay(cost)`. Capacity is the worst infrastructure, port, sea-control
 * or frontline bottleneck on the route; cost is road-km equivalents, so rail and
 * sea legs are cheap and the last truck leg from the railhead dominates.
 */
export function computeNetwork(
  world: World,
  map: GameMap,
  members: readonly NationId[],
  enemies: ReadonlySet<NationId>,
  enemyOccupied: readonly number[],
): number[] {
  const { mode, roadCost, railCost, portCap, depots } = staticNet(map);
  const { adjStart, adj, landCount, size } = map;
  const infra = world.theater.infrastructure, sea = world.theater.seaControl, control = world.control;
  // Hoisted: module-level imports compile to getters under some loaders, which shows up in this loop.
  const halfKm = DECAY_HALF_KM, railCut = RAIL_CUT_INFRASTRUCTURE, frontCap = FRONTLINE_CAPACITY, frontCost = FRONTLINE_COST, minFactor = MIN_FACTOR;
  const memberSet = new Set(members);

  const status = new Uint8Array(size);
  for (let n = 0; n < landCount; n++) {
    const c = control[n];
    if (memberSet.has(c)) status[n] = FRIENDLY;
    else if (enemies.has(c)) status[n] = ENEMY;
  }
  const blocked = new Uint8Array(size);
  for (const n of enemyOccupied) blocked[n] = 1;

  const front = new Int8Array(size).fill(-1);
  const frontline = (n: number): boolean => {
    if (front[n] < 0) {
      front[n] = 0;
      for (let k = adjStart[n]; k < adjStart[n + 1]; k++) if (status[adj[k]] === ENEMY) front[n] = 1;
    }
    return front[n] === 1;
  };

  const value = new Float64Array(size);
  const cost = new Float64Array(size);
  const cap = new Float64Array(size);
  const done = new Uint8Array(size);
  const heap = new MaxHeap();

  for (const m of members)
    for (const d of depots.get(m) ?? []) {
      if (control[d] !== m || blocked[d]) continue;
      const v = Math.max(0, infra[d]);
      if (v > value[d]) {
        value[d] = v;
        cap[d] = v;
        cost[d] = 0;
        heap.push(d, v);
      }
    }

  while (heap.size) {
    const u = heap.pop();
    if (done[u]) continue;
    done[u] = 1;
    for (let k = adjStart[u], end = adjStart[u + 1]; k < end; k++) {
      const v = adj[k];
      if (done[v] || blocked[v]) continue;
      let c: number, q: number;
      switch (mode[k] as Mode) {
        case Mode.Closed:
          continue;
        case Mode.Sea: {
          const sc = sea[v];
          q = sc && enemies.has(sc.nation) ? 1 - sc.level : 1;
          c = roadCost[k];
          break;
        }
        case Mode.Port: {
          const land = v < landCount ? v : u;
          if (status[land] !== FRIENDLY) continue;
          if (v >= landCount) {
            const sc = sea[v];
            q = portCap[land] * infra[land] * (sc && enemies.has(sc.nation) ? 1 - sc.level : 1);
          } else q = portCap[land] * infra[land];
          c = roadCost[k];
          break;
        }
        default: {
          if (status[v] !== FRIENDLY) continue;
          q = infra[v];
          const rail = mode[k] === Mode.Rail && infra[u] >= railCut && q >= railCut;
          c = (rail ? railCost[k] : roadCost[k]) / (0.25 + 0.75 * q);
          if (frontline(v)) {
            q *= frontCap;
            c *= frontCost;
          }
        }
      }
      const nCap = Math.min(cap[u], q), nCost = cost[u] + c;
      const r = nCost / halfKm;
      const nVal = nCap / (1 + r * r);
      if (nVal <= value[v] || nVal < minFactor) continue;
      value[v] = nVal;
      cap[v] = nCap;
      cost[v] = nCost;
      heap.push(v, nVal);
    }
  }

  const air = world.theater.airControl;
  const out: number[] = [];
  for (let n = 0; n < size; n++) {
    let v = value[n];
    if (map.airports[n] > 0 && status[n] === FRIENDLY && !blocked[n]) {
      const ac = air[n];
      v = Math.max(v, AIRLIFT_FACTOR * (ac && enemies.has(ac.nation) ? 1 - ac.level : 1));
    }
    out.push(Math.round(v * 1000) / 1000);
  }
  return out;
}

/** Binary max-heap over (node, key) with typed storage; stale entries are skipped by the caller. */
class MaxHeap {
  private ids = new Int32Array(1024);
  private keys = new Float64Array(1024);
  size = 0;
  push(id: number, key: number) {
    if (this.size === this.ids.length) {
      const ids = new Int32Array(this.size * 2), keys = new Float64Array(this.size * 2);
      ids.set(this.ids);
      keys.set(this.keys);
      this.ids = ids;
      this.keys = keys;
    }
    const ids = this.ids, keys = this.keys;
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] >= key) break;
      ids[i] = ids[p];
      keys[i] = keys[p];
      i = p;
    }
    ids[i] = id;
    keys[i] = key;
  }
  pop(): number {
    const ids = this.ids, keys = this.keys;
    const top = ids[0];
    const n = --this.size;
    const id = ids[n], key = keys[n];
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i, mk = key;
      if (l < n && keys[l] > mk) { m = l; mk = keys[l]; }
      if (r < n && keys[r] > mk) m = r;
      if (m === i) break;
      ids[i] = ids[m];
      keys[i] = keys[m];
      i = m;
    }
    ids[i] = id;
    keys[i] = key;
    return top;
  }
}

import type { GameMap } from '../../core/map';
import type { NationId, World } from '../../core/types';
import {
  AIRLIFT_FACTOR, BEACH_CAPACITY, DECAY_HALF_KM, DEPOT_POP_SHARE, FRONTLINE_CAPACITY, FRONTLINE_COST, FULL_PORT, HOST_SUPPORT, LAST_MILE_CAPACITY, MAX_DEPOTS, MIN_FACTOR, MIN_RAIL_KM,
  PORT_HANDLING_KM, RAIL_COST_PER_KM, RAIL_CUT_INFRASTRUCTURE, SEA_COST_PER_KM, TERRAIN_ROAD_COST,
} from './tables';

/**
 * Nations whose depots, ports, and territory pool into one supply network: a nation
 * plus every bloc partner it is not at war with. Nations with the same membership
 * share one computed network, so NATO costs one search, not thirty.
 */
export function networkMembers(world: World, enemies: ReadonlyMap<NationId, ReadonlySet<NationId>>): (nation: NationId) => NationId[] {
  const byBloc = new Map<string, NationId[]>();
  for (const id in world.nations) {
    const other = world.nations[id as NationId];
    if (other.status === 'capitulated' || other.status === 'collapsed') continue;
    for (const b of other.blocs) (byBloc.get(b) ?? byBloc.set(b, []).get(b)!).push(other.id);
  }
  // Most nations are at peace and share their bloc list with others, so the pooled partners are computed once per bloc list.
  const pooled = new Map<string, NationId[]>();
  return (nation) => {
    const blocs = world.nations[nation]?.blocs ?? [];
    const blocKey = blocs.join('|');
    let partners = pooled.get(blocKey);
    if (!partners) {
      const set = new Set<NationId>();
      for (const b of blocs) for (const other of byBloc.get(b)!) set.add(other);
      pooled.set(blocKey, (partners = [...set].sort()));
    }
    const foes = enemies.get(nation);
    if (!foes && (blocs.length === 0 || partners.includes(nation))) return blocs.length ? partners : [nation];
    const out = partners.filter((o) => o !== nation && !foes?.has(o));
    out.push(nation);
    return out.sort();
  };
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
  for (let n = 0; n < map.landCount; n++) {
    let coast = false;
    for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) coast ||= map.adj[k] >= map.landCount;
    portCap[n] = map.ports[n] > 0 ? Math.min(1, map.ports[n] / FULL_PORT) : coast ? BEACH_CAPACITY : 0;
  }
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

/** A factor in thousandths for forces at a node, and the route it arrives by. */
export interface ForcesSupply {
  milli: number;
  route: 'network' | 'overland' | 'beach';
}

export function depotsOf(map: GameMap, nation: NationId): readonly number[] {
  return Array.from(staticNet(map).depots.get(nation) ?? []);
}

// Copied once: module imports compile to getters under some dev loaders, which shows up in the search loop.
const HALF_KM = DECAY_HALF_KM, RAIL_CUT = RAIL_CUT_INFRASTRUCTURE, FRONT_CAP = FRONTLINE_CAPACITY, FRONT_COST = FRONTLINE_COST, MIN_VALUE = MIN_FACTOR, AIRLIFT = AIRLIFT_FACTOR;
const FRIENDLY = 1, ENEMY = 2;
/** Per-node search state: not reached, waiting in the frontier, or settled with its overland factor in thousandths stored as SETTLED + thousandths. */
const UNSEEN = 0, QUEUED = 1, SETTLED = 2;
const DRAIN = -1;

/** Each land cell's controller as a small integer (0 = none or sea), so a search classifies cells by array reads instead of string lookups. */
export class Controllers {
  readonly index = new Map<NationId, number>();
  readonly cell: Uint16Array;

  constructor(map: GameMap, control: readonly NationId[]) {
    this.cell = new Uint16Array(map.size);
    for (let n = 0; n < map.landCount; n++) this.set(n, control[n]);
    workspaceFor(map);
  }

  of(nation: NationId): number {
    let i = this.index.get(nation);
    if (i === undefined) this.index.set(nation, (i = this.index.size + 1));
    return i;
  }

  set(node: number, nation: NationId | undefined): void {
    this.cell[node] = nation ? this.of(nation) : 0;
  }
}

/** Shared scratch for whichever search is running, pointed at that search's own node arrays. */
interface Workspace {
  readonly adjStart: Int32Array;
  readonly adj: Int32Array;
  readonly landCount: number;
  readonly mode: Uint8Array;
  readonly roadCost: Float32Array;
  readonly railCost: Float32Array;
  readonly portCap: Float32Array;
  readonly blocked: Uint8Array;
  /** 1 on cells whose railway is closed (SearchInputs.captured) while a search runs. */
  readonly unrailed: Uint8Array;
  readonly seaQ: Float64Array;
  /** Frontline memo, valid where frontStamp equals stamp. */
  readonly frontStamp: Int32Array;
  readonly front: Uint8Array;
  stamp: number;
  readonly heap: MaxHeap;
  /** Nodes reset by a reopened route, waiting to be re-seeded. */
  readonly reopened: number[];
  /** The running search's node arrays and inputs. */
  state: Uint16Array;
  cap: Float64Array;
  cost: Float64Array;
  /** Node the best route came through; -1 for a depot or an unreached node. */
  parent: Int32Array;
  side: Uint8Array;
  cell: Uint16Array;
  infra: readonly number[];
}

const workspaces = new WeakMap<GameMap, Workspace>();

function workspaceFor(map: GameMap): Workspace {
  let w = workspaces.get(map);
  if (!w) {
    const size = map.size, net = staticNet(map);
    w = {
      adjStart: map.adjStart, adj: map.adj, landCount: map.landCount,
      mode: net.mode, roadCost: net.roadCost, railCost: net.railCost, portCap: net.portCap,
      blocked: new Uint8Array(size), unrailed: new Uint8Array(size), seaQ: new Float64Array(size), frontStamp: new Int32Array(size), front: new Uint8Array(size), stamp: 0,
      heap: new MaxHeap(), reopened: [],
      state: new Uint16Array(0), cap: new Float64Array(0), cost: new Float64Array(0), parent: new Int32Array(0), side: new Uint8Array(0), cell: new Uint16Array(0), infra: [],
    };
    workspaces.set(map, w);
  }
  return w;
}

const valueOf = (w: Workspace, x: number): number => {
  const r = w.cost[x] / HALF_KM;
  return w.cap[x] / (1 + r * r);
};

/**
 * Offers each node across adjacency entries `from..to` of settled `u` the route
 * through `u`. A route carries the worst of infrastructure, port, sea-control and
 * frontline capacity along it, and costs road-km equivalents, so rail and sea legs
 * are cheap and the last truck leg from the railhead dominates.
 */
function relaxEdges(w: Workspace, u: number, from: number, to: number): void {
  const { adj, adjStart, landCount, mode, roadCost, railCost, portCap, cap, cost, parent, blocked, unrailed, seaQ, frontStamp, front, stamp, heap, state, side, cell, infra } = w;
  const capU = cap[u], costU = cost[u];
  for (let k = from; k < to; k++) {
    const v = adj[k];
    if (blocked[v]) continue;
    let c: number, q: number;
    switch (mode[k] as Mode) {
      case Mode.Closed:
        continue;
      case Mode.Sea:
        q = seaQ[v];
        c = roadCost[k];
        break;
      case Mode.Port: {
        const land = v < landCount ? v : u;
        if (side[cell[land]] !== FRIENDLY) continue;
        q = v >= landCount ? portCap[land] * infra[land] * seaQ[v] : portCap[land] * infra[land];
        c = roadCost[k];
        break;
      }
      default: {
        if (side[cell[v]] !== FRIENDLY) continue;
        q = infra[v];
        const rail = mode[k] === Mode.Rail && infra[u] >= RAIL_CUT && q >= RAIL_CUT && !unrailed[u] && !unrailed[v];
        c = (rail ? railCost[k] : roadCost[k]) / (0.25 + 0.75 * q);
        if (frontStamp[v] !== stamp) {
          frontStamp[v] = stamp;
          front[v] = 0;
          for (let j = adjStart[v], e = adjStart[v + 1]; j < e; j++) if (side[cell[adj[j]]] === ENEMY) front[v] = 1;
        }
        if (front[v]) {
          q *= FRONT_CAP;
          c *= FRONT_COST;
        }
      }
    }
    const nCap = Math.min(capU, q), nCost = costU + c;
    const r = nCost / HALF_KM;
    const nVal = nCap / (1 + r * r);
    if (nVal < MIN_VALUE) continue;
    const st = state[v];
    if (st !== UNSEEN) {
      const rv = cost[v] / HALF_KM;
      if (nVal <= cap[v] / (1 + rv * rv)) continue;
      // A settled node can only be beaten after a repair; whatever was routed through it is reset.
      if (st >= SETTLED) forgetBelow(w, v, w.reopened);
    }
    cap[v] = nCap;
    cost[v] = nCost;
    parent[v] = u;
    state[v] = QUEUED;
    heap.push(v, nVal);
  }
}

/** Resets every node whose route runs through `x`, not `x` itself, collecting them in `out`. */
function forgetBelow(w: Workspace, x: number, out: number[]): void {
  const stack = [x];
  while (stack.length) {
    const y = stack.pop()!;
    for (let k = w.adjStart[y]; k < w.adjStart[y + 1]; k++) {
      const z = w.adj[k];
      if (w.parent[z] === y && w.state[z] !== UNSEEN) {
        stack.push(z);
        forget(w, z);
        out.push(z);
      }
    }
  }
}

function forget(w: Workspace, x: number): void {
  w.state[x] = UNSEEN;
  w.parent[x] = -1;
  w.cap[x] = 0;
  w.cost[x] = 0;
}

const NO_F64 = new Float64Array(0), NO_I32 = new Int32Array(0);

/** The inputs a search reads, as every network last saw them, so a factor settled late agrees with one settled early. */
export interface SearchInputs {
  control: readonly (NationId | undefined)[];
  infrastructure: readonly number[];
  /** Cells whose railway is closed until rebuilt, so traffic moves by road. */
  captured?: readonly number[];
  sea: Readonly<Record<number, { nation: NationId; level: number }>>;
  air: Readonly<Record<number, { nation: NationId; level: number }>>;
}

/**
 * One network's supply search, kept between ticks: a best-first search from the
 * members' depots over friendly land, ports and sea for the throughput factor at
 * each node, the share of nominal tonnage that reaches a formation there.
 *
 * Nodes settle in falling factor order and a settled node's factor is final, so the
 * search runs only as far as someone reads: a nation with forces at home never
 * floods the world's oceans. When inputs change, `repair` re-opens only the part of
 * the search tree routed through the changed nodes instead of starting over.
 */
export class NetworkSearch {
  /** UNSEEN, QUEUED, or SETTLED + overland factor in thousandths, per node. Airlift is read live, so air control never re-opens the search. */
  private readonly state: Uint16Array;
  /** Best route's capacity and road-km cost per node, and the node it came through. */
  private readonly cap: Float64Array;
  private readonly cost: Float64Array;
  private readonly parent: Int32Array;
  /** FRIENDLY or ENEMY per controller index, for members and foes. */
  private readonly side: Uint8Array;
  private readonly foes: ReadonlySet<NationId>;
  private readonly depots = new Map<number, NationId>();
  private blocked: ReadonlySet<number>;
  private seeded = false;
  /** Lowest factor settled so far. Settled nodes are all at or above it, and while the heap holds nothing above it every settled factor is final. */
  private floor = Infinity;
  /** The frontier heap, saved between runs. */
  private heapIds: Int32Array = NO_I32;
  private heapKeys: Float64Array = NO_F64;
  private heapSize = 0;
  /** Heap entries left after the last pruning of stale ones. */
  private heapLive = 0;

  constructor(
    private readonly map: GameMap,
    private readonly controllers: Controllers,
    members: readonly NationId[],
    foes: readonly NationId[],
    occupied: readonly number[],
  ) {
    this.state = new Uint16Array(map.size);
    this.cap = new Float64Array(map.size);
    this.cost = new Float64Array(map.size);
    this.parent = new Int32Array(map.size).fill(-1);
    this.foes = new Set(foes);
    this.blocked = new Set(occupied);
    for (const n of [...members, ...foes]) controllers.of(n);
    this.side = new Uint8Array(controllers.index.size + 1);
    for (const e of foes) this.side[controllers.of(e)] = ENEMY;
    for (const m of members) this.side[controllers.of(m)] = FRIENDLY;
    const depots = staticNet(map).depots;
    for (const m of members) for (const d of depots.get(m) ?? []) if (!this.depots.has(d)) this.depots.set(d, m);
  }

  /**
   * Starts this new search from another network's, as if that search had run with
   * this network's members and foes all along and then had its inputs changed: cells
   * whose side differs (and their neighbours, for the frontline), blocking, and sea
   * control held by a nation whose foe status differs are re-opened. Settled
   * factors come out as a fresh search would give them, so a war that splits a bloc
   * re-searches the front, not the world.
   */
  adopt(inputs: SearchInputs, base: NetworkSearch, changed: Iterable<number>, recaptured: Iterable<number>): void {
    if (!base.seeded) return;
    const { cell } = this.controllers, { adjStart, adj, landCount } = this.map;
    // Per controller: 1 if passability differs, 2 if only foe status does, which moves just the frontline next to it.
    const moved = new Uint8Array(Math.max(base.side.length, this.side.length));
    for (let c = 0; c < moved.length; c++) {
      const was = base.side[c] ?? 0, now = this.side[c] ?? 0;
      if (was !== now) moved[c] = was === FRIENDLY || now === FRIENDLY ? 1 : 2;
    }
    const resided = [...recaptured];
    const nodes = [...changed];
    for (let n = 0; n < landCount; n++) {
      const m = moved[cell[n]];
      if (m === 1) resided.push(n);
      else if (m === 2) for (let k = adjStart[n]; k < adjStart[n + 1]; k++) if (this.side[cell[adj[k]]] === FRIENDLY) nodes.push(adj[k]);
    }
    nodes.push(...resided);
    for (const n of base.blocked) if (!this.blocked.has(n)) nodes.push(n);
    for (const n of this.blocked) if (!base.blocked.has(n)) nodes.push(n);
    const sea = inputs.sea;
    for (const k in sea) if (base.foes.has(sea[k].nation) !== this.foes.has(sea[k].nation)) nodes.push(Number(k));
    this.state.set(base.state);
    this.cap.set(base.cap);
    this.cost.set(base.cost);
    this.parent.set(base.parent);
    this.heapIds = base.heapIds.slice(0, base.heapSize);
    this.heapKeys = base.heapKeys.slice(0, base.heapSize);
    this.heapSize = base.heapSize;
    this.heapLive = base.heapLive;
    this.floor = base.floor;
    this.seeded = true;
    this.repair(inputs, nodes, resided, [...this.blocked]);
  }

  /** Factor at `node` in thousandths: the better of the overland route and airlift. */
  milliAt(inputs: SearchInputs, node: number): number {
    if (this.state[node] < SETTLED) this.cover(inputs, [node]);
    const s = this.state[node], air = Math.round(this.airlift(inputs, node) * 1000);
    return s >= SETTLED && s - SETTLED > air ? s - SETTLED : air;
  }

  /**
   * How forces at `node` are fed. Forces in a cell the network cannot enter (enemy-held,
   * or their own with stronger enemy forces in it) fight at its near edge, ~100 km from
   * the far one, and are fed across the contact line from the best adjacent cell their
   * side holds, at LAST_MILE_CAPACITY of what reaches that cell, never through a cell the
   * enemy holds. An adjacent own cell the enemy outnumbers them in still passes on what
   * its own neighbours feed it, so an interlocked front is fed along the line of contact;
   * a spearhead with no friendly ground next to it has outrun its road and rail net.
   * A lodgement on a coast with no friendly ground next to it is fed over the beach
   * from the adjacent sea zone, as far as sea control lets the network reach it
   * (Normandy, Inchon); the caller scales that by the lift left to carry it. So is one
   * that has taken its beach cell while stronger defenders still fight in it.
   * Forces on the ground of a nation outside the network and not its enemy (a base
   * abroad, a ceasefire line) are fed like that or by the host, whichever is better.
   */
  forcesSupplyAt(inputs: SearchInputs, node: number): ForcesSupply {
    const own = this.milliAt(inputs, node);
    const { landCount, adjStart, adj } = this.map;
    if (own > 0 || node >= landCount) return { milli: own, route: 'network' };
    const { side } = this, cell = this.controllers.cell;
    const held = side[cell[node]];
    const host = held !== ENEMY && held !== FRIENDLY && cell[node] !== 0;
    if (!(held === ENEMY || host || (held === FRIENDLY && this.blocked.has(node)))) return { milli: own, route: 'network' };
    let sea = 0, land = -1;
    for (let k = adjStart[node]; k < adjStart[node + 1]; k++) {
      const v = adj[k];
      if (v >= landCount) sea = Math.max(sea, this.milliAt(inputs, v));
      else if (side[cell[v]] === FRIENDLY) land = Math.max(land, this.contactMilli(inputs, v));
    }
    const overland = Math.round(Math.max(0, land) * LAST_MILE_CAPACITY);
    if (host) return { milli: Math.max(overland, Math.round(HOST_SUPPORT * Math.max(0, inputs.infrastructure[node]) * 1000)), route: 'overland' };
    if (land >= 0) return { milli: overland, route: 'overland' };
    return { milli: Math.min(sea, Math.round(BEACH_CAPACITY * 1000)), route: 'beach' };
  }

  /** What reaches own cell `v` for onward carriage across the contact line: its network factor, or, where the enemy outnumbers us in it, what its own neighbours feed it. */
  private contactMilli(inputs: SearchInputs, v: number): number {
    if (this.passable(v)) return this.milliAt(inputs, v);
    const { landCount, adjStart, adj } = this.map;
    let best = 0;
    for (let k = adjStart[v]; k < adjStart[v + 1]; k++) {
      const w = adj[k];
      if (w < landCount && this.passable(w)) best = Math.max(best, this.milliAt(inputs, w));
    }
    return Math.round(best * LAST_MILE_CAPACITY);
  }

  /** Searches on until every node in `nodes` has its factor. */
  cover(inputs: SearchInputs, nodes: Iterable<number>): void {
    if (this.seeded && !this.heapSize) return;
    let w: Workspace | undefined;
    for (const n of nodes) {
      if (this.state[n] >= SETTLED || (n < this.map.landCount && !this.passable(n))) continue;
      w ??= this.open(inputs);
      this.settle(w, inputs, n);
      if (!w.heap.size) break;
    }
    if (w) this.close(w);
  }

  /** Whether an input change at `node` can move this search: the node or a neighbour has been reached. */
  touches(node: number): boolean {
    const { adjStart, adj } = this.map, state = this.state;
    if (state[node] !== UNSEEN) return true;
    for (let k = adjStart[node]; k < adjStart[node + 1]; k++) if (state[adj[k]] !== UNSEEN) return true;
    return false;
  }

  /**
   * Brings the search up to date with inputs that moved at `nodes`, of which
   * `recaptured` changed hands, and with enemy forces now blocking `occupied`. A
   * node's route depends on its own inputs, its parent's route and, on land, whether
   * a neighbour is enemy-held (the frontline). So the changed nodes, the neighbours of
   * cells that changed hands, and everything routed through them are reset and
   * re-seeded from the settled nodes around them.
   */
  repair(inputs: SearchInputs, nodes: readonly number[], recaptured: readonly number[], occupied: readonly number[]): void {
    this.blocked = new Set(occupied);
    const w = this.open(inputs);
    const { adjStart, adj } = w;
    const roots = [...nodes];
    for (const n of recaptured) for (let k = adjStart[n]; k < adjStart[n + 1]; k++) roots.push(adj[k]);
    const reset: number[] = [];
    for (const x of roots)
      if (w.state[x] !== UNSEEN) {
        forgetBelow(w, x, reset);
        forget(w, x);
        reset.push(x);
      }
    for (const x of reset) this.reseed(w, inputs, x);
    for (const x of roots) if (w.state[x] === UNSEEN && (x >= this.map.landCount || this.passable(x))) this.reseed(w, inputs, x);
    // Routes that got better can now beat nodes settled before the change; settle them so every settled factor is final again.
    this.settle(w, inputs, DRAIN);
    this.close(w);
  }

  private passable(n: number): boolean {
    return this.side[this.controllers.cell[n]] === FRIENDLY && !this.blocked.has(n);
  }

  private airlift(inputs: SearchInputs, n: number): number {
    if (!(this.map.airports[n] > 0) || !this.passable(n)) return 0;
    const ac = inputs.air[n];
    return AIRLIFT * (ac && this.foes.has(ac.nation) ? 1 - ac.level : 1);
  }

  private seed(w: Workspace, inputs: SearchInputs, d: number, member: NationId): void {
    if (inputs.control[d] !== member || w.blocked[d]) return;
    const v = Math.max(0, inputs.infrastructure[d]);
    if (w.state[d] === UNSEEN ? v > 0 : v > valueOf(w, d)) {
      w.cap[d] = v;
      w.cost[d] = 0;
      w.parent[d] = -1;
      w.state[d] = QUEUED;
      w.heap.push(d, v);
    }
  }

  /** Gives an unreached node its best route from settled neighbours, or its depot, as the search would have when they settled. */
  private reseed(w: Workspace, inputs: SearchInputs, v: number): void {
    const member = this.depots.get(v);
    if (member) this.seed(w, inputs, v, member);
    const { adjStart, adj } = w;
    for (let k = adjStart[v]; k < adjStart[v + 1]; k++) {
      const u = adj[k];
      if (w.state[u] < SETTLED) continue;
      for (let j = adjStart[u]; j < adjStart[u + 1]; j++) if (adj[j] === v) relaxEdges(w, u, j, j + 1);
    }
  }

  /** Pops nodes in falling factor order until `target` settles (or, for DRAIN, nothing above the floor is left) or nothing is left to reach. */
  private settle(w: Workspace, inputs: SearchInputs, target: number): void {
    const { heap, state, adjStart } = w;
    while (heap.size && (target === DRAIN ? heap.topKey() > this.floor : state[target] < SETTLED)) {
      const key = heap.topKey();
      const u = heap.pop();
      if (state[u] !== QUEUED || key !== valueOf(w, u)) continue;
      if (key < this.floor) this.floor = key;
      state[u] = SETTLED + Math.round(key * 1000);
      relaxEdges(w, u, adjStart[u], adjStart[u + 1]);
      if (w.reopened.length) for (const x of w.reopened.splice(0)) this.reseed(w, inputs, x);
    }
  }

  /** Points the workspace at this search with this run's inputs. */
  private open(inputs: SearchInputs): Workspace {
    const w = workspaceFor(this.map);
    w.state = this.state;
    w.cap = this.cap;
    w.cost = this.cost;
    w.parent = this.parent;
    w.side = this.side;
    w.cell = this.controllers.cell;
    w.infra = inputs.infrastructure;
    w.stamp++;
    for (const n of this.blocked) w.blocked[n] = 1;
    for (const n of inputs.captured ?? []) w.unrailed[n] = 1;
    w.heap.load(this.heapIds, this.heapKeys, this.heapSize);
    w.seaQ.fill(1, w.landCount);
    const sea = inputs.sea;
    for (const k in sea) if (this.foes.has(sea[k].nation)) w.seaQ[Number(k)] = 1 - sea[k].level;
    if (!this.seeded) {
      this.seeded = true;
      for (const [d, m] of this.depots) this.seed(w, inputs, d, m);
    }
    return w;
  }

  /** Saves the frontier and clears the workspace's shared state. */
  private close(w: Workspace): void {
    const { state } = w;
    // Superseded entries below the floor are never popped; drop them before they pile up.
    if (w.heap.size > 2 * this.heapLive + 256) {
      w.heap.prune((n, key) => state[n] === QUEUED && key === valueOf(w, n));
      this.heapLive = w.heap.size;
    }
    for (const n of this.blocked) w.blocked[n] = 0;
    w.unrailed.fill(0);
    [this.heapIds, this.heapKeys, this.heapSize] = w.heap.save();
  }
}

/** Binary max-heap over (node, key) with typed storage; stale entries are skipped by the caller. */
class MaxHeap {
  private ids: Int32Array = NO_I32;
  private keys: Float64Array = NO_F64;
  size = 0;
  topKey(): number {
    return this.keys[0];
  }
  /** Takes over a saved heap's storage, entries in the same layout, so pops come out in the same order. */
  load(ids: Int32Array, keys: Float64Array, size: number): void {
    this.ids = ids;
    this.keys = keys;
    this.size = size;
  }
  /** Hands the storage back, grown if pushes outran it, and empties the heap. */
  save(): [Int32Array, Float64Array, number] {
    const out: [Int32Array, Float64Array, number] = [this.ids, this.keys, this.size];
    this.ids = NO_I32;
    this.keys = NO_F64;
    this.size = 0;
    return out;
  }
  push(id: number, key: number) {
    if (this.size === this.ids.length) {
      const grown = Math.max(1024, this.size * 2);
      const ids = new Int32Array(grown), keys = new Float64Array(grown);
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
    const top = this.ids[0];
    const n = --this.size;
    this.siftDown(0, this.ids[n], this.keys[n]);
    return top;
  }
  /** Drops the entries `live` rejects and restores heap order. */
  prune(live: (id: number, key: number) => boolean): void {
    const ids = this.ids, keys = this.keys;
    let n = 0;
    for (let i = 0; i < this.size; i++)
      if (live(ids[i], keys[i])) {
        ids[n] = ids[i];
        keys[n] = keys[i];
        n++;
      }
    this.size = n;
    for (let i = (n >> 1) - 1; i >= 0; i--) this.siftDown(i, ids[i], keys[i]);
  }
  /** Places (id, key) at slot `i` or below, moving larger children up. */
  private siftDown(i: number, id: number, key: number): void {
    const ids = this.ids, keys = this.keys, n = this.size;
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
  }
}

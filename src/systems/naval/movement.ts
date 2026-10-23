import { atWar, hostility } from '../../core/engine';
import type { GameMap } from '../../core/map';
import { findPath } from '../../core/path';
import type { Formation, NationId, NodeId, World } from '../../core/types';
import { geography, sameWaters, seaNeighbour } from './geography';
import type { Composition, NavalState } from './state';
import { MINE_CLOSURE } from './tables';

/**
 * Fraction of transit fuel burn spent per hour holding station (loiter on one shaft, estimate).
 * A group at its home base burns it too: it stands for a fleet steaming from its base on local
 * exercises and patrols, which DoD operational fuel totals count (DLA Energy FY2019).
 */
const LOITER_BURN = 0.2;
/**
 * Share of its fuel and stores a ship alongside at its home base takes on per day. A naval base
 * keeps its own fuel farm and victualling stores (Pearl Harbor's Red Hill held ~250 million gallons),
 * so a fleet in Kaliningrad, Sevastopol or Sanya draws from the base, not from the land supply
 * network that may not reach it. Rate as logistics' MAX_REFILL_FRACTION_PER_DAY.
 */
const BERTH_REFILL_PER_DAY = 0.5;

/** Minefields by sea node and layer: the true ones for physics, a nation's charted ones for its planners. */
export type Minefields = NavalState['mines'];

/** Hostile mines at a node close it to this nation. */
export function minedClosed(world: World, node: number, nation: NationId, mines: Minefields | undefined = world.slices.naval?.mines): boolean {
  const laid = mines?.[node];
  if (!laid) return false;
  let hostile = 0;
  for (const [layer, n] of Object.entries(laid)) if (atWar(world, layer as NationId, nation)) hostile += n;
  return hostile >= MINE_CLOSURE;
}

/**
 * Where a ship ordered to `target` actually goes: the sea node itself, a friendly or neutral
 * port, or (for any other coastal cell, including a hostile port) the sea zone off that coast.
 */
export function navalDestination(world: World, map: GameMap, nation: NationId, target: NodeId): NodeId | undefined {
  if (map.isSea(target)) return target;
  const owner = world.control[target];
  if (geography(map).portZone.has(target) && !atWar(world, owner, nation)) return target;
  return seaNeighbour(map, target);
}

/** Whether `f` can be sent toward `target` at all: a destination exists and open water joins it, past any hostile minefield or closed strait (orders refuse the rest). */
export function sailable(world: World, map: GameMap, f: Formation, target: NodeId, routes: SeaRoutes): boolean {
  const dest = navalDestination(world, map, f.nation, target);
  if (dest === undefined || !sameWaters(map, f.node, dest)) return false;
  return !routes.closed || routes.joins(f.node, dest);
}

/** One nation's sea routes past hostile minefields and closed straits, worked out once for many queries. */
export interface SeaRoutes {
  /** Whether any strait or hostile minefield is closed to the nation. */
  readonly closed: boolean;
  /** Whether `seaPath(world, map, nation, from, to, undefined, mines)` finds a route. */
  joins(from: NodeId, to: NodeId): boolean;
}

const labelCache = new WeakMap<GameMap, Map<string, Int32Array>>();
/** Sets of closures whose labelling is kept; past this many (mines laid and swept over a long war) the cache starts again. */
const LABELS_KEPT = 16;

/**
 * Answers seaPath's "is there a route" from one labelling of the zones a ship may pass through
 * (open sea and canals), instead of a search per query. A route's last hop may also enter a mined
 * zone or a port, and its first leaves wherever the ship lies. seaPath's expansion cap never
 * binds here: the whole map has fewer cells.
 */
export function seaRoutes(world: World, map: GameMap, nation: NationId, mines: Minefields | undefined = world.slices.naval?.mines): SeaRoutes {
  const geo = geography(map);
  const barred = new Set<number>();
  for (const s of map.straits) if (straitBarred(world, s, nation)) barred.add(s.a * map.size + s.b).add(s.b * map.size + s.a);
  const mined = new Set<number>();
  for (const n in mines) if (minedClosed(world, Number(n), nation, mines)) mined.add(Number(n));
  const passable = (n: number) => (map.isSea(n as NodeId) ? !mined.has(n) : geo.canalNodes.has(n));
  const open = (a: number, b: number) => !barred.has(a * map.size + b);
  let label: Int32Array | undefined;
  const startsFrom = new Map<number, Set<number>>();
  const labels = () => {
    if (label) return label;
    // Coalition partners plan against the same closures: label each set of closures once.
    const key = `${[...barred].join()}|${[...mined].join()}`;
    let cache = labelCache.get(map);
    if (!cache || cache.size > LABELS_KEPT) labelCache.set(map, (cache = new Map()));
    label = cache.get(key);
    if (label) return label;
    cache.set(key, (label = new Int32Array(map.size).fill(-1)));
    for (let s = 0, id = 0; s < map.size; s++, id++) {
      if (label[s] !== -1 || !passable(s)) continue;
      label[s] = id;
      const queue = [s];
      for (let i = 0; i < queue.length; i++)
        for (let k = map.adjStart[queue[i]]; k < map.adjStart[queue[i] + 1]; k++) {
          const m = map.adj[k];
          if (label[m] === -1 && passable(m) && open(queue[i], m)) { label[m] = id; queue.push(m); }
        }
    }
    return label;
  };
  return {
    closed: barred.size > 0 || mined.size > 0,
    joins(from, to) {
      if (from === to) return true;
      if (!map.isSea(to) && !geo.canalNodes.has(to) && !geo.portZone.has(to)) return false;
      const l = labels();
      let starts = startsFrom.get(from);
      if (!starts) {
        startsFrom.set(from, (starts = new Set()));
        for (let k = map.adjStart[from]; k < map.adjStart[from + 1]; k++) if (passable(map.adj[k]) && open(from, map.adj[k])) starts.add(l[map.adj[k]]);
      }
      for (let k = map.adjStart[to]; k < map.adjStart[to + 1]; k++) {
        const u = map.adj[k];
        if (open(u, to) && (u === from || (passable(u) && starts.has(l[u])))) return true;
      }
      return false;
    },
  };
}

/**
 * Whether a strait's regime bars this nation's ships. Under Montreux a belligerent passes the Turkish
 * Straits only when the holder is itself or fights the same enemy; the holder's enemies never pass.
 */
export function straitBarred(world: World, s: GameMap['straits'][number], nation: NationId): boolean {
  if (s.regime !== 'montreux' || s.holder === undefined) return false;
  const holder = world.control[s.holder];
  if (!holder || holder === nation) return false;
  if (atWar(world, holder, nation)) return true;
  const enemies = hostility(world).foes.get(nation);
  if (!enemies?.size) return false;
  for (const enemy of enemies) if (atWar(world, holder, enemy)) return false;
  return true;
}

/**
 * A* over sea zones, canals, and the start/end port. Hostile minefields, and any zone `avoid`
 * names, are impassable except as the destination; so is a strait whose regime bars the nation.
 */
export function seaPath(world: World, map: GameMap, nation: NationId, from: NodeId, to: NodeId, avoid?: (zone: number) => boolean, mines: Minefields | undefined = world.slices.naval?.mines): NodeId[] | null {
  const geo = geography(map);
  const barred = map.straits.filter((s) => straitBarred(world, s, nation));
  return findPath(map, from, to, (a, b, km) => {
    if (barred.some((s) => (s.a === a && s.b === b) || (s.a === b && s.b === a))) return Infinity;
    if (map.isSea(b)) return b !== to && (minedClosed(world, b, nation, mines) || avoid?.(b)) ? Infinity : km;
    if (geo.canalNodes.has(b)) return km;
    return b === to && geo.portZone.has(b) ? km : Infinity;
  }, 50_000);
}

/** Refill a ship alongside at its home base from the nation's bulk stocks, which hold the base's fuel farm and stores. */
function victual(world: World, f: Formation, hours: number): void {
  const k = BERTH_REFILL_PER_DAY * (hours / 24);
  const bulk = world.nations[f.nation].bulk;
  for (const r of ['food', 'fuel'] as const) {
    const got = Math.max(0, Math.min(f.supplyCapacity[r] * k, f.supplyCapacity[r] - f.supply[r], bulk[r]));
    f.supply[r] += got;
    bulk[r] -= got;
  }
}

/** Move along order.path at the slowest hull's speed, burning fuel per km so a full load lasts the platform's rated range. */
export function advance(world: World, map: GameMap, f: Formation, comp: Composition): void {
  const hours = world.dtHours;
  const burnPerKm = Number.isFinite(comp.rangeKm) && comp.rangeKm > 0 ? f.supplyCapacity.fuel / comp.rangeKm : 0;
  const path = f.order.path;
  if (!path?.length) {
    f.supply.fuel = Math.max(0, f.supply.fuel - burnPerKm * comp.speedKph * hours * LOITER_BURN);
    // Groups working the waters their base opens onto put in to it between patrols, as the IRGC's boats do from
    // the Hormuz islands and any fleet on local exercises does.
    if (f.node === f.home || f.node === geography(map).portZone.get(f.home)) victual(world, f, hours);
    return;
  }
  let budget = comp.speedKph * hours;
  if (burnPerKm > 0) budget = Math.min(budget, f.supply.fuel / burnPerKm);
  let moved = 0;
  while (path.length && budget > 1e-9) {
    const need = map.distanceKm(f.node, path[0]) - f.progressKm;
    if (budget >= need) {
      budget -= need;
      moved += need;
      f.node = path.shift()!;
      f.progressKm = 0;
    } else {
      f.progressKm += budget;
      moved += budget;
      budget = 0;
    }
  }
  f.supply.fuel = Math.max(0, f.supply.fuel - moved * burnPerKm);
}

/**
 * Reach of shore-based anti-ship missiles and the coastal ASW forces around an enemy's bases
 * that ships in transit route around, km: Bastion-P's P-800 (~450 km) and the YJ-12 and Noor
 * batteries are of this order (judgment).
 */
const SHORE_THREAT_KM = 450;
const threatMemo = new WeakMap<World, { tick: number; byNation: Map<NationId, (zone: number) => boolean> }>();

/** Sea zones within SHORE_THREAT_KM of a coast held by an enemy of `nation`, memoized per tick. */
export function shoreThreat(world: World, map: GameMap, nation: NationId): (zone: number) => boolean {
  let memo = threatMemo.get(world);
  if (!memo || memo.tick !== world.tick) threatMemo.set(world, (memo = { tick: world.tick, byNation: new Map() }));
  let fn = memo.byNation.get(nation);
  if (fn) return fn;
  const coast: NodeId[] = [];
  for (let n = 0; n < map.landCount; n++) {
    const c = world.control[n];
    if (!c || !atWar(world, nation, c)) continue;
    for (const m of map.neighbors(n as NodeId)) if (map.isSea(m)) { coast.push(n as NodeId); break; }
  }
  const hits = new Map<number, boolean>();
  fn = (zone) => {
    let hit = hits.get(zone);
    if (hit === undefined) hits.set(zone, (hit = coast.some((n) => map.distanceKm(n, zone as NodeId) <= SHORE_THREAT_KM)));
    return hit;
  };
  memo.byNation.set(nation, fn);
  return fn;
}

/**
 * A route that keeps out of the enemy's shore threat between its start and its destination, as
 * a submarine or task force on passage does (the US boats lost in transit past the PLA's
 * submarine bases north of Taiwan), or the plain shortest route when no such route exists.
 */
export function transitPath(world: World, map: GameMap, nation: NationId, from: NodeId, to: NodeId): NodeId[] | null {
  const threat = shoreThreat(world, map, nation);
  return seaPath(world, map, nation, from, to, (z) => z !== from && threat(z)) ?? seaPath(world, map, nation, from, to);
}

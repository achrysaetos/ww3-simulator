import type { GameMap } from '../../core/map';
import type { Formation, NationId, World } from '../../core/types';
import { Controllers, NetworkSearch, networkKey, networkMembers } from './network';
import { INPUT_TOLERANCE, LAND_KINDS } from './tables';

/**
 * What one network's search was last run with. The search itself is derived from
 * this and the `InputSnapshot`, so it lives in a runtime cache (`searchesOf`), not
 * in the World.
 */
export interface NetworkInputs {
  members: NationId[];
  /** Nations at war with any member, sorted. */
  foes: NationId[];
  /** Friendly cells held by enemy land forces, which block supply through them, sorted. */
  occupied: number[];
}

type ControlRecord = Record<number, { nation: NationId; level: number }>;

/** Inputs as last seen, so a network is only refreshed when something it depends on moved. */
export interface InputSnapshot {
  control: NationId[];
  infrastructure: number[];
  sea: ControlRecord;
  air: ControlRecord;
}

/** The parts of the logistics slice the network searches derive from. */
export interface NetworkState {
  /** Keyed by networkKey(members). Only networks some nation currently needs. */
  networks: Record<string, NetworkInputs>;
  /** Which network each nation with forces or at war draws through. */
  networkOf: Record<NationId, string>;
  /** Network inputs as last seen, for change detection. Searches read these, not the live World. */
  seen: InputSnapshot;
}

export function snapshotInputs(world: World): InputSnapshot {
  return {
    control: [...world.control],
    infrastructure: [...world.theater.infrastructure],
    sea: copyRecord(world.theater.seaControl),
    air: copyRecord(world.theater.airControl),
  };
}

function copyRecord(r: ControlRecord): ControlRecord {
  const out: ControlRecord = {};
  for (const k in r) out[k] = { ...r[k] };
  return out;
}

interface Searches {
  controllers: Controllers;
  byKey: Map<string, NetworkSearch>;
}

const searchCache = new WeakMap<NetworkState, Searches>();

/**
 * The kept searches for a logistics slice. A slice with none cached (a World that
 * was loaded or cloned) gets them rebuilt from its network inputs and snapshot.
 * Searches settle lazily, and a repaired search settles what a fresh one would, so
 * rebuilt searches give the factors the ones they replace would have.
 */
export function searchesOf(s: NetworkState, map: GameMap): Searches {
  let hit = searchCache.get(s);
  if (!hit) {
    const controllers = new Controllers(map, s.seen.control);
    const byKey = new Map<string, NetworkSearch>();
    for (const key in s.networks) {
      const { members, foes, occupied } = s.networks[key];
      byKey.set(key, new NetworkSearch(map, controllers, members, foes, occupied));
    }
    searchCache.set(s, (hit = { controllers, byKey }));
  }
  return hit;
}

/**
 * Nodes whose inputs moved by more than the tolerance, filed under the nations they
 * can matter to. A search reads control to tell members and foes apart,
 * infrastructure only on member-held cells, and sea and air control only where a foe
 * holds it.
 */
interface Changes {
  /** Cells that changed hands, under their old and new controller: matters to networks with either as member or foe. */
  control: Map<NationId, number[]>;
  /** Infrastructure, under the cell's controller: matters to networks with it as a member. */
  infrastructure: Map<NationId, number[]>;
  /** Sea and air control, under the old and new holder: matters to networks with either as a foe. */
  contested: Map<NationId, number[]>;
}

function file(into: Map<NationId, number[]>, nation: NationId | undefined, node: number): void {
  if (nation) (into.get(nation) ?? into.set(nation, []).get(nation)!).push(node);
}

/** Inputs that moved since last seen; updates the snapshot and controllers to match. */
function changedInputs(world: World, seen: InputSnapshot, controllers: Controllers): Changes {
  const out: Changes = { control: new Map(), infrastructure: new Map(), contested: new Map() };
  const control = world.control, infra = world.theater.infrastructure;
  for (let n = 0; n < control.length; n++)
    if (control[n] !== seen.control[n]) {
      file(out.control, seen.control[n], n);
      file(out.control, control[n], n);
      seen.control[n] = control[n];
      controllers.set(n, control[n]);
    }
  for (let n = 0; n < infra.length; n++)
    if (Math.abs(infra[n] - seen.infrastructure[n]) >= INPUT_TOLERANCE) {
      seen.infrastructure[n] = infra[n];
      file(out.infrastructure, control[n], n);
    }
  diffRecord(world.theater.seaControl, seen.sea, out.contested);
  diffRecord(world.theater.airControl, seen.air, out.contested);
  return out;
}

function diffRecord(now: ControlRecord, seen: ControlRecord, out: Map<NationId, number[]>): void {
  for (const k in now) {
    const a = now[k], b = seen[k];
    if (!b || a.nation !== b.nation || Math.abs(a.level - b.level) >= INPUT_TOLERANCE) {
      file(out, a.nation, Number(k));
      if (b && b.nation !== a.nation) file(out, b.nation, Number(k));
      seen[k] = { ...a };
    }
  }
  for (const k in seen)
    if (!now[k]) {
      file(out, seen[k].nation, Number(k));
      delete seen[k];
    }
}

interface Reached {
  /** Changed nodes the search has reached. */
  pending: Set<number>;
  /** The subset of `pending` that changed hands, which also moves the frontline next to them. */
  recaptured: Set<number>;
}

/** The changes this network's search has reached. */
function reachedChanges(net: NetworkInputs, search: NetworkSearch, changes: Changes): Reached {
  const out: Reached = { pending: new Set(), recaptured: new Set() };
  const add = (nodes: number[] | undefined, changedHands: boolean) => {
    for (const n of nodes ?? [])
      if (search.touches(n)) {
        out.pending.add(n);
        if (changedHands) out.recaptured.add(n);
      }
  };
  for (const m of net.members) {
    add(changes.control.get(m), true);
    add(changes.infrastructure.get(m), false);
  }
  for (const f of net.foes) {
    add(changes.control.get(f), true);
    add(changes.contested.get(f), false);
  }
  return out;
}

/**
 * The network closest in members and foes to a new one, if close enough that
 * re-opening what differs beats searching afresh. A lone nation's search is small,
 * and deriving it from a bloc would re-open the bloc, so it starts fresh.
 */
function closest(networks: ReadonlyMap<string, NetworkInputs>, members: readonly NationId[], foes: readonly NationId[]): string | undefined {
  if (members.length < 2) return undefined;
  let best: string | undefined, bestDiff = Math.max(2, members.length >> 2) + 1;
  for (const [key, net] of networks) {
    const diff = symmetricDifference(net.members, members) + symmetricDifference(net.foes, foes);
    if (diff < bestDiff) [best, bestDiff] = [key, diff];
  }
  return best;
}

function symmetricDifference(a: readonly NationId[], b: readonly NationId[]): number {
  const inA = new Set(a);
  let shared = 0;
  for (const x of b) if (inA.has(x)) shared++;
  return a.length + b.length - 2 * shared;
}

const sameList = (a: readonly number[] | readonly string[], b: readonly number[] | readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Keeps one network per distinct membership that a nation with forces or at war
 * needs, and brings every one up to date with the inputs that moved: a search
 * re-opens only what the changed inputs reached, a new network starts from the
 * closest existing search, and a quiet theatre costs nothing. Every search is
 * current afterwards, so the searches are a function of the slice alone.
 */
export function refreshNetworks(world: World, map: GameMap, s: NetworkState, forces: Formation[]): void {
  const { controllers, byKey } = searchesOf(s, map);
  const enemies = new Map<NationId, NationId[]>();
  for (const k in world.relations) {
    if (!world.relations[k].atWar) continue;
    const [a, b] = k.split('|') as NationId[];
    (enemies.get(a) ?? enemies.set(a, []).get(a)!).push(b);
    (enemies.get(b) ?? enemies.set(b, []).get(b)!).push(a);
  }
  const demand = new Set<NationId>(enemies.keys());
  // Land forces on ground another nation holds: the only ones that can block a network's supply.
  const intruders: Formation[] = [];
  const landKinds = LAND_KINDS, landCount = map.landCount;
  for (const f of forces) {
    demand.add(f.nation);
    if (landKinds.has(f.kind) && f.node < landCount && world.control[f.node] !== f.nation) intruders.push(f);
  }
  // Personnel per nation in each cell an intruder stands in, to weigh intruders against the cell's defenders.
  const strength = new Map<number, Map<NationId, number>>();
  for (const f of intruders) strength.set(f.node, new Map());
  for (const f of forces) {
    const here = landKinds.has(f.kind) ? strength.get(f.node) : undefined;
    if (here) here.set(f.nation, (here.get(f.nation) ?? 0) + f.personnel);
  }

  const networkOf: Record<NationId, string> = {};
  const wanted = new Map<string, NationId[]>();
  const membersOf = networkMembers(world, enemies);
  const keyOf = new Map<NationId[], string>();
  for (const n of [...demand].sort()) {
    const members = membersOf(n);
    const key = keyOf.get(members) ?? keyOf.set(members, networkKey(members)).get(members)!;
    networkOf[n] = key;
    wanted.set(key, members);
  }
  const reads = new Map<string, number[]>();
  for (const f of forces) {
    const key = networkOf[f.nation];
    (reads.get(key) ?? reads.set(key, []).get(key)!).push(f.node);
  }

  const seen = s.seen;
  const changes = changedInputs(world, seen, controllers);
  // Every search is read before any moves, so a new network adopting an old one's search re-opens what changed under it.
  const known = new Map(Object.entries(s.networks));
  const reached = new Map<string, Reached>();
  for (const [key, net] of known) reached.set(key, reachedChanges(net, byKey.get(key)!, changes));
  const next: Record<string, NetworkInputs> = {};
  const updates: (() => void)[] = [];
  for (const [key, members] of wanted) {
    const memberSet = new Set(members);
    const foeSet = new Set<NationId>();
    for (const m of members) for (const e of enemies.get(m) ?? []) if (!memberSet.has(e)) foeSet.add(e);
    const foes = [...foeSet].sort();
    const occupied: number[] = [];
    for (const [node, here] of strength) {
      const holder = world.control[node];
      if (!holder || !memberSet.has(holder)) continue;
      let foe = 0, own = 0;
      for (const [n, p] of here) if (foeSet.has(n)) foe += p; else if (memberSet.has(n)) own += p;
      if (foe > own) occupied.push(node);
    }
    occupied.sort((a, b) => a - b);
    const inputs = (next[key] = { members, foes, occupied });
    const net = known.get(key);
    if (!net) {
      const search = new NetworkSearch(map, controllers, members, foes, occupied);
      const base = closest(known, members, foes);
      if (base) search.adopt(seen, byKey.get(base)!, reached.get(base)!.pending, reached.get(base)!.recaptured);
      byKey.set(key, search);
      known.set(key, inputs);
      reached.set(key, { pending: new Set(), recaptured: new Set() });
      continue;
    }
    const { pending, recaptured } = reached.get(key)!;
    if (!sameList(net.foes, foes)) {
      const search = new NetworkSearch(map, controllers, members, foes, occupied);
      updates.push(() => {
        search.adopt(seen, byKey.get(key)!, pending, recaptured);
        byKey.set(key, search);
      });
    } else if (pending.size || !sameList(net.occupied, occupied)) {
      const now = new Set(occupied), before = new Set(net.occupied);
      for (const n of now) if (!before.has(n)) pending.add(n);
      for (const n of before) if (!now.has(n)) pending.add(n);
      updates.push(() => byKey.get(key)!.repair(seen, [...pending], [...recaptured], occupied));
    }
  }
  for (const update of updates) update();
  for (const key of byKey.keys()) if (!next[key]) byKey.delete(key);
  s.networks = next;
  s.networkOf = networkOf;
  for (const [key, nodes] of reads) byKey.get(key)!.cover(seen, nodes);
}

import type { GameMap } from '../../core/map';
import type { Formation, NationId, World } from '../../core/types';
import { Controllers, NetworkSearch, networkKey, networkMembers } from './network';
import { INPUT_TOLERANCE, LAND_KINDS, MAX_REFRESHES_PER_TICK } from './tables';

export interface SupplyNetwork {
  members: NationId[];
  /** Nations at war with any member, sorted, as the search last saw them. */
  foes: NationId[];
  /** Friendly cells held by enemy land forces, which block supply through them, as the search last saw them. */
  occupied: number[];
  computedTick: number;
  /** Inputs it depends on moved since computedTick; waiting for a refresh slot. */
  dirty: boolean;
  /** Nodes whose inputs moved since computedTick. */
  pending: Set<number>;
  /** The subset of `pending` that changed hands, which also moves the frontline next to them. */
  recaptured: Set<number>;
  search: NetworkSearch;
}

type ControlRecord = Record<number, { nation: NationId; level: number }>;

/** Inputs as last seen, so a network is only refreshed when something it depends on moved. */
export interface InputSnapshot {
  control: NationId[];
  infrastructure: number[];
  sea: ControlRecord;
  air: ControlRecord;
  controllers: Controllers;
}

export function snapshotInputs(world: World, controllers: Controllers): InputSnapshot {
  return {
    control: [...world.control],
    infrastructure: [...world.theater.infrastructure],
    sea: copyRecord(world.theater.seaControl),
    air: copyRecord(world.theater.airControl),
    controllers,
  };
}

function copyRecord(r: ControlRecord): ControlRecord {
  const out: ControlRecord = {};
  for (const k in r) out[k] = { ...r[k] };
  return out;
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

/** Inputs that moved since last seen; updates the snapshot to match. */
function changedInputs(world: World, seen: InputSnapshot): Changes {
  const out: Changes = { control: new Map(), infrastructure: new Map(), contested: new Map() };
  const control = world.control, infra = world.theater.infrastructure;
  for (let n = 0; n < control.length; n++)
    if (control[n] !== seen.control[n]) {
      file(out.control, seen.control[n], n);
      file(out.control, control[n], n);
      seen.control[n] = control[n];
      seen.controllers.set(n, control[n]);
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

/** Files the changes this network's search has reached into its pending set. */
function queueChanges(net: SupplyNetwork, changes: Changes): void {
  const { search, pending, recaptured } = net;
  const add = (nodes: number[] | undefined, changedHands: boolean) => {
    for (const n of nodes ?? [])
      if (search.touches(n)) {
        pending.add(n);
        if (changedHands) recaptured.add(n);
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
}

/**
 * The existing network closest in members and foes to a new one, if close enough
 * that re-opening what differs beats searching afresh. A lone nation's search is
 * small, and deriving it from a bloc would re-open the bloc, so it starts fresh.
 */
function closest(networks: Record<string, SupplyNetwork>, members: readonly NationId[], foes: readonly NationId[]): SupplyNetwork | undefined {
  if (members.length < 2) return undefined;
  let best: SupplyNetwork | undefined, bestDiff = Math.max(2, members.length >> 2) + 1;
  for (const key in networks) {
    const net = networks[key];
    const diff = symmetricDifference(net.members, members) + symmetricDifference(net.foes, foes);
    if (diff < bestDiff) [best, bestDiff] = [net, diff];
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
 * needs. A network is marked dirty when an input it has reached changes; new
 * networks start at once and dirty ones are repaired oldest first, a bounded number
 * per tick, so heavy churn costs a bounded amount and a quiet theatre costs nothing.
 */
export function refreshNetworks(world: World, map: GameMap, networks: Record<string, SupplyNetwork>, seen: InputSnapshot, forces: Formation[]): Record<NationId, string> {
  const enemies = new Map<NationId, NationId[]>();
  for (const k in world.relations) {
    if (!world.relations[k].atWar) continue;
    const [a, b] = k.split('|') as NationId[];
    (enemies.get(a) ?? enemies.set(a, []).get(a)!).push(b);
    (enemies.get(b) ?? enemies.set(b, []).get(b)!).push(a);
  }
  const demand = new Set<NationId>(enemies.keys());
  const landForces = new Map<NationId, number[]>();
  for (const f of forces) {
    demand.add(f.nation);
    if (LAND_KINDS.has(f.kind) && f.node < map.landCount) file(landForces, f.nation, f.node);
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

  const changes = changedInputs(world, seen);
  for (const key in networks) queueChanges(networks[key], changes);
  const toRefresh: string[] = [];
  const inputs = new Map<string, { foes: NationId[]; occupied: number[] }>();
  for (const [key, members] of wanted) {
    const memberSet = new Set(members);
    const foeSet = new Set<NationId>();
    for (const m of members) for (const e of enemies.get(m) ?? []) if (!memberSet.has(e)) foeSet.add(e);
    const foes = [...foeSet].sort();
    const occupied: number[] = [];
    for (const e of foes) for (const n of landForces.get(e) ?? []) if (memberSet.has(world.control[n])) occupied.push(n);
    occupied.sort((a, b) => a - b);
    const net = networks[key];
    if (!net) {
      const search = new NetworkSearch(map, seen.controllers, members, foes, occupied);
      const base = closest(networks, members, foes);
      if (base) search.adopt(seen, base.search, base.pending, base.recaptured);
      search.cover(seen, reads.get(key) ?? []);
      networks[key] = { members, foes, occupied, computedTick: world.tick, dirty: false, pending: new Set(), recaptured: new Set(), search };
      continue;
    }
    inputs.set(key, { foes, occupied });
    if (net.pending.size || !sameList(net.foes, foes) || !sameList(net.occupied, occupied)) net.dirty = true;
    if (net.dirty) toRefresh.push(key);
  }

  toRefresh.sort((a, b) => networks[a].computedTick - networks[b].computedTick || (a < b ? -1 : 1));
  for (const key of toRefresh.slice(0, MAX_REFRESHES_PER_TICK)) {
    const net = networks[key];
    const { foes, occupied } = inputs.get(key)!;
    if (sameList(net.foes, foes)) {
      const now = new Set(occupied), before = new Set(net.occupied);
      for (const n of now) if (!before.has(n)) net.pending.add(n);
      for (const n of before) if (!now.has(n)) net.pending.add(n);
      net.search.repair(seen, [...net.pending], [...net.recaptured], occupied);
    } else {
      const search = new NetworkSearch(map, seen.controllers, net.members, foes, occupied);
      search.adopt(seen, net.search, net.pending, net.recaptured);
      net.search = search;
    }
    Object.assign(net, { foes, occupied, computedTick: world.tick, dirty: false });
    net.pending.clear();
    net.recaptured.clear();
  }

  for (const key in networks) if (!wanted.has(key)) delete networks[key];
  for (const [key, nodes] of reads) networks[key].search.cover(seen, nodes);
  return networkOf;
}

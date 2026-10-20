import type { SimContext } from '../../core/engine';
import type { GameMap } from '../../core/map';
import type { Formation, NationId, World } from '../../core/types';
import { computeNetwork, networkKey, networkMembers } from './network';
import { INPUT_TOLERANCE, LAND_KINDS, MAX_REFRESHES_PER_TICK } from './tables';

export interface SupplyNetwork {
  members: NationId[];
  /** Nations at war with any member, sorted. */
  foes: NationId[];
  /** Order-independent hash of enemy-occupied friendly cells, which block supply through them. */
  occupiedHash: number;
  computedTick: number;
  /** Inputs changed since computedTick; waiting for a refresh slot. */
  dirty: boolean;
  /** Throughput factor per node (index = NodeId), 0..1. */
  factor: number[];
}

type ControlRecord = Record<number, { nation: NationId; level: number }>;

/** Inputs as last seen, so a network is only recomputed when something it depends on moved. */
export interface InputSnapshot {
  control: NationId[];
  infrastructure: number[];
  sea: ControlRecord;
  air: ControlRecord;
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

/** Nodes whose control, infrastructure, sea or air control moved by more than the tolerance; updates the snapshot to match. */
function changedNodes(world: World, seen: InputSnapshot): number[] {
  const out: number[] = [];
  const control = world.control, infra = world.theater.infrastructure;
  for (let n = 0; n < control.length; n++)
    if (control[n] !== seen.control[n]) {
      seen.control[n] = control[n];
      out.push(n);
    }
  for (let n = 0; n < infra.length; n++)
    if (Math.abs(infra[n] - seen.infrastructure[n]) >= INPUT_TOLERANCE) {
      seen.infrastructure[n] = infra[n];
      out.push(n);
    }
  diffRecord(world.theater.seaControl, seen.sea, out);
  diffRecord(world.theater.airControl, seen.air, out);
  return out;
}

function diffRecord(now: ControlRecord, seen: ControlRecord, out: number[]): void {
  for (const k in now) {
    const a = now[k], b = seen[k];
    if (!b || a.nation !== b.nation || Math.abs(a.level - b.level) >= INPUT_TOLERANCE) {
      seen[k] = { ...a };
      out.push(Number(k));
    }
  }
  for (const k in seen)
    if (!now[k]) {
      delete seen[k];
      out.push(Number(k));
    }
}

/** A change at a node matters to a network if the node or a neighbour currently gets supply. */
function touches(map: GameMap, factor: number[], nodes: number[]): boolean {
  for (const n of nodes) {
    if (factor[n] > 0) return true;
    for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) if (factor[map.adj[k]] > 0) return true;
  }
  return false;
}

/**
 * Keeps one network per distinct membership that a nation with forces or at war
 * needs. A network is marked dirty when an input it depends on changes; new
 * networks compute at once and dirty ones refresh oldest first, a bounded number
 * per tick, so heavy churn costs a bounded amount and a quiet theatre costs nothing.
 */
export function refreshNetworks(world: World, ctx: SimContext, networks: Record<string, SupplyNetwork>, seen: InputSnapshot, forces: Formation[]): Record<NationId, string> {
  const map = ctx.map;
  const enemies = new Map<NationId, NationId[]>();
  for (const k in world.relations) {
    if (!world.relations[k].atWar) continue;
    const [a, b] = k.split('|') as NationId[];
    (enemies.get(a) ?? enemies.set(a, []).get(a)!).push(b);
    (enemies.get(b) ?? enemies.set(b, []).get(b)!).push(a);
  }
  const demand = new Set<NationId>(enemies.keys());
  const occupied = new Map<NationId, number[]>();
  for (const f of forces) {
    demand.add(f.nation);
    if (LAND_KINDS.has(f.kind) && f.node < map.landCount) (occupied.get(f.nation) ?? occupied.set(f.nation, []).get(f.nation)!).push(f.node);
  }

  const networkOf: Record<NationId, string> = {};
  const wanted = new Map<string, NationId[]>();
  for (const n of [...demand].sort()) {
    const members = networkMembers(world, n);
    const key = networkKey(members);
    networkOf[n] = key;
    wanted.set(key, members);
  }
  for (const key in networks) if (!wanted.has(key)) delete networks[key];

  const changed = changedNodes(world, seen);
  const toCompute: string[] = [];
  const inputs = new Map<string, { foes: NationId[]; enemyNodes: number[]; hash: number }>();
  for (const [key, members] of wanted) {
    const foeSet = new Set<NationId>();
    for (const m of members) for (const e of enemies.get(m) ?? []) if (!members.includes(e)) foeSet.add(e);
    const foes = [...foeSet].sort();
    const enemyNodes: number[] = [];
    let hash = 0;
    for (const e of foes)
      for (const n of occupied.get(e) ?? [])
        if (members.includes(world.control[n])) {
          enemyNodes.push(n);
          hash += Math.imul(n + 1, 2654435761) >>> 0;
        }
    inputs.set(key, { foes, enemyNodes, hash });
    const net = networks[key];
    if (!net) continue;
    if (net.occupiedHash !== hash || net.foes.join() !== foes.join() || (changed.length && touches(map, net.factor, changed))) net.dirty = true;
    if (net.dirty) toCompute.push(key);
  }

  toCompute.sort((a, b) => networks[a].computedTick - networks[b].computedTick || (a < b ? -1 : 1));
  const missing = [...wanted.keys()].filter((k) => !networks[k]);
  for (const key of [...missing, ...toCompute.slice(0, MAX_REFRESHES_PER_TICK)]) {
    const members = wanted.get(key)!;
    const { foes, enemyNodes, hash } = inputs.get(key)!;
    networks[key] = {
      members, foes, occupiedHash: hash, computedTick: world.tick, dirty: false,
      factor: computeNetwork(world, map, members, new Set(foes), enemyNodes),
    };
  }
  return networkOf;
}

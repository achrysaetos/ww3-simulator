import { atWar, relation } from '../../core/engine';
import type { Formation, FormationId, NationId, NodeId } from '../../core/types';
import { awaitingLift, debarkation, deckSlots, liftMode, overseas } from '../land/strategic';
import type { TickEnv } from './env';
import { geography } from './geography';
import { navalDestination, seaPath } from './movement';
import type { Composition } from './state';

/**
 * Administrative sealift: cargo-ship groups (MSC surge LMSRs, the Ready Reserve Force)
 * carry land formations waiting at a friendly port to a friendly port on the far shore,
 * unopposed at both ends. They sail as ordinary surface groups, so the enemy's
 * submarines, aircraft and missiles can find and sink them with everything aboard.
 *
 * A group activates some days after its nation goes to war, sails empty to the port where
 * troops wait, loads for LOAD_HOURS, sails when full (or when nobody else is waiting),
 * unloads at the destination port (naval/amphibious.ts landings) and returns home.
 */

export interface SealiftState {
  /** Port each loaded or loading group is loading at and bound for, and the tick it began loading. */
  voyages: Record<FormationId, { from: NodeId; to: NodeId; loadingSince: number }>;
}

declare module '../../core/types' {
  interface Slices {
    sealift: SealiftState;
  }
}

/**
 * Days from war to a ship sailing: Reduced Operating Status ships are crewed and ready in
 * 4-5 days on paper (ROS-5, MARAD); GAO found the RRF's 2019 turbo activation reached
 * only ~40% readiness, so activation stretches as readiness falls (GAO-20-536, estimate).
 */
const ACTIVATION_DAYS = 4;
/** Loading a convoy at a strategic seaport: vehicles staged, driven aboard and lashed (MSC/SDDC practice, estimate). */
const LOAD_HOURS = 48;
/** A group sails once this share of its deck space is taken, or when no one else waits at or marches to the port. */
const SAIL_LOAD = 0.9;
/** Nor does a part-loaded group wait longer than this for formations still marching to the port (estimate). */
const MAX_WAIT_HOURS = 5 * 24;

const sealiftSlice = (env: TickEnv) => (env.world.slices.sealift ??= { voyages: {} });

/** Cargo ships with vehicle decks and nothing else: a sealift group, not an amphibious one. */
export function isSealift(comp: Composition): boolean {
  return comp.hullCount > 0 && comp.troopLift === 0 && comp.vehicleLift > 0 && comp.hulls.every((h) => h.platform.class === 'cargo_ship');
}

function warDays(env: TickEnv, nation: NationId): number {
  let since = Infinity;
  for (const other of Object.keys(env.world.nations) as NationId[]) {
    if (!atWar(env.world, nation, other)) continue;
    since = Math.min(since, relation(env.world, nation, other).warSince ?? env.world.tick);
  }
  return Number.isFinite(since) ? ((env.world.tick - since) * env.world.dtHours) / 24 : -1;
}

export function sealift(env: TickEnv): void {
  const { world, ctx } = env;
  const { map, catalog } = ctx;
  const geo = geography(map);
  const groups = env.naval.filter((g) => g.kind === 'surface_group' && isSealift(env.comp(g)));
  if (!groups.length) return;
  const { voyages } = sealiftSlice(env);
  const nations = new Set(groups.map((g) => g.nation));

  // Formations waiting at each port, deck space they need, and ports formations are still marching to.
  const waiting = new Map<string, Formation[]>();
  const demand = new Map<string, number>();
  const marching = new Set<string>();
  for (const f of Object.values(world.formations)) {
    if (!nations.has(f.nation) || f.status !== 'active' || f.order.posture !== 'move' || f.order.target === undefined) continue;
    const path = f.order.path;
    if (path?.length) {
      if (overseas(map, path[path.length - 1], f.order.target)) marching.add(`${f.nation}|${path[path.length - 1]}`);
      continue;
    }
    if (!awaitingLift(map, f) || !geo.portZone.has(f.node) || liftMode(world, catalog, f) !== 'sea') continue;
    const key = `${f.nation}|${f.node}`;
    (waiting.get(key) ?? waiting.set(key, []).get(key)!).push(f);
    demand.set(key, (demand.get(key) ?? 0) + deckSlots(catalog, f));
  }
  for (const list of waiting.values()) list.sort((a, b) => a.order.issuedTick - b.order.issuedTick || (a.id < b.id ? -1 : 1));
  const days = new Map<NationId, number>();
  const ports = new Map<string, NodeId | undefined>();
  const debark = (nation: NationId, target: NodeId) => {
    const k = `${nation}|${target}`;
    if (!ports.has(k)) ports.set(k, debarkation(world, map, nation, target, 'sea'));
    return ports.get(k);
  };
  const atPort = (g: Formation, port: number) => g.node === port || g.node === geo.portZone.get(port);
  const sail = (g: Formation, posture: 'move' | 'patrol', to: NodeId) => {
    if (g.order.posture === posture && g.order.target === to) return;
    const dest = navalDestination(world, map, g.nation, to);
    const path = dest === undefined ? null : seaPath(world, map, g.nation, g.node, dest);
    if (path) g.order = { posture, target: to, path, issuedTick: world.tick };
  };

  for (const g of groups.sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (!days.has(g.nation)) days.set(g.nation, warDays(env, g.nation));
    if (days.get(g.nation)! < ACTIVATION_DAYS / Math.max(0.1, g.readiness)) continue;
    const comp = env.comp(g);
    const aboard = (env.embarked.get(g.id) ?? []).filter((e) => e.status === 'embarked');
    if (!aboard.length) delete voyages[g.id];
    if (aboard.length && g.order.posture === 'move' && g.order.path?.length) continue;

    // Load where the group lies, or sail empty to the nearest port where troops wait.
    let port: number | undefined;
    if (aboard.length) port = voyages[g.id]?.from;
    else {
      let bestKm = Infinity;
      for (const key of waiting.keys()) {
        const [n, p] = key.split('|');
        if (n !== g.nation || demand.get(key)! <= 0) continue;
        const km = map.distanceKm(g.node, Number(p) as NodeId);
        if (km < bestKm) { bestKm = km; port = Number(p); }
      }
    }
    const key = `${g.nation}|${port}`;
    if (port !== undefined && !aboard.length) demand.set(key, demand.get(key)! - comp.vehicleLift);
    if (port !== undefined && !atPort(g, port)) {
      sail(g, 'patrol', port as NodeId);
      continue;
    }

    let used = 0;
    for (const e of aboard) used += deckSlots(catalog, e) / comp.vehicleLift;
    const queue = waiting.get(key) ?? [];
    let full = false;
    for (const f of [...queue]) {
      const to = debark(g.nation, f.order.target!);
      if (to === undefined || (voyages[g.id] && voyages[g.id].to !== to)) continue;
      const share = deckSlots(catalog, f) / comp.vehicleLift;
      if (used > 0 && used + share > 1) {
        full = true;
        continue;
      }
      voyages[g.id] ??= { from: port as NodeId, to, loadingSince: world.tick };
      f.status = 'embarked';
      f.embarkedOn = g.id;
      f.node = g.node;
      f.order = { posture: 'embark', targetFormation: g.id, issuedTick: world.tick };
      (env.embarked.get(g.id) ?? env.embarked.set(g.id, []).get(g.id)!).push(f);
      aboard.push(f);
      queue.splice(queue.indexOf(f), 1);
      used += share;
    }
    const v = voyages[g.id];
    if (aboard.length && v) {
      const hours = (world.tick - v.loadingSince) * world.dtHours;
      const more = !full && marching.has(key) && hours < MAX_WAIT_HOURS;
      if (hours >= LOAD_HOURS && (used >= SAIL_LOAD || !more)) sail(g, 'move', v.to);
      else if (g.order.posture !== 'patrol' || g.order.path?.length) g.order = { posture: 'patrol', target: g.node, path: [], issuedTick: world.tick };
      continue;
    }
    if (!aboard.length && port === undefined && g.node !== g.home && g.order.posture !== 'reserve') g.order = { posture: 'reserve', issuedTick: world.tick };
  }
}

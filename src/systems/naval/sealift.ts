import { atWar, relation, type SimContext } from '../../core/engine';
import type { GameMap } from '../../core/map';
import { findPath } from '../../core/path';
import type { Formation, FormationId, NationId, NodeId, World } from '../../core/types';
import { applyLandOrder } from '../land/movement';
import { allied } from '../land/state';
import { awaitingLift, debarkation, deckSlots, landMass, lifted, liftMode } from '../land/strategic';
import type { TickEnv } from './env';
import { geography } from './geography';
import { navalDestination, seaPath, shoreThreat } from './movement';
import { boardable, detach, playerHolds } from './orders';
import type { Composition } from './state';

/**
 * Administrative sealift: cargo-ship groups (MSC surge LMSRs, the Ready Reserve Force)
 * carry land formations waiting at a friendly port to a friendly port on the far shore,
 * unopposed at both ends. They sail as ordinary surface groups, so the enemy's
 * submarines, aircraft and missiles can find and sink them with everything aboard.
 *
 * A group activates some days after its nation goes to war, sails empty to the port where
 * troops wait, loads for LOAD_HOURS, sails when full (or when nobody else is waiting),
 * unloads at the destination port (naval/amphibious.ts landings) and returns home. The
 * formations it carried then march on to where they were sent.
 *
 * Convoys keep out of the enemy's shore-based anti-ship reach (movement.ts shoreThreat): they unload at the friendly
 * port nearest the destination that a route clear of that reach joins, and march the rest
 * (REFORGER's ports of debarkation were Bremerhaven, Rotterdam and Antwerp, not the Baltic).
 * Only when no such port exists do they sail into the threat.
 */

export interface SealiftState {
  /** Port each loaded or loading group is loading at and bound for, and the tick it began loading. */
  voyages: Record<FormationId, { from: NodeId; to: NodeId; loadingSince: number; onward?: Record<FormationId, NodeId> }>;
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

/** Debarkation ports tried, nearest the destination first, before falling back to the nearest one regardless of threat. */
const DEBARK_SHORTLIST = 8;
/** A port is a gateway to the destination only if the road march from it is at most this much longer than the great circle, plus MARCH_SLACK_KM. */
const MARCH_DETOUR = 1.5;
const MARCH_SLACK_KM = 300;

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
  // A cargo group the player took under their own command sails where the player sends it.
  const groups = env.naval.filter((g) => g.kind === 'surface_group' && isSealift(env.comp(g)) && !playerHolds(world, g));
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
      if (lifted(map, path[path.length - 1], f.order)) marching.add(`${f.nation}|${path[path.length - 1]}`);
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
  const threatOf = (nation: NationId) => shoreThreat(world, map, nation);
  const debark = (nation: NationId, target: NodeId, from: NodeId) => {
    const k = `${nation}|${target}|${from}`;
    if (!ports.has(k)) ports.set(k, safeDebarkation(world, map, nation, target, from, threatOf(nation)) ?? debarkation(world, map, nation, target, 'sea'));
    return ports.get(k);
  };
  const atPort = (g: Formation, port: number) => g.node === port || g.node === geo.portZone.get(port);
  const sail = (g: Formation, posture: 'move' | 'patrol', to: NodeId) => {
    if (g.order.posture === posture && g.order.target === to) return;
    const dest = navalDestination(world, map, g.nation, to);
    const avoid = threatOf(g.nation);
    const path = dest === undefined ? null : (seaPath(world, map, g.nation, g.node, dest, (z) => z !== g.node && avoid(z)) ?? seaPath(world, map, g.nation, g.node, dest));
    if (path) g.order = { posture, target: to, path, issuedTick: world.tick };
  };

  for (const g of groups.sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (!days.has(g.nation)) days.set(g.nation, warDays(env, g.nation));
    if (days.get(g.nation)! < ACTIVATION_DAYS / Math.max(0.1, g.readiness)) continue;
    const comp = env.comp(g);
    const aboard = (env.embarked.get(g.id) ?? []).filter((e) => e.status === 'embarked');
    if (!aboard.length && voyages[g.id]) {
      marchOn(world, ctx, voyages[g.id]);
      delete voyages[g.id];
    }
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
      const to = debark(g.nation, f.order.target!, port as NodeId);
      if (to === undefined || (voyages[g.id] && voyages[g.id].to !== to)) continue;
      const share = deckSlots(catalog, f) / comp.vehicleLift;
      // A formation too big for the decks left sails in echelons, as an armoured division does on a few RO-ROs;
      // the rest waits at the port for the next sailing.
      let boarding = f;
      if (share > 1 - used + 1e-9) {
        full = true;
        if (!boardable(1 - used, share)) continue;
        boarding = detach(world, ctx, f, (1 - used) / share);
      } else queue.splice(queue.indexOf(f), 1);
      voyages[g.id] ??= { from: port as NodeId, to, loadingSince: world.tick };
      (voyages[g.id].onward ??= {})[boarding.id] = f.order.target!;
      boarding.status = 'embarked';
      boarding.embarkedOn = g.id;
      boarding.node = g.node;
      boarding.order = { posture: 'embark', targetFormation: g.id, issuedTick: world.tick };
      (env.embarked.get(g.id) ?? env.embarked.set(g.id, []).get(g.id)!).push(boarding);
      aboard.push(boarding);
      used += deckSlots(catalog, boarding) / comp.vehicleLift;
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

/** Formations a convoy has put ashore march on from the port to where they were sent. */
function marchOn(world: World, ctx: SimContext, v: SealiftState['voyages'][FormationId]): void {
  for (const [id, target] of Object.entries(v.onward ?? {}) as [FormationId, NodeId][]) {
    const f = world.formations[id];
    if (!f || f.status !== 'active' || f.node !== v.to || f.node === target) continue;
    applyLandOrder(world, { type: 'order', nation: f.nation, formation: f.id, order: { posture: 'move', target } }, ctx);
  }
}

/**
 * The friendly port on the destination's land mass nearest the destination that a sea route
 * from `from` clear of the enemy's shore threat reaches, its own approaches clear too.
 */
function safeDebarkation(world: World, map: GameMap, nation: NationId, target: NodeId, from: NodeId, threat: (zone: number) => boolean): NodeId | undefined {
  const mass = landMass(map);
  const geo = geography(map);
  const fromZone = geo.portZone.get(from) ?? from;
  const candidates = geo.ports
    .filter((p) => mass[p.node] === mass[target] && world.control[p.node] && allied(world, nation, world.control[p.node]) && !threat(p.zone))
    .sort((a, b) => map.distanceKm(a.node, target) - map.distanceKm(b.node, target) || a.node - b.node)
    .slice(0, DEBARK_SHORTLIST);
  for (const p of candidates) {
    if (!seaPath(world, map, nation, fromZone, p.zone, (z) => z !== fromZone && threat(z))) continue;
    if (marchKm(world, map, nation, p.node, target) <= MARCH_DETOUR * map.distanceKm(p.node, target) + MARCH_SLACK_KM) return p.node;
  }
  return undefined;
}

/** Road-march km from a port to the destination over land not held by the enemy; Infinity without such a road. */
function marchKm(world: World, map: GameMap, nation: NationId, from: NodeId, to: NodeId): number {
  const path = findPath(map, from, to, (_a, b, km) => {
    if (b >= map.landCount) return Infinity;
    const c = world.control[b];
    return b !== to && c && atWar(world, nation, c) ? Infinity : km;
  }, 20_000);
  if (!path) return Infinity;
  let km = 0;
  for (let i = 0, at = from; i < path.length; at = path[i++]) km += map.distanceKm(at, path[i]);
  return km;
}

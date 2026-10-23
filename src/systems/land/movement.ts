import type { Catalog } from '../../core/catalog';
import { atWar, type SimContext, type System } from '../../core/engine';
import type { GameMap } from '../../core/map';
import { findPath } from '../../core/path';
import type { Formation, NationId, NodeId, Order, PlatformId, World } from '../../core/types';
import type { OrderCommand, OrderOutcome } from '../orders';
import { allied, canEnter, hostilesAt, indexByNode, isLandFormation, keepDeception, landSlice } from './state';
import { cannotDrop, insert, supplyAirheads } from './airborne';
import { airlift, debarkation, embarkation, lifted, liftMode, overseas } from './strategic';
import { exposureLosses, groundFactorAt } from '../weather/effects';
import { DECEPTION } from '../c2/tables';
import {
  AIR_INTERDICTION, BREAK_CONTACT_PACE, DISMOUNTS, ENTRENCH_PER_DAY, FATIGUE_MARCH_PER_DAY, FATIGUE_RECOVERY_PER_DAY, HOSTILE_GROUND_COST,
  INFILTRATION_COST, MARCH_HOURS_PER_DAY, MARCH_SPEED_FACTOR, infiltrating, MORALE_RECOVERY_PER_DAY, NO_FUEL_SPEED, RAIL_BOOST_MAX, RAIL_KM_FULL, RALLY_MORALE, RIVER_ASSAULT_COST, RIVER_BRIDGE_COST, TERRAIN,
} from './tables';


/** Only manoeuvre formations on an attack order push into enemy-held ground; support echelons stay behind the line. */
const canSeize = (f: Formation) => f.kind === 'maneuver' && f.order.posture === 'attack';
const MARCHING: ReadonlySet<string> = new Set(['move', 'attack', 'defend', 'reserve']);
const friendlyGround = (world: World, nation: NationId, node: NodeId) => {
  const holder = world.control[node];
  return !!holder && allied(world, nation, holder);
};

/** Sustained march speed: the slowest vehicle; dismounts ride when the formation has vehicles. 0 = immobile. */
export function marchSpeedKph(f: Formation, catalog: Catalog): number {
  let vehicles = Infinity, foot = Infinity;
  for (const [pid, n] of Object.entries(f.equipment)) {
    if (n <= 0) continue;
    const p = catalog.platform(pid as PlatformId);
    if (DISMOUNTS.has(p.class)) foot = Math.min(foot, p.mobility.speedKph);
    else vehicles = Math.min(vehicles, p.mobility.speedKph);
  }
  const v = Number.isFinite(vehicles) ? vehicles : foot;
  return Number.isFinite(v) ? v : 0;
}

/** Rail and road throughput in friendly territory, scaled by surviving infrastructure. */
function railBoost(world: World, map: GameMap, nation: NationId, node: NodeId): number {
  const holder = world.control[node];
  if (!holder || !allied(world, nation, holder)) return 1;
  return 1 + RAIL_BOOST_MAX * Math.min(1, map.railKm[node] / RAIL_KM_FULL) * world.theater.infrastructure[node];
}

/** Cost multiplier of crossing a major river into `to`: its bridges are a bottleneck while they stand, and the enemy blows them. */
function riverCost(world: World, map: GameMap, from: NodeId, to: NodeId, hostile: boolean): number {
  if (!map.riverBetween(from, to)) return 1;
  const bridges = hostile ? 0 : world.theater.infrastructure[to];
  return RIVER_BRIDGE_COST() + (RIVER_ASSAULT_COST() - RIVER_BRIDGE_COST()) * (1 - bridges);
}

/** Effective km of entering `to` from `from`: terrain friction, hostile ground, rivers, minus rail boost, and today's mud or snow there. Infinity when closed to this nation. */
export function edgeKm(world: World, map: GameMap, f: Formation, from: NodeId, to: NodeId, km: number, seize = canSeize(f), toGateway = f.order.lift !== undefined): number {
  const holder = world.control[to];
  // A force on its way to a port or airfield of embarkation crosses allied ground under host-nation support (the 173rd to Aviano).
  if (!canEnter(world, map, f.nation, to) && !(toGateway && holder && !map.isSea(to) && allied(world, f.nation, holder))) return Infinity;
  const hostile = !!holder && atWar(world, f.nation, holder);
  const infiltrate = hostile && !seize && infiltrating(f);
  if (hostile && !seize && !infiltrate) return Infinity;
  // Into enemy ground the march only carries the column to the cell's edge, half the way between centres; landCombat's contest then measures the push across the cell.
  const reach = infiltrate ? INFILTRATION_COST : hostile ? 0.5 * HOSTILE_GROUND_COST() : 1;
  return (km * TERRAIN[map.terrain[to]].moveCost * reach * riverCost(world, map, from, to, hostile)) / railBoost(world, map, f.nation, to) / groundFactorAt(world, map, to);
}

/**
 * Handle an 'order' command for a land formation. Returns undefined when the
 * formation is not a land formation, so the router can offer it elsewhere. A refused
 * order leaves the formation on the order it had.
 */
export function applyLandOrder(world: World, cmd: OrderCommand, ctx: SimContext): OrderOutcome | undefined {
  const f = world.formations[cmd.formation];
  if (!f || !isLandFormation(f, ctx.map)) return undefined;
  if (f.nation !== cmd.nation) return { ok: false, code: 'not_yours', reason: `${cmd.nation} cannot order ${f.name}` };
  const { posture, target } = cmd.order;
  if (posture === 'air_assault') {
    if (target === undefined) return { ok: false, code: 'no_target', reason: 'no drop zone' };
    const why = cannotDrop(world, ctx.map, ctx.catalog, f, target);
    if (why) return { ok: false, ...why };
    insert(world, ctx, f, target);
    return { ok: true, etaHours: 0 };
  }
  const order: Order = { ...cmd.order, issuedTick: world.tick };
  if (!MARCHING.has(posture) || target === undefined || target === f.node) return commit(f, order);
  const seize = posture === 'attack' && f.kind === 'maneuver';
  // Across water, or where no land route leads (the 173rd from Vicenza to Korea), the march ends at the gateway
  // where the formation waits for lift (see strategic.ts).
  let path = overseas(ctx.map, f.node, target) ? null : route(world, ctx.map, f, target, seize);
  if (path) delete order.lift;
  else if (overseas(ctx.map, f.node, target) || betweenTheatres(world, ctx.map, f, target)) {
    // Lift puts troops down only where their own side holds a port or airfield; a hostile shore takes an amphibious assault.
    const assault = `node ${target} lies across the sea with no friendly port or airfield to land at; embark on an amphibious group at a port and order the group to attack the coast`;
    const mode = posture === 'move' ? liftMode(world, ctx.catalog, f, cmd.order.lift) : undefined;
    if (!mode) return { ok: false, code: 'no_route', reason: reachable(world, ctx.map, f.nation, target) ? `no land route to node ${target}; order a move to deploy overseas` : assault };
    const gate = embarkation(world, ctx.map, f, target, mode);
    if (gate === undefined) {
      if (debarkation(world, ctx.map, f.nation, target, mode) !== undefined) return { ok: false, code: 'no_lift', reason: `no friendly ${mode === 'air' ? 'airfield' : 'port'} on this shore to embark at` };
      return { ok: false, code: 'no_lift', reason: reachable(world, ctx.map, f.nation, target) ? `no friendly ${mode === 'air' ? 'airfield' : 'port'} near node ${target} to land at` : assault };
    }
    order.lift = mode;
    if (gate === f.node) return commit(f, { ...order, path: [] });
    path = route(world, ctx.map, f, gate, seize, true);
    if (!path) return { ok: false, code: 'no_route', reason: `no land route to the gateway at node ${gate}` };
  } else return { ok: false, code: 'no_route', reason: `no land route to node ${target}` };
  const km = path.reduce((sum, n, i) => sum + edgeKm(world, ctx.map, f, i ? path[i - 1] : f.node, n, ctx.map.distanceKm(i ? path[i - 1] : f.node, n), seize, order.lift !== undefined), 0);
  const kmPerDay = marchKmPerDay(world, ctx.catalog, f);
  return commit(f, { ...order, path }, kmPerDay > 0 ? (km / kmPerDay) * 24 : undefined);
}

/** Whether lift of either kind could put a formation down near `target`: its side holds a port or airfield there. */
function reachable(world: World, map: GameMap, nation: NationId, target: NodeId): boolean {
  return debarkation(world, map, nation, target, 'sea') !== undefined || debarkation(world, map, nation, target, 'air') !== undefined;
}

/** Shortest move that counts as a deployment between theatres rather than a march blocked at the front (judgement call: Vicenza to Korea, not Kharkiv to Izium). */
// param: tag=judgment range=[1000,2500] source=judgment: Vicenza to Korea, not Kharkiv to Izium
export const THEATRE_KM = 1500;

/** A move with no land route that lift can make instead: far off, into ground the formation may enter and its side holds. */
function betweenTheatres(world: World, map: GameMap, f: Formation, target: NodeId): boolean {
  const holder = world.control[target];
  return map.distanceKm(f.node, target) >= THEATRE_KM && canEnter(world, map, f.nation, target) && !!holder && allied(world, f.nation, holder);
}

function commit(f: Formation, order: Order, etaHours?: number): OrderOutcome {
  // The same march ordered again keeps the ground already covered toward its next cell.
  const same = f.order.posture === order.posture && f.order.target === order.target && !!f.order.path?.length && f.order.path[0] === order.path?.[0];
  f.order = order;
  if (!same) f.progressKm = 0;
  return etaHours === undefined ? { ok: true } : { ok: true, etaHours };
}

/** Cheapest land route for this formation. The heuristic is straight-line km, so edge costs are scaled until the cheapest (full rail) edge never undercuts it. */
function route(world: World, map: GameMap, f: Formation, to: NodeId, seize: boolean, toGateway = false): NodeId[] | null {
  const scale = 1 + RAIL_BOOST_MAX;
  return findPath(map, f.node, to, (a, b, km) => edgeKm(world, map, f, a, b, km, seize, toGateway) * scale);
}

function rest(f: Formation, dtDays: number, isolated: boolean, engaged: boolean): void {
  // A unit under assault fights from the holes it has; digging new ones waits for a lull.
  if (engaged) return;
  if (f.order.posture === 'defend' || f.order.posture === 'reserve') f.entrenchment = Math.min(1, f.entrenchment + ENTRENCH_PER_DAY() * dtDays);
  f.fatigue = Math.max(0, f.fatigue - FATIGUE_RECOVERY_PER_DAY * dtDays);
  if (!isolated) f.morale = Math.min(0.9, f.morale + MORALE_RECOVERY_PER_DAY * dtDays);
  if (f.status === 'routed' && !isolated && f.morale >= RALLY_MORALE) f.status = 'active';
}

/** Fuel a formation burns per march hour: a full load lasts 72 hours of movement. */
export const marchBurnPerHour = (f: Formation) => f.supplyCapacity.fuel / 72;

/**
 * Road-march km per day after fatigue, fuel and hostile air. Vehicles drive only
 * as far as the fuel on hand carries them; past that the troops walk and tow.
 */
export function marchKmPerDay(world: World, catalog: Catalog, f: Formation): number {
  let speed = marchSpeedKph(f, catalog) * MARCH_SPEED_FACTOR * (1 - 0.5 * f.fatigue);
  const need = marchBurnPerHour(f) * MARCH_HOURS_PER_DAY;
  if (need > 0) {
    const fuelled = Math.min(1, Math.max(0, f.supply.fuel) / need);
    speed *= fuelled + (1 - fuelled) * NO_FUEL_SPEED;
  }
  const air = world.theater.airControl[f.node];
  if (air && atWar(world, f.nation, air.nation)) speed *= 1 - AIR_INTERDICTION() * air.level;
  if (f.order.deception?.disperse) speed *= DECEPTION.dispersedMarch();
  return speed * MARCH_HOURS_PER_DAY;
}

function march(world: World, ctx: SimContext, f: Formation, byNode: Map<number, Formation[]>): void {
  const { map, catalog } = ctx;
  const path = f.order.path!;
  const dtDays = world.dtHours / 24;
  const kmPerDay = marchKmPerDay(world, catalog, f);
  if (kmPerDay <= 0) return;
  // Fighting across the cell it stands in: landCombat moves that line. A route back onto friendly
  // ground breaks contact instead, as Russia pulled brigades out of Donbas to clear Kursk in 2024.
  const here = world.control[f.node];
  if (here && atWar(world, f.nation, here) && !friendlyGround(world, f.nation, path[0]) && !infiltrating(f)) return;

  const hours = MARCH_HOURS_PER_DAY * dtDays;
  const pressed = hostilesAt(world, byNode, f.node, f.nation).some((g) => g.kind === 'maneuver' && g.status === 'active' && g.order.posture === 'attack');
  f.progressKm += kmPerDay * dtDays * (pressed ? BREAK_CONTACT_PACE() : 1);
  f.supply.fuel = Math.max(0, f.supply.fuel - marchBurnPerHour(f) * hours);
  f.fatigue = Math.min(1, f.fatigue + FATIGUE_MARCH_PER_DAY * dtDays);
  f.entrenchment = 0;

  while (path.length) {
    const next = path[0];
    const cost = edgeKm(world, map, f, f.node, next, map.distanceKm(f.node, next));
    if (!Number.isFinite(cost)) {
      f.order = { posture: 'defend', issuedTick: world.tick, ...keepDeception(f.order) };
      f.progressKm = 0;
      return;
    }
    if (f.progressKm < cost) return;
    const from = byNode.get(f.node)!;
    from.splice(from.indexOf(f), 1);
    (byNode.get(next) ?? byNode.set(next, []).get(next)!).push(f);
    f.node = next;
    f.progressKm -= cost;
    path.shift();
    const holder = world.control[next];
    if (holder && atWar(world, f.nation, holder) && !infiltrating(f)) {
      f.progressKm = 0;
      return;
    }
  }
  f.progressKm = 0;
  // At the gateway of a lifted move: wait there for lift.
  if (lifted(map, f.node, f.order)) return;
  const holder = world.control[f.node];
  const contesting = f.order.posture === 'attack' && holder && atWar(world, f.nation, holder);
  if (!contesting && f.order.posture !== 'reserve') f.order = { posture: 'defend', issuedTick: world.tick, ...keepDeception(f.order) };
  delete f.order.path;
}

export const landMovement: System = {
  id: 'landMovement',
  init(world) {
    landSlice(world);
  },
  step(world, ctx) {
    const { isolatedDays: isolated, baseline: engaged } = landSlice(world);
    const byNode = indexByNode(world, ctx.map);
    const dtDays = world.dtHours / 24;
    for (const f of Object.values(world.formations)) {
      if (!isLandFormation(f, ctx.map)) continue;
      f.personnel -= exposureLosses(world, ctx.map, f);
      const moving = MARCHING.has(f.order.posture) && f.order.path?.length && f.status === 'active';
      if (moving) march(world, ctx, f, byNode);
      else rest(f, dtDays, f.id in isolated, f.id in engaged);
    }
    airlift(world, ctx, (f, to) => route(world, ctx.map, f, to, canSeize(f)));
    supplyAirheads(world, ctx.map, ctx.catalog);
  },
};

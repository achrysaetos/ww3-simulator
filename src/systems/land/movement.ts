import type { Catalog } from '../../core/catalog';
import { atWar, type SimContext, type System } from '../../core/engine';
import type { GameMap } from '../../core/map';
import { findPath } from '../../core/path';
import type { Command, Formation, NationId, NodeId, PlatformId, World } from '../../core/types';
import { allied, canEnter, indexByNode, isLandFormation, landSlice } from './state';
import { cannotDrop, insert, supplyAirheads } from './airborne';
import { airlift, embarkation, liftMode, overseas } from './strategic';
import { exposureLosses, groundFactorAt } from '../weather/effects';
import {
  AIR_INTERDICTION, DISMOUNTS, ENTRENCH_PER_DAY, FATIGUE_MARCH_PER_DAY, FATIGUE_RECOVERY_PER_DAY, HOSTILE_GROUND_COST,
  MARCH_HOURS_PER_DAY, MARCH_SPEED_FACTOR, MORALE_RECOVERY_PER_DAY, NO_FUEL_SPEED, RAIL_BOOST_MAX, RAIL_KM_FULL, RALLY_MORALE, TERRAIN,
} from './tables';

type OrderCommand = Extract<Command, { type: 'order' }>;

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

/** Effective km of entering `to`: terrain friction, hostile ground, minus rail boost, and today's mud or snow there. Infinity when closed to this nation. */
function edgeKm(world: World, map: GameMap, f: Formation, to: NodeId, km: number): number {
  if (!canEnter(world, map, f.nation, to)) return Infinity;
  const holder = world.control[to];
  const hostile = !!holder && atWar(world, f.nation, holder);
  if (hostile && !canSeize(f)) return Infinity;
  return (km * TERRAIN[map.terrain[to]].moveCost * (hostile ? HOSTILE_GROUND_COST : 1)) / railBoost(world, map, f.nation, to) / groundFactorAt(world, map, to);
}

/**
 * Handle an 'order' command for a land formation. Returns false when the
 * formation is not a land formation, so the caller can route it elsewhere.
 */
export function applyLandOrder(world: World, cmd: OrderCommand, ctx: SimContext): boolean {
  const f = world.formations[cmd.formation];
  if (!f || !isLandFormation(f, ctx.map)) return false;
  if (f.nation !== cmd.nation) {
    ctx.emit({ type: 'message', tick: world.tick, nation: cmd.nation, text: `${cmd.nation} cannot order ${f.name}` });
    return true;
  }
  const { posture, target } = cmd.order;
  if (posture === 'air_assault') {
    const why = target === undefined ? 'no drop zone' : cannotDrop(world, ctx.map, ctx.catalog, f, target);
    if (why === undefined && target !== undefined) insert(world, ctx, f, target);
    else ctx.emit({ type: 'message', tick: world.tick, nation: f.nation, text: `${f.name}: cannot be inserted by air, ${why}` });
    return true;
  }
  f.order = { ...cmd.order, issuedTick: world.tick };
  f.progressKm = 0;
  if (!MARCHING.has(posture) || target === undefined || target === f.node) {
    delete f.order.path;
    return true;
  }
  // Across water the march ends at the gateway where the formation waits for lift (see strategic.ts).
  let goal = target;
  if (overseas(ctx.map, f.node, target)) {
    const mode = posture === 'move' ? liftMode(world, ctx.catalog, f) : undefined;
    const gate = mode && embarkation(world, ctx.map, f, target, mode);
    if (gate === undefined) {
      f.order = { posture: 'defend', issuedTick: world.tick };
      ctx.emit({ type: 'message', tick: world.tick, nation: f.nation, text: `${f.name}: no ${mode ? `friendly ${mode === 'air' ? 'airfield' : 'port'} to embark at` : 'land route; order a move to deploy overseas'}` });
      return true;
    }
    if (gate === f.node) {
      f.order.path = [];
      return true;
    }
    goal = gate;
  }
  const path = route(world, ctx.map, f, goal);
  if (!path) {
    f.order = { posture: 'defend', issuedTick: world.tick };
    ctx.emit({ type: 'message', tick: world.tick, nation: f.nation, text: `${f.name}: no land route to node ${target}` });
    return true;
  }
  f.order.path = path;
  return true;
}

/** Cheapest land route for this formation. The heuristic is straight-line km, so edge costs are scaled until the cheapest (full rail) edge never undercuts it. */
function route(world: World, map: GameMap, f: Formation, to: NodeId): NodeId[] | null {
  const scale = 1 + RAIL_BOOST_MAX;
  return findPath(map, f.node, to, (_a, b, km) => edgeKm(world, map, f, b, km) * scale);
}

function rest(f: Formation, dtDays: number, isolated: boolean, engaged: boolean): void {
  // A unit under assault fights from the holes it has; digging new ones waits for a lull.
  if (engaged) return;
  if (f.order.posture === 'defend' || f.order.posture === 'reserve') f.entrenchment = Math.min(1, f.entrenchment + ENTRENCH_PER_DAY * dtDays);
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
  if (air && atWar(world, f.nation, air.nation)) speed *= 1 - AIR_INTERDICTION * air.level;
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
  if (here && atWar(world, f.nation, here) && !friendlyGround(world, f.nation, path[0])) return;

  const hours = MARCH_HOURS_PER_DAY * dtDays;
  f.progressKm += kmPerDay * dtDays;
  f.supply.fuel = Math.max(0, f.supply.fuel - marchBurnPerHour(f) * hours);
  f.fatigue = Math.min(1, f.fatigue + FATIGUE_MARCH_PER_DAY * dtDays);
  f.entrenchment = 0;

  while (path.length) {
    const next = path[0];
    const cost = edgeKm(world, map, f, next, map.distanceKm(f.node, next));
    if (!Number.isFinite(cost)) {
      f.order = { posture: 'defend', issuedTick: world.tick };
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
    if (holder && atWar(world, f.nation, holder)) {
      f.progressKm = 0;
      return;
    }
  }
  f.progressKm = 0;
  // At the gateway of an overseas move: wait there for lift.
  if (f.order.posture === 'move' && f.order.target !== undefined && overseas(map, f.node, f.order.target)) return;
  const holder = world.control[f.node];
  const contesting = f.order.posture === 'attack' && holder && atWar(world, f.nation, holder);
  if (!contesting && f.order.posture !== 'reserve') f.order = { posture: 'defend', issuedTick: world.tick };
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
    airlift(world, ctx, (f, to) => route(world, ctx.map, f, to));
    supplyAirheads(world, ctx.map, ctx.catalog);
  },
};

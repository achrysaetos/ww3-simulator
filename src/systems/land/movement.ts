import type { Catalog } from '../../core/catalog';
import { atWar, type SimContext, type System } from '../../core/engine';
import type { GameMap } from '../../core/map';
import { findPath } from '../../core/path';
import type { Command, Formation, NationId, NodeId, PlatformId, World } from '../../core/types';
import { allied, canEnter, hostilesAt, indexByNode, isLandFormation, landSlice } from './state';
import {
  AIR_INTERDICTION, DISMOUNTS, ENTRENCH_PER_DAY, FATIGUE_MARCH_PER_DAY, FATIGUE_RECOVERY_PER_DAY, HOSTILE_GROUND_COST,
  MARCH_HOURS_PER_DAY, MARCH_SPEED_FACTOR, MORALE_RECOVERY_PER_DAY, NO_FUEL_SPEED, RAIL_BOOST_MAX, RAIL_KM_FULL, RALLY_MORALE, TERRAIN,
} from './tables';

type OrderCommand = Extract<Command, { type: 'order' }>;

/** Only manoeuvre formations push into enemy-held ground; support echelons stay behind the line. */
const canSeize = (f: Formation) => f.kind === 'maneuver';

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

/** Effective km of entering `to`: terrain friction, hostile ground, minus rail boost. Infinity when closed to this nation. */
function edgeKm(world: World, map: GameMap, f: Formation, to: NodeId, km: number): number {
  if (!canEnter(world, map, f.nation, to)) return Infinity;
  const holder = world.control[to];
  const hostile = !!holder && atWar(world, f.nation, holder);
  if (hostile && !canSeize(f)) return Infinity;
  return (km * TERRAIN[map.terrain[to]].moveCost * (hostile ? HOSTILE_GROUND_COST : 1)) / railBoost(world, map, f.nation, to);
}

/** The formation has covered the ground up to its next path node and is in contact with whatever holds it. */
export function atLineOfContact(world: World, map: GameMap, f: Formation): boolean {
  const next = f.order.path?.[0];
  return next !== undefined && f.progressKm >= edgeKm(world, map, f, next, map.distanceKm(f.node, next));
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
  f.order = { ...cmd.order, issuedTick: world.tick };
  f.progressKm = 0;
  if ((posture !== 'move' && posture !== 'attack') || target === undefined) {
    delete f.order.path;
    return true;
  }
  // Heuristic is straight-line km; scale edge costs so the cheapest (full rail) edge never undercuts it.
  const scale = 1 + RAIL_BOOST_MAX;
  const path = findPath(ctx.map, f.node, target, (_a, b, km) => edgeKm(world, ctx.map, f, b, km) * scale);
  if (!path) {
    f.order = { posture: 'defend', issuedTick: world.tick };
    ctx.emit({ type: 'message', tick: world.tick, nation: f.nation, text: `${f.name}: no land route to node ${target}` });
    return true;
  }
  f.order.path = path;
  return true;
}

function capture(world: World, ctx: SimContext, f: Formation, node: NodeId): void {
  const from = world.control[node];
  if (!from || !atWar(world, f.nation, from)) return;
  const original = ctx.map.owner[node];
  // Liberated ground returns to its friendly pre-war owner.
  const to = original && original !== from && allied(world, f.nation, original) ? original : f.nation;
  world.control[node] = to;
  ctx.emit({ type: 'node_captured', tick: world.tick, node, from, to });
}

function rest(f: Formation, dtDays: number, isolated: boolean, engaged: boolean): void {
  if (f.order.posture === 'defend' || f.order.posture === 'reserve') f.entrenchment = Math.min(1, f.entrenchment + ENTRENCH_PER_DAY * dtDays);
  if (engaged) return;
  f.fatigue = Math.max(0, f.fatigue - FATIGUE_RECOVERY_PER_DAY * dtDays);
  if (!isolated) f.morale = Math.min(0.9, f.morale + MORALE_RECOVERY_PER_DAY * dtDays);
  if (f.status === 'routed' && !isolated && f.morale >= RALLY_MORALE) f.status = 'active';
}

function march(world: World, ctx: SimContext, f: Formation, byNode: Map<number, Formation[]>): void {
  const { map, catalog } = ctx;
  const path = f.order.path!;
  const dtDays = world.dtHours / 24;
  let speed = marchSpeedKph(f, catalog) * MARCH_SPEED_FACTOR * (1 - 0.5 * f.fatigue);
  if (f.supply.fuel <= 0 && f.supplyCapacity.fuel > 0) speed *= NO_FUEL_SPEED;
  const air = world.theater.airControl[f.node];
  if (air && atWar(world, f.nation, air.nation)) speed *= 1 - AIR_INTERDICTION * air.level;
  if (speed <= 0) return;
  // Already at the line of contact: the fight, not the march, spends fuel and fatigue.
  if (hostilesAt(world, byNode, path[0], f.nation).length && atLineOfContact(world, map, f)) return;

  const hours = MARCH_HOURS_PER_DAY * dtDays;
  f.progressKm += speed * hours;
  f.supply.fuel = Math.max(0, f.supply.fuel - (f.supplyCapacity.fuel / 72) * hours);
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
    if (hostilesAt(world, byNode, next, f.nation).length) {
      // Held at the line of contact; an 'attack' order is resolved by landCombat.
      f.progressKm = cost;
      return;
    }
    const here = byNode.get(f.node)!;
    here.splice(here.indexOf(f), 1);
    (byNode.get(next) ?? byNode.set(next, []).get(next)!).push(f);
    f.node = next;
    f.progressKm -= cost;
    path.shift();
    if (canSeize(f)) capture(world, ctx, f, next);
  }
  f.order = { posture: 'defend', issuedTick: world.tick };
  f.progressKm = 0;
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
      const moving = (f.order.posture === 'move' || f.order.posture === 'attack') && f.order.path?.length && f.status === 'active';
      if (moving) march(world, ctx, f, byNode);
      else rest(f, dtDays, f.id in isolated, f.id in engaged);
    }
  },
};

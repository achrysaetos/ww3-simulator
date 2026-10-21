/**
 * Air and missile war: sortie generation, counter-air, IADS, and strikes by
 * aircraft, ground-launched missiles and one-way drones. Sole writer of
 * world.theater.airControl, which is rebuilt every tick from that tick's fighting.
 */
import type { SimContext, System } from '../../core/engine';
import type { Command, Formation, FormationKind, MunitionId, PlatformId, Posture, World } from '../../core/types';
import { navalPosition } from '../naval';
import { combatRadiusKm } from './combat';
import { buildPicture } from './picture';
import { rearm } from './rearm';
import { isStrikeMunition, resolveStrikes, type AirSlice } from './strike';
import { resolveAirSuperiority } from './superiority';
import { AIRFRAME, LAUNCHER, OFFENSIVE_POSTURES, STRIKE_ROLES, TUNING } from './tables';

export { combatRadiusKm, resolveAirBattle, visibility } from './combat';
export { engagementCycles, interceptSalvo, type SalvoDefense, type SalvoResult, type SalvoThreat, type ShotDoctrine } from './intercept';
export { aimKey, dailyRounds, effectPk, futileAim, type AirSlice, type Assessment } from './strike';
export { ATTRITABLE_COST_USD_M } from './tables';

declare module '../../core/types' {
  interface Slices {
    air: AirSlice;
  }
}

/** Orders each owned formation kind accepts. Ground movement of SAMs and launchers belongs to the land system. */
const POSTURES: Partial<Record<FormationKind, ReadonlySet<Posture>>> = {
  air_wing: new Set(['reserve', 'defend', 'move', 'strike', 'air_superiority', 'patrol', 'escort']),
  missile: new Set(['reserve', 'defend', 'move', 'strike']),
  air_defense: new Set(['reserve', 'defend', 'move']),
};

/** Ferry range with drop tanks, roughly 2.5x combat radius (manufacturer ferry vs radius figures, F-16/Su-27). */
export const FERRY_FACTOR = 2.5;

export const airWar: System = {
  id: 'air',
  init(world) {
    world.slices.air = { runway: {} };
  },
  step(world, ctx) {
    const slice = (world.slices.air ??= { runway: {} });
    world.theater.airControl = {};
    const pic = buildPicture(world, ctx, slice.runway);
    resolveAirSuperiority(world, ctx, pic);
    resolveStrikes(world, ctx, pic, slice);
    recover(world, slice);
    rearm(world, ctx);
  },
};

function recover(world: World, slice: AirSlice) {
  const days = world.dtHours / 24;
  for (const f of Object.values(world.formations)) {
    if (f.kind !== 'air_wing' || f.status !== 'active') continue;
    const delta = OFFENSIVE_POSTURES.has(f.order.posture) ? TUNING.surgeFatiguePerDay * days : -TUNING.restRecoveryPerDay * days;
    f.fatigue = Math.max(0, Math.min(1, f.fatigue + delta));
  }
  const grid = world.theater.power ?? {};
  for (const [node, g] of Object.entries(grid)) {
    const next = g + (1 - g) * Math.min(1, TUNING.powerRepairPerDay * days);
    if (next >= 0.999) delete grid[Number(node)];
    else grid[Number(node)] = next;
  }
  for (const [node, r] of Object.entries(slice.runway)) {
    const next = r + TUNING.runwayRepairPerDay * days;
    if (next >= 1) delete slice.runway[Number(node)];
    else slice.runway[Number(node)] = next;
  }
}

/**
 * Apply an 'order' command to an air_wing, air_defense or missile formation.
 * Returns false when the formation is not one of this system's kinds (the
 * coordinator then routes it elsewhere). Strike and counter-air orders beyond the
 * best-case reach (full tanker support, longest weapon) are refused with a message.
 * Air wings rebase immediately on 'move' if the destination is in ferry range.
 */
export function applyAirOrder(world: World, cmd: Command, ctx: SimContext): boolean {
  if (cmd.type !== 'order') return false;
  const f = world.formations[cmd.formation];
  const allowed = f && POSTURES[f.kind];
  if (!f || !allowed) return false;
  const refuse = (why: string) => {
    // Only a player reads why an order was refused; an AI nation re-plans from the world as it is.
    if (world.nations[cmd.nation]?.controlledBy === 'human') ctx.emit({ type: 'message', tick: world.tick, nation: cmd.nation, text: `${f.name}: order refused, ${why}` });
    return true;
  };
  if (f.nation !== cmd.nation) return refuse('not your formation');
  if (f.status !== 'active') return refuse(`formation is ${f.status}`);
  const { order } = cmd;
  if (!allowed.has(order.posture)) return refuse(`${f.kind} cannot take posture ${order.posture}`);
  const target = order.target;
  const needsTarget = order.posture === 'strike' || order.posture === 'air_superiority' || (order.posture === 'move' && f.kind === 'air_wing');
  if (needsTarget && target === undefined) return refuse(`${order.posture} needs a target`);

  if (target !== undefined && (order.posture === 'strike' || order.posture === 'air_superiority')) {
    const reach = maxReachKm(f, order.posture === 'strike', ctx);
    const ship = order.targetFormation ? world.formations[order.targetFormation] : undefined;
    const dist = ctx.map.distanceKm(f.node, ship?.node === target ? navalPosition(ctx.map, ship) : target);
    if (dist > reach) return refuse(`target is ${Math.round(dist)} km away, beyond reach of ${Math.round(reach)} km`);
  }

  if (order.posture === 'move' && f.kind === 'air_wing') {
    const ferry = Math.min(...Object.keys(f.equipment).map((pid) => ctx.catalog.platform(pid as PlatformId).mobility.rangeKm)) * FERRY_FACTOR;
    const dist = ctx.map.distanceKm(f.node, target!);
    if (dist > ferry) return refuse(`base is ${Math.round(dist)} km away, beyond ferry range`);
    if (ctx.map.isSea(target!)) return refuse('no airfield at sea');
    f.node = f.home = target!;
    f.order = { posture: 'defend', issuedTick: world.tick };
    return true;
  }

  f.order = { ...order, issuedTick: world.tick };
  return true;
}

function maxReachKm(f: Formation, strike: boolean, ctx: SimContext): number {
  let weapon = 0;
  if (strike)
    for (const [mid, n] of Object.entries(f.magazine)) {
      const m = ctx.catalog.munitions.get(mid as MunitionId);
      if (m && n >= 1 && isStrikeMunition(m)) weapon = Math.max(weapon, m.rangeKm);
    }
  let reach = 0;
  for (const pid of Object.keys(f.equipment)) {
    const p = ctx.catalog.platform(pid as PlatformId);
    const role = AIRFRAME[p.class]?.role;
    if (role && (strike ? STRIKE_ROLES.has(role) : role === 'counter_air')) reach = Math.max(reach, combatRadiusKm(p, Infinity) + weapon);
    else if (strike && LAUNCHER[p.class]) reach = Math.max(reach, weapon);
  }
  return reach;
}

/**
 * Air and missile war: sortie generation, counter-air, IADS, and strikes by
 * aircraft, ground-launched missiles and one-way drones. Sole writer of
 * world.theater.airControl, which is rebuilt every tick from that tick's fighting.
 */
import { atWar, type SimContext, type System } from '../../core/engine';
import type { Catalog } from '../../core/catalog';
import type { Formation, FormationId, FormationKind, MunitionId, NationId, NodeId, PlatformId, Posture, RefusalCode, World } from '../../core/types';
import { keepPlayer, type OrderCommand, type OrderOutcome } from '../orders';
import { navalPosition } from '../naval';
import { combatRadiusKm } from './combat';
import { buildPicture, type AirPicture } from './picture';
import { rearm, stockWarReserves } from './rearm';
import { isStrikeMunition, reloadSalvos, resolveStrikes, type AirSlice } from './strike';
import { resolveAirSuperiority } from './superiority';
import { AIRFRAME, DEEP_FIRE_CLASSES, LAUNCHER, OFFENSIVE_POSTURES, STRIKE_ROLES, TUNING } from './tables';

export { combatRadiusKm, resolveAirBattle, tankerStretch, visibility } from './combat';
export { engagementCycles, interceptSalvo, type SalvoDefense, type SalvoResult, type SalvoThreat, type ShotDoctrine } from './intercept';
export { aimKey, dailyRounds, effectPk, futileAim, type AirSlice, type Assessment } from './strike';
export { ATTRITABLE_COST_USD_M, PENETRATOR_VISIBILITY } from './tables';

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
  // An artillery formation's deep fire missions; every other order of its is the land system's.
  artillery: new Set(['strike']),
};

/** Ferry range with drop tanks, roughly 2.5x combat radius (manufacturer ferry vs radius figures, F-16/Su-27). */
export const FERRY_FACTOR = 2.5;

/**
 * How far a wing flies in one leg when it rebases: its shortest-legged type's ferry range, stretched by tankers
 * the way they stretch a raid (TUNING.maxTankerExtension) when its nation flies any. USAF Coronet moves cross the
 * Pacific in legs of 4,000-6,000 km (CONUS-Hawaii-Guam-Japan) behind KC-135s and KC-46s.
 */
export function ferryKm(world: World, catalog: Catalog, f: Formation): number {
  const own = Math.min(...Object.keys(f.equipment).map((pid) => catalog.platform(pid as PlatformId).mobility.rangeKm)) * FERRY_FACTOR;
  return fliesTankers(world, catalog, f.nation) ? own * (1 + TUNING.maxTankerExtension) : own;
}

export const airWar: System = {
  id: 'air',
  init(world, ctx) {
    world.slices.air = { runway: {} };
    stockWarReserves(world, ctx.catalog);
  },
  step(world, ctx) {
    const slice = (world.slices.air ??= { runway: {} });
    world.theater.airControl = {};
    const pic = buildPicture(world, ctx, slice.runway);
    for (const [nation, share] of pic.tankerShare) (slice.tanking ??= {})[nation] = share;
    const offered = combatSorties(pic);
    resolveAirSuperiority(world, ctx, pic);
    resolveStrikes(world, ctx, pic, slice);
    const left = combatSorties(pic);
    recover(world, slice, (f) => offered.has(f.id) && left.get(f.id) === offered.get(f.id));
    reloadSalvos(world, slice, ctx.catalog);
    rearm(world, ctx);
  },
};

/** Sorties left to each wing's combat aircraft (fighters, strikers, bombers, helicopters); a wing with none is absent. */
function combatSorties(pic: AirPicture): Map<FormationId, number> {
  const out = new Map<FormationId, number>();
  for (const g of pic.groups) if (STRIKE_ROLES.has(g.profile.role)) out.set(g.f.id, (out.get(g.f.id) ?? 0) + g.sorties);
  return out;
}

/**
 * Surge tempo tires crews and wears airframes; a wing whose offensive order flew nothing this tick (out of reach on
 * the day's tanker share, no weapon to release, no war yet) stood down and rests instead.
 */
function recover(world: World, slice: AirSlice, idle: (f: Formation) => boolean) {
  const days = world.dtHours / 24;
  for (const f of Object.values(world.formations)) {
    if (f.kind !== 'air_wing' || f.status !== 'active') continue;
    const delta = OFFENSIVE_POSTURES.has(f.order.posture) && !idle(f) ? TUNING.surgeFatiguePerDay * days : -TUNING.restRecoveryPerDay * days;
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
 * Returns undefined when the formation is not one of this system's kinds (the
 * router then offers it elsewhere). A strike needs a strike weapon aboard and a target
 * held by an enemy; strike and counter-air orders beyond the best-case reach (tankers
 * if the nation flies any, longest weapon) are refused.
 * Air wings rebase immediately on 'move' if the destination is in ferry range.
 */
export function applyAirOrder(world: World, cmd: OrderCommand, ctx: SimContext): OrderOutcome | undefined {
  const f = world.formations[cmd.formation];
  const allowed = f && POSTURES[f.kind];
  if (!f || !allowed || (f.kind === 'artillery' && cmd.order.posture !== 'strike')) return undefined;
  const refuse = (code: RefusalCode, reason: string): OrderOutcome => ({ ok: false, code, reason });
  if (f.nation !== cmd.nation) return refuse('not_yours', 'not your formation');
  if (f.status !== 'active') return refuse('not_ready', `formation is ${f.status}`);
  const { order } = cmd;
  if (!allowed.has(order.posture)) return refuse('wrong_role', `${f.kind} cannot take posture ${order.posture}`);
  const target = order.target;
  const needsTarget = order.posture === 'strike' || order.posture === 'air_superiority' || (order.posture === 'move' && f.kind === 'air_wing');
  if (needsTarget && target === undefined) return refuse('no_target', `${order.posture} needs a target`);

  // A strike on a satellite formation is an ASAT engagement, resolved by orbit in the strategic system.
  const aimed = order.targetFormation ? world.formations[order.targetFormation] : undefined;
  if (target !== undefined && aimed?.kind !== 'space' && (order.posture === 'strike' || order.posture === 'air_superiority')) {
    const strike = order.posture === 'strike';
    const reach = maxReachKm(world, f, strike, ctx);
    if (reach <= 0) return refuse('wrong_role', strike ? 'no strike aircraft or launchers' : 'no fighters for counter-air');
    const dist = ctx.map.distanceKm(f.node, aimed?.node === target ? navalPosition(ctx.map, aimed) : target);
    if (dist > reach) return refuse('out_of_range', `target is ${Math.round(dist)} km away, beyond reach of ${Math.round(reach)} km`);
    if (strike && !hostileAt(world, f.nation, target, aimed)) return refuse('neutral_territory', 'nothing there belongs to a nation you are at war with');
  }

  if (order.posture === 'move' && f.kind === 'air_wing') {
    const ferry = ferryKm(world, ctx.catalog, f);
    const dist = ctx.map.distanceKm(f.node, target!);
    if (dist > ferry) return refuse('out_of_range', `base is ${Math.round(dist)} km away, beyond ferry range of ${Math.round(ferry)} km`);
    if (ctx.map.isSea(target!)) return refuse('no_airfield', 'no airfield at sea');
    f.node = f.home = target!;
    f.order = { posture: 'defend', issuedTick: world.tick, ...keepPlayer(order) };
    return { ok: true, etaHours: 0 };
  }

  f.order = { ...order, issuedTick: world.tick };
  // Fighters with only air-to-air rounds still sweep the target area (superiority.ts), so the order stands; the player is told it drops nothing.
  if (order.posture === 'strike' && aimed?.kind !== 'space' && !carriesStrikeWeapon(f, ctx)) return { ok: true, note: 'no strike weapons aboard: it will sweep the target area for enemy fighters but drop nothing' };
  return { ok: true };
}

/**
 * Whether the formation can ever fire a round planPackage uses: a strike munition or an anti-radiation
 * missile, aboard or in its platforms' loadouts. An empty launcher keeps its strike order and fires once rearmed.
 */
function carriesStrikeWeapon(f: Formation, ctx: SimContext): boolean {
  const usable = (mid: string) => {
    const m = ctx.catalog.munitions.get(mid as MunitionId);
    return !!m && (isStrikeMunition(m) || m.kind === 'arm');
  };
  if (Object.keys(f.magazine).some(usable)) return true;
  return Object.entries(f.equipment).some(([pid, n]) => n > 0 && ctx.catalog.platform(pid as PlatformId).loadout.some((l) => usable(l.munition)));
}

/** Whether a strike at `target` has an enemy to hit, as resolveStrikes judges it. */
function hostileAt(world: World, nation: NationId, target: NodeId, aimed: Formation | undefined): boolean {
  if (aimed) return atWar(world, aimed.nation, nation);
  const owner = world.control[target];
  if (owner && atWar(world, owner, nation)) return true;
  for (const g of Object.values(world.formations)) if (g.node === target && g.status !== 'destroyed' && atWar(world, g.nation, nation)) return true;
  return false;
}

const fliesTankers = (world: World, catalog: Catalog, nation: NationId) =>
  Object.values(world.formations).some((w) => w.nation === nation && w.kind === 'air_wing' && w.status === 'active'
    && Object.entries(w.equipment).some(([pid, n]) => n > 0 && catalog.platform(pid as PlatformId).class === 'tanker'));

function maxReachKm(world: World, f: Formation, strike: boolean, ctx: SimContext): number {
  let weapon = 0;
  if (strike)
    for (const [mid, n] of Object.entries(f.magazine)) {
      const m = ctx.catalog.munitions.get(mid as MunitionId);
      if (m && n >= 1 && isStrikeMunition(m)) weapon = Math.max(weapon, m.rangeKm);
    }
  const tankers = fliesTankers(world, ctx.catalog, f.nation) ? Infinity : 0;
  let reach = 0;
  for (const pid of Object.keys(f.equipment)) {
    const p = ctx.catalog.platform(pid as PlatformId);
    const role = AIRFRAME[p.class]?.role;
    if (role && (strike ? STRIKE_ROLES.has(role) : role === 'counter_air')) reach = Math.max(reach, combatRadiusKm(p, tankers) + weapon);
    else if (strike && (LAUNCHER[p.class] || (f.kind === 'artillery' && DEEP_FIRE_CLASSES.has(p.class)))) reach = Math.max(reach, weapon);
  }
  return reach;
}

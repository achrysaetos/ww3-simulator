import { newId, type SimContext } from '../../core/engine';
import type { Command, Formation, NodeId, PlatformId, RefusalCode, World } from '../../core/types';
import type { OrderOutcome } from '../orders';
import { engages } from '../air/tables';
import { canBoard, liftShare, liftUsed } from './amphibious';
import { tickEnv } from './env';
import { navalDestination, transitPath } from './movement';
import { isNavalFormation } from './state';
import { ANTISHIP_KINDS, INTERCEPTOR_KINDS } from './tables';

type OrderCommand = Extract<Command, { type: 'order' }>;

/**
 * Readiness below which a group is in a shipyard availability and cannot sail: a carrier in
 * refuelling overhaul (about four years) or a docking availability. Under the US Navy's Optimized
 * Fleet Response Plan a ship in its maintenance phase is not surge-ready; one in the basic phase
 * between deployments is (GAO-21-366, 2021). The threshold is judgment: it separates the yard
 * availabilities in the orders of battle (0.05-0.2) from ships working up (0.4 and above).
 */
export const SEAWORTHY = 0.25;

/**
 * Whether the coordinator should route this 'order' to the naval system: orders to surface
 * groups and submarines, any 'embark' order (a land or air formation boarding a lift group),
 * and orders to formations currently embarked.
 */
export function isNavalOrder(world: World, cmd: Command): cmd is OrderCommand {
  if (cmd.type !== 'order') return false;
  const f = world.formations[cmd.formation];
  return !!f && (isNavalFormation(f) || f.status === 'embarked' || cmd.order.posture === 'embark');
}

export function applyNavalOrder(world: World, cmd: OrderCommand, ctx: SimContext): OrderOutcome {
  const f = world.formations[cmd.formation];
  const refuse = (code: RefusalCode, reason: string): OrderOutcome => ({ ok: false, code, reason });
  if (!f || f.nation !== cmd.nation) return refuse('not_yours', 'no such formation of yours');
  if (f.status === 'destroyed') return refuse('destroyed', 'formation destroyed');
  const order = { ...cmd.order, issuedTick: world.tick };

  if (order.posture === 'embark') {
    const lift = order.targetFormation ? world.formations[order.targetFormation] : undefined;
    if (!lift || lift.status !== 'active' || lift.kind !== 'surface_group' || lift.nation !== f.nation) return refuse('bad_target', 'embark needs an own active surface group as targetFormation');
    if (f.status !== 'active') return refuse('not_ready', 'already embarked');
    const env = tickEnv(world, ctx);
    const comp = env.comp(lift);
    if (!canBoard(env, f, lift)) return refuse('not_in_port', 'must stand in a port with the lift group in port or offshore');
    const room = 1 - liftUsed(env, lift, comp);
    const share = liftShare(ctx.catalog, f, comp);
    if (!boardable(room, share)) return refuse('no_lift', `${lift.name} lacks lift capacity`);
    const boarding = share > room + 1e-9 ? detach(world, ctx, f, room / share) : f;
    boarding.status = 'embarked';
    boarding.embarkedOn = lift.id;
    boarding.node = lift.node;
    boarding.order = { posture: 'embark', targetFormation: lift.id, issuedTick: world.tick };
    (env.embarked.get(lift.id) ?? env.embarked.set(lift.id, []).get(lift.id)!).push(boarding);
    return { ok: true, etaHours: 0 };
  }
  if (f.status === 'embarked') return refuse('embarked', 'embarked formations land by ordering their lift group to attack or move to a coast');
  if (!isNavalFormation(f)) return refuse('wrong_role', 'not a naval formation');

  if (f.readiness < SEAWORTHY && order.posture !== 'reserve' && f.node === f.home) return refuse('not_ready', `${f.name} is in a shipyard availability and cannot sail`);
  // Strike USVs raid from where they lie: the boats themselves cross to the target and expend themselves (USV_STRIKE range).
  if (order.posture === 'attack' && order.targetFormation && launchedFromShore(ctx, f)) {
    f.order = { ...order, path: [] };
    return { ok: true };
  }
  const goal = order.posture === 'reserve' ? f.home : goalNode(world, order.target, order.targetFormation);
  if (goal === undefined) {
    f.order = { ...order, path: [] };
    return { ok: true };
  }
  const dest = navalDestination(world, ctx.map, f.nation, goal);
  const path = dest === undefined ? null : transitPath(world, ctx.map, f.nation, f.node, dest);
  if (!path) return refuse('no_route', `no sea route to node ${goal}`);
  f.order = { ...order, target: goal, path };
  f.progressKm = 0;
  return { ok: true };
}

/**
 * Smallest share of a formation worth embarking as a separate landing team. A brigade too big
 * for one lift group sails as battalion landing teams spread over several ships and waves
 * (USMC MEU doctrine; PLA assault echelons in the CMPR 2024), the rest following later.
 */
const MIN_LANDING_TEAM = 0.1;

/** Whether a formation needing `share` of a lift group fits, whole or as a landing team, in the `room` left aboard. */
export function boardable(room: number, share: number): boolean {
  return room > 0 && room >= MIN_LANDING_TEAM * share;
}

/** Split `share` of a formation off as a landing team (or another `echelon`); the parent keeps the rest where it is. */
export function detach(world: World, ctx: SimContext, f: Formation, share: number, echelon = 'landing team'): Formation {
  const take = <K extends string>(r: Record<K, number>): Record<K, number> => {
    const out = {} as Record<K, number>;
    for (const [k, n] of Object.entries(r) as [K, number][]) {
      const t = Math.round(n * share);
      if (t <= 0) continue;
      out[k] = t;
      if (n - t > 0) r[k] = n - t;
      else delete r[k];
    }
    return out;
  };
  const team: Formation = {
    ...f,
    id: newId(world, `${f.id}-lt`),
    name: f.name.endsWith(` ${echelon}`) ? f.name : `${f.name} ${echelon}`,
    equipment: take(f.equipment),
    damaged: {},
    magazine: take(f.magazine),
    personnel: Math.round(f.personnel * share),
    supply: scaled(f.supply, share),
    supplyCapacity: scaled(f.supplyCapacity, share),
    order: { ...f.order },
  };
  f.personnel -= team.personnel;
  f.supply = scaled(f.supply, 1 - share);
  f.supplyCapacity = scaled(f.supplyCapacity, 1 - share);
  world.formations[team.id] = team;
  ctx.emit({ type: 'message', tick: world.tick, nation: f.nation, text: `${team.name} formed (${Math.round(share * 100)}% of ${f.name})` });
  return team;
}

const scaled = (b: Formation['supply'], k: number) => ({ fuel: b.fuel * k, ammo: b.ammo * k, food: b.food * k });

function goalNode(world: World, target?: NodeId, targetFormation?: Formation['id']): NodeId | undefined {
  if (targetFormation) {
    const t = world.formations[targetFormation];
    if (t && t.status === 'active') return t.node;
  }
  return target;
}

const ON_STATION = new Set(['attack', 'patrol', 'blockade', 'escort']);

/**
 * Share of fuel capacity at which a group heads home: planners keep a return reserve, and only an
 * oiler alongside refills a group at sea (logistics). Judgment.
 */
// param: tag=estimated range=[0.2,0.4] source=judgment, return-fuel reserve
const BINGO_FUEL = 0.3;
/**
 * Share of a group's hulls damaged at which it goes home for yard repair: battle damage is fixed
 * alongside, not at sea (USS Stark about a year, USS Cole 14 months). Judgment.
 */
// param: tag=estimated range=[0.3,0.7] source=judgment
const DAMAGED_RTB = 0.5;

/** A group of strike USVs only: crewless boats launched from their base against targets within their range. */
function launchedFromShore(ctx: SimContext, f: Formation): boolean {
  const pids = Object.keys(f.equipment) as PlatformId[];
  return pids.length > 0 && pids.every((pid) => ctx.catalog.platform(pid).class === 'usv');
}

/** Keep escorts and hunters on their moving target, and send home groups that ran out of stores, fuel or weapons, or are mostly damaged. */
export function refreshOrders(world: World, ctx: SimContext, f: Formation, tracked: boolean): void {
  const o = f.order;
  if (o.posture === 'reserve' && f.node !== f.home && !o.path?.length) repath(world, ctx, f, f.home);
  if (o.targetFormation && (o.posture === 'escort' || o.posture === 'attack')) {
    const t = world.formations[o.targetFormation];
    if (t?.status === 'active' && t.node !== o.target && (o.posture === 'escort' || tracked) && !launchedFromShore(ctx, f)) repath(world, ctx, f, t.node);
  }
  // Crewless groups (strike USVs) carry no stores: no food, nothing to run out of.
  const spent = (f.supplyCapacity.food > 0 && f.supply.food <= 0) || f.supply.fuel < BINGO_FUEL * f.supplyCapacity.fuel || mostlyDamaged(f);
  if (f.node !== f.home && o.posture !== 'reserve' && (spent || (ON_STATION.has(o.posture) && outOfWeapons(ctx, f)))) {
    o.posture = 'reserve';
    repath(world, ctx, f, f.home);
  }
}

export function mostlyDamaged(f: Formation): boolean {
  let damaged = 0, fit = 0;
  for (const k in f.damaged) damaged += f.damaged[k as PlatformId];
  for (const k in f.equipment) fit += f.equipment[k as PlatformId];
  return damaged > 0 && damaged >= DAMAGED_RTB * (damaged + fit);
}

function repath(world: World, ctx: SimContext, f: Formation, goal: NodeId): void {
  const dest = navalDestination(world, ctx.map, f.nation, goal);
  const path = dest === undefined ? null : transitPath(world, ctx.map, f.nation, f.node, dest);
  if (!path) return;
  f.order.target = goal;
  f.order.path = path;
  f.progressKm = 0;
}

/**
 * Share of full load below which a surface group's area air-defence rounds send it home to
 * rearm, and the share it must hold before it sails again. A warship cannot reload its vertical
 * launch cells at sea under fire, and with its interceptors spent it can only be sunk: CSIS 2023
 * lost US ships because salvos emptied their magazines. The thresholds are judgment.
 */
const WINCHESTER = 0.25;
export const REARMED = 0.75;

/**
 * Share of its full load of area air-defence rounds a surface group still holds: the rounds that
 * can engage a ballistic missile (SM-2/3/6, HQ-9, S-300, Aster 30; air tables `engages`), which
 * its whole task force leans on. 1 for a group whose ships carry none.
 */
export function areaDefenseShare(ctx: SimContext, f: Formation): number {
  let full = 0, have = 0;
  const counted = new Set<string>();
  for (const [pid, n] of Object.entries(f.equipment) as [PlatformId, number][]) {
    for (const l of ctx.catalog.platform(pid).loadout) {
      const m = ctx.catalog.munition(l.munition);
      if (!INTERCEPTOR_KINDS.has(m.kind) || !engages(m, 'ballistic')) continue;
      full += l.count * n;
      if (!counted.has(m.id)) { counted.add(m.id); have += f.magazine[m.id] ?? 0; }
    }
  }
  return full > 0 ? Math.min(1, have / full) : 1;
}

/**
 * Attack submarines with no anti-ship weapons left (torpedoes, anti-ship missiles), and surface groups with
 * their area-defence rounds spent, go home to rearm. Land-attack missiles left aboard do not keep a boat on a
 * patrol line it can no longer threaten.
 */
function outOfWeapons(ctx: SimContext, f: Formation): boolean {
  if (f.kind === 'surface_group') return areaDefenseShare(ctx, f) < WINCHESTER;
  if (f.kind !== 'submarine') return false;
  let classes = 0, armed = 0;
  for (const pid of Object.keys(f.equipment)) {
    const p = ctx.catalog.platform(pid as PlatformId);
    if (p.class === 'ssbn') return false;
    for (const l of p.loadout) {
      if (!ANTISHIP_KINDS.has(ctx.catalog.munition(l.munition).kind)) continue;
      classes++;
      if ((f.magazine[l.munition] ?? 0) >= 1) armed++;
    }
  }
  return classes > 0 && armed === 0;
}

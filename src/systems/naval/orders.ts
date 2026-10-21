import { newId, type SimContext } from '../../core/engine';
import type { Command, Formation, NodeId, PlatformId, World } from '../../core/types';
import { engages } from '../air/tables';
import { canBoard, liftShare, liftUsed } from './amphibious';
import { tickEnv } from './env';
import { navalDestination, seaPath } from './movement';
import { isNavalFormation } from './state';
import { INTERCEPTOR_KINDS } from './tables';

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

export function applyNavalOrder(world: World, cmd: OrderCommand, ctx: SimContext): void {
  const f = world.formations[cmd.formation];
  // Only a player reads why an order was refused; an AI nation re-plans from the world as it is.
  const refuse = (why: string) => {
    if (world.nations[cmd.nation]?.controlledBy === 'human') ctx.emit({ type: 'message', tick: world.tick, nation: cmd.nation, text: `order to ${cmd.formation} refused: ${why}` });
  };
  if (!f || f.nation !== cmd.nation) return refuse('no such formation of yours');
  if (f.status === 'destroyed') return refuse('formation destroyed');
  const order = { ...cmd.order, issuedTick: world.tick };

  if (order.posture === 'embark') {
    const lift = order.targetFormation ? world.formations[order.targetFormation] : undefined;
    if (!lift || lift.status !== 'active' || lift.kind !== 'surface_group' || lift.nation !== f.nation) return refuse('embark needs an own active surface group as targetFormation');
    if (f.status !== 'active') return refuse('already embarked');
    const env = tickEnv(world, ctx);
    const comp = env.comp(lift);
    if (!canBoard(env, f, lift)) return refuse('must stand in a port with the lift group in port or offshore');
    const room = 1 - liftUsed(env, lift, comp);
    const share = liftShare(ctx.catalog, f, comp);
    if (!boardable(room, share)) return refuse(`${lift.name} lacks lift capacity`);
    const boarding = share > room + 1e-9 ? detach(world, ctx, f, room / share) : f;
    boarding.status = 'embarked';
    boarding.embarkedOn = lift.id;
    boarding.node = lift.node;
    boarding.order = { posture: 'embark', targetFormation: lift.id, issuedTick: world.tick };
    (env.embarked.get(lift.id) ?? env.embarked.set(lift.id, []).get(lift.id)!).push(boarding);
    return;
  }
  if (f.status === 'embarked') return refuse('embarked formations land by ordering their lift group to attack or move to a coast');
  if (!isNavalFormation(f)) return refuse('not a naval formation');

  if (f.readiness < SEAWORTHY && order.posture !== 'reserve' && f.node === f.home) return refuse(`${f.name} is in a shipyard availability and cannot sail`);
  const goal = order.posture === 'reserve' ? f.home : goalNode(world, order.target, order.targetFormation);
  if (goal === undefined) {
    f.order = { ...order, path: [] };
    return;
  }
  const dest = navalDestination(world, ctx.map, f.nation, goal);
  const path = dest === undefined ? null : seaPath(world, ctx.map, f.nation, f.node, dest);
  if (!path) return refuse(`no sea route to node ${goal}`);
  f.order = { ...order, target: goal, path };
  f.progressKm = 0;
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

/** Split `share` of a formation off as a landing team; the parent keeps the rest at the port. */
function detach(world: World, ctx: SimContext, f: Formation, share: number): Formation {
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
    name: f.name.endsWith(' landing team') ? f.name : `${f.name} landing team`,
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
  ctx.emit({ type: 'message', tick: world.tick, nation: f.nation, text: `${team.name} formed to embark (${Math.round(share * 100)}% of ${f.name})` });
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

/** Keep escorts and hunters on their moving target, and send home groups that ran out of stores or weapons. */
export function refreshOrders(world: World, ctx: SimContext, f: Formation, tracked: boolean): void {
  const o = f.order;
  if (o.posture === 'reserve' && f.node !== f.home && !o.path?.length) repath(world, ctx, f, f.home);
  if (o.targetFormation && (o.posture === 'escort' || o.posture === 'attack')) {
    const t = world.formations[o.targetFormation];
    if (t?.status === 'active' && t.node !== o.target && (o.posture === 'escort' || tracked)) repath(world, ctx, f, t.node);
  }
  if (f.node !== f.home && o.posture !== 'reserve' && (f.supply.food <= 0 || (ON_STATION.has(o.posture) && outOfWeapons(ctx, f)))) {
    o.posture = 'reserve';
    repath(world, ctx, f, f.home);
  }
}

function repath(world: World, ctx: SimContext, f: Formation, goal: NodeId): void {
  const dest = navalDestination(world, ctx.map, f.nation, goal);
  const path = dest === undefined ? null : seaPath(world, ctx.map, f.nation, f.node, dest);
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

/** Attack submarines with no torpedoes or missiles left, and surface groups with their area-defence rounds spent, go home to rearm. */
function outOfWeapons(ctx: SimContext, f: Formation): boolean {
  if (f.kind === 'surface_group') return areaDefenseShare(ctx, f) < WINCHESTER;
  if (f.kind !== 'submarine') return false;
  let classes = 0, armed = 0;
  for (const pid of Object.keys(f.equipment)) {
    const p = ctx.catalog.platform(pid as PlatformId);
    if (p.class === 'ssbn') return false;
    for (const l of p.loadout) {
      classes++;
      if ((f.magazine[l.munition] ?? 0) >= 1) armed++;
    }
  }
  return classes > 0 && armed === 0;
}

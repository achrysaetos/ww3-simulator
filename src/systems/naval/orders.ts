import { newId, type SimContext } from '../../core/engine';
import type { Command, Formation, NodeId, PlatformId, World } from '../../core/types';
import { canBoard, liftShare, liftUsed } from './amphibious';
import { tickEnv } from './env';
import { navalDestination, seaPath } from './movement';
import { isNavalFormation } from './state';

type OrderCommand = Extract<Command, { type: 'order' }>;

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
  const refuse = (why: string) => ctx.emit({ type: 'message', tick: world.tick, nation: cmd.nation, text: `order to ${cmd.formation} refused: ${why}` });
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
    if (room < MIN_LANDING_TEAM * share || room <= 0) return refuse(`${lift.name} lacks lift capacity`);
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

/** Split `share` of a formation off as a landing team; the parent keeps the rest at the port. */
function detach(world: World, ctx: SimContext, f: Formation, share: number): Formation {
  const take = <K extends string>(r: Record<K, number>, round: boolean): Record<K, number> => {
    const out = {} as Record<K, number>;
    for (const [k, n] of Object.entries(r) as [K, number][]) {
      const t = round ? Math.round(n * share) : n * share;
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
    equipment: take(f.equipment, true),
    damaged: {},
    magazine: take(f.magazine, true),
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

/** Attack submarines with no torpedoes or missiles left go home to rearm. */
function outOfWeapons(ctx: SimContext, f: Formation): boolean {
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

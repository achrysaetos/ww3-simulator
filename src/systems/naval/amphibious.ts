import { atWar } from '../../core/engine';
import type { Formation, NodeId, PlatformId } from '../../core/types';
import type { TickEnv } from './env';
import { geography, seaNeighbour } from './geography';
import { type Composition, ledger, liftDemand } from './state';
import { LANDING_AIR_SUPPORT, LANDING_BASE_LOSS, LANDING_OPPOSED_LOSS, LANDING_SEA_SUPPORT } from './tables';
import type { Catalog } from '../../core/catalog';

/** Kinds that defend a beach. */
const GROUND_KINDS = new Set<Formation['kind']>(['maneuver', 'artillery', 'air_defense', 'missile', 'logistics']);

/** Share of a lift group's troop and vehicle capacity already taken. */
export function liftUsed(env: TickEnv, lift: Formation, comp: Composition): number {
  let used = 0;
  for (const e of env.embarked.get(lift.id) ?? []) used += liftShare(env.ctx.catalog, e, comp);
  return used;
}

export function liftShare(catalog: Catalog, f: Formation, comp: Composition): number {
  const d = liftDemand(f, catalog);
  const troops = comp.troopLift ? d.troops / comp.troopLift : Infinity;
  const vehicles = d.vehicles ? (comp.vehicleLift ? d.vehicles / comp.vehicleLift : Infinity) : 0;
  return Math.max(troops, vehicles);
}

/** Whether `f` stands where it can board `lift`: in the port the lift is in or the port opening onto the lift's sea zone. */
export function canBoard(env: TickEnv, f: Formation, lift: Formation): boolean {
  const zone = geography(env.ctx.map).portZone.get(f.node);
  return zone !== undefined && (lift.node === f.node || lift.node === zone);
}

/**
 * Lift groups that reached their objective put their troops ashore. At a friendly or
 * neutral port: administrative unload, no losses. Off any other coast: an opposed landing
 * whose losses grow with the defender/attacker ratio and shrink with own sea and air control.
 */
export function landings(env: TickEnv): void {
  const { world, ctx } = env;
  for (const lift of env.naval) {
    const aboard = (env.embarked.get(lift.id) ?? []).filter((e) => e.status === 'embarked');
    const target = lift.order.target;
    if (!aboard.length || target === undefined || ctx.map.isSea(target) || lift.order.path?.length) continue;
    if (lift.order.posture !== 'attack' && lift.order.posture !== 'move') continue;
    if (lift.node === target) {
      for (const f of aboard) disembark(env, f, target, 0);
      continue;
    }
    if (lift.node !== seaNeighbour(ctx.map, target)) continue;
    const support = supportAt(env, lift, target);
    const { defense, held } = beach(env, lift, target);
    let attack = held;
    for (const f of aboard) attack += combatValue(env, f);
    const r = attack > 0 ? defense / attack : 10;
    const loss = Math.min(0.95, (LANDING_BASE_LOSS + LANDING_OPPOSED_LOSS * (r / (1 + r)) * (1 - support)) * ctx.rng.range(0.8, 1.2));
    const lb = ledger(world, lift.nation);
    lb.assaultLandings++;
    lb.firstAssaultTick ??= world.tick;
    for (const f of aboard) disembark(env, f, target, loss);
    lift.order = { posture: 'patrol', issuedTick: world.tick, path: [] };
  }
}

function supportAt(env: TickEnv, lift: Formation, beach: NodeId): number {
  const { theater } = env.world;
  const sea = theater.seaControl[lift.node];
  const air = theater.airControl[beach];
  return (sea?.nation === lift.nation ? LANDING_SEA_SUPPORT * sea.level : 0) + (air?.nation === lift.nation ? LANDING_AIR_SUPPORT * air.level : 0);
}

/**
 * Hostile ground combat value on the beach cell plus half of what stands in the cells next to it,
 * and the lander's own troops already on the beach: follow-on waves land behind them (Normandy
 * after D-Day, Inchon's second day).
 */
function beach(env: TickEnv, lift: Formation, cell: NodeId): { defense: number; held: number } {
  const { world, ctx } = env;
  const near = new Map<number, number>([[cell, 1]]);
  for (const n of ctx.map.neighbors(cell)) if (!ctx.map.isSea(n)) near.set(n, 0.5);
  let defense = 0, held = 0;
  for (const f of Object.values(world.formations)) {
    const w = near.get(f.node);
    if (!w || f.status !== 'active' || !GROUND_KINDS.has(f.kind)) continue;
    if (atWar(world, f.nation, lift.nation)) defense += w * combatValue(env, f) * (1 + f.entrenchment);
    else if (f.nation === lift.nation && f.node === cell) held += combatValue(env, f);
  }
  return { defense, held };
}

/** Abstract ground combat value: summed firepower against ground target classes, scaled by readiness. */
function combatValue(env: TickEnv, f: Formation): number {
  let v = 0;
  for (const [pid, n] of Object.entries(f.equipment) as [PlatformId, number][]) {
    const fp = env.ctx.catalog.platform(pid).firepower;
    v += n * ((fp.infantry ?? 0) + (fp.armor ?? 0) + (fp.soft ?? 0));
  }
  return v * f.readiness;
}

function disembark(env: TickEnv, f: Formation, node: NodeId, loss: number): void {
  const { world, ctx } = env;
  const before = f.personnel;
  if (loss > 0) {
    for (const [pid, n] of Object.entries(f.equipment) as [PlatformId, number][]) f.equipment[pid] = n - ctx.rng.binomial(n, loss);
    f.personnel = Math.round(f.personnel * (1 - loss));
    f.morale = Math.max(0, f.morale - loss * 0.5);
  }
  const lb = ledger(world, f.nation);
  lb.troopsLanded += f.personnel;
  lb.troopsLostLanding += before - f.personnel;
  f.status = 'active';
  delete f.embarkedOn;
  f.node = node;
  f.progressKm = 0;
  f.entrenchment = 0;
  f.fatigue = Math.min(1, f.fatigue + 0.3);
  f.order = { posture: loss > 0 ? 'attack' : 'defend', target: node, issuedTick: world.tick };
  env.invalidate(f);
  if (loss > 0) ctx.emit({ type: 'message', tick: world.tick, nation: f.nation, text: `${f.name} landed at node ${node}, losing ${Math.round(loss * 100)}% in the assault` });
}

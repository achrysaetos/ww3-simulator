/**
 * Stand-in for the real SYSTEMS while they are built in parallel: just enough
 * movement, capture, strikes and diplomacy to exercise every UI path. Not a
 * model of anything; numbers here are placeholders, not calibrated.
 */
import type { Catalog } from '../core/catalog';
import { atWar, relationMut, type SimContext, type System } from '../core/engine';
import { addFormation, formationsAt } from '../core/forces';
import type { GameMap } from '../core/map';
import { findPath } from '../core/path';
import type { Formation, MunitionId, NationId, NodeId, PlatformId, World } from '../core/types';

const MOVING = new Set(['move', 'attack', 'patrol', 'blockade']);

export const demoSystem: System = {
  id: 'demo',
  commands: ['order', 'declare_war', 'offer_peace', 'set_mobilization', 'nuclear_release'],

  apply(world, cmd, ctx) {
    switch (cmd.type) {
      case 'order': {
        const f = world.formations[cmd.formation];
        if (!f || f.nation !== cmd.nation) return;
        f.order = { ...cmd.order, issuedTick: world.tick };
        f.progressKm = 0;
        if (cmd.order.target !== undefined && MOVING.has(cmd.order.posture)) f.order.path = route(ctx.map, ctx.catalog, f, cmd.order.target) ?? undefined;
        return;
      }
      case 'declare_war': {
        const r = relationMut(world, cmd.nation, cmd.target);
        if (r.atWar) return;
        Object.assign(r, { atWar: true, escalation: 'conventional', warSince: world.tick });
        world.nations[cmd.nation].status = 'war';
        world.nations[cmd.target].status = 'war';
        ctx.emit({ type: 'war_declared', tick: world.tick, by: cmd.nation, on: cmd.target, reason: cmd.reason ?? 'ultimatum rejected' });
        return;
      }
      case 'offer_peace': {
        const r = relationMut(world, cmd.nation, cmd.target);
        if (!r.atWar) return;
        Object.assign(r, { atWar: false, escalation: 'tension', warSince: undefined });
        ctx.emit({ type: 'peace', tick: world.tick, a: cmd.nation, b: cmd.target, terms: 'ceasefire on current lines' });
        return;
      }
      case 'set_mobilization':
        world.nations[cmd.nation].mobilization = Math.max(0, Math.min(1, cmd.level));
        return;
      case 'nuclear_release': {
        const n = world.nations[cmd.nation];
        const warheads = Math.min(cmd.warheads, n.nuclear.deployed);
        if (warheads <= 0) return;
        n.nuclear.deployed -= warheads;
        n.nuclear.warheads -= warheads;
        const yieldKt = (ctx.catalog.munitions.get(cmd.munition)?.yieldKt ?? 100) * warheads;
        for (const m of ctx.map.nodesWithin(cmd.target, 120)) {
          world.theater.infrastructure[m] *= 0.1;
          world.theater.fallout[m] = Math.min(1, (world.theater.fallout[m] ?? 0) + 0.8);
        }
        for (const f of formationsAt(world, cmd.target)) f.status = 'destroyed';
        ctx.emit({ type: 'nuclear_detonation', tick: world.tick, by: cmd.nation, node: cmd.target, yieldKt, casualties: Math.round(yieldKt * 2_000) });
        return;
      }
    }
  },

  step(world, ctx) {
    world.theater.airControl = {};
    for (const f of Object.values(world.formations)) {
      if (f.status !== 'active') continue;
      if (MOVING.has(f.order.posture)) advance(world, ctx, f);
      if (f.order.posture === 'strike' && f.order.target !== undefined) strike(world, ctx, f, f.order.target);
      if (f.kind === 'air_wing' && (f.order.posture === 'air_superiority' || f.order.posture === 'patrol' || f.order.posture === 'defend')) {
        for (const m of ctx.map.nodesWithin(f.order.target ?? f.node, 350)) world.theater.airControl[m] = { nation: f.nation, level: 0.75 };
      }
    }
    for (const [k, v] of Object.entries(world.theater.fallout)) world.theater.fallout[+k] = v * 0.97;
  },
};

/** Mechanized infantry rides its vehicles, so the column moves at its vehicles' pace. */
function speedKph(catalog: Catalog, f: Formation): number {
  let s = 0;
  for (const pid of Object.keys(f.equipment)) s = Math.max(s, catalog.platform(pid as PlatformId).mobility.speedKph);
  return s;
}

function route(map: GameMap, catalog: Catalog, f: Formation, to: NodeId): NodeId[] | null {
  const domain = catalog.platform(Object.keys(f.equipment)[0] as PlatformId).domain;
  if (domain === 'air' || domain === 'space') return [to];
  const naval = domain === 'sea' || domain === 'subsurface';
  return findPath(map, f.node, to, (_a, b, km) => (naval ? (map.isSea(b) || b === to ? km : Infinity) : map.isSea(b) ? Infinity : km));
}

function advance(world: World, ctx: SimContext, f: Formation): void {
  const path = f.order.path;
  if (!path?.length) return;
  // Road-march pace over a 6 h tick: units halt, refuel and deconflict, so a third of top speed.
  f.progressKm += speedKph(ctx.catalog, f) * world.dtHours * 0.33;
  while (path.length && f.progressKm >= ctx.map.distanceKm(f.node, path[0])) {
    const next = path[0];
    const defenders = formationsAt(world, next).filter((d) => atWar(world, f.nation, d.nation));
    if (defenders.length && !battle(world, ctx, f, defenders, next)) return;
    f.progressKm -= ctx.map.distanceKm(f.node, next);
    f.node = next;
    path.shift();
    const holder = world.control[next];
    if (!ctx.map.isSea(next) && holder !== f.nation && atWar(world, f.nation, holder)) {
      world.control[next] = f.nation;
      ctx.emit({ type: 'node_captured', tick: world.tick, node: next, from: holder, to: f.nation });
    }
  }
  if (!path.length) f.progressKm = 0;
}

function battle(world: World, ctx: SimContext, attacker: Formation, defenders: Formation[], node: NodeId): boolean {
  const all = [attacker, ...defenders];
  const losses: Record<NationId, Record<PlatformId, number>> = {};
  const casualties: Record<NationId, number> = {};
  for (const f of all) {
    const rate = ctx.rng.range(0.01, 0.05);
    for (const [pid, n] of Object.entries(f.equipment) as [PlatformId, number][]) {
      const lost = Math.min(n, Math.round(n * rate));
      if (!lost) continue;
      f.equipment[pid] = n - lost;
      (losses[f.nation] ??= {})[pid] = ((losses[f.nation] ??= {})[pid] ?? 0) + lost;
    }
    const dead = Math.round(f.personnel * rate * 0.3);
    f.personnel -= dead;
    casualties[f.nation] = (casualties[f.nation] ?? 0) + dead;
  }
  const won = ctx.rng.chance(0.45);
  ctx.emit({ type: 'battle', tick: world.tick, node, attacker: attacker.nation, defender: defenders[0].nation, losses, casualties, winner: won ? attacker.nation : defenders[0].nation });
  if (won) for (const d of defenders) d.status = 'routed';
  return won;
}

function strike(world: World, ctx: SimContext, f: Formation, target: NodeId): void {
  const munition = (Object.keys(f.magazine) as MunitionId[]).find((m) => f.magazine[m] > 0 && /cruise|srbm/.test(ctx.catalog.munition(m).kind));
  if (!munition) return;
  const fired = Math.min(4, f.magazine[munition]);
  f.magazine[munition] -= fired;
  const intercepted = ctx.rng.int(0, fired);
  world.theater.infrastructure[target] *= 0.85 ** (fired - intercepted);
  ctx.emit({ type: 'strike', tick: world.tick, by: f.nation, munition, fired, intercepted, target, damage: `${fired - intercepted} hits on infrastructure` });
}

/** Opening positions on the NATO eastern flank and in the Pacific, using the testkit catalog. */
export function seedDemoForces(world: World, map: GameMap, catalog: Catalog): void {
  const P = (s: string) => s as PlatformId;
  const add = (nation: string, name: string, kind: Formation['kind'], echelon: Formation['echelon'], lat: number, lon: number, equipment: Record<string, number>) =>
    addFormation(world, catalog, { nation: nation as NationId, name, kind, echelon, node: map.nodeAt(lat, lon), equipment: equipment as Record<PlatformId, number> });
  const armor = { [P('t_mbt')]: 90, [P('t_ifv')]: 60, [P('t_inf')]: 80 };
  const mech = { [P('t_mbt')]: 30, [P('t_ifv')]: 120, [P('t_inf')]: 120 };
  add('POL', '18th Mechanized Division', 'maneuver', 'division', 52.2, 21.0, mech);
  add('POL', '16th Mechanized Division', 'maneuver', 'division', 53.8, 20.5, mech);
  add('USA', '3rd ABCT, 1st Cavalry', 'maneuver', 'brigade', 50.0, 22.0, armor);
  add('USA', '41st Field Artillery Brigade', 'artillery', 'brigade', 50.5, 19.5, { [P('t_spg')]: 54 });
  add('USA', '52nd Fighter Wing', 'air_wing', 'wing', 49.4, 7.6, { [P('t_fighter')]: 48 });
  add('USA', '31st Fighter Wing', 'air_wing', 'wing', 46.0, 12.6, { [P('t_fighter')]: 42 });
  add('USA', 'Carrier Strike Group 8', 'surface_group', 'task_group', 56.0, 3.0, { [P('t_destroyer')]: 5 });
  add('USA', '90th Missile Wing', 'strategic', 'wing', 41.1, -104.8, { [P('t_icbm')]: 150 });
  add('GBR', '3rd (UK) Division', 'maneuver', 'division', 52.4, -1.5, armor);
  add('RUS', '1st Guards Tank Army', 'maneuver', 'army', 54.8, 32.0, armor);
  add('RUS', '20th Combined Arms Army', 'maneuver', 'army', 51.0, 36.5, mech);
  add('RUS', '11th Army Corps', 'maneuver', 'corps', 54.7, 20.5, mech);
  add('RUS', '152nd Missile Brigade', 'missile', 'brigade', 54.9, 21.5, { [P('t_tel')]: 12 });
  add('RUS', '1544th AA Missile Regiment', 'air_defense', 'brigade', 55.7, 37.6, { [P('t_sam_bn')]: 16 });
  add('RUS', 'Northern Fleet SSN group', 'submarine', 'flotilla', 71.0, 34.0, { [P('t_ssn')]: 4 });
  add('RUS', '28th Missile Division', 'strategic', 'division', 58.0, 49.6, { [P('t_icbm')]: 30 });
  add('BLR', '6th Mechanized Brigade', 'maneuver', 'brigade', 53.7, 23.8, mech);
  add('BLR', '120th Mechanized Brigade', 'maneuver', 'brigade', 53.9, 27.6, mech);
  add('CHN', 'Eastern Theater Rocket Force', 'missile', 'brigade', 26.0, 118.5, { [P('t_tel')]: 24 });
  add('CHN', '72nd Group Army', 'maneuver', 'corps', 30.0, 120.0, mech);
  add('CHN', 'East Sea Fleet destroyer flotilla', 'surface_group', 'flotilla', 28.5, 124.0, { [P('t_destroyer')]: 6 });
  add('TWN', '6th Army Corps', 'maneuver', 'corps', 24.8, 121.2, mech);
}

import type { SimContext } from '../../core/engine';
import { platformCount } from '../../core/forces';
import type { Formation, MunitionId, NationId, NodeId, PlatformId, World } from '../../core/types';
import { deliveryReachKm } from './nuclear';
import { POINT_TARGET } from './tables';

export type TargetMode = 'counterforce' | 'countervalue';
export type TargetKind = 'silo_field' | 'strategic' | 'command' | 'airbase' | 'port' | 'city';

export interface Target {
  node: NodeId;
  kind: TargetKind;
  /** Within a kind: warheads/launchers for forces, aircraft for airbases, ships for ports, people for cities. */
  value: number;
}

/** Counterforce priority: the enemy's nuclear forces first, then national command, then the means to deliver and reload. */
const PRIORITY: Record<TargetKind, number> = { silo_field: 0, strategic: 1, command: 2, airbase: 3, port: 4, city: 5 };

function counterforceKind(f: Formation, ctx: Pick<SimContext, 'catalog'>): TargetKind | undefined {
  if (f.kind === 'strategic') return Object.keys(f.equipment).some((pid) => POINT_TARGET.has(ctx.catalog.platform(pid as PlatformId).class)) ? 'silo_field' : 'strategic';
  if (f.kind === 'air_wing') return 'airbase';
  if (f.kind === 'submarine' || f.kind === 'surface_group') return 'port';
  return undefined;
}

/**
 * Nodes worth a warhead in `defender`, best first, limited to what `attacker` can reach with the nuclear munitions
 * in its magazines. Counterforce: nuclear forces, the capital (national command), air bases, and ships in port.
 * Countervalue: cities by population.
 */
export function targetList(world: World, ctx: Pick<SimContext, 'map' | 'catalog'>, attacker: NationId, defender: NationId, mode: TargetMode): Target[] {
  const reach: { node: NodeId; km: number }[] = [];
  for (const f of Object.values(world.formations)) {
    if (f.nation !== attacker || f.status === 'destroyed') continue;
    for (const [mid, n] of Object.entries(f.magazine) as [MunitionId, number][]) {
      const m = ctx.catalog.munition(mid);
      if (n > 0 && m.yieldKt) reach.push({ node: f.node, km: deliveryReachKm(ctx.catalog, f, m) });
    }
  }
  const reachable = (node: NodeId) => reach.some((r) => ctx.map.distanceKm(r.node, node) <= r.km);
  const byNode = new Map<number, Target>();
  const add = (node: NodeId, kind: TargetKind, value: number) => {
    const t = byNode.get(node);
    if (!t) byNode.set(node, { node, kind, value });
    else {
      if (PRIORITY[kind] < PRIORITY[t.kind]) t.kind = kind;
      t.value += value;
    }
  };

  if (mode === 'counterforce') {
    for (const f of Object.values(world.formations)) {
      if (f.nation !== defender || f.status === 'destroyed' || ctx.map.isSea(f.node)) continue;
      const kind = counterforceKind(f, ctx);
      if (kind) add(f.node, kind, platformCount(f));
    }
    const capital = world.nations[defender]?.capital;
    if (capital !== undefined && world.control[capital] === defender) add(capital, 'command', 1);
  } else {
    for (const c of ctx.map.cities) if (c.nation === defender && world.control[c.node] === defender) add(c.node, 'city', c.pop);
  }
  return [...byNode.values()].filter((t) => reachable(t.node)).sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || b.value - a.value || a.node - b.node);
}

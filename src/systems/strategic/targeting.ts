import type { SimContext } from '../../core/engine';
import { platformCount } from '../../core/forces';
import type { Catalog } from '../../core/catalog';
import type { GameMap } from '../../core/map';
import type { Formation, MunitionId, NationId, NodeId, PlatformId, World } from '../../core/types';
import { deliveryReachKm, isLive } from './nuclear';
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

/** One kind of nuclear warhead on one live launcher, and how far that launcher delivers it. */
export interface NuclearLauncher {
  node: NodeId;
  munition: MunitionId;
  yieldKt: number;
  reachKm: number;
}

/** Every nuclear warhead `nation` holds on a live launcher, the pool `release` draws from. */
export function nuclearLaunchers(world: World, catalog: Catalog, nation: NationId): NuclearLauncher[] {
  const out: NuclearLauncher[] = [];
  for (const f of Object.values(world.formations)) {
    if (f.nation !== nation || !isLive(f)) continue;
    for (const [mid, n] of Object.entries(f.magazine) as [MunitionId, number][]) {
      const m = catalog.munition(mid);
      if (n > 0 && m.yieldKt) out.push({ node: f.node, munition: mid, yieldKt: m.yieldKt, reachKm: deliveryReachKm(catalog, f, m) });
    }
  }
  return out;
}

/** The smallest- or largest-yield warhead some launcher can put on `target`; undefined when none reaches it. */
export function weaponFor(launchers: readonly NuclearLauncher[], map: GameMap, target: NodeId, prefer: 'smallest' | 'largest'): MunitionId | undefined {
  let best: NuclearLauncher | undefined;
  for (const l of launchers) {
    if (best && (prefer === 'smallest' ? l.yieldKt >= best.yieldKt : l.yieldKt <= best.yieldKt)) continue;
    if (map.distanceKm(l.node, target) <= l.reachKm) best = l;
  }
  return best?.munition;
}

/**
 * Nodes worth a warhead in `defender`, best first, limited to what `attacker` can reach with the nuclear munitions
 * in its magazines. Counterforce: nuclear forces, the capital (national command), air bases, and ships in port.
 * Countervalue: cities by population.
 */
export function targetList(world: World, ctx: Pick<SimContext, 'map' | 'catalog'>, attacker: NationId, defender: NationId, mode: TargetMode): Target[] {
  const launchers = nuclearLaunchers(world, ctx.catalog, attacker);
  const reachable = (node: NodeId) => weaponFor(launchers, ctx.map, node, 'smallest') !== undefined;
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

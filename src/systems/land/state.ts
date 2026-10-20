import { atWar, relation, type SimContext } from '../../core/engine';
import type { GameMap } from '../../core/map';
import type { Formation, FormationId, NationId, NodeId, World } from '../../core/types';
import { ALLIED_OPINION, LAND_KINDS } from './tables';

export interface LandState {
  /** Platform count when the formation entered its current engagement; the retreat breakpoint is measured from it. */
  baseline: Record<FormationId, number>;
  /** Days a formation has been cut off from friendly supply. Logistics should withhold refills while present. */
  isolatedDays: Record<FormationId, number>;
}

declare module '../../core/types' {
  interface Slices {
    land: LandState;
  }
}

export function landSlice(world: World): LandState {
  return (world.slices.land ??= { baseline: {}, isolatedDays: {} });
}

export function isLandFormation(f: Formation, map: GameMap): boolean {
  return LAND_KINDS.has(f.kind) && (f.status === 'active' || f.status === 'routed') && f.node < map.landCount;
}

export function allied(world: World, a: NationId, b: NationId): boolean {
  if (a === b) return true;
  if (atWar(world, a, b)) return false;
  const na = world.nations[a], nb = world.nations[b];
  if (na && nb && na.blocs.some((x) => nb.blocs.includes(x))) return true;
  return relation(world, a, b).opinion > ALLIED_OPINION;
}

/** Land a nation's troops may enter: its own, allies', enemies' (by force), or unclaimed. Neutrals' land is closed. */
export function canEnter(world: World, map: GameMap, nation: NationId, node: NodeId): boolean {
  if (map.isSea(node)) return false;
  const holder = world.control[node];
  return !holder || allied(world, nation, holder) || atWar(world, nation, holder);
}

/** Land formations per node, built once per step so per-node lookups are O(1). */
export function indexByNode(world: World, map: GameMap): Map<number, Formation[]> {
  const byNode = new Map<number, Formation[]>();
  for (const f of Object.values(world.formations)) {
    if (!isLandFormation(f, map)) continue;
    const list = byNode.get(f.node);
    if (list) list.push(f);
    else byNode.set(f.node, [f]);
  }
  return byNode;
}

export function destroyFormation(world: World, ctx: SimContext, f: Formation): void {
  f.status = 'destroyed';
  const slice = landSlice(world);
  delete slice.baseline[f.id];
  delete slice.isolatedDays[f.id];
  ctx.emit({ type: 'formation_destroyed', tick: world.tick, formation: f.id, nation: f.nation });
}

export function hostilesAt(world: World, byNode: Map<number, Formation[]>, node: number, nation: NationId): Formation[] {
  return (byNode.get(node) ?? []).filter((g) => atWar(world, nation, g.nation));
}

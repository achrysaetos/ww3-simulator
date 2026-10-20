import type { SimContext } from '../../core/engine';
import type { GameMap } from '../../core/map';
import type { Formation, NationId, NodeId, World } from '../../core/types';
import { cyberCapability } from './tables';

/**
 * Every nation at war runs a standing cyber campaign against each enemy. Per tick an attack lands with probability
 * 0.3 x attacker capability x (1 - half the defender's). A landed attack either cuts infrastructure in one populated
 * cell by up to 10% (grid, rail signalling, ports; the 2015-16 Ukrainian grid attacks cut power to ~225k customers
 * for hours) or erodes readiness of up to three formations (C2 disruption, as with the Viasat KA-SAT hack of
 * 24 Feb 2022). Deliberately modest: no cyber operation to date has had decisive military effect. Estimates.
 */
const LAND_PROBABILITY = 0.3;
const INFRA_HIT = 0.1;
const READINESS_HIT = 0.03;
const C2_TARGETS = 3;

const populated = new WeakMap<GameMap, Map<NationId, { nodes: NodeId[]; cum: number[] }>>();

function populatedNodes(map: GameMap, nation: NationId) {
  let byNation = populated.get(map);
  if (!byNation) {
    byNation = new Map();
    for (let n = 0; n < map.landCount; n++) {
      if (map.popShare[n] <= 0) continue;
      const e = byNation.get(map.owner[n]) ?? { nodes: [], cum: [] };
      e.nodes.push(n as NodeId);
      e.cum.push((e.cum.at(-1) ?? 0) + map.popShare[n]);
      byNation.set(map.owner[n], e);
    }
    populated.set(map, byNation);
  }
  return byNation.get(nation);
}

export function stepCyber(world: World, ctx: SimContext, byNation: Map<NationId, Formation[]>): void {
  for (const [key, rel] of Object.entries(world.relations)) {
    if (!rel.atWar) continue;
    const [a, b] = key.split('|') as NationId[];
    attack(world, ctx, a, b, byNation);
    attack(world, ctx, b, a, byNation);
  }
}

function attack(world: World, ctx: SimContext, by: NationId, on: NationId, byNation: Map<NationId, Formation[]>): void {
  const atk = cyberCapability(by);
  if (!ctx.rng.chance(LAND_PROBABILITY * atk * (1 - 0.5 * cyberCapability(on)))) return;
  const forces = byNation.get(on) ?? [];
  if (ctx.rng.chance(0.6) || forces.length === 0) {
    const cells = populatedNodes(ctx.map, on);
    if (!cells) return;
    const x = ctx.rng.next() * cells.cum[cells.cum.length - 1];
    const node = cells.nodes[Math.max(0, cells.cum.findIndex((c) => c >= x))];
    if (world.control[node] === on) world.theater.infrastructure[node] *= 1 - INFRA_HIT * atk;
    return;
  }
  for (let i = 0; i < C2_TARGETS; i++) {
    const f = ctx.rng.pick(forces);
    f.readiness = Math.max(0, f.readiness - READINESS_HIT * atk);
  }
}

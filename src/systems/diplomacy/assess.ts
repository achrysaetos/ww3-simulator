import type { GameMap } from '../../core/map';
import { hostility, relationKey } from '../../core/engine';
import type { NationId, NodeId, World } from '../../core/types';
import type { Assessment } from './types';

/** Who is at war with whom: a copy of the tick's hostility index, so a caller may keep it past a declaration. */
export function enemyMap(world: World): Map<NationId, Set<NationId>> {
  const out = new Map<NationId, Set<NationId>>();
  for (const [n, foes] of hostility(world).foes) out.set(n, new Set(foes));
  return out;
}

const homelandCells = new WeakMap<GameMap, Map<NationId, number>>();

function cellsPerNation(map: GameMap): Map<NationId, number> {
  let m = homelandCells.get(map);
  if (!m) {
    m = new Map();
    for (let n = 0; n < map.landCount; n++) m.set(map.owner[n], (m.get(map.owner[n]) ?? 0) + 1);
    homelandCells.set(map, m);
  }
  return m;
}

/** Enemy control or ground forces this close to a capital threaten it: two cells of the one-degree map the rule was set on. */
const CAPITAL_THREAT_KM = 200;
const nearCells = new WeakMap<GameMap, Map<NodeId, NodeId[]>>();

/** Land cells within CAPITAL_THREAT_KM of a capital, the same reach on fine cells as on coarse ones. */
function nearCapital(map: GameMap, cap: NodeId): NodeId[] {
  let m = nearCells.get(map);
  if (!m) nearCells.set(map, (m = new Map()));
  let out = m.get(cap);
  if (!out) m.set(cap, (out = map.nodesWithin(cap, CAPITAL_THREAT_KM).filter((n) => n < map.landCount)));
  return out;
}

const landBorders = new WeakMap<GameMap, Map<NationId, Set<NationId>>>();

/** Nations sharing a land border with each nation, from cell adjacency. */
export function neighbours(map: GameMap, n: NationId): ReadonlySet<NationId> {
  let m = landBorders.get(map);
  if (!m) {
    m = new Map();
    for (let a = 0; a < map.landCount; a++)
      for (let k = map.adjStart[a]; k < map.adjStart[a + 1]; k++) {
        const b = map.adj[k];
        if (b >= map.landCount || map.owner[a] === map.owner[b]) continue;
        (m.get(map.owner[a]) ?? m.set(map.owner[a], new Set()).get(map.owner[a])!).add(map.owner[b]);
      }
    landBorders.set(map, m);
  }
  return m.get(n) ?? new Set();
}

export interface Situation {
  nations: Record<NationId, Assessment>;
  /** Homeland population share each warring dyad holds of the other's, summed over both directions, per relationKey. */
  lostTo: Map<string, number>;
  /** An enemy holding part of each invaded nation's homeland. */
  invadedBy: Map<NationId, NationId>;
}

/**
 * Territorial situation of every nation that has lost ground or is at war:
 * one pass over land cells, plus a check of the land within CAPITAL_THREAT_KM of each capital at war.
 */
export function assess(world: World, map: GameMap, enemies: Map<NationId, Set<NationId>>): Situation {
  const out: Record<NationId, Assessment> = {};
  const lostTo = new Map<string, number>();
  const invadedBy = new Map<NationId, NationId>();
  const get = (n: NationId) => (out[n] ??= { areaLost: 0, popLost: 0, capitalLost: false, capitalThreatened: false });
  for (let n = 0; n < map.landCount; n++) {
    const owner = map.owner[n];
    if (world.control[n] === owner) continue;
    const a = get(owner);
    a.areaLost++;
    a.popLost += map.popShare[n];
    const holder = world.control[n];
    if (enemies.get(owner)?.has(holder)) {
      const k = relationKey(owner, holder);
      lostTo.set(k, (lostTo.get(k) ?? 0) + map.popShare[n]);
      invadedBy.set(owner, holder);
    }
  }
  const cells = cellsPerNation(map);
  for (const [n, a] of Object.entries(out) as [NationId, Assessment][]) a.areaLost /= cells.get(n) ?? 1;

  if (!enemies.size) return { nations: out, lostTo, invadedBy };
  const groundAt = new Map<number, NationId[]>();
  for (const f of Object.values(world.formations)) {
    if (f.status !== 'active' || (f.kind !== 'maneuver' && f.kind !== 'artillery')) continue;
    (groundAt.get(f.node) ?? groundAt.set(f.node, []).get(f.node)!).push(f.nation);
  }
  for (const [n, foes] of enemies) {
    const nation = world.nations[n];
    if (!nation) continue;
    const a = get(n);
    const cap = nation.capital;
    a.capitalLost = world.control[cap] !== n;
    const hostile = (node: number) => foes.has(world.control[node]) || (groundAt.get(node)?.some((g) => foes.has(g)) ?? false);
    a.capitalThreatened = a.capitalLost || nearCapital(map, cap).some(hostile);
  }
  return { nations: out, lostTo, invadedBy };
}

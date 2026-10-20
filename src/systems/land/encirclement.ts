import type { SimContext } from '../../core/engine';
import type { GameMap } from '../../core/map';
import type { Formation, NationId, World } from '../../core/types';
import { allied, destroyFormation, isLandFormation, landSlice } from './state';
import { MORALE_ISOLATED_PER_DAY, SURRENDER_GRACE_DAYS, SURRENDER_HAZARD_PER_DAY } from './tables';

/**
 * Land nodes from which `nation` can draw supply: everything connected through
 * friendly-held land to a friendly capital (national depots) or a friendly-held
 * port (sea lift).
 */
export function suppliedNodes(world: World, map: GameMap, nation: NationId): Uint8Array {
  return floodFromSources(world, map, friendsOf(world, nation));
}

function friendsOf(world: World, nation: NationId): Set<NationId> {
  const friends = new Set<NationId>();
  for (const id of Object.keys(world.nations) as NationId[]) if (allied(world, nation, id)) friends.add(id);
  return friends;
}

function floodFromSources(world: World, map: GameMap, friends: Set<NationId>): Uint8Array {
  const seen = new Uint8Array(map.landCount);
  const queue: number[] = [];
  const capitals = new Set<number>();
  for (const id of friends) capitals.add(world.nations[id].capital);
  for (let n = 0; n < map.landCount; n++)
    if (friends.has(world.control[n]) && (map.ports[n] > 0 || capitals.has(n))) {
      seen[n] = 1;
      queue.push(n);
    }
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i];
    for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
      const m = map.adj[k];
      if (m >= map.landCount || seen[m] || !friends.has(world.control[m])) continue;
      seen[m] = 1;
      queue.push(m);
    }
  }
  return seen;
}

/** Daily: mark formations cut off from supply, sap their morale, and let long-isolated pockets surrender. */
export function updateEncirclement(world: World, ctx: SimContext): void {
  const ticksPerDay = Math.max(1, Math.round(24 / world.dtHours));
  if (world.tick % ticksPerDay) return;
  const days = (ticksPerDay * world.dtHours) / 24;
  const isolated = landSlice(world).isolatedDays;

  const byNation = new Map<NationId, Formation[]>();
  for (const f of Object.values(world.formations)) {
    if (!isLandFormation(f, ctx.map)) continue;
    const list = byNation.get(f.nation);
    if (list) list.push(f);
    else byNation.set(f.nation, [f]);
  }
  const belligerents = new Set<string>();
  for (const [k, r] of Object.entries(world.relations)) if (r.atWar) for (const n of k.split('|')) belligerents.add(n);
  // Coalition partners share one supply network; flood it once per distinct friend set.
  const networks = new Map<string, Uint8Array>();
  for (const [nation, formations] of byNation) {
    if (!belligerents.has(nation)) {
      for (const f of formations) delete isolated[f.id];
      continue;
    }
    const friends = friendsOf(world, nation);
    const key = [...friends].sort().join(',');
    let supplied = networks.get(key);
    if (!supplied) networks.set(key, (supplied = floodFromSources(world, ctx.map, friends)));
    for (const f of formations) {
      if (supplied[f.node]) {
        delete isolated[f.id];
        continue;
      }
      const d = (isolated[f.id] = (isolated[f.id] ?? 0) + days);
      f.morale = Math.max(0, f.morale - MORALE_ISOLATED_PER_DAY * days);
      const starving = f.supply.food <= 0 ? 2 : 1;
      if (ctx.rng.chance(SURRENDER_HAZARD_PER_DAY * Math.max(0, d - SURRENDER_GRACE_DAYS) * (1 - f.morale) * starving * days)) {
        ctx.emit({ type: 'message', tick: world.tick, nation: f.nation, text: `${f.name} surrendered after ${Math.round(d)} days encircled` });
        destroyFormation(world, ctx, f);
      }
    }
  }
}

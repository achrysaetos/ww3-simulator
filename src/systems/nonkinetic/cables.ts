import type { GameMap } from '../../core/map';
import type { NationId, NodeId, World } from '../../core/types';
import { CABLE_BY_ID, CABLES, type Cable } from '../../data/geo/cables';
import type { NonKineticState } from './state';
import { CABLE_REPAIR_MONTHS } from './tables';

/** Repair ships per region: how many cuts a region can mend at once before the rest queue. */
const SHIPS_PER_REGION = 1;

const landingCache = new WeakMap<GameMap, Map<string, NodeId[]>>();
function landingNodes(map: GameMap, cable: Cable): NodeId[] {
  let byCable = landingCache.get(map);
  if (!byCable) landingCache.set(map, (byCable = new Map()));
  let nodes = byCable.get(cable.id);
  if (!nodes) byCable.set(cable.id, (nodes = cable.landings.map((l) => map.nodeAt(l.lat, l.lon))));
  return nodes;
}

/**
 * Cut a cable. Returns false if it does not exist or is already cut. A power or gas cut drops
 * infrastructure once at its landing cells (like a strike), so the economy and C2 read it until
 * repair; a data cut takes external connectivity the economy reads through dataConnectivityLost.
 */
export function cutCable(world: World, map: GameMap, s: NonKineticState, by: NationId | undefined, cableId: string): boolean {
  const cable = CABLE_BY_ID.get(cableId);
  if (!cable || s.cables[cableId]) return false;
  s.cables[cableId] = { cutTick: world.tick, ...(by ? { by } : {}) };
  (s.repairQueue[cable.region] ??= []).push(cableId);
  if (cable.kind !== 'data')
    for (const [nation, share] of Object.entries(cable.serves) as [NationId, number][])
      for (const node of landingNodes(map, cable))
        if (map.owner[node] === nation && world.control[node] === nation) world.theater.infrastructure[node] *= 1 - share * 0.5;
  return true;
}

/** Advance repairs: a region mends up to SHIPS_PER_REGION cables at once; each takes CABLE_REPAIR_MONTHS. */
export function stepRepairs(world: World, s: NonKineticState): void {
  for (const region of Object.keys(s.repairQueue)) {
    const queue = s.repairQueue[region];
    for (let i = 0; i < Math.min(SHIPS_PER_REGION, queue.length); i++) {
      const id = queue[i];
      const st = s.cables[id];
      if (!st) { queue.splice(i, 1); i--; continue; }
      st.repairDoneTick ??= world.tick + Math.ceil((CABLE_REPAIR_MONTHS() * 730) / world.dtHours);
      if (world.tick >= st.repairDoneTick) {
        delete s.cables[id];
        queue.splice(i, 1);
        i--;
      }
    }
    if (queue.length === 0) delete s.repairQueue[region];
  }
}

/** Share of a nation's external data connectivity cut by severed data cables, 0..1. */
export function dataConnectivityLost(s: NonKineticState, nation: NationId): number {
  let intact = 1;
  for (const id of Object.keys(s.cables)) {
    const cable = CABLE_BY_ID.get(id);
    if (cable?.kind !== 'data') continue;
    const share = cable.serves[nation];
    if (share) intact *= 1 - share;
  }
  return 1 - intact;
}

export { CABLES };

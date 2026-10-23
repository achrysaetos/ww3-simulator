import { haversineKm, type GameMap } from '../../core/map';
import type { NodeId } from '../../core/types';

/**
 * Where a closer view should look, given the fighting the player knows of: null to stay put,
 * when some of it is within `reachKm` of `at` or none is known; otherwise the nearest of it.
 */
export function fightToShow(map: GameMap, fights: Iterable<NodeId>, at: { lon: number; lat: number }, reachKm: number): NodeId | null {
  let best: NodeId | null = null, bestKm = Infinity;
  for (const n of fights) {
    const km = haversineKm(at.lat, at.lon, map.lat[n], map.lon[n]);
    if (km <= reachKm) return null;
    if (km < bestKm) [best, bestKm] = [n, km];
  }
  return best;
}

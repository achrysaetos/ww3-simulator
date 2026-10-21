import type { GameMap } from '../core/map';
import type { NodeId } from '../core/types';

/**
 * Land a state holds outside its metropolitan homeland: unincorporated
 * territories, overseas departments and dependencies. A belligerent treats bases
 * there as part of the theatre, not as the enemy's homeland: PLARF planning has
 * DF-26s on Guam in the opening days of a Taiwan war (DoD China Military Power
 * Report 2023; CSIS "The First Battle of the Next War", 2023), while strikes on
 * the continental US wait on a wider escalation. US states (Alaska, Hawaii) and
 * integral regions (Corsica, the Canaries, Okinawa, Kaliningrad) are homeland.
 * Boxes are [south, north, west, east] in degrees and match cell centres.
 */
interface Territory {
  owner: string;
  name: string;
  box: [number, number, number, number];
}

const TERRITORIES: Territory[] = [
  { owner: 'USA', name: 'Guam and the Northern Mariana Islands', box: [12, 21, 144, 147] },
  { owner: 'USA', name: 'Puerto Rico and the US Virgin Islands', box: [17, 19, -68, -64] },
  { owner: 'USA', name: 'American Samoa', box: [-15, -10, -172, -168] },
  { owner: 'FRA', name: 'French Antilles', box: [14, 19, -64, -60] },
  { owner: 'FRA', name: 'French Guiana', box: [1, 6, -55, -51] },
  { owner: 'FRA', name: 'Reunion and Mayotte', box: [-22, -12, 44, 57] },
  { owner: 'FRA', name: 'New Caledonia', box: [-23, -19, 163, 169] },
  { owner: 'FRA', name: 'French Polynesia', box: [-28, -7, -155, -134] },
  { owner: 'FRA', name: 'French Southern Lands', box: [-50, -46, 68, 71] },
  { owner: 'GBR', name: 'British Caribbean territories', box: [17, 23, -82, -60] },
  { owner: 'GBR', name: 'Falklands and South Georgia', box: [-56, -50, -62, -34] },
  { owner: 'NLD', name: 'Dutch Caribbean', box: [11, 19, -71, -62] },
  { owner: 'AUS', name: 'Heard Island', box: [-56, -52, 72, 76] },
];

const cache = new WeakMap<GameMap, Uint8Array>();

/** Whether land cell `node` lies in one of its owner's overseas territories rather than its homeland. */
export function isOverseas(map: GameMap, node: NodeId): boolean {
  let flags = cache.get(map);
  if (!flags) {
    flags = new Uint8Array(map.landCount);
    for (let n = 0; n < map.landCount; n++) {
      const lat = map.lat[n], lon = map.lon[n];
      flags[n] = TERRITORIES.some((t) => t.owner === map.owner[n] && lat >= t.box[0] && lat <= t.box[1] && lon >= t.box[2] && lon <= t.box[3]) ? 1 : 0;
    }
    cache.set(map, flags);
  }
  return node < map.landCount && flags[node] === 1;
}

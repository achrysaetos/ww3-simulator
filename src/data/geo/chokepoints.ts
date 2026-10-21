import type { GameMap } from '../../core/map';
import type { NodeId } from '../../core/types';

/** What a chokepoint is built as, which sets how many hits close it and how long it takes to rebuild. */
export type ChokepointKind = 'bridge' | 'tunnel' | 'causeway' | 'isthmus';

/**
 * A single crossing that land supply cannot go around cheaply: a bridge, tunnel or causeway across
 * water, or an isthmus. It closes the land edges between the cells it joins.
 */
export interface Chokepoint {
  id: string;
  name: string;
  kind: ChokepointKind;
  /** Land edges it carries, each a pair of adjacent cells. */
  edges: [NodeId, NodeId][];
  /** Hits of a 450 kg-class warhead that close it from intact. */
  hitsToClose: number;
  /** Days to rebuild from closed to intact. */
  repairDays: number;
}

interface Rating {
  hitsToClose: number;
  repairDays: number;
}

/**
 * Vulnerability and repair by kind. Estimates from the 2022-23 strikes on Crimea's links and older
 * bridge campaigns:
 * - Bridge: the 1944 Seine and Loire bridges fell to a few direct hits each; the Chonhar road bridge
 *   took two to three Storm Shadow hits in June 2023 and reopened about three weeks later; the
 *   Antonivka bridge at Kherson was closed to heavy traffic by repeated GMLRS hits in July 2022.
 * - Tunnel: only the portals and shafts are exposed, so cutting one takes far more hits and longer
 *   repair (judgment).
 * - Causeway: an embankment is filled back in faster than a span is rebuilt (judgment).
 * - Isthmus: a strip of land with a road and railway, cratered rather than dropped (judgment).
 */
// param: tag=estimated range=[2,12] source=Chonhar June 2023; GWAPS bridge campaign 1991; judgment
const RATING: Record<ChokepointKind, Rating> = {
  bridge: { hitsToClose: 4, repairDays: 45 },
  tunnel: { hitsToClose: 12, repairDays: 60 },
  causeway: { hitsToClose: 4, repairDays: 30 },
  isthmus: { hitsToClose: 10, repairDays: 10 },
};

interface Extra {
  id: string;
  name: string;
  kind: ChokepointKind;
  /** Cell centres (lat, lon) of each joined pair. */
  pairs: [[number, number], [number, number]][];
  rating?: Rating;
}

/** Fixed links the map already joins across water, by the map's name, with ratings where one is known better than its kind's. */
const FIXED: Record<string, { id: string; kind: ChokepointKind; rating?: Rating }> = {
  'Channel Tunnel': { id: 'channel_tunnel', kind: 'tunnel' },
  'Oresund Bridge': { id: 'oresund', kind: 'bridge' },
  'Great Belt Fixed Link': { id: 'great_belt', kind: 'bridge' },
  // Twin 19 km road and rail bridges. The October 2022 truck bomb dropped two road spans and burned the
  // rail bridge, which ran reduced traffic for weeks; the road was fully restored in February 2023. Two
  // sea drones dropped a road span in July 2023, reopened about two months later (Ukrainska Pravda, ISW).
  'Crimean Bridge': { id: 'kerch', kind: 'bridge', rating: { hitsToClose: 5, repairDays: 75 } },
  'Bosporus bridges and Marmaray': { id: 'bosporus', kind: 'bridge', rating: { hitsToClose: 12, repairDays: 45 } },
  '1915 Canakkale Bridge': { id: 'canakkale', kind: 'bridge' },
  'King Fahd Causeway': { id: 'king_fahd', kind: 'causeway' },
  'Johor-Singapore Causeway': { id: 'johor', kind: 'causeway' },
  'Seikan Tunnel': { id: 'seikan', kind: 'tunnel' },
  'Akashi Kaikyo and Onaruto bridges': { id: 'akashi', kind: 'bridge' },
  'Oland Bridge': { id: 'oland', kind: 'bridge' },
};

/** Crossings the map joins by land that carry a theatre's supply through one gap. */
const EXTRA: Extra[] = [
  {
    // The Armiansk road and railway over the Perekop isthmus, Crimea's western land link.
    id: 'perekop', name: 'Perekop isthmus', kind: 'isthmus',
    pairs: [[[46.25, 33.75], [45.75, 33.75]], [[46.25, 33.75], [45.75, 34.25]], [[46.25, 34.25], [45.75, 33.75]]],
  },
  {
    // The Chonhar road bridge, the Syvash rail bridge on the Melitopol-Dzhankoi line and the Henichesk
    // bridge to the Arabat Spit: the land bridge's way into Crimea. Struck in June and August 2023.
    id: 'chonhar', name: 'Chonhar and Henichesk bridges', kind: 'bridge', rating: { hitsToClose: 3, repairDays: 21 },
    pairs: [[[46.25, 34.25], [45.75, 34.25]], [[46.25, 34.25], [45.75, 34.75]], [[46.25, 34.75], [45.75, 34.25]], [[46.25, 34.75], [45.75, 34.75]]],
  },
];

const adjacent = (map: GameMap, a: number, b: number): boolean => {
  for (const n of map.neighbors(a as NodeId)) if (n === b) return true;
  return false;
};

/** The map's chokepoints: every fixed link across water and the land crossings in EXTRA whose cells the map joins. */
export function chokepointsOf(map: GameMap): Chokepoint[] {
  const out: Chokepoint[] = [];
  for (const l of map.fixedLinks) {
    const f = FIXED[l.name];
    const kind = f?.kind ?? (/tunnel/i.test(l.name) ? 'tunnel' : 'bridge');
    out.push({ id: f?.id ?? l.name.toLowerCase().replace(/\W+/g, '_'), name: l.name, kind, edges: [[l.a, l.b]], ...(f?.rating ?? RATING[kind]) });
  }
  for (const x of EXTRA) {
    const edges: [NodeId, NodeId][] = [];
    for (const [[la, lo], [lb, lob]] of x.pairs) {
      const a = map.nodeAt(la, lo), b = map.nodeAt(lb, lob);
      if (!map.isSea(a) && !map.isSea(b) && adjacent(map, a, b)) edges.push([a, b]);
    }
    if (edges.length) out.push({ id: x.id, name: x.name, kind: x.kind, edges, ...(x.rating ?? RATING[x.kind]) });
  }
  return out;
}

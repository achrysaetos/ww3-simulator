import type { GameMap } from '../../core/map';
import type { NationId, NodeId } from '../../core/types';

/**
 * A sea passage that a share of some nations' seaborne trade must transit.
 * `general` is the share of a nation's seaborne trade value through it, `energy` the share
 * of its seaborne energy imports. All shares are estimates built from EIA "World Oil Transit
 * Chokepoints" (2023 update), UNCTAD Review of Maritime Transport 2023/2024, and national
 * trade-route studies; treat them as one-significant-figure numbers.
 */
export interface Chokepoint {
  name: string;
  /** Points inside the passage; each resolves to the nearest sea zone. */
  points: readonly [lat: number, lon: number][];
  general: Record<string, number>;
  energy: Record<string, number>;
}

export const CHOKEPOINTS: readonly Chokepoint[] = [
  {
    // EIA 2023: ~23.7 mb/d of oil through Malacca, ~75-80% of China's crude imports ("Malacca dilemma").
    name: 'Strait of Malacca', points: [[4.5, 99], [2.5, 101.5], [1.3, 104]],
    general: { CHN: 0.4, JPN: 0.35, KOR: 0.35, TWN: 0.3, SGP: 0.8, MYS: 0.4, IDN: 0.3, THA: 0.3, VNM: 0.25, PHL: 0.2, IND: 0.2, AUS: 0.15, LKA: 0.3, BGD: 0.3, MMR: 0.2, DEU: 0.08, NLD: 0.1, GBR: 0.07, FRA: 0.07, ITA: 0.07, ESP: 0.05, SAU: 0.3, ARE: 0.3 },
    energy: { CHN: 0.75, JPN: 0.85, KOR: 0.85, TWN: 0.8, SGP: 0.9, PHL: 0.5, VNM: 0.3, THA: 0.4 },
  },
  {
    // EIA 2023: ~20.9 mb/d, about a fifth of world petroleum liquids; ~20% of world LNG (Qatar).
    name: 'Strait of Hormuz', points: [[26.5, 56.5], [25.5, 57.5]],
    general: { IRN: 0.9, IRQ: 0.85, KWT: 0.95, QAT: 0.95, BHR: 0.9, ARE: 0.6, SAU: 0.4, IND: 0.1, PAK: 0.2 },
    energy: { JPN: 0.75, KOR: 0.65, CHN: 0.4, IND: 0.5, TWN: 0.6, PAK: 0.6, SGP: 0.5, THA: 0.5 },
  },
  {
    // EIA: ~8.6 mb/d pre-2024; Houthi campaign cut transits ~2/3 in 2024 (UNCTAD).
    name: 'Bab-el-Mandeb', points: [[12.6, 43.4]],
    general: { DEU: 0.15, ITA: 0.2, FRA: 0.15, GBR: 0.12, NLD: 0.15, ESP: 0.15, GRC: 0.2, TUR: 0.1, EGY: 0.3, ISR: 0.25, SAU: 0.15, JOR: 0.7, SDN: 0.9, YEM: 0.8, DJI: 0.9, ERI: 0.9, CHN: 0.1, IND: 0.15 },
    energy: { DEU: 0.1, ITA: 0.2, FRA: 0.1, ESP: 0.15, GRC: 0.2, EGY: 0.3, ISR: 0.3, JOR: 0.6 },
  },
  {
    name: 'Suez Canal', points: [[31.6, 32.4], [27.5, 34]],
    general: { DEU: 0.15, ITA: 0.2, FRA: 0.15, GBR: 0.12, NLD: 0.15, ESP: 0.15, GRC: 0.2, TUR: 0.12, EGY: 0.3, ISR: 0.15, CHN: 0.1, IND: 0.15, SAU: 0.1 },
    energy: { DEU: 0.1, ITA: 0.2, FRA: 0.1, ESP: 0.15, GRC: 0.2 },
  },
  {
    // Turkish Straits: ~3.4 mb/d (EIA); Ukrainian grain corridor 2023.
    name: 'Bosporus', points: [[41.2, 29.1], [40.2, 26.4]],
    general: { UKR: 0.6, RUS: 0.15, GEO: 0.5, ROU: 0.25, BGR: 0.3, MDA: 0.3 },
    energy: { GEO: 0.4, BGR: 0.3, UKR: 0.4 },
  },
  {
    // Mostly military (SOSUS line, Northern Fleet egress); small trade share.
    name: 'GIUK gap', points: [[65, -28], [63.5, -13], [61.5, -6]],
    general: { ISL: 0.9, NOR: 0.1, RUS: 0.08, FRO: 0.9, GRL: 0.9 },
    energy: { ISL: 0.9 },
  },
  {
    // Nearly half of the world container fleet passed the strait in 2022 (Bloomberg ship tracking).
    name: 'Taiwan Strait', points: [[24.5, 119.5], [23, 118.5]],
    general: { TWN: 0.4, CHN: 0.15, JPN: 0.2, KOR: 0.2, PHL: 0.1 },
    energy: { TWN: 0.3, CHN: 0.1, JPN: 0.15, KOR: 0.15 },
  },
  {
    name: 'Strait of Gibraltar', points: [[36, -5.6]],
    general: { ITA: 0.3, ESP: 0.25, FRA: 0.15, GRC: 0.2, TUR: 0.15, EGY: 0.15, ISR: 0.4, DZA: 0.4, MAR: 0.3, TUN: 0.4, LBY: 0.5, HRV: 0.4, SVN: 0.5, CYP: 0.5, MLT: 0.6, LBN: 0.6, SYR: 0.5 },
    energy: { ITA: 0.2, ESP: 0.2, GRC: 0.2, ISR: 0.3, TUR: 0.2 },
  },
  {
    // ~2.5-5% of world seaborne trade; ~40% of US container traffic between NE Asia and the US East Coast.
    name: 'Panama Canal', points: [[9.2, -79.8], [8.5, -79.5]],
    general: { USA: 0.06, CHL: 0.15, PER: 0.2, ECU: 0.25, COL: 0.2, PAN: 0.8, JPN: 0.04, CHN: 0.03, MEX: 0.03, CRI: 0.2 },
    energy: { CHL: 0.2, PER: 0.2, ECU: 0.2 },
  },
  {
    name: 'Danish straits', points: [[55.6, 12.8], [55.3, 10.9]],
    general: { POL: 0.6, EST: 0.8, LVA: 0.8, LTU: 0.8, FIN: 0.8, SWE: 0.4, RUS: 0.3, DEU: 0.1, DNK: 0.3 },
    energy: { POL: 0.5, EST: 0.6, LVA: 0.6, LTU: 0.6, FIN: 0.7, SWE: 0.3 },
  },
];

/**
 * Canals the sea graph does not connect. The map's 3-degree sea zones do not touch across
 * the isthmus of Suez, so ships transit these land cells (Port Said to Suez, then down the Gulf of Suez's western shore).
 */
export const CANALS: readonly { name: string; points: readonly [number, number][] }[] = [
  { name: 'Suez Canal', points: [[30.5, 32.5], [29.5, 32.5], [28.5, 32.5], [27.5, 33.5]] },
];

/** Static naval geography derived from the map once per map. */
export interface NavalGeography {
  chokepoints: { def: Chokepoint; nodes: NodeId[] }[];
  /** Land cells ships may sail through. */
  canalNodes: ReadonlySet<number>;
  /** Port cells (ports > 0 with a sea neighbour) and the sea zone each opens onto. */
  ports: { node: NodeId; zone: NodeId; weight: number }[];
  portZone: Map<number, NodeId>;
}

const cache = new WeakMap<GameMap, NavalGeography>();

export function geography(map: GameMap): NavalGeography {
  let g = cache.get(map);
  if (!g) {
    g = build(map);
    cache.set(map, g);
  }
  return g;
}

function build(map: GameMap): NavalGeography {
  const ports: NavalGeography['ports'] = [];
  const portZone = new Map<number, NodeId>();
  for (let n = 0; n < map.landCount; n++) {
    if (!map.ports[n]) continue;
    const zone = seaNeighbour(map, n as NodeId);
    if (zone === undefined) continue;
    ports.push({ node: n as NodeId, zone, weight: map.ports[n] });
    portZone.set(n, zone);
  }
  return {
    chokepoints: CHOKEPOINTS.map((def) => ({ def, nodes: [...new Set(def.points.map(([la, lo]) => nearestSea(map, la, lo)))] })),
    canalNodes: new Set(CANALS.flatMap((c) => c.points.map(([la, lo]) => map.nodeAt(la, lo) as number))),
    ports,
    portZone,
  };
}

export function seaNeighbour(map: GameMap, n: NodeId): NodeId | undefined {
  for (const m of map.neighbors(n)) if (map.isSea(m)) return m;
  return undefined;
}

export function nearestSea(map: GameMap, lat: number, lon: number): NodeId {
  const n = map.nodeAt(lat, lon);
  if (map.isSea(n)) return n;
  let best = -1, bestKm = Infinity;
  for (let s = map.landCount; s < map.size; s++) {
    const km = Math.hypot(map.lat[s] - lat, (map.lon[s] - lon) * Math.cos((lat * Math.PI) / 180));
    if (km < bestKm) { bestKm = km; best = s; }
  }
  return best as NodeId;
}

export function chokepointShare(cp: Chokepoint, nation: NationId, energyWeight: number): number {
  return (1 - energyWeight) * (cp.general[nation] ?? 0) + energyWeight * (cp.energy[nation] ?? 0);
}

import type { GameMap } from '../../core/map';
import type { Formation, NationId, NodeId, PlatformClass } from '../../core/types';
import { dominant, issue } from './forces';
import { reachKm } from './strikes';
import type { Plan } from './types';

/**
 * Maritime chokepoints and the nations whose trade or fleets depend on them
 * (EIA "World Oil Transit Chokepoints" 2023 for energy flows; fleet basing
 * from IISS Military Balance 2024 for naval exits such as the GIUK gap).
 */
const CHOKEPOINTS: { name: string; lat: number; lon: number; users: string[] }[] = [
  { name: 'Strait of Hormuz', lat: 26.3, lon: 56.8, users: ['IRN', 'IRQ', 'KWT', 'QAT', 'SAU', 'ARE', 'BHR', 'CHN', 'JPN', 'KOR', 'IND'] },
  { name: 'Strait of Malacca', lat: 3.5, lon: 100.0, users: ['CHN', 'JPN', 'KOR', 'TWN', 'SGP', 'MYS', 'IND'] },
  { name: 'Bab el-Mandeb', lat: 12.5, lon: 43.5, users: ['SAU', 'EGY', 'ISR', 'JOR', 'CHN', 'IND'] },
  { name: 'Suez approaches', lat: 31.8, lon: 32.4, users: ['EGY', 'ISR', 'ITA', 'GRC', 'TUR'] },
  { name: 'Strait of Gibraltar', lat: 36.0, lon: -5.8, users: ['ESP', 'MAR', 'ITA', 'FRA', 'DZA'] },
  { name: 'Turkish Straits', lat: 41.3, lon: 29.2, users: ['RUS', 'UKR', 'ROU', 'BGR', 'GEO'] },
  { name: 'Danish Straits', lat: 56.5, lon: 11.5, users: ['RUS', 'POL', 'FIN', 'EST', 'LVA', 'LTU', 'SWE', 'DEU'] },
  { name: 'GIUK gap', lat: 63.0, lon: -12.0, users: ['RUS'] },
  { name: 'Taiwan Strait', lat: 24.5, lon: 119.5, users: ['CHN', 'TWN', 'JPN', 'KOR'] },
  { name: 'Luzon Strait', lat: 20.5, lon: 121.5, users: ['CHN', 'TWN'] },
  { name: 'Korea Strait', lat: 34.5, lon: 129.0, users: ['KOR', 'JPN', 'RUS', 'CHN'] },
  { name: 'La Perouse Strait', lat: 45.7, lon: 142.0, users: ['RUS'] },
  { name: 'Panama approaches', lat: 8.5, lon: -79.5, users: ['USA', 'PAN', 'CHL', 'PER'] },
  { name: 'Dover Strait', lat: 51.0, lon: 1.5, users: ['GBR', 'FRA', 'BEL', 'NLD', 'DEU'] },
  { name: 'Lombok Strait', lat: -8.8, lon: 115.7, users: ['CHN', 'AUS', 'JPN'] },
];

const resolved = new WeakMap<GameMap, { node: NodeId; users: Set<string> }[]>();

/** Nearest sea zone to a node, breadth-first; chokepoints often fall on a land cell at 1-degree resolution. */
export function nearestSea(map: GameMap, from: NodeId): NodeId {
  if (map.isSea(from)) return from;
  const seen = new Set<number>([from]);
  const queue = [from as number];
  for (let i = 0; i < queue.length && i < 2000; i++) {
    for (let k = map.adjStart[queue[i]]; k < map.adjStart[queue[i] + 1]; k++) {
      const m = map.adj[k];
      if (map.isSea(m as NodeId)) return m as NodeId;
      if (!seen.has(m)) { seen.add(m); queue.push(m); }
    }
  }
  return from;
}

function chokepoints(map: GameMap) {
  let c = resolved.get(map);
  if (!c) resolved.set(map, (c = CHOKEPOINTS.map((p) => ({ node: nearestSea(map, map.nodeAt(p.lat, p.lon)), users: new Set(p.users) }))));
  return c;
}

type NavalRole = 'ssbn' | 'submarine' | 'capital' | 'escort';
const NAVAL_ROLE: Partial<Record<PlatformClass, NavalRole>> = {
  ssbn: 'ssbn',
  ssn: 'submarine', ssk: 'submarine', ssgn: 'submarine', uuv: 'submarine',
  carrier: 'capital', amphibious: 'capital',
  cruiser: 'escort', destroyer: 'escort', frigate: 'escort', corvette: 'escort', patrol: 'escort', mine_warfare: 'escort', usv: 'escort',
};
const PRIORITY: NavalRole[] = ['ssbn', 'capital', 'submarine', 'escort'];

function roleOf(p: Plan, f: Formation): NavalRole | undefined {
  const counts = dominant(f, p.ctx.catalog, (c) => NAVAL_ROLE[c as PlatformClass]);
  return PRIORITY.find((r) => counts.has(r));
}

/**
 * Naval groups: SSBNs hold a bastion in home waters; attack submarines
 * blockade the chokepoints enemy trade and fleets must pass, spreading across
 * them; carriers and amphibious groups take sea control off the main front;
 * escorts screen them one each and otherwise blockade or patrol home waters.
 */
export function planNaval(p: Plan): void {
  const { map } = p.ctx;
  const km = (a: number, b: number) => map.distanceKm(a as NodeId, b as NodeId);
  const groups = (p.index.byNation.get(p.nation) ?? []).filter((f) => (f.kind === 'surface_group' || f.kind === 'submarine') && f.status === 'active');
  if (!groups.length) return;
  const enemyChokes = chokepoints(map).filter((c) => [...c.users].some((u) => p.enemies.has(u as NationId)));
  const claimed = new Map<NodeId, number>();
  const home = nearestSea(map, p.world.nations[p.nation].capital);
  const mainFront = p.sectors.length ? nearestSea(map, p.sectors[0].key) : home;

  const blockade = (f: Formation): boolean => {
    const range = reachKm(p, f);
    let best: NodeId | undefined, bestScore = Infinity;
    for (const c of enemyChokes) {
      const d = km(f.node, c.node);
      if (d > range) continue;
      const score = d * (1 + (claimed.get(c.node) ?? 0));
      if (score < bestScore) { bestScore = score; best = c.node; }
    }
    if (best === undefined) return false;
    claimed.set(best, (claimed.get(best) ?? 0) + 1);
    issue(p, f, { posture: 'blockade', target: best });
    return true;
  };

  const roles = new Map(groups.map((g) => [g, roleOf(p, g)]));
  const unescorted = groups.filter((g) => roles.get(g) === 'capital');
  for (const g of groups) {
    switch (roles.get(g)) {
      case 'ssbn':
        issue(p, g, { posture: 'patrol', target: nearestSea(map, g.home) });
        break;
      case 'submarine':
        if (!blockade(g)) issue(p, g, { posture: 'patrol', target: mainFront });
        break;
      case 'capital':
        issue(p, g, { posture: 'patrol', target: mainFront });
        break;
      case 'escort': {
        let ward: Formation | undefined, bestD = Infinity;
        for (const c of unescorted) {
          const d = km(g.node, c.node);
          if (d < bestD) { bestD = d; ward = c; }
        }
        if (ward) {
          unescorted.splice(unescorted.indexOf(ward), 1);
          issue(p, g, { posture: 'escort', targetFormation: ward.id });
        } else if (!blockade(g)) issue(p, g, { posture: 'patrol', target: p.sectors.length ? mainFront : home });
        break;
      }
    }
  }
}

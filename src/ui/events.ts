import type { GameMap } from '../core/map';
import type { NationId, NodeId, SimEvent } from '../core/types';
import type { SessionMeta } from './snapshot';

export const EVENT_CATEGORIES = ['combat', 'strikes', 'nuclear', 'diplomacy', 'territory', 'economy', 'messages'] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const CATEGORY_OF: Record<SimEvent['type'], EventCategory> = {
  battle: 'combat',
  formation_destroyed: 'combat',
  strike: 'strikes',
  nuclear_detonation: 'nuclear',
  war_declared: 'diplomacy',
  peace: 'diplomacy',
  escalation: 'diplomacy',
  capitulation: 'diplomacy',
  node_captured: 'territory',
  production: 'economy',
  shortage: 'economy',
  message: 'messages',
};

/** Nations an event involves, for "my nation only" filtering. */
export function eventNations(e: SimEvent): NationId[] {
  switch (e.type) {
    case 'war_declared': return [e.by, e.on];
    case 'peace': return [e.a, e.b];
    case 'battle': return [e.attacker, e.defender];
    case 'strike': return [e.by];
    case 'node_captured': return [e.from, e.to];
    case 'formation_destroyed': return [e.nation];
    case 'nuclear_detonation': return [e.by];
    case 'escalation': return [e.a, e.b];
    case 'production': return [e.nation];
    case 'shortage': return [e.nation];
    case 'capitulation': return [e.nation, ...e.to];
    case 'message': return e.nation ? [e.nation] : [];
  }
}

export function eventNode(e: SimEvent): NodeId | null {
  switch (e.type) {
    case 'battle': case 'node_captured': case 'nuclear_detonation': return e.node;
    case 'strike': return e.target;
    default: return null;
  }
}

/** Nearest notable city within ~250 km, else coordinates. Cached per node. */
export class PlaceNamer {
  private readonly cache = new Map<number, string>();
  constructor(private readonly map: GameMap) {}
  name(node: NodeId): string {
    let s = this.cache.get(node);
    if (s !== undefined) return s;
    const { map } = this;
    let best: (typeof map.cities)[number] | null = null, bestD = 250;
    for (const c of map.cities) {
      const d = Math.hypot(c.lat - map.lat[node], (c.lon - map.lon[node]) * Math.cos((c.lat * Math.PI) / 180)) * 111;
      if (d < bestD) { bestD = d; best = c; }
    }
    const lat = map.lat[node], lon = map.lon[node];
    const coord = `${Math.abs(lat).toFixed(0)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(0)}°${lon >= 0 ? 'E' : 'W'}`;
    s = best ? (bestD < 60 ? best.name : `near ${best.name}`) : map.isSea(node) ? `sea zone ${coord}` : coord;
    this.cache.set(node, s);
    return s;
  }
}

export function describeEvent(e: SimEvent, nameOf: (n: NationId) => string, place: PlaceNamer, meta: SessionMeta | null): string {
  const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
  switch (e.type) {
    case 'war_declared': return `${nameOf(e.by)} declares war on ${nameOf(e.on)}: ${e.reason}`;
    case 'peace': return `Peace between ${nameOf(e.a)} and ${nameOf(e.b)} (${e.terms})`;
    case 'battle': {
      const losses = Object.entries(e.losses).map(([n, l]) => `${n} -${sum(l)}`).join(', ');
      const cas = Object.entries(e.casualties).map(([n, c]) => `${n} ${c.toLocaleString()}`).join(', ');
      return `Battle at ${place.name(e.node)}: ${nameOf(e.attacker)} attacks ${nameOf(e.defender)}. Platforms lost ${losses || 'none'}; casualties ${cas || 'none'}${e.winner ? `. ${nameOf(e.winner)} prevails` : ''}`;
    }
    case 'strike': return `${nameOf(e.by)} fires ${e.fired} × ${meta?.munitions[e.munition]?.name ?? e.munition} at ${place.name(e.target)}, ${e.intercepted} intercepted: ${e.damage}`;
    case 'node_captured': return `${nameOf(e.to)} takes ${place.name(e.node)} from ${nameOf(e.from)}`;
    case 'formation_destroyed': return `${nameOf(e.nation)} formation ${e.formation} destroyed`;
    case 'nuclear_detonation': return `NUCLEAR DETONATION at ${place.name(e.node)}: ${nameOf(e.by)}, ${e.yieldKt.toLocaleString()} kt, est. ${e.casualties.toLocaleString()} casualties`;
    case 'escalation': return `${nameOf(e.a)} and ${nameOf(e.b)} escalate to ${e.level.replace(/_/g, ' ')}`;
    case 'production': return `${nameOf(e.nation)} produces ${e.count} × ${meta?.platforms[e.item]?.name ?? meta?.munitions[e.item]?.name ?? e.item}`;
    case 'shortage': return `${nameOf(e.nation)} shortage: ${e.what}`;
    case 'capitulation': return `${nameOf(e.nation)} capitulates to ${e.to.map(nameOf).join(', ')}`;
    case 'message': return e.nation ? `${nameOf(e.nation)}: ${e.text}` : e.text;
  }
}

import type { GameMap } from '../core/map';
import type { FormationId, NationId, NodeId, SimEvent, StrikeEffect } from '../core/types';
import { allianceById } from '../data/nations/alliances';

export const EVENT_CATEGORIES = ['combat', 'strikes', 'nuclear', 'diplomacy', 'territory', 'economy', 'messages'] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const CATEGORY_OF: Record<SimEvent['type'], EventCategory> = {
  battle: 'combat',
  formation_destroyed: 'combat',
  strike: 'strikes',
  nuclear_detonation: 'nuclear',
  nuclear_alert: 'nuclear',
  war_declared: 'diplomacy',
  peace: 'diplomacy',
  escalation: 'diplomacy',
  capitulation: 'diplomacy',
  node_captured: 'territory',
  production: 'economy',
  shortage: 'economy',
  message: 'messages',
};

const FIGHT_TAG = { land: 'ground', sea: 'naval', air: 'air' } as const;

/** The log's tag for an event: a fight's domain, otherwise its category. */
export function eventTag(e: SimEvent): string {
  return e.type === 'battle' ? FIGHT_TAG[e.domain ?? 'land'] : CATEGORY_OF[e.type];
}

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
    case 'nuclear_alert': return [e.nation];
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

/** A fight that killed nothing and nobody tells the reader nothing. */
export function isEmptyFight(e: SimEvent): boolean {
  if (e.type !== 'battle') return false;
  for (const l of Object.values(e.losses)) for (const n of Object.values(l)) if (n > 0) return false;
  return Object.values(e.casualties).every((c) => c <= 0);
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
  /** "at Kiev", "near Kiev", "in sea zone 20°N 120°E". */
  at(node: NodeId): string {
    const s = this.name(node);
    return s.startsWith('near ') ? s : s.startsWith('sea zone') ? `in ${s}` : `at ${s}`;
  }
}

/** Everything a log line needs to turn ids into names. */
export interface Namer {
  nation(id: NationId): string;
  formation(id: FormationId): string | undefined;
  item(id: string): string;
  /** A catalog item's name, or undefined when `id` is not a catalog id. */
  known(id: string): string | undefined;
  place: PlaceNamer;
}

export const treatyName = (id: string) => allianceById[id]?.name ?? id;

const total = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const level = (what: string, x: { before: number; after: number }) => `${what} cut from ${pct(x.before)} to ${pct(x.after)}`;

function strikeEffect(x: StrikeEffect, n: Namer): string {
  switch (x.kind) {
    case 'losses': return `destroyed or damaged ${Object.entries(x.platforms).map(([id, k]) => `${k} ${n.known(id) ?? n.item(id)}`).join(', ')}`;
    case 'ship_hits': return `${plural(x.hits, 'hit')} on ${n.formation(x.formation) ?? 'a naval group'}`;
    case 'infrastructure': return level('infrastructure', x);
    case 'grid': return level('power grid', x);
    case 'runway': return level('runway capacity', x);
    case 'sam_suppressed': return `suppressed ${plural(x.sites, 'SAM site')}`;
    case 'nuclear_detonations': return plural(x.count, 'nuclear detonation');
    case 'satellites_destroyed': return `${plural(x.count, 'satellite')} destroyed`;
    case 'no_effect': return x.why === 'all_intercepted' ? 'nothing got through' : x.why === 'not_hostile' ? 'nothing hostile there' : 'no targets hit';
  }
}

function fight(e: Extract<SimEvent, { type: 'battle' }>, n: Namer): string {
  const where = n.place.at(e.node);
  const unit = e.domain === 'sea' ? 'ship' : e.domain === 'air' ? 'aircraft' : 'platform';
  const people = e.domain === 'sea' ? 'sailors' : e.domain === 'air' ? 'aircrew' : 'casualties';
  const losses = [...new Set([...Object.keys(e.losses), ...Object.keys(e.casualties)])].flatMap((id) => {
    const lost = total(e.losses[id as NationId] ?? {}), cas = e.casualties[id as NationId] ?? 0;
    const parts = [lost > 0 ? plural(lost, unit, unit === 'aircraft' ? 'aircraft' : undefined) : '', cas > 0 ? `${cas.toLocaleString()} ${people}` : ''].filter(Boolean);
    return parts.length ? [`${n.nation(id as NationId)} ${parts.join(', ')}`] : [];
  });
  const lost = losses.length ? ` Lost: ${losses.join('; ')}.` : ' No losses.';
  const won = e.winner ? ` ${n.nation(e.winner)} prevails.` : '';
  const [a, d] = [n.nation(e.attacker), n.nation(e.defender)];
  if (e.domain === 'sea') return `Naval engagement ${where}: ${a} attacks ${d}'s ships.${lost}${won}`;
  if (e.domain === 'air') return `Air battle ${where.replace(/^at /, 'over ')}${a === d ? '' : `: ${a} against ${d}`}.${lost}${won}`;
  return `Ground battle ${where}: ${a} attacks ${d}.${lost}${won}`;
}

type Rule = [RegExp, (m: RegExpExecArray, n: Namer) => string];
const node = (s: string, n: Namer) => n.place.name(+s as NodeId);
const nation = (s: string, n: Namer) => n.nation(s as NationId);

/** Plain-words versions of the engine's refusal reasons. */
const REASONS: Rule[] = [
  [/^no sea route to node (\d+)$/, (m, n) => `no sea route to ${node(m[1], n)}`],
  [/^embark needs an own active surface group as targetFormation$/, () => 'pick one of your own lift groups to embark on'],
  [/^must stand in a port with the lift group in port or offshore$/, () => 'the unit must be in a port, with the lift group in that port or just offshore'],
  [/^embarked formations land by ordering their lift group to attack or move to a coast$/, () => 'it is at sea. Send its lift group to a friendly port to unload, or attack a coast to land under fire'],
  [/^not a naval formation$/, () => 'only ships take that order'],
  [/^(\w+) cannot take posture (\w+)$/, (m) => `a ${m[1].replace(/_/g, ' ')} formation cannot ${m[2].replace(/_/g, ' ')}`],
];

const MESSAGES: Rule[] = [
  [/^order to (\S+) refused: (.*)$/, (m, n) => `${n.formation(m[1] as FormationId) ?? 'a formation'}: order refused, ${reason(m[2], n)}`],
  [/^(.+): order refused, (.*)$/, (m, n) => `${m[1]}: order refused, ${reason(m[2], n)}`],
  [/^(.+): no land route to node (\d+)$/, (m, n) => `${m[1]}: no land route to ${node(m[2], n)}. It lies across the sea or past territory closed to you; ground units cross water by embarking at a port`],
  [/^(.+) landed at node (\d+), losing (\d+)% in the assault$/, (m, n) => `${m[1]} landed ${n.place.at(+m[2] as NodeId)}, losing ${m[3]}% in the assault`],
  [/^([A-Z]{3}) offers peace to ([A-Z]{3})$/, (m, n) => `${nation(m[1], n)} offers peace to ${nation(m[2], n)}, which has not accepted`],
  [/^([A-Z]{3}) declines to honour (\S+) for ([A-Z]{3})$/, (m, n) => `${nation(m[1], n)} declines to honour the ${treatyName(m[2])} for ${nation(m[3], n)}`],
  [/^([A-Z]{3}) let the (\S+) deadline pass without answering ([A-Z]{3})$/, (m, n) => `${nation(m[1], n)} let the deadline pass on the ${treatyName(m[2])} call from ${nation(m[3], n)} and stays out`],
  [/^([A-Z]{3}) has no industry to build (\S+)$/, (m, n) => `${nation(m[1], n)} has no industry to build ${n.item(m[2])}`],
  [/^([A-Z]{3}) cannot order (.+)$/, (m, n) => `${nation(m[1], n)} cannot order ${m[2]}, which belongs to another nation`],
  [/^nuclear release refused: (.*)$/, (m) => `Nuclear release refused: ${m[1]}`],
];

function apply(rules: Rule[], text: string, n: Namer): string | null {
  for (const [re, f] of rules) {
    const m = re.exec(text);
    if (m) return f(m, n);
  }
  return null;
}

function reason(text: string, n: Namer): string {
  return apply(REASONS, text, n) ?? text.replace(/\bnode (\d+)/g, (_, id) => node(id, n)).replace(/_/g, ' ');
}

/** Engine messages in the player's words: names for ids, places for node numbers. */
export function humanizeMessage(text: string, n: Namer): string {
  return apply(MESSAGES, text, n) ?? text.replace(/\bnode (\d+)/g, (_, id) => node(id, n));
}

export function describeEvent(e: SimEvent, n: Namer): string {
  switch (e.type) {
    case 'war_declared': {
      const treaty = /^(\S+): defence of ([A-Z]{3})$/.exec(e.reason);
      const why = treaty ? `honouring the ${treatyName(treaty[1])} in defence of ${nation(treaty[2], n)}` : e.reason;
      return `${n.nation(e.by)} declares war on ${n.nation(e.on)}: ${why}`;
    }
    case 'peace': return `Peace between ${n.nation(e.a)} and ${n.nation(e.b)} (${e.terms})`;
    case 'battle': return fight(e, n);
    case 'strike': return `${n.nation(e.by)} fires ${e.fired} × ${n.item(e.munition)} ${n.place.at(e.target)}, ${e.intercepted} intercepted: ${e.effects.map((x) => strikeEffect(x, n)).join('; ') || 'no effect'}`;
    case 'node_captured': return `${n.nation(e.to)} takes ${n.place.name(e.node)} from ${n.nation(e.from)}`;
    case 'formation_destroyed': return `${n.nation(e.nation)}: ${n.formation(e.formation) ?? 'a formation'} destroyed`;
    case 'nuclear_detonation': return `NUCLEAR DETONATION ${n.place.at(e.node)}: ${n.nation(e.by)}, ${e.yieldKt.toLocaleString()} kt, est. ${e.casualties.toLocaleString()} casualties`;
    case 'nuclear_alert': return e.stage === 'ordered'
      ? `NUCLEAR ALERT: ${n.nation(e.nation)} orders warheads mated to launchers (${e.reason})`
      : `NUCLEAR ALERT: ${n.nation(e.nation)} has ${e.ready.toLocaleString()} of ${e.of.toLocaleString()} warheads ready to launch`;
    case 'escalation': return `${n.nation(e.a)} and ${n.nation(e.b)} escalate to ${e.level.replace(/_/g, ' ')}`;
    case 'production': return `${n.nation(e.nation)} produces ${e.count} × ${n.item(e.item)}`;
    case 'shortage': return `${n.nation(e.nation)} shortage: ${e.what}`;
    case 'capitulation': return `${n.nation(e.nation)} capitulates to ${e.to.map(n.nation).join(', ')}`;
    case 'message': {
      const text = humanizeMessage(e.text, n);
      const who = e.nation ? n.nation(e.nation) : '';
      return who && !text.startsWith(who) ? `${who}: ${text}` : text;
    }
  }
}

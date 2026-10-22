import type { GameMap } from '../core/map';
import type { CommandResult, EscalationLevel, FormationId, NationId, NodeId, SimEvent, StrikeEffect } from '../core/types';
import { allianceById } from '../data/nations/alliances';
import { geography } from '../systems/naval/geography';
import { cityName } from './placeNames';

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
  command_result: 'messages',
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
    case 'command_result': return [e.nation];
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

interface Place { name: string; lat: number; lon: number }

/**
 * Towns the city list leaves out but the wars are fought over, so a fight in the Donbas or on
 * Kinmen is not reported "near Dnipro" or "at Xiamen". Used for naming only, not map labels.
 */
const FRONT_PLACES: readonly Place[] = [
  { name: 'Kramatorsk', lat: 48.72, lon: 37.56 }, { name: 'Pokrovsk', lat: 48.28, lon: 37.18 }, { name: 'Zaporizhzhia', lat: 47.84, lon: 35.14 },
  { name: 'Mariupol', lat: 47.1, lon: 37.55 }, { name: 'Kherson', lat: 46.64, lon: 32.61 }, { name: 'Mykolaiv', lat: 46.97, lon: 32.0 },
  { name: 'Sevastopol', lat: 44.6, lon: 33.52 }, { name: 'Huliaipole', lat: 47.66, lon: 36.26 }, { name: 'Kursk', lat: 51.73, lon: 36.19 },
  { name: 'Belgorod', lat: 50.6, lon: 36.6 }, { name: 'Bryansk', lat: 53.24, lon: 34.36 }, { name: 'Pskov', lat: 57.82, lon: 28.33 },
  { name: 'Narva', lat: 59.38, lon: 28.19 }, { name: 'Tartu', lat: 58.38, lon: 26.72 }, { name: 'Daugavpils', lat: 55.87, lon: 26.53 },
  { name: 'Kaunas', lat: 54.9, lon: 23.9 }, { name: 'Kaliningrad', lat: 54.71, lon: 20.51 }, { name: 'Suwałki', lat: 54.1, lon: 22.93 },
  { name: 'Seoul', lat: 37.57, lon: 126.98 }, { name: 'Kaesong', lat: 37.97, lon: 126.55 }, { name: 'Pyongtaek', lat: 36.99, lon: 127.09 },
  { name: 'Kinmen', lat: 24.44, lon: 118.38 }, { name: 'Matsu', lat: 26.16, lon: 119.95 }, { name: 'Penghu', lat: 23.57, lon: 119.58 },
  { name: 'Tainan', lat: 22.99, lon: 120.21 }, { name: 'Taoyuan', lat: 24.99, lon: 121.3 }, { name: 'Keelung', lat: 25.13, lon: 121.74 },
  { name: 'Hualien', lat: 23.99, lon: 121.6 }, { name: 'Naha', lat: 26.21, lon: 127.68 }, { name: 'Guam', lat: 13.44, lon: 144.79 },
];

/** The ports a sea zone serves, so a ship off Busan is named for Busan and not only for the nearest big city. */
const portZones = new WeakMap<GameMap, Map<number, NodeId[]>>();
function portsOf(map: GameMap, zone: NodeId): NodeId[] {
  let m = portZones.get(map);
  if (!m) {
    m = new Map();
    for (const [port, z] of geography(map).portZone) (m.get(z) ?? m.set(z, []).get(z)!).push(port as NodeId);
    portZones.set(map, m);
  }
  return m.get(zone) ?? [];
}

/** Nearest notable city or front-line town within ~250 km, else coordinates; a port's sea zone is named "off" the port. Cached per node. */
export class PlaceNamer {
  private readonly cache = new Map<number, string>();
  private readonly places: readonly Place[];
  /** The biggest city in each cell that has one, and each city name's population. */
  private readonly cityAt = new Map<number, string>();
  private readonly pop = new Map<string, number>();
  constructor(private readonly map: GameMap) {
    for (const c of [...map.cities].sort((a, b) => a.pop - b.pop)) {
      this.cityAt.set(c.node, cityName(c.name));
      this.pop.set(cityName(c.name), c.pop);
    }
    this.places = [...map.cities.map((c) => ({ name: cityName(c.name), lat: c.lat, lon: c.lon })), ...FRONT_PLACES];
  }
  name(node: NodeId): string {
    let s = this.cache.get(node);
    if (s !== undefined) return s;
    const { map } = this;
    const ports = map.isSea(node) ? portsOf(map, node) : [];
    if (ports.length) {
      const names = [...new Set(ports.map((p) => this.name(p)).filter((n) => !/°/.test(n)).sort((a, b) => (this.pop.get(b) ?? 0) - (this.pop.get(a) ?? 0)).map((n) => n.replace(/^near /, '')))].slice(0, 2);
      if (names.length) {
        s = `off ${names.join(' and ')}`;
        this.cache.set(node, s);
        return s;
      }
    }
    s = this.nearest(node, () => true);
    this.cache.set(node, s);
    return s;
  }
  /**
   * The name of a land cell after the nearest place in a cell that `holds` accepts: a sector a nation
   * holds is named for a town on its own side of the line, never for an enemy city across it.
   */
  heldName(node: NodeId, holds: (cell: NodeId) => boolean): string {
    return this.nearest(node, (c) => holds(this.cellOf(c)));
  }
  private readonly cells = new Map<Place, NodeId>();
  private cellOf(c: Place): NodeId {
    let n = this.cells.get(c);
    if (n === undefined) this.cells.set(c, (n = this.map.nodeAt(c.lat, c.lon)));
    return n;
  }
  private nearest(node: NodeId, ok: (c: Place) => boolean): string {
    const { map } = this;
    let best: Place | null = null, bestD = 250;
    for (const c of this.places) {
      const d = Math.hypot(c.lat - map.lat[node], (c.lon - map.lon[node]) * Math.cos((c.lat * Math.PI) / 180)) * 111;
      if (d < bestD && ok(c)) { bestD = d; best = c; }
    }
    const lat = map.lat[node], lon = map.lon[node];
    const coord = `${Math.abs(lat).toFixed(0)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(0)}°${lon >= 0 ? 'E' : 'W'}`;
    // A cell holding a city is named for it, even when the city sits off the cell's centre.
    return best && bestD < 60 ? best.name : this.cityAt.get(node) ?? (best ? `near ${best.name}` : map.isSea(node) ? `sea zone ${coord}` : coord);
  }
  /** "at Kiev", "near Kiev", "in sea zone 20°N 120°E". */
  at(node: NodeId): string {
    const s = this.name(node);
    return s.startsWith('near ') || s.startsWith('off ') ? s : s.startsWith('sea zone') ? `in ${s}` : `at ${s}`;
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
/** A level cut, with a decimal when whole percents would read as no change (BA-14). */
const level = (what: string, x: { before: number; after: number }) => {
  const at = (v: number) => (pct(x.before) === pct(x.after) ? `${(v * 100).toFixed(1)}%` : pct(v));
  return `${what} cut from ${at(x.before)} to ${at(x.after)}`;
};

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
  [/^no land route to node (\d+)(;.*)?$/, (m, n) => `no land route to ${node(m[1], n)}. It lies across the sea or past territory closed to you; ground units cross water by embarking at a port or with a Move order`],
  [/^embark needs an own active surface group as targetFormation$/, () => 'pick one of your own lift groups to embark on'],
  [/^must stand in a port with the lift group in port or offshore$/, () => 'the unit must be in a port, with the lift group in that port or just offshore'],
  [/^embarked formations land by ordering their lift group to attack or move to a coast$/, () => 'it is at sea. Send its lift group to a friendly port to unload, or attack a coast to land under fire'],
  [/^not a naval formation$/, () => 'only ships take that order'],
  [/^(\w+) cannot take posture (\w+)$/, (m) => `a ${m[1].replace(/_/g, ' ')} formation cannot ${m[2].replace(/_/g, ' ')}`],
];

const MESSAGES: Rule[] = [
  [/^(.+) landed at node (\d+), losing (\d+)% in the assault$/, (m, n) => `${m[1]} landed ${n.place.at(+m[2] as NodeId)}, losing ${m[3]}% in the assault`],
  [/^([A-Z]{3}) offers peace to ([A-Z]{3})$/, (m, n) => `${nation(m[1], n)} offers peace to ${nation(m[2], n)}, which has not accepted`],
  [/^([A-Z]{3}) declines to honour (\S+) for ([A-Z]{3})$/, (m, n) => `${nation(m[1], n)} declines to honour the ${treatyName(m[2])} for ${nation(m[3], n)}`],
  [/^([A-Z]{3}) let the (\S+) deadline pass without answering ([A-Z]{3})$/, (m, n) => `${nation(m[1], n)} let the deadline pass on the ${treatyName(m[2])} call from ${nation(m[3], n)} and stays out`],
  [/^([A-Z]{3}) has no industry to build (\S+)$/, (m, n) => `${nation(m[1], n)} has no industry to build ${n.item(m[2])}`],
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

/** About how long until an accepted order is carried out, in the player's units. */
export function etaText(hours: number): string {
  if (hours < 1) return 'now';
  if (hours < 36) return `in about ${Math.round(hours)} h`;
  return `in about ${Math.round(hours / 24)} days`;
}

export const COMMAND_LABEL: Record<CommandResult['command'], string> = {
  order: 'Order', declare_war: 'Declaration of war', offer_peace: 'Peace offer', sanction: 'Sanctions', set_mobilization: 'Mobilisation',
  produce: 'Production order', nuclear_release: 'Nuclear release', nuclear_alert: 'Nuclear alert', delegate: 'Delegation', hold: 'Command change',
  answer_treaty: 'Treaty answer', grant_access: 'Right of passage', set_aid: 'Aid', raise_formation: 'New formation',
  cyber_op: 'Cyber operation', sabotage: 'Sabotage campaign', cut_cable: 'Cable cut',
  plan_operation: 'Operation plan', launch_operation: 'Launch', cancel_operation: 'Cancellation', adjust_operation: 'Re-plan',
};

/** The answer to a command in the player's words: who, accepted or refused, and why or when. */
export function describeResult(e: CommandResult, n: Namer): string {
  const who = e.formation ? (n.formation(e.formation) ?? 'Formation') : COMMAND_LABEL[e.command];
  if (!e.ok) return `${who}: ${e.command === 'order' ? 'order ' : ''}refused, ${reason(e.reason, n)}`;
  if (e.code === 'relayed') return `${who}: order relayed down a degraded chain of command, arrives ${etaText(e.etaHours ?? 0)}`;
  if (e.command !== 'order') return `${who}: ${e.reason}`;
  const when = e.etaHours === undefined ? '' : `, ${e.etaHours < 1 ? 'carried out now' : `there ${etaText(e.etaHours)}`}`;
  return `${who}: order accepted${when}${e.note ? `, but ${e.note}` : ''}`;
}

/** The ticker's words for a pair climbing to each rung of escalation (diplomacy/escalation.ts). */
const ESCALATION_WORDS: Record<EscalationLevel, string> = {
  peace: 'step back to peace',
  tension: 'move into open tension',
  crisis: 'move into crisis',
  conventional: 'go to open conventional war',
  strategic_conventional: 'begin striking deep into each other\'s homelands',
  tactical_nuclear: 'cross the nuclear threshold with tactical weapons',
  strategic_nuclear: 'enter a strategic nuclear exchange',
};

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
    case 'escalation': return `${n.nation(e.a)} and ${n.nation(e.b)} ${ESCALATION_WORDS[e.level]}`;
    case 'production': return `${n.nation(e.nation)} produces ${e.count} × ${n.item(e.item)}`;
    case 'shortage': return `${n.nation(e.nation)} shortage: ${e.what}`;
    case 'capitulation': return `${n.nation(e.nation)} capitulates to ${e.to.map(n.nation).join(', ')}`;
    case 'command_result': return describeResult(e, n);
    case 'message': {
      const text = humanizeMessage(e.text, n);
      const who = e.nation ? n.nation(e.nation) : '';
      return who && !text.startsWith(who) ? `${who}: ${text}` : text;
    }
  }
}

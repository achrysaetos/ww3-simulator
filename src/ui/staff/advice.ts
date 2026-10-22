/**
 * What the player's staff brings to the table: templated advisor cards built only from the
 * player's own view (its snapshot, its nation detail, and the events it was sent), each with
 * one recommended action, plus how the engine's answer to that action is recognised.
 * Pure and deterministic: the same situation always gives the same cards in the same order.
 */
import type { GameMap } from '../../core/map';
import type { Command, FormationId, MunitionKind, NationId, NodeId, SimEvent } from '../../core/types';
import { ITEMS } from '../../data/industry/items';
import { describeResult, treatyName, type Namer } from '../events';
import type { FormationView, NationDetail, NationSummary } from '../snapshot';
import type { Role } from './advisors';

export type Drawer = 'forces' | 'nation' | 'log' | 'cost';

export type Action =
  | { kind: 'command'; label: string; command: Command }
  | { kind: 'show'; label: string; node: NodeId }
  | { kind: 'unit'; label: string; formation: FormationId; node: NodeId }
  | { kind: 'open'; label: string; drawer: Drawer }
  | { kind: 'later'; label: string };
export type CommandAction = Extract<Action, { kind: 'command' }>;

export type Topic = 'threat' | 'opportunity' | 'supply' | 'diplomacy' | 'nuclear' | 'command' | 'news';

export interface Card {
  /** Stable while the card means the same thing, so dismissing it sticks. */
  key: string;
  topic: Topic;
  /** Who brings it; null for a report off the wire or a live alert. */
  role: Role | null;
  /** live: happening now; advice: a recommendation; report: a line for the record. */
  tone: 'live' | 'advice' | 'report';
  title: string;
  text: string;
  /** The recommendation in one sentence, for the brief. */
  ask?: string;
  cost?: { label: 'Cost' | 'Risk'; text: string };
  /** The brief's headline figure. */
  figure?: { value: string; unit?: string; caption: string };
  chip?: string;
  meter?: { value: number; tone: 'red' | 'blue' | 'gold' };
  node?: NodeId;
  primary?: Action;
  secondary?: Action;
  /** Opens the Daily Brief at once rather than at the next morning. */
  urgent?: boolean;
  tick: number;
}

export const isDecision = (c: Card): boolean => c.primary?.kind === 'command';

export interface Situation {
  me: NationId;
  tick: number;
  dtHours: number;
  map: GameMap;
  nationIds: readonly NationId[];
  control: Uint16Array;
  formations: readonly FormationView[];
  nations: ReadonlyMap<NationId, NationSummary>;
  d: NationDetail;
  /** The events the player was sent over the last RECENT_TICKS ticks, oldest first. */
  recent: readonly SimEvent[];
  munitionKind(id: string): MunitionKind | undefined;
  unitCostUsdM(id: string): number;
  /** Net tons of national ammunition used per day over the last days; null until two days are on record. */
  ammoPerDay: number | null;
  namer: Namer;
}

export const RECENT_TICKS = 16;

/** Munitions that make an air raid: missiles and one-way drones, not artillery. */
export const RAID_KINDS: Partial<Record<MunitionKind, 'missile' | 'drone'>> = {
  srbm: 'missile', mrbm: 'missile', irbm: 'missile', icbm: 'missile', slbm: 'missile', hgv: 'missile', cruise: 'missile',
  antiship_cruise: 'missile', antiship_ballistic: 'missile', arm: 'missile', loitering: 'drone', drone_oneway: 'drone',
};
const SHELLS: ReadonlySet<string> = new Set(Object.values(ITEMS).filter((s) => s.category === 'shell').map((s) => s.id));
const MANEUVER = 'maneuver';
/** Most cities named in one raid card before "and N more". */
const RAID_PLACES = 2;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
const bare = (place: string) => place.replace(/^near /, '');
const cityCells = new WeakMap<GameMap, Set<number>>();
const isCity = (map: GameMap, node: NodeId) => {
  let s = cityCells.get(map);
  if (!s) cityCells.set(map, (s = new Set(map.cities.map((c) => c.node))));
  return s.has(node);
};

/** Every card the staff has for the player now: live alerts first, then advice, then reports. */
export function advise(s: Situation): Card[] {
  const cards = SOURCES.flatMap((source) => source(s));
  const rank = { live: 0, advice: 1, report: 2 } as const;
  return cards.sort((a, b) => rank[a.tone] - rank[b.tone] || Number(!!b.urgent) - Number(!!a.urgent) || b.tick - a.tick || a.key.localeCompare(b.key));
}

/** Enemy missiles and drones landing on the player's ground in the latest tick. */
function raids(s: Situation): Card[] {
  const enemies = new Set(s.d.enemies);
  const mine = s.nationIds.indexOf(s.me);
  const byPlace = new Map<string, { fired: number; intercepted: number; node: NodeId; by: NationId; kinds: Set<'missile' | 'drone'> }>();
  let fired = 0, intercepted = 0, last = -1;
  const missiles = { missile: 0, drone: 0 };
  for (const e of s.recent) {
    if (e.type !== 'strike' || e.tick < s.tick - 1 || !enemies.has(e.by) || s.control[e.target] !== mine) continue;
    const kind = RAID_KINDS[s.munitionKind(e.munition) ?? 'shell'];
    if (!kind) continue;
    const place = bare(s.namer.place.name(e.target));
    const p = byPlace.get(place) ?? { fired: 0, intercepted: 0, node: e.target, by: e.by, kinds: new Set() };
    p.fired += e.fired;
    p.intercepted += e.intercepted;
    p.kinds.add(kind);
    byPlace.set(place, p);
    fired += e.fired;
    intercepted += e.intercepted;
    missiles[kind] += e.fired;
    last = Math.max(last, e.tick);
  }
  if (!fired) return [];
  const places = [...byPlace.entries()].sort((a, b) => b[1].fired - a[1].fired || a[0].localeCompare(b[0]));
  const [target, head] = places[0];
  const what = [missiles.missile && plural(missiles.missile, 'missile'), missiles.drone && plural(missiles.drone, 'drone')].filter(Boolean).join(' and ');
  const others = places.length - 1;
  const also = others ? ` Also hit: ${places.slice(1, 1 + RAID_PLACES).map(([p]) => p).join(', ')}${others > RAID_PLACES ? ` and ${others - RAID_PLACES} more` : ''}.` : '';
  return [{
    key: `raid|${last}`, topic: 'threat', role: null, tone: 'live', tick: last, node: head.node,
    title: `${missiles.missile ? 'Missile' : 'Drone'} raid on ${target}`,
    text: `${what} from ${s.namer.nation(head.by)}. ${plural(intercepted, 'shot down', 'shot down')}.${also}`,
    meter: { value: intercepted / fired, tone: 'red' },
    primary: { kind: 'show', label: 'Show me', node: head.node },
  }];
}

function nuclear(s: Situation): Card[] {
  const out: Card[] = [];
  const enemies = new Set(s.d.enemies);
  for (const e of s.recent) {
    if (e.type === 'nuclear_detonation') {
      out.push({
        key: `nuke|${e.node}|${e.tick}`, topic: 'nuclear', role: null, tone: 'live', tick: e.tick, node: e.node,
        title: `Nuclear detonation ${s.namer.place.at(e.node)}`,
        text: `${s.namer.nation(e.by)}, ${e.yieldKt.toLocaleString('en-US')} kt. About ${e.casualties.toLocaleString('en-US')} casualties.`,
        primary: { kind: 'show', label: 'Show me', node: e.node },
      });
    }
    if (e.type === 'nuclear_alert' && e.stage === 'ordered' && enemies.has(e.nation)) {
      const name = s.namer.nation(e.nation);
      const alert = s.d.nuclear.alert;
      const answer: Action | undefined = alert.canOrder
        ? { kind: 'command', label: 'Raise our alert', command: { type: 'nuclear_alert', nation: s.me, reason: `answering the alert ordered by ${name}` } }
        : undefined;
      out.push({
        key: `nalert|${e.nation}|${e.tick}`, topic: 'nuclear', role: 'security', tone: 'advice', tick: e.tick, urgent: true,
        title: `${name} readies nuclear weapons`,
        text: `${name} has ordered warheads mated to its launchers (${e.reason}).${answer ? ` We hold ${plural(alert.stored, 'warhead')} in storage.` : ' We have no nuclear answer of our own.'}`,
        ask: answer ? 'Mate our own warheads, so a strike on us can be answered.' : undefined,
        cost: answer ? { label: 'Risk', text: `${name} may read it as preparation to strike first` } : undefined,
        figure: { value: alert.mated.toLocaleString('en-US'), caption: 'of our warheads ready now' },
        primary: answer, secondary: { kind: 'later', label: 'Hold' },
      });
    }
  }
  return out;
}

/** An ally invokes a treaty: the player's to answer before the deadline. */
function treatyCalls(s: Situation): Card[] {
  return s.d.treatyCalls.map((c) => {
    const aggressor = s.namer.nation(c.aggressor), victim = s.namer.nation(c.victim), treaty = treatyName(c.treaty);
    const nuclearFoe = (s.nations.get(c.aggressor)?.warheads ?? 0) > 0;
    const shield = (s.nations.get(s.me)?.warheads ?? 0) > 0 || s.d.enemies.some((e) => e === c.aggressor) || [...s.nations.values()].some((n) => n.id !== c.aggressor && n.warheads > 0 && atWar(s, n.id, c.aggressor));
    const join = !nuclearFoe || shield;
    const days = Math.max(0, Math.round(((c.dueTick - s.tick) * s.dtHours) / 24));
    const yes: Action = { kind: 'command', label: 'Go to war', command: { type: 'answer_treaty', nation: s.me, war: c.war, treaty: c.treaty, join: true } };
    const no: Action = { kind: 'command', label: 'Stand aside', command: { type: 'answer_treaty', nation: s.me, war: c.war, treaty: c.treaty, join: false } };
    return {
      key: `treaty|${c.war}|${c.treaty}|${c.reconsidered ? 2 : 1}`, topic: 'diplomacy', role: 'foreign', tone: 'advice', tick: s.tick, urgent: true,
      title: `${victim} invokes the ${treaty}`,
      text: `${aggressor} has attacked ${victim}, which calls on us to fight${c.reconsidered ? ', asking again after our refusal' : ''}. ${join ? 'Our word is our deterrent: I advise we honour it.' : `${aggressor} has nuclear weapons and no nuclear power fights beside ${victim} yet: I advise we stand aside for now.`}`,
      ask: join ? `Enter the war beside ${victim}.` : `Stay out of the war between ${aggressor} and ${victim}.`,
      cost: { label: 'Risk', text: join ? `War with ${aggressor} and its allies` : `Allies may doubt the ${treaty}` },
      figure: { value: String(days), unit: days === 1 ? 'day' : 'days', caption: 'to answer' },
      chip: `Answer within ${days} ${days === 1 ? 'day' : 'days'}`,
      primary: join ? yes : no, secondary: join ? no : yes,
    } satisfies Card;
  });
}

function atWar(s: Situation, a: NationId, b: NationId): boolean {
  return s.d.wars.some((w) => {
    const side = (n: NationId) => (w.sides[0].some((m) => m.nation === n) ? 0 : w.sides[1].some((m) => m.nation === n) ? 1 : -1);
    const sa = side(a), sb = side(b);
    return sa >= 0 && sb >= 0 && sa !== sb;
  });
}

/** An enemy offers an armistice on current lines. */
function peaceOffers(s: Situation): Card[] {
  const n = s.nations.get(s.me);
  const lost = s.d.nodesHome ? 1 - s.d.nodesHeld / s.d.nodesHome : 0;
  return s.d.peaceOffers.filter((o) => o.to === s.me).map((o) => {
    const them = s.namer.nation(o.from);
    const take = lost > 0.03 || (n?.warSupport ?? 1) < 0.4;
    const accept: Action = { kind: 'command', label: 'Accept peace', command: { type: 'offer_peace', nation: s.me, target: o.from } };
    return {
      key: `peace|${o.from}`, topic: 'diplomacy', role: 'foreign', tone: 'advice', tick: s.tick,
      title: `${them} offers an armistice`,
      text: `${them} proposes a ceasefire on the current lines. ${take ? `We hold ${pct(1 - lost)} of our land and war support is ${pct(n?.warSupport ?? 0)}: I advise we take it.` : 'We are holding our ground: I advise we fight on. The offer stays open.'}`,
      ask: take ? `Sign an armistice with ${them} on today's lines.` : `Fight on; ${them}'s offer stays open.`,
      cost: { label: 'Risk', text: take ? `Ground ${them} holds stays in its hands` : 'More losses while the war goes on' },
      figure: { value: pct(1 - lost).replace('%', ''), unit: '%', caption: 'of our land held' },
      primary: take ? accept : { kind: 'later', label: 'Fight on' },
      secondary: take ? { kind: 'later', label: 'Fight on' } : accept,
    } satisfies Card;
  });
}

/** The engine's answers to the player's own orders: a refusal, or an order still moving down a degraded chain. */
function orderAnswers(s: Situation): Card[] {
  const latest = new Map<string, Extract<SimEvent, { type: 'command_result' }>>();
  for (const e of s.recent) if (e.type === 'command_result' && e.nation === s.me && e.command === 'order' && e.formation) latest.set(e.formation, e);
  const out: Card[] = [];
  for (const [id, e] of latest) {
    const f = s.formations.find((x) => x.entry.id === id);
    const node = f?.node ?? (0 as NodeId);
    const name = s.namer.formation(id as FormationId) ?? 'A formation';
    const open: Action = { kind: 'unit', label: 'Open unit', formation: id as FormationId, node };
    if (!e.ok) {
      out.push({
        key: `refused|${id}|${e.tick}`, topic: 'command', role: 'chief', tone: 'advice', tick: e.tick, node,
        title: `${name} cannot carry out your order`, text: describeResult(e, s.namer).replace(/^[^:]+: /, ''),
        primary: open, secondary: { kind: 'later', label: 'Dismiss' },
      });
    } else if (e.code === 'relayed') {
      const left = Math.max(0, (e.etaHours ?? 0) - (s.tick - e.tick) * s.dtHours);
      out.push({
        key: `relayed|${id}|${e.tick}`, topic: 'command', role: 'chief', tone: 'report', tick: e.tick, node,
        title: `Order in transit to ${name}`,
        text: `Our chain of command is degraded: the order reaches ${name} in about ${Math.max(1, Math.round(left))} h.`,
        primary: open,
      });
    }
  }
  return out;
}

/** Shells run short at the current rate of fire, and the shell line that can still surge. */
function shells(s: Situation): Card[] {
  const eco = s.d.economy;
  if (!s.ammoPerDay || s.ammoPerDay <= 0 || !eco) return [];
  const weeks = s.d.bulk.ammo / s.ammoPerDay / 7;
  if (weeks >= 8) return [];
  const best = Object.entries(eco.capacity)
    .filter(([item, c]) => SHELLS.has(item) && c.surge > c.perMonth * 1.05)
    .sort((a, b) => b[1].surge - b[1].perMonth - (a[1].surge - a[1].perMonth) || a[0].localeCompare(b[0]))[0];
  const ordered = best && eco.lines.find((l) => l.item === best[0])?.ordered;
  const rate = best ? Math.round(best[1].surge) : 0;
  const act: Action | undefined = best && ordered !== rate
    ? { kind: 'command', label: 'Order more shells', command: { type: 'produce', nation: s.me, item: best[0] as never, ratePerMonth: rate } }
    : undefined;
  const extra = best ? rate - best[1].perMonth : 0;
  const w = Math.max(1, Math.round(weeks));
  return [{
    key: `shells|${w}`, topic: 'supply', role: 'economy', tone: 'advice', tick: s.tick,
    title: `Artillery shells run out in ${plural(w, 'week')}`,
    text: `At this rate of fire our guns run dry in about ${plural(w, 'week')}. ${act ? `The ${s.namer.item(best![0])} line can still surge to ${rate.toLocaleString('en-US')} a month.` : 'Every shell line is already at its limit.'}`,
    ask: act ? `Order ${s.namer.item(best![0])} at the line's full surge rate.` : undefined,
    cost: act ? { label: 'Cost', text: `+${Math.round(extra).toLocaleString('en-US')} shells a month · about $${((extra * s.unitCostUsdM(best![0])) / 1000).toFixed(1)}B a month` } : undefined,
    figure: { value: String(w), unit: 'wks', caption: 'of shells left' },
    primary: act ?? { kind: 'open', label: 'Economy', drawer: 'nation' },
    secondary: act ? { kind: 'open', label: 'Details', drawer: 'nation' } : { kind: 'later', label: 'Noted' },
  }];
}

const SUPPLY_WORD: Record<string, string> = { fuel: 'fuel', ammo: 'ammunition', food: 'rations' };
const RESOURCE_WORD: Record<string, string> = { energy: 'energy', oil: 'oil', food: 'food', semiconductors: 'semiconductors', rare_earths: 'rare earths', energetics: 'explosives and propellant', steel: 'steel' };

function shortages(s: Situation): Card[] {
  const front = [...new Set(s.recent.filter((e) => e.type === 'shortage' && e.nation === s.me && SUPPLY_WORD[e.what]).map((e) => (e as { what: string }).what))].sort();
  const industry = [...(s.d.economy?.short ?? [])].sort();
  const out: Card[] = [];
  if (front.length) {
    out.push({
      key: `front-short|${front.join(',')}`, topic: 'supply', role: 'chief', tone: 'advice', tick: s.tick,
      title: `The front is short of ${front.map((w) => SUPPLY_WORD[w]).join(' and ')}`,
      text: 'Units are drawing more than the nation holds, so supply to the front is rationed and units fight below strength.',
      primary: { kind: 'open', label: 'Economy', drawer: 'nation' }, secondary: { kind: 'later', label: 'Noted' },
    });
  }
  if (industry.length) {
    out.push({
      key: `industry-short|${industry.join(',')}`, topic: 'supply', role: 'economy', tone: 'report', tick: s.tick,
      title: `Industry is short of ${industry.map((r) => RESOURCE_WORD[r] ?? r.replace(/_/g, ' ')).join(', ')}`,
      text: 'Factories that need it run at reduced output until supply recovers.',
      primary: { kind: 'open', label: 'Details', drawer: 'nation' },
    });
  }
  return out;
}

/** The nearest own manoeuvre formation free to send to `node`: one in reserve, else (in peacetime) one off the threatened border. */
function nearestFree(s: Situation, node: NodeId, free: (f: FormationView) => boolean): { f: FormationView; km: number } | undefined {
  const { map } = s;
  return s.formations
    .filter((f) => f.entry.nation === s.me && f.entry.kind === MANEUVER && f.status === 'active' && !map.isSea(f.node) && free(f))
    .map((f) => ({ f, km: map.distanceKm(f.node, node) }))
    .sort((a, b) => a.km - b.km || a.f.entry.id.localeCompare(b.f.entry.id))[0];
}

interface BuildUp {
  key: string;
  place: string;
  node: NodeId;
  from: NationId;
  text: string;
  figure: NonNullable<Card['figure']>;
  reserve: { f: FormationView; km: number } | undefined;
}

function buildUpCard(s: Situation, b: BuildUp): Card {
  const { reserve } = b;
  const send: Action | undefined = reserve
    ? { kind: 'command', label: 'Reinforce', command: { type: 'order', nation: s.me, formation: reserve.f.entry.id, order: { posture: 'move', target: b.node } } }
    : undefined;
  return {
    key: b.key, topic: 'threat', role: 'intel', tone: 'advice', tick: s.tick, node: b.node,
    title: `Build-up near ${b.place}`,
    text: b.text,
    ask: reserve ? `Move ${reserve.f.entry.name} up to ${b.place}.` : undefined,
    cost: reserve ? { label: 'Cost', text: `${reserve.f.entry.name} leaves the ${reserve.f.posture === 'reserve' ? 'reserve' : 'line it holds'}, ${Math.round(reserve.km)} km away` } : undefined,
    figure: b.figure,
    chip: 'Intelligence',
    primary: send ?? { kind: 'show', label: 'Show me', node: b.node },
    secondary: send ? { kind: 'show', label: 'Show me', node: b.node } : { kind: 'later', label: 'Noted' },
  };
}

/** The wording of intel's indications-and-warning message (systems/intel WARN_RISE), the only way the player is told. */
const WARNING = /^warning: (\w+) forces massing on the border of (\w+), about (\d+) platforms against (\d+)/;

/**
 * In peacetime: the build-up the player's intelligence has warned of, placed at the stretch of its
 * border facing the most contacts of the nation massing. Reads the warning message the player was
 * sent and its own contacts, nothing else.
 */
function warned(s: Situation): BuildUp[] {
  const { map } = s;
  let w: RegExpExecArray | null = null;
  for (const e of s.recent) if (e.type === 'message' && e.nation === s.me) w = WARNING.exec(e.text) ?? w;
  if (!w || w[2] !== s.me || s.d.enemies.includes(w[1] as NationId)) return [];
  const from = w[1] as NationId;
  const [mine, theirs] = [s.nationIds.indexOf(s.me), s.nationIds.indexOf(from)];
  const contacts = new Map<NodeId, number>();
  for (const f of s.formations) if (f.entry.nation === from && f.entry.kind === MANEUVER && !map.isSea(f.node)) contacts.set(f.node, (contacts.get(f.node) ?? 0) + 1);
  const facing = new Set<NodeId>();
  let node: NodeId | null = null, most = -1;
  for (let n = 0 as NodeId; n < map.landCount; n++) {
    if (s.control[n] !== mine) continue;
    let near = 0, border = false;
    for (let i = map.adjStart[n]; i < map.adjStart[n + 1]; i++) {
      const m = map.adj[i] as NodeId;
      if (s.control[m] !== theirs) continue;
      border = true;
      near += contacts.get(m) ?? 0;
    }
    if (!border) continue;
    facing.add(n);
    if (near > most) [node, most] = [n, near];
  }
  if (node === null) return [];
  const [strength, baseline] = [Number(w[3]), Number(w[4])];
  const place = bare(s.namer.place.name(node));
  const them = s.namer.nation(from);
  return [{
    key: `warning|${from}`, place, node, from,
    text: `Our intelligence warns of ${them} forces massing on our border: about ${plural(strength, 'platform')} near our ground, against ${baseline.toLocaleString('en-US')} a week ago. No shot has been fired.`,
    figure: { value: (strength / Math.max(1, baseline)).toFixed(1), unit: 'x', caption: 'their strength on our border against the week before' },
    reserve: nearestFree(s, node, (f) => f.posture === 'reserve' || !facing.has(f.node)),
  }];
}

/**
 * At war: enemy formations the player's intelligence holds massed against one stretch of its
 * front, against what it holds there. Reads only the formations in the player's own snapshot,
 * enemy ones as its contacts.
 */
function concentration(s: Situation): BuildUp[] {
  const { map } = s;
  const mine = s.nationIds.indexOf(s.me);
  const enemies = new Set(s.d.enemies);
  if (!enemies.size) return [];
  const own = new Map<NodeId, number>();
  for (const f of s.formations) if (f.entry.nation === s.me && f.entry.kind === MANEUVER && f.status === 'active') own.set(f.node, (own.get(f.node) ?? 0) + 1);
  const sectors = new Map<string, { enemy: number; mine: Set<NodeId>; hottest: NodeId; at: Map<NodeId, number>; by: Map<NationId, number> }>();
  for (const f of s.formations) {
    if (!enemies.has(f.entry.nation) || f.entry.kind !== MANEUVER || f.status !== 'active' || map.isSea(f.node)) continue;
    let front: NodeId | null = null;
    for (let i = map.adjStart[f.node]; i < map.adjStart[f.node + 1]; i++) {
      const m = map.adj[i] as NodeId;
      if (s.control[m] === mine && (front === null || m < front)) front = m;
    }
    if (front === null) continue;
    const place = bare(s.namer.place.name(front));
    const sec = sectors.get(place) ?? { enemy: 0, mine: new Set(), hottest: front, at: new Map(), by: new Map() };
    sec.by.set(f.entry.nation, (sec.by.get(f.entry.nation) ?? 0) + 1);
    sec.enemy++;
    sec.mine.add(front);
    sec.at.set(front, (sec.at.get(front) ?? 0) + 1);
    if ((sec.at.get(front) ?? 0) > (sec.at.get(sec.hottest) ?? 0)) sec.hottest = front;
    sectors.set(place, sec);
  }
  let worst: { place: string; enemy: number; ours: number; ratio: number; node: NodeId; from: NationId } | null = null;
  for (const [place, sec] of sectors) {
    let ours = 0;
    const counted = new Set<NodeId>();
    for (const n of sec.mine) {
      for (const m of [n, ...Array.from(map.adj.subarray(map.adjStart[n], map.adjStart[n + 1]))] as NodeId[]) {
        if (counted.has(m) || s.control[m] !== mine) continue;
        counted.add(m);
        ours += own.get(m) ?? 0;
      }
    }
    const ratio = sec.enemy / Math.max(1, ours);
    if (sec.enemy < 4 || ratio < 2) continue;
    const from = [...sec.by.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    if (!worst || ratio > worst.ratio || (ratio === worst.ratio && place < worst.place)) worst = { place, enemy: sec.enemy, ours, ratio, node: sec.hottest, from };
  }
  if (!worst) return [];
  const w = worst;
  return [{
    key: `massing|${w.place}`, place: w.place, node: w.node, from: w.from,
    text: `${s.namer.nation(w.from)} has ${plural(w.enemy, 'formation')} massed on our line near ${w.place}, against ${w.ours ? `our ${w.ours}` : 'none of our manoeuvre units'}.`,
    figure: { value: w.ratio.toFixed(1), unit: ':1', caption: 'their strength to ours' },
    reserve: nearestFree(s, w.node, (f) => f.posture === 'reserve'),
  }];
}

/** A build-up against the player: warned of in peacetime, or seen massing on the front at war. */
function massing(s: Situation): Card[] {
  return [...warned(s), ...concentration(s)].map((b) => buildUpCard(s, b));
}

/** Cities changing hands, the moments that should feel like something. */
function cities(s: Situation): Card[] {
  const out: Card[] = [];
  for (const e of s.recent) {
    if (e.type !== 'node_captured' || !isCity(s.map, e.node) || (e.from !== s.me && e.to !== s.me) || e.tick < s.tick - 4) continue;
    const place = bare(s.namer.place.name(e.node));
    const lost = e.from === s.me;
    out.push({
      key: `city|${e.node}|${e.tick}`, topic: lost ? 'threat' : 'opportunity', role: lost ? null : 'chief', tone: lost ? 'live' : 'report', tick: e.tick, node: e.node,
      title: lost ? `${place} has fallen` : `We have taken ${place}`,
      text: lost ? `${s.namer.nation(e.to)} holds ${place}.` : `${place} is ours. ${s.namer.nation(e.from)} has pulled back.`,
      primary: { kind: 'show', label: 'Show me', node: e.node },
    });
  }
  return out;
}

/** Trained reserves too thin to refill the front, while the public would bear more call-ups. */
function reserves(s: Situation): Card[] {
  const n = s.nations.get(s.me);
  const tolerance = s.d.homeFront.mobilizationTolerance;
  if (!n || !s.d.enemies.length || (s.d.mobilizationTarget ?? 0) > n.mobilization + 0.005 || tolerance === null || n.mobilization + 0.05 > tolerance) return [];
  if (n.reserves >= 0.15 * s.d.personnel) return [];
  const level = Math.round(Math.min(tolerance, n.mobilization + 0.1) * 100) / 100;
  return [{
    key: `mobilise|${level}`, topic: 'supply', role: 'chief', tone: 'advice', tick: s.tick,
    title: 'Reserves will not refill the front',
    text: `Trained reserves are down to ${Math.round(n.reserves / 1000).toLocaleString('en-US')}k, against ${Math.round(s.d.personnel / 1000).toLocaleString('en-US')}k in the field. The public would accept mobilisation up to ${pct(tolerance)}.`,
    ask: `Raise mobilisation from ${pct(n.mobilization)} to ${pct(level)}.`,
    cost: { label: 'Risk', text: 'War support falls as call-ups bite' },
    figure: { value: String(Math.round(n.reserves / 1000)), unit: 'k', caption: 'trained reserves' },
    primary: { kind: 'command', label: `Mobilise to ${pct(level)}`, command: { type: 'set_mobilization', nation: s.me, level } },
    secondary: { kind: 'later', label: 'Not now' },
  }];
}

/** Wars and peace that change the player's war, as one-line wire reports; one day's declarations against one nation fold into one line. */
function wire(s: Situation): Card[] {
  const out: Card[] = [];
  const mineOrFoe = (n: NationId) => n === s.me || s.d.enemies.includes(n);
  const declared = new Map<string, { on: NationId; tick: number; by: NationId[] }>();
  for (const e of s.recent) {
    if (e.tick < s.tick - 8) continue;
    let text: string | null = null;
    if (e.type === 'war_declared' && (e.on === s.me || e.by === s.me || s.d.enemies.includes(e.on))) {
      const key = `${Math.floor((e.tick * s.dtHours) / 24)}|${e.on}`;
      const day = declared.get(key) ?? { on: e.on, tick: e.tick, by: [] };
      day.by.push(e.by);
      day.tick = Math.max(day.tick, e.tick);
      declared.set(key, day);
    } else if (e.type === 'peace' && (mineOrFoe(e.a) || mineOrFoe(e.b))) text = `${s.namer.nation(e.a)} and ${s.namer.nation(e.b)} make peace.`;
    else if (e.type === 'capitulation' && (e.nation === s.me || s.d.enemies.includes(e.nation) || e.to.includes(s.me))) text = `${s.namer.nation(e.nation)} capitulates.`;
    if (text) out.push({ key: `wire|${e.type}|${e.tick}|${text}`, topic: 'news', role: null, tone: 'report', tick: e.tick, title: text, text: '' });
  }
  for (const [key, day] of declared) {
    const names = day.by.map((n) => s.namer.nation(n));
    const on = s.namer.nation(day.on);
    const title = names.length === 1
      ? `${names[0]} declares war on ${on}.`
      : `${names.length} nations declare war on ${on}: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}.`;
    out.push({ key: `wire|war|${key}|${names.length}`, topic: 'news', role: null, tone: 'report', tick: day.tick, title, text: '' });
  }
  return out;
}

const SOURCES: readonly ((s: Situation) => Card[])[] = [raids, nuclear, cities, treatyCalls, peaceOffers, massing, shells, reserves, orderAnswers, shortages, wire];

export interface Answer {
  ok: boolean;
  text: string;
  /** False while an order is still in transit; the final answer follows. */
  final: boolean;
}

/**
 * How the engine answers a command, read from the player's view after it was sent. The order
 * router answers with a command_result; the other systems answer by changing what the player sees.
 */
export function answerOf(cmd: Command, sentTick: number, s: Pick<Situation, 'me' | 'd' | 'nations' | 'recent' | 'namer'>): Answer | null {
  const after = s.recent.filter((e) => e.tick >= sentTick);
  const name = (n: NationId) => s.namer.nation(n);
  switch (cmd.type) {
    case 'order': case 'delegate': case 'hold': case 'answer_treaty': case 'cyber_op': case 'sabotage': case 'cut_cable': {
      const r = [...after].reverse().find((e) => e.type === 'command_result' && e.nation === s.me && e.command === cmd.type && (cmd.type !== 'order' || e.formation === cmd.formation));
      if (!r || r.type !== 'command_result') return null;
      return { ok: r.ok, text: describeResult(r, s.namer), final: !(r.ok && r.code === 'relayed') };
    }
    case 'produce': {
      const failed = after.find((e) => e.type === 'message' && e.nation === s.me && e.text.includes(cmd.item));
      if (failed && failed.type === 'message') return { ok: false, text: `Production order refused: ${s.namer.item(cmd.item)}`, final: true };
      const line = s.d.economy?.lines.find((l) => l.item === cmd.item && l.ordered === cmd.ratePerMonth);
      return line ? { ok: true, text: `Production order set: ${cmd.ratePerMonth.toLocaleString('en-US')} ${s.namer.item(cmd.item)} a month`, final: true } : null;
    }
    case 'set_mobilization': {
      const n = s.nations.get(s.me);
      const set = (s.d.mobilizationTarget !== null && Math.abs(s.d.mobilizationTarget - cmd.level) < 0.005) || (n && Math.abs(n.mobilization - cmd.level) < 0.005);
      return set ? { ok: true, text: `Mobilisation ordered to ${pct(cmd.level)}`, final: true } : null;
    }
    case 'offer_peace': {
      if (after.some((e) => e.type === 'peace' && ((e.a === s.me && e.b === cmd.target) || (e.b === s.me && e.a === cmd.target)))) return { ok: true, text: `Armistice signed with ${name(cmd.target)}`, final: true };
      return s.d.peaceOffers.some((o) => o.from === s.me && o.to === cmd.target) ? { ok: true, text: `Peace offer delivered to ${name(cmd.target)}`, final: true } : null;
    }
    case 'nuclear_alert':
      return after.some((e) => e.type === 'nuclear_alert' && e.nation === s.me) || s.d.nuclear.alert.ordered ? { ok: true, text: 'Warheads are being mated to launchers', final: true } : null;
    case 'sanction':
      return s.d.sanctions.includes(cmd.target) === cmd.on ? { ok: true, text: `Sanctions on ${name(cmd.target)} ${cmd.on ? 'in force' : 'lifted'}`, final: true } : null;
    case 'declare_war':
      return after.some((e) => e.type === 'war_declared' && e.by === s.me && e.on === cmd.target) ? { ok: true, text: `At war with ${name(cmd.target)}`, final: true } : null;
    case 'nuclear_release': {
      const refused = after.find((e) => e.type === 'message' && e.nation === s.me && /^nuclear release refused/.test(e.text));
      if (refused && refused.type === 'message') return { ok: false, text: refused.text.replace(/^nuclear release refused: /, 'Release refused: '), final: true };
      const hit = after.find((e) => (e.type === 'nuclear_detonation' && e.by === s.me) || (e.type === 'strike' && e.by === s.me && e.munition === cmd.munition));
      return hit ? { ok: true, text: 'Launch confirmed', final: true } : null;
    }
    case 'grant_access': case 'set_aid': case 'raise_formation':
      return null;
  }
}

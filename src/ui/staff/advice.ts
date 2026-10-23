/**
 * What the player's staff brings to the table: the cards behind the crises (a treaty call, an
 * enemy nuclear alert, an armistice offer, a threat to the capital) and the live alerts (a raid,
 * a nuclear detonation, a city or a formation lost, a war declared on us), built only from the
 * player's own view (its snapshot, its nation detail, and the events it was sent), plus how the
 * engine's answer to a crisis's command is recognised.
 * Pure and deterministic: the same situation always gives the same cards in the same order.
 */
import type { GameMap } from '../../core/map';
import type { Command, FormationId, MunitionKind, NationId, NodeId, SimEvent } from '../../core/types';
import { allianceById } from '../../data/nations/alliances';
import { describeResult, treatyName, type Namer } from '../events';
import type { FormationView, NationDetail, NationSummary } from '../snapshot';

/** A place "Show me" draws on the map: an impact, with the direction it came from, or a site to look at. */
export interface Mark {
  to: NodeId;
  from?: NodeId;
}

export type Action =
  | { kind: 'command'; label: string; command: Command }
  | { kind: 'show'; label: string; node: NodeId; marks?: Mark[] }
  | { kind: 'unit'; label: string; formation: FormationId; node: NodeId }
  | { kind: 'later'; label: string };
export type CommandAction = Extract<Action, { kind: 'command' }>;

export type Topic = 'threat' | 'diplomacy' | 'nuclear';

export interface Card {
  /** Stable while the card means the same thing, so dismissing it sticks. */
  key: string;
  topic: Topic;
  /** live: happening now, raised as an alert; advice: a decision, put to the player as a crisis. */
  tone: 'live' | 'advice';
  title: string;
  text: string;
  /** The recommendation in one sentence. */
  ask?: string;
  cost?: { label: 'Cost' | 'Risk'; text: string };
  /** The headline figure. */
  figure?: { value: string; unit?: string; caption: string };
  node?: NodeId;
  primary?: Action;
  secondary?: Action;
  /** Cannot wait: skips the daily allowance and may stop the clock as a crisis. */
  urgent?: boolean;
  tick: number;
}

export const isDecision = (c: Card): boolean => c.primary?.kind === 'command';

export interface Situation {
  me: NationId;
  /** Opening wars already being fought when the scenario starts, as "aggressor>target": no news when declared at the first tick. */
  ongoing: ReadonlySet<string>;
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
  namer: Namer;
}

export const RECENT_TICKS = 16;

/** Munitions that make an air raid: missiles and one-way drones, not artillery. */
const RAID_KINDS: Partial<Record<MunitionKind, 'missile' | 'drone'>> = {
  srbm: 'missile', mrbm: 'missile', irbm: 'missile', icbm: 'missile', slbm: 'missile', hgv: 'missile', cruise: 'missile',
  antiship_cruise: 'missile', antiship_ballistic: 'missile', arm: 'missile', loitering: 'drone', drone_oneway: 'drone',
};
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

const capitalOf = (s: Situation, nation: NationId) => s.map.data.nations[s.nationIds.indexOf(nation)]?.capital?.cell as NodeId | undefined;

/** Every card the staff has for the player now: live alerts first, then decisions. */
export function advise(s: Situation): Card[] {
  const cards = SOURCES.flatMap((source) => source(s));
  const rank = { live: 0, advice: 1 } as const;
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
  const marks = places.slice(0, 1 + RAID_PLACES).map(([, p]) => ({ to: p.node, from: launchSide(s, p.by, p.node) }));
  return [{
    key: `raid|${last}`, topic: 'threat', tone: 'live', tick: last, node: head.node,
    title: `${missiles.missile ? 'Missile' : 'Drone'} raid on ${target}`,
    text: `${what} from ${s.namer.nation(head.by)} in the last ${s.dtHours} hours. ${plural(intercepted, 'shot down', 'shot down')}.${also}`,
    primary: { kind: 'show', label: 'Show me', node: head.node, marks },
  }];
}

/**
 * Where a raid came from, as the player can know it: the attacker's ground nearest the target.
 * The launchers themselves are rarely seen, so the map draws the track from that side.
 */
function launchSide(s: Situation, by: NationId, target: NodeId): NodeId | undefined {
  const i = s.nationIds.indexOf(by);
  let best: NodeId | undefined, km = Infinity;
  for (let n = 0 as NodeId; n < s.map.landCount; n++) {
    if (s.control[n] !== i) continue;
    const d = s.map.distanceKm(n, target);
    if (d < km) [best, km] = [n, d];
  }
  return best;
}

/** The enemy's nuclear-capable launchers the player's intelligence holds: strategic forces and missile brigades. */
function launchSites(s: Situation, by: NationId): Mark[] {
  return s.formations.filter((f) => f.entry.nation === by && f.contact && (f.entry.kind === 'strategic' || f.entry.kind === 'missile'))
    .map((f) => ({ to: f.node })).slice(0, 12);
}

function nuclear(s: Situation): Card[] {
  const out: Card[] = [];
  const enemies = new Set(s.d.enemies);
  for (const e of s.recent) {
    if (e.type === 'nuclear_detonation') {
      out.push({
        key: `nuke|${e.node}|${e.tick}`, topic: 'nuclear', tone: 'live', tick: e.tick, node: e.node,
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
      const sites = launchSites(s, e.nation);
      const at = sites[0]?.to ?? capitalOf(s, e.nation);
      const ours = answer
        ? ` We hold ${plural(alert.stored, 'warhead')} in storage.`
        : alert.mated ? ` Our ${plural(alert.mated, 'warhead')} on launchers already answer any strike on us.` : ' We have no nuclear weapons of our own; our allies hold the deterrent.';
      out.push({
        key: `nalert|${e.nation}|${e.tick}`, topic: 'nuclear', tone: 'advice', tick: e.tick, urgent: true, node: at,
        title: `${name} readies nuclear weapons`,
        text: `${name} has ordered warheads mated to its launchers (${e.reason}).${ours}`,
        ask: answer ? 'Mate our own warheads, so a strike on us can be answered.' : alert.mated ? 'Stand firm: change nothing they could read as a threat.' : undefined,
        cost: answer ? { label: 'Risk', text: `${name} may read it as preparation to strike first` } : undefined,
        figure: { value: alert.mated.toLocaleString('en-US'), caption: 'of our warheads ready now' },
        primary: answer, secondary: at !== undefined ? { kind: 'show', label: 'Show their launchers', node: at, marks: sites.length ? sites : [{ to: at }] } : { kind: 'later', label: 'Hold' },
      });
    }
  }
  return out;
}

/**
 * Whether a treaty obliges its members to fight once triggered. The Taiwan Relations Act
 * (obligation 'ambiguous') does not: it commits the US to help Taiwan defend itself, so a call
 * under it is a request, not a debt of honour.
 */
export const bindsToFight = (treaty: string) => {
  const o = allianceById[treaty]?.obligation;
  return o === undefined || o === 'collective_defense' || o === 'bilateral_defense';
};

/** An ally invokes a treaty: the player's to answer before the deadline. */
function treatyCalls(s: Situation): Card[] {
  return s.d.treatyCalls.map((c) => {
    const aggressor = s.namer.nation(c.aggressor), victim = s.namer.nation(c.victim), treaty = treatyName(c.treaty);
    const binding = bindsToFight(c.treaty);
    const nuclearFoe = (s.nations.get(c.aggressor)?.warheads ?? 0) > 0;
    const shield = (s.nations.get(s.me)?.warheads ?? 0) > 0 || s.d.enemies.some((e) => e === c.aggressor) || [...s.nations.values()].some((n) => n.id !== c.aggressor && n.warheads > 0 && atWar(s, n.id, c.aggressor));
    const join = !nuclearFoe || shield;
    const days = Math.max(0, Math.round(((c.dueTick - s.tick) * s.dtHours) / 24));
    const yes: Action = { kind: 'command', label: 'Go to war', command: { type: 'answer_treaty', nation: s.me, war: c.war, treaty: c.treaty, join: true } };
    const no: Action = { kind: 'command', label: 'Stand aside', command: { type: 'answer_treaty', nation: s.me, war: c.war, treaty: c.treaty, join: false } };
    return {
      key: `treaty|${c.war}|${c.treaty}|${c.reconsidered ? 2 : 1}`, topic: 'diplomacy', tone: 'advice', tick: s.tick, urgent: true,
      title: binding ? `${victim} invokes the ${treaty}` : `${victim} asks us to fight`,
      text: binding
        ? `${aggressor} has attacked ${victim}, which calls on us to fight${c.reconsidered ? ', asking again after our refusal' : ''}. ${join ? 'Our word is our deterrent: I advise we honour it.' : `${aggressor} has nuclear weapons and no nuclear power fights beside ${victim} yet: I advise we stand aside for now.`}`
        : `${aggressor} has attacked ${victim}, which asks us to fight${c.reconsidered ? ' again after our refusal' : ''}. The ${treaty} does not bind us to war; the choice is ours. ${join ? `Every partner in the region will judge us by it: I advise we go in.` : `${aggressor} has nuclear weapons and no nuclear power fights beside ${victim} yet: I advise we stand aside for now.`}`,
      ask: join ? `Enter the war beside ${victim}.` : `Stay out of the war between ${aggressor} and ${victim}.`,
      cost: { label: 'Risk', text: join ? `War with ${aggressor} and its allies` : binding ? `Allies may doubt the ${treaty}` : `Partners in the region may doubt us` },
      figure: { value: String(days), unit: days === 1 ? 'day' : 'days', caption: 'to answer' },
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
      key: `peace|${o.from}`, topic: 'diplomacy', tone: 'advice', tick: s.tick,
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

/** A city of ours falling. */
function citiesLost(s: Situation): Card[] {
  const out: Card[] = [];
  for (const e of s.recent) {
    if (e.type !== 'node_captured' || !isCity(s.map, e.node) || e.from !== s.me || e.tick < s.tick - 4) continue;
    const place = bare(s.namer.place.name(e.node));
    out.push({
      key: `city|${e.node}|${e.tick}`, topic: 'threat', tone: 'live', tick: e.tick, node: e.node,
      title: `${place} has fallen`,
      text: `${s.namer.nation(e.to)} holds ${place}.`,
      primary: { kind: 'show', label: 'Show me', node: e.node },
    });
  }
  return out;
}

/** How close enemy manoeuvre units must stand to the capital, by the player's own contacts, before it counts as threatened. */
const CAPITAL_THREAT_KM = 120;

/**
 * Enemy formations the player's intelligence holds within striking distance of its capital: a
 * decision-grade moment, at most once a week. Reads only the player's contacts.
 */
function capitalThreat(s: Situation): Card[] {
  if (!s.d.enemies.length) return [];
  const cap = capitalOf(s, s.me);
  if (cap === undefined) return [];
  const enemies = new Set(s.d.enemies);
  const near = s.formations
    .filter((f) => enemies.has(f.entry.nation) && f.entry.kind === MANEUVER && f.status === 'active' && !s.map.isSea(f.node))
    .map((f) => ({ f, km: s.map.distanceKm(f.node, cap) }))
    .filter((x) => x.km <= CAPITAL_THREAT_KM);
  if (!near.length) return [];
  const city = bare(s.namer.place.name(cap));
  const closest = Math.round(Math.min(...near.map((x) => x.km)));
  const reserve = s.formations
    .filter((f) => f.entry.nation === s.me && f.entry.kind === MANEUVER && f.status === 'active' && f.posture === 'reserve' && !s.map.isSea(f.node))
    .map((f) => ({ f, km: s.map.distanceKm(f.node, cap) }))
    .filter((x) => x.km > 0)
    .sort((a, b) => a.km - b.km || a.f.entry.id.localeCompare(b.f.entry.id))[0];
  const send: Action | undefined = reserve
    ? { kind: 'command', label: `Send ${reserve.f.entry.name}`, command: { type: 'order', nation: s.me, formation: reserve.f.entry.id, order: { posture: 'move', target: cap } } }
    : undefined;
  const week = Math.floor((s.tick * s.dtHours) / 24 / 7);
  return [{
    key: `capital|${week}`, topic: 'threat', tone: 'advice', tick: s.tick, node: cap, urgent: true,
    title: `${city} is threatened`,
    text: `${plural(near.length, 'enemy formation')} within ${CAPITAL_THREAT_KM} km of ${city}, the nearest ${closest} km out.`,
    ask: reserve ? `Move ${reserve.f.entry.name} into ${city}.` : `Hold ${city} with what is there.`,
    cost: reserve ? { label: 'Cost', text: `${reserve.f.entry.name} leaves the reserve, ${Math.round(reserve.km)} km away` } : undefined,
    figure: { value: String(closest), unit: 'km', caption: 'nearest enemy to the capital' },
    primary: send ?? { kind: 'show', label: 'Show me', node: cap },
    secondary: send ? { kind: 'show', label: 'Show me', node: cap } : { kind: 'later', label: 'Noted' },
  }];
}

/**
 * Blows to the player's own formations that the map alone would not show: a naval group hit
 * (a carrier in port, a lift group at the quay), and any formation struck off.
 */
function losses(s: Situation): Card[] {
  const out: Card[] = [];
  const own = new Map(s.formations.filter((f) => f.entry.nation === s.me).map((f) => [f.entry.id, f]));
  const hits = new Map<FormationId, { hits: number; tick: number; by: NationId; munition: string; target: NodeId }>();
  for (const e of s.recent) {
    if (e.tick < s.tick - 4) continue;
    if (e.type === 'strike' && e.by !== s.me) {
      for (const x of e.effects) {
        if (x.kind !== 'ship_hits' || x.hits <= 0 || !own.has(x.formation)) continue;
        const h = hits.get(x.formation) ?? { hits: 0, tick: e.tick, by: e.by, munition: e.munition, target: e.target };
        h.hits += x.hits;
        h.tick = Math.max(h.tick, e.tick);
        hits.set(x.formation, h);
      }
    } else if (e.type === 'formation_destroyed' && e.nation === s.me) {
      const f = own.get(e.formation);
      const name = s.namer.formation(e.formation) ?? 'A formation';
      out.push({
        key: `lost|${e.formation}`, topic: 'threat', tone: 'live', tick: e.tick, node: f?.node,
        title: `${name} destroyed`, text: `${name} no longer exists as a fighting force.`,
        ...(f ? { primary: { kind: 'show', label: 'Show me', node: f.node } as Action } : {}),
      });
    }
  }
  const gone = new Set(s.recent.filter((e) => e.type === 'formation_destroyed').map((e) => (e as { formation: FormationId }).formation));
  for (const [id, h] of hits) {
    if (gone.has(id)) continue;
    const f = own.get(id)!;
    const name = s.namer.formation(id) ?? f.entry.name;
    const sunk = f.strength <= 0.05;
    out.push({
      key: `shiphit|${id}|${Math.floor((h.tick * s.dtHours) / 24)}`, topic: 'threat', tone: 'live', tick: h.tick, node: f.node,
      title: sunk ? `${name} sunk ${s.namer.place.at(h.target)}` : `${name} hit ${plural(h.hits, 'time')}`,
      text: `Struck by ${s.namer.nation(h.by)} ${s.namer.item(h.munition)} ${s.namer.place.at(h.target)}. ${sunk ? 'Nothing of the group is left afloat.' : `The group keeps ${pct(f.strength)} of its strength.`}`,
      primary: { kind: 'unit', label: 'Open unit', formation: id, node: f.node },
    });
  }
  return out;
}

/** A war declared on us; one day's declarations fold into one alert. */
function warOnUs(s: Situation): Card[] {
  const declared = new Map<number, { tick: number; by: NationId[] }>();
  for (const e of s.recent) {
    if (e.tick < s.tick - 8 || e.type !== 'war_declared' || e.on !== s.me || s.ongoing.has(`${e.by}>${e.on}`)) continue;
    const day = Math.floor((e.tick * s.dtHours) / 24);
    const d = declared.get(day) ?? { tick: e.tick, by: [] };
    d.by.push(e.by);
    d.tick = Math.max(d.tick, e.tick);
    declared.set(day, d);
  }
  return [...declared].map(([day, d]) => {
    const names = d.by.map((n) => s.namer.nation(n));
    const on = s.namer.nation(s.me);
    const title = names.length === 1
      ? `${names[0]} declares war on ${on}`
      : `${names.length} nations declare war on ${on}: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}`;
    const cap = capitalOf(s, d.by[0]);
    return {
      key: `wire|war|${day}|${s.me}|${names.length}`, topic: 'threat', tone: 'live', tick: d.tick, title: `War: ${title}`, text: `We are now at war with ${names.join(', ')}.`,
      ...(cap !== undefined ? { node: cap, primary: { kind: 'show', label: 'Show me', node: cap } as Action } : {}),
    } satisfies Card;
  });
}

const SOURCES: readonly ((s: Situation) => Card[])[] = [raids, nuclear, citiesLost, treatyCalls, peaceOffers, capitalThreat, losses, warOnUs];

export interface Answer {
  ok: boolean;
  text: string;
  /** False while an order is still in transit; the final answer follows. */
  final: boolean;
}

/**
 * How the engine answers a crisis's command, read from the player's view after it was sent. The
 * order router answers with a command_result; the other systems answer by changing what the player sees.
 */
export function answerOf(cmd: Command, sentTick: number, s: Pick<Situation, 'me' | 'd' | 'recent' | 'namer'>): Answer | null {
  const after = s.recent.filter((e) => e.tick >= sentTick);
  switch (cmd.type) {
    case 'order': case 'answer_treaty': {
      const r = [...after].reverse().find((e) => e.type === 'command_result' && e.nation === s.me && e.command === cmd.type && (cmd.type !== 'order' || e.formation === cmd.formation));
      if (!r || r.type !== 'command_result') return null;
      return { ok: r.ok, text: describeResult(r, s.namer), final: !(r.ok && r.code === 'relayed') };
    }
    case 'offer_peace': {
      const them = s.namer.nation(cmd.target);
      if (after.some((e) => e.type === 'peace' && ((e.a === s.me && e.b === cmd.target) || (e.b === s.me && e.a === cmd.target)))) return { ok: true, text: `Armistice signed with ${them}`, final: true };
      return s.d.peaceOffers.some((o) => o.from === s.me && o.to === cmd.target) ? { ok: true, text: `Peace offer delivered to ${them}`, final: true } : null;
    }
    case 'nuclear_alert':
      return after.some((e) => e.type === 'nuclear_alert' && e.nation === s.me) || s.d.nuclear.alert.ordered ? { ok: true, text: 'Warheads are being mated to launchers', final: true } : null;
    default:
      return null;
  }
}

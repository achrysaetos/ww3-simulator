/**
 * The decisions a commander takes on initiative rather than in answer to a blow: commit the rested
 * reserve to a counter-offensive, call off or reinforce a stalled operation, launch a plan that is
 * ready, shore up a sector giving way, break a pocket out, run the covert war, refill a munition
 * that is running dry, and seek terms with a much stronger enemy that has just joined the war.
 * Each source reads only the player's Situation (its snapshot: own forces in full, the enemy as
 * contacts), returns at most one card per occasion, and words the recommended command and what it
 * costs. A key names the card's subject (the place, the formation, the operation and its size), so
 * a card the player waved away comes back only when the subject changes.
 */
import type { FormationId, NationId, NodeId, Operation } from '../../core/types';
import { namePlaces } from '../events';
import { GROUP_OF_KIND, type FormationView, type MunitionGroup } from '../snapshot';
import type { Action, Card, Situation } from './advice';

const MANEUVER = 'maneuver';
const LIVE: ReadonlySet<Operation['phase']> = new Set(['draft', 'launched', 'stalled']);
/** A reserve brigade this rested or better is fit to commit. */
const RESTED = 0.8;
/** Brigades the staff puts into one counter-offensive. */
const STRIKE_FORCE = 3;
/** The staff stops feeding brigades into a stalled operation at this size, and advises calling it off instead. */
const MAX_OP_FORMATIONS = 6;
/** A running operation that has made less than BOGGED_PACE cells a day over at least BOGGED_DAYS reads as stalled to the staff, whatever its phase. */
const BOGGED_DAYS = 4;
const BOGGED_PACE = 0.1;
/** Past this many days the staff stops feeding a stalled operation and advises calling it off. */
const FEED_DAYS = 10;
/** The most enemy formations intelligence may hold at an objective for the staff to call it a chance. */
const MAX_DEFENDERS = 2;
/** How far the enemy has pushed into one of our cells (land contest share) before the staff calls the sector failing. */
const GIVING_WAY = 0.35;
/** A munition that runs dry inside this many weeks at the current rate is worth a production order. */
const STOCK_WEEKS = 6;
/** A production order is worth a decision only if it adds at least this share of what we fire in a month. */
const NEW_OUTPUT_SHARE = 0.1;
/** An air-defence unit this close to a place covers it (medium-range SAMs: Buk ~45 km, S-300PS ~90 km, Patriot PAC-2 ~160 km). */
const COVER_KM = 120;
/** Rounds through to one place over the staff's recent window before it asks for cover. */
const MIN_LEAKED = 10;
/** Enemy formations in one cell, on a fix no older than STRIKE_FIX_HOURS, that make a target for a missile salvo. */
const STRIKE_MASS = 3;
const STRIKE_FIX_HOURS = 24;
/** The staff's recent window (advice RECENT_TICKS), in ticks. */
const RECENT_DAYS_TICKS = 16;
/** An enemy this many times our economy that joined within this many days is worth sounding out. */
const PEACE_GDP_RATIO = 5;
const PEACE_JOIN_DAYS = 14;

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
const bare = (place: string) => place.replace(/^near /, '');
const dayOf = (s: Situation, tick: number) => Math.floor((tick * s.dtHours) / 24);
/** USD millions in words: $640M, $1.2B. */
const usd = (m: number) => (m >= 1000 ? `$${(m / 1000).toFixed(1)}B` : `$${Math.max(1, Math.round(m))}M`);
const whose = (name: string) => (name.endsWith('s') ? `${name}'` : `${name}'s`);

export const capitalOf = (s: Situation, nation: NationId) => s.map.data.nations[s.nationIds.indexOf(nation)]?.capital?.cell as NodeId | undefined;

/** The nearest own manoeuvre formation free to send to `node` that passes `free`. */
export function nearestFree(s: Situation, node: NodeId, free: (f: FormationView) => boolean): { f: FormationView; km: number } | undefined {
  const { map } = s;
  return s.formations
    .filter((f) => f.entry.nation === s.me && f.entry.kind === MANEUVER && f.status === 'active' && !map.isSea(f.node) && free(f))
    .map((f) => ({ f, km: map.distanceKm(f.node, node) }))
    .sort((a, b) => a.km - b.km || a.f.entry.id.localeCompare(b.f.entry.id))[0];
}

function committed(s: Situation): Set<FormationId> {
  return new Set(s.ops.filter((o) => LIVE.has(o.phase)).flatMap((o) => o.formations));
}

/** Rested manoeuvre brigades sitting in reserve, outside any live operation. */
function restedReserve(s: Situation): FormationView[] {
  const busy = committed(s);
  return s.formations.filter((f) => f.entry.nation === s.me && f.entry.kind === MANEUVER && f.status === 'active' && f.posture === 'reserve'
    && f.strength >= RESTED && !busy.has(f.entry.id) && !s.map.isSea(f.node));
}

const daysRunning = (s: Situation, o: Operation) => ((s.tick - (o.launchedTick ?? o.hHour)) * s.dtHours) / 24;
const boggedDown = (s: Situation, o: Operation) => daysRunning(s, o) >= BOGGED_DAYS && (o.progress.advance - 1) / daysRunning(s, o) < BOGGED_PACE;

function touches(s: Situation, node: NodeId, idx: (i: number) => boolean): boolean {
  for (let i = s.map.adjStart[node]; i < s.map.adjStart[node + 1]; i++) if (idx(s.control[s.map.adj[i]])) return true;
  return false;
}

/**
 * At war with a land front and a rested reserve: the enemy-held cell next to our line where our
 * intelligence holds the fewest of its formations, retaken by the three nearest rested brigades.
 * Ground that was ours comes first.
 */
function counterOffensive(s: Situation): Card[] {
  if (!s.d.enemies.length || s.ops.some((o) => o.planner === 'player' && (o.phase === 'draft' || (o.phase === 'launched' && !boggedDown(s, o))))) return [];
  const reserve = restedReserve(s);
  if (reserve.length < STRIKE_FORCE) return [];
  const { map } = s;
  const mine = s.nationIds.indexOf(s.me);
  const enemyIdx = new Set(s.d.enemies.map((e) => s.nationIds.indexOf(e)));
  const held = new Map<NodeId, FormationView[]>();
  for (const f of s.formations) {
    if (!s.d.enemies.includes(f.entry.nation) || f.entry.kind !== MANEUVER || f.status !== 'active' || map.isSea(f.node)) continue;
    held.set(f.node, [...(held.get(f.node) ?? []), f]);
  }
  let best: { node: NodeId; defenders: FormationView[]; ours: boolean; km: number; kept: boolean } | null = null;
  for (let n = 0 as NodeId; n < map.landCount; n++) {
    if (!enemyIdx.has(s.control[n]) || !touches(s, n, (i) => i === mine)) continue;
    const defenders = held.get(n) ?? [];
    if (defenders.length > MAX_DEFENDERS) continue;
    const ours = map.owner[n] === s.me;
    const km = Math.min(...reserve.map((f) => map.distanceKm(f.node, n)));
    const seen = s.known(`offensive|front|${n}`);
    if (seen === 'done') continue;
    const kept = seen === 'table';
    if (!best || kept || (!best.kept && (Number(ours) - Number(best.ours) || best.defenders.length - defenders.length || best.km - km) > 0)) best = { node: n, defenders, ours, km, kept };
  }
  if (!best) return [];
  const target = best;
  const force = reserve.map((f) => ({ f, km: map.distanceKm(f.node, target.node) })).sort((a, b) => a.km - b.km || a.f.entry.id.localeCompare(b.f.entry.id)).slice(0, STRIKE_FORCE);
  const holder = s.control[target.node];
  const place = bare(s.namer.place.heldName(target.node, (cell) => s.control[cell] === holder));
  const them = s.namer.nation(s.nationIds[holder] as NationId);
  const age = target.defenders.length ? Math.round(Math.min(...target.defenders.map((f) => f.contact?.ageHours ?? 0))) : null;
  let around = 0;
  for (let i = map.adjStart[target.node]; i < map.adjStart[target.node + 1]; i++) around += held.get(map.adj[i] as NodeId)?.length ?? 0;
  const seen = `${target.defenders.length
    ? `Our intelligence holds ${plural(target.defenders.length, 'formation')} of ${them} there, the freshest fix ${age} h old`
    : 'Our intelligence holds no enemy formation in the cell itself'}, and ${around ? plural(around, 'more', 'more') : 'none'} in the cells around it.`;
  return [{
    key: `offensive|front|${target.node}`, topic: 'opportunity', role: 'chief', tone: 'advice', tick: s.tick, node: target.node,
    title: `A chance to ${target.ours ? 'retake' : 'take'} ${place}`,
    text: `${seen} We have ${plural(reserve.length, 'rested brigade')} in reserve. ${force.map((x) => x.f.entry.name).join(', ')} are the nearest.`,
    ask: `Launch a counter-offensive on ${place} with ${plural(force.length, 'brigade')} from the reserve.`,
    cost: { label: 'Risk', text: `${plural(force.length, 'brigade')} leave the reserve, ${Math.round(force[force.length - 1].km)} km out at most; an attack costs more than holding` },
    figure: { value: `${force.length}:${Math.max(1, target.defenders.length)}`, caption: 'our brigades to their formations seen' },
    chip: target.ours ? 'Our ground' : 'Opportunity',
    primary: { kind: 'command', label: 'Launch the attack', command: { type: 'plan_operation', nation: s.me, kind: 'offensive', objectives: [target.node], formations: force.map((x) => x.f.entry.id), launch: true } },
    secondary: { kind: 'show', label: 'Show me', node: target.node },
  }];
}

/** The player's operations that need a word: a plan ready to go, a push that has stalled, and how each one ended. */
function operationCalls(s: Situation): Card[] {
  const out: Card[] = [];
  const reserve = restedReserve(s);
  const promised = new Set<FormationId>();
  for (const o of s.ops) {
    const goal = o.objectives[o.objectives.length - 1] ?? o.axis[o.axis.length - 1];
    const place = bare(s.namer.place.name(goal));
    if (o.phase === 'draft' && o.planner === 'player') {
      out.push({
        key: `opready|${o.id}`, topic: 'opportunity', role: 'chief', tone: 'advice', tick: s.tick, node: goal,
        title: `${o.name} is ready`,
        text: `The plan drives toward ${place} with ${plural(o.formations.length, 'formation')}. It waits on your word.`,
        ask: `Launch ${o.name} now.`,
        cost: { label: 'Risk', text: `${plural(o.formations.length, 'formation')} commit to the attack` },
        primary: { kind: 'command', label: 'Launch', command: { type: 'launch_operation', nation: s.me, operation: o.id } },
        secondary: { kind: 'later', label: 'Not yet' },
      });
    } else if (o.phase === 'stalled' || (o.phase === 'launched' && boggedDown(s, o))) {
      const kept = o.progress.platformsAtLaunch ? o.progress.platforms / o.progress.platformsAtLaunch : 1;
      const help = nearestFree(s, goal, (f) => reserve.includes(f) && !promised.has(f.entry.id));
      const why = namePlaces(o.progress.note, s.namer.place).replace(/ near /g, ' ');
      const reinforce: Action | undefined = help && kept >= 0.6 && o.formations.length < MAX_OP_FORMATIONS && daysRunning(s, o) < FEED_DAYS
        ? { kind: 'command', label: `Send ${help.f.entry.name}`, command: { type: 'adjust_operation', nation: s.me, operation: o.id, formations: [...o.formations, help.f.entry.id] } }
        : undefined;
      if (reinforce) promised.add(help!.f.entry.id);
      const cancel: Action = { kind: 'command', label: 'Call it off', command: { type: 'cancel_operation', nation: s.me, operation: o.id } };
      out.push({
        key: `opstall|${o.id}|${o.formations.length}`, topic: 'command', role: 'chief', tone: 'advice', tick: s.tick, node: goal,
        title: `${o.name} has stalled`,
        text: `The push on ${place} has stopped: ${o.phase === 'stalled' ? why : `${Math.round(Math.max(0, o.progress.advance - 1) * 100)}% of one cell gained in ${plural(Math.floor(daysRunning(s, o)), 'day')}`}. Its formations keep ${Math.round(kept * 100)}% of their strength at launch.`,
        ask: reinforce ? `Feed ${help!.f.entry.name} into ${o.name} and push on.` : `Call off ${o.name}; its formations dig in where they stand.`,
        cost: reinforce
          ? { label: 'Cost', text: `${help!.f.entry.name} leaves the reserve, ${Math.round(help!.km)} km away` }
          : { label: 'Risk', text: `The ground taken so far may be all we get` },
        figure: { value: String(Math.round(kept * 100)), unit: '%', caption: 'of its strength left' },
        primary: reinforce ?? cancel,
        secondary: reinforce ? cancel : { kind: 'later', label: 'Keep pushing' },
      });
    } else if ((o.phase === 'succeeded' || o.phase === 'failed') && o.endedTick !== undefined && s.tick - o.endedTick <= 4) {
      out.push({
        key: `opend|${o.id}`, topic: o.phase === 'succeeded' ? 'opportunity' : 'threat', role: 'chief', tone: 'report', tick: o.endedTick, node: goal,
        title: o.phase === 'succeeded' ? `${o.name}: ${place} is taken` : `${o.name} has failed`,
        text: o.phase === 'succeeded' ? `Its formations hold the objective.` : namePlaces(o.progress.note, s.namer.place),
        primary: { kind: 'show', label: 'Show me', node: goal },
      });
    }
  }
  return out;
}

/** A sector the enemy is pushing into (the land contest the player sees), with a rested brigade near enough to send. */
function givingWay(s: Situation): Card[] {
  if (!s.d.enemies.length) return [];
  const mine = s.nationIds.indexOf(s.me);
  const enemyIdx = new Set(s.d.enemies.map((e) => s.nationIds.indexOf(e)));
  let worst: { node: NodeId; share: number; by: number } | null = null;
  for (let i = 0; i < s.contest.length; i += 3) {
    const node = s.contest[i] as NodeId, by = s.contest[i + 1], share = s.contest[i + 2];
    if (s.control[node] !== mine || !enemyIdx.has(by) || share < GIVING_WAY) continue;
    if (!worst || share > worst.share || (share === worst.share && node < worst.node)) worst = { node, share, by };
  }
  if (!worst) return [];
  const w = worst;
  const reserve = restedReserve(s);
  const help = nearestFree(s, w.node, (f) => reserve.includes(f) && f.node !== w.node);
  if (!help) return [];
  const place = bare(s.namer.place.heldName(w.node, (cell) => s.control[cell] === mine));
  return [{
    key: `giving|${place}|${help.f.entry.id}`, topic: 'threat', role: 'chief', tone: 'advice', tick: s.tick, node: w.node,
    title: `The line at ${place} is giving way`,
    text: `${s.namer.nation(s.nationIds[w.by] as NationId)} has pushed ${Math.round(w.share * 100)}% of the way through our ground at ${place}. ${help.f.entry.name} is in reserve ${Math.round(help.km)} km away.`,
    ask: `Move ${help.f.entry.name} up to ${place}.`,
    cost: { label: 'Cost', text: `${help.f.entry.name} leaves the reserve` },
    figure: { value: String(Math.round(w.share * 100)), unit: '%', caption: 'of the cell pushed through' },
    primary: { kind: 'command', label: 'Reinforce', command: { type: 'order', nation: s.me, formation: help.f.entry.id, order: { posture: 'move', target: w.node } } },
    secondary: { kind: 'show', label: 'Show me', node: w.node },
  }];
}

/**
 * Enemy formations massed in one cell on a fresh fix, within reach of one of our missile
 * formations that is not already firing on them: a target worth the rounds.
 */
function strikeChance(s: Situation): Card[] {
  if (!s.d.enemies.length || !s.d.strikers.length) return [];
  const { map } = s;
  const at = new Map<NodeId, FormationView[]>();
  for (const f of s.formations) {
    if (!s.d.enemies.includes(f.entry.nation) || f.status !== 'active' || !f.contact || f.contact.ageHours > STRIKE_FIX_HOURS || map.isSea(f.node)) continue;
    at.set(f.node, [...(at.get(f.node) ?? []), f]);
  }
  const firing = new Set(s.formations.filter((f) => f.entry.nation === s.me && f.posture === 'strike' && f.target !== null).map((f) => f.target!));
  let best: { node: NodeId; fs: FormationView[]; by: Situation['d']['strikers'][number]; km: number; kept: boolean } | null = null;
  for (const [node, fs] of at) {
    if (fs.length < STRIKE_MASS || firing.has(node)) continue;
    const by = s.d.strikers.map((x) => ({ x, km: map.distanceKm(x.node, node) })).filter((y) => y.km <= y.x.reachKm)
      .sort((a, b) => b.x.rounds - a.x.rounds || a.x.id.localeCompare(b.x.id))[0];
    const seen = by && s.known(`strike|${by.x.id}|${node}`);
    if (seen === 'done') continue;
    const kept = seen === 'table';
    if (by && (!best || kept || (!best.kept && (fs.length > best.fs.length || (fs.length === best.fs.length && node < best.node))))) best = { node, fs, by: by.x, km: by.km, kept };
  }
  if (!best) return [];
  const b = best;
  const holder = s.control[b.node];
  const place = bare(s.namer.place.heldName(b.node, (cell) => s.control[cell] === holder));
  const shooter = s.namer.formation(b.by.id) ?? 'Our missile brigade';
  const fix = Math.round(Math.min(...b.fs.map((f) => f.contact!.ageHours)));
  return [{
    key: `strike|${b.by.id}|${b.node}`, topic: 'opportunity', role: 'air', tone: 'advice', tick: s.tick, node: b.node,
    title: `${plural(b.fs.length, 'enemy formation')} massed at ${place}`,
    text: `Our intelligence fixed them ${fix} h ago. ${shooter} has ${plural(b.by.rounds, 'round')} aboard and reaches ${place} at ${Math.round(b.km)} km.`,
    ask: `Strike the concentration at ${place} with ${shooter}.`,
    cost: { label: 'Cost', text: `Rounds spent here are not there for their airfields and depots; a fix ${fix} h old may have moved` },
    figure: { value: String(b.fs.length), caption: 'formations in one cell' },
    primary: { kind: 'command', label: 'Strike', command: { type: 'order', nation: s.me, formation: b.by.id, order: { posture: 'strike', target: b.node } } },
    secondary: { kind: 'show', label: 'Show me', node: b.node },
  }];
}

/**
 * The place enemy missiles and drones get through to most over the last days, with no air-defence
 * unit of ours within reach of it: move the nearest one from ground the raids have left alone.
 */
function airCover(s: Situation): Card[] {
  const { map } = s;
  const mine = s.nationIds.indexOf(s.me);
  const enemies = new Set(s.d.enemies);
  if (!enemies.size) return [];
  const isRaid = (munition: string) => {
    const kind = s.munitionKind(munition);
    const g = kind && GROUP_OF_KIND[kind];
    return g === 'ballistic' || g === 'cruise' || g === 'drone';
  };
  const hit = new Map<NodeId, { fired: number; leaked: number }>();
  for (const e of s.recent) {
    if (e.type !== 'strike' || !enemies.has(e.by) || s.control[e.target] !== mine || !isRaid(e.munition)) continue;
    const h = hit.get(e.target) ?? { fired: 0, leaked: 0 };
    h.fired += e.fired;
    h.leaked += e.fired - e.intercepted;
    hit.set(e.target, h);
  }
  const ad = s.formations.filter((f) => f.entry.nation === s.me && f.entry.kind === 'air_defense' && f.status === 'active' && !map.isSea(f.node));
  if (!ad.length) return [];
  const covered = (node: NodeId) => ad.some((f) => map.distanceKm(f.node, node) <= COVER_KM);
  const worst = [...hit.entries()].filter(([node, h]) => h.leaked >= MIN_LEAKED && !covered(node)).sort((a, b) => b[1].leaked - a[1].leaked || a[0] - b[0])[0];
  if (!worst) return [];
  const [node, h] = worst;
  const cap = capitalOf(s, s.me);
  const quiet = ad.filter((f) => ![...hit.keys()].some((n) => map.distanceKm(n, f.node) <= COVER_KM) && (cap === undefined || map.distanceKm(cap, f.node) > COVER_KM))
    .map((f) => ({ f, km: map.distanceKm(f.node, node) })).sort((a, b) => a.km - b.km || a.f.entry.id.localeCompare(b.f.entry.id))[0];
  if (!quiet) return [];
  const ours = (cell: NodeId) => s.control[cell] === mine;
  const place = bare(s.namer.place.heldName(node, ours));
  const from = bare(s.namer.place.heldName(quiet.f.node, ours));
  const days = Math.max(1, Math.round((RECENT_DAYS_TICKS * s.dtHours) / 24));
  return [{
    key: `cover|${quiet.f.entry.id}|${place}`, topic: 'threat', role: 'air', tone: 'advice', tick: s.tick, node,
    title: `${place} has no air defence`,
    text: `${plural(h.leaked, 'missile and drone', 'missiles and drones')} got through to ${place} in the last ${plural(days, 'day')}, out of ${h.fired.toLocaleString('en-US')} fired. No air-defence unit of ours stands within ${COVER_KM} km. ${quiet.f.entry.name} at ${from} has seen no raid.`,
    ask: `Move ${quiet.f.entry.name} from ${from} to cover ${place}.`,
    cost: { label: 'Risk', text: `${from} is left to the units still there, ${Math.round(quiet.km)} km of road between` },
    figure: { value: String(Math.round((1 - h.leaked / h.fired) * 100)), unit: '%', caption: 'shot down over it' },
    primary: { kind: 'command', label: 'Move the battery', command: { type: 'order', nation: s.me, formation: quiet.f.entry.id, order: { posture: 'move', target: node } } },
    secondary: { kind: 'show', label: 'Show me', node },
  }];
}

/**
 * Own manoeuvre formations standing on ground cut off from the rest of the country: the largest
 * pocket is offered a break-out toward the nearest cell still joined to home.
 */
function pockets(s: Situation): Card[] {
  if (!s.d.enemies.length) return [];
  const { map } = s;
  const mine = s.nationIds.indexOf(s.me);
  const cap = capitalOf(s, s.me);
  if (cap === undefined || s.control[cap] !== mine) return [];
  const flood = (pass: (n: NodeId) => boolean) => {
    const seen = new Uint8Array(map.landCount);
    const queue: NodeId[] = [cap];
    seen[cap] = 1;
    while (queue.length) {
      const n = queue.pop()!;
      for (let i = map.adjStart[n]; i < map.adjStart[n + 1]; i++) {
        const m = map.adj[i] as NodeId;
        if (m < map.landCount && !seen[m] && pass(m)) {
          seen[m] = 1;
          queue.push(m);
        }
      }
    }
    return seen;
  };
  const home = flood((n) => s.control[n] === mine);
  // Ground that joins the capital over our own country: an island or an exclave never did, so it is not a pocket.
  const joined = flood((n) => s.control[n] === mine || map.owner[n] === s.me);
  const busy = committed(s);
  const cut = s.formations.filter((f) => f.entry.nation === s.me && f.entry.kind === MANEUVER && f.status === 'active' && f.node < map.landCount
    && s.control[f.node] === mine && !home[f.node] && joined[f.node] && !busy.has(f.entry.id) && map.owner[f.node] === s.me);
  if (!cut.length) return [];
  const byPlace = new Map<string, FormationView[]>();
  for (const f of cut) {
    const p = bare(s.namer.place.name(f.node));
    byPlace.set(p, [...(byPlace.get(p) ?? []), f]);
  }
  const [place, fs] = [...byPlace.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0];
  let exit: NodeId | null = null, km = Infinity;
  for (let n = 0 as NodeId; n < map.landCount; n++) {
    if (!home[n]) continue;
    const d = map.distanceKm(n, fs[0].node);
    if (d < km) [exit, km] = [n, d];
  }
  if (exit === null) return [];
  const to = bare(s.namer.place.name(exit));
  return [{
    key: `pocket|${place}|${fs.length}`, topic: 'threat', role: 'chief', tone: 'advice', tick: s.tick, node: fs[0].node,
    title: `${plural(fs.length, 'formation')} cut off near ${place}`,
    text: `The ground they hold no longer joins ours. Without a way out, supply stops and they wear down. Our line is ${Math.round(km)} km away at ${to}.`,
    ask: `Break out toward ${to} with ${fs.map((f) => f.entry.name).slice(0, 3).join(', ')}${fs.length > 3 ? ' and the rest' : ''}.`,
    cost: { label: 'Risk', text: 'Ground they hold is given up; the break-out fights its way through' },
    figure: { value: String(Math.round(km)), unit: 'km', caption: 'to our line' },
    chip: 'Encircled',
    primary: { kind: 'command', label: 'Break out', command: { type: 'plan_operation', nation: s.me, kind: 'counterattack', objectives: [exit], formations: fs.map((f) => f.entry.id), launch: true } },
    secondary: { kind: 'show', label: 'Show me', node: fs[0].node },
  }];
}

/**
 * The covert war, which no delegate runs for the player: fire an intrusion that is ready, else
 * begin sabotage behind the enemy's lines, else start working into its power grid. One card per
 * enemy, the two it has been longest at war with.
 */
function covert(s: Situation): Card[] {
  const out: Card[] = [];
  const i = s.nationIds.indexOf(s.me);
  for (const enemy of s.d.enemies.slice(0, 2)) {
    const them = s.namer.nation(enemy);
    const node = capitalOf(s, enemy);
    const ready = s.d.covert.cyber.find((a) => a.on === enemy && a.stage !== 'none');
    if (ready) {
      const sector = ready.sector === 'grid' ? 'power grid' : 'telecoms';
      out.push({
        key: `cyberfire|${enemy}|${ready.sector}|${ready.stage}`, topic: 'opportunity', role: 'intel', tone: 'advice', tick: s.tick, node,
        title: `Our access to ${whose(them)} ${sector} is ready`,
        text: `Our cyber units hold ${ready.stage === 'persistent' ? 'deep' : 'a foothold of'} access into ${whose(them)} ${sector}. Fired now, it takes ${ready.stage === 'persistent' ? 'a large share' : 'a slice'} of it down for days.`,
        ask: `Fire the ${sector} payload against ${them}.`,
        cost: { label: 'Cost', text: 'Firing burns the access; building it again takes months' },
        primary: { kind: 'command', label: 'Fire the payload', command: { type: 'cyber_op', nation: s.me, target: enemy, sector: ready.sector, action: 'attack' } },
        secondary: { kind: 'later', label: 'Keep it in reserve' },
      });
      continue;
    }
    if (!s.d.covert.sabotage.includes(enemy) && i >= 0) {
      out.push({
        key: `sabotage|${enemy}`, topic: 'opportunity', role: 'intel', tone: 'advice', tick: s.tick, node,
        title: `Sabotage behind ${whose(them)} lines`,
        text: `Our services can run a campaign against ${whose(them)} railways, depots and plants. Each act cuts the rail it hits for a time, and slows what reaches its front.`,
        ask: `Begin a sabotage campaign against ${them}.`,
        cost: { label: 'Risk', text: `Acts traced to us harden ${them} and cost us abroad` },
        primary: { kind: 'command', label: 'Begin sabotage', command: { type: 'sabotage', nation: s.me, target: enemy, on: true } },
        secondary: { kind: 'later', label: 'Not now' },
      });
      continue;
    }
    if (!s.d.covert.cyber.some((a) => a.on === enemy)) {
      out.push({
        key: `cyberbuild|${enemy}`, topic: 'opportunity', role: 'intel', tone: 'advice', tick: s.tick, node,
        title: `Break into ${whose(them)} power grid`,
        text: `An intrusion into ${whose(them)} grid takes months of quiet work before it can be fired, and longer for deep access. Started now, it is ready for a later phase of the war.`,
        ask: `Begin an intrusion into ${whose(them)} power grid.`,
        cost: { label: 'Risk', text: 'An intrusion found is set back a stage' },
        primary: { kind: 'command', label: 'Begin the intrusion', command: { type: 'cyber_op', nation: s.me, target: enemy, sector: 'grid', action: 'build' } },
        secondary: { kind: 'later', label: 'Not now' },
      });
    }
  }
  return out;
}

const GROUP_WORD: Partial<Record<MunitionGroup, string>> = {
  interceptor: 'Air-defence interceptors', ballistic: 'Ballistic missiles', cruise: 'Cruise missiles', drone: 'Attack drones', rocket: 'Rockets', atgm: 'Anti-tank missiles', aam: 'Air-to-air missiles',
};

/**
 * A munition family the player is firing faster than it can last: surge the line with the most
 * headroom, or, with none, open a new line for the item the nation can build fastest.
 */
function munitionStocks(s: Situation): Card[] {
  const eco = s.d.economy;
  if (!eco) return [];
  let worst: { group: MunitionGroup; weeks: number; stock: number; burn: number } | null = null;
  for (const m of s.d.munitions) {
    const burn = s.burnPerDay[m.group];
    if (!GROUP_WORD[m.group] || !burn || burn <= 0) continue;
    const stock = (m.warehoused ?? 0) + m.loaded;
    const weeks = stock / burn / 7;
    if (weeks < STOCK_WEEKS && (!worst || weeks < worst.weeks)) worst = { group: m.group, weeks, stock, burn };
  }
  if (!worst) return [];
  const w = worst;
  const inGroup = (item: string) => {
    const kind = s.munitionKind(item);
    return !!kind && GROUP_OF_KIND[kind] === w.group;
  };
  if (eco.lines.some((l) => inGroup(l.item) && l.ordered !== null && l.ordered > l.perMonth)) return [];
  const surge = Object.entries(eco.capacity)
    .filter(([item, c]) => inGroup(item) && c.surge > c.perMonth * 1.05 && eco.lines.find((l) => l.item === item)?.ordered !== Math.round(c.surge))
    .map(([item, c]) => ({ item, rate: Math.round(c.surge), extra: c.surge - c.perMonth, fresh: false }))
    .sort((a, b) => b.extra - a.extra || a.item.localeCompare(b.item))[0];
  const fresh = Object.entries(eco.greenfield)
    .filter(([item, ceiling]) => inGroup(item) && ceiling >= 1 && !eco.capacity[item])
    .map(([item, ceiling]) => ({ item, rate: Math.round(ceiling), extra: ceiling, fresh: true }))
    .sort((a, b) => b.extra - a.extra || a.item.localeCompare(b.item))[0];
  const pick = surge ?? fresh;
  if (!pick || pick.extra < NEW_OUTPUT_SHARE * w.burn * 30) return [];
  const weeks = Math.max(1, Math.round(w.weeks));
  const word = GROUP_WORD[w.group]!;
  const item = s.namer.item(pick.item);
  return [{
    key: `stock|${w.group}|${weeks <= 2 ? 'critical' : 'low'}`, topic: 'supply', role: 'economy', tone: 'advice', tick: s.tick, node: capitalOf(s, s.me),
    title: `${word} run out in ${plural(weeks, 'week')}`,
    text: `We are using about ${Math.round(w.burn).toLocaleString('en-US')} a day against ${Math.round(w.stock).toLocaleString('en-US')} left. ${pick.fresh ? `We have no line for them; a new ${item} line could reach ${pick.rate.toLocaleString('en-US')} a month.` : `The ${item} line can surge to ${pick.rate.toLocaleString('en-US')} a month.`}`,
    ask: pick.fresh ? `Open a ${item} line.` : `Order ${item} at the line's full surge rate.`,
    cost: { label: 'Cost', text: `+${Math.round(pick.extra).toLocaleString('en-US')} a month · about ${usd(pick.extra * s.unitCostUsdM(pick.item))} a month${pick.fresh ? ' · months to ramp up' : ''}` },
    figure: { value: String(weeks), unit: 'wks', caption: `of ${word.toLowerCase()} left` },
    primary: { kind: 'command', label: pick.fresh ? 'Open the line' : 'Order more', command: { type: 'produce', nation: s.me, item: pick.item as never, ratePerMonth: pick.rate } },
    secondary: { kind: 'open', label: 'Details', drawer: 'nation' },
  }];
}

/** A far stronger power that has just joined the war against us: the foreign minister proposes sounding it out for terms. */
function seekTerms(s: Situation): Card[] {
  const me = s.nations.get(s.me);
  if (!me) return [];
  const out: Card[] = [];
  for (const w of s.d.wars) {
    const ours = w.sides[0].some((m) => m.nation === s.me) ? 0 : w.sides[1].some((m) => m.nation === s.me) ? 1 : -1;
    if (ours < 0) continue;
    for (const m of w.sides[1 - ours]) {
      const them = s.nations.get(m.nation);
      if (!them || m.tick <= w.startTick + Math.round(24 / s.dtHours) || dayOf(s, s.tick) - dayOf(s, m.tick) > PEACE_JOIN_DAYS) continue;
      if (them.gdpUsdB < PEACE_GDP_RATIO * me.gdpUsdB || s.d.peaceOffers.some((o) => o.from === s.me && o.to === m.nation)) continue;
      const name = s.namer.nation(m.nation);
      out.push({
        key: `terms|${m.nation}|${w.id}`, topic: 'diplomacy', role: 'foreign', tone: 'advice', tick: s.tick,
        node: capitalOf(s, m.nation),
        title: `Sound out ${name} for terms`,
        text: `${name} entered the war against us ${dayOf(s, s.tick) === dayOf(s, m.tick) ? 'today' : `${plural(dayOf(s, s.tick) - dayOf(s, m.tick), 'day')} ago`}, with an economy ${Math.round(them.gdpUsdB / Math.max(1, me.gdpUsdB))} times ours. A back channel now may keep its full weight off us.`,
        ask: `Offer ${name} an armistice on today's lines.`,
        cost: { label: 'Risk', text: 'An offer reads as weakness, at home and in the field' },
        figure: { value: String(Math.round(them.gdpUsdB / Math.max(1, me.gdpUsdB))), unit: 'x', caption: 'their economy to ours' },
        primary: { kind: 'command', label: 'Offer terms', command: { type: 'offer_peace', nation: s.me, target: m.nation } },
        secondary: { kind: 'later', label: 'Fight on' },
      });
    }
  }
  return out;
}

export const INITIATIVE: readonly ((s: Situation) => Card[])[] = [operationCalls, pockets, givingWay, counterOffensive, strikeChance, airCover, munitionStocks, covert, seekTerms];

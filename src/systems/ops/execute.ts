import type { SimContext } from '../../core/engine';
import { defineParam } from '../../core/params';
import type { Formation, FormationId, NodeId, Operation, Order, World } from '../../core/types';
import { allied, cellDepthKm, landSlice } from '../land/state';
import { endOperation, holds, platforms, type OpsState } from './state';

/**
 * A staff judges an assault by its pace over the last STALL_DAYS: under STALL_KM_PER_DAY it reports the attack stalled
 * and keeps feeding it; FAIL_DAYS after the assault last made that pace it calls it off. A creep of a few hundred
 * metres a day is not progress: ISW called Ukraine's 2023 Robotyne push stalled at that rate, and Russia's 2024
 * Pokrovsk drive advancing at 1-4 km a day. Russia's 2023 Vuhledar and Ukraine's 2023 Robotyne assaults were re-planned
 * within days of stalling and abandoned after one to three weeks (ISW).
 */
const STALL_DAYS = defineParam({ id: 'ops.STALL_DAYS', value: 2, range: [1, 4], tag: 'judgment',
  source: 'Judgment: assaults re-planned within days of stalling (ISW on Vuhledar and Robotyne, 2023)', affects: 'when an operation reports stalled' });
const STALL_KM_PER_DAY = defineParam({ id: 'ops.STALL_KM_PER_DAY', value: 1, range: [0.3, 2], tag: 'judgment',
  source: 'Judgment: ISW assessed Robotyne 2023 (a few hundred m/day) as stalled, Pokrovsk 2024 (1-4 km/day) as advancing', affects: 'when an operation reports stalled' });
const FAIL_DAYS = defineParam({ id: 'ops.FAIL_DAYS', value: 7, range: [4, 21], tag: 'judgment',
  source: 'Judgment: stalled offensives abandoned after one to three weeks (ISW 2023)', affects: 'when a stalled operation is called off' });
/**
 * A formation below half its strength at commitment is combat-ineffective and is pulled out of the assault to refit; an
 * operation whose force has fallen to that level has failed. US Army practice rates a unit at 50-69% strength
 * "marginally effective" and under 50% "not effective" (FM 6-99.2 and its unit status reporting levels).
 */
const SPENT_STRENGTH = defineParam({ id: 'ops.SPENT_STRENGTH', value: 0.5, range: [0.4, 0.7], tag: 'estimated',
  source: 'US Army unit status: under 50% strength is not combat-effective (AR 220-1 readiness levels)', affects: 'when units are relieved and operations fail' });
const SPENT_SUPPLY = 0.15;
const SPENT_MORALE = 0.25;
/**
 * The assault waits at the jump-off cell until this share of the force has closed up, or ASSEMBLE_DAYS have passed:
 * concentration before the line of departure (FM 3-90 "assembly area"; Mearsheimer's breakthrough argument rests on
 * attacking with mass on a narrow front, not as units arrive).
 */
const ASSEMBLE_SHARE = defineParam({ id: 'ops.ASSEMBLE_SHARE', value: 0.6, range: [0.4, 0.9], tag: 'judgment',
  source: 'Judgment: FM 3-90 assembly before the line of departure; Mearsheimer 1982 on concentration', affects: 'how massed an operation is when it attacks' });
const ASSEMBLE_DAYS = 1.5;
/** A re-sent order waits this long: an order in transit or refused is not repeated every tick. */
const RESEND_TICKS = 4;

const MANOEUVRE: ReadonlySet<string> = new Set(['maneuver']);
/** The fewest manoeuvre formations a spearhead keeps when it detaches guards for the ground behind it (judgment). */
const MIN_SPEARHEAD = 4;

function spent(s: OpsState, f: Formation): boolean {
  if (f.status === 'routed') return true;
  const base = s.base[f.id] ?? platforms(f);
  const cap = f.supplyCapacity.fuel + f.supplyCapacity.ammo;
  const supply = cap > 0 ? (f.supply.fuel + f.supply.ammo) / cap : 1;
  return (base > 0 && platforms(f) / base < SPENT_STRENGTH()) || supply < SPENT_SUPPLY || f.morale < SPENT_MORALE;
}

/** Queue `order` for `f` unless it already has it or the staff sent it lately. */
function send(world: World, s: OpsState, f: Formation, order: Omit<Order, 'issuedTick'>): void {
  if (f.order.posture === order.posture && f.order.target === order.target) return;
  const last = s.sent[f.id];
  if (last && last.posture === order.posture && last.target === order.target && world.tick < last.tick + RESEND_TICKS) return;
  s.sent[f.id] = { posture: order.posture, ...(order.target !== undefined ? { target: order.target } : {}), tick: world.tick };
  world.pending.push({ type: 'order', nation: f.nation, formation: f.id, order });
}

/** Where the force closes up before assaulting axis[bound]: the axis cell before it, or a held cell next to it. */
function jumpOff(world: World, ctx: SimContext, op: Operation, bound: number): NodeId | undefined {
  if (bound > 0 && holds(world, op.nation, op.axis[bound - 1])) return op.axis[bound - 1];
  const target = op.axis[Math.min(bound, op.axis.length - 1)];
  let best: NodeId | undefined, bestKm = Infinity;
  for (const m of ctx.map.neighbors(target)) {
    if (m >= ctx.map.landCount || !holds(world, op.nation, m)) continue;
    const km = ctx.map.distanceKm(m, op.axis[0]);
    if (km < bestKm) { bestKm = km; best = m; }
  }
  return best;
}

/**
 * How far along its axis an operation is: cells up to the furthest held, plus the share pushed across the cell being
 * fought for; and the same in km past the line of departure (axis[0]).
 */
function measure(world: World, ctx: SimContext, op: Operation): { bound: number; advance: number; km: number } {
  // The bound is the cell past the furthest one held: ground the enemy retakes behind the spearhead is the line's to clear, not the spearhead's.
  let bound = op.axis.length;
  while (bound > 0 && !holds(world, op.nation, op.axis[bound - 1])) bound--;
  let km = 0;
  for (let i = 1; i < bound; i++) km += cellDepthKm(ctx.map, op.axis[i]);
  if (bound >= op.axis.length) return { bound, advance: bound, km };
  const c = landSlice(world).contest[op.axis[bound]];
  const pushed = c && allied(world, op.nation, c.by) ? Math.min(c.km, cellDepthKm(ctx.map, op.axis[bound])) : 0;
  return { bound, advance: bound + pushed / cellDepthKm(ctx.map, op.axis[bound]), km: km + pushed };
}

/**
 * One tick of a running operation: measure progress, move the phase, relieve spent units, and order the rest. The
 * manoeuvre force closes up at the jump-off cell and goes into the bound together, the guns move up behind it, and
 * each bound taken becomes the next jump-off.
 */
export function executeOperation(world: World, ctx: SimContext, s: OpsState, op: Operation): void {
  const { map } = ctx;
  const perDay = 24 / world.dtHours;
  const pr = op.progress;
  const alive = op.formations.map((id) => world.formations[id]).filter((f): f is Formation => !!f && f.status !== 'destroyed' && f.status !== 'embarked' && f.node < map.landCount);
  pr.platforms = alive.reduce((t, f) => t + platforms(f), 0) + pr.relieved.reduce((t, id) => {
    const f = world.formations[id];
    return t + (f && f.status !== 'destroyed' ? platforms(f) : 0);
  }, 0);
  pr.objectivesHeld = op.objectives.filter((n) => holds(world, op.nation, n)).length;

  if (op.kind === 'defence') {
    if (!alive.length) return endOperation(world, s, op, 'failed', 'every formation lost');
    if (!pr.objectivesHeld) return endOperation(world, s, op, 'failed', 'every objective lost');
    pr.note = `holding ${pr.objectivesHeld} of ${op.objectives.length} objectives`;
    defend(world, s, op, alive);
    return;
  }

  const { bound, advance, km } = measure(world, ctx, op);
  // Assembly runs no clock. From the assault order (s.pace set below) the force has FAIL_DAYS to get into the bound, and
  // from then on is judged by its pace.
  const target = op.axis[Math.min(bound, op.axis.length - 1)];
  const trail = s.pace[op.id];
  const inContact = alive.some((f) => MANOEUVRE.has(f.kind) && f.node === target);
  const window = Math.round(STALL_DAYS() * perDay);
  let gained: number | undefined;
  if (!trail) pr.lastGainTick = world.tick;
  else if (trail.length || inContact) {
    if (!trail.length) pr.lastGainTick = world.tick;
    trail.push(km);
    if (trail.length > window + 1) trail.shift();
    if (trail.length > window) gained = trail[trail.length - 1] - trail[0];
    if (gained === undefined || gained >= STALL_KM_PER_DAY() * STALL_DAYS()) pr.lastGainTick = world.tick;
  }
  const closing = !!trail && !trail.length;
  pr.bound = bound;
  pr.advance = advance;
  if (pr.objectivesHeld === op.objectives.length && bound >= op.axis.length - 1 && holds(world, op.nation, op.axis[op.axis.length - 1])) {
    if (op.kind === 'raid') for (const f of alive) send(world, s, f, { posture: 'move', target: op.axis[0] });
    return endOperation(world, s, op, 'succeeded', op.kind === 'raid' ? 'objective reached; the raiders are coming back' : 'every objective taken');
  }
  if (!alive.length) return endOperation(world, s, op, 'failed', pr.relieved.length ? 'every formation spent and pulled out' : 'every formation lost');
  if (pr.platformsAtLaunch > 0 && pr.platforms < SPENT_STRENGTH() * pr.platformsAtLaunch) return endOperation(world, s, op, 'failed', 'the force is spent');
  const idle = world.tick - pr.lastGainTick;
  const kmText = (x: number) => `${x < 10 ? x.toFixed(1) : Math.round(x)} km`;
  if (idle >= FAIL_DAYS() * perDay)
    return endOperation(world, s, op, 'failed', closing
      ? `called off: the assault never got into cell ${target} in ${Math.round(idle / perDay)} days`
      : `called off after ${Math.round(idle / perDay)} days under ${+STALL_KM_PER_DAY().toFixed(1)} km a day; ${kmText(km)} gained in all`);
  if (closing && idle >= window) {
    op.phase = 'stalled';
    pr.note = `stalled short of cell ${target}: the assault has not got in after ${Math.round(idle / perDay)} days`;
  } else if (gained !== undefined && idle > 0) {
    op.phase = 'stalled';
    pr.note = `stalled at cell ${target}: ${kmText(Math.max(0, gained))} gained in ${+STALL_DAYS().toFixed(1)} days`;
  } else {
    op.phase = 'launched';
    pr.note = `fighting for bound ${bound} of ${op.axis.length - 1}`;
  }

  // Spent formations come out of the line to refit behind the jump-off; they no longer count against the operation's mass.
  const fighting: Formation[] = [];
  for (const f of alive) {
    if (!spent(s, f)) { fighting.push(f); continue; }
    op.formations = op.formations.filter((id) => id !== f.id);
    pr.relieved.push(f.id);
    const back = op.axis[Math.max(0, bound - 2)];
    send(world, s, f, holds(world, op.nation, back) && back !== f.node ? { posture: 'reserve', target: back } : { posture: 'reserve' });
  }
  if (!fighting.length) return;

  secureAxis(world, ctx, s, op, fighting, bound);
  const base = jumpOff(world, ctx, op, bound);
  const since = s.boundSince[op.id];
  if (!since || since.bound !== bound) s.boundSince[op.id] = { bound, tick: world.tick };
  const sinceTick = s.boundSince[op.id].tick;

  const manoeuvre = fighting.filter((f) => MANOEUVRE.has(f.kind));
  const inBound = (f: Formation) => f.node === target;
  const adjacent = new Set<number>(map.neighbors(target));
  // Closed up: in the bound, at the jump-off, or on any held cell next to the bound.
  const ready = (f: Formation) => inBound(f) || f.node === base || (adjacent.has(f.node) && holds(world, op.nation, f.node));
  const assaultingNow = (f: Formation) => f.order.posture === 'attack' && f.order.target === target;
  const total = manoeuvre.reduce((t, f) => t + platforms(f), 0);
  const closed = manoeuvre.filter(ready).reduce((t, f) => t + platforms(f), 0);
  const assaulting = manoeuvre.some(inBound) || manoeuvre.some((f) => f.order.posture === 'attack' && f.order.target === target);
  const go = assaulting || base === undefined || closed >= ASSEMBLE_SHARE() * total || world.tick - sinceTick >= ASSEMBLE_DAYS * perDay;
  if (go) s.pace[op.id] ??= [];
  for (const f of manoeuvre) {
    if (assaultingNow(f)) continue;
    if (inBound(f) || (go && ready(f)) || base === undefined) send(world, s, f, { posture: 'attack', target });
    else if (f.node !== base) send(world, s, f, { posture: 'move', target: base });
  }
  // Guns, air defence and supply move up to the jump-off: next to the bound, where artillery fires for the assault.
  for (const f of fighting) if (!MANOEUVRE.has(f.kind) && base !== undefined && f.node !== base) send(world, s, f, { posture: 'move', target: base });
}

/**
 * Ground the spearhead has gone through stays held: an empty cell on the axis behind the jump-off that touches enemy
 * ground gets the operation's weakest manoeuvre formation, detached to hold it, as long as the spearhead keeps
 * MIN_SPEARHEAD formations (FM 3-90: follow-and-support forces secure the lines of communication).
 */
function secureAxis(world: World, ctx: SimContext, s: OpsState, op: Operation, fighting: Formation[], bound: number): void {
  const { map } = ctx;
  const occupied = new Set<number>();
  for (const id in world.formations) {
    const f = world.formations[id as FormationId];
    if (f.status === 'active' && f.node < map.landCount && holds(world, op.nation, f.node) && f.nation === op.nation) occupied.add(f.node);
  }
  for (let i = 1; i < bound - 1; i++) {
    const n = op.axis[i];
    if (!holds(world, op.nation, n) || occupied.has(n)) continue;
    let exposed = false;
    for (const m of map.neighbors(n)) if (m < map.landCount && !holds(world, op.nation, m) && world.control[m]) exposed = true;
    if (!exposed) continue;
    const manoeuvre = fighting.filter((f) => MANOEUVRE.has(f.kind));
    if (manoeuvre.length <= MIN_SPEARHEAD) return;
    const guard = manoeuvre.reduce((a, b) => (platforms(b) < platforms(a) || (platforms(b) === platforms(a) && b.id < a.id) ? b : a));
    fighting.splice(fighting.indexOf(guard), 1);
    op.formations = op.formations.filter((id) => id !== guard.id);
    op.progress.platformsAtLaunch -= s.base[guard.id] ?? platforms(guard);
    delete s.base[guard.id];
    send(world, s, guard, { posture: 'defend', target: n });
    delete s.sent[guard.id];
    occupied.add(n);
  }
}

/** A defence spreads its formations evenly over the objectives it still holds. */
function defend(world: World, s: OpsState, op: Operation, alive: Formation[]): void {
  const held = op.objectives.filter((n) => holds(world, op.nation, n));
  const load = new Map<number, number>(held.map((n) => [n, 0]));
  for (const f of alive) if (f.order.posture === 'defend' && f.order.target !== undefined && load.has(f.order.target)) load.set(f.order.target, load.get(f.order.target)! + 1);
  for (const f of alive) {
    if (spent(s, f) && !op.progress.relieved.includes(f.id)) continue;
    if (f.order.posture === 'defend' && f.order.target !== undefined && load.has(f.order.target)) continue;
    if (load.has(f.node) && f.order.posture === 'defend') continue;
    let to = held[0], least = Infinity;
    for (const n of held) if (load.get(n)! < least) { least = load.get(n)!; to = n; }
    load.set(to, load.get(to)! + 1);
    send(world, s, f, { posture: 'defend', target: to });
  }
}

import type { SimContext } from '../../core/engine';
import { defineParam } from '../../core/params';
import type { GameMap } from '../../core/map';
import type { DeclaredAim, Formation, NationId, NodeId, WarAim, World } from '../../core/types';
import { strategicProfile } from '../../data/nations';
import type { DiplomacyState, Side, War } from './types';

/**
 * War aims (issue #2, section 4): what each side fights for, which bounds what its forces may do (the rules of
 * engagement every AI order passes through, see orders.ts) and when its leader settles (aimStatus). This module reads
 * diplomacy's slice and imports nothing from the rest of diplomacy, so the order router can use it.
 */

/** Days a punitive campaign runs before its side has hit back enough: Balakot 26 Feb-1 Mar 2019, Sindoor 7-10 May 2025, Iran's strikes on Israel of Apr and Oct 2024 one night each. */
export const PUNITIVE_DAYS = defineParam({
  id: 'diplomacy.PUNITIVE_DAYS', value: 4, range: [1, 12], tag: 'estimated',
  source: 'Balakot 2019 (4 days), Sindoor 2025 (4 days), Iran-Israel Apr and Oct 2024 (1 night each), the Twelve-Day War 2025 (12)',
  affects: 'how long a punitive strike exchange lasts',
});

/**
 * Days without taking a cell of its claim after which a limited offensive is read by its own leaders as stalled, and
 * they settle for what they hold. Judgment: Azerbaijan's 2020 offensive paused about two weeks between its gains in the
 * south (Jabrayil 9 Oct, Fuzuli 17 Oct) and Shusha (8 Nov); Iraq's 1980 offensive stalled within weeks and Saddam
 * offered a ceasefire on 28 Sep.
 */
export const STALL_DAYS = defineParam({
  id: 'diplomacy.STALL_DAYS', value: 21, range: [7, 60], tag: 'judgment',
  source: 'judgment: Karabakh 2020 pauses of ~2 weeks; Iraq offered a ceasefire a week into its 1980 offensive',
  affects: 'when a stalled limited war is settled on current lines',
});

/**
 * War support below which a side gives up an aim smaller than conquest: the price it set on a punitive or limited war is
 * spent sooner than a nation fighting for everything gives up (EXHAUSTED_BELOW, 0.3, in support.ts). Estimates, ordered
 * after Gartner (1997): publics tolerate losses in proportion to the stakes.
 */
const WALK_AWAY: Record<WarAim['kind'], number> = { punitive: 0.5, limited: 0.4, total: 0, regime_change: 0 };

/** The leader's war support below which a side gives up the aim. */
export const walkAway = (aim: WarAim) => WALK_AWAY[aim.kind];

export const unbounded = (aim: WarAim) => aim.kind === 'total' || aim.kind === 'regime_change';

/**
 * Share of the line of contact that still trades fire on a given day between two sides when either fights a punitive
 * war: armies that are not ordered across the line shell each other only here and there. Estimate: in Sindoor
 * (7-10 May 2025) Indian and Pakistani shelling along the Line of Control killed 21 soldiers by the two governments'
 * counts and some dozens of civilians in Poonch and Rajouri, where a full positional exchange along the same front
 * costs thousands in four days; this share carries the model's positional rate down to tens. It is set on that one
 * case, so the Sindoor land-casualty question is tuned on, not held out.
 */
export const PUNITIVE_CONTACT_SHARE = defineParam({
  id: 'diplomacy.PUNITIVE_CONTACT_SHARE', value: 0.002, range: [0.0005, 0.005], tag: 'judgment',
  source: 'judgment: Sindoor 2025, 21 military dead on the Line of Control in four days (Wikipedia, 2025 India-Pakistan conflict)',
  affects: 'ground casualties in a punitive war',
});

/**
 * How much of the positional exchange (land/combat.ts lineOfContact) runs between `a` and `b`: all of it in a war fought
 * on the ground, PUNITIVE_CONTACT_SHARE when either side fights a punitive war, which sends no ground forces across.
 */
export function contactShare(world: World, a: NationId, b: NationId): number {
  const s = world.slices.diplomacy;
  const at = s && warAgainst(s, a, b);
  return at && (at.own.aim.kind === 'punitive' || at.other.aim.kind === 'punitive') ? PUNITIVE_CONTACT_SHARE() : 1;
}

const sideIndex = (war: War, n: NationId): 0 | 1 | -1 => (n in war.sides[0].members ? 0 : n in war.sides[1].members ? 1 : -1);

/** The war in which `n` fights `foe`, with the two sides as `n` sees them. */
export function warAgainst(s: DiplomacyState, n: NationId, foe: NationId): { war: War; own: Side; other: Side } | undefined {
  for (const war of s.wars) {
    const i = sideIndex(war, n);
    if (i !== -1 && sideIndex(war, foe) === 1 - i) return { war, own: war.sides[i], other: war.sides[1 - i] };
  }
  return undefined;
}

/**
 * The aim `nation` fights for in `war` (its side's aim), or undefined when it is not in it. The operational planners
 * read this and mayEnter; a planner that respects them issues no order the rules of engagement refuse.
 */
export function warAimsOf(world: World, nation: NationId, war: War | string): WarAim | undefined {
  const w = typeof war === 'string' ? world.slices.diplomacy?.wars.find((x) => x.id === war) : war;
  const i = w ? sideIndex(w, nation) : -1;
  return i === -1 ? undefined : w!.sides[i].aim;
}

const claims = new WeakMap<object, Set<NodeId>>();
function claimSet(aim: Extract<WarAim, { kind: 'limited' }>): Set<NodeId> {
  let c = claims.get(aim);
  if (!c) claims.set(aim, (c = new Set(aim.claim)));
  return c;
}

/** Whether a side fighting for `aim` may hold `node`, owned by `owner`: its own members' soil, its claim, or anything when the aim is unbounded. */
export function withinAim(side: Side, owner: NationId, node: NodeId): boolean {
  if (unbounded(side.aim) || owner in side.members) return true;
  return side.aim.kind === 'limited' && claimSet(side.aim).has(node);
}

/**
 * Whether `nation`'s ground forces may enter `node` under its war aims: any cell not held by a foe, and a foe's cell
 * only when its side's aim reaches it (withinAim).
 */
export function mayEnter(world: World, map: GameMap, nation: NationId, node: NodeId): boolean {
  const s = world.slices.diplomacy;
  if (!s || map.isSea(node)) return true;
  const holder = world.control[node];
  if (!holder || holder === nation) return true;
  const at = warAgainst(s, nation, holder);
  return !at || withinAim(at.own, map.owner[node], node);
}

/** The war `nation` fights, when every war it is in is punitive for its side: its fleet then keeps to its own waters. */
export function punitiveOnly(s: DiplomacyState, nation: NationId): War | undefined {
  let found: War | undefined;
  for (const w of s.wars) {
    const i = sideIndex(w, nation);
    if (i === -1) continue;
    if (w.sides[i].aim.kind !== 'punitive') return undefined;
    found ??= w;
  }
  return found;
}

/** A sea zone off the coast `nation` or a co-belligerent holds. */
export function ownWaters(world: World, map: GameMap, s: DiplomacyState, nation: NationId, sea: NodeId): boolean {
  const friends = new Set<NationId>([nation]);
  for (const w of s.wars) {
    const i = sideIndex(w, nation);
    if (i !== -1) for (const m of Object.keys(w.sides[i].members)) friends.add(m as NationId);
  }
  for (const n of map.neighbors(sea)) if (!map.isSea(n) && friends.has(world.control[n])) return true;
  return false;
}

const AIR = new Set<Formation['kind']>(['air_wing', 'missile']);
const NAVAL = new Set<Formation['kind']>(['surface_group', 'submarine']);
const GROUND_POSTURES = new Set(['attack', 'move', 'air_assault']);

/**
 * The rules of engagement a side's aim sets: why an order to formation `f` would carry the war past its aim, or
 * undefined when it may go ahead. Ground and amphibious forces stay out of ground the aim does not reach (mayEnter);
 * in a punitive war the fleet neither blockades nor leaves its own waters (no naval action was fought in Sindoor, 2025). Strikes are what a punitive war
 * is, so air and missile orders always pass.
 */
export function aimRefusal(world: World, map: GameMap, f: Formation, order: { posture: string; target?: NodeId }): { war: War; why: string } | undefined {
  const s = world.slices.diplomacy;
  const target = order.target;
  if (!s?.wars.length || AIR.has(f.kind) || target === undefined) return undefined;
  if (!map.isSea(target)) {
    if (!GROUND_POSTURES.has(order.posture) || mayEnter(world, map, f.nation, target)) return undefined;
    const { war, own } = warAgainst(s, f.nation, world.control[target])!;
    return { war, why: own.aim.kind === 'punitive' ? 'the war is a punitive strike campaign: no ground forces cross the line' : 'the ground lies outside what the war is being fought for' };
  }
  if (!NAVAL.has(f.kind)) return undefined;
  const war = punitiveOnly(s, f.nation);
  if (!war) return undefined;
  if (order.posture === 'blockade') return { war, why: 'the war is a punitive strike campaign: no blockade' };
  return ownWaters(world, map, s, f.nation, target) ? undefined : { war, why: 'the war is a punitive strike campaign: the fleet keeps to its own waters' };
}

/**
 * Both sides of `war` now fight for everything: one side's government has carried the war past its aim (its player
 * ordered it), or used nuclear weapons. Wars grow this way (the 1967 and 1973 Arab-Israeli
 * wars; the 1999 Kargil war stayed limited because India kept its forces on its side of the Line of Control).
 */
export function widen(world: World, ctx: SimContext, war: War, why: string): void {
  if (war.sides.every((side) => side.aim.kind === 'total')) return;
  for (const side of war.sides) if (!unbounded(side.aim)) side.aim = { kind: 'total' };
  world.slices.diplomacy.rev++;
  ctx.emit({ type: 'message', tick: world.tick, text: `the ${war.name} grows into a war for everything: ${why}` });
}

/**
 * Ground changing hands and nuclear use between the sides of each war this tick: captures go on the war's record, a
 * capture inside a limited claim resets the side's stall clock, and a nuclear detonation widens the war. Ground taken
 * past a side's aim without its government choosing to (a defence pressed home, a pursuit) does not widen it: the
 * terms hand it back.
 */
export function trackWarGround(world: World, ctx: SimContext, s: DiplomacyState): void {
  const { map } = ctx;
  for (const e of world.events) {
    if (e.type === 'node_captured') {
      const at = warAgainst(s, e.to, e.from);
      if (!at) continue;
      const taken = (at.war.taken ??= []);
      if (!taken.includes(e.node)) taken.push(e.node);
      if (at.own.aim.kind === 'limited' && claimSet(at.own.aim).has(e.node)) at.own.gained = world.tick;
    } else if (e.type === 'nuclear_detonation' && !map.isSea(e.node)) {
      const at = warAgainst(s, e.by, world.control[e.node]);
      if (at) widen(world, ctx, at.war, `${e.by} used a nuclear weapon`);
    }
  }
}

/** Cells of `by`'s homeland that `on` holds. */
export function ownSoilHeldBy(world: World, map: GameMap, by: NationId, on: NationId): NodeId[] {
  return map.nodesOf(by).filter((n) => world.control[n] === on);
}

/** Whether `by` holds a first-rank objective to take `on` whole or annex its ground (data/nations strategic objectives). */
function seeksConquest(by: NationId, on: NationId): boolean {
  return (strategicProfile[by]?.objectives ?? []).some((o) => o.priority === 1 && (o.kind === 'unify' || o.kind === 'annex') && o.targets.includes(on));
}

/**
 * The aim of a declaration. A stated aim stands; a limited aim without a claim claims the declarer's soil the target
 * holds. Unstated, a state whose homeland the target holds fights to recover it, unless it has a first-rank objective
 * to take more (Azerbaijan in 2020 for the districts round Karabakh; Russia against Ukraine fights for more), and
 * otherwise for everything.
 */
export function declaredAim(world: World, map: GameMap, by: NationId, on: NationId, stated?: DeclaredAim): WarAim {
  if (stated?.kind === 'limited') return { kind: 'limited', claim: stated.claim ? [...stated.claim] : ownSoilHeldBy(world, map, by, on) };
  if (stated) return { kind: stated.kind };
  const held = ownSoilHeldBy(world, map, by, on);
  return held.length && !seeksConquest(by, on) ? { kind: 'limited', claim: held } : { kind: 'total' };
}

/**
 * The aim of the side a war is declared on: it answers in kind. A punitive strike draws strikes back (Pakistan's
 * Bunyan-um-Marsoos, 10 May 2025), a limited war is fought over the same ground, and a war for everything is answered
 * with everything (Ukraine's Kursk offensive, 2024).
 */
export function answeringAim(aim: WarAim): WarAim {
  if (aim.kind === 'limited') return { kind: 'limited', claim: [...aim.claim] };
  return aim.kind === 'punitive' ? { kind: 'punitive' } : { kind: 'total' };
}

/** Where a side stands against its own aim: still fighting for it, met, or past the point where it walks away. */
export type AimStatus = { status: 'fighting' } | { status: 'met' | 'spent'; why: string };

/**
 * Whether the side `side` of `war` has what it fought for, or has paid more than it was worth. A punitive campaign is
 * done once it has run PUNITIVE_DAYS; a limited war once the side holds its whole claim, or once its offensive has
 * stalled for STALL_DAYS (its leaders read their prospects off the ground they are, or are not, taking). Either is
 * spent once its leader's war support falls below WALK_AWAY. Wars for everything are settled by exhaustion and
 * capitulation instead (support.ts).
 */
export function aimStatus(world: World, war: War, side: 0 | 1): AimStatus {
  const own = war.sides[side];
  const aim = own.aim;
  if (unbounded(aim)) return { status: 'fighting' };
  const leader = world.nations[own.leader];
  if (leader.warSupport < WALK_AWAY[aim.kind]) return { status: 'spent', why: `war support in ${own.leader} has fallen below what the ${aim.kind} aim is worth` };
  const days = ((world.tick - war.since) * world.dtHours) / 24;
  if (aim.kind === 'punitive') return days >= PUNITIVE_DAYS() ? { status: 'met', why: 'the punitive strikes have been delivered' } : { status: 'fighting' };
  if (aim.claim.every((n) => world.control[n] in own.members)) return { status: 'met', why: 'it holds the ground it claimed' };
  if (((world.tick - own.gained) * world.dtHours) / 24 >= STALL_DAYS()) return { status: 'spent', why: 'its offensive has stalled' };
  return { status: 'fighting' };
}

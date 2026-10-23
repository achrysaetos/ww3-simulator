/**
 * The drag's pure core: what is under the cursor, which order the dragged units take there (one table), the public
 * checks that refuse it before release, and the commands release sends. Runs on the page on every pointer move.
 */
import type { GameMap } from '../../core/map';
import type { Command, FormationId, FormationKind, NodeId, Order, Posture, RefusalCode } from '../../core/types';
import { overseas } from '../../systems/land/strategic';
import { THEATRE_KM } from '../../systems/land/movement';
import { NO_NATION } from '../snapshot';
import { estimateContest, estimateFront, estimateHold, estimateRebase, estimateStrike, estimateTake, frontSlots, type Estimator, type Pill } from './estimate';
import { routeKm, SIDE, type DragKit, type SubjectClass, type SubjectUnit } from './kit';

export type { SubjectClass } from './kit';

/** What is under the cursor, decided from the public control map, geography and the belief kit. */
export type TargetKind =
  | 'enemy_contact' // a believed hostile formation's counter or ghost is under the cursor
  | 'enemy_ground' // land held by a nation at war with the player
  | 'own_front' // own or friendly land next to enemy ground
  | 'own_ground' // own or friendly land, not front
  | 'neutral_ground' // land held by a nation not at war with the player, or by no one
  | 'enemy_waters' // sea next to an enemy coast or a strait
  | 'sea'; // any other sea node

export interface Target { kind: TargetKind; node: NodeId; contact: FormationId | null }

export type IntentKind = 'attack' | 'naval_attack' | 'strike' | 'move_hold' | 'hold_front' | 'patrol' | 'sea_patrol' | 'blockade' | 'rebase';

/** THE table. A missing cell means that subject cannot take that target, and the pill says why. */
export const ORDERS = {
  ground: { enemy_contact: 'attack', enemy_ground: 'attack', own_front: 'hold_front', own_ground: 'move_hold' },
  fires: { enemy_contact: 'strike', enemy_ground: 'strike', own_front: 'move_hold', own_ground: 'move_hold' },
  air_defense: { own_front: 'move_hold', own_ground: 'move_hold' },
  air: { enemy_contact: 'strike', enemy_ground: 'strike', own_front: 'patrol', own_ground: 'rebase', sea: 'patrol', enemy_waters: 'patrol' },
  fleet: { enemy_contact: 'naval_attack', enemy_waters: 'blockade', sea: 'sea_patrol' },
} as const satisfies Record<SubjectClass, Partial<Record<TargetKind, IntentKind>>>;

/** Refusals the page may give before release: only those decided by public or own facts. */
export type PublicRefusal = Extract<RefusalCode, 'wrong_role' | 'out_of_range' | 'no_route' | 'neutral_territory' | 'no_airfield'>;
export type Refusal = { code: PublicRefusal; reason: string };
export type PublicCheck = (kit: DragKit, u: SubjectUnit, t: Target, map: GameMap) => Refusal | null;

/** One row per intent: the posture it sends, the checks the engine would also make, how it builds each order, and how it estimates. */
export interface IntentSpec {
  posture: Posture;
  /** In the engine's own order, so the first failure is the refusal the engine would give. */
  checks: readonly PublicCheck[];
  order(u: SubjectUnit, t: Target, slot: NodeId, kit: DragKit, map: GameMap): Omit<Order, 'issuedTick'>;
  estimate: Estimator;
}

/** Formations whose orders the land handler routes; a missile or SAM move goes to the air handler, which takes any destination. */
const LAND_ROUTED: ReadonlySet<FormationKind> = new Set(['maneuver', 'logistics', 'artillery']);

const route = (posture: 'attack' | 'move'): PublicCheck => (kit, u, t, map) => {
  if (!LAND_ROUTED.has(u.kind) || routeKm(kit, u, t.node, posture) !== Infinity) return null;
  // With no land route a move still deploys by lift overseas or between theatres (land/movement.ts); an attack does not.
  if (posture === 'move' && (overseas(map, u.node, t.node) || map.distanceKm(u.node, t.node) >= THEATRE_KM)) return null;
  return { code: 'no_route', reason: `no land route there` };
};

const reach = (strike: boolean): PublicCheck => (_kit, u, t, map) => {
  const km = strike ? u.strikeKm : u.patrolKm;
  if (km <= 0) return { code: 'wrong_role', reason: strike ? 'no strike aircraft or launchers' : 'no fighters for counter-air' };
  const d = map.distanceKm(u.node, t.node);
  return d > km ? { code: 'out_of_range', reason: `${Math.round(d)} km away, beyond reach of ${Math.round(km)} km` } : null;
};

const atWarWith: PublicCheck = (kit, _u, t) =>
  t.kind === 'enemy_contact' || kit.field.hostile[t.node] ? null : { code: 'neutral_territory', reason: 'nothing there belongs to a nation you are at war with' };

const inFerryRange: PublicCheck = (_kit, u, t, map) => {
  const d = map.distanceKm(u.node, t.node);
  if (d > u.ferryKm) return { code: 'out_of_range', reason: `${Math.round(d)} km away, beyond ferry range of ${Math.round(u.ferryKm)} km` };
  return map.isSea(t.node) ? { code: 'no_airfield', reason: 'no airfield at sea' } : null;
};

const seaRoute: PublicCheck = (kit, u, t) => {
  const km = kit.routes.find((x) => x.from === u.node)?.seaKm?.[t.node] ?? Infinity;
  return km < Infinity ? null : { code: 'no_route', reason: 'no sea route there' };
};

const toTarget = (posture: Posture) => (_u: SubjectUnit, t: Target): Omit<Order, 'issuedTick'> => ({ posture, target: t.node });
const toSlot = (posture: Posture) => (_u: SubjectUnit, _t: Target, slot: NodeId): Omit<Order, 'issuedTick'> => ({ posture, target: slot });

/** What a strike aims at: ships at sea, forces where a believed enemy stands, else what is built there. */
function strikeOrder(_u: SubjectUnit, t: Target, _slot: NodeId, kit: DragKit, map: GameMap): Omit<Order, 'issuedTick'> {
  const targetClass = map.isSea(t.node) ? 'ship' : t.contact || kit.field.enemyPower[t.node] > 0 ? 'armor' : 'structure';
  return { posture: 'strike', target: t.node, targetClass };
}

export const INTENTS = {
  attack: { posture: 'attack', checks: [route('attack')], order: toTarget('attack'), estimate: estimateTake },
  naval_attack: { posture: 'attack', checks: [seaRoute], order: toTarget('attack'), estimate: estimateContest },
  strike: { posture: 'strike', checks: [reach(true), atWarWith], order: strikeOrder, estimate: estimateStrike },
  move_hold: { posture: 'move', checks: [route('move')], order: toTarget('move'), estimate: estimateHold },
  hold_front: { posture: 'move', checks: [route('move')], order: toSlot('move'), estimate: estimateFront },
  patrol: { posture: 'air_superiority', checks: [reach(false)], order: toTarget('air_superiority'), estimate: estimateContest },
  sea_patrol: { posture: 'patrol', checks: [seaRoute], order: toTarget('patrol'), estimate: estimateContest },
  blockade: { posture: 'blockade', checks: [seaRoute], order: toTarget('blockade'), estimate: estimateContest },
  rebase: { posture: 'move', checks: [inFerryRange], order: toTarget('move'), estimate: estimateRebase },
} as const satisfies Record<IntentKind, IntentSpec>;

const sideAt = (kit: DragKit, control: ArrayLike<number>, n: number) => (control[n] === NO_NATION ? SIDE.neutral : kit.sides[control[n]] ?? SIDE.neutral);

function touchesEnemy(kit: DragKit, map: GameMap, control: ArrayLike<number>, n: number): boolean {
  for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
    const m = map.adj[k];
    if (m < map.landCount && sideAt(kit, control, m) === SIDE.hostile) return true;
  }
  return false;
}

const isStrait = (map: GameMap, n: number) => map.straits.some((s) => s.a === n || s.b === n);

/** Classification reads the public control map, geography and the kit: a believed enemy under the cursor wins over the ground beneath it. */
export function classify(under: { node: NodeId; contact: FormationId | null }, map: GameMap, control: ArrayLike<number>, kit: DragKit): Target {
  const c = under.contact ? kit.contacts[under.contact] : undefined;
  if (c) return { kind: 'enemy_contact', node: c.node, contact: c.id };
  const n = under.node;
  if (map.isSea(n)) return { kind: touchesEnemy(kit, map, control, n) || isStrait(map, n) ? 'enemy_waters' : 'sea', node: n, contact: null };
  const side = sideAt(kit, control, n);
  const kind: TargetKind = side === SIDE.hostile ? 'enemy_ground' : side === SIDE.neutral ? 'neutral_ground' : touchesEnemy(kit, map, control, n) ? 'own_front' : 'own_ground';
  return { kind, node: n, contact: null };
}

/** Contiguous own-front cells from `at`, at most `n`, by breadth-first search along own and friendly cells that touch enemy ground. */
export function frontage(map: GameMap, control: ArrayLike<number>, kit: DragKit, at: NodeId, n: number): NodeId[] {
  const front = (c: number) => c < map.landCount && sideAt(kit, control, c) !== SIDE.hostile && sideAt(kit, control, c) !== SIDE.neutral && touchesEnemy(kit, map, control, c);
  if (!front(at)) return [at];
  const out: NodeId[] = [at];
  const seen = new Set<number>([at]);
  for (let i = 0; i < out.length && out.length < n; i++)
    for (let k = map.adjStart[out[i]]; k < map.adjStart[out[i] + 1] && out.length < n; k++) {
      const m = map.adj[k];
      if (seen.has(m)) continue;
      seen.add(m);
      if (front(m)) out.push(m as NodeId);
    }
  return out;
}

const CLASS_NOUN: Record<SubjectClass, string> = { ground: 'ground troops', fires: 'artillery and missiles', air_defense: 'air defence', air: 'aircraft', fleet: 'ships' };
const TARGET_VERB: Record<TargetKind, string> = {
  enemy_contact: 'attack that', enemy_ground: 'take enemy ground', own_front: 'hold the front', own_ground: 'go there',
  neutral_ground: 'enter neutral ground', enemy_waters: 'go to sea', sea: 'go to sea',
};

function wrongTarget(u: SubjectUnit, t: Target): Refusal {
  if (t.kind === 'neutral_ground') return { code: 'neutral_territory', reason: 'neutral ground: you are not at war with whoever holds it' };
  return { code: 'wrong_role', reason: `${CLASS_NOUN[u.cls]} cannot ${TARGET_VERB[t.kind]}` };
}

const intentOf = (u: SubjectUnit, t: Target): IntentKind | null => (ORDERS[u.cls] as Partial<Record<TargetKind, IntentKind>>)[t.kind] ?? null;

/** The whole per-move computation. Pure. */
export interface Aim { target: Target; intent: IntentKind | null; going: FormationId[]; staying: FormationId[]; pill: Pill; commands: Command[]; cells: NodeId[] }

export function aim(kit: DragKit, under: { node: NodeId; contact: FormationId | null }, map: GameMap, control: ArrayLike<number>): Aim {
  const target = classify(under, map, control, kit);
  // The intent most of the stack's power can do; the rest stay.
  const weight = new Map<IntentKind, number>();
  for (const u of kit.units) {
    const i = intentOf(u, target);
    if (i) weight.set(i, (weight.get(i) ?? 0) + Math.max(u.power, 1e-6));
  }
  let intent: IntentKind | null = null;
  for (const [i, w] of weight) if (!intent || w > weight.get(intent)!) intent = i;
  const strongest = kit.units.reduce((a, b) => (b.power > a.power ? b : a));
  const all = kit.units.map((u) => u.id);
  if (!intent) return refused(target, null, all, wrongTarget(strongest, target));
  const spec: IntentSpec = INTENTS[intent];
  const going: SubjectUnit[] = [];
  let first: { u: SubjectUnit; why: Refusal } | undefined;
  for (const u of kit.units) {
    if (intentOf(u, target) !== intent) continue;
    let why: Refusal | null = null;
    for (const check of spec.checks) if ((why = check(kit, u, target, map))) break;
    if (!why) going.push(u);
    else if (!first || u.power > first.u.power) first = { u, why };
  }
  const staying = kit.units.filter((u) => !going.includes(u)).map((u) => u.id);
  if (!going.length) return refused(target, intent, staying, first!.why);
  const cells = intent === 'hold_front' ? reachable(kit, going, frontage(map, control, kit, target.node, going.length)) : [target.node];
  const slots = intent === 'hold_front' ? frontSlots(kit, map, going, cells) : going.map(() => target.node);
  const pill = spec.estimate(kit, going, target, slots, map);
  pill.who = { going: going.length, staying: staying.length };
  return { target, intent, going: going.map((u) => u.id), staying, pill, commands: commandsFor(kit, intent, going, target, slots, map), cells };
}

function refused(target: Target, intent: IntentKind | null, staying: FormationId[], why: Refusal): Aim {
  return { target, intent, going: [], staying, pill: { kind: 'refused', ...why, who: { going: 0, staying: staying.length }, caveats: [] }, commands: [], cells: [] };
}

/** Front cells every going unit can march to; the aimed cell always stays. */
function reachable(kit: DragKit, going: SubjectUnit[], cells: NodeId[]): NodeId[] {
  return cells.filter((c, i) => i === 0 || going.every((u) => !LAND_ROUTED.has(u.kind) || routeKm(kit, u, c, 'move') !== Infinity));
}

/** One 'order' per going unit, each to its slot (the target, or its own front cell). `byPlayer` is left off: the host stamps it. */
export function commandsFor(kit: DragKit, intent: IntentKind, going: SubjectUnit[], target: Target, slots: NodeId[], map: GameMap): Command[] {
  const spec: IntentSpec = INTENTS[intent];
  return going.map((u, i) => ({ type: 'order' as const, nation: kit.player, formation: u.id, order: spec.order(u, target, slots[i], kit, map) }));
}

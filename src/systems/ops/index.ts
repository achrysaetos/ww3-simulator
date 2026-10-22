import { atWar, newId, type SimContext, type System } from '../../core/engine';
import type { GameMap } from '../../core/map';
import { findPath } from '../../core/path';
import {
  OPERATION_KINDS, type FormationId, type FormationKind, type NationId, type NodeId, type Operation, type OperationId,
  type OperationPhase, type RefusalCode, type World,
} from '../../core/types';
import { allied } from '../land/state';
import { TERRAIN } from '../land/tables';
import { answerCommand, type OperationCommand, type OrderOutcome } from '../orders';
import { executeOperation } from './execute';
import { ACTIVE, committedFormations, endOperation, holds, opsSlice, platforms, type OpsState } from './state';

export { ACTIVE, committedFormations, operationOf, opsSlice, type OpsState } from './state';


const OPEN: ReadonlySet<OperationPhase> = new Set(['draft', 'launched', 'stalled']);
/** What an operation can command: the ground forces and what moves with them. Air wings and fleets are tasked by their own staffs. */
const OP_KINDS: ReadonlySet<FormationKind> = new Set(['maneuver', 'artillery', 'air_defense', 'logistics']);
const MAX_OBJECTIVES = 8;
const MAX_AXIS = 64;
const MAX_FORMATIONS = 64;
/** An H-hour further out than this is a contingency plan, not an operation order. */
const MAX_LEAD_DAYS = 90;
/** Ended operations stay on the books this long for their after-action report, then drop out of the save. */
const KEEP_ENDED_DAYS = 7;

const CODE_NAMES = [
  'Zenith', 'Anvil', 'Bastion', 'Cobalt', 'Driftwood', 'Ember', 'Falchion', 'Granite', 'Harrow', 'Ironside', 'Javelin', 'Kestrel',
  'Lodestar', 'Meridian', 'Nightfall', 'Onyx', 'Palisade', 'Quarry', 'Rampart', 'Sabre', 'Tempest', 'Umbra', 'Vanguard', 'Wolfram',
] as const;

/**
 * The staff's route through `stops` over land, cheapest by terrain, trimmed to start at the line of departure: the last
 * friendly cell before the first one held by someone else. Undefined when no land route joins them.
 */
export function routeAxis(world: World, map: GameMap, nation: NationId, stops: readonly NodeId[]): NodeId[] | undefined {
  const cost = (_a: NodeId, b: NodeId, km: number) => (b < map.landCount ? km * TERRAIN[map.terrain[b]].moveCost : Infinity);
  const route: NodeId[] = [stops[0]];
  for (let i = 1; i < stops.length; i++) {
    if (stops[i] === route[route.length - 1]) continue;
    const leg = findPath(map, route[route.length - 1], stops[i], cost, 50_000);
    if (!leg) return undefined;
    route.push(...leg);
  }
  const first = route.findIndex((n) => !holds(world, nation, n));
  return first <= 0 ? route : route.slice(first - 1);
}

type Refusal = { ok: false; code: RefusalCode; reason: string };
const refuse = (code: RefusalCode, reason: string): Refusal => ({ ok: false, code, reason });

function checkNodes(map: GameMap, nodes: unknown, what: string, max: number): NodeId[] | Refusal {
  if (!Array.isArray(nodes) || nodes.length === 0 || nodes.length > max) return refuse('invalid', `${what}: give 1 to ${max} cells`);
  for (const n of nodes) if (!Number.isInteger(n) || n < 0 || n >= map.landCount) return refuse('bad_target', `${what}: ${String(n)} is not a land cell`);
  return nodes as NodeId[];
}

/** The formations an operation may take: the nation's own ground forces, alive, ashore and not committed to another running operation. */
function checkFormations(world: World, map: GameMap, nation: NationId, ids: unknown, self?: OperationId): FormationId[] | Refusal {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_FORMATIONS) return refuse('invalid', `give 1 to ${MAX_FORMATIONS} formations`);
  const committed = committedFormations(world);
  for (const id of ids as FormationId[]) {
    const f = world.formations[id];
    if (!f) return refuse('unknown_formation', `no formation ${String(id)}`);
    if (f.nation !== nation) return refuse('not_yours', `${f.name} belongs to ${f.nation}`);
    if (f.status === 'destroyed') return refuse('destroyed', `${f.name} has been destroyed`);
    if (!OP_KINDS.has(f.kind)) return refuse('wrong_role', `${f.name} is not a ground formation`);
    if (f.status === 'embarked' || f.node >= map.landCount) return refuse('embarked', `${f.name} is not ashore`);
    const other = committed.get(id);
    if (other && other.id !== self) return refuse('not_ready', `${f.name} is already committed to ${other.name}`);
  }
  return [...new Set(ids as FormationId[])];
}

/** Where the force starts from: the committed manoeuvre formation nearest the first stop. */
function startNode(world: World, map: GameMap, formations: readonly FormationId[], toward: NodeId): NodeId {
  let best = world.formations[formations[0]].node, bestKm = Infinity;
  for (const id of formations) {
    const f = world.formations[id];
    const km = map.distanceKm(f.node, toward) + (f.kind === 'maneuver' ? 0 : 1e6);
    if (km < bestKm) { bestKm = km; best = f.node; }
  }
  return best;
}

function plannedAxis(world: World, map: GameMap, nation: NationId, formations: readonly FormationId[], objectives: readonly NodeId[], waypoints: readonly NodeId[] | undefined): NodeId[] | Refusal {
  const first = waypoints?.[0] ?? objectives[0];
  const axis = routeAxis(world, map, nation, [startNode(world, map, formations, first), ...(waypoints ?? []), ...objectives]);
  if (!axis) return refuse('no_route', 'no land route from the formations to the objective');
  if (axis.length > MAX_AXIS) return refuse('out_of_range', `the axis runs ${axis.length} cells; plan a nearer objective`);
  return axis;
}

/** An attack on ground held by a nation the planner is not at war with is not launched. */
function neutralObjective(world: World, op: Pick<Operation, 'nation' | 'kind' | 'objectives' | 'axis'>): Refusal | undefined {
  if (op.kind === 'defence') return undefined;
  for (const n of [...op.axis, ...op.objectives]) {
    const holder = world.control[n];
    if (holder && !allied(world, op.nation, holder) && !atWar(world, op.nation, holder)) return refuse('neutral_territory', `${holder} holds part of the axis and you are not at war with it`);
  }
  return undefined;
}

function hHourOf(world: World, h: unknown): number | Refusal {
  if (h === undefined) return world.tick;
  if (!Number.isInteger(h) || (h as number) < world.tick || (h as number) > world.tick + (MAX_LEAD_DAYS * 24) / world.dtHours) return refuse('invalid', 'H-hour must be a tick from now to 90 days ahead');
  return h as number;
}

const isRefusal = (v: unknown): v is Refusal => typeof v === 'object' && v !== null && (v as Refusal).ok === false;

function codeName(s: OpsState, nation: NationId): string {
  const k = s.planned[nation] ?? 0;
  s.planned[nation] = k + 1;
  const round = Math.floor(k / CODE_NAMES.length);
  return `Operation ${CODE_NAMES[k % CODE_NAMES.length]}${round ? ` ${round + 1}` : ''}`;
}

function launch(world: World, s: OpsState, op: Operation, hHour: number): void {
  op.phase = 'launched';
  op.hHour = hHour;
  op.launchedTick ??= world.tick;
  op.progress.lastGainTick = Math.max(world.tick, hHour);
  op.progress.note = hHour > world.tick ? 'launched; waiting for H-hour' : 'launched';
  for (const id of op.formations) s.base[id] ??= platforms(world.formations[id]);
  op.progress.platformsAtLaunch = op.formations.reduce((t, id) => t + (s.base[id] ?? 0), 0);
}

function apply(world: World, cmd: OperationCommand, ctx: SimContext): { outcome: OrderOutcome; operation?: OperationId; accepted: string } {
  const { map } = ctx;
  const s = opsSlice(world);
  if (cmd.type === 'plan_operation') {
    if (!OPERATION_KINDS.includes(cmd.kind)) return { outcome: refuse('invalid', `unknown kind of operation ${String(cmd.kind)}`), accepted: '' };
    const objectives = checkNodes(map, cmd.objectives, 'objectives', MAX_OBJECTIVES);
    if (isRefusal(objectives)) return { outcome: objectives, accepted: '' };
    const waypoints = cmd.axis === undefined ? undefined : checkNodes(map, cmd.axis, 'axis', MAX_AXIS);
    if (isRefusal(waypoints)) return { outcome: waypoints, accepted: '' };
    const formations = checkFormations(world, map, cmd.nation, cmd.formations);
    if (isRefusal(formations)) return { outcome: formations, accepted: '' };
    const hHour = hHourOf(world, cmd.hHour);
    if (isRefusal(hHour)) return { outcome: hHour, accepted: '' };
    const axis = plannedAxis(world, map, cmd.nation, formations, objectives, waypoints);
    if (isRefusal(axis)) return { outcome: axis, accepted: '' };
    const draft = { nation: cmd.nation, kind: cmd.kind, objectives, axis };
    const neutral = cmd.launch ? neutralObjective(world, draft) : undefined;
    if (neutral) return { outcome: neutral, accepted: '' };
    const name = typeof cmd.name === 'string' && cmd.name.trim() ? cmd.name.trim().slice(0, 60) : codeName(s, cmd.nation);
    if (typeof cmd.name === 'string' && cmd.name.trim()) s.planned[cmd.nation] = (s.planned[cmd.nation] ?? 0) + 1;
    const id = newId<OperationId>(world, 'op');
    const op: Operation = {
      id, nation: cmd.nation, name, kind: cmd.kind, objectives, axis, formations, phase: 'draft', hHour,
      planner: cmd.byPlayer ? 'player' : 'ai', plannedTick: world.tick,
      progress: { bound: 0, advance: 0, objectivesHeld: 0, platformsAtLaunch: 0, platforms: 0, lastGainTick: world.tick, relieved: [], note: 'planned' },
    };
    s.byId[id] = op;
    if (cmd.launch) launch(world, s, op, hHour);
    const eta = (hHour - world.tick) * world.dtHours;
    return { outcome: { ok: true, ...(cmd.launch ? { etaHours: eta } : {}) }, operation: id, accepted: `${name} ${cmd.launch ? 'launched' : 'planned'}: ${formations.length} formations on a ${axis.length}-cell axis` };
  }

  const op = s.byId[cmd.operation];
  if (!op) return { outcome: refuse('invalid', 'no such operation'), accepted: '' };
  if (op.nation !== cmd.nation) return { outcome: refuse('not_yours', `${op.name} belongs to ${op.nation}`), operation: op.id, accepted: '' };
  if (!OPEN.has(op.phase)) return { outcome: refuse('not_ready', `${op.name} has ${op.phase === 'cancelled' ? 'been cancelled' : op.phase}`), operation: op.id, accepted: '' };
  switch (cmd.type) {
    case 'launch_operation': {
      if (op.phase === 'launched') return { outcome: refuse('not_ready', `${op.name} is already under way`), operation: op.id, accepted: '' };
      const hHour = hHourOf(world, cmd.hHour);
      if (isRefusal(hHour)) return { outcome: hHour, operation: op.id, accepted: '' };
      const alive = checkFormations(world, map, op.nation, op.formations.filter((id) => world.formations[id]?.status !== 'destroyed'), op.id);
      if (isRefusal(alive)) return { outcome: alive.code === 'invalid' ? refuse('destroyed', `${op.name} has no formations left`) : alive, operation: op.id, accepted: '' };
      const neutral = neutralObjective(world, op);
      if (neutral) return { outcome: neutral, operation: op.id, accepted: '' };
      op.formations = alive;
      launch(world, s, op, hHour);
      return { outcome: { ok: true, etaHours: (hHour - world.tick) * world.dtHours }, operation: op.id, accepted: `${op.name} launched` };
    }
    case 'cancel_operation':
      for (const id of op.formations) {
        const f = world.formations[id];
        if (f && f.status !== 'destroyed' && f.node < map.landCount) world.pending.push({ type: 'order', nation: f.nation, formation: f.id, order: { posture: 'defend' } });
      }
      endOperation(world, s, op, 'cancelled', 'cancelled');
      return { outcome: { ok: true }, operation: op.id, accepted: `${op.name} cancelled; its formations hold where they stand` };
    case 'adjust_operation': {
      const objectives = cmd.objectives === undefined ? op.objectives : checkNodes(map, cmd.objectives, 'objectives', MAX_OBJECTIVES);
      if (isRefusal(objectives)) return { outcome: objectives, operation: op.id, accepted: '' };
      const waypoints = cmd.axis === undefined ? undefined : checkNodes(map, cmd.axis, 'axis', MAX_AXIS);
      if (isRefusal(waypoints)) return { outcome: waypoints, operation: op.id, accepted: '' };
      const formations = cmd.formations === undefined ? op.formations : checkFormations(world, map, op.nation, cmd.formations, op.id);
      if (isRefusal(formations)) return { outcome: formations, operation: op.id, accepted: '' };
      const hHour = cmd.hHour === undefined ? op.hHour : hHourOf(world, cmd.hHour);
      if (isRefusal(hHour)) return { outcome: hHour, operation: op.id, accepted: '' };
      const reroute = cmd.objectives !== undefined || cmd.axis !== undefined;
      const axis = reroute ? plannedAxis(world, map, op.nation, formations, objectives, waypoints) : op.axis;
      if (isRefusal(axis)) return { outcome: axis, operation: op.id, accepted: '' };
      if (op.phase !== 'draft') {
        const neutral = neutralObjective(world, { ...op, objectives, axis });
        if (neutral) return { outcome: neutral, operation: op.id, accepted: '' };
      }
      for (const id of op.formations) if (!formations.includes(id)) { delete s.base[id]; delete s.sent[id]; }
      op.objectives = objectives;
      op.axis = axis;
      op.formations = formations;
      op.hHour = hHour;
      if (reroute) delete s.boundSince[op.id];
      if (op.phase !== 'draft') {
        for (const id of formations) s.base[id] ??= platforms(world.formations[id]);
        op.progress.platformsAtLaunch = formations.reduce((t, id) => t + (s.base[id] ?? 0), 0) + op.progress.relieved.reduce((t, id) => t + (s.base[id] ?? 0), 0);
      }
      return { outcome: { ok: true }, operation: op.id, accepted: `${op.name} re-planned` };
    }
  }
}

/**
 * Operations: a named objective, an axis, a force and an H-hour, which the staff executes one bound at a time and
 * reports on. Owns the operation commands. Runs before the AI, so the AI plans around the formations operations hold;
 * the orders it gives go into `world.pending` like anyone's, through the chain of command, for the next tick.
 */
export const operations: System = {
  id: 'ops',
  commands: ['plan_operation', 'launch_operation', 'cancel_operation', 'adjust_operation'],
  init(world) {
    opsSlice(world);
  },
  apply(world, cmd, ctx) {
    const c = cmd as OperationCommand;
    const { outcome, operation, accepted } = apply(world, c, ctx);
    ctx.emit(answerCommand(world, c, outcome, accepted, operation ? { operation } : {}));
  },
  step(world, ctx) {
    const s = world.slices.ops;
    if (!s) return;
    const keepTicks = (KEEP_ENDED_DAYS * 24) / world.dtHours;
    for (const id of Object.keys(s.byId) as OperationId[]) {
      const op = s.byId[id];
      if (op.endedTick !== undefined && world.tick - op.endedTick > keepTicks) delete s.byId[id];
      else if (ACTIVE.has(op.phase) && world.tick >= op.hHour) executeOperation(world, ctx, s, op);
    }
  },
};

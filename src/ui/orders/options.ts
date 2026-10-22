/**
 * What the player can order here, asked of the engine itself. Each candidate order is applied to a
 * sandbox of the live World by the system that owns it, so the radial menu greys exactly the orders
 * the engine would refuse, with the engine's reason, and shows how long each takes to arrive. The
 * real World is never written: the sandbox shares the slices no order handler writes and copies the rest.
 */
import type { Engine } from '../../core/engine';
import { withParams } from '../../core/params';
import type { Command, CommandResult, Formation, FormationId, NationId, NodeId, Posture, RefusalCode, TargetClass, World } from '../../core/types';
import { orderDelayHours } from '../../systems/c2';
import { aimRefusal } from '../../systems/diplomacy/aims';
import { committedFormations } from '../../systems/ops/state';
import { viewOf } from '../../systems/intel/view';
import { checkCommand } from '../commands';
import { GROUND_KINDS, posturesOf } from './postures';

/** A radial slot: an order posture, or opening the battle planner on this objective. */
export type OptionKey = Posture | 'plan';

export interface OrderOption {
  key: OptionKey;
  /** Commands that issue it, one per formation the engine accepts it for; empty for 'plan'. */
  commands: Command[];
  /** Formations that would carry it out. */
  ok: FormationId[];
  /** Formations the engine would refuse it for, and why, in its own words. */
  refused: { formation: FormationId; code: RefusalCode; reason: string }[];
  /** Hours until the slowest accepted order reaches its unit down the chain of command. */
  delayHours: number;
  /** The engine's estimate of when the slowest accepted unit gets there, counted from when the order arrives. */
  etaHours?: number;
  /** Set when carrying it out takes the war past what it is being fought for. */
  warn?: string;
  /** The strike's target class, when the option is a strike. */
  targetClass?: TargetClass;
}

export interface OptionsResult {
  node: NodeId;
  /** The formations the options were worked out for: the player's selection, or the staff's pick for a bare cell. */
  formations: FormationId[];
  options: OrderOption[];
}

/** Radial order, clockwise from the top. */
const ORDER: readonly OptionKey[] = ['attack', 'strike', 'move', 'defend', 'plan', 'air_superiority', 'patrol', 'blockade', 'air_assault', 'reserve'];
/** Slices an order handler may write; every other slice is shared with the live World, read-only. */
const WRITTEN = ['command', 'diplomacy', 'ops', 'land', 'naval', 'air'] as const;
/** For a bare cell the staff offers its nearest units: this many of each kind are tried. */
const NEAREST = 6;
const PLAN_FORCE = 3;

/**
 * A World the dry run may write to. The formations it orders are copies; the rest of `world.formations`,
 * and every slice outside WRITTEN, are the live objects. c2 is left out so an order applies at once, as it
 * will when it arrives, instead of entering the chain of command.
 */
function sandbox(world: World, writes: readonly FormationId[]): World {
  const formations = { ...world.formations };
  for (const id of writes) if (formations[id]) formations[id] = structuredClone(formations[id]);
  const slices = { ...world.slices } as Record<string, unknown>;
  for (const k of WRITTEN) if (slices[k]) slices[k] = structuredClone(slices[k]);
  delete slices.c2;
  return { ...world, formations, slices: slices as unknown as World['slices'], pending: [], events: [], history: [], theater: structuredClone(world.theater) };
}

/** Applies `cmd` to a sandbox and returns the engine's answer. */
export function dryRun(world: World, engine: Engine, cmd: Command): CommandResult | undefined {
  const owner = engine.systems.find((s) => s.commands?.includes(cmd.type));
  if (!owner?.apply) return undefined;
  const box = sandbox(world, cmd.type === 'order' ? [cmd.formation] : cmd.type === 'plan_operation' ? cmd.formations : []);
  const ctx = engine.context(box);
  withParams(world.params, () => owner.apply!(box, cmd, ctx));
  return box.events.find((e): e is CommandResult => e.type === 'command_result');
}

const live = (f: Formation | undefined): f is Formation => !!f && (f.status === 'active' || f.status === 'routed');

/** What a strike on `node` should hit: forces the player's intelligence places there, else what stands on the ground. */
function strikeClass(world: World, engine: Engine, nation: NationId, node: NodeId): TargetClass {
  if (engine.map.isSea(node)) return 'ship';
  return viewOf(world, engine.map, nation).contactsAt(node).length ? 'armor' : 'structure';
}

function orderFor(f: Formation, key: Posture, node: NodeId, targetClass: TargetClass): Command {
  const needsTarget = key !== 'defend' && key !== 'reserve';
  return {
    type: 'order', nation: f.nation, formation: f.id, byPlayer: true,
    order: { posture: key, ...(needsTarget ? { target: node } : {}), ...(key === 'strike' ? { targetClass } : {}) },
  };
}

function tryOrders(world: World, engine: Engine, player: NationId, fs: readonly Formation[], key: Posture, node: NodeId, targetClass: TargetClass): OrderOption {
  const out: OrderOption = { key, commands: [], ok: [], refused: [], delayHours: 0, ...(key === 'strike' ? { targetClass } : {}) };
  let eta: number | undefined;
  for (const f of fs) {
    const cmd = orderFor(f, key, node, targetClass);
    const checked = checkCommand(world, engine.map, engine.catalog, player, cmd);
    if (!checked.ok) {
      out.refused.push({ formation: f.id, code: 'invalid', reason: checked.reason });
      continue;
    }
    const answer = dryRun(world, engine, cmd);
    if (answer && !answer.ok) {
      out.refused.push({ formation: f.id, code: answer.code, reason: answer.reason });
      continue;
    }
    out.ok.push(f.id);
    out.commands.push(cmd);
    out.delayHours = Math.max(out.delayHours, orderDelayHours(world, f.id));
    if (answer?.ok && answer.etaHours !== undefined) eta = Math.max(eta ?? 0, answer.etaHours);
    const beyond = cmd.type === 'order' ? aimRefusal(world, engine.map, f, cmd.order) : undefined;
    if (beyond) out.warn = `past the war aims: ${beyond.why}. Ordering it makes the war total`;
  }
  if (eta !== undefined) out.etaHours = eta;
  return out;
}

function tryPlan(world: World, engine: Engine, player: NationId, fs: readonly Formation[], node: NodeId): OrderOption {
  const out: OrderOption = { key: 'plan', commands: [], ok: [], refused: [], delayHours: 0 };
  const ground = fs.filter((f) => GROUND_KINDS.has(f.kind) && f.kind !== 'missile');
  if (!ground.length) {
    out.refused.push(...fs.map((f) => ({ formation: f.id, code: 'wrong_role' as const, reason: `${f.name} is not a ground formation` })));
    return out;
  }
  const cmd: Command = { type: 'plan_operation', nation: player, kind: 'offensive', objectives: [node], formations: ground.map((f) => f.id), launch: true, byPlayer: true };
  const answer = dryRun(world, engine, cmd);
  if (answer && !answer.ok) out.refused.push({ formation: ground[0].id, code: answer.code, reason: answer.reason });
  else {
    out.ok.push(...ground.map((f) => f.id));
    if (answer?.ok && /past the war aims/.test(answer.reason)) out.warn = 'past the war aims: launching it makes the war total';
  }
  return out;
}

/** The player's live formations nearest `node` that can take `key` (or join a plan), not committed to a running operation. */
function nearest(world: World, engine: Engine, player: NationId, node: NodeId, fit: (f: Formation) => boolean): Formation[] {
  const committed = committedFormations(world);
  const out: [number, Formation][] = [];
  for (const f of Object.values(world.formations)) {
    if (f.nation !== player || !live(f) || f.embarkedOn || committed.has(f.id) || !fit(f)) continue;
    out.push([engine.map.distanceKm(f.node, node), f]);
  }
  return out.sort((a, b) => a[0] - b[0]).slice(0, NEAREST).map(([, f]) => f);
}

/**
 * The options for `node`: with formations selected, every order their kinds take there (greyed with the
 * engine's reason where it would refuse) plus a battle plan for ground forces; with none, the staff's
 * offer of the nearest units that can attack, strike or plan for it.
 */
export function orderOptions(world: World, engine: Engine, player: NationId, selection: readonly FormationId[], node: NodeId): OptionsResult {
  const fs = selection.map((id) => world.formations[id]).filter((f): f is Formation => live(f) && f.nation === player);
  const tc = strikeClass(world, engine, player, node);
  if (fs.length) {
    const keys = new Set<OptionKey>(fs.flatMap((f) => posturesOf(f)));
    if (fs.some((f) => GROUND_KINDS.has(f.kind) && f.kind !== 'missile') && !engine.map.isSea(node)) keys.add('plan');
    const options = ORDER.filter((k) => keys.has(k)).map((k) =>
      k === 'plan' ? tryPlan(world, engine, player, fs, node) : tryOrders(world, engine, player, fs.filter((f) => posturesOf(f).includes(k)), k, node, tc));
    return { node, formations: fs.map((f) => f.id), options };
  }
  if (engine.map.isSea(node)) return { node, formations: [], options: [] };
  const options: OrderOption[] = [];
  const brigades = nearest(world, engine, player, node, (f) => f.kind === 'maneuver');
  options.push(firstAccepted(world, engine, player, brigades, 'attack', node, tc));
  const fires = nearest(world, engine, player, node, (f) => f.kind === 'artillery' || f.kind === 'missile' || f.kind === 'air_wing');
  options.push(firstAccepted(world, engine, player, fires, 'strike', node, tc));
  const force = brigades.slice(0, PLAN_FORCE);
  options.push(force.length ? tryPlan(world, engine, player, force, node) : { key: 'plan', commands: [], ok: [], refused: [], delayHours: 0 });
  return { node, formations: [], options };
}

/** The first of `fs`, nearest first, the engine accepts `key` from; else the nearest one's refusal. */
function firstAccepted(world: World, engine: Engine, player: NationId, fs: readonly Formation[], key: Posture, node: NodeId, tc: TargetClass): OrderOption {
  let first: OrderOption | undefined;
  for (const f of fs) {
    const o = tryOrders(world, engine, player, [f], key, node, tc);
    if (o.ok.length) return o;
    first ??= o;
  }
  return first ?? { key, commands: [], ok: [], refused: [], delayHours: 0 };
}

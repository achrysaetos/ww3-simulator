import type { SimContext, System } from '../core/engine';
import type { Command, CommandDomain, CommandResult, FormationId, FormationKind, NationId, RefusalCode, World } from '../core/types';
import { holdOrder, orderDelayHours } from './c2';

export type OrderCommand = Extract<Command, { type: 'order' }>;
/** A domain's answer to an order it took. A refused order leaves the formation as it was. */
export type OrderOutcome =
  | { ok: true; etaHours?: number; note?: string }
  | { ok: false; code: RefusalCode; reason: string };
/** Answers an order it takes; undefined passes the order to the next handler. */
export type OrderHandler = (world: World, cmd: OrderCommand, ctx: SimContext) => OrderOutcome | undefined;

/**
 * What a human nation lets its AI delegate do. AI nations have no entry: their AI does everything.
 * A formation the player has ordered is held; the delegate commands every other formation of a
 * delegated domain.
 */
export interface Authority {
  ai: Record<CommandDomain, boolean>;
  held: Record<FormationId, true>;
  /** Held only until the player's order in transit is answered: a refusal hands the formation back. */
  taking?: Record<FormationId, true>;
  /** The player's answers to treaty calls, keyed `${war}|${treaty}`, until diplomacy acts on them. */
  answers: Record<string, boolean>;
}

declare module '../core/types' {
  interface Slices {
    command: Record<NationId, Authority>;
  }
}

/**
 * Out of the box the delegate fights the war and runs the home front, so an idle player's nation
 * defends itself; war, peace, treaty entry and nuclear release wait for the player.
 */
export const DEFAULT_DELEGATION: Readonly<Record<CommandDomain, boolean>> = { land: true, air: true, naval: true, homefront: true, strategic: false };

export const DOMAIN_OF_KIND: Readonly<Record<FormationKind, CommandDomain>> = {
  maneuver: 'land',
  artillery: 'land',
  air_defense: 'land',
  logistics: 'land',
  missile: 'air',
  air_wing: 'air',
  surface_group: 'naval',
  submarine: 'naval',
  strategic: 'strategic',
  space: 'strategic',
};

const NO_AUTHORITY: Authority = { ai: DEFAULT_DELEGATION, held: {}, answers: {} };

export function authority(world: World, n: NationId): Readonly<Authority> {
  return world.slices.command?.[n] ?? NO_AUTHORITY;
}

function authorityMut(world: World, n: NationId): Authority {
  world.slices.command ??= {};
  return (world.slices.command[n] ??= { ai: { ...DEFAULT_DELEGATION }, held: {}, answers: {} });
}

/** Whether the AI decides `domain` for `n`: always for an AI nation, by delegation for a human one. */
export function delegated(world: World, n: NationId, domain: CommandDomain): boolean {
  return world.nations[n]?.controlledBy !== 'human' || authority(world, n).ai[domain];
}

/** The player's answer to a treaty call, if given. */
export function treatyAnswer(world: World, n: NationId, war: string, treaty: string): boolean | undefined {
  return authority(world, n).answers[`${war}|${treaty}`];
}

export function clearTreatyAnswer(world: World, n: NationId, war: string, treaty: string): void {
  delete world.slices.command?.[n]?.answers[`${war}|${treaty}`];
}

const STRATEGIC: ReadonlySet<Command['type']> = new Set(['declare_war', 'offer_peace', 'nuclear_release', 'nuclear_alert', 'sanction', 'cyber_op', 'sabotage', 'cut_cable']);
const HOME_FRONT: ReadonlySet<Command['type']> = new Set(['set_mobilization', 'produce', 'raise_formation']);

/** Whether the AI may issue `cmd` on behalf of its nation. */
export function aiMayIssue(world: World, cmd: Command): boolean {
  if (world.nations[cmd.nation]?.controlledBy !== 'human') return true;
  if (cmd.type === 'order') {
    const f = world.formations[cmd.formation];
    return !!f && delegated(world, cmd.nation, DOMAIN_OF_KIND[f.kind]) && !authority(world, cmd.nation).held[cmd.formation];
  }
  if (STRATEGIC.has(cmd.type)) return delegated(world, cmd.nation, 'strategic');
  if (HOME_FRONT.has(cmd.type)) return delegated(world, cmd.nation, 'homefront');
  return false;
}

/**
 * Owns the shared 'order' command and offers it to each domain in turn; the first domain that
 * recognises the formation takes the order. Also owns a human nation's chain of command: what it
 * delegates to the AI, which formations it holds, and its answers to treaty calls.
 */
export function createOrderRouter(handlers: readonly OrderHandler[]): System {
  return {
    id: 'orders',
    commands: ['order', 'delegate', 'hold', 'answer_treaty'],
    init(world) {
      world.slices.command = {};
    },
    apply(world, cmd, ctx) {
      switch (cmd.type) {
        case 'delegate':
          authorityMut(world, cmd.nation).ai[cmd.domain] = cmd.ai;
          return ctx.emit(answer(world, cmd, { ok: true }, `${cmd.domain} ${cmd.ai ? 'handed to the AI delegate' : 'under your command'}`));
        case 'hold': {
          const auth = authorityMut(world, cmd.nation);
          const foreign = cmd.formations.filter((id) => world.formations[id]?.nation !== cmd.nation);
          for (const id of cmd.formations) {
            if (foreign.includes(id)) continue;
            if (cmd.held) auth.held[id] = true;
            else delete auth.held[id];
            if (auth.taking) delete auth.taking[id];
          }
          const formation = cmd.formations.length === 1 ? cmd.formations[0] : undefined;
          const result = foreign.length
            ? { ok: false as const, code: 'not_yours' as const, reason: `${foreign.length} of the formations are not yours` }
            : { ok: true as const };
          return ctx.emit(answer(world, cmd, result, cmd.held ? 'under your command' : 'handed to the AI delegate', formation));
        }
        case 'answer_treaty':
          authorityMut(world, cmd.nation).answers[`${cmd.war}|${cmd.treaty}`] = cmd.join;
          return ctx.emit(answer(world, cmd, { ok: true }, cmd.join ? 'will honour the treaty' : 'will stay out'));
        case 'order':
          return ctx.emit(applyOrder(world, cmd, ctx, handlers));
      }
    },
    step() {},
  };
}

/**
 * The player's order takes the formation from the delegate at once, so the delegate cannot
 * overrule it while it travels down the chain; if the order is then refused the delegate has it back.
 */
function applyOrder(world: World, cmd: OrderCommand, ctx: SimContext, handlers: readonly OrderHandler[]): CommandResult {
  const f = world.formations[cmd.formation];
  if (!f) return answer(world, cmd, { ok: false, code: 'unknown_formation', reason: 'no such formation' });
  if (f.nation !== cmd.nation) return answer(world, cmd, { ok: false, code: 'not_yours', reason: `${f.name} belongs to ${f.nation}` });
  if (f.status === 'destroyed') return answer(world, cmd, { ok: false, code: 'destroyed', reason: `${f.name} has been destroyed` });
  const auth = cmd.byPlayer ? authorityMut(world, cmd.nation) : undefined;
  if (auth && !auth.held[f.id]) {
    auth.held[f.id] = true;
    (auth.taking ??= {})[f.id] = true;
  }
  if (holdOrder(world, cmd)) return answer(world, cmd, { ok: true }, 'relayed down a degraded chain of command', undefined, orderDelayHours(world, f.id));
  let outcome: OrderOutcome | undefined;
  for (const h of handlers) if ((outcome = h(world, cmd, ctx))) break;
  if (!outcome) {
    f.order = { ...cmd.order, issuedTick: world.tick };
    outcome = { ok: true };
  }
  if (auth?.taking?.[f.id]) {
    if (!outcome.ok) delete auth.held[f.id];
    delete auth.taking[f.id];
  }
  return answer(world, cmd, outcome);
}

function answer(world: World, cmd: Command, o: OrderOutcome, accepted = 'order accepted', formation?: FormationId, relayedEta?: number): CommandResult {
  const base = {
    type: 'command_result' as const,
    tick: world.tick,
    nation: cmd.nation,
    command: cmd.type,
    ...(cmd.type === 'order' ? { formation: cmd.formation } : formation ? { formation } : {}),
    // Only the player issues anything but orders; an order says whether the player gave it.
    ...(cmd.type !== 'order' || cmd.byPlayer ? { byPlayer: true as const } : {}),
  };
  if (!o.ok) return { ...base, ok: false, code: o.code, reason: o.reason };
  if (relayedEta !== undefined) return { ...base, ok: true, code: 'relayed', reason: accepted, etaHours: relayedEta };
  return { ...base, ok: true, code: 'accepted', reason: accepted, ...(o.etaHours !== undefined ? { etaHours: o.etaHours } : {}), ...(o.note ? { note: o.note } : {}) };
}

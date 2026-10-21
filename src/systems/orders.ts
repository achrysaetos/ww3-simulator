import type { SimContext, System } from '../core/engine';
import type { Command, CommandDomain, FormationId, FormationKind, NationId, World } from '../core/types';

export type OrderCommand = Extract<Command, { type: 'order' }>;
/** Returns true when it took the order; false passes it to the next handler. */
export type OrderHandler = (world: World, cmd: OrderCommand, ctx: SimContext) => boolean;

/**
 * What a human nation lets its AI delegate do. AI nations have no entry: their AI does everything.
 * A formation the player has ordered is held; the delegate commands every other formation of a
 * delegated domain.
 */
export interface Authority {
  ai: Record<CommandDomain, boolean>;
  held: Record<FormationId, true>;
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

const STRATEGIC: ReadonlySet<Command['type']> = new Set(['declare_war', 'offer_peace', 'nuclear_release', 'nuclear_alert', 'sanction']);
const HOME_FRONT: ReadonlySet<Command['type']> = new Set(['set_mobilization', 'produce']);

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
          return;
        case 'hold': {
          const held = authorityMut(world, cmd.nation).held;
          for (const id of cmd.formations) {
            if (world.formations[id]?.nation !== cmd.nation) continue;
            if (cmd.held) held[id] = true;
            else delete held[id];
          }
          return;
        }
        case 'answer_treaty':
          authorityMut(world, cmd.nation).answers[`${cmd.war}|${cmd.treaty}`] = cmd.join;
          return;
        case 'order': {
          const f = world.formations[cmd.formation];
          if (!f || f.nation !== cmd.nation || f.status === 'destroyed') return;
          if (handlers.some((h) => h(world, cmd, ctx))) return;
          f.order = { ...cmd.order, issuedTick: world.tick };
          return;
        }
      }
    },
    step() {},
  };
}

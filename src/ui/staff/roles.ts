import { COMMAND_DOMAINS, type Command, type CommandDomain, type NationId } from '../../core/types';

export type Delegation = Record<CommandDomain, boolean>;

/**
 * The three ways to command (design doc, "Choose how much you command") as delegation presets.
 * The engine delegates by domain, so a role is the set of domains its staff runs.
 */
export const COMMAND_ROLES = [
  {
    id: 'cinc', name: 'Commander-in-Chief', short: 'C-in-C', ai: { land: true, air: true, naval: true, homefront: true, strategic: false },
    you: 'You set the goals; staff fights the war.', staff: 'Your staff fights the war on land, at sea and in the air.',
  },
  {
    id: 'marshal', name: 'Field Marshal', short: 'Marshal', ai: { land: true, air: false, naval: false, homefront: true, strategic: false },
    you: 'You also direct the air war and the fleets.', staff: 'Your staff runs the armies and the home front.',
  },
  {
    id: 'brigade', name: 'Every Brigade', short: 'Every brigade', ai: { land: false, air: false, naval: false, homefront: false, strategic: false },
    you: 'You command every unit yourself.', staff: 'Your staff advises; it gives no orders.',
  },
] as const satisfies readonly { id: string; name: string; short: string; ai: Delegation; you: string; staff: string }[];

export type CommandRole = (typeof COMMAND_ROLES)[number];
export type RoleId = CommandRole['id'];

export const roleOf = (ai: Delegation) => COMMAND_ROLES.find((r) => COMMAND_DOMAINS.every((k) => r.ai[k] === ai[k])) ?? null;
export const roleById = (id: string): CommandRole | undefined => COMMAND_ROLES.find((r) => r.id === id);

/** The delegate commands that turn `from` into `to`, one per domain that differs. */
export function delegateCommands(nation: NationId, from: Delegation, to: Delegation): Command[] {
  return COMMAND_DOMAINS.filter((k) => from[k] !== to[k]).map((k) => ({ type: 'delegate', nation, domain: k, ai: to[k] }));
}

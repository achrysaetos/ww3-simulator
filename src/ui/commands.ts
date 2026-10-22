/**
 * The worker's command boundary. Everything the page posts is untrusted: a command is
 * accepted only for the nation the player commands, with every id, posture and number
 * checked against the World, and rebuilt field by field so nothing extra reaches the engine.
 */
import type { Catalog } from '../core/catalog';
import type { GameMap } from '../core/map';
import { COMMAND_DOMAINS, TARGET_CLASSES, type Command, type CommandDomain, type FormationId, type ItemId, type MunitionId, type NationId, type NodeId, type Order, type TargetClass, type World } from '../core/types';
import { CURRENT_CONFIDENCE, viewOf } from '../systems/intel/view';
import { POSTURES } from './snapshot';

export type Checked = { ok: true; command: Command } | { ok: false; reason: string };

type Raw = Record<string, unknown>;
class Refusal extends Error {}
const fail = (reason: string): never => { throw new Refusal(reason); };

const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const bool = (v: unknown, what: string): boolean => (typeof v === 'boolean' ? v : fail(`${what} must be true or false`));
const str = (v: unknown, what: string): string => (typeof v === 'string' && v.length > 0 && v.length < 200 ? v : fail(`${what} must be a string`));
const num = (v: unknown, what: string, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fail(`${what} must be a number from ${min} to ${max}`);
const oneOf = <T extends string>(v: unknown, options: readonly T[], what: string): T => (options.includes(v as T) ? (v as T) : fail(`unknown ${what} ${String(v)}`));

/** Largest monthly production order the boundary passes on; the economy caps real lines far below this. */
export const MAX_ORDER_PER_MONTH = 1_000_000;

export function checkCommand(world: World, map: GameMap, catalog: Catalog, player: NationId, raw: unknown): Checked {
  try {
    return { ok: true, command: parse(world, map, catalog, player, raw) };
  } catch (e) {
    if (e instanceof Refusal) return { ok: false, reason: e.message };
    throw e;
  }
}

function parse(world: World, map: GameMap, catalog: Catalog, player: NationId, raw: unknown): Command {
  if (!isObj(raw)) return fail('command must be an object');
  if (raw.nation !== player) return fail(`you command ${player}, not ${String(raw.nation)}`);
  const nation = player;
  const node = (v: unknown, what: string) => num(v, what, 0, map.size - 1) as NodeId;
  const other = (v: unknown): NationId => {
    const id = str(v, 'target nation') as NationId;
    if (!world.nations[id]) fail(`unknown nation ${id}`);
    if (id === nation) fail('a nation cannot target itself');
    return id;
  };
  const own = (v: unknown): FormationId => {
    const id = str(v, 'formation') as FormationId;
    const f = world.formations[id];
    if (!f) fail(`unknown formation ${id}`);
    if (f.nation !== nation) fail(`${f.name} is not yours`);
    return id;
  };

  switch (raw.type) {
    case 'order': {
      const formation = own(raw.formation);
      if (!isObj(raw.order)) return fail('order must be an object');
      const o = raw.order;
      const order: Omit<Order, 'issuedTick'> = { posture: oneOf(o.posture, POSTURES, 'posture') };
      if (o.target !== undefined) order.target = node(o.target, 'target');
      if (o.targetClass !== undefined) order.targetClass = oneOf(o.targetClass, TARGET_CLASSES, 'target class') as TargetClass;
      if (o.targetFormation !== undefined) {
        const t = str(o.targetFormation, 'target formation') as FormationId;
        // A foreign formation is a target only while intelligence holds a current fix on it; an unknown id gets the same answer, so a refusal never confirms one exists.
        const view = viewOf(world, map, nation);
        const target = world.formations[t];
        if (!target || (!view.friends.has(target.nation) && (view.contacts.get(t)?.confidence ?? 0) < CURRENT_CONFIDENCE)) fail('no current intelligence fix on that formation: it can be targeted once your sensors find it');
        order.targetFormation = t;
      }
      if (o.munition !== undefined) {
        const m = str(o.munition, 'munition') as MunitionId;
        if (!catalog.munitions.has(m)) fail(`unknown munition ${m}`);
        order.munition = m;
      }
      if (o.lift !== undefined) order.lift = oneOf(o.lift, ['air', 'sea'] as const, 'lift');
      return { type: 'order', nation, formation, order };
    }
    case 'declare_war':
      return { type: 'declare_war', nation, target: other(raw.target), reason: raw.reason === undefined ? undefined : str(raw.reason, 'reason') };
    case 'offer_peace':
      return { type: 'offer_peace', nation, target: other(raw.target) };
    case 'sanction':
      return { type: 'sanction', nation, target: other(raw.target), on: bool(raw.on, 'on') };
    case 'set_mobilization':
      return { type: 'set_mobilization', nation, level: num(raw.level, 'mobilisation level', 0, 1) };
    case 'produce': {
      const item = str(raw.item, 'item') as ItemId;
      if (!catalog.platforms.has(item as never) && !catalog.munitions.has(item as never)) fail(`unknown item ${item}`);
      return { type: 'produce', nation, item, ratePerMonth: num(raw.ratePerMonth, 'rate per month', 0, MAX_ORDER_PER_MONTH) };
    }
    case 'nuclear_release': {
      const munition = str(raw.munition, 'munition') as MunitionId;
      if (!catalog.munitions.get(munition)?.yieldKt) fail(`${munition} is not a nuclear weapon`);
      return { type: 'nuclear_release', nation, target: node(raw.target, 'target'), warheads: Math.floor(num(raw.warheads, 'warheads', 1, 10_000)), munition };
    }
    case 'nuclear_alert':
      return { type: 'nuclear_alert', nation, reason: raw.reason === undefined ? undefined : str(raw.reason, 'reason') };
    case 'delegate':
      return { type: 'delegate', nation, domain: oneOf(raw.domain, COMMAND_DOMAINS, 'domain') as CommandDomain, ai: bool(raw.ai, 'ai') };
    case 'hold': {
      if (!Array.isArray(raw.formations) || raw.formations.length > 10_000) return fail('formations must be a list');
      return { type: 'hold', nation, formations: raw.formations.map(own), held: bool(raw.held, 'held') };
    }
    case 'answer_treaty':
      return { type: 'answer_treaty', nation, war: str(raw.war, 'war'), treaty: str(raw.treaty, 'treaty'), join: bool(raw.join, 'join') };
    default:
      return fail(`unknown command type ${String(raw.type)}`);
  }
}

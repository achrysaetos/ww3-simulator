import { atWar, enemiesOf, relation, type SimContext } from '../../core/engine';
import type { GameMap } from '../../core/map';
import type { NationId, World } from '../../core/types';
import { delegated } from '../orders';
import { neighbours } from './assess';
import type { AllianceTreaty, DiplomacyState } from './types';
import { joinSide, sideOf } from './wars';

/**
 * Asking another state for help in your war. The player never commands an ally; it asks, and an AI-run state answers by
 * the rule in helpAnswer, which has no dice in it, so the drag's pill and the engine agree.
 */

/** A week between asks of the same state: the cadence of alliance councils in a crisis (NATO's North Atlantic Council meets weekly), as for a treaty call reconsidered. */
const ASK_COOLDOWN_DAYS = 7;
/** War support below which a government cannot take its public into another state's war. Estimate: a bare majority. */
const SUPPORT_TO_JOIN = 0.5;
/**
 * Opinion of the asker over the enemy that buys air defence for it short of war. Estimate: the US, UK, France and Jordan
 * covered Israel on 13-14 Apr 2024; states cool to both sides gave nothing.
 */
const AID_LEAN = 40;
/** Opinion of the asker over the enemy that takes a state without a treaty into the war, as for an opportunist entering one (wars.ts neutralEntry). */
const JOIN_LEAN = 100;

/**
 * Why the answer is what it is:
 * - treaty: bound to defend you, so it joins.
 * - friend: a close friend that borders your enemy joins (war spreads to neighbours: Siverson and Starr 1991).
 * - offensive: its treaty is defensive and your side started the war, so it sends air defence only (no ally was bound
 *   to the US war on Iraq in 2003, and France and Germany stayed out).
 * - committed: it fights a war of its own and has nothing to spare.
 * - weary: its public would not back a war.
 * - nuclear: your enemy is nuclear-armed and no treaty binds it; no state has fought a nuclear power on another's behalf
 *   without one since 1945, and NATO armed Ukraine for years without fighting Russia.
 * - sympathy: friendly enough to cover you, not to fight.
 * - other_side: bound by treaty to your enemy, or likes your enemy better than you.
 * - no_stake: no tie that would make it act.
 * - human: its own player decides; the ask reaches them.
 */
export type HelpBasis = 'treaty' | 'friend' | 'offensive' | 'committed' | 'weary' | 'nuclear' | 'sympathy' | 'other_side' | 'no_stake' | 'human';

/**
 * Why `helper` cannot be asked: it is your enemy, already fights all your enemies, is out of the fight, was asked within
 * the week (`again` is the tick it can be asked), or is deciding on a treaty call to your side, which an ask cannot
 * hasten (`due` is the tick its answer falls due).
 */
export type NoAsk = { why: 'enemy' | 'fighting' | 'spent' } | { why: 'asked'; again: number } | { why: 'called'; treaty: string; due: number };

export type HelpAnswer =
  | { give: 'none'; no: NoAsk }
  | { give: 'join' | 'aid' | 'refuse' | 'undecided'; basis: HelpBasis; foe: NationId; treaty?: string };

/** `helper>covered` for every pair where `helper` owes `covered` defence under a treaty: the treaty's id. */
export function pactsOf(alliances: readonly AllianceTreaty[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of alliances)
    for (const [h, ht] of Object.entries(t.members))
      for (const [c, ct] of Object.entries(t.members))
        if (h !== c && ht.role !== 'protected' && ct.role !== 'guarantor') out[`${h}>${c}`] ??= t.id;
  return out;
}

const askKey = (asker: NationId, helper: NationId) => `${asker}>${helper}`;

/** The asker's war the helper would come into: the first it fights in that the helper is not part of. */
const warToJoin = (s: DiplomacyState, asker: NationId, helper: NationId) => s.wars.find((w) => sideOf(w, asker) !== -1 && sideOf(w, helper) === -1);

/** What `helper` answers if `asker` asks it for help now; undefined when `asker` fights no war it could come into. */
export function helpAnswer(world: World, map: GameMap, s: DiplomacyState, asker: NationId, helper: NationId): HelpAnswer | undefined {
  const foes = enemiesOf(world, asker);
  if (!foes.length || asker === helper) return undefined;
  const h = world.nations[helper];
  if (foes.includes(helper)) return { give: 'none', no: { why: 'enemy' } };
  if (foes.every((f) => atWar(world, helper, f))) return { give: 'none', no: { why: 'fighting' } };
  if (h.status === 'capitulated' || h.status === 'collapsed') return { give: 'none', no: { why: 'spent' } };
  const asked = s.asks?.[askKey(asker, helper)];
  const again = asked === undefined ? 0 : asked.tick + Math.ceil((ASK_COOLDOWN_DAYS * 24) / world.dtHours);
  if (world.tick < again) return { give: 'none', no: { why: 'asked', again } };
  const war = warToJoin(s, asker, helper);
  if (!war) return undefined;
  const call = s.joins.find((j) => j.nation === helper && j.war === war.id && j.side === sideOf(war, asker));
  if (call) return { give: 'none', no: { why: 'called', treaty: call.treaty, due: call.dueTick } };
  const pacts = s.pacts ?? {};
  const nuclear = foes.find((f) => world.nations[f].nuclear.warheads > 0);
  const foe = nuclear ?? war.sides[1 - sideOf(war, asker)].leader;
  if (!delegated(world, helper, 'strategic')) return { give: 'undecided', basis: 'human', foe };
  for (const f of foes) {
    const treaty = pacts[`${helper}>${f}`];
    if (treaty || relation(world, helper, f).opinion > relation(world, helper, asker).opinion)
      return { give: 'refuse', basis: 'other_side', foe: f, ...(treaty ? { treaty } : {}) };
  }
  const treaty = pacts[`${helper}>${asker}`];
  const answer = (give: 'join' | 'aid' | 'refuse', basis: HelpBasis): HelpAnswer => ({ give, basis, foe, ...(treaty ? { treaty } : {}) });
  const lean = relation(world, helper, asker).opinion - Math.max(...foes.map((f) => relation(world, helper, f).opinion));
  if (!treaty && lean < AID_LEAN) return answer('refuse', 'no_stake');
  if (h.status === 'war') return answer('refuse', 'committed');
  if (treaty && sideOf(war, asker) === 0) return answer('aid', 'offensive');
  if (h.warSupport < SUPPORT_TO_JOIN) return answer('aid', 'weary');
  if (treaty) return answer('join', 'treaty');
  if (nuclear) return answer('aid', 'nuclear');
  if (lean >= JOIN_LEAN && foes.some((f) => neighbours(map, helper).has(f))) return answer('join', 'friend');
  return answer('aid', 'sympathy');
}

/**
 * `asker` asks `helper` for help, and an AI-run helper answers at once by helpAnswer: it joins the asker's side of the
 * war, covers the asker with its air defence for as long as the asker fights (grantedAid, kept by access.ts pledgeAid),
 * or refuses. A human helper is told. Either way the asker cannot ask it again for a week.
 */
export function requestHelp(world: World, ctx: SimContext, s: DiplomacyState, asker: NationId, helper: NationId): void {
  const a = helpAnswer(world, ctx.map, s, asker, helper);
  if (!a || a.give === 'none') return;
  (s.asks ??= {})[askKey(asker, helper)] = { tick: world.tick, give: a.give };
  const say = (text: string) => ctx.emit({ type: 'message', tick: world.tick, nation: asker, text: `${asker} asks ${helper} for help: ${text}` });
  if (a.give === 'join') {
    const war = warToJoin(s, asker, helper)!;
    say(`${helper} enters the war (${HELP_REASON[a.basis]})`);
    joinSide(world, ctx, s, war, helper, sideOf(war, asker) as 0 | 1, `${asker} asked for help`, 'joined', a.treaty ?? 'asked', a.treaty ? asker : undefined);
  } else if (a.give === 'aid') say(`${helper} sends air defence but stays out of the war (${HELP_REASON[a.basis]})`);
  else if (a.give === 'refuse') say(`${helper} declines (${HELP_REASON[a.basis]})`);
  else ctx.emit({ type: 'message', tick: world.tick, nation: helper, text: `${asker} asks ${helper} for help in its war with ${a.foe}` });
}

const HELP_REASON: Record<HelpBasis, string> = {
  treaty: 'treaty ally', friend: 'close friend on the enemy border', offensive: 'its treaty is defensive', committed: 'fighting its own war',
  weary: 'its public will not back a war', nuclear: 'the enemy is nuclear-armed', sympathy: 'friendly, not willing to fight',
  other_side: 'tied to the other side', no_stake: 'no stake in the war', human: 'its own call',
};

/** Air defence an AI-run helper agreed to when asked, as pledges pledgeAid keeps in force while the asker fights. */
export function grantedAid(s: DiplomacyState): { donor: NationId; recipient: NationId }[] {
  return Object.entries(s.asks ?? {}).flatMap(([k, a]) => {
    if (a.give !== 'aid') return [];
    const [recipient, donor] = k.split('>') as [NationId, NationId];
    return [{ donor, recipient }];
  });
}

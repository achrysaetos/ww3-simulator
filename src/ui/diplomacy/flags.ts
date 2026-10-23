/**
 * The diplomacy drag's pure core: which nations' flags the player can drop their own flag on, what that drop asks of
 * each (one table by stance), the words of the pill and the commands release sends. Everything is read from the
 * player's own nation detail, whose peace answers the worker weighed on the player's beliefs with the engine's rule.
 */
import type { Command, NationId } from '../../core/types';
import type { NoDeal, PeaceAnswer, Terms } from '../../systems/diplomacy';
import type { PillWords } from '../drag/Pill';
import type { NationDetail, NationSummary } from '../snapshot';

/** How a flag's nation stands to the player. */
export type Stance = 'enemy' | 'ally' | 'pending' | 'neutral';

export interface FlagTarget { nation: NationId; stance: Stance; /** For a pending one: its treaty and the tick its decision is due. */ call?: { treaty: string; dueTick: number } }

export type FlagVerb = 'peace' | 'ask';

/** THE table: what dropping your flag on a nation of each stance asks of it. */
export const VERB_OF: Record<Stance, FlagVerb> = { enemy: 'peace', ally: 'ask', pending: 'ask', neutral: 'ask' };

/** The row stays one line in the top bar. */
export const ROW_MAX = 9;
/** Nuclear powers outside the war, the largest arsenals first. */
const NEUTRALS_MAX = 4;

/**
 * The nations that matter to the player: its enemies (the leaders it can make peace with first), the allies fighting
 * beside it, treaty members still deciding whether to join it, and the nuclear powers outside its wars.
 */
export function flagRow(d: NationDetail, nations: ReadonlyMap<NationId, Pick<NationSummary, 'id' | 'status' | 'warheads'>>): FlagTarget[] {
  const me = d.id;
  const out: FlagTarget[] = [];
  const seen = new Set<NationId>([me]);
  const add = (t: FlagTarget) => {
    if (seen.has(t.nation) || !nations.has(t.nation)) return;
    seen.add(t.nation);
    out.push(t);
  };
  const leads = (n: NationId) => d.peace.some((p) => p.nation === n && p.answer.deal === 'war');
  for (const n of [...d.enemies].sort((a, b) => Number(leads(b)) - Number(leads(a)))) add({ nation: n, stance: 'enemy' });
  for (const w of d.wars) {
    const mine = w.sides[0].some((e) => e.nation === me) ? 0 : 1;
    for (const e of w.sides[mine]) add({ nation: e.nation, stance: 'ally' });
    for (const j of w.pending) if (j.side === mine) add({ nation: j.nation, stance: 'pending', call: { treaty: j.treaty, dueTick: j.dueTick } });
  }
  const neutrals = [...nations.values()].filter((n) => n.warheads > 0 && n.status === 'peace').sort((a, b) => b.warheads - a.warheads);
  for (const n of neutrals.slice(0, NEUTRALS_MAX)) add({ nation: n.id, stance: 'neutral' });
  return out.slice(0, ROW_MAX);
}

/** What letting go on a flag does: the pill's words, and the command release sends with what the toast says (null when refused). */
export interface FlagAim { target: FlagTarget; words: PillWords; send: { command: Command; label: string } | null }

export interface FlagContext {
  name(n: NationId): string;
  /** The game day a tick falls on, for "by D+12". */
  dayOf(tick: number): number;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

const refuse = (target: FlagTarget, kicker: string, primary: string, secondary?: string): FlagAim =>
  ({ target, words: { kicker, primary, tone: 'refused', ...(secondary ? { secondary } : {}) }, send: null });

function noDealWords(why: NoDeal, me: NationId, c: FlagContext): string {
  if ('leaders' in why) return `peace in this war is made between ${c.name(why.leaders[0])} and ${c.name(why.leaders[1])}`;
  return why.bound === me ? 'you cannot make a separate peace while your allies fight on' : `${c.name(why.bound)} cannot make a separate peace while its allies fight on`;
}

/** The terms an answer was weighed on, in words: what their war support is and the line below which they take terms. */
export function termsWords(t: Terms, who: string): string {
  const now = `war support ${pct(t.support)}`;
  switch (t.basis) {
    case 'offered': return `${who} offered peace first`;
    case 'human': return `${who} decides for itself`;
    case 'separate': return `${who} would make a separate peace`;
    case 'regime_change': return `${who} fights to bring down your government: terms only below ${pct(t.line!)} · ${now}`;
    case 'aim': return t.aim ?? `${who} fights on for its war aim; walks away below ${pct(t.line!)} · ${now}`;
    case 'support': return `takes terms below ${pct(t.line!)} · ${now}`;
    case 'losing': return `losing ground, takes terms below ${pct(t.line!)} · ${now}`;
  }
}

function peaceAim(d: NationDetail, target: FlagTarget, c: FlagContext): FlagAim {
  const who = c.name(target.nation);
  const answer: PeaceAnswer | undefined = d.peace.find((p) => p.nation === target.nation)?.answer;
  if (!answer) return refuse(target, 'Cannot offer peace', `you are not at war with ${who}`);
  if (answer.deal === 'none') return refuse(target, 'Cannot offer peace', noDealWords(answer.why, d.id, c));
  const t = answer.terms;
  const settles = answer.deal === 'separate' ? 'a separate peace' : 'the war ends';
  const command: Command = { type: 'offer_peace', nation: d.id, target: target.nation };
  if (t.basis === 'offered') return { target, words: { kicker: `Accept peace · ${who}`, primary: `They offered: ${settles}`, secondary: 'on current lines', tone: 'good' }, send: { command, label: `Peace with ${who} accepted` } };
  const send = { command, label: `Peace offered to ${who}` };
  if (d.peaceOffers.some((o) => o.from === d.id && o.to === target.nation))
    return refuse(target, `Offer peace · ${who}`, 'your offer is already on the table', `weighed again each day · ${termsWords(t, who)}`);
  if (t.takes) return { target, words: { kicker: `Offer peace · ${who}`, primary: `They accept: ${settles}`, secondary: termsWords(t, who), tone: 'good' }, send };
  const tone = t.basis === 'human' ? 'even' : 'bad';
  return { target, words: { kicker: `Offer peace · ${who}`, primary: t.basis === 'human' ? 'Their call' : 'They refuse for now', secondary: `${termsWords(t, who)} · the offer stays on the table`, tone }, send };
}

/**
 * The engine has no command to ask another nation for help: allies join by treaty when it falls due (diplomacy
 * resolveJoins) and neutrals by their own choice (neutralEntry). So an ask is always refused, and says which.
 */
function askAim(target: FlagTarget, c: FlagContext): FlagAim {
  const who = c.name(target.nation);
  const kicker = `Ask ${who} for help`;
  if (target.stance === 'ally') return refuse(target, kicker, `${who} already fights beside you`);
  if (target.stance === 'pending' && target.call)
    return refuse(target, kicker, `${who} answers its ${target.call.treaty} call by D+${c.dayOf(target.call.dueTick)}`, 'a treaty call cannot be pressed sooner');
  return refuse(target, kicker, `no way to ask: ${who} enters a war only by treaty or by its own choice`);
}

export function aimFlag(d: NationDetail, target: FlagTarget, c: FlagContext): FlagAim {
  return VERB_OF[target.stance] === 'peace' ? peaceAim(d, target, c) : askAim(target, c);
}

/**
 * How near the war is to ending by peace: the main enemy's answer to an offer, as the share of the way its war support
 * has fallen from full to the line below which it takes terms (1 once it would take them). Null at peace, or when no
 * offer can settle anything.
 */
export interface Needle { value: number | null; nation: NationId; words: string; ready: boolean; /** Points of their war support still to fall before they take terms; null when it does not turn on support. */ gap: number | null }

export function peaceNeedle(d: NationDetail, c: Pick<FlagContext, 'name'>): Needle | null {
  const row = d.peace.find((p) => p.answer.deal === 'war') ?? d.peace.find((p) => p.answer.deal !== 'none');
  if (!row || row.answer.deal === 'none') return null;
  const t = row.answer.terms, who = c.name(row.nation);
  if (t.takes) return { value: 1, nation: row.nation, ready: true, gap: 0, words: `${who} would take peace now · ${termsWords(t, who)}` };
  const value = t.line === null ? null : Math.min(1, Math.max(0, (1 - t.support) / Math.max(1e-6, 1 - t.line)));
  const gap = t.line === null ? null : Math.max(0, Math.round((t.support - t.line) * 100));
  return { value, nation: row.nation, ready: false, gap, words: `${who}: ${termsWords(t, who)}` };
}

/**
 * The diplomacy drag's pure core: which nations' flags the player can drop their own flag on, what that drop asks of
 * each (one table by stance), the words of the pill and the commands release sends. Everything is read from the
 * player's own nation detail, whose peace and help answers the worker weighed on the player's beliefs with the engine's
 * rules.
 */
import type { Command, NationId } from '../../core/types';
import type { HelpAnswer, HelpBasis, NoDeal, PeaceAnswer, Terms } from '../../systems/diplomacy';
import type { PillWords } from '../drag/Pill';
import type { NationDetail, NationSummary } from '../snapshot';

/** How a flag's nation stands to the player; a friend is one outside the war that would help if asked. */
export type Stance = 'enemy' | 'ally' | 'pending' | 'friend' | 'neutral';

export interface FlagTarget { nation: NationId; stance: Stance }

export type FlagVerb = 'peace' | 'ask';

/** THE table: what dropping your flag on a nation of each stance asks of it. */
export const VERB_OF: Record<Stance, FlagVerb> = { enemy: 'peace', ally: 'ask', pending: 'ask', friend: 'ask', neutral: 'ask' };

/** The row stays one line in the top bar. */
export const ROW_MAX = 9;
/** Nuclear powers outside the war, the largest arsenals first. */
const NEUTRALS_MAX = 4;
/** States outside the war that would help if asked: those that would fight first, the largest economies first. */
const FRIENDS_MAX = 3;
/** Rank of each answer in the row: those that would fight, then those that would cover you, then those you asked this week. */
const rank = (a: HelpAnswer) => (a.give === 'join' ? 0 : a.give === 'aid' ? 1 : a.give === 'none' && a.no.why === 'asked' ? 2 : undefined);

/**
 * The nations that matter to the player: its enemies (the leaders it can make peace with first), the allies fighting
 * beside it, treaty members still deciding whether to join it, states outside the war that would help if asked, and
 * the nuclear powers outside its wars.
 */
export function flagRow(d: NationDetail, nations: ReadonlyMap<NationId, Pick<NationSummary, 'id' | 'status' | 'warheads' | 'gdpUsdB'>>): FlagTarget[] {
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
    for (const j of w.pending) if (j.side === mine) add({ nation: j.nation, stance: 'pending' });
  }
  const gdp = (n: NationId) => nations.get(n)?.gdpUsdB ?? 0;
  const friends = d.help.flatMap((h) => { const r = rank(h.answer); return r === undefined ? [] : [{ nation: h.nation, r }]; }).sort((a, b) => a.r - b.r || gdp(b.nation) - gdp(a.nation));
  for (const h of friends.slice(0, FRIENDS_MAX)) add({ nation: h.nation, stance: 'friend' });
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

function helpWhy(basis: HelpBasis, who: string, foe: string, treaty: string | undefined): string {
  switch (basis) {
    case 'treaty': return `bound to defend you by the ${treaty}`;
    case 'friend': return `a close friend on ${foe}'s border`;
    case 'offensive': return `the ${treaty} is defensive, and your side started this war`;
    case 'committed': return `${who} is fighting a war of its own`;
    case 'weary': return `${who}'s public would not back a war`;
    case 'nuclear': return `${foe} is nuclear-armed and no treaty binds ${who} to you`;
    case 'sympathy': return `friendly, but not enough to fight ${foe}`;
    case 'other_side': return treaty ? `bound by the ${treaty} to ${foe}` : `${who} is closer to ${foe} than to you`;
    case 'no_stake': return `${who} has no stake in your war with ${foe}`;
    case 'human': return `${who} decides for itself`;
  }
}

const ASK_WORDS: Record<'join' | 'aid' | 'undecided', Pick<PillWords, 'primary' | 'tone'>> = {
  join: { primary: 'They join the war', tone: 'good' },
  aid: { primary: 'Air defence, not troops', tone: 'even' },
  undecided: { primary: 'Their call', tone: 'even' },
};

/** Asking for help: the answer the engine's rule (helpAnswer) gives now. Release sends the ask unless it would be refused or cannot be made. */
function askAim(d: NationDetail, target: FlagTarget, c: FlagContext): FlagAim {
  const who = c.name(target.nation);
  const kicker = `Ask ${who} for help`;
  const answer = d.help.find((h) => h.nation === target.nation)?.answer;
  if (!answer) return refuse(target, kicker, d.enemies.length ? `${who} is not in a position to help` : 'you are at war with no one');
  if (answer.give === 'none') {
    const no = answer.no;
    if (no.why === 'asked') return refuse(target, kicker, `you asked ${who} this week`, `ask again from D+${c.dayOf(no.again)}`);
    if (no.why === 'called') return refuse(target, kicker, `${who} answers its ${no.treaty} call by D+${c.dayOf(no.due)}`, 'a treaty call cannot be pressed sooner');
    return refuse(target, kicker, { fighting: `${who} already fights beside you`, spent: `${who} is out of the fight`, enemy: `${who} is at war with you` }[no.why]);
  }
  const why = helpWhy(answer.basis, who, c.name(answer.foe), answer.treaty);
  if (answer.give === 'refuse') return refuse(target, kicker, 'They refuse', why);
  const command: Command = { type: 'request_help', nation: d.id, target: target.nation };
  return { target, words: { kicker, ...ASK_WORDS[answer.give], secondary: why }, send: { command, label: `${who} asked for help` } };
}

export function aimFlag(d: NationDetail, target: FlagTarget, c: FlagContext): FlagAim {
  return VERB_OF[target.stance] === 'peace' ? peaceAim(d, target, c) : askAim(d, target, c);
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

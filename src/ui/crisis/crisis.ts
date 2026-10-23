/**
 * Crises: the few staff cards big enough to stop the clock and take the screen (a treaty call,
 * an enemy nuclear alert, an armistice offer, a threat to the capital), recast as one decision
 * with two or three options, each argued by an adviser. Every option is an action the card
 * already offers or a decision to wait, so choosing one issues the card's own command.
 * Pure: reads the card and the player's own view.
 */
import type { NationId, NodeId } from '../../core/types';
import { NUCLEAR_ALERT } from '../../data/nations';
import { treatyName } from '../events';
import type { NationDetail, NationSummary } from '../snapshot';
import { bindsToFight, type Action, type Card } from '../staff/advice';
import type { Role } from '../staff/advisors';

export type CrisisKind = 'treaty' | 'nuclear' | 'peace' | 'capital';
export type Tone = 'red' | 'gold' | 'blue';

export interface CrisisOption {
  title: string;
  /** What happens, in one or two short sentences. */
  text: string;
  button: string;
  tone: Tone;
  advisor: Role;
  quote: string;
  action: Action;
  irreversible?: boolean;
  /** Close the crisis and leave the card on the table: the crisis comes back (`returnsIn`). */
  defer?: true;
  recommended: boolean;
}

export interface CrisisFact { label: string; value: string; tone?: Tone }

export interface Crisis {
  key: string;
  kind: CrisisKind;
  card: Card;
  /** The wire the alert comes over, e.g. "Foreign ministry · Treaty desk". */
  source: string;
  headline: string;
  sub: string;
  /** Hours left on the clock; null when the decision has no deadline. */
  hoursLeft: number | null;
  /** The whole window, for the deadline bar. */
  windowHours: number | null;
  /** What the clock counts down to, e.g. "Answer due in". */
  clock: string;
  node?: NodeId;
  facts: CrisisFact[];
  /** The facts as they stand now, read again once the player has answered. */
  factsNow(c: CrisisContext): CrisisFact[];
  options: CrisisOption[];
  /** One line on how the staff stands: agreed, or split. */
  verdict: string;
}

export interface CrisisContext {
  me: NationId;
  tick: number;
  dtHours: number;
  d: NationDetail;
  nations: ReadonlyMap<NationId, NationSummary>;
  name(id: NationId): string;
  capital(id: NationId): NodeId | undefined;
}

export const CRISIS_KINDS: Record<string, CrisisKind> = { treaty: 'treaty', nalert: 'nuclear', peace: 'peace', capital: 'capital' };
export const crisisKind = (card: Card): CrisisKind | undefined => (card.urgent || card.key.startsWith('peace|') ? CRISIS_KINDS[card.key.split('|')[0]] : undefined);

const n = (x: number) => x.toLocaleString('en-US');
const pct = (x: number) => `${Math.round(x * 100)}%`;
const later = (label: string): Action => ({ kind: 'later', label });
const same = (a: Action | undefined, b: Action) => !!a && a.kind === b.kind && JSON.stringify(a) === JSON.stringify(b);

function treaty(card: Card, c: CrisisContext): Crisis | null {
  const [, war, tr] = card.key.split('|');
  const call = c.d.treatyCalls.find((x) => x.war === war && x.treaty === tr);
  if (!call) return null;
  const aggressor = c.name(call.aggressor), victim = c.name(call.victim), name = treatyName(call.treaty);
  const theirWarheads = c.nations.get(call.aggressor)?.warheads ?? 0;
  const ours = c.nations.get(c.me)?.warheads ?? 0;
  const binding = bindsToFight(call.treaty);
  const join: Action = { kind: 'command', label: binding ? 'Honour the treaty' : 'Enter the war', command: { type: 'answer_treaty', nation: c.me, war: call.war, treaty: call.treaty, join: true } };
  const stay: Action = { kind: 'command', label: 'Stand aside', command: { type: 'answer_treaty', nation: c.me, war: call.war, treaty: call.treaty, join: false } };
  const hoursLeft = Math.max(0, (call.dueTick - c.tick) * c.dtHours);
  const joinFirst = card.primary?.kind === 'command' && card.primary.command.type === 'answer_treaty' && card.primary.command.join;
  const options: CrisisOption[] = [
    {
      title: 'Go to war', text: `We declare war on ${aggressor} and fight beside ${victim}.`, button: join.label, tone: 'red', advisor: 'chief', irreversible: true,
      quote: !binding ? `Nothing obliges us. Every partner in the region is watching what we do.` : theirWarheads ? `Our word is the deterrent. If it bends now, it breaks everywhere.` : `${aggressor} cannot match us. Every day we wait, ${victim} loses ground.`,
      action: join, recommended: joinFirst,
    },
    {
      title: 'Wait and consult', text: `No answer yet. The call stays open ${hoursLeft >= 48 ? `${Math.floor(hoursLeft / 24)} more days` : `${Math.round(hoursLeft)} more hours`}, and comes back before it lapses.`, button: 'Decide later', tone: 'gold', advisor: 'foreign',
      quote: 'Let me sound out the other members first. We have time, not much.', action: later('Decide later'), defer: true, recommended: false,
    },
    {
      title: 'Stand aside', text: binding ? `We stay out of the war. Allies may doubt the ${name}.` : `We stay out of the war. The ${name} asks no more of us, but partners will weigh it.`, button: 'Stand aside', tone: 'blue', advisor: 'security',
      quote: theirWarheads && !ours ? `${aggressor} holds ${n(theirWarheads)} warheads. This is not a war we can finish.` : 'This is not our war. Our forces stay ours.',
      action: stay, recommended: !joinFirst,
    },
  ];
  const factsNow = (x: CrisisContext): CrisisFact[] => [
    { label: 'Aggressor', value: aggressor, tone: 'red' },
    { label: 'Under attack', value: victim, tone: 'blue' },
    { label: `${aggressor} warheads`, value: theirWarheads ? n(theirWarheads) : 'None', tone: theirWarheads ? 'red' : undefined },
    { label: 'Our warheads', value: ours ? n(ours) : 'None' },
    { label: 'Our wars now', value: x.d.enemies.length ? `At war with ${x.d.enemies.slice(0, 2).map(x.name).join(', ')}${x.d.enemies.length > 2 ? ` and ${x.d.enemies.length - 2} more` : ''}` : 'At peace', tone: x.d.enemies.includes(call.aggressor) ? 'red' : undefined },
  ];
  return {
    key: card.key, kind: 'treaty', card, node: c.capital(call.victim),
    source: 'Foreign ministry · Treaty desk',
    headline: binding ? 'Treaty invoked' : 'Call for help',
    sub: binding ? `${victim} calls on the ${name}${call.reconsidered ? ' again' : ''} · ${aggressor} has attacked` : `${victim} asks us to fight${call.reconsidered ? ' again' : ''} · ${aggressor} has attacked`,
    hoursLeft, windowHours: Math.max(hoursLeft, 7 * 24), clock: 'Answer due in',
    facts: factsNow(c), factsNow,
    options,
    verdict: joinFirst ? 'Your advisers lean to war, 2 to 1' : 'Your advisers lean to staying out, 2 to 1',
  };
}

function nuclear(card: Card, c: CrisisContext): Crisis | null {
  const by = card.key.split('|')[1] as NationId;
  const them = c.name(by);
  const alert = c.d.nuclear.alert;
  const theirs = c.nations.get(by)?.warheads ?? 0;
  const raise = card.primary?.kind === 'command' ? card.primary : undefined;
  const look = card.secondary?.kind === 'show' ? card.secondary : undefined;
  const at = look?.node ?? c.capital(by);
  const deployed = alert.mated > 0;
  const options: CrisisOption[] = [];
  if (raise) {
    options.push({
      title: 'Raise our alert', text: `Mate our ${n(alert.stored)} stored warheads to launchers, so a strike on us can be answered.`, button: 'Raise the alert', tone: 'red', advisor: 'security',
      quote: 'If they can strike and we cannot answer, deterrence is gone.', action: raise, recommended: true,
    });
  }
  options.push(raise ? {
    title: 'Hold readiness', text: `We match nothing. ${them} sees no escalation from us.`, button: 'Hold', tone: 'gold', advisor: 'foreign',
    quote: 'Matching them tells them we expect a strike. Give the hotline a day.', action: later('Hold'), recommended: false,
  } : deployed ? {
    title: 'Stand firm', text: `Our ${n(alert.mated)} warheads on launchers already answer any strike. We change nothing ${them} could read as a threat.`, button: 'Stand firm', tone: 'gold', advisor: 'security',
    quote: 'Our deterrent is on alert every day. That is what it is for.', action: later('Stand firm'), recommended: true,
  } : {
    title: 'Hold and watch', text: 'We have no nuclear weapons of our own. Our allies hold the deterrent.', button: 'Hold', tone: 'gold', advisor: 'foreign',
    quote: 'Let the nuclear powers beside us speak first.', action: later('Hold'), recommended: true,
  });
  if (at !== undefined) {
    options.push({
      title: 'Look first', text: look ? `See where ${them}'s launchers we know of stand, with the clock stopped. The question comes back when the clock runs.` : 'Return to the map with the clock stopped. The question comes back when the clock runs.',
      button: 'Show the launchers', tone: 'blue', advisor: 'intel',
      quote: 'One report is not a satellite fix. Look before you answer.', action: look ?? { kind: 'show', label: 'Show me', node: at }, recommended: false,
    });
  }
  const spec = NUCLEAR_ALERT[by];
  const elapsed = (c.tick - card.tick) * c.dtHours;
  const hoursLeft = spec ? Math.max(0, spec.fullHours - elapsed) : null;
  const factsNow = (x: CrisisContext): CrisisFact[] => {
    const a = x.d.nuclear.alert;
    return [
      { label: `${them} warheads`, value: theirs ? n(theirs) : 'Unknown', tone: 'red' },
      { label: 'Ours ready now', value: n(a.mated), tone: a.mated ? 'blue' : undefined },
      { label: 'Ours in storage', value: n(a.stored) },
      { label: 'Our posture', value: a.ordered ? 'Alert ordered' : a.mated ? 'Deployed on launchers' : 'Peacetime' },
    ];
  };
  return {
    key: card.key, kind: 'nuclear', card, node: at,
    source: 'Strategic command · Early warning',
    headline: 'Nuclear alert',
    sub: `${them} is mating warheads to its launchers`,
    hoursLeft, windowHours: spec ? spec.fullHours : null, clock: `${them} fully armed in`,
    facts: factsNow(c), factsNow,
    options,
    verdict: raise ? 'Your advisers disagree, 2 to 1' : 'Your advisers agree: hold',
  };
}

function peace(card: Card, c: CrisisContext): Crisis | null {
  const from = card.key.split('|')[1] as NationId;
  const them = c.name(from);
  const accept: Action = { kind: 'command', label: 'Accept peace', command: { type: 'offer_peace', nation: c.me, target: from } };
  const take = same(card.primary, accept);
  const held = c.d.nodesHome ? c.d.nodesHeld / c.d.nodesHome : 1;
  const me = c.nations.get(c.me);
  const factsNow = (x: CrisisContext): CrisisFact[] => {
    const h = x.d.nodesHome ? x.d.nodesHeld / x.d.nodesHome : 1;
    const m = x.nations.get(x.me);
    return [
      { label: 'Our land held', value: pct(h), tone: h < 0.97 ? 'red' : 'blue' },
      { label: 'War support', value: pct(m?.warSupport ?? 0), tone: (m?.warSupport ?? 1) < 0.4 ? 'red' : undefined },
      { label: 'Mobilised', value: pct(m?.mobilization ?? 0) },
      { label: 'Other wars', value: String(Math.max(0, x.d.enemies.filter((e) => e !== from).length)) },
    ];
  };
  return {
    key: card.key, kind: 'peace', card, node: c.capital(from),
    source: 'Foreign ministry · Back channel',
    headline: 'Armistice offered',
    sub: `${them} proposes a ceasefire on today's lines`,
    hoursLeft: null, windowHours: null, clock: 'The clock',
    facts: factsNow(c), factsNow,
    options: [
      {
        title: 'Sign the armistice', text: `The guns stop on today's lines. Ground ${them} holds stays in its hands.`, button: 'Accept peace', tone: 'blue', advisor: 'foreign',
        quote: take ? 'We will not get better terms by bleeding for them.' : 'A ceasefire now freezes the line where it stands.', action: accept, irreversible: true, recommended: take,
      },
      {
        title: 'Fight on', text: `The offer stays open. The war goes on.`, button: 'Fight on', tone: 'red', advisor: 'chief',
        quote: take ? 'One more push and the line is ours again.' : `We are holding. ${them} is asking because it is losing.`, action: later('Fight on'), recommended: !take,
      },
    ],
    verdict: take ? 'Your advisers lean to peace' : 'Your advisers lean to fighting on',
  };
}

function capital(card: Card, c: CrisisContext): Crisis | null {
  const city = card.title.replace(/ is threatened$/, '');
  const send = card.primary?.kind === 'command' ? card.primary : undefined;
  const show: Action = card.node !== undefined ? { kind: 'show', label: 'Show me', node: card.node } : later('Not now');
  const options: CrisisOption[] = [];
  if (send) {
    options.push({
      title: 'Reinforce the capital', text: card.ask ?? `Move the reserve into ${city}.`, button: send.label, tone: 'gold', advisor: 'chief',
      quote: card.cost?.text ? `${card.cost.text}. It is worth it.` : 'The reserve exists for this.', action: send, recommended: true,
    });
  }
  options.push({ title: 'Look first', text: 'Return to the map with the clock stopped.', button: 'Show me', tone: 'blue', advisor: 'intel', quote: 'Our fixes on them are hours old. See where they are.', action: show, recommended: !send });
  options.push({ title: 'Hold the line', text: `${city} holds with what is there.`, button: 'Hold', tone: 'red', advisor: 'security', quote: 'Pull from the front and the front breaks.', action: later('Hold'), recommended: false });
  const factsNow = (x: CrisisContext): CrisisFact[] => [
    { label: 'Nearest enemy', value: card.figure ? `${card.figure.value} km` : '—', tone: 'red' },
    { label: 'War support', value: pct(x.nations.get(x.me)?.warSupport ?? 0) },
    { label: 'Wars', value: `At war with ${x.d.enemies.length}`, tone: 'red' },
  ];
  return {
    key: card.key, kind: 'capital', card, node: card.node,
    source: 'Military intelligence · Flash',
    headline: 'Capital threatened',
    sub: card.text,
    hoursLeft: null, windowHours: null, clock: 'The clock',
    facts: factsNow(c), factsNow,
    options,
    verdict: send ? 'Your advisers want the reserve in the city' : 'Your staff has no reserve to send',
  };
}

const BUILD: Record<CrisisKind, (card: Card, c: CrisisContext) => Crisis | null> = { treaty, nuclear, peace, capital };

export function crisisOf(card: Card, c: CrisisContext): Crisis | null {
  const kind = crisisKind(card);
  return kind ? BUILD[kind](card, c) : null;
}

/** The crisis once the player has answered it: the deadline is met, and the facts read as they stand now. */
export function answered(crisis: Crisis, c: CrisisContext): Crisis {
  return { ...crisis, hoursLeft: null, windowHours: null, clock: 'Answered', facts: crisis.factsNow(c) };
}

/** The option the staff recommends, which it takes itself when the player has turned crises off. */
export const staffChoice = (crisis: Crisis): CrisisOption => crisis.options.find((o) => o.recommended) ?? crisis.options[0];

/**
 * Ticks until a crisis closed without an answer is put to the player again: a look at the map
 * comes back on the next turn, a deferral a day later, and a deadline is never let pass unasked.
 */
export function returnsIn(crisis: Crisis, option: CrisisOption, dtHours: number): number {
  if (option.action.kind === 'show') return 1;
  const day = Math.round(24 / dtHours);
  return crisis.hoursLeft === null ? day : Math.max(1, Math.min(day, Math.floor(crisis.hoursLeft / dtHours) - 1));
}

/** The first card on the table that should stop the clock, if any, skipping those already shown. */
export function nextCrisis(cards: readonly Card[], shown: ReadonlySet<string>, c: CrisisContext): Crisis | null {
  for (const card of cards) {
    if (shown.has(card.key)) continue;
    const crisis = crisisOf(card, c);
    if (crisis) return crisis;
  }
  return null;
}

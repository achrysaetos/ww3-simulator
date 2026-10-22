import { relation, type SimContext } from '../../core/engine';
import { platformCount } from '../../core/forces';
import { defineParam } from '../../core/params';
import type { DeclaredAim, NationId, World } from '../../core/types';
import { strategicProfile } from '../../data/nations';
import type { StrategicObjective } from '../../data/nations/types';
import { viewOf } from '../intel/view';
import { aiMayIssue, delegated } from '../orders';
import { politicalDraw } from './leaders';
import type { Crisis, DiplomacyState } from './types';
import { declareWar, raiseEscalation, type Diplomacy } from './wars';

/**
 * War onset from beliefs (issue #2, section 4). A government at peace with a claim on a neighbour (its strategic
 * objectives: unify, annex, recover) weighs, from its own intelligence picture, whether the claim can be taken: its
 * ground forces against the target's as it believes them, plus the target's treaty allies by how likely they are to
 * come. Nobody presses a claim on a state that has nuclear weapons or a nuclear-armed treaty defender: Russia attacked
 * Ukraine and Georgia, neither under one, and has not touched the Baltic states. A ripe claim opens a crisis
 * now and then (CRISIS_RATE): an ultimatum, mobilisation on both sides, the pair at the crisis rung. When the
 * ultimatum runs out the challenger goes to war if it still believes it should, with WAR_IN_CRISIS odds, and
 * otherwise backs down: most crises end without war.
 */

/** Ground forces a challenger believes it needs against the target's, the attacker's rule of thumb (Mearsheimer, "Assessing the Conventional Balance: The 3:1 Rule and Its Critics", International Security, 1989). */
const ONSET_RATIO = defineParam({
  id: 'diplomacy.ONSET_RATIO', value: 3, range: [1.5, 5], tag: 'contested',
  source: 'Mearsheimer 1989, the 3:1 rule and its critics',
  affects: 'when a government believes a claim can be taken by force',
});

/**
 * Crises opened per year over a ripe claim. Estimate: Azerbaijan pressed its claim in the April 2016 and July 2020
 * clashes before September 2020; Russia in 2008, 2014 and 2021-22. About one serious crisis every two years.
 */
const CRISIS_RATE = defineParam({
  id: 'diplomacy.CRISIS_RATE', value: 0.5, range: [0.1, 365], tag: 'judgment',
  source: 'judgment: Azerbaijan 2016, 2020; Russia 2008, 2014, 2021-22',
  affects: 'how often a ripe claim turns into a crisis',
});

/**
 * Days an ultimatum stands before the challenger decides. Iraq's threats to Kuwait ran 17 July to 2 August 1990
 * (16 days); Russia's draft treaties of 17 December 2021 preceded the invasion by 69 days; Austria-Hungary gave Serbia
 * 48 hours in 1914.
 */
const CRISIS_DAYS = defineParam({
  id: 'diplomacy.CRISIS_DAYS', value: 21, range: [2, 70], tag: 'estimated',
  source: 'Iraq-Kuwait 1990 (16 days), Russia-Ukraine 2021-22 (69 days), July Crisis 1914 (2 days for the ultimatum)',
  affects: 'how long a pre-war crisis lasts',
});

/** Odds that a crisis whose claim is still ripe at the deadline ends in war. Most militarised crises do not (Correlates of War MID data: a few percent become wars); one built on a believed 3:1 edge and a standing ultimatum does far more often. Judgment. */
const WAR_IN_CRISIS = defineParam({
  id: 'diplomacy.WAR_IN_CRISIS', value: 0.5, range: [0.1, 1], tag: 'judgment',
  source: 'judgment: CoW MID data put war at a few percent of disputes; a ripe ultimatum far more',
  affects: 'how often a crisis ends in war',
});

/** Opinion at or below which a government is hostile enough to press a claim by force. Estimate: Azerbaijan-Armenia and China-Taiwan sit far below it, India-Pakistan near it. */
const HOSTILE_ENOUGH = -30;

/** Mobilisation both sides order in a crisis: the frontline tier of MOBILIZATION in ai/strategy.ts. */
const CRISIS_MOBILIZATION = 0.33;

const CLAIMS: ReadonlySet<StrategicObjective['kind']> = new Set(['unify', 'annex', 'recover']);

const isGround = (kind: string) => kind === 'maneuver' || kind === 'artillery';

/** `by`'s ground platforms against those it believes `on` and its likely defenders have; 0 while its intelligence shows none, since nobody goes to war blind. */
export function believedBalance(world: World, ctx: SimContext, d: Diplomacy, by: NationId, on: NationId): number {
  let own = 0;
  for (const f of Object.values(world.formations)) if (f.nation === by && f.status === 'active' && isGround(f.kind)) own += platformCount(f);
  const weight = new Map<NationId, number>([[on, 1]]);
  for (const t of d.alliances) {
    if (!t.members[on] || t.members[by]) continue;
    for (const [m, terms] of Object.entries(t.members) as [NationId, (typeof t.members)[NationId]][])
      if (m !== on && terms.role !== 'protected') weight.set(m, Math.max(weight.get(m) ?? 0, t.kind === 'ambiguous' ? 0.5 : terms.reliability));
  }
  let theirs = 0;
  for (const c of viewOf(world, ctx.map, by).contacts.values()) {
    const w = weight.get(c.nation);
    if (w && isGround(c.kind)) theirs += w * c.strength;
  }
  return theirs > 0 ? own / theirs : 0;
}

/**
 * Whether `on` has nuclear weapons, or a nuclear-armed state bound by treaty to defend it, even ambiguously: the US
 * under the Taiwan Relations Act deters as much by what it might do as by what it must.
 */
function nuclearShield(world: World, d: Diplomacy, on: NationId): boolean {
  if (world.nations[on].nuclear.warheads > 0) return true;
  return d.alliances.some((t) => t.members[on] && t.members[on].role !== 'guarantor' && Object.entries(t.members).some(([m, terms]) => m !== on && terms.role !== 'protected' && world.nations[m as NationId]?.nuclear.warheads > 0));
}

/** The aim a claim is pressed for: a recovery is fought for the ground held, a unification or annexation for everything. */
const aimFor = (o: StrategicObjective): DeclaredAim => (o.kind === 'recover' ? { kind: 'limited' } : { kind: 'total' });

function ripe(world: World, ctx: SimContext, d: Diplomacy, by: NationId, on: NationId): boolean {
  const target = world.nations[on];
  if (!target || target.status !== 'peace' || relation(world, by, on).atWar) return false;
  if (relation(world, by, on).opinion > HOSTILE_ENOUGH || nuclearShield(world, d, on)) return false;
  return believedBalance(world, ctx, d, by, on) >= ONSET_RATIO();
}

/** Daily: open crises over ripe claims, and decide those whose ultimatum has run out. */
export function warOnset(world: World, ctx: SimContext, s: DiplomacyState, d: Diplomacy): void {
  const crises = (s.crises ??= []);
  for (const c of [...crises]) {
    if (world.tick < c.due) continue;
    crises.splice(crises.indexOf(c), 1);
    const objective = strategicProfile[c.by]?.objectives.find((o) => o.id === c.objective);
    const stillRipe = !!objective && world.nations[c.by].status === 'peace' && ripe(world, ctx, d, c.by, c.on);
    if (stillRipe && politicalDraw(world, `war:${c.by}>${c.on}`) < WAR_IN_CRISIS()) {
      declareWar(world, ctx, s, c.by, c.on, `ultimatum rejected: ${objective.description}`, aimFor(objective));
    } else {
      ctx.emit({ type: 'message', tick: world.tick, nation: c.by, text: `${c.by} lets its ultimatum to ${c.on} lapse; the crisis passes without war` });
    }
  }
  const perDay = 1 - Math.exp(-CRISIS_RATE() / 365);
  for (const by of Object.keys(world.nations).sort() as NationId[]) {
    const nation = world.nations[by];
    if (nation.status !== 'peace' || nation.controlledBy === 'human' || !delegated(world, by, 'strategic')) continue;
    if (crises.some((c) => c.by === by)) continue;
    for (const o of strategicProfile[by]?.objectives ?? []) {
      if (!CLAIMS.has(o.kind) || o.priority > 2) continue;
      const on = o.targets.find((t) => ripe(world, ctx, d, by, t as NationId)) as NationId | undefined;
      if (!on || politicalDraw(world, `crisis:${by}>${on}`) >= perDay) continue;
      const crisis: Crisis = { by, on, since: world.tick, due: world.tick + Math.ceil((CRISIS_DAYS() * 24) / world.dtHours), objective: o.id };
      crises.push(crisis);
      raiseEscalation(world, ctx, by, on, 'crisis');
      ctx.emit({ type: 'message', tick: world.tick, nation: by, text: `${by} issues an ultimatum to ${on}: ${o.description}` });
      for (const n of [by, on]) {
        const order = { type: 'set_mobilization' as const, nation: n, level: CRISIS_MOBILIZATION };
        if (world.nations[n].mobilization < CRISIS_MOBILIZATION && aiMayIssue(world, order)) world.pending.push(order);
      }
      break;
    }
  }
}

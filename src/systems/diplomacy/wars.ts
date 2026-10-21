import { atWar, relation, relationKey, relationMut, setAtWar, type SimContext } from '../../core/engine';
import { ESCALATION, type EscalationLevel, type NationId, type World } from '../../core/types';
import { clearTreatyAnswer, delegated, treatyAnswer } from '../orders';
import { neighbours } from './assess';
import { DEFAULT_PROFILE, type AllianceTreaty, type Assessment, type DiplomacyState, type PendingJoin, type StrategicProfile, type War } from './types';

export const rung = (l: EscalationLevel) => ESCALATION.indexOf(l);

export function raiseEscalation(world: World, ctx: SimContext, a: NationId, b: NationId, level: EscalationLevel): void {
  const r = relationMut(world, a, b);
  if (rung(level) <= rung(r.escalation)) return;
  r.escalation = level;
  ctx.emit({ type: 'escalation', tick: world.tick, a, b, level });
}

/** Rally-round-the-flag on entering a war; decays with RALLY_HALF_LIFE_DAYS (see support.ts). */
const RALLY = { attacked: 0.2, joined: 0.05, aggressor: 0.05 } as const;

/** Open a war record for `n` unless one is running; rally 'none' for wars started outside diplomacy (scenarios). */
export function enterWar(world: World, s: DiplomacyState, n: NationId, rally: keyof typeof RALLY | 'none'): void {
  const nation = world.nations[n];
  nation.status = 'war';
  const rec = s.records[n];
  if (rec && rec.enteredTick >= 0) return;
  s.records[n] = {
    baseline: nation.warSupport,
    rally: rally === 'none' ? 0 : RALLY[rally],
    rallyTick: world.tick,
    enteredTick: world.tick,
    casualties: rec?.casualties ?? 0,
    nuclearHits: rec?.nuclearHits ?? 0,
    nuclearStruckBy: rec?.nuclearStruckBy ?? [],
    ssbnLost: rec?.ssbnLost ?? 0,
  };
}

function openHostilities(world: World, ctx: SimContext, by: NationId, on: NationId, reason: string): void {
  if (atWar(world, by, on)) return;
  const r = setAtWar(world, by, on, true);
  r.warSince = world.tick;
  r.opinion = Math.min(r.opinion, -60);
  ctx.emit({ type: 'war_declared', tick: world.tick, by, on, reason });
  raiseEscalation(world, ctx, by, on, 'conventional');
}

export function sideOf(war: War, n: NationId): 0 | 1 | -1 {
  return war.sides[0].includes(n) ? 0 : war.sides[1].includes(n) ? 1 : -1;
}

/** Put `n` on `side` of `war` and open hostilities with every member of the other side. */
function joinSide(world: World, ctx: SimContext, s: DiplomacyState, war: War, n: NationId, side: 0 | 1, reason: string, mode: keyof typeof RALLY): void {
  if (sideOf(war, n) === -1) war.sides[side].push(n);
  enterWar(world, s, n, mode);
  for (const e of war.sides[1 - side]) {
    if (world.nations[e].status === 'capitulated') continue;
    if (mode === 'attacked') openHostilities(world, ctx, e, n, reason);
    else openHostilities(world, ctx, n, e, reason);
    enterWar(world, s, e, 'joined');
  }
}

/**
 * Defensive treaties of `victim` that oblige other members to fight `aggressor`.
 * Intra-alliance wars (Greece-Turkey in NATO) trigger nothing. The side that
 * started the war is not defended because others came to its victim's aid:
 * CSTO Art. 4 and the 2024 Russia-DPRK treaty cover "armed attack", and Russia
 * invoked neither for Ukraine's backers in 2022-25. Only a serious invasion of
 * its own homeland calls them (see invasions).
 */
function cascade(world: World, s: DiplomacyState, alliances: readonly AllianceTreaty[], war: War, victim: NationId, aggressor: NationId, invaded = false): void {
  const side = sideOf(war, victim) as 0 | 1;
  if (side === sideOf(war, war.aggressor) && !invaded) return;
  const key = `${war.id}|${victim}`;
  if (s.invoked.includes(key)) return;
  s.invoked.push(key);
  for (const t of alliances) {
    const vm = t.members[victim];
    if (!vm || vm.role === 'guarantor' || t.members[aggressor]) continue;
    for (const [m, terms] of Object.entries(t.members) as [NationId, AllianceTreaty['members'][NationId]][]) {
      if (m === victim || terms.role === 'protected' || !world.nations[m]) continue;
      if (world.nations[m].status === 'capitulated' || sideOf(war, m) !== -1) continue;
      if (s.joins.some((j) => j.nation === m && j.war === war.id)) continue;
      s.joins.push({
        nation: m, war: war.id, side, treaty: t.id, kind: t.kind, victim, aggressor,
        dueTick: world.tick + Math.ceil((terms.delayDays * 24) / world.dtHours),
      });
    }
  }
}

/** Give wars set up outside diplomacy (scenarios, tests) a coalition record and war records. */
export function adoptWars(world: World, s: DiplomacyState, enemies: Map<NationId, Set<NationId>>): void {
  for (const [a, foes] of enemies) {
    if ((s.records[a]?.enteredTick ?? -1) < 0) enterWar(world, s, a, 'none');
    for (const b of foes) {
      if (a > b || s.wars.some((w) => sideOf(w, a) !== -1 && sideOf(w, b) === 1 - sideOf(w, a))) continue;
      const war = s.wars.find((w) => (sideOf(w, a) === -1) !== (sideOf(w, b) === -1));
      if (!war) s.wars.push({ id: `w${world.tick}_${a}_${b}`, aggressor: a, sides: [[a], [b]], startTick: world.tick });
      else if (sideOf(war, a) === -1) war.sides[1 - sideOf(war, b)].push(a);
      else war.sides[1 - sideOf(war, a)].push(b);
    }
  }
}

/** Nations friendly to a victim think less of its attacker. */
function condemn(world: World, victim: NationId, aggressor: NationId, by: number): void {
  for (const n of Object.keys(world.nations) as NationId[]) {
    if (n === victim || n === aggressor) continue;
    if (relation(world, n, victim).opinion < 30) continue;
    const r = relationMut(world, n, aggressor);
    r.opinion = Math.max(-100, r.opinion - by);
  }
}

export function declareWar(world: World, ctx: SimContext, s: DiplomacyState, alliances: readonly AllianceTreaty[], by: NationId, on: NationId, reason: string): void {
  if (by === on || atWar(world, by, on)) return;
  if (!world.nations[by] || !world.nations[on]) return;
  if (world.nations[by].status === 'capitulated' || world.nations[on].status === 'capitulated') return;
  let war = s.wars.find((w) => sideOf(w, on) !== -1 && sideOf(w, by) === -1);
  if (war) {
    joinSide(world, ctx, s, war, by, (1 - sideOf(war, on)) as 0 | 1, reason, 'aggressor');
  } else {
    war = s.wars.find((w) => sideOf(w, by) !== -1 && sideOf(w, on) === -1);
    if (war) {
      joinSide(world, ctx, s, war, on, (1 - sideOf(war, by)) as 0 | 1, reason, 'attacked');
    } else {
      war = { id: `w${world.tick}_${by}_${on}`, aggressor: by, sides: [[by], [on]], startTick: world.tick };
      s.wars.push(war);
      enterWar(world, s, by, 'aggressor');
      joinSide(world, ctx, s, war, on, 1, reason, 'attacked');
    }
  }
  const rec = s.records[on];
  rec.rally = Math.max(rec.rally, RALLY.attacked);
  rec.rallyTick = world.tick;
  condemn(world, on, by, 20);
  cascade(world, s, alliances, war, on, by);
}

/**
 * Share of homeland population an enemy must hold before the aggressor's side
 * calls on its treaties. Estimate: the Kursk incursion (Aug 2024, ~0.5% of
 * Russia's population) drew DPRK troops under Russian command but no DPRK
 * declaration of war and no CSTO invocation; a front deep in the homeland would.
 */
const SERIOUS_INVASION = 0.02;

/** The aggressor's coalition calls its treaties once an enemy holds a serious part of a member's homeland. */
export function invasions(world: World, s: DiplomacyState, alliances: readonly AllianceTreaty[], invadedBy: ReadonlyMap<NationId, NationId>): void {
  for (const war of s.wars) {
    const side = sideOf(war, war.aggressor);
    if (side === -1) continue;
    for (const n of war.sides[side]) {
      const invader = invadedBy.get(n);
      const a = s.assessment[n];
      if (!invader || sideOf(war, invader) !== 1 - side || !a) continue;
      if (a.popLost >= SERIOUS_INVASION || a.capitalThreatened) cascade(world, s, alliances, war, n, invader, true);
    }
  }
}

/**
 * Ambiguous commitments are decided by the guarantor at the time: leadership
 * interventionism and risk appetite, plus how it regards both parties. The
 * weights are an estimate; with the US profile (high interventionism, moderate
 * risk) and opinions of +60/-40 it yields ~0.8, in line with the RAND/CSIS
 * wargame premise that the US intervenes in most Taiwan scenarios.
 */
function ambiguousResolve(world: World, profile: StrategicProfile, j: PendingJoin): number {
  const lean = relation(world, j.nation, j.victim).opinion - relation(world, j.nation, j.aggressor).opinion;
  return Math.min(1, Math.max(0, 0.5 * profile.interventionism + 0.3 * profile.riskTolerance + lean / 400));
}

/**
 * Log-odds added to a member's reliability per stake it holds in the attacked
 * member's fate. Estimate (x7 odds each), after Schelling's tripwire logic
 * ("Arms and Influence", 1966) and war diffusion through borders (Siverson and
 * Starr 1991): a nuclear guarantor whose credibility everywhere rides on it, a
 * frontline state that borders the attacker, and a member whose own troops are
 * on the victim's soil (NATO's eFP battlegroups) each come close to certain.
 */
const STAKE_LOGIT = 2;

function stakes(ctx: SimContext, treaty: AllianceTreaty, j: PendingJoin, hosted: ReadonlySet<string>): number {
  return (treaty.guarantors?.includes(j.nation) ? 1 : 0)
    + (neighbours(ctx.map, j.nation).has(j.aggressor) ? 1 : 0)
    + (hosted.has(`${j.nation}|${j.victim}`) ? 1 : 0);
}

/** `nation|host` for every nation with active forces on another's homeland. */
function forcesAbroad(world: World, ctx: SimContext): Set<string> {
  const out = new Set<string>();
  for (const f of Object.values(world.formations)) {
    if (f.status !== 'active' || f.node >= ctx.map.landCount) continue;
    const host = ctx.map.owner[f.node];
    if (host !== f.nation) out.add(`${f.nation}|${host}`);
  }
  return out;
}

/** `p` with `logit` added to its log-odds. */
export const shiftOdds = (p: number, logit: number) => 1 / (1 + Math.exp(-(Math.log(p / (1 - p)) + logit)));

/**
 * A member that declines looks again once, a week on, after the first battles
 * and allied pressure; a second refusal stands. Estimate of the cadence of
 * alliance councils in a crisis (NATO's North Atlantic Council meets weekly).
 */
const RECONSIDER_DAYS = 7;

/**
 * Resolve treaty obligations that have come due. A human nation decides for itself: its call
 * resolves as soon as the player answers. Unanswered at the deadline, the AI delegate decides if
 * the player delegated strategic decisions; otherwise the call lapses as a refusal.
 */
export function resolveJoins(world: World, ctx: SimContext, s: DiplomacyState, alliances: readonly AllianceTreaty[], profiles: Readonly<Record<string, StrategicProfile>>): void {
  const due = s.joins.filter((j) => j.dueTick <= world.tick || treatyAnswer(world, j.nation, j.war, j.treaty) !== undefined);
  if (!due.length) return;
  s.joins = s.joins.filter((j) => !due.includes(j));
  const hosted = forcesAbroad(world, ctx);
  for (const j of due) {
    const answer = treatyAnswer(world, j.nation, j.war, j.treaty);
    clearTreatyAnswer(world, j.nation, j.war, j.treaty);
    const war = s.wars.find((w) => w.id === j.war);
    if (!war || sideOf(war, j.victim) !== j.side || sideOf(war, j.nation) !== -1) continue;
    if (world.nations[j.victim].status === 'capitulated' || world.nations[j.nation].status === 'capitulated') continue;
    const treaty = alliances.find((t) => t.id === j.treaty)!;
    const p = () => j.kind === 'ambiguous'
      ? ambiguousResolve(world, profiles[j.nation] ?? DEFAULT_PROFILE, j)
      : shiftOdds(treaty.members[j.nation].reliability, STAKE_LOGIT * stakes(ctx, treaty, j, hosted));
    const lapsed = answer === undefined && !delegated(world, j.nation, 'strategic');
    if (answer ?? (!lapsed && ctx.rng.chance(p()))) {
      joinSide(world, ctx, s, war, j.nation, j.side, `${j.treaty}: defence of ${j.victim}`, 'joined');
    } else {
      const r = relationMut(world, j.nation, j.victim);
      r.opinion = Math.max(-100, r.opinion - 30);
      const text = lapsed ? `${j.nation} let the ${j.treaty} deadline pass without answering ${j.victim}` : `${j.nation} declines to honour ${j.treaty} for ${j.victim}`;
      ctx.emit({ type: 'message', tick: world.tick, nation: j.nation, text });
      if (!j.reconsidered) s.joins.push({ ...j, reconsidered: true, dueTick: world.tick + Math.ceil((RECONSIDER_DAYS * 24) / world.dtHours) });
    }
  }
}

/**
 * Neutrals with a strong lean toward one side may enter later, more readily as
 * the war escalates. Evaluated once a day per profiled nation. Wars spread to
 * neighbours and allies (Siverson and Starr, "The Diffusion of War", 1991), so
 * an opportunist must border the side it would fight; treaty partners come in
 * through `cascade` instead. Opportunists join a war already being won, as
 * Italy did against France in June 1940 and the USSR against Japan in August
 * 1945 (Schweller, "Bandwagoning for Profit", 1994), so a foe must be
 * collapsing. Nobody opts into a war against a nuclear-armed state: NATO armed
 * Ukraine for years without fighting Russia, and no state has entered a war
 * against a nuclear power on another's behalf without a treaty since 1945.
 */
export function neutralEntry(world: World, ctx: SimContext, s: DiplomacyState, alliances: readonly AllianceTreaty[], profiles: Readonly<Record<string, StrategicProfile>>): void {
  for (const war of [...s.wars]) {
    let peak = 0;
    for (const a of war.sides[0]) for (const b of war.sides[1]) peak = Math.max(peak, rung(relation(world, a, b).escalation));
    const escalationPull = 1 + Math.max(0, peak - rung('conventional'));
    const deterred = war.sides.map((side) => side.some((m) => world.nations[m].nuclear.warheads > 0));
    for (const [n, profile] of Object.entries(profiles) as [NationId, StrategicProfile][]) {
      const nation = world.nations[n];
      if (!nation || nation.status !== 'peace' || sideOf(war, n) !== -1) continue;
      if (s.joins.some((j) => j.nation === n && j.war === war.id)) continue;
      const lean = meanOpinion(world, n, war.sides[0]) - meanOpinion(world, n, war.sides[1]);
      if (Math.abs(lean) < 100) continue;
      const side: 0 | 1 = lean > 0 ? 0 : 1;
      const foes = war.sides[1 - side];
      if (deterred[1 - side] || !foes.some((f) => collapsing(s.assessment[f]))) continue;
      const near = neighbours(ctx.map, n);
      if (!foes.some((f) => near.has(f))) continue;
      const p = 0.01 * profile.interventionism * (Math.abs(lean) / 100) * escalationPull;
      if (!ctx.rng.chance(p)) continue;
      joinSide(world, ctx, s, war, n, side, 'enters the war', 'aggressor');
      for (const victim of foes) cascade(world, s, alliances, war, victim, n);
    }
  }
}

/** A third of the homeland overrun or the capital fallen. Estimate; France had lost about that when Italy struck. */
const collapsing = (a: Assessment | undefined) => !!a && (a.capitalLost || a.popLost >= 1 / 3);

function meanOpinion(world: World, n: NationId, side: NationId[]): number {
  let sum = 0;
  for (const m of side) sum += relation(world, n, m).opinion;
  return side.length ? sum / side.length : 0;
}

/** End hostilities between a and b; drop nations from wars once they fight no one on the other side. */
export function makePeace(world: World, ctx: SimContext, s: DiplomacyState, a: NationId, b: NationId, terms: string): void {
  if (!atWar(world, a, b)) return;
  const r = setAtWar(world, a, b, false);
  r.escalation = 'crisis';
  r.warSince = undefined;
  delete s.offers[relationKey(a, b)];
  ctx.emit({ type: 'peace', tick: world.tick, a, b, terms });
  for (const war of s.wars)
    for (const side of [0, 1] as const)
      war.sides[side] = war.sides[side].filter((n) => war.sides[1 - side].some((e) => atWar(world, n, e)));
  s.wars = s.wars.filter((w) => w.sides[0].length && w.sides[1].length);
  s.joins = s.joins.filter((j) => s.wars.some((w) => w.id === j.war));
  for (const n of [a, b]) {
    const nation = world.nations[n];
    if (nation.status === 'war' && !s.wars.some((w) => sideOf(w, n) !== -1)) {
      nation.status = 'peace';
      s.records[n].enteredTick = -1;
    }
  }
}

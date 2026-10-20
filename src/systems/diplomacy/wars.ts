import { atWar, relation, relationKey, relationMut, type SimContext } from '../../core/engine';
import { ESCALATION, type EscalationLevel, type NationId, type World } from '../../core/types';
import { DEFAULT_PROFILE, type AllianceTreaty, type DiplomacyState, type PendingJoin, type StrategicProfile, type War } from './types';

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
  const r = relationMut(world, by, on);
  r.atWar = true;
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
 * Intra-alliance wars (Greece-Turkey in NATO) trigger nothing.
 */
function cascade(world: World, s: DiplomacyState, alliances: readonly AllianceTreaty[], war: War, victim: NationId, aggressor: NationId): void {
  const side = sideOf(war, victim) as 0 | 1;
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

/** Resolve treaty obligations that have come due. */
export function resolveJoins(world: World, ctx: SimContext, s: DiplomacyState, alliances: readonly AllianceTreaty[], profiles: Readonly<Record<string, StrategicProfile>>): void {
  const due = s.joins.filter((j) => j.dueTick <= world.tick);
  if (!due.length) return;
  s.joins = s.joins.filter((j) => j.dueTick > world.tick);
  for (const j of due) {
    const war = s.wars.find((w) => w.id === j.war);
    if (!war || sideOf(war, j.victim) !== j.side || sideOf(war, j.nation) !== -1) continue;
    if (world.nations[j.victim].status === 'capitulated' || world.nations[j.nation].status === 'capitulated') continue;
    const treaty = alliances.find((t) => t.id === j.treaty)!;
    const p = j.kind === 'ambiguous' ? ambiguousResolve(world, profiles[j.nation] ?? DEFAULT_PROFILE, j) : treaty.members[j.nation].reliability;
    if (ctx.rng.chance(p)) {
      joinSide(world, ctx, s, war, j.nation, j.side, `${j.treaty}: defence of ${j.victim}`, 'joined');
    } else {
      const r = relationMut(world, j.nation, j.victim);
      r.opinion = Math.max(-100, r.opinion - 30);
      ctx.emit({ type: 'message', tick: world.tick, nation: j.nation, text: `${j.nation} declines to honour ${j.treaty} for ${j.victim}` });
    }
  }
}

/**
 * Neutrals with a strong lean toward one side may enter later, more readily as
 * the war escalates. Evaluated once a day per profiled nation.
 */
export function neutralEntry(world: World, ctx: SimContext, s: DiplomacyState, alliances: readonly AllianceTreaty[], profiles: Readonly<Record<string, StrategicProfile>>): void {
  for (const war of [...s.wars]) {
    let peak = 0;
    for (const a of war.sides[0]) for (const b of war.sides[1]) peak = Math.max(peak, rung(relation(world, a, b).escalation));
    const escalationPull = 1 + Math.max(0, peak - rung('conventional'));
    for (const [n, profile] of Object.entries(profiles) as [NationId, StrategicProfile][]) {
      const nation = world.nations[n];
      if (!nation || nation.status !== 'peace' || sideOf(war, n) !== -1) continue;
      if (s.joins.some((j) => j.nation === n && j.war === war.id)) continue;
      const lean = meanOpinion(world, n, war.sides[0]) - meanOpinion(world, n, war.sides[1]);
      if (Math.abs(lean) < 100) continue;
      const p = 0.01 * profile.interventionism * (Math.abs(lean) / 100) * escalationPull;
      if (!ctx.rng.chance(p)) continue;
      const side: 0 | 1 = lean > 0 ? 0 : 1;
      joinSide(world, ctx, s, war, n, side, 'enters the war', 'aggressor');
      for (const victim of war.sides[1 - side]) cascade(world, s, alliances, war, victim, n);
    }
  }
}

function meanOpinion(world: World, n: NationId, side: NationId[]): number {
  let sum = 0;
  for (const m of side) sum += relation(world, n, m).opinion;
  return side.length ? sum / side.length : 0;
}

/** End hostilities between a and b; drop nations from wars once they fight no one on the other side. */
export function makePeace(world: World, ctx: SimContext, s: DiplomacyState, a: NationId, b: NationId, terms: string): void {
  if (!atWar(world, a, b)) return;
  const r = relationMut(world, a, b);
  r.atWar = false;
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

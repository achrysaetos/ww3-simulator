import { atWar, relation, relationKey, relationMut, setAtWar, type SimContext } from '../../core/engine';
import type { GameMap } from '../../core/map';
import { ESCALATION, type DeclaredAim, type EscalationLevel, type NationId, type NodeId, type World } from '../../core/types';
import { isOverseas } from '../../data/territories';
import { clearTreatyAnswer, delegated, treatyAnswer } from '../orders';
import { answeringAim, declaredAim } from './aims';
import { neighbours } from './assess';
import { settle } from './terms';
import { DEFAULT_PROFILE, type AllianceTreaty, type Assessment, type DiplomacyState, type PendingJoin, type Settlement, type Side, type StrategicProfile, type War } from './types';

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

export const members = (side: Side) => Object.keys(side.members) as NationId[];

export function sideOf(war: War, n: NationId): 0 | 1 | -1 {
  return n in war.sides[0].members ? 0 : n in war.sides[1].members ? 1 : -1;
}

/** The side `n` fights on in `war`. */
export function sideWith(war: War, n: NationId): Side | undefined {
  const i = sideOf(war, n);
  return i === -1 ? undefined : war.sides[i];
}

/** The war in which `a` and `b` fight on opposite sides. */
export function warBetween(s: DiplomacyState, a: NationId, b: NationId): War | undefined {
  return s.wars.find((w) => sideOf(w, a) !== -1 && sideOf(w, b) === 1 - sideOf(w, a));
}

/** Defence spending, which decides who leads a coalition. */
const weight = (world: World, n: NationId) => world.nations[n].stats.milexUsd ?? 0;

/** The member with the largest defence budget; the longest-serving breaks ties. */
function strongest(world: World, side: Side): NationId {
  const all = members(side);
  let best = all[0];
  for (const m of all) if (weight(world, m) > weight(world, best)) best = m;
  return best;
}

function addMember(world: World, s: DiplomacyState, war: War, n: NationId, side: 0 | 1, via: string, defends?: NationId): void {
  if (sideOf(war, n) !== -1) return;
  const at = war.sides[side];
  at.members[n] = defends ? { joined: world.tick, via, defends } : { joined: world.tick, via };
  // A treaty's lead power takes the lead of the side it comes in on: the US in a NATO war over the Baltics.
  if (defends && weight(world, n) > weight(world, at.leader)) at.leader = n;
  s.rev++;
}

/** Put `n` on `side` of `war` and open hostilities with every member of the other side. */
function joinSide(world: World, ctx: SimContext, s: DiplomacyState, war: War, n: NationId, side: 0 | 1, reason: string, mode: keyof typeof RALLY, via: string, defends?: NationId): void {
  addMember(world, s, war, n, side, via, defends);
  enterWar(world, s, n, mode);
  for (const e of members(war.sides[1 - side])) {
    if (world.nations[e].status === 'capitulated') continue;
    if (mode === 'attacked') openHostilities(world, ctx, e, n, reason);
    else openHostilities(world, ctx, n, e, reason);
    enterWar(world, s, e, 'joined');
  }
}

const inBox = (b: { latMin?: number; latMax?: number; lonMin?: number; lonMax?: number }, lat: number, lon: number) =>
  lat >= (b.latMin ?? -90) && lat <= (b.latMax ?? 90) && lon >= (b.lonMin ?? -180) && lon <= (b.lonMax ?? 180);

/** Whether an armed attack on `victim` at `node`, on its territory or (`forces`) on its forces, falls under treaty `t`. */
export function treatyApplies(map: GameMap, t: AllianceTreaty, victim: NationId, node: NodeId, forces: boolean): boolean {
  const territory = !forces && !map.isSea(node) && map.owner[node] === victim;
  if (!t.triggers.includes(territory ? 'territory' : 'forces')) return false;
  if (!t.area) return true;
  if (t.area.homeland && territory && !isOverseas(map, node)) return true;
  return t.area.boxes.some((b) => inBox(b, map.lat[node], map.lon[node]));
}

export interface Diplomacy {
  alliances: readonly AllianceTreaty[];
  profiles: Readonly<Record<string, StrategicProfile>>;
  /** `a|b` for every pair at peace by treaty. */
  peace: ReadonlySet<string>;
}

/**
 * Call the defensive treaties of `victim` that an armed attack by `attacker` at `node` brings
 * into force. A treaty is an obligation to answer an armed attack where it applies, not a
 * declaration: NATO Art. 6 limits Art. 5 to members' territory and forces in Europe, North
 * America and the North Atlantic north of the Tropic of Cancer, so Iran's 1988 clash with the
 * US Navy in the Gulf (Operation Praying Mantis) called no ally. Intra-alliance wars
 * (Greece-Turkey in NATO) trigger nothing. A member at peace by treaty with the attacker is not
 * called: Egypt (1979) and Jordan (1994) stayed out of every Israeli war since. Only a state that
 * was attacked calls its treaties; one that entered the war of its own accord or for an ally has
 * chosen to fight, so the US joining a war over Taiwan does not bring Korea in under its own
 * treaty. The side that started the war is not defended because others came to its victim's aid: CSTO Art. 4 and the
 * 2024 Russia-DPRK treaty cover "armed attack", and Russia invoked neither for Ukraine's backers
 * in 2022-25. Only a serious invasion of its own homeland calls them (see invasions).
 */
function cascade(world: World, ctx: SimContext, s: DiplomacyState, d: Diplomacy, war: War, victim: NationId, attacker: NationId, node: NodeId, forces: boolean, invaded = false): void {
  const side = sideOf(war, victim);
  if (side === -1 || (!invaded && (side === 0 || war.sides[side].members[victim].via !== 'attacked'))) return;
  for (const t of d.alliances) {
    const vm = t.members[victim];
    if (!vm || vm.role === 'guarantor' || t.members[attacker]) continue;
    if (!invaded && !treatyApplies(ctx.map, t, victim, node, forces)) continue;
    const key = `${war.id}|${victim}|${t.id}`;
    if (s.invoked.includes(key)) continue;
    s.invoked.push(key);
    // Allies start deliberating when war is declared on the victim; the call stands once the attack lands.
    const from = invaded ? world.tick : war.sides[side].members[victim].joined;
    for (const [m, terms] of Object.entries(t.members) as [NationId, AllianceTreaty['members'][NationId]][]) {
      if (m === victim || terms.role === 'protected' || !world.nations[m]) continue;
      if (world.nations[m].status === 'capitulated' || sideOf(war, m) !== -1) continue;
      if (d.peace.has(relationKey(m, attacker))) continue;
      if (s.joins.some((j) => j.nation === m && j.war === war.id)) continue;
      s.joins.push({
        nation: m, war: war.id, side, treaty: t.id, kind: t.kind, victim, aggressor: attacker,
        dueTick: Math.max(world.tick, from + Math.ceil((terms.delayDays * 24) / world.dtHours)),
      });
    }
  }
}

/** Nations with active forces at each node, built for one tick's attacks. */
function forcesAt(world: World): Map<number, Set<NationId>> {
  const out = new Map<number, Set<NationId>>();
  for (const f of Object.values(world.formations)) {
    if (f.status !== 'active' && f.status !== 'routed') continue;
    (out.get(f.node) ?? out.set(f.node, new Set()).get(f.node)!).add(f.nation);
  }
  return out;
}

/**
 * Armed attacks this tick between nations on opposite sides of a war, each calling the
 * victim's treaties that cover it: strikes that land on a member's territory or on its forces,
 * captures of its ground, and battles it fought as the defender.
 */
export function treatyCalls(world: World, ctx: SimContext, s: DiplomacyState, d: Diplomacy): void {
  const { map } = ctx;
  let at: Map<number, Set<NationId>> | undefined;
  const attack = (by: NationId, victim: NationId | undefined, node: NodeId, forces: boolean) => {
    if (!victim || victim === by) return;
    const war = warBetween(s, by, victim);
    if (war) cascade(world, ctx, s, d, war, victim, by, node, forces);
  };
  for (const e of world.events) {
    if (e.type === 'strike') {
      if (e.fired <= e.intercepted || e.effects.some((x) => x.kind === 'satellites_destroyed')) continue;
      if (!map.isSea(e.target)) attack(e.by, map.owner[e.target], e.target, false);
      for (const n of (at ??= forcesAt(world)).get(e.target) ?? []) attack(e.by, n, e.target, true);
    } else if (e.type === 'node_captured') {
      attack(e.to, e.from, e.node, false);
    } else if (e.type === 'battle') {
      attack(e.attacker, e.defender, e.node, map.isSea(e.node) || map.owner[e.node] !== e.defender);
    } else if (e.type === 'nuclear_detonation') {
      if (!map.isSea(e.node)) attack(e.by, map.owner[e.node], e.node, false);
      for (const n of (at ??= forcesAt(world)).get(e.node) ?? []) attack(e.by, n, e.node, true);
    }
  }
}

/** Give wars set up outside diplomacy (tests, older saves) a coalition record and war records. */
export function adoptWars(world: World, s: DiplomacyState, enemies: Map<NationId, Set<NationId>>): void {
  for (const [a, foes] of enemies) {
    if ((s.records[a]?.enteredTick ?? -1) < 0) enterWar(world, s, a, 'none');
    for (const b of foes) {
      if (a > b || warBetween(s, a, b)) continue;
      const war = s.wars.find((w) => (sideOf(w, a) === -1) !== (sideOf(w, b) === -1));
      if (!war) {
        s.wars.push({
          id: `w${world.tick}_${a}_${b}`, name: `${a}-${b} war`, since: world.tick, theatre: world.nations[b].capital,
          sides: [
            { leader: a, members: { [a]: { joined: world.tick, via: 'scenario' } }, aim: { kind: 'total' }, gained: world.tick },
            { leader: b, members: { [b]: { joined: world.tick, via: 'scenario' } }, aim: { kind: 'total' }, gained: world.tick },
          ],
        });
        s.rev++;
      } else if (sideOf(war, a) === -1) addMember(world, s, war, a, (1 - sideOf(war, b)) as 0 | 1, 'scenario');
      else addMember(world, s, war, b, (1 - sideOf(war, a)) as 0 | 1, 'scenario');
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

/**
 * `by` goes to war with `on`. Treaties are called later, by the armed attacks that follow (treatyCalls). A new war
 * takes the declarer's aim (stated, or read by declaredAim) and the answering aim for its victim; a nation entering a
 * war already under way fights for that side's aim.
 */
export function declareWar(world: World, ctx: SimContext, s: DiplomacyState, by: NationId, on: NationId, reason: string, aim?: DeclaredAim): void {
  if (by === on || atWar(world, by, on)) return;
  if (!world.nations[by] || !world.nations[on]) return;
  if (world.nations[by].status === 'capitulated' || world.nations[on].status === 'capitulated') return;
  let war = s.wars.find((w) => sideOf(w, on) !== -1 && sideOf(w, by) === -1);
  if (war) {
    joinSide(world, ctx, s, war, by, (1 - sideOf(war, on)) as 0 | 1, reason, 'aggressor', 'declared');
  } else {
    war = s.wars.find((w) => sideOf(w, by) !== -1 && sideOf(w, on) === -1);
    if (war) {
      joinSide(world, ctx, s, war, on, (1 - sideOf(war, by)) as 0 | 1, reason, 'attacked', 'attacked');
    } else {
      const declared = declaredAim(world, ctx.map, by, on, aim);
      war = {
        id: `w${world.tick}_${by}_${on}`, name: `${by}-${on} war`, since: world.tick, theatre: world.nations[on].capital,
        sides: [
          { leader: by, members: { [by]: { joined: world.tick, via: 'declared' } }, aim: declared, gained: world.tick },
          { leader: on, members: {}, aim: answeringAim(declared), gained: world.tick },
        ],
      };
      if (declared.kind !== 'total') ctx.emit({ type: 'message', tick: world.tick, nation: by, text: `${by} declares a ${declared.kind} war on ${on}${declared.kind === 'limited' ? ` for ${declared.claim.length} cells` : ''}` });
      s.wars.push(war);
      s.rev++;
      enterWar(world, s, by, 'aggressor');
      joinSide(world, ctx, s, war, on, 1, reason, 'attacked', 'attacked');
    }
  }
  const rec = s.records[on];
  rec.rally = Math.max(rec.rally, RALLY.attacked);
  rec.rallyTick = world.tick;
  condemn(world, on, by, 20);
}

/**
 * Share of homeland population an enemy must hold before the aggressor's side
 * calls on its treaties. Estimate: the Kursk incursion (Aug 2024, ~0.5% of
 * Russia's population) drew DPRK troops under Russian command but no DPRK
 * declaration of war and no CSTO invocation; a front deep in the homeland would.
 */
const SERIOUS_INVASION = 0.02;

/** The aggressor's coalition calls its treaties once an enemy holds a serious part of a member's homeland. */
export function invasions(world: World, ctx: SimContext, s: DiplomacyState, d: Diplomacy, invadedBy: ReadonlyMap<NationId, NationId>): void {
  for (const war of s.wars) {
    for (const n of members(war.sides[0])) {
      const invader = invadedBy.get(n);
      const a = s.assessment[n];
      if (!invader || sideOf(war, invader) !== 1 || !a) continue;
      if (a.popLost >= SERIOUS_INVASION || a.capitalThreatened) cascade(world, ctx, s, d, war, n, invader, world.nations[n].capital, false, true);
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
export function forcesAbroad(world: World, ctx: SimContext): Set<string> {
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
export function resolveJoins(world: World, ctx: SimContext, s: DiplomacyState, d: Diplomacy): void {
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
    const treaty = d.alliances.find((t) => t.id === j.treaty)!;
    const p = () => j.kind === 'ambiguous'
      ? ambiguousResolve(world, d.profiles[j.nation] ?? DEFAULT_PROFILE, j)
      : shiftOdds(treaty.members[j.nation].reliability, STAKE_LOGIT * stakes(ctx, treaty, j, hosted));
    const lapsed = answer === undefined && !delegated(world, j.nation, 'strategic');
    if (answer ?? (!lapsed && ctx.rng.chance(p()))) {
      joinSide(world, ctx, s, war, j.nation, j.side, `${j.treaty}: defence of ${j.victim}`, 'joined', j.treaty, j.victim);
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
 * against a nuclear power on another's behalf without a treaty since 1945. A human who kept
 * strategic decisions chooses its own wars.
 */
export function neutralEntry(world: World, ctx: SimContext, s: DiplomacyState, d: Diplomacy): void {
  for (const war of [...s.wars]) {
    const sides = [members(war.sides[0]), members(war.sides[1])];
    let peak = 0;
    for (const a of sides[0]) for (const b of sides[1]) peak = Math.max(peak, rung(relation(world, a, b).escalation));
    const escalationPull = 1 + Math.max(0, peak - rung('conventional'));
    const deterred = sides.map((side) => side.some((m) => world.nations[m].nuclear.warheads > 0));
    for (const [n, profile] of Object.entries(d.profiles) as [NationId, StrategicProfile][]) {
      const nation = world.nations[n];
      if (!nation || nation.status !== 'peace' || sideOf(war, n) !== -1 || !delegated(world, n, 'strategic')) continue;
      if (s.joins.some((j) => j.nation === n && j.war === war.id)) continue;
      const lean = meanOpinion(world, n, sides[0]) - meanOpinion(world, n, sides[1]);
      if (Math.abs(lean) < 100) continue;
      const side: 0 | 1 = lean > 0 ? 0 : 1;
      const foes = sides[1 - side];
      if (deterred[1 - side] || !foes.some((f) => collapsing(s.assessment[f]))) continue;
      const near = neighbours(ctx.map, n);
      if (!foes.some((f) => near.has(f))) continue;
      const p = 0.01 * profile.interventionism * (Math.abs(lean) / 100) * escalationPull;
      if (!ctx.rng.chance(p)) continue;
      joinSide(world, ctx, s, war, n, side, 'enters the war', 'aggressor', 'opportunist');
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

/** Whether any war other than `except` still sets `a` against `b`. */
const opposedElsewhere = (s: DiplomacyState, except: War, a: NationId, b: NationId) =>
  s.wars.some((w) => w !== except && sideOf(w, a) !== -1 && sideOf(w, b) === 1 - sideOf(w, a));

function endHostilities(world: World, ctx: SimContext, s: DiplomacyState, war: War, a: NationId, b: NationId, terms: string): void {
  if (!atWar(world, a, b) || opposedElsewhere(s, war, a, b)) return;
  const r = setAtWar(world, a, b, false);
  r.escalation = 'crisis';
  r.warSince = undefined;
  delete s.offers[relationKey(a, b)];
  ctx.emit({ type: 'peace', tick: world.tick, a, b, terms });
}

/** Nations in no war any more go back to peace; their war records close. */
function demobilise(world: World, s: DiplomacyState, nations: Iterable<NationId>): void {
  for (const n of nations) {
    const nation = world.nations[n];
    if (nation.status !== 'war' || s.wars.some((w) => sideOf(w, n) !== -1)) continue;
    nation.status = 'peace';
    s.records[n].enteredTick = -1;
  }
}

function dropWar(s: DiplomacyState, war: War): void {
  s.wars = s.wars.filter((w) => w !== war);
  s.joins = s.joins.filter((j) => j.war !== war.id);
  for (const k of Object.keys(s.offers)) {
    const [a, b] = k.split('|') as [NationId, NationId];
    if (!warBetween(s, a, b)) delete s.offers[k];
  }
  s.rev++;
}

function record(world: World, ctx: SimContext, s: DiplomacyState, war: War, parties: [NationId[], NationId[]], kind: Settlement['kind'], terms: string): void {
  const done = settle(world, ctx.map, war, parties, kind, terms);
  (s.settlements ??= []).push(done);
  if (done.returned.length) ctx.emit({ type: 'message', tick: world.tick, text: `${war.name}: ${done.returned.length} cells handed back under the terms` });
}

/** Peace between the two sides: every member of each stops fighting every member of the other, on the terms recorded. */
export function endWar(world: World, ctx: SimContext, s: DiplomacyState, war: War, terms: string, kind: Settlement['kind'] = 'armistice'): void {
  const [a, b] = [members(war.sides[0]), members(war.sides[1])];
  record(world, ctx, s, war, [a, b], kind, terms);
  dropWar(s, war);
  for (const x of a) for (const y of b) endHostilities(world, ctx, s, war, x, y, terms);
  demobilise(world, s, [...a, ...b]);
}

/** `n` leaves `war` alone, by capitulation or a separate peace; the side fights on under a new leader if `n` led it. */
export function leaveWar(world: World, ctx: SimContext, s: DiplomacyState, war: War, n: NationId, terms: string, kind: Settlement['kind']): void {
  const side = sideOf(war, n);
  if (side === -1) return;
  const own = war.sides[side];
  if (members(own).length === 1) return endWar(world, ctx, s, war, terms, kind);
  const foes = members(war.sides[1 - side]);
  record(world, ctx, s, war, side === 0 ? [[n], foes] : [foes, [n]], kind, terms);
  delete own.members[n];
  s.rev++;
  if (own.leader === n) own.leader = strongest(world, own);
  for (const e of foes) endHostilities(world, ctx, s, war, n, e, terms);
  s.joins = s.joins.filter((j) => !(j.war === war.id && (j.nation === n || j.victim === n)));
  demobilise(world, s, [n]);
}

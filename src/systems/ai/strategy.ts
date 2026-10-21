import { atWar, relation, type SimContext } from '../../core/engine';
import { defineParam } from '../../core/params';
import type { GameMap } from '../../core/map';
import { platformCount } from '../../core/forces';
import type { Command, MunitionId, NationId, NodeId, PlatformId, World } from '../../core/types';
import { NUCLEAR_ALERT, nuclearThreshold, type NuclearAnswer, type NuclearThreshold } from '../../data/nations';
import { neighbours } from '../diplomacy/assess';
import { CITY_POP_SHARE } from '../diplomacy/escalation';
import type { Assessment, DiplomacyState, WarRecord } from '../diplomacy/types';
import { rung } from '../diplomacy/wars';
import { aiMayIssue, delegated } from '../orders';
import type { LaunchWarning, ReleaseRequest } from '../strategic/state';
import { launcherFor, nuclearLaunchers, targetList, type NuclearLauncher } from '../strategic/targeting';
import { isGround } from './forces';
import type { NuclearLadder, Objective, Plan } from './types';

// ---------------------------------------------------------------- war aims

interface Candidates {
  cities: { node: NodeId; value: number }[];
  /** Most populous/industrial cells first. */
  industry: NodeId[];
  ports: NodeId[];
}

const candidateCache = new WeakMap<GameMap, Map<NationId, Candidates>>();

/** Static objective candidates per nation, ranked once per map. */
function candidates(map: GameMap, n: NationId): Candidates {
  let all = candidateCache.get(map);
  if (!all) {
    all = new Map();
    const get = (o: NationId) => all!.get(o) ?? all!.set(o, { cities: [], industry: [], ports: [] }).get(o)!;
    for (let i = 0; i < map.landCount; i++) {
      const c = get(map.owner[i]);
      c.industry.push(i as NodeId);
      if (map.ports[i] > 0) c.ports.push(i as NodeId);
    }
    for (const c of map.cities) get(c.nation).cities.push({ node: c.node, value: Math.min(5, Math.max(0.5, c.pop / 1e6)) });
    for (const c of all.values()) {
      c.industry = c.industry.sort((a, b) => map.popShare[b] - map.popShare[a] || a - b).slice(0, 15);
      c.ports = c.ports.sort((a, b) => map.ports[b] - map.ports[a] || a - b).slice(0, 8);
    }
    candidateCache.set(map, all);
  }
  return all.get(n) ?? { cities: [], industry: [], ports: [] };
}

const MAX_AIMS = 20;

/**
 * What to take: enemy capitals first (decapitation ends wars, cf. capitulation
 * rules in diplomacy), then large cities, industrial cells and ports. Values
 * are relative weights for the operational planner.
 */
export function warAims(p: Plan): Objective[] {
  const { map } = p.ctx;
  const out = new Map<NodeId, number>();
  const add = (n: NodeId, v: number) => out.set(n, Math.max(out.get(n) ?? 0, v));
  for (const e of p.enemies) {
    const held = (n: NodeId) => p.world.control[n] === e;
    const cap = p.world.nations[e].capital;
    if (held(cap)) add(cap, 10);
    const c = candidates(map, e);
    for (const city of c.cities) if (held(city.node)) add(city.node, city.value);
    for (const n of c.industry.filter(held).slice(0, 5)) add(n, 20 * map.popShare[n]);
    for (const n of c.ports.filter(held).slice(0, 3)) add(n, 1);
  }
  return [...out].map(([node, value]) => ({ node, value })).sort((a, b) => b.value - a.value || a.node - b.node).slice(0, MAX_AIMS);
}

// ---------------------------------------------------------------- mobilization

/**
 * Mobilization ordered for the threat a nation faces, read through the economy's
 * defence curve (2% + 48% x level^2 of GDP, src/systems/economy):
 * - existential: an enemy holds 2% of the homeland's people or threatens the capital.
 *   0.8 gives ~33% of GDP; Ukraine spent 34% in 2024 (SIPRI 2025). Its draft pool, not the
 *   level, holds its call-up to the ~25-35k a month the Ukrainian MoD reports.
 * - frontline: an enemy across a land border, or homeland struck at the strategic rung.
 *   0.33 gives ~7.2% of GDP; Russia spent 7.1% in 2024 (SIPRI 2025) while recruiting
 *   ~30k contract soldiers a month, with no general call-up since September 2022.
 * - distant: a war fought abroad. 0.25 gives 5% of GDP, near the US in 1991 and 2003-10
 *   (4.6-4.7%, OMB Historical Tables 3.1).
 * A nation at war never orders less than it already stands at or has ordered: call-ups,
 * contracts and war laws stay in force while the war lasts, as Russia's and Ukraine's
 * have since 2022. A scenario's opening order or war footing is the floor.
 */
const MOBILIZATION = { existential: 0.8, frontline: 0.33, distant: 0.25 } as const;
const INVADED_POP_SHARE = 0.02;

export function mobilizationTarget(a: Assessment | undefined, bordersEnemy: boolean, peakRung: number): number {
  if (a && (a.popLost > INVADED_POP_SHARE || a.capitalThreatened)) return MOBILIZATION.existential;
  if (bordersEnemy || peakRung >= rung('strategic_conventional')) return MOBILIZATION.frontline;
  return MOBILIZATION.distant;
}

// ---------------------------------------------------------------- nuclear release

const DEFAULT_ANSWER: NuclearAnswer = { scale: 'tailored', targets: 'counterforce' };
/** Enemy-held homeland this close to the capital puts the leadership in danger: two cells, one day's advance. */
const CAPITAL_DANGER_KM = 200;

/**
 * Signalling rungs below first use, as shares of the doctrine threshold. Any enemy-held homeland
 * draws a public warning (Russia's "not a bluff" statement of September 2022 after the Kharkiv
 * rout; Pakistan's threats in the 1999 Kargil crisis); half the threshold draws an alert and a
 * non-strategic exercise (Russia's May-June 2024 drill). Estimates of where on the ladder each sits.
 */
const SIGNAL = { warn: 0.25, alert: 0.5 } as const;
/**
 * A warning stands at least this long before first use, so no state goes from silence to release
 * in one step. Estimate: a day, the shortest gap between a public threat and action in the crises
 * above.
 */
const WARNING_HOURS = 24;

/**
 * Rungs of the exchange above first use, as (targets, warheads per target):
 * - limited: one low-yield weapon on enemy forces, the "de-escalation" strike;
 * - answer: a tailored reply in kind, a weapon or two on the attacker's forces in the theatre;
 * - theatre: several weapons on forces across the theatre, once the exchange has begun;
 * - general: the enemy homeland, its nuclear forces and command or its cities by doctrine, at
 *   least a dozen aimpoints and sized to the attack (see generalBudget).
 * Sizes are estimates; the ordering follows Kahn's escalation ladder ("On Escalation", 1965) and
 * the limited / theatre / general distinction of US and Russian planning.
 */
const RUNG = { limited: { targets: 1, warheads: 1 }, answer: { targets: 1, warheads: 2 }, theatre: { targets: 3, warheads: 2 }, general: { targets: 12, warheads: 2 } } as const;
type StrikeSize = (typeof RUNG)[keyof typeof RUNG];
/** Share of its deployed arsenal a state of massive-retaliation doctrine puts into its first general answer, whatever the attack. Estimate. */
const GENERAL_SHARE = 0.25;
/**
 * Warheads a general answer returns per warhead the attack landed on the homeland. Retaliation "inevitable" and in
 * proportion to the damage (Russia's 2024 Fundamentals para. 4; US targeting of hundreds of aimpoints under the 2020
 * Report on Nuclear Employment Strategy): a state answers a large attack with a large one. One for one is an estimate.
 */
const ANSWER_PER_HIT = 1;
/**
 * Smallest attack, as a share of its own deployed warheads, that a launch-on-warning state reads as an attempt to
 * disarm it and launches against. Launch on warning exists for the massive counterforce strike (Blair, "The Logic of
 * Accidental Nuclear War", 1993); a handful of warheads is ridden out and answered on the ladder.
 */
const LAUNCH_ON_WARNING_SHARE = defineParam({
  id: 'ai.LAUNCH_ON_WARNING_SHARE', value: 0.1, range: [0.02, 0.3], tag: 'judgment',
  source: 'judgment: launch on warning answers a disarming strike (Blair 1993)', affects: 'whether a counterforce strike draws a launch on warning',
});
/** A general strike may return to aimpoints already struck when the warheads outnumber them. */
const GENERAL_PASSES = 3;

/** Warheads in a general answer to `fresh` detonations on the homeland. */
function generalBudget(answer: NuclearAnswer, deployed: number, fresh: number): number {
  const floor = RUNG.general.targets * RUNG.general.warheads;
  return Math.max(floor, ANSWER_PER_HIT * fresh, answer.scale === 'massive' ? Math.round(GENERAL_SHARE * deployed) : 0);
}
/** Theatre strikes stay within this distance of the fighting (estimate: the span of Europe or Northeast Asia). */
const THEATRE_KM = 2000;

/** Share of the nation's land and air forces destroyed, measured against the platforms each formation had when first seen. */
function forcesLost(p: Plan): number {
  let base = 0, lost = 0;
  for (const f of Object.values(p.world.formations)) {
    if (f.nation !== p.nation || (!isGround(f) && f.kind !== 'air_wing')) continue;
    const now = platformCount(f);
    const b = (p.ai.baseStrength[f.id] ??= now);
    base += b;
    lost += Math.max(0, b - now);
  }
  return base > 0 ? lost / base : 0;
}

/** How far the fleet's losses have gone toward the naval criteria: the larger of the SSBN, attack-submarine and cruiser ratios. */
function navalLost(p: Plan, t: NonNullable<NuclearThreshold['navalLoss']>): number {
  const base = { ssbn: 0, ssn: 0 }, lost = { ssbn: 0, ssn: 0 };
  let cruisers = 0;
  for (const f of Object.values(p.world.formations)) {
    if (f.nation !== p.nation || (f.kind !== 'submarine' && f.kind !== 'surface_group' && f.kind !== 'strategic')) continue;
    for (const [pid, now] of Object.entries(f.equipment) as [PlatformId, number][]) {
      const cls = p.ctx.catalog.platform(pid).class;
      const k = cls === 'ssbn' ? 'ssbn' : cls === 'ssn' || cls === 'ssgn' ? 'ssn' : cls === 'cruiser' ? 'cruiser' : undefined;
      if (!k) continue;
      const b = (p.ai.baseStrength[`${f.id}/${pid}`] ??= now);
      if (k === 'cruiser') cruisers += Math.max(0, b - now);
      else {
        base[k] += b;
        lost[k] += Math.max(0, b - now);
      }
    }
  }
  const share = (k: 'ssbn' | 'ssn') => (base[k] > 0 ? lost[k] / base[k] : 0);
  return Math.max(share('ssbn') / t.ssbnShare, share('ssn') / t.ssnShare, cruisers / t.cruisers);
}

/**
 * Share of its strategic launchers a conventional attack must destroy before the nation reads it as an attack on its
 * deterrent. Drone strikes destroyed about a tenth of Russia's heavy bombers at Engels, Olenya and Belaya (Operation
 * Spiderweb, June 2025) without a nuclear answer, so the loss of a few airframes does not reach it.
 */
const STRATEGIC_LOSS_SHARE = 0.25;

/** A conventional attack has sunk a ballistic-missile submarine or destroyed a large share of the strategic launchers. */
function strategicForcesHit(p: Plan, rec: WarRecord | undefined): boolean {
  if ((rec?.ssbnLost ?? 0) > 0) return true;
  let base = 0;
  let now = 0;
  for (const f of Object.values(p.world.formations)) {
    if (f.nation !== p.nation || f.kind !== 'strategic') continue;
    const n = platformCount(f);
    base += p.ai.baseStrength[f.id] ??= n;
    now += n;
  }
  return base > 0 && base - now >= STRATEGIC_LOSS_SHARE * base;
}

/** Distance from the capital to the nearest homeland cell an enemy holds; Infinity when it holds none. */
function enemyDepthKm(p: Plan, a: Assessment): number {
  if (a.areaLost <= 0) return Infinity;
  const { map } = p.ctx;
  const cap = p.world.nations[p.nation].capital;
  let best = Infinity;
  for (const n of map.nodesOf(p.nation)) if (p.enemies.has(p.world.control[n])) best = Math.min(best, map.distanceKm(cap, n));
  return best;
}

/**
 * How far past its first-use threshold the war has pushed a nation: 0 short of it, 1 at it, 2 at
 * twice it. Each sourced condition counts on its own (Kidwai's space, military and economic
 * thresholds for Pakistan; the Russian core-loss, force-loss and naval levels), the strongest
 * decides. The capital lost is existential for every state that keeps the option of first use.
 * For a state that treats attacks on its strategic core as a threshold, enemy-held homeland
 * presses in proportion to how close it stands to the capital, reaching the threshold at
 * CAPITAL_DANGER_KM; any enemy-held homeland at all reaches the warning rung.
 */
function nuclearPressure(p: Plan, t: NuclearThreshold, a: Assessment | undefined, rec: WarRecord | undefined): number {
  if (!t.firstUse || !a) return 0;
  let pressure = a.capitalLost ? 2 : 0;
  if (t.coreLossShare !== null) pressure = Math.max(pressure, a.popLost / t.coreLossShare);
  if (t.forceLossShare !== null) pressure = Math.max(pressure, forcesLost(p) / t.forceLossShare);
  if (t.navalLoss) pressure = Math.max(pressure, navalLost(p, t.navalLoss));
  const gdp = p.world.slices.economy?.nations[p.nation]?.gdpIndex;
  if (t.economicLossShare !== null && gdp !== undefined) pressure = Math.max(pressure, (1 - gdp) / t.economicLossShare);
  if (a.areaLost > 0) pressure = Math.max(pressure, SIGNAL.warn);
  if (t.onStrategicAttack && pressure < 1) {
    if (strategicForcesHit(p, rec)) pressure = 1;
    else pressure = Math.max(pressure, Math.min(1, CAPITAL_DANGER_KM / enemyDepthKm(p, a)));
  }
  return pressure;
}

/** Rungs of the first-use ladder: 1 at the threshold, one more for each further half of it. */
const ladderRung = (pressure: number) => (pressure < 1 ? 0 : Math.floor(2 * pressure) - 1);

/** Why the leadership orders its stored warheads mated now; undefined while nothing warrants it. */
function alertReason(p: Plan, t: NuclearThreshold, pressure: number, a: Assessment | undefined, rec: WarRecord | undefined): string | undefined {
  if (rec?.nuclearStruckBy.length) return `nuclear attack by ${rec.nuclearStruckBy[0]}`;
  for (const e of p.enemies) if (p.world.nations[e].nuclear.warheads > 0) return `war with nuclear-armed ${e}`;
  if (a?.capitalThreatened) return 'capital threatened';
  if (pressure >= SIGNAL.alert) return 'first-use threshold approaching';
  if (t.onStrategicAttack && strategicForcesHit(p, rec)) return 'conventional attack on its strategic forces';
  return undefined;
}

/**
 * The signalling rungs: a public warning once the war reaches SIGNAL.warn, and an alert that
 * mates stored warheads when doctrine calls for it. The warning stands before any first use.
 */
function signal(p: Plan, t: NuclearThreshold, ladder: NuclearLadder, pressure: number, a: Assessment | undefined, rec: WarRecord | undefined): void {
  const { world } = p;
  if (t.firstUse && pressure >= SIGNAL.warn && ladder.warnedTick === undefined) {
    ladder.warnedTick = world.tick;
    if (aiMayIssue(world, { type: 'nuclear_alert', nation: p.nation }))
      p.ctx.emit({ type: 'message', tick: world.tick, nation: p.nation, text: `${p.nation} warns ${p.enemies.size > 3 ? 'its enemies' : [...p.enemies].sort().join(', ')} that it will use nuclear weapons if the attack on its territory goes on` });
  }
  const nuclear = world.nations[p.nation].nuclear;
  if (!NUCLEAR_ALERT[p.nation] || nuclear.warheads <= nuclear.deployed || world.slices.strategic?.alerts[p.nation]) return;
  const reason = alertReason(p, t, pressure, a, rec);
  if (reason) p.out.push({ type: 'nuclear_alert', nation: p.nation, reason });
}

/**
 * Cells worth a weapon below the general rung: the heaviest concentrations of `foes`' ground forces
 * (within THEATRE_KM of `centre` when given), on the nation's own soil first, then on ground an enemy holds.
 * Never a city, and never ground a third party holds, whoever stands on it.
 */
function theatreTargets(p: Plan, foes: Set<NationId>, centre?: NodeId): NodeId[] {
  const { map } = p.ctx;
  const at = new Map<NodeId, number>();
  for (const e of foes)
    for (const f of p.index.byNation.get(e) ?? []) {
      if (!isGround(f) || map.isSea(f.node) || map.popShare[f.node] >= CITY_POP_SHARE) continue;
      if (map.owner[f.node] !== p.nation && !p.enemies.has(p.world.control[f.node])) continue;
      if (centre !== undefined && map.distanceKm(f.node, centre) > THEATRE_KM) continue;
      at.set(f.node, (at.get(f.node) ?? 0) + p.index.power(f));
    }
  const own = (n: NodeId) => (map.owner[n] === p.nation ? 0 : 1);
  return [...at].sort((x, y) => own(x[0]) - own(y[0]) || y[1] - x[1] || x[0] - y[0]).map(([n]) => n);
}

/** The enemy homeland by doctrine, each aimpoint once: its cities first for a countervalue state, else its nuclear forces and command first. */
function generalTargets(world: World, ctx: Pick<SimContext, 'map' | 'catalog'>, nation: NationId, foe: NationId, mode: NuclearAnswer['targets']): NodeId[] {
  const forces = targetList(world, ctx, nation, foe, 'counterforce').map((t) => t.node);
  const cities = targetList(world, ctx, nation, foe, 'countervalue').map((t) => t.node);
  return [...new Set(mode === 'countervalue' ? [...cities, ...forces] : [...forces, ...cities])];
}

interface Release {
  target: NodeId;
  munition: MunitionId;
  warheads: number;
}

/**
 * Releases on the candidates some launcher in `launchers` reaches, `perTarget` warheads each, until `budget` is spent:
 * one pass over the list, or up to `passes` when the warheads outnumber the aimpoints. Draws down the launchers' counts.
 */
function allocate(launchers: NuclearLauncher[], map: GameMap, candidates: readonly NodeId[], perTarget: number, budget: number, prefer: 'smallest' | 'largest', passes = 1): Release[] {
  const out: Release[] = [];
  let left = budget;
  for (let pass = 0; pass < passes && left > 0; pass++) {
    const before = left;
    for (const target of candidates) {
      if (left <= 0) break;
      const launcher = launcherFor(launchers, map, target, prefer);
      if (!launcher) continue;
      const warheads = Math.min(perTarget, left, launcher.count);
      launcher.count -= warheads;
      left -= warheads;
      out.push({ target, munition: launcher.munition, warheads });
    }
    if (left === before) break;
  }
  return out;
}

/** Order a strike of `size`, or of `budget` warheads over repeated passes for a general strike. */
function strike(p: Plan, candidates: readonly NodeId[], size: StrikeSize, prefer: 'smallest' | 'largest', budget?: number): void {
  const launchers = nuclearLaunchers(p.world, p.ctx.catalog, p.nation);
  const deployed = p.world.nations[p.nation].nuclear.deployed;
  const plan = budget === undefined
    ? allocate(launchers, p.ctx.map, candidates.slice(0, size.targets), size.warheads, Math.min(deployed, size.targets * size.warheads), prefer)
    : allocate(launchers, p.ctx.map, candidates, size.warheads, Math.min(deployed, budget), prefer, GENERAL_PASSES);
  for (const r of plan) p.out.push({ type: 'nuclear_release', nation: p.nation, ...r });
  if (plan.length) p.ai.nuclear[p.nation].strikes = (p.ai.nuclear[p.nation].strikes ?? 0) + 1;
}

/**
 * Answer each new nuclear attack, near certainly. A state whose doctrine promises massive
 * retaliation, or one whose homeland the attacker hit with a strategic weapon, answers at the general rung against
 * the attacker's homeland, in proportion to the detonations it suffered less what it already launched on warning.
 * Otherwise the answer is tailored: in kind, on the attacker's forces in the theatre of the attack, one weapon pair at
 * first and theatre-wide once the exchange is under way.
 */
function retaliate(p: Plan, t: NuclearThreshold, ladder: NuclearLadder, rec: WarRecord, striker: NationId): void {
  const attacks = rec.nuclearHits + rec.nuclearStruckBy.length;
  if (attacks <= ladder.answered) return;
  const fresh = attacks - ladder.answered;
  ladder.answered = attacks;
  const launched = ladder.launchedOnWarning ?? 0;
  ladder.launchedOnWarning = 0;
  if (!p.ctx.rng.chance(0.9)) return;
  const answer = t.answer ?? DEFAULT_ANSWER;
  const nuclear = p.world.nations[p.nation].nuclear;
  if (answer.scale === 'massive' || rec.strategicStruckBy?.includes(striker)) {
    const budget = generalBudget(answer, nuclear.deployed, fresh) - launched;
    if (budget > 0) strike(p, generalTargets(p.world, p.ctx, p.nation, striker, answer.targets), RUNG.general, 'largest', budget);
    return;
  }
  const centre = rec.lastNuclearNode ?? p.world.nations[p.nation].capital;
  strike(p, theatreTargets(p, new Set([striker]), centre), (ladder.strikes ?? 0) > 0 ? RUNG.theatre : RUNG.answer, 'smallest');
}

/**
 * Launch on warning (the strategic system's hook). A state with that posture, warned that a strike is coming down on
 * its nuclear forces, fires before the warheads land rather than lose its missiles in their silos: Russia keeps the
 * option (SIPRI Yearbook 2024; Putin at Valdai, 18 Oct 2018), and the US keeps its ICBMs on alert to preserve it. It
 * fires every warhead on the launchers under attack, and at least as many as are inbound, at the attacker's homeland
 * per its doctrine. The warning is the victim's own observation of the attack on its territory. A player who keeps
 * the strategic domain decides alone; the warning reaches the UI.
 */
export function launchOnWarning(world: World, w: LaunchWarning, ctx: SimContext): ReleaseRequest[] {
  const nuclear = world.nations[w.victim]?.nuclear;
  if (!nuclear || nuclear.deployed <= 0 || w.inbound < LAUNCH_ON_WARNING_SHARE() * nuclear.deployed || !delegated(world, w.victim, 'strategic')) return [];
  const answer = nuclearThreshold(w.victim).answer ?? DEFAULT_ANSWER;
  const launchers = nuclearLaunchers(world, ctx.catalog, w.victim);
  const struck = new Set(w.targets);
  const threatened = launchers.filter((l) => struck.has(l.node));
  const targets = generalTargets(world, ctx, w.victim, w.attacker, answer.targets);
  const budget = Math.min(nuclear.deployed, Math.max(w.inbound, threatened.reduce((a, l) => a + l.count, 0)));
  const first = allocate(threatened, ctx.map, targets, RUNG.general.warheads, budget, 'largest', GENERAL_PASSES);
  const fired = first.reduce((a, r) => a + r.warheads, 0);
  const plan = [...first, ...allocate(launchers, ctx.map, targets, RUNG.general.warheads, budget - fired, 'largest', GENERAL_PASSES)];
  const total = plan.reduce((a, r) => a + r.warheads, 0);
  const ladder = world.slices.ai?.nuclear;
  if (ladder && total) {
    const own = (ladder[w.victim] ??= { rung: 0, answered: 0 });
    own.launchedOnWarning = (own.launchedOnWarning ?? 0) + total;
  }
  if (total) ctx.emit({ type: 'message', tick: world.tick, nation: w.victim, text: `${w.victim} launches ${total} warheads on warning of ${w.inbound} inbound from ${w.attacker}` });
  return plan.map((r) => ({ nation: w.victim, ...r }));
}

/**
 * Release decisions follow a ladder, not a clock. Each turn the leadership first signals: a
 * warning, then an alert, as the war worsens. Retaliation answers each new nuclear attack (see
 * retaliate). First use is weighed once at each rung: when the war first crosses the doctrine
 * threshold and again each time it worsens by half of it, and only once a warning has stood for
 * WARNING_HOURS. The chance of use grows with the pressure and the leadership's risk tolerance. The
 * first use is a single low-yield weapon on enemy forces, on home soil if possible: the
 * "de-escalation" strike of the Russian literature and of Pakistan's Nasr. A later rung strikes
 * theatre-wide. Targets are only those a launcher holding a warhead reaches.
 */
export function nuclearDecision(p: Plan, d: DiplomacyState | undefined): void {
  const nation = p.world.nations[p.nation];
  if (!d || nation.nuclear.warheads <= 0) return;
  const ladder = (p.ai.nuclear[p.nation] ??= { rung: 0, answered: 0 });
  const rec = d.records[p.nation];
  const a = d.assessment[p.nation];
  const t = nuclearThreshold(p.nation);
  const pressure = nuclearPressure(p, t, a, rec);
  signal(p, t, ladder, pressure, a, rec);
  if (nation.nuclear.deployed <= 0) return;

  const striker = rec?.nuclearStruckBy.find((s) => p.enemies.has(s));
  if (striker) return retaliate(p, t, ladder, rec, striker);

  const rung = ladderRung(pressure);
  if (rung <= ladder.rung) return;
  if (ladder.warnedTick === undefined || (p.world.tick - ladder.warnedTick) * p.world.dtHours < WARNING_HOURS) return;
  ladder.rung = rung;
  const willing = 0.1 + 0.5 * p.profile.riskTolerance;
  if (!p.ctx.rng.chance(1 - (1 - willing) ** pressure)) return;
  strike(p, theatreTargets(p, p.enemies), (ladder.strikes ?? 0) > 0 ? RUNG.theatre : RUNG.limited, 'smallest');
}

// ---------------------------------------------------------------- sanctions

/**
 * Opinion at or below which a state sanctions a nation it watches wage war. In 2022 the US, UK,
 * Canada, Japan, South Korea, Australia, Norway and the EU sanctioned Russia; India, Turkey,
 * Brazil and the Gulf states, on cordial or neutral terms with Moscow, did not.
 */
const SANCTION_OPINION = -30;
/**
 * Blocs with one trade policy. The EU imposes sanctions by Council decision for all members, so a
 * member follows once those holding most of the bloc's GDP are hostile: Italy, Spain and Hungary
 * applied every Russia package from 2022 on.
 */
const TRADE_BLOCS = ['EU'];

function hostile(world: World, from: NationId, to: NationId): boolean {
  return relation(world, from, to).opinion <= SANCTION_OPINION;
}

function blocHostile(world: World, bloc: string, to: NationId): boolean {
  let gdp = 0, against = 0;
  for (const m of Object.values(world.nations)) {
    if (!m.blocs.includes(bloc) || m.id === to) continue;
    gdp += m.stats.gdp ?? 0;
    if (hostile(world, m.id, to)) against += m.stats.gdp ?? 0;
  }
  return gdp > 0 && against > gdp / 2;
}

/**
 * Sanctions every AI nation imposes this pass: on each nation at war, by every AI state not
 * fighting it that is hostile to it, alone or through its trade bloc. Sanctions are not lifted
 * here; Western sanctions on Russia from 2014 and 2022 outlasted every ceasefire.
 */
export function sanctionDecisions(world: World): Command[] {
  const belligerents = new Set<NationId>();
  for (const [k, r] of Object.entries(world.relations)) if (r.atWar) for (const n of k.split('|')) belligerents.add(n as NationId);
  const out: Command[] = [];
  if (!belligerents.size) return out;
  const blocs = new Map<string, boolean>();
  for (const target of belligerents) {
    blocs.clear();
    for (const n of Object.values(world.nations)) {
      if (n.id === target || n.controlledBy !== 'ai' || n.status === 'capitulated' || n.status === 'collapsed') continue;
      if (atWar(world, n.id, target) || relation(world, n.id, target).sanctions) continue;
      const viaBloc = () => n.blocs.some((b) => TRADE_BLOCS.includes(b) && (blocs.get(b) ?? blocs.set(b, blocHostile(world, b, target)).get(b)!));
      if (hostile(world, n.id, target) || viaBloc()) out.push({ type: 'sanction', nation: n.id, target, on: true });
    }
  }
  return out;
}

// ---------------------------------------------------------------- strategy pass

const PEACE_OFFER_BELOW = 0.3;
const PEACE_OFFER_EVERY_DAYS = 7;

export function planStrategy(p: Plan): void {
  const d = p.world.slices.diplomacy as DiplomacyState | undefined;
  const nation = p.world.nations[p.nation];
  p.ai.aims[p.nation] = warAims(p);

  let peak = 0;
  for (const e of p.enemies) peak = Math.max(peak, rung(relation(p.world, p.nation, e).escalation));
  const near = neighbours(p.ctx.map, p.nation);
  const standing = Math.max(nation.mobilization, p.world.slices.economy?.nations[p.nation]?.mobilizationTarget ?? 0);
  const wanted = mobilizationTarget(d?.assessment[p.nation], [...p.enemies].some((e) => near.has(e)), peak);
  // A government asks no more of its people than they will bear, unless the nation is invaded.
  const bears = p.world.slices.politics?.nations[p.nation]?.mobilizationTolerance ?? 1;
  const mob = wanted >= MOBILIZATION.existential ? wanted : Math.min(wanted, bears);
  if (mob > standing + 0.05) p.out.push({ type: 'set_mobilization', nation: p.nation, level: mob });

  nuclearDecision(p, d);

  const lastOffer = p.ai.lastPeaceOffer[p.nation];
  const offerDue = lastOffer === undefined || ((p.world.tick - lastOffer) * p.world.dtHours) / 24 >= PEACE_OFFER_EVERY_DAYS;
  if (nation.warSupport < PEACE_OFFER_BELOW && offerDue) {
    p.ai.lastPeaceOffer[p.nation] = p.world.tick;
    for (const e of p.enemies) p.out.push({ type: 'offer_peace', nation: p.nation, target: e });
  }
}

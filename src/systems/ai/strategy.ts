import { atWar, relation } from '../../core/engine';
import type { GameMap } from '../../core/map';
import { platformCount } from '../../core/forces';
import type { Command, MunitionId, Nation, NationId, NodeId, World } from '../../core/types';
import { strategicProfile, type NuclearThreshold } from '../../data/nations';
import { neighbours } from '../diplomacy/assess';
import type { Assessment, DiplomacyState, WarRecord } from '../diplomacy/types';
import { rung } from '../diplomacy/wars';
import { nuclearLaunchers, weaponFor } from '../strategic/targeting';
import { isGround } from './forces';
import type { Objective, Plan } from './types';

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

/**
 * Doctrine-level thresholds for a state with no sourced NuclearThreshold, so a test world or a
 * scenario nation armed by hand still follows its declared doctrine.
 * - no_first_use (China, India): only in retaliation for a nuclear attack.
 * - escalate_to_deescalate (Russia): conventional aggression threatening the state or attacks
 *   on strategic forces (2020 Basic Principles, 2024 revision).
 * - calculated_ambiguity (US, UK, France): "extreme circumstances" (US NPR 2022).
 */
const DOCTRINE_THRESHOLD: Record<Nation['nuclear']['doctrine'], NuclearThreshold> = {
  no_first_use: { firstUse: false, coreLossShare: null, forceLossShare: null, economicLossShare: null, onStrategicAttack: false, onChemBio: false, coversAllies: false },
  escalate_to_deescalate: { firstUse: true, coreLossShare: 0.1, forceLossShare: null, economicLossShare: null, onStrategicAttack: true, onChemBio: false, coversAllies: false },
  calculated_ambiguity: { firstUse: true, coreLossShare: 0.3, forceLossShare: null, economicLossShare: null, onStrategicAttack: false, onChemBio: false, coversAllies: false },
  none: { firstUse: false, coreLossShare: null, forceLossShare: null, economicLossShare: null, onStrategicAttack: false, onChemBio: false, coversAllies: false },
};
/** Enemy-held homeland this close to the capital puts the leadership in danger: two cells, one day's advance. */
const CAPITAL_DANGER_KM = 200;

function thresholdOf(p: Plan): NuclearThreshold {
  return strategicProfile[p.nation]?.nuclearThreshold ?? DOCTRINE_THRESHOLD[p.world.nations[p.nation].nuclear.doctrine];
}

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

/** A conventional attack has destroyed launchers of the nation's strategic forces. */
function strategicForcesHit(p: Plan, rec: WarRecord | undefined): boolean {
  if ((rec?.ssbnLost ?? 0) > 0) return true;
  for (const f of Object.values(p.world.formations)) {
    if (f.nation !== p.nation || f.kind !== 'strategic') continue;
    const now = platformCount(f);
    if (now < (p.ai.baseStrength[f.id] ??= now)) return true;
  }
  return false;
}

function capitalInDanger(p: Plan): boolean {
  const cap = p.world.nations[p.nation].capital;
  return p.ctx.map.nodesWithin(cap, CAPITAL_DANGER_KM).some((n) => p.ctx.map.owner[n] === p.nation && p.enemies.has(p.world.control[n]));
}

/**
 * How far past its first-use threshold the war has pushed a nation: 0 short of it, 1 at it, 2 at
 * twice it. Each sourced condition counts on its own (Kidwai's space, military and economic
 * thresholds for Pakistan; the Russian core-loss and force-loss levels), the strongest decides.
 * The capital lost is existential for every state that keeps the option of first use.
 */
function nuclearPressure(p: Plan, a: Assessment | undefined, rec: WarRecord | undefined): number {
  const t = thresholdOf(p);
  if (!t.firstUse || !a) return 0;
  let pressure = a.capitalLost ? 2 : 0;
  if (t.coreLossShare !== null) pressure = Math.max(pressure, a.popLost / t.coreLossShare);
  if (t.forceLossShare !== null) pressure = Math.max(pressure, forcesLost(p) / t.forceLossShare);
  const gdp = p.world.slices.economy?.nations[p.nation]?.gdpIndex;
  if (t.economicLossShare !== null && gdp !== undefined) pressure = Math.max(pressure, (1 - gdp) / t.economicLossShare);
  if (pressure < 1 && t.onStrategicAttack && (capitalInDanger(p) || strategicForcesHit(p, rec))) pressure = 1;
  return pressure;
}

/** Rungs of the first-use ladder: 1 at the threshold, one more for each further half of it. */
const ladderRung = (pressure: number) => (pressure < 1 ? 0 : Math.floor(2 * pressure) - 1);

/** Enemy ground concentrations, heaviest first, optionally only those on `onSoilOf`'s homeland. */
function concentrations(p: Plan, of: Set<NationId>, onSoilOf?: NationId): NodeId[] {
  const at = new Map<NodeId, number>();
  for (const e of of)
    for (const f of p.index.byNation.get(e) ?? []) {
      if (!isGround(f) || p.ctx.map.isSea(f.node)) continue;
      if (onSoilOf && p.ctx.map.owner[f.node] !== onSoilOf) continue;
      at.set(f.node, (at.get(f.node) ?? 0) + p.index.power(f));
    }
  return [...at].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([n]) => n);
}

/** The first candidate some launcher holding a nuclear warhead reaches, with the warhead it would use. */
function firstReachable(p: Plan, candidates: Iterable<NodeId>, prefer: 'smallest' | 'largest'): { target: NodeId; munition: MunitionId } | undefined {
  const launchers = nuclearLaunchers(p.world, p.ctx.catalog, p.nation);
  if (!launchers.length) return undefined;
  for (const target of candidates) {
    const munition = weaponFor(launchers, p.ctx.map, target, prefer);
    if (munition) return { target, munition };
  }
  return undefined;
}

/**
 * Release decisions follow a ladder, not a clock. Retaliation answers each new nuclear attack,
 * near certainly. First use is weighed once at each rung: when the war first crosses the doctrine
 * threshold and again each time it worsens by half of it. A leadership that holds, or that no
 * launcher can serve, waits for the next rung. The chance of use grows with the pressure and the
 * leadership's risk tolerance. First use is a single low-yield weapon on enemy forces, on home
 * soil if possible: the battlefield or "de-escalation" strike of the Russian literature and of
 * Pakistan's Nasr. Targets are only those a launcher holding a warhead reaches, so every decision
 * is one the forces can carry out.
 */
export function nuclearDecision(p: Plan, d: DiplomacyState | undefined): void {
  const nation = p.world.nations[p.nation];
  if (!d || nation.nuclear.deployed <= 0 || nation.nuclear.doctrine === 'none') return;
  const ladder = (p.ai.nuclear[p.nation] ??= { rung: 0, answered: 0 });
  const rec = d.records[p.nation];
  const striker = rec?.nuclearStruckBy.find((s) => p.enemies.has(s));

  let option: { target: NodeId; munition: MunitionId } | undefined, warheads = 1;
  if (striker) {
    const attacks = rec.nuclearHits + rec.nuclearStruckBy.length;
    if (attacks <= ladder.answered) return;
    ladder.answered = attacks;
    if (!p.ctx.rng.chance(0.9)) return;
    const foe = p.world.nations[striker];
    if (relation(p.world, p.nation, striker).escalation === 'strategic_nuclear') {
      const cities = p.ctx.map.cities.filter((c) => c.nation === striker).sort((a, b) => b.pop - a.pop).map((c) => c.node);
      option = firstReachable(p, [foe.capital, ...cities], 'largest');
    } else {
      option = firstReachable(p, [...concentrations(p, new Set([striker])), foe.capital], 'smallest');
    }
    warheads = 2;
  } else {
    const pressure = nuclearPressure(p, d.assessment[p.nation], rec);
    const rung = ladderRung(pressure);
    if (rung <= ladder.rung) return;
    ladder.rung = rung;
    const willing = 0.1 + 0.5 * p.profile.riskTolerance;
    if (!p.ctx.rng.chance(1 - (1 - willing) ** pressure)) return;
    option = firstReachable(p, [...concentrations(p, p.enemies, p.nation), ...concentrations(p, p.enemies)], 'smallest');
  }
  if (!option) return;
  p.out.push({ type: 'nuclear_release', nation: p.nation, ...option, warheads: Math.min(warheads, nation.nuclear.deployed) });
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
  const mob = mobilizationTarget(d?.assessment[p.nation], [...p.enemies].some((e) => near.has(e)), peak);
  if (mob > standing + 0.05) p.out.push({ type: 'set_mobilization', nation: p.nation, level: mob });

  nuclearDecision(p, d);

  const lastOffer = p.ai.lastPeaceOffer[p.nation];
  const offerDue = lastOffer === undefined || ((p.world.tick - lastOffer) * p.world.dtHours) / 24 >= PEACE_OFFER_EVERY_DAYS;
  if (nation.warSupport < PEACE_OFFER_BELOW && offerDue) {
    p.ai.lastPeaceOffer[p.nation] = p.world.tick;
    for (const e of p.enemies) p.out.push({ type: 'offer_peace', nation: p.nation, target: e });
  }
}

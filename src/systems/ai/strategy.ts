import { atWar, relation } from '../../core/engine';
import type { GameMap } from '../../core/map';
import type { Command, MunitionId, Nation, NationId, NodeId, World } from '../../core/types';
import { neighbours } from '../diplomacy/assess';
import type { Assessment, DiplomacyState, WarRecord } from '../diplomacy/types';
import { rung } from '../diplomacy/wars';
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

/** Conditions under which a doctrine permits first use; null means retaliation only. */
interface FirstUse {
  popLost?: number;
  capitalThreatened?: boolean;
  capitalLost?: boolean;
  ssbnLost?: boolean;
}

/**
 * - no_first_use (China, India): only in retaliation for a nuclear attack.
 * - escalate_to_deescalate (Russia): the 2020 Basic Principles and the 2024
 *   revision allow use against conventional aggression threatening the state,
 *   or attacks on strategic forces; modelled as capital in danger, a tenth of
 *   the population overrun, or an SSBN lost.
 * - calculated_ambiguity (US, UK, France): "extreme circumstances" (US NPR
 *   2022); modelled as the capital fallen or 30% of the population overrun.
 */
const DOCTRINE: Record<Nation['nuclear']['doctrine'], { firstUse: FirstUse | null; retaliates: boolean }> = {
  no_first_use: { firstUse: null, retaliates: true },
  escalate_to_deescalate: { firstUse: { popLost: 0.1, capitalThreatened: true, ssbnLost: true }, retaliates: true },
  calculated_ambiguity: { firstUse: { popLost: 0.3, capitalLost: true }, retaliates: true },
  none: { firstUse: null, retaliates: false },
};
/** Days between release decisions, so one crisis does not become a salvo every tick. */
const RELEASE_COOLDOWN_DAYS = 2;

function firstUseTriggered(rule: FirstUse, a: Assessment | undefined, rec: WarRecord | undefined): boolean {
  if (!a) return false;
  return (rule.popLost !== undefined && a.popLost >= rule.popLost)
    || (!!rule.capitalThreatened && a.capitalThreatened)
    || (!!rule.capitalLost && a.capitalLost)
    || (!!rule.ssbnLost && (rec?.ssbnLost ?? 0) > 0);
}

function nuclearMunition(p: Plan, smallest: boolean): MunitionId | undefined {
  let best: MunitionId | undefined, bestYield = smallest ? Infinity : -Infinity;
  for (const f of p.index.byNation.get(p.nation) ?? [])
    for (const [id, n] of Object.entries(f.magazine)) {
      if (n <= 0) continue;
      const y = p.ctx.catalog.munitions.get(id as MunitionId)?.yieldKt;
      if (!y) continue;
      if (smallest ? y < bestYield : y > bestYield) { bestYield = y; best = id as MunitionId; }
    }
  return best;
}

/** The heaviest concentration of `of`'s ground forces, optionally only on `onSoilOf`'s homeland. */
function concentration(p: Plan, of: Set<NationId>, onSoilOf?: NationId): NodeId | undefined {
  const at = new Map<number, number>();
  for (const e of of)
    for (const f of p.index.byNation.get(e) ?? []) {
      if (!isGround(f) || p.ctx.map.isSea(f.node)) continue;
      if (onSoilOf && p.ctx.map.owner[f.node] !== onSoilOf) continue;
      at.set(f.node, (at.get(f.node) ?? 0) + p.index.power(f));
    }
  let best: number | undefined, bestP = 0;
  for (const [n, pw] of at) if (pw > bestP) { bestP = pw; best = n; }
  return best as NodeId | undefined;
}

/**
 * Doctrine gates release absolutely; within the gate, retaliation is near
 * certain and first use depends on the leadership's risk tolerance. First use
 * is a single low-yield weapon on enemy forces, on home soil if possible: the
 * "de-escalation" strike the Russian doctrine literature describes.
 */
export function nuclearDecision(p: Plan, d: DiplomacyState | undefined): void {
  const nation = p.world.nations[p.nation];
  const rule = DOCTRINE[nation.nuclear.doctrine];
  if (!d || nation.nuclear.deployed <= 0) return;
  const last = p.ai.lastNuclear[p.nation];
  if (last !== undefined && ((p.world.tick - last) * p.world.dtHours) / 24 < RELEASE_COOLDOWN_DAYS) return;
  const rec = d.records[p.nation];
  const striker = rec?.nuclearStruckBy.find((s) => p.enemies.has(s));

  let target: NodeId | undefined, munition: MunitionId | undefined, warheads = 1;
  if (striker && rule.retaliates) {
    if (!p.ctx.rng.chance(0.9)) return;
    const strategic = relation(p.world, p.nation, striker).escalation === 'strategic_nuclear';
    target = strategic ? p.world.nations[striker].capital : (concentration(p, new Set([striker])) ?? p.world.nations[striker].capital);
    munition = nuclearMunition(p, !strategic);
    warheads = 2;
  } else if (rule.firstUse && firstUseTriggered(rule.firstUse, d.assessment[p.nation], rec)) {
    if (!p.ctx.rng.chance(0.1 + 0.5 * p.profile.riskTolerance)) return;
    target = concentration(p, p.enemies, p.nation) ?? concentration(p, p.enemies);
    munition = nuclearMunition(p, true);
  }
  if (target === undefined || !munition) return;
  p.ai.lastNuclear[p.nation] = p.world.tick;
  p.out.push({ type: 'nuclear_release', nation: p.nation, target, warheads: Math.min(warheads, nation.nuclear.deployed), munition });
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

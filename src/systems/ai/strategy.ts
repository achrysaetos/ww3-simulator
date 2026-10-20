import { relation } from '../../core/engine';
import type { GameMap } from '../../core/map';
import type { Government, MunitionId, Nation, NationId, NodeId } from '../../core/types';
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
 * Peak share of the economy turned to war production. WWII peaks: US ~40% of
 * GDP, UK ~55%, USSR ~60%, Germany ~70% (Harrison, "The Economics of World War
 * II", 1998). Democracies mobilise later and less.
 */
const MOBILIZATION_CAP: Record<Government, number> = {
  liberal_democracy: 0.45, flawed_democracy: 0.5, hybrid: 0.55, monarchy: 0.55,
  authoritarian: 0.6, military_junta: 0.6, theocracy: 0.6, totalitarian: 0.7,
};

export function mobilizationTarget(nation: Nation, a: Assessment | undefined, peakRung: number): number {
  let level = 0.25;
  if ((a?.popLost ?? 0) > 0.02) level += 0.15;
  if (a?.capitalThreatened) level += 0.15;
  if (peakRung >= rung('strategic_conventional')) level += 0.1;
  return Math.min(MOBILIZATION_CAP[nation.government], level);
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

// ---------------------------------------------------------------- strategy pass

const PEACE_OFFER_BELOW = 0.3;
const PEACE_OFFER_EVERY_DAYS = 7;

export function planStrategy(p: Plan): void {
  const d = p.world.slices.diplomacy as DiplomacyState | undefined;
  const nation = p.world.nations[p.nation];
  p.ai.aims[p.nation] = warAims(p);

  let peak = 0;
  for (const e of p.enemies) peak = Math.max(peak, rung(relation(p.world, p.nation, e).escalation));
  const mob = mobilizationTarget(nation, d?.assessment[p.nation], peak);
  if (Math.abs(mob - nation.mobilization) > 0.05) p.out.push({ type: 'set_mobilization', nation: p.nation, level: mob });

  nuclearDecision(p, d);

  const lastOffer = p.ai.lastPeaceOffer[p.nation];
  const offerDue = lastOffer === undefined || ((p.world.tick - lastOffer) * p.world.dtHours) / 24 >= PEACE_OFFER_EVERY_DAYS;
  if (nation.warSupport < PEACE_OFFER_BELOW && offerDue) {
    p.ai.lastPeaceOffer[p.nation] = p.world.tick;
    for (const e of p.enemies) p.out.push({ type: 'offer_peace', nation: p.nation, target: e });
  }
}

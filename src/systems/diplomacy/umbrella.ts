import { atWar, type SimContext } from '../../core/engine';
import type { MunitionId, NationId, NodeId, World } from '../../core/types';
import { believedWorld } from '../intel/view';
import { delegated } from '../orders';
import { nuclearLaunchers, weaponFor } from '../strategic/targeting';
import { CITY_POP_SHARE, nuclearAttacks } from './escalation';
import type { AllianceTreaty, DiplomacyState, UmbrellaCase } from './types';
import { declareWar, raiseEscalation } from './wars';

/**
 * Extended nuclear deterrence: a nuclear attack on an ally draws its nuclear guarantors in.
 *
 * Doctrine: the US 2022 Nuclear Posture Review holds that nuclear use against the US "or its
 * Allies and partners, regardless of location or yield, would fundamentally change the nature of
 * a conflict", and keeps "flexible and tailored" response options rather than a single massive
 * one. The UK would use nuclear weapons "in extreme circumstances of self-defence, including the
 * defence of our NATO Allies" (Integrated Review 2021, Refresh 2023). France's vital interests
 * have "a European dimension" (Macron, Ecole de Guerre, 7 Feb 2020). NATO's 2022 Strategic
 * Concept: any employment of nuclear weapons against the Alliance would change the nature of a
 * conflict. The guarantor therefore always enters the war and raises it to the nuclear rung; after
 * deliberation it either answers in kind with a weapon or two of the lowest yield it can deliver
 * against the attacker's forces in the theatre, never a city, or answers conventionally and holds
 * its nuclear forces back.
 */

/**
 * Hours from the attack to a guarantor's decision: release authority and, for NATO, consultation
 * in the Nuclear Planning Group. Estimate: a presidential decision conference runs in minutes to
 * hours; allied consultation and generating a tailored option, a day.
 */
const DELIBERATION_HOURS = 24;
/**
 * Probability weight of a nuclear answer when the attack was a single tactical weapon on forces
 * rather than a large weapon or a city, relative to the guarantor's treaty reliability. Estimate:
 * the threshold for a tailored nuclear reply is lower the more strategic the attack.
 */
const TACTICAL_ATTACK_WEIGHT = 0.75;
/** A tailored reply stays in the theatre of the attack (estimate: the span of Europe or Northeast Asia). */
const THEATRE_KM = 2000;

/** Guarantors whose nuclear umbrella covers `ally` against `attacker`, with the treaty and the guarantor's reliability under it. */
function umbrellasOver(alliances: readonly AllianceTreaty[], ally: NationId, attacker: NationId) {
  const out: { guarantor: NationId; treaty: string; reliability: number }[] = [];
  for (const t of alliances) {
    if (!t.members[ally] || t.members[attacker]) continue;
    for (const g of t.guarantors ?? []) {
      if (g === ally || g === attacker || !t.members[g] || out.some((o) => o.guarantor === g)) continue;
      out.push({ guarantor: g, treaty: t.id, reliability: t.members[g].reliability });
    }
  }
  return out;
}

/**
 * Open a case for every guarantor of every ally struck by a nuclear weapon this tick. The
 * guarantor enters the war at once if it was not in it, and the dyad climbs to the nuclear rung.
 */
export function openUmbrellaCases(world: World, ctx: SimContext, s: DiplomacyState, alliances: readonly AllianceTreaty[]): void {
  for (const e of nuclearAttacks(world, ctx, s)) {
    const strategic = e.strategic;
    for (const ally of e.victims)
      for (const u of umbrellasOver(alliances, ally, e.by)) {
        const g = world.nations[u.guarantor];
        if (!g || g.status === 'capitulated' || g.nuclear.warheads <= 0) continue;
        const open = s.umbrella.find((c) => c.guarantor === u.guarantor && c.attacker === e.by);
        if (open) {
          open.detonations++;
          open.strategic ||= strategic;
          open.node = e.node;
          continue;
        }
        s.umbrella.push({ guarantor: u.guarantor, attacker: e.by, ally, treaty: u.treaty, reliability: u.reliability, detonations: 1, strategic, node: e.node, dueTick: world.tick + Math.ceil(DELIBERATION_HOURS / world.dtHours) });
        ctx.emit({ type: 'message', tick: world.tick, nation: u.guarantor, text: `extended deterrence: ${e.by} has used a nuclear weapon against ${ally}; ${u.guarantor} weighs its response under ${u.treaty}` });
        declareWar(world, ctx, s, u.guarantor, e.by, `${u.treaty}: nuclear attack on ${ally}`);
        raiseEscalation(world, ctx, u.guarantor, e.by, 'tactical_nuclear');
      }
  }
}

/** The attacker's heaviest force concentration in the theatre that is not in a city and not on ground the guarantor's side holds. */
function theatreTargets(world: World, ctx: SimContext, c: UmbrellaCase): NodeId[] {
  const weight = new Map<NodeId, number>();
  // The attacker's forces as the guarantor's intelligence places them.
  for (const f of Object.values(believedWorld(world, ctx.map, c.guarantor, ctx.catalog).formations)) {
    if (f.nation !== c.attacker || (f.status !== 'active' && f.status !== 'routed') || f.kind === 'space') continue;
    if (ctx.map.distanceKm(f.node, c.node) > THEATRE_KM) continue;
    if (!ctx.map.isSea(f.node)) {
      const holder = world.control[f.node];
      if (ctx.map.popShare[f.node] >= CITY_POP_SHARE || !(holder === c.attacker || atWar(world, c.guarantor, holder))) continue;
    }
    weight.set(f.node, (weight.get(f.node) ?? 0) + f.personnel);
  }
  return [...weight].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([n]) => n);
}

/** The lowest-yield weapon the guarantor can put on the first reachable target: a W76-2 or B61 where it has one, France's ASMPA-R "final warning" where it does not. */
function tailoredOption(world: World, ctx: SimContext, c: UmbrellaCase): { target: NodeId; munition: MunitionId } | undefined {
  const launchers = nuclearLaunchers(world, ctx.catalog, c.guarantor);
  for (const target of theatreTargets(world, ctx, c)) {
    const munition = weaponFor(launchers, ctx.map, target, 'smallest');
    if (munition) return { target, munition };
  }
  return undefined;
}

/**
 * Decide the cases whose deliberation is over. An AI guarantor answers in kind with probability
 * equal to its reliability under the treaty (weighted down for a lone tactical weapon); the first
 * guarantor to answer in kind speaks for the alliance, and the others hold. A human guarantor is
 * told and decides with the nuclear release order.
 */
export function resolveUmbrella(world: World, ctx: SimContext, s: DiplomacyState): void {
  const due = s.umbrella.filter((c) => c.dueTick <= world.tick);
  if (!due.length) return;
  s.umbrella = s.umbrella.filter((c) => c.dueTick > world.tick);
  const answered = new Set<string>();
  for (const c of due) {
    const g = world.nations[c.guarantor];
    if (!g || g.status === 'capitulated' || world.nations[c.attacker]?.status === 'capitulated') continue;
    const say = (text: string) => ctx.emit({ type: 'message', tick: world.tick, nation: c.guarantor, text });
    if (!delegated(world, c.guarantor, 'strategic')) {
      say(`extended deterrence: ${c.attacker}'s nuclear attack on ${c.ally} awaits your response; a nuclear release order is the tailored option`);
      continue;
    }
    const key = `${c.attacker}|${c.ally}`;
    const option = !answered.has(key) && g.nuclear.deployed > 0 && ctx.rng.chance(c.reliability * (c.strategic ? 1 : TACTICAL_ATTACK_WEIGHT)) ? tailoredOption(world, ctx, c) : undefined;
    if (option) {
      answered.add(key);
      const warheads = Math.min(c.strategic || c.detonations > 1 ? 2 : 1, g.nuclear.deployed);
      world.pending.push({ type: 'nuclear_release', nation: c.guarantor, target: option.target, warheads, munition: option.munition });
      const kt = ctx.catalog.munition(option.munition).yieldKt;
      say(`extended deterrence: ${c.guarantor} answers ${c.attacker}'s nuclear attack on ${c.ally} with ${warheads} × ${option.munition} (${kt} kt) on ${c.attacker} forces`);
    } else {
      say(`extended deterrence: ${c.guarantor} answers ${c.attacker}'s nuclear attack on ${c.ally} conventionally and holds its nuclear forces in reserve`);
    }
  }
}

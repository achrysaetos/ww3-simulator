import { atWar, relationKey, relationMut, type SimContext } from '../../core/engine';
import type { EscalationLevel, NationId, World } from '../../core/types';
import type { DiplomacyState, WarRecord } from './types';
import { raiseEscalation } from './wars';

/**
 * Escalation pressure added per event. A dyad moves from 'conventional' to
 * 'strategic_conventional' once pressure reaches STRATEGIC_CONVENTIONAL_AT.
 * Weights are estimates ordered by how directly each event threatens the
 * state itself, following the triggers in Posen, "Inadvertent Escalation"
 * (1991) and the 2020 Russian "Basic Principles" (attacks on critical state
 * and strategic-force sites): a lone deep strike barely registers, a strike on
 * the capital or the loss of an SSBN counts like a dozen of them.
 */
const PRESSURE = {
  homelandStrike: 0.5,
  capitalStrike: 3,
  capitalThreatened: 4,
  ssbnLost: 6,
  /** Per unit of homeland population share occupied by the other party. */
  territoryLost: 10,
} as const;
const STRATEGIC_CONVENTIONAL_AT = 6;

/**
 * A detonation is strategic when it is large or lands on a population centre.
 * 150 kt sits between tactical (B61 low settings, Iskander 10-50 kt) and
 * strategic warheads (W76-2 aside, 100-800 kt); 2% of national population in
 * one cell is roughly a large metropolitan area.
 */
const STRATEGIC_YIELD_KT = 150;
const CITY_POP_SHARE = 0.02;

function addPressure(s: DiplomacyState, a: NationId, b: NationId, amount: number): void {
  const k = relationKey(a, b);
  s.pressure[k] = (s.pressure[k] ?? 0) + amount;
}

function record(s: DiplomacyState, n: NationId): WarRecord {
  return (s.records[n] ??= { baseline: 0.6, rally: 0, rallyTick: 0, enteredTick: -1, casualties: 0, nuclearHits: 0, nuclearStruckBy: [], ssbnLost: 0 });
}

/** Fold this tick's events into escalation pressure and war records, then climb the ladder where warranted. */
export function processEvents(world: World, ctx: SimContext, s: DiplomacyState, enemies: Map<NationId, Set<NationId>>, lostTo: Map<string, number>, prevThreatened: Set<NationId>): void {
  const { map } = ctx;
  const ssbn = new Set<string>(s.ssbnFormations);
  for (const e of world.events) {
    switch (e.type) {
      case 'strike': {
        if (map.isSea(e.target)) break;
        const victim = map.owner[e.target];
        if (!atWar(world, e.by, victim)) break;
        addPressure(s, e.by, victim, e.target === world.nations[victim].capital ? PRESSURE.capitalStrike : PRESSURE.homelandStrike);
        break;
      }
      case 'battle':
        for (const [n, c] of Object.entries(e.casualties) as [NationId, number][]) record(s, n).casualties += c;
        break;
      case 'nuclear_detonation': {
        const land = !map.isSea(e.node);
        const candidates = land ? [map.owner[e.node], world.control[e.node]] : [];
        const victims = candidates.filter((v) => atWar(world, e.by, v));
        if (!victims.length) victims.push(...(enemies.get(e.by) ?? []));
        const strategic = e.yieldKt >= STRATEGIC_YIELD_KT || (land && map.popShare[e.node] >= CITY_POP_SHARE);
        const level: EscalationLevel = strategic ? 'strategic_nuclear' : 'tactical_nuclear';
        for (const v of new Set(victims)) {
          raiseEscalation(world, ctx, e.by, v, level);
          const rec = record(s, v);
          if (!rec.nuclearStruckBy.includes(e.by)) rec.nuclearStruckBy.push(e.by);
          if (land && map.owner[e.node] === v) {
            rec.nuclearHits++;
            rec.casualties += e.casualties;
          }
        }
        // First use shocks every third party that held a view of the user.
        for (const n of Object.keys(world.nations) as NationId[]) {
          if (n === e.by || !world.relations[relationKey(n, e.by)]) continue;
          const r = relationMut(world, n, e.by);
          r.opinion = Math.max(-100, r.opinion - 40);
        }
        break;
      }
      case 'formation_destroyed':
        if (!ssbn.has(e.formation)) break;
        record(s, e.nation).ssbnLost++;
        for (const foe of enemies.get(e.nation) ?? []) addPressure(s, e.nation, foe, PRESSURE.ssbnLost);
        break;
    }
  }

  for (const [n, a] of Object.entries(s.assessment) as [NationId, (typeof s.assessment)[NationId]][]) {
    if (!a.capitalThreatened || prevThreatened.has(n)) continue;
    for (const foe of enemies.get(n) ?? []) addPressure(s, n, foe, PRESSURE.capitalThreatened);
  }

  for (const [k, r] of Object.entries(world.relations)) {
    if (!r.atWar) continue;
    const effective = (s.pressure[k] ?? 0) + PRESSURE.territoryLost * (lostTo.get(k) ?? 0);
    if (effective >= STRATEGIC_CONVENTIONAL_AT) {
      const [a, b] = k.split('|') as NationId[];
      raiseEscalation(world, ctx, a, b, 'strategic_conventional');
    }
  }
}

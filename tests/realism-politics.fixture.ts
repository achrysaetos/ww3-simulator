import { atWar } from '../src/core/engine';
import { platformCount } from '../src/core/forces';
import type { NationId, World } from '../src/core/types';
import { alliances, strategicProfile } from '../src/data/nations';
import { createSession } from '../src/scenarios';

export const NATO = alliances.find((a) => a.id === 'NATO')!.members;
export const CSTO_OTHERS = alliances.find((a) => a.id === 'CSTO')!.members.filter((m) => m !== 'RUS');
/** Europe west of Russia and Belarus, for "China does not fight Europe because of Russia's war". */
export const EUROPE = [...new Set([...NATO.filter((m) => m !== 'USA' && m !== 'CAN' && m !== 'TUR'), ...alliances.find((a) => a.id === 'EU')!.members, 'UKR', 'MDA', 'CHE', 'SRB', 'BIH'])] as NationId[];

export interface Entry { by: NationId; on: NationId; day: number; reason: string }

export interface PoliticsRun {
  world: World;
  entries: Entry[];
  declined: { text: string; day: number }[];
  /** Nuclear detonations, each with whether the user's own data threshold had been crossed by then. */
  nukes: { by: NationId; day: number; thresholdCrossed: boolean }[];
  /** First day each nation had its capital threatened or 2% of its homeland population held by an enemy. */
  seriouslyInvaded: Map<NationId, number>;
}

/**
 * Whether `n` has crossed a first-use condition from its src/data/nations threshold,
 * or been struck by a nuclear weapon (every armed state retaliates).
 */
function thresholdCrossed(world: World, n: NationId): boolean {
  const d = world.slices.diplomacy;
  const t = strategicProfile[n]?.nuclearThreshold;
  const a = d.assessment[n];
  const rec = d.records[n];
  if ((rec?.nuclearStruckBy.length ?? 0) > 0) return true;
  if (!t?.firstUse || !a) return false;
  const gdp = world.slices.economy?.nations[n]?.gdpIndex;
  return a.capitalLost
    || (t.coreLossShare !== null && a.popLost >= t.coreLossShare)
    || (t.forceLossShare !== null && forcesLost(world, n) >= t.forceLossShare)
    || (t.economicLossShare !== null && gdp !== undefined && 1 - gdp >= t.economicLossShare)
    || (t.onStrategicAttack && (a.capitalThreatened || (rec?.ssbnLost ?? 0) > 0));
}

/** Share of land and air platforms destroyed, against the strength the AI first recorded for each formation. */
function forcesLost(world: World, n: NationId): number {
  const seen = world.slices.ai.baseStrength;
  let base = 0, lost = 0;
  for (const f of Object.values(world.formations)) {
    if (f.nation !== n || !(f.kind === 'maneuver' || f.kind === 'artillery' || f.kind === 'air_wing') || seen[f.id] === undefined) continue;
    base += seen[f.id];
    lost += Math.max(0, seen[f.id] - platformCount(f));
  }
  return base > 0 ? lost / base : 0;
}

/** Run a scenario on the full world for `days`, recording who went to war with whom, when and why. */
export function runPolitics(scenario: string, seed: number, days: number): PoliticsRun {
  const s = createSession(scenario, seed);
  const entries: Entry[] = [];
  const declined: PoliticsRun['declined'] = [];
  const nukes: PoliticsRun['nukes'] = [];
  const crossed = new Set<NationId>();
  const seriouslyInvaded = new Map<NationId, number>();
  const ticks = Math.round((days * 24) / s.world.dtHours);
  for (let i = 0; i < ticks; i++) {
    const events = s.engine.step(s.world);
    const day = (s.world.tick * s.world.dtHours) / 24;
    for (const n of Object.keys(s.world.slices.diplomacy.records) as NationId[]) if (thresholdCrossed(s.world, n)) crossed.add(n);
    for (const [n, a] of Object.entries(s.world.slices.diplomacy.assessment))
      if ((a.popLost >= 0.02 || a.capitalThreatened) && !seriouslyInvaded.has(n as NationId)) seriouslyInvaded.set(n as NationId, day);
    for (const e of events) {
      if (e.type === 'war_declared') entries.push({ by: e.by, on: e.on, day, reason: e.reason });
      else if (e.type === 'message' && /declines/.test(e.text)) declined.push({ text: e.text, day });
      else if (e.type === 'nuclear_detonation') nukes.push({ by: e.by, day, thresholdCrossed: crossed.has(e.by) || thresholdCrossed(s.world, e.by) });
    }
  }
  return { world: s.world, entries, declined, nukes, seriouslyInvaded };
}

export const fightsAny = (r: PoliticsRun, n: string, of: readonly string[]) => of.filter((m) => m !== n && atWar(r.world, n as NationId, m as NationId));

export const nukesWithoutThreshold = (r: PoliticsRun, days: number) => r.nukes.filter((n) => n.day <= days && !n.thresholdCrossed);

/** Day `n` first went to war with `foe`, or undefined. */
export function enteredOn(r: PoliticsRun, n: string, foe: string): number | undefined {
  return r.entries.find((e) => (e.by === n && e.on === foe) || (e.by === foe && e.on === n))?.day;
}

export const status = (r: PoliticsRun, n: string) => r.world.nations[n as NationId].status;

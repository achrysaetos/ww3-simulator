import type { NationId, NodeId, PlatformClass, World } from '../../core/types';
import { metric } from '../../forecast/metrics';
import type { StrikeWeaponClass } from '../../metrics';
import { cellDepthKm } from '../../systems/land/state';
import type { CaseRun } from '../types';

export const CREWED_AIRCRAFT: ReadonlySet<string> = new Set(['fighter', 'multirole', 'attack_aircraft', 'bomber', 'stealth_bomber', 'awacs', 'tanker', 'ew_aircraft', 'maritime_patrol', 'transport_aircraft', 'attack_helo', 'transport_helo', 'asw_helo']);
export const MISSILES: readonly StrikeWeaponClass[] = ['cruise_missile', 'ballistic_missile'];
/** Everything that flies at a target, as open-source strike tallies count it (artillery and SAMs left out). */
export const STRIKE_WEAPONS: readonly StrikeWeaponClass[] = ['one_way_drone', 'cruise_missile', 'ballistic_missile', 'glide_bomb', 'air_ordnance'];

/** Weapons `by` fired at targets on ground `on` holds, and how many of them were shot down. */
export function strikesOn(run: CaseRun, by: string, on: string, classes: readonly StrikeWeaponClass[]): { fired: number; intercepted: number } {
  const t = run.metrics.nations[by]?.strikesOn[on];
  let fired = 0, intercepted = 0;
  for (const c of classes) {
    fired += t?.[c]?.fired ?? 0;
    intercepted += t?.[c]?.intercepted ?? 0;
  }
  return { fired, intercepted };
}

/** Crewed aircraft a nation lost in the run, net of replacements. */
export const crewedAircraftLost = (run: CaseRun, n: string) =>
  Object.entries(run.metrics.nations[n]?.lossesByClass ?? {}).reduce((a, [c, k]) => a + (CREWED_AIRCRAFT.has(c) ? (k ?? 0) : 0), 0);

/** Platforms of `classes` knocked out in battle (destroyed, damaged or abandoned), the quantity Oryx counts. */
export const battleLosses = (run: CaseRun, n: string, classes: readonly PlatformClass[]) =>
  classes.reduce((a, c) => a + (run.metrics.nations[n]?.battleLossesByClass[c] ?? 0), 0);

/** Who holds the land cell at a place at the end of the run. */
export const holderAt = (run: CaseRun, lat: number, lon: number): NationId | undefined => run.end.control[run.map.nodeAt(lat, lon)];

/** Area of a land cell in km2. */
const areaKm2 = (run: CaseRun, n: number) => (2 * run.map.halfDeg[n] * 111.32) ** 2 * Math.cos((run.map.lat[n] * Math.PI) / 180);

/**
 * Share of a cell `nation` holds or has pushed across, 0..1. A cell it holds counts less the share an enemy has pushed
 * back across it: a Kursk cell Russia has retaken all but a sliver of is not 1,900 km2 of Ukrainian ground.
 */
function progress(run: CaseRun, control: readonly NationId[], contest: Readonly<Record<number, { by: NationId; km: number }>>, nation: string, n: number): number {
  const c = contest[n];
  const share = c ? Math.min(1, c.km / cellDepthKm(run.map, n as NodeId)) : 0;
  if (control[n] === nation) return c && c.by !== nation ? 1 - share : 1;
  return c?.by === nation ? share : 0;
}

/** Ground `nation` gained, net, in km2, on land `owner` owns, counting partial advances across contested cells. */
export function groundKm2On(run: CaseRun, nation: string, owner: string): number {
  const endContest = run.end.slices.land?.contest ?? {};
  let km2 = 0;
  for (let n = 0; n < run.map.landCount; n++) {
    if (run.map.owner[n] !== owner) continue;
    km2 += (progress(run, run.end.control, endContest, nation, n) - progress(run, run.start.control, run.start.contest, nation, n)) * areaKm2(run, n);
  }
  return km2;
}

/**
 * Land cells `by` took from any of `from`, net of cells it lost back to them. Counted per cell
 * whatever its size, or with `oneDegree` by its share of a 1-degree square, as the realism bands count.
 */
export function netCellsTaken(run: CaseRun, by: string, from: readonly string[], oneDegree = false): number {
  let n = 0;
  for (let i = 0; i < run.map.landCount; i++) {
    const was = run.start.control[i], is = run.end.control[i];
    const cell = oneDegree ? (2 * run.map.halfDeg[i]) ** 2 : 1;
    if (from.includes(was) && is === by) n += cell;
    if (was === by && from.includes(is)) n -= cell;
  }
  return n;
}

/** 1-degree cells that changed hands anywhere (a finer cell counts by its share of a 1-degree square). */
export const territoryChanged = (run: CaseRun) => metric('territory_changed').measure({ map: run.map, start: run.start, end: run.end, casualties: {}, days: run.days });

/** Nations at war at the end other than `principals`: who joined. */
export function joiners(world: World, principals: readonly string[]): string[] {
  const out = new Set<string>();
  for (const [k, r] of Object.entries(world.relations)) {
    if (!r.atWar) continue;
    for (const n of k.split('|')) if (!principals.includes(n)) out.add(n);
  }
  return [...out].sort();
}

/** Civilians the civil system counts as killed in `n` since the run opened. */
export const civiliansKilled = (world: World, n: string) => world.slices.civil?.nations[n as NationId]?.killed ?? 0;

/** A ratio that stays finite when the denominator is zero. */
export const ratio = (a: number, b: number) => a / Math.max(b, 1);

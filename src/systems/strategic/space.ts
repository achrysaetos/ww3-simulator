import { atWar, type SimContext } from '../../core/engine';
import { platformCount } from '../../core/forces';
import type { Formation, NationId, PlatformId, World } from '../../core/types';
import { SAT_CLASSES, type SatClass, type SatCount } from './state';
import { ASAT_PK, COLLISION_RATE, DEBRIS_EXPOSURE, DEBRIS_LIFE_YEARS, FRAGMENTS_PER_COLLISION, FRAGMENTS_PER_KILL } from './tables';

const HOURS_PER_YEAR = 8766;
const isSat = (cls: string): cls is SatClass => (SAT_CLASSES as readonly string[]).includes(cls);

function countsOf(world: World, nation: NationId): Record<SatClass, SatCount> {
  return (world.slices.strategic.space[nation] ??= {
    recon_satellite: { alive: 0, lost: 0 }, nav_satellite: { alive: 0, lost: 0 }, comms_satellite: { alive: 0, lost: 0 },
  });
}

/** Refresh live satellite counts from the space formations; losses accumulate so the pre-war baseline is alive + lost. */
export function countSatellites(world: World, ctx: SimContext, spaceFormations: Formation[]): void {
  for (const c of Object.values(world.slices.strategic.space)) for (const k of SAT_CLASSES) c[k].alive = 0;
  for (const f of spaceFormations) {
    if (f.status === 'destroyed') continue;
    for (const [pid, n] of Object.entries(f.equipment)) {
      const cls = ctx.catalog.platform(pid as PlatformId).class;
      if (isSat(cls)) countsOf(world, f.nation)[cls].alive += n;
    }
  }
}

function loseSatellites(world: World, ctx: SimContext, f: Formation, pid: PlatformId, n: number): void {
  if (n <= 0) return;
  f.equipment[pid] -= n;
  const cls = ctx.catalog.platform(pid).class;
  if (isSat(cls)) {
    const c = countsOf(world, f.nation)[cls];
    c.alive = Math.max(0, c.alive - n);
    c.lost += n;
  }
  if (Object.values(f.equipment).every((v) => v <= 0)) {
    f.status = 'destroyed';
    ctx.emit({ type: 'formation_destroyed', tick: world.tick, formation: f.id, nation: f.nation });
  }
}

/**
 * Direct-ascent ASAT engagements. A formation holding `asat` launchers with a strike order whose targetFormation is
 * an enemy space formation fires one interceptor per launcher per tick. Each kill shatters a satellite into debris.
 */
export function resolveAsat(world: World, ctx: SimContext, shooters: Formation[]): void {
  for (const f of shooters) {
    const target = f.order.targetFormation && world.formations[f.order.targetFormation];
    if (f.order.posture !== 'strike' || !target || target.kind !== 'space' || target.status === 'destroyed' || !atWar(world, f.nation, target.nation)) continue;
    let launchers = 0, munition: keyof typeof f.magazine | undefined;
    for (const [pid, n] of Object.entries(f.equipment)) {
      const p = ctx.catalog.platform(pid as PlatformId);
      if (p.class !== 'asat' || n <= 0) continue;
      launchers += n;
      munition ??= p.loadout.find((l) => (f.magazine[l.munition] ?? 0) > 0)?.munition;
    }
    if (!munition) continue;
    const shots = Math.min(launchers, f.magazine[munition], platformCount(target));
    f.magazine[munition] -= shots;
    let kills = 0;
    for (let i = 0; i < shots; i++) {
      const sats = Object.entries(target.equipment).filter(([, n]) => n > 0);
      if (sats.length === 0) break;
      if (!ctx.rng.chance(ASAT_PK)) continue;
      const pid = ctx.rng.pick(sats)[0] as PlatformId;
      loseSatellites(world, ctx, target, pid, 1);
      world.slices.strategic.debris += FRAGMENTS_PER_KILL;
      kills++;
    }
    ctx.emit({ type: 'strike', tick: world.tick, by: f.nation, munition, fired: shots, intercepted: shots - kills, target: target.node, effects: [{ kind: 'satellites_destroyed', count: kills }] });
  }
}

/**
 * Debris collisions (the Kessler mechanism): every exposed satellite risks a catastrophic hit in proportion to the
 * fragment count, and each hit adds fragments. Debris decays by atmospheric drag.
 */
export function stepDebris(world: World, ctx: SimContext, spaceFormations: Formation[]): void {
  const s = world.slices.strategic;
  if (s.debris <= 0) return;
  const years = world.dtHours / HOURS_PER_YEAR;
  for (const f of spaceFormations) {
    if (f.status === 'destroyed') continue;
    for (const pid of Object.keys(f.equipment) as PlatformId[]) {
      const cls = ctx.catalog.platform(pid).class;
      if (!isSat(cls)) continue;
      const hits = ctx.rng.binomial(f.equipment[pid], Math.min(1, DEBRIS_EXPOSURE[cls] * COLLISION_RATE * s.debris * years));
      loseSatellites(world, ctx, f, pid, hits);
      s.debris += hits * FRAGMENTS_PER_COLLISION;
    }
  }
  s.debris *= Math.exp(-years / DEBRIS_LIFE_YEARS);
}

function aliveShare(world: World, nation: NationId, cls: SatClass): number | undefined {
  const c = world.slices.strategic.space[nation]?.[cls];
  const base = c ? c.alive + c.lost : 0;
  return base > 0 ? c!.alive / base : undefined;
}

/**
 * Multiplier on a nation's targeting and detection quality from its reconnaissance constellation, 0.6..1. Nations
 * that never had one are calibrated without it and stay at 1. The floor is the ISR that remains with aircraft,
 * drones and ground sensors (estimate).
 */
export function isrFactor(world: World, nation: NationId): number {
  const share = aliveShare(world, nation, 'recon_satellite');
  return share === undefined ? 1 : 0.6 + 0.4 * share;
}

/**
 * Multiplier on guided-weapon CEP from loss of a nation's own navigation constellation, 1..3. JDAM CEP is ~5 m with
 * GPS and ~30 m on INS alone (Boeing); weapons with terminal seekers are unaffected, so the mix averages 3x at worst.
 */
export function cepFactor(world: World, nation: NationId): number {
  const share = aliveShare(world, nation, 'nav_satellite');
  return share === undefined ? 1 : 1 + 2 * (1 - share);
}

/**
 * Strategic system: nuclear forces and their effects, missile defense against ballistic missiles, space (satellites,
 * ASAT, debris), cyber, and nuclear-winter climate. Sole writer of theater.fallout; also writes
 * theater.infrastructure for detonations, EMP and cyber attacks.
 */
import type { SimContext, System } from '../../core/engine';
import type { Formation, NationId, PlatformId, World } from '../../core/types';
import { stepClimate } from './climate';
import { stepCyber } from './cyber';
import { stepFallout } from './fallout';
import { release, resolveSalvos, type LaunchOnWarningHook } from './nuclear';
import { countSatellites, resolveAsat, stepDebris } from './space';
import type { NuclearPosture, StrategicState } from './state';
import { BMD_SYSTEMS, DEFAULT_POSTURE } from './tables';

export type { Burst, LaunchWarning, NuclearPosture, ReleaseRequest, StrategicState } from './state';
export type { LaunchOnWarningHook } from './nuclear';
export { release, detonate, interceptSalvo } from './nuclear';
export { targetList, type Target, type TargetKind, type TargetMode } from './targeting';
export { isrFactor, cepFactor } from './space';
export { globalFoodShock, globalCoolingC } from './climate';
export { falloutDenied } from './fallout';
export { cyberCapability } from './tables';

export interface StrategicOptions {
  /** Consulted when a launch-on-warning nation detects a counterforce strike. Without it nobody launches on warning. */
  onWarning?: LaunchOnWarningHook;
}

function initialState(world: World): StrategicState {
  const posture: Record<NationId, NuclearPosture> = {};
  for (const id of Object.keys(world.nations) as NationId[]) posture[id] = DEFAULT_POSTURE[id] ?? 'ride_out';
  return {
    salvos: [],
    interceptors: Object.fromEntries(BMD_SYSTEMS.map((s) => [s.id, s.interceptors])),
    posture,
    warnings: [],
    fallout: [],
    dose: {},
    killed: {},
    sootTg: 0,
    climateTg: 0,
    space: {},
    debris: 0,
    totals: { detonations: 0, megatons: 0, deaths: 0 },
  };
}

export function setNuclearPosture(world: World, nation: NationId, posture: NuclearPosture): void {
  world.slices.strategic.posture[nation] = posture;
}

export function createStrategic(opts: StrategicOptions = {}): System {
  return {
    id: 'strategic',
    commands: ['nuclear_release'],
    init(world) {
      world.slices.strategic = initialState(world);
    },
    apply(world, cmd, ctx) {
      if (cmd.type === 'nuclear_release') release(world, ctx, cmd);
    },
    step(world, ctx) {
      const { space, asat, byNation } = partition(world, ctx);
      countSatellites(world, ctx, space);
      resolveAsat(world, ctx, asat);
      stepDebris(world, ctx, space);
      resolveSalvos(world, ctx, opts.onWarning);
      stepFallout(world, ctx);
      stepCyber(world, ctx, byNation);
      stepClimate(world);
    },
  };
}

/** One pass over formations: space formations, ASAT shooters, and live formations by nation for cyber C2 attacks. */
function partition(world: World, ctx: SimContext) {
  const space: Formation[] = [], asat: Formation[] = [];
  const byNation = new Map<NationId, Formation[]>();
  for (const f of Object.values(world.formations)) {
    if (f.status === 'destroyed') continue;
    if (f.kind === 'space') space.push(f);
    if (f.order.posture === 'strike' && f.order.targetFormation && Object.keys(f.equipment).some((pid) => ctx.catalog.platform(pid as PlatformId).class === 'asat')) asat.push(f);
    const list = byNation.get(f.nation);
    if (list) list.push(f);
    else byNation.set(f.nation, [f]);
  }
  return { space, asat, byNation };
}

export const strategic: System = createStrategic();

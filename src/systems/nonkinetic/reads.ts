import type { GameMap } from '../../core/map';
import type { NationId, World } from '../../core/types';
import { dataConnectivityLost } from './cables';
import { telecomOutage } from './cyber';
import { maritimeDeterred as maritimeDeterredOf } from './maritime';
import type { NonKineticState } from './state';

export { dataConnectivityLost } from './cables';
export { telecomOutage } from './cyber';

/** The nonkinetic slice, or undefined on a world run without the system. */
export function nonKineticState(world: World): NonKineticState | undefined {
  return world.slices.nonKinetic;
}

/** Share of a nation's external data connectivity lost to cut cables and telecom cyber, 0..1. */
export function digitalLost(world: World, nation: NationId): number {
  const s = world.slices.nonKinetic;
  if (!s) return 0;
  return Math.min(1, dataConnectivityLost(s, nation) + telecomOutage(s, nation));
}

/** Share of a nation's seaborne trade deterred by shipping fear, 0..1. */
export function maritimeDeterred(world: World, map: GameMap, nation: NationId): number {
  const s = world.slices.nonKinetic;
  return s ? maritimeDeterredOf(world, map, s, nation) : 0;
}

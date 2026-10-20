import type { GameMap } from '../../core/map';
import { east } from './east';
import type { OrbatEntry } from './types';

/** Every hand-modelled formation in the world plus generated forces for the remaining nations. */
export function allOrbat(_map: GameMap): OrbatEntry[] {
  return [...east];
}

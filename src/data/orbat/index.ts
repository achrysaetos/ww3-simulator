import type { GameMap } from '../../core/map';
import { east } from './east';
import { rest } from './rest';
import { generatedOrbat } from './rest/generate';
import type { OrbatEntry } from './types';
import { west } from './west';

/** Hand-modelled formations for every nation that has them, generated forces for the rest. */
export function allOrbat(map: GameMap): OrbatEntry[] {
  const hand = [...west, ...east, ...rest];
  return [...hand, ...generatedOrbat(map, new Set(hand.map((e) => e.nation)))];
}

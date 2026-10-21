import type { GameMap } from '../../core/map';
import { east } from './east';
import { rest } from './rest';
import { generatedOrbat } from './rest/generate';
import type { OrbatEntry } from './types';
import { west } from './west';

const MODULES: Record<string, readonly OrbatEntry[]> = { west, east, rest };

/**
 * Hand-modelled formations for every nation that has them, generated forces for the rest.
 * Each nation belongs to one module; a nation in two would field both forces at once.
 */
export function allOrbat(map: GameMap): OrbatEntry[] {
  const owner = new Map<string, string>();
  for (const [module, entries] of Object.entries(MODULES))
    for (const e of entries) {
      const prev = owner.get(e.nation);
      if (prev && prev !== module) throw new Error(`${e.nation} is modelled in both orbat/${prev} and orbat/${module}`);
      owner.set(e.nation, module);
    }
  const hand = Object.values(MODULES).flat();
  return [...hand, ...generatedOrbat(map, new Set(owner.keys()))];
}

import type { Echelon, FormationKind } from '../../../core/types';
import type { OrbatEntry } from '../types';
import type { KitId, MunitionKitId } from './kit';

export type Base = OrbatEntry['base'];
export type Kit = Partial<Record<KitId, number>>;
export type Extra = Partial<Pick<OrbatEntry, 'personnel' | 'readiness' | 'experience' | 'territorial'>> & {
  extraMagazine?: Partial<Record<MunitionKitId, number>>;
  /** Overrides the nation-level source for this one entry. */
  source?: string;
};

export const base = (name: string, lat: number, lon: number): Base => ({ name, lat, lon });

/**
 * Entry builder bound to one nation and its default source line. Equipment keys
 * are checked against the kit registry at compile time, so a typo is a type error
 * rather than a silent zero in the simulation.
 */
export function nation(iso3: string, source: string, defaults: Extra = {}) {
  return (kind: FormationKind, echelon: Echelon, name: string, at: Base, equipment: Kit, extra: Extra = {}): OrbatEntry => {
    const { extraMagazine, ...rest } = { ...defaults, ...extra };
    return {
      nation: iso3,
      name,
      kind,
      echelon,
      base: at,
      equipment: equipment as Record<string, number>,
      ...rest,
      ...(extraMagazine ? { extraMagazine: extraMagazine as Record<string, number> } : {}),
      source: rest.source ?? source,
    };
  };
}

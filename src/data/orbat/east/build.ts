import type { Echelon, FormationKind } from '../../../core/types';
import type { OrbatEntry } from '../types';

/** Equipment counts keyed by catalog platform id. */
export type Kit = Record<string, number>;
export type Base = OrbatEntry['base'];
export type Extra = Pick<OrbatEntry, 'personnel' | 'readiness' | 'experience' | 'extraMagazine' | 'source' | 'airborne'>;

export const at = (name: string, lat: number, lon: number): Base => ({ name, lat, lon });

/** Scales a table-of-organisation kit to a unit's estimated current strength. Zero rows are dropped. */
export function scale(kit: Kit, strength: number): Kit {
  const out: Kit = {};
  for (const [k, v] of Object.entries(kit)) {
    const n = Math.round(v * strength);
    if (n > 0) out[k] = n;
  }
  return out;
}

/** Splits `total` platforms across types by share, e.g. a brigade's tank park of T-72B3 and refurbished T-62M. */
export function mix(total: number, shares: Kit): Kit {
  const sum = Object.values(shares).reduce((a, b) => a + b, 0);
  return scale(shares, total / sum);
}

export function merge(...kits: Kit[]): Kit {
  const out: Kit = {};
  for (const k of kits) for (const [id, n] of Object.entries(k)) out[id] = (out[id] ?? 0) + n;
  return out;
}

export function unit(nation: string, name: string, kind: FormationKind, echelon: Echelon, base: Base, equipment: Kit, extra: Extra = {}): OrbatEntry {
  return { nation, name, kind, echelon, base, equipment, ...extra };
}

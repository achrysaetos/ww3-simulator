import type { Echelon, FormationKind } from '../../../core/types';
import type { OrbatEntry } from '../types';
import type { WestMunition, WestPlatform } from './equipment';

export type Kit = Partial<Record<WestPlatform, number>>;
export interface Base { name: string; lat: number; lon: number }

export interface EntryOpts {
  personnel?: number;
  readiness?: number;
  experience?: number;
  extraMagazine?: Partial<Record<WestMunition, number>>;
  territorial?: true;
}

export const base = (name: string, lat: number, lon: number): Base => ({ name, lat, lon });

/** Sum kits, e.g. a brigade template plus attached enablers. */
export function add(...kits: Kit[]): Kit {
  const out: Kit = {};
  for (const k of kits)
    for (const [id, n] of Object.entries(k) as [WestPlatform, number][]) out[id] = (out[id] ?? 0) + n;
  return out;
}

/** Scale a kit for an under- or over-strength unit; counts stay whole platforms. */
export function scale(kit: Kit, f: number): Kit {
  const out: Kit = {};
  for (const [id, n] of Object.entries(kit) as [WestPlatform, number][]) {
    const v = Math.round(n * f);
    if (v > 0) out[id] = v;
  }
  return out;
}

/** Swap one platform for another at the same count (e.g. a brigade still on M1A2 SEPv2). */
export function swap(kit: Kit, from: WestPlatform, to: WestPlatform): Kit {
  const { [from]: n, ...rest } = kit;
  return n ? add(rest, { [to]: n }) : kit;
}

/** Entry factory bound to one nation and its file-level source citation. */
export function forNation(nation: string, source: string) {
  return (name: string, kind: FormationKind, echelon: Echelon, b: Base, equipment: Kit, opts: EntryOpts = {}): OrbatEntry => ({
    nation,
    name,
    kind,
    echelon,
    base: b,
    equipment: equipment as Record<string, number>,
    ...(opts as Pick<OrbatEntry, 'personnel' | 'readiness' | 'experience' | 'extraMagazine' | 'territorial'>),
    source,
  });
}

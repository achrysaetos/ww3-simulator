import type { NationId } from '../../core/types';

/** What the war has done to the people of one land cell. Absent for cells it has not touched. */
export interface CellCivil {
  /** Residents displaced to elsewhere in their own country. */
  idp: number;
  /** Residents who fled abroad. */
  abroad: number;
  /** Civilians killed. */
  killed: number;
  /**
   * Days its residents have lived under fire. Those who would leave go first, so the same
   * danger moves fewer people the longer it lasts.
   */
  exposure: number;
}

export interface CivilNation {
  /** Its people displaced inside the country. */
  idps: number;
  /** Its people sheltering abroad, the sum of `hosted` over hosts. */
  refugees: number;
  /** Civilians killed and injured since the scenario opened. */
  killed: number;
  injured: number;
  /** Its servicemen killed and wounded in battle since the scenario opened, as the battle events count them. Absent in older saves. */
  military?: number;
  /** Its people living in cells an enemy holds, this tick. */
  underOccupation: number;
  /** Partisan sabotage acts against it as an occupier since the scenario opened. */
  sabotage: number;
  /** Days its people have lived with the capital threatened: the national shock of an invasion fades. */
  shockDays: number;
}

export interface CivilState {
  cells: Record<number, CellCivil>;
  nations: Record<NationId, CivilNation>;
  /** Refugees sheltering in each host, keyed `${origin}>${host}`. */
  hosted: Record<string, number>;
  /** The part of `hosted` that arrived recently and may still move on to a further host. */
  transit: Record<string, number>;
  /** Refugees who crossed into each first host since the scenario opened, keyed like `hosted`. */
  crossed: Record<string, number>;
}

declare module '../../core/types' {
  interface Slices {
    civil: CivilState;
  }
}

export const flowKey = (origin: NationId, host: NationId) => `${origin}>${host}`;

export function civilNation(s: CivilState, n: NationId): CivilNation {
  return (s.nations[n] ??= { idps: 0, refugees: 0, killed: 0, injured: 0, underOccupation: 0, sabotage: 0, shockDays: 0 });
}

export function civilCell(s: CivilState, c: number): CellCivil {
  return (s.cells[c] ??= { idp: 0, abroad: 0, killed: 0, exposure: 0 });
}

/** Refugees each host shelters, all origins together. */
export function hostedBy(s: CivilState): Map<NationId, number> {
  const out = new Map<NationId, number>();
  for (const [k, v] of Object.entries(s.hosted)) {
    const host = k.slice(k.indexOf('>') + 1) as NationId;
    out.set(host, (out.get(host) ?? 0) + v);
  }
  return out;
}

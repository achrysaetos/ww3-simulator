import type { Echelon, FormationKind } from '../../core/types';

/**
 * One real-world formation as fielded today. Placed on the map at its home
 * base's coordinates. Equipment keys are catalog platform ids.
 */
export interface OrbatEntry {
  nation: string; // ISO3
  name: string; // e.g. '1st Armored Division', '4th Fighter Wing', 'Carrier Strike Group 12'
  kind: FormationKind;
  echelon: Echelon;
  base: { name: string; lat: number; lon: number };
  equipment: Record<string, number>;
  /** Overrides when known; otherwise derived from equipment. */
  personnel?: number;
  readiness?: number; // 0..1
  experience?: number; // 0..1 (combat-experienced forces such as UKR/RUS 2025 are higher)
  /** Munitions beyond the platforms' standard loadouts, e.g. a missile brigade's reloads. */
  extraMagazine?: Record<string, number>;
  source?: string;
  /** Territorial or home-defence force that fights only on its own nation's soil. */
  territorial?: true;
  /** Parachute or air-assault formation, insertable by air. */
  airborne?: true;
}

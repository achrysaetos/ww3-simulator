/**
 * How the map draws what the player's intelligence holds on a foreign formation: a ring of the
 * fix's error radius around where it was last seen, and the fix's age. Nothing here knows where
 * the formation really is.
 */
import { CURRENT_CONFIDENCE } from '../../systems/intel/view';
import type { FormationView } from '../snapshot';

export type ContactInfo = NonNullable<FormationView['contact']>;

/** Below intel's CURRENT_CONFIDENCE a contact is too old to plan or strike against; it is drawn grey. */
export const isStale = (c: ContactInfo) => c.confidence < CURRENT_CONFIDENCE;

export interface Ring {
  radiusPx: number;
  fill: string;
  stroke: string;
  dash: [number, number];
  width: number;
}

/** Below this an unselected ring would sit under its own counter, so it is not drawn. */
const MIN_RING_PX = 14;
/** A selected contact always shows its ring, at least this big, so the player sees it is an estimate. */
const MIN_FOCUS_RING_PX = 18;

export function contactRing(c: ContactInfo, kmPerPx: number, focused: boolean): Ring | null {
  const r = c.errorKm / kmPerPx;
  const stale = isStale(c);
  if (!focused && r < MIN_RING_PX) return null;
  return {
    radiusPx: Math.max(r, focused ? MIN_FOCUS_RING_PX : 0),
    fill: stale ? 'rgba(143,166,192,0.05)' : focused ? 'rgba(255,77,79,0.10)' : 'rgba(255,77,79,0.06)',
    stroke: stale ? 'rgba(143,166,192,0.55)' : focused ? 'rgba(255,154,155,0.95)' : 'rgba(255,107,94,0.5)',
    dash: focused ? [5, 4] : [3, 4],
    width: focused ? 1.5 : 1,
  };
}

/** "6h", "3d": how long ago the fix was taken. */
export function fixAge(hours: number): string {
  return hours < 48 ? `${Math.max(0, Math.round(hours))}h` : `${Math.round(hours / 24)}d`;
}

/** The label beside a contact: its age once it is not fresh, and for a selected one its error too. */
export function contactLabel(c: ContactInfo, focused: boolean): string | null {
  if (focused) return `seen ${fixAge(c.ageHours)} ago · ±${Math.round(c.errorKm)} km`;
  return c.ageHours >= 2 ? `${fixAge(c.ageHours)} old` : null;
}

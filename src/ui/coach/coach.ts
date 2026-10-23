/**
 * The first-session tour: a few marks that point at the parts of the screen a new commander
 * needs, one sentence each. Shown once per browser; the start screen's settings can bring it back.
 */
import { readPref, writePref, type KeyValue } from '../prefs';

export interface CoachStep {
  id: string;
  /** CSS selector of what the mark points at. */
  target: string;
  title: string;
  text: string;
  /** Key hint shown on the mark. */
  key?: string;
  /** Which side of the target the card sits on. */
  side: 'right' | 'left' | 'below' | 'above' | 'centre';
}

export const COACH_STEPS: readonly CoachStep[] = [
  { id: 'map', target: '[data-testid="map"]', side: 'centre', title: 'This is your war', text: 'Your forces in blue, the enemy in red as your intelligence last saw them. Drag the map to move it, scroll to zoom. Drag one of your counters onto a target to order it.' },
  { id: 'clock', target: '[data-testid="clock"]', side: 'below', key: 'Space', title: 'Time is stopped', text: 'Press Space or pick a speed to run the clock, from one game hour a second up to twenty. Step moves one six-hour turn.' },
  { id: 'staff', target: '[data-testid="drawer-nation"]', side: 'above', key: 'N', title: 'Your staff runs the rest', text: 'Under Nation, take any domain into your own hands or give it back. Your role is only a starting point. A crisis stops the clock and asks you at once.' },
  { id: 'peace', target: '[data-testid="flag-row"]', side: 'below', title: 'Ending it', text: 'Drag your flag onto an enemy\'s to offer peace. The card tells you before you let go whether they would take it, and the Peace dial shows how close they are.' },
];

export const COACH_KEY = 'ww3.coach';

export const coachDue = (store?: KeyValue | null) => readPref(COACH_KEY, store) !== 'done';
export const markCoachDone = (store?: KeyValue | null) => writePref(COACH_KEY, 'done', store);
export const resetCoach = (store?: KeyValue | null) => writePref(COACH_KEY, 'again', store);

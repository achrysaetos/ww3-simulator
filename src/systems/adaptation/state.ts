import type { NationId } from '../../core/types';
import type { PairId } from './tables';

/**
 * One side's measure against one enemy's counter-measure, as a cycle (issue #2, section 3): the enemy
 * notices the measure from its own losses, develops and fields a counter, and once the counter bites the
 * measure's side fields a new generation, which restarts the clock.
 */
export type Duel =
  /** The counter side has not noticed generation `gen` yet; `seen` is what it has lost to it so far. */
  | { stage: 'unnoticed'; gen: number; seen: number }
  /** Noticed: the counter is in development until `fieldFrom`, then reaches units until `fieldTo`, its effect ramping in. */
  | { stage: 'developing'; gen: number; fieldFrom: number; fieldTo: number }
  /** The counter is in service. Once the measure's side sees it bite, its next generation fields at `nextGen`. */
  | { stage: 'fielded'; gen: number; nextGen?: number };

export interface AdaptationState {
  /** Keyed by duelKey: `user` employs the pair's measure against `counter`, who fields the counter-measure. */
  duels: Record<string, Duel>;
}

declare module '../../core/types' {
  interface Slices {
    adaptation: AdaptationState;
  }
}

export const duelKey = (pair: PairId, user: NationId, counter: NationId): string => `${pair}|${user}>${counter}`;

export function parseDuelKey(key: string): { pair: PairId; user: NationId; counter: NationId } {
  const [pair, rest] = key.split('|');
  const [user, counter] = rest.split('>');
  return { pair: pair as PairId, user: user as NationId, counter: counter as NationId };
}

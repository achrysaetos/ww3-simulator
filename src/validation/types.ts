import type { Engine } from '../core/engine';
import type { GameMap } from '../core/map';
import type { World } from '../core/types';
import type { FrontSnapshot } from '../forecast/metrics';
import type { RunMetrics } from '../metrics';

/**
 * How far a case is from the data the model was tuned on (issue #2 section 2).
 * held-out: no constant, band or AI rule cites the event. partly-tuned: some observable of the event
 * was used to set a constant, and the scored questions avoid it where they can. tuned-on: a realism
 * band or a constant is fitted to it, so a good score means "tuned", not "validated".
 */
export type Provenance = 'held-out' | 'partly-tuned' | 'tuned-on';

/**
 * Who stands behind a number. combatant: a party to the fight said it and nobody independent has
 * confirmed it. official: a government figure about its own side's losses or actions. independent:
 * open-source counts, think tanks, international bodies.
 */
export type ClaimTag = 'independent' | 'official' | 'combatant';

export interface Source {
  cite: string;
  tag: ClaimTag;
}

/** What happened, as a range wide enough to hold the sources that disagree. A yes/no outcome is lo = hi = 1 or 0. */
export interface Observed {
  lo: number;
  hi: number;
  sources: readonly Source[];
}

/** What one run leaves for a question to read. */
export interface CaseRun {
  readonly map: GameMap;
  readonly start: FrontSnapshot;
  readonly end: World;
  readonly metrics: RunMetrics;
  readonly days: number;
}

/** One scored question: the model's value per run against what was observed and a naive forecast. */
export interface Question {
  id: string;
  label: string;
  unit: string;
  observed: Observed;
  /** The naive point forecast: persistence ("nothing changes") unless `label` says otherwise. */
  baseline: { value: number; label: string };
  /** Set when this one observable was tuned on although the case as a whole was not. */
  provenance?: Provenance;
  measure(run: CaseRun): number;
}

export interface ValidationCase {
  id: string;
  name: string;
  /** The real event's dates. */
  period: string;
  provenance: Provenance;
  /** Every constant, band or AI rule in the engine that cites this event, or why there is none. */
  contamination: string;
  /** How the engine stands in for the event and what it cannot represent. */
  representation: string;
  days: number;
  /** A ready world for `seed`, opening moves queued. Runs inside the run's param overrides. */
  setup(seed: number): { engine: Engine; world: World; map: GameMap };
  questions: readonly Question[];
}

import type { NationId } from '../../core/types';

/** Each term is a shift in war support, 0 when the driver is absent. */
export interface OpinionDrivers {
  /** Energy prices, lost output and war inflation. */
  economy: number;
  /** The recent casualty rate, on top of the cumulative toll diplomacy counts. */
  losses: number;
  /** Rally round the flag after enemy strikes on the homeland. */
  rally: number;
  /** Refugees it shelters, as a share of its population. */
  refugees: number;
  /** Mobilisation beyond what the public tolerates. */
  mobilization: number;
  /** Elite defection as an autocracy loses its grip. */
  unrest: number;
  /** A government voted out on the war. */
  election: number;
}

export interface ElectionResult {
  date: string;
  kind: 'presidential' | 'legislative' | 'general';
  /** War support or aid support going into the vote. */
  approval: number;
  incumbentWon: boolean;
}

export interface AidPolitics {
  /** Public and legislative backing for the donor's arms aid, 0..1. */
  support: number;
  /** Whether a package is funded: false stops the donor's arms pipelines. */
  continues: boolean;
  /** Tick of the next vote on a package. */
  voteTick: number;
}

export interface PoliticsNation {
  /** Added to the war support diplomacy computes; the sum of `drivers`. */
  supportShift: number;
  drivers: OpinionDrivers;
  /** Military killed and wounded a day, averaged over about a month. */
  lossRate: number;
  /** Last tick an enemy fought it on its own soil: it is defending its homeland. */
  homeFightTick?: number;
  /** Rally from strikes on the homeland, decaying. */
  rally: number;
  /** Highest mobilisation, 0..1, the public bears without protest. */
  mobilizationTolerance: number;
  /** Hold of the regime on power, 0..1; protests begin below PROTEST_BELOW. */
  stability: number;
  protesting: boolean;
  /** Lasting shift in war support from elections lost on the war. */
  mandate: number;
  elections: ElectionResult[];
  /** Present for an arms donor. */
  aid?: AidPolitics;
}

export interface PoliticsState {
  nations: Record<NationId, PoliticsNation>;
  /** Index into the date-sorted election calendar of the next election to hold. */
  nextElection: number;
}

declare module '../../core/types' {
  interface Slices {
    politics: PoliticsState;
  }
}

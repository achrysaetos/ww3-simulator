import type { NationId } from '../../core/types';

/**
 * What a cyber intrusion can reach inside a target nation (tables.ts PAYLOAD). `grid` takes down
 * power at the main load centres (Sandworm, Industroyer2); `telecom` takes down national
 * connectivity (Viasat KA-SAT, Kyivstar).
 */
export const CYBER_SECTORS = ['grid', 'telecom'] as const;
export type CyberSector = (typeof CYBER_SECTORS)[number];

/**
 * How deep an attacker is inside one sector of one target. Access is built over months and lost
 * to discovery or to firing a payload: none -> foothold -> persistent, and back down.
 */
export const ACCESS_STAGES = ['none', 'foothold', 'persistent'] as const;
export type AccessStage = (typeof ACCESS_STAGES)[number];

/** One attacker's access into one sector of one target, keyed by accessKey. */
export interface CyberAccess {
  by: NationId;
  on: NationId;
  sector: CyberSector;
  stage: AccessStage;
  /** An intrusion campaign is working toward the next stage. */
  building: boolean;
  /** Days of intrusion work toward the next stage. */
  progressDays: number;
  /** Days held undetected at the current stage. */
  dwellDays: number;
}

/** A state sabotage campaign: covert acts against a target's rail, depots and plant, keyed by pairKey. */
export interface SabotageCampaign {
  by: NationId;
  on: NationId;
  startedTick: number;
  acts: number;
  /** Acts the target has attributed to the attacker, which raise the political cost. */
  attributed: number;
}

/** One cable's state; absent = intact. */
export interface CableState {
  cutTick: number;
  by?: NationId;
  /** Tick a repair ship finishes, once one is on station; absent while queued. */
  repairDoneTick?: number;
}

/** Shipping fear in one sea zone, recomputed every tick from threat and recent attacks. */
export interface ZoneRisk {
  /** 0..1: how dangerous underwriters judge the zone. */
  risk: number;
  /** War-risk premium, percent of hull value per transit. */
  premiumPct: number;
  /** Share of merchant ships that refuse to transit, 0..1. */
  refusing: number;
  /** Attacks on shipping here, decayed: what underwriters remember. */
  attackHeat: number;
}

export interface NonKineticState {
  access: Record<string, CyberAccess>;
  /**
   * National connectivity lost to a telecom cyber payload now, by target; recovers over days. The grid
   * payload instead hits theater.infrastructure once, like a strike, so the economy and C2 read it there.
   */
  outage: Record<NationId, { telecom?: number }>;
  sabotage: Record<string, SabotageCampaign>;
  cables: Record<string, CableState>;
  /** Cut cables waiting for a repair ship, in order cut, by repair region. */
  repairQueue: Record<string, string[]>;
  /** By sea node; zones with no risk are absent. */
  maritime: Record<number, ZoneRisk>;
  /** What armed resistance has cost each occupier, by occupier nation. */
  occupation: Record<NationId, OccupationLedger>;
}

/** The running cost of holding restive territory, for one occupier. */
export interface OccupationLedger {
  /** Resistance attacks against the occupier since the scenario opened. */
  resistanceActs: number;
  /** Treasury spent on security operations in occupied territory, USD billions. */
  costUsdB: number;
}

declare module '../../core/types' {
  interface Slices {
    nonKinetic: NonKineticState;
  }
}

export const accessKey = (by: NationId, on: NationId, sector: CyberSector) => `${by}>${on}:${sector}`;
export const pairKey = (by: NationId, on: NationId) => `${by}>${on}`;

export function emptyState(): NonKineticState {
  return { access: {}, outage: {}, sabotage: {}, cables: {}, repairQueue: {}, maritime: {}, occupation: {} };
}

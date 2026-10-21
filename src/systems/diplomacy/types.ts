import type { FormationId, NationId, NodeId } from '../../core/types';

/**
 * Inputs the nation-profile data supplies. Defined here so diplomacy and AI can
 * be built and tested before src/data/nations lands; the coordinator maps the
 * real tables onto these shapes.
 */

/**
 * How binding a treaty is:
 * - collective_defense: an attack on one is an attack on all (NATO Art. 5, CSTO Art. 4).
 * - bilateral_defense: a defence pact between two parties (US-Japan, US-ROK, China-DPRK).
 * - ambiguous: no written obligation; the guarantor decides at the time (US-Taiwan under the TRA).
 */
export type CommitmentKind = 'collective_defense' | 'bilateral_defense' | 'ambiguous';

/**
 * mutual: defends and is defended. guarantor: defends, is not covered (US under the
 * US-Taiwan understanding). protected: covered, owes nothing (Japan's Art. 5 duty
 * covers only Japanese territory, so it is modelled as protected).
 */
export type TreatyRole = 'mutual' | 'guarantor' | 'protected';

export interface TreatyMember {
  role: TreatyRole;
  /** Probability the member honours the commitment when it comes due, 0..1. Ignored for 'ambiguous'. */
  reliability: number;
  /** Days from the attack until the member's forces are committed (political decision plus deployment order). */
  delayDays: number;
}

export interface AllianceTreaty {
  id: string;
  kind: CommitmentKind;
  members: Record<NationId, TreatyMember>;
  /** Nuclear guarantors: their credibility across every alliance rides on honouring this one. */
  guarantors?: readonly NationId[];
}

/** Strategic personality of a nation's leadership. All fields 0..1. */
export interface StrategicProfile {
  /** How many casualties the public and elite accept before support erodes. */
  casualtyTolerance: number;
  /** Willingness to enter others' wars and to honour ambiguous commitments. */
  interventionism: number;
  /** Willingness to climb the escalation ladder (deep strikes, nuclear first use). */
  riskTolerance: number;
  /** Offensive bias of operational planning. */
  aggression: number;
}

export const DEFAULT_PROFILE: StrategicProfile = { casualtyTolerance: 0.5, interventionism: 0.3, riskTolerance: 0.3, aggression: 0.5 };

export interface DiplomacyInput {
  alliances?: readonly AllianceTreaty[];
  profiles?: Readonly<Record<string, StrategicProfile>>;
}

// ---------------------------------------------------------------- slice

/** A coalition war. Every member of one side is at war with every member of the other. */
export interface War {
  id: string;
  /** Who fired first; defensive treaties never trigger in the aggressor's favour. */
  aggressor: NationId;
  sides: [NationId[], NationId[]];
  startTick: number;
}

export interface PendingJoin {
  nation: NationId;
  war: string;
  side: 0 | 1;
  dueTick: number;
  treaty: string;
  kind: CommitmentKind;
  /** The attacked party the commitment is to. */
  victim: NationId;
  aggressor: NationId;
  /** Set on the second look after a refusal; a second refusal stands. */
  reconsidered?: boolean;
}

/** Battlefield situation of one nation, recomputed each tick from control and events. Read by AI. */
export interface Assessment {
  /** Share of homeland cells held by someone else. */
  areaLost: number;
  /** Share of homeland population/industry held by someone else. */
  popLost: number;
  capitalLost: boolean;
  /** Enemy control or ground forces within two cells (~200 km) of the capital. */
  capitalThreatened: boolean;
}

/** Accumulated war record of a nation; war support is a pure function of it. */
export interface WarRecord {
  /** warSupport when the nation entered the war. */
  baseline: number;
  rally: number;
  rallyTick: number;
  enteredTick: number;
  casualties: number;
  /** Nuclear detonations on its homeland. */
  nuclearHits: number;
  /** Nations that have detonated nuclear weapons on its homeland or forces. */
  nuclearStruckBy: NationId[];
  ssbnLost: number;
  /** Personnel of its ground formations when first assessed in this war; the yardstick for forces still in being. */
  groundAtEntry?: number;
}

/** A nuclear guarantor deciding how to answer a nuclear attack on an ally it covers (see umbrella.ts). */
export interface UmbrellaCase {
  guarantor: NationId;
  attacker: NationId;
  ally: NationId;
  treaty: string;
  /** The guarantor's probability of honouring the treaty, the weight of a nuclear answer. */
  reliability: number;
  detonations: number;
  /** Any of the weapons was large or hit a city. */
  strategic: boolean;
  /** Where the latest weapon hit; the answer stays in that theatre. */
  node: NodeId;
  /** Tick the decision is due, after deliberation and allied consultation. */
  dueTick: number;
}

export interface DiplomacyState {
  wars: War[];
  joins: PendingJoin[];
  records: Record<NationId, WarRecord>;
  assessment: Record<NationId, Assessment>;
  /** Escalation pressure per relationKey; crossing thresholds climbs the ladder. */
  pressure: Record<string, number>;
  /** Open peace offers per relationKey, by offering nation. */
  offers: Record<string, NationId>;
  /** Formations carrying SSBNs, so their loss can be recognised after they are emptied. */
  ssbnFormations: FormationId[];
  /** `${war}|${victim}` pairs whose defensive treaties have been called, so each is called once. */
  invoked: string[];
  /** Open extended-deterrence decisions. */
  umbrella: UmbrellaCase[];
}

declare module '../../core/types' {
  interface Slices {
    diplomacy: DiplomacyState;
  }
}

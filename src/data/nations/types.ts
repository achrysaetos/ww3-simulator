import type { Nation, NationId } from '../../core/types';

export type Doctrine = Nation['nuclear']['doctrine'];

/**
 * What a treaty obliges members to do once triggered. Ordered from strongest to weakest.
 * - collective_defense: an attack on one is an attack on all (NATO Art. 5, CSTO Art. 4).
 * - bilateral_defense: a two-party mutual defense treaty (US-JPN Art. V, CHN-PRK 1961).
 * - ambiguous: a guarantor that may or may not fight (Taiwan Relations Act).
 * - consultation: members confer when threatened (NATO Art. 4, FPDA, Quad); no duty to fight.
 * - none: a political or economic grouping (BRICS, AU, ASEAN) with no security clause.
 */
export const OBLIGATIONS = ['collective_defense', 'bilateral_defense', 'ambiguous', 'consultation', 'none'] as const;
export type Obligation = (typeof OBLIGATIONS)[number];

/** Events that activate a treaty's obligation. */
export type AllianceTrigger =
  /** Armed attack on a member's sovereign (or treaty-administered) territory. */
  | 'attack_on_territory'
  /** Armed attack on a member's armed forces, public vessels or aircraft in the treaty area. */
  | 'attack_on_forces'
  /** Coercion, blockade or threat short of armed attack (consultation clauses). */
  | 'threat_to_security';

/** A latitude/longitude box; an absent bound is open. Longitudes run -180..180, so an area across the antimeridian takes two boxes. */
export interface GeoBox {
  latMin?: number;
  latMax?: number;
  lonMin?: number;
  lonMax?: number;
}

/**
 * Where an armed attack must land for a treaty to apply. `homeland`: anywhere on a member's
 * metropolitan territory (not its overseas territories). `boxes`: anywhere inside them, on a
 * member's territory or its forces.
 */
export interface TreatyArea {
  homeland?: boolean;
  boxes: readonly GeoBox[];
}

/** Two states at peace by treaty or normalisation: neither answers an alliance call to fight the other. */
export interface PeaceTreaty {
  between: readonly [NationId, NationId];
  /** ISO date it holds from (signature); absent, it predates every scenario. */
  inForce?: string;
  source: string;
}

/** A standing commitment to help defend another state's skies without joining its war. */
export interface AirDefencePledge {
  donor: NationId;
  recipient: NationId;
  source: string;
}

export interface Alliance {
  id: string;
  name: string;
  members: NationId[];
  obligation: Obligation;
  triggers: AllianceTrigger[];
  /**
   * How reliably the obligation converts into actual intervention, 0..1, judged from the
   * treaty text (automatic vs. "such action as it deems necessary") and practice.
   * Combine with each member's StrategicProfile.allianceReliability.
   */
  commitment: number;
  /** Nations whose nuclear forces back the guarantee (extended deterrence). */
  nuclearGuarantors?: NationId[];
  /** Where an armed attack must land to call the treaty; absent, anywhere. */
  area?: TreatyArea;
  /** Members the guarantee protects without being bound to defend others (TRA covers TWN; COFA covers FSM/MHL/PLW). */
  protectedOnly?: NationId[];
  /**
   * ISO date the commitment holds from (signature); absent, it predates every scenario. A run dated earlier, such
   * as a historical validation case, does not have it: Turkey owed Azerbaijan nothing in 2020.
   */
  inForce?: string;
  source: string;
}

export interface NuclearForces {
  /** Military stockpile available for use (FAS: stockpile = deployed + reserve). */
  stockpile: number;
  /** Total inventory including retired warheads awaiting dismantlement (FAS headline figure). */
  inventory: number;
  /** Deployed on missiles or at bases with operational forces. */
  deployed: number;
  doctrine: Doctrine;
}

/**
 * When a nuclear state considers first use, per declared or assessed doctrine. A field left
 * null means that condition alone does not trigger use. Every armed state retaliates for a
 * nuclear attack on its territory, so that is not listed.
 */
export interface NuclearThreshold {
  /** Declared or assessed willingness to use first, before an adversary's nuclear use. */
  firstUse: boolean;
  /** Share of national population/industry (popShare) under enemy control that triggers use. */
  coreLossShare: number | null;
  /** Share of the nation's land and air forces destroyed within a month (a collapse, not attrition) that triggers use. */
  forceLossShare: number | null;
  /** Share of national output (the economy's GDP index) lost to blockade, strikes and occupation that triggers use. */
  economicLossShare: number | null;
  /** A conventional attack on strategic forces, NC3, or leadership triggers use. */
  onStrategicAttack: boolean;
  /** Retaliates for chemical or biological attack. */
  onChemBio: boolean;
  /** Extends the threshold to protect allies (its own Alliance.nuclearGuarantors entries). */
  coversAllies: boolean;
  /** Naval losses that trigger use: shares of SSBNs and of attack submarines sunk, or a count of cruisers. */
  navalLoss?: { ssbnShare: number; ssnShare: number; cruisers: number };
  /** How it answers a nuclear attack. Default: tailored and counterforce. */
  answer?: NuclearAnswer;
}

/**
 * How a state answers a nuclear attack on it.
 * - scale 'tailored': in kind, in the theatre of the attack, one rung of the ladder at a time
 *   (limited, then theatre, then general); 'massive': straight to a general strike.
 * - targets: what a general strike on the enemy homeland aims at, its nuclear forces and command
 *   (counterforce) or its cities (countervalue).
 */
export interface NuclearAnswer {
  scale: 'tailored' | 'massive';
  targets: 'counterforce' | 'countervalue';
}

export const WAR_AIMS = [
  'regime_survival', // keep the ruling group in power above all
  'territorial_defense', // hold what it has
  'restore_territory', // recover land it claims and lost
  'territorial_expansion', // annex or unify claimed territory
  'buffer_zone', // push adversaries away from its borders
  'regional_hegemony', // dominate its region, often through proxies
  'sea_control', // command of adjacent seas and SLOCs
  'alliance_defense', // fight to uphold commitments to allies
  'regime_change', // remove the enemy government
] as const;
export type WarAim = (typeof WAR_AIMS)[number];

export type ObjectiveKind =
  | 'unify' // bring a claimed state under control (CHN: TWN)
  | 'annex' // seize and hold specific territory
  | 'buffer' // neutralize or dominate a neighbor
  | 'deter' // prevent attack by a named adversary
  | 'regime_survival'
  | 'proxy_influence'
  | 'sea_control'
  | 'defend_ally'
  | 'recover'; // regain lost territory

export interface StrategicObjective {
  id: string;
  kind: ObjectiveKind;
  /** Nations the objective is about (the claimed, deterred, or defended state). */
  targets: NationId[];
  /** 1 = core interest it would fight a major war for; 3 = opportunistic. */
  priority: 1 | 2 | 3;
  description: string;
}

/** AI personality knobs. All 0..1 unless noted. */
export interface StrategicProfile {
  /** Willingness to gamble on uncertain operations and brinkmanship. */
  riskTolerance: number;
  /** Ability to absorb military casualties before war support collapses. */
  casualtyTolerance: number;
  /** Tendency to climb the escalation ladder (horizontal or vertical) when losing. */
  escalationPropensity: number;
  /** Resistance of the regime to collapse or coup under wartime strain. */
  regimeStability: number;
  /** Probability it honors its treaty obligations when triggered. */
  allianceReliability: number;
  /** Weight per war aim; the AI picks aims in proportion. */
  warAims: Partial<Record<WarAim, number>>;
  /** Null for non-nuclear states. */
  nuclearThreshold: NuclearThreshold | null;
  objectives: StrategicObjective[];
}

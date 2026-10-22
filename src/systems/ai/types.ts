import type { Command, FormationId, NationId, NodeId } from '../../core/types';
import type { SimContext } from '../../core/engine';
import type { World, Formation, Order } from '../../core/types';
import type { StrategicProfile } from '../diplomacy/types';
import type { View } from '../intel/view';

/** Something worth taking: an enemy capital, city, industrial cell or port. */
export interface Objective {
  node: NodeId;
  value: number;
}

/** How far up its nuclear ladder a nation has weighed release, so it decides again only when the war worsens. */
export interface NuclearLadder {
  /** Highest first-use rung already weighed, whether the leadership released or held. */
  rung: number;
  /** Nuclear attacks on it already answered or let pass: homeland hits plus distinct attackers. */
  answered: number;
  /** Tick of its first public nuclear warning, the signalling rung that must stand before first use. */
  warnedTick?: number;
  /** Nuclear strikes it has ordered in this war: the first is limited, later ones climb to the theatre and general rungs. */
  strikes?: number;
  /** Warheads launched on warning since its last answer; the next answer counts them. */
  launchedOnWarning?: number;
}

export interface AiState {
  /** Platform count when the AI first saw each formation; strength is measured against it. */
  baseStrength: Record<string, number>;
  /** War aims per nation, refreshed by the strategic layer. */
  aims: Record<NationId, Objective[]>;
  nuclear: Record<NationId, NuclearLadder>;
  lastPeaceOffer: Record<NationId, number>;
  /** Formations sent overseas by strategic deployment, and the port each is bound for. */
  deployments: Record<FormationId, NodeId>;
  /** Tick of each nation's last airborne operation. */
  airborne: Record<NationId, number>;
  /** Air wings sent to a war, and the airfield each is bound for. */
  airBases?: Record<FormationId, NodeId>;
  /** The last order sent to each formation; cleared when a front changes. */
  sent: Record<FormationId, SentOrder>;
  /** Budget shares each `nation|munition` has been granted and drawn nothing on since it last fired (FireBudget.settle). */
  heldFire?: Record<string, number>;
}

/** An order the AI sent a formation, and where the formation stood then. */
export interface SentOrder extends Pick<Order, 'posture' | 'target' | 'targetFormation'> {
  node: NodeId;
  tick: number;
}

declare module '../../core/types' {
  interface Slices {
    ai: AiState;
  }
}

/** A connected stretch of front held by a nation or its co-belligerents. */
export interface Sector {
  /** Friendly front cells, most pressed first. */
  nodes: NodeId[];
  /** Enemy-held cells touching the sector. */
  enemyNodes: NodeId[];
  /** Enemy-held cells within two cells of the sector: the battle area. */
  battleArea: Set<NodeId>;
  /** Enemy ground combat power in the battle area. */
  threat: number;
  /** The most pressed front cell. */
  key: NodeId;
}

/** Active, un-embarked formations of a believed world, indexed once per tick. */
export interface ForceIndex {
  byNation: Map<NationId, Formation[]>;
  groundAt: Map<number, Formation[]>;
  /** Ground combat power of a formation, memoised for the tick. */
  power: (f: Formation) => number;
}

/**
 * Everything one nation's planners need for one planning pass. `world` is the nation's believed
 * world (intel/view.ts believedWorld): friendly formations true, others as its intelligence holds
 * them, so planners never read another nation's true forces.
 */
export interface Plan {
  world: World;
  view: View;
  ctx: SimContext;
  ai: AiState;
  nation: NationId;
  profile: StrategicProfile;
  enemies: Set<NationId>;
  /** The nation and its co-belligerents. */
  friends: Set<NationId>;
  index: ForceIndex;
  sectors: Sector[];
  out: Command[];
  /** Derived geography that holds until control or the set of wars changes; cleared on front changes. */
  memo: Map<string, unknown>;
}

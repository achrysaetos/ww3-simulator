import type { Command, FormationId, NationId, NodeId } from '../../core/types';
import type { SimContext } from '../../core/engine';
import type { World, Formation } from '../../core/types';
import type { StrategicProfile } from '../diplomacy/types';

/** Something worth taking: an enemy capital, city, industrial cell or port. */
export interface Objective {
  node: NodeId;
  value: number;
}

export interface AiState {
  /** Platform count when the AI first saw each formation; strength is measured against it. */
  baseStrength: Record<string, number>;
  /** War aims per nation, refreshed by the strategic layer. */
  aims: Record<NationId, Objective[]>;
  lastNuclear: Record<NationId, number>;
  lastPeaceOffer: Record<NationId, number>;
  /** Formations sent overseas by strategic deployment, and the port each is bound for. */
  deployments: Record<FormationId, NodeId>;
  /** Tick of each nation's last airborne operation. */
  airborne: Record<NationId, number>;
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

/** Active, un-embarked formations indexed once per tick. */
export interface ForceIndex {
  byNation: Map<NationId, Formation[]>;
  groundAt: Map<number, Formation[]>;
  /** Ground combat power of a formation, memoised for the tick. */
  power: (f: Formation) => number;
}

/** Everything one nation's planners need for one planning pass. */
export interface Plan {
  world: World;
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

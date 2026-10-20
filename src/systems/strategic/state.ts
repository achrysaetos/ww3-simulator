import type { MunitionId, NationId, NodeId } from '../../core/types';

export type Burst = 'air' | 'ground' | 'high_altitude';
export type NuclearPosture = 'launch_on_warning' | 'ride_out';
export type SatClass = 'recon_satellite' | 'nav_satellite' | 'comms_satellite';
export const SAT_CLASSES: readonly SatClass[] = ['recon_satellite', 'nav_satellite', 'comms_satellite'];

/** A release order. The `nuclear_release` command maps onto this; callers that need a burst choice call `release` directly. */
export interface ReleaseRequest {
  nation: NationId;
  target: NodeId;
  warheads: number;
  munition: MunitionId;
  /** Default: ground burst on hardened targets, air burst otherwise. */
  burst?: Burst;
}

/** Warheads in flight. ICBM/SLBM flight times (~30 min) are far shorter than a tick, so a salvo lands in the step of the tick it was launched. */
export interface Salvo {
  by: NationId;
  target: NodeId;
  munition: MunitionId;
  warheads: number;
  burst?: Burst;
}

export interface LaunchWarning {
  tick: number;
  attacker: NationId;
  victim: NationId;
  inbound: number;
  targets: NodeId[];
  /** The strike is aimed at the victim's own nuclear forces: the use-or-lose case. */
  counterforce: boolean;
}

/** A deposit of fallout: H+1 reference dose rate (rad/h, averaged over the cell) at the hour it was laid down. */
export interface FalloutSource {
  node: NodeId;
  r1: number;
  detonationHour: number;
}

export interface SatCount {
  alive: number;
  lost: number;
}

export interface StrategicState {
  salvos: Salvo[];
  /** Remaining interceptors per missile-defense system id (see BMD_SYSTEMS). */
  interceptors: Record<string, number>;
  posture: Record<NationId, NuclearPosture>;
  /** Warnings raised in the most recent step; plain data for the AI and UI. */
  warnings: LaunchWarning[];
  fallout: FalloutSource[];
  /** Cumulative cell-average fallout dose per node, rad. */
  dose: Record<number, number>;
  /** Cumulative deaths per node from blast, fire and fallout, so repeat strikes only kill survivors. */
  killed: Record<number, number>;
  /** Stratospheric soot from city fires, Tg, decaying. */
  sootTg: number;
  /** Soot level the climate has caught up with; lags sootTg because cooling and crop losses take a season to arrive. */
  climateTg: number;
  space: Record<NationId, Record<SatClass, SatCount>>;
  /** Tracked orbital debris fragments created by the war. */
  debris: number;
  totals: { detonations: number; megatons: number; deaths: number };
}

declare module '../../core/types' {
  interface Slices {
    strategic: StrategicState;
  }
}

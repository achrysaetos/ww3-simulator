import type { NationId } from '../core/types';
import type { CutKind, RungId } from '../systems/economy';

/**
 * What a war has cost so far and where it is heading, per nation: the people it has hurt, the
 * production race, and how the economic workarounds that keep a sanctioned or blockaded state
 * fighting are holding. Built by `outputsOf` from samples of the World; plain JSON.
 */
export interface Outputs {
  tick: number;
  /** Days since the scenario opened. */
  day: number;
  /** Belligerents and nations the war has displaced or killed people of, by id. */
  nations: Record<NationId, NationOutputs>;
  /** Nations sheltering the most refugees from the war, most first. */
  hosts: { nation: NationId; refugees: number }[];
}

export interface NationOutputs {
  humanitarian: Humanitarian;
  /** One row per key item the nation holds, makes or fires. */
  race: ItemRace[];
  /** Only the workarounds the nation needs: none when nothing is cut off. */
  workarounds: Workaround[];
  edges: Edges;
  /** Where its own refugees shelter, most first. */
  refugeeHosts: { nation: NationId; refugees: number }[];
  /** One row per cut-off the nation is climbing the workaround ladder out of: a sanctioning or warring partner, or a blockade of its ports. */
  ladder: CutoffCoverage[];
}

/**
 * Who is winning the race to adapt and the race to produce, separately (issue #2, section 3): a side
 * can win one and lose the other. Each runs from -1 (the enemy has it all) through 0 (even) to 1.
 */
export interface Edges {
  /**
   * Its measures' standing against its enemies' counters, less theirs against its own: the mean log
   * effect across its duels (src/systems/adaptation), squashed by tanh. 0 at the calibrated opening.
   */
  adaptation: number;
  /** Value of its war production over the trailing month against its enemies' together: (own - theirs) / (own + theirs). */
  production: number;
}

export interface CutoffCoverage {
  /** The partner nation cut off, or 'sea' for a blockade of its own ports. */
  cutoff: NationId | 'sea';
  kind: CutKind;
  /** Months it has been climbing this ladder; cut-offs the 2024 baseline already carries start mature. */
  months: number;
  /** Share of the supply lost to the cut-off that the ladder makes good so far, 0..1: trade won back, plus demand cut by rationing. */
  coverage: number;
  /** Each rung's part of the coverage. */
  rungs: Record<RungId, number>;
}

export interface Humanitarian {
  /** Servicemen killed and wounded in battle, the way UK MoD and Western estimates count casualties. */
  militaryCasualties: number;
  civiliansKilled: number;
  civiliansInjured: number;
  /** Its people displaced inside the country. */
  idps: number;
  /** Its people sheltering abroad. */
  refugees: number;
  /** Refugees from other nations it shelters. */
  hosting: number;
  underOccupation: number;
  /** Population-weighted share of its home cells' infrastructure and grid still intact, 0..1. */
  infrastructure: number;
  power: number;
  /** Share of the nation's need met this tick, 0..1: one minus the shortfall. */
  food: number;
  energy: number;
  fuel: number;
}

/**
 * Key items of the production race. `shells` counts gun artillery rounds (made, shipped in, fired);
 * their stock is part of `ammo`, the national depots' ammunition in tons, which is the stock that
 * can run dry. The rest count missiles and drones in magazines and warehouses together.
 */
export const RACE_ITEMS = ['shells', 'ammo', 'interceptors', 'cruise', 'ballistic', 'drones'] as const;
export type RaceItem = (typeof RACE_ITEMS)[number];

export interface ItemRace {
  item: RaceItem;
  unit: 'rounds' | 'tons';
  /** Null for shells, which are stocked as tons of `ammo`. */
  stock: number | null;
  /** Rates per 30 days over the trailing month (or the run so far, if shorter). */
  producedPerMonth: number;
  /** Net arms aid in (positive) or out (negative). */
  aidPerMonth: number;
  /** Fired, or for a stock, expended and lost with destroyed formations. */
  usedPerMonth: number;
  /**
   * Day the stock would reach zero at the trailing month's net rate; null when it is not falling or holds
   * nothing. An early warning, not a forecast: bursts of fire, reserves held back and lost launchers move
   * the real day, and a stock often lasts well past it (tests/outputs.test.ts, seeds 1-3).
   */
  zeroDay: number | null;
  /** Day the stock first ran out in this run; null if it has not. */
  ranOutDay: number | null;
  /** Each 30 days from the start: stock at the end of the month and what moved during it. */
  monthly: { day: number; stock: number | null; produced: number; aid: number; used: number }[];
}

export const WORKAROUNDS = ['trade_rerouting', 'dual_use_imports', 'shadow_fleet', 'foreign_arms'] as const;
export type WorkaroundId = (typeof WORKAROUNDS)[number];

/** holding: the workaround still delivers most of what was cut; strained: it leaks; failing: it no longer covers the gap. */
export type WorkaroundStatus = 'holding' | 'strained' | 'failing';

export interface Workaround {
  id: WorkaroundId;
  status: WorkaroundStatus;
  /** Share of the normal or planned flow still arriving, 0..1. */
  level: number;
  /** One line on what the level measures, for a reader. */
  detail: string;
}

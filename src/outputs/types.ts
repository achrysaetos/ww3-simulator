import type { NationId } from '../core/types';

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
  /** Day the stock would reach zero at the trailing rates; null when it is not falling or holds nothing. */
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

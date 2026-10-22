import type { Command, FormationId, NationId, NodeId } from '../../core/types';

export type HqLevel = 'national' | 'front' | 'army';
export type Band = 'gnss' | 'comms' | 'radar';
export type OrderCommand = Extract<Command, { type: 'order' }>;

/** A headquarters: where it sits, who it answers to, and how intact it is. */
export interface CommandNode {
  id: string;
  nation: NationId;
  level: HqLevel;
  name: string;
  node: NodeId;
  /** The HQ this one answers to; absent for a national command authority. */
  parent?: string;
  /** 1 intact .. 0 destroyed; a replacement stands up over HQ[level].recoverDays. */
  integrity: number;
  /** Cell it was last struck in, and the tick until which it keeps out of it (DISPLACE_DAYS). */
  displaced?: { from: NodeId; until: number };
}

/** Jamming a nation's emitters put on one cell, per band, 0..1. */
export type Jam = Record<Band, number>;

/** How well a formation is commanded this tick. */
export interface FormationC2 {
  /** Multiplier on its fire from HQ losses and communications, 0..1. */
  coordination: number;
  /** Hours an order to it waits before it acts. */
  delayH: number;
  /** Multiplier on its fire from jamming of its GNSS-guided rounds and drone links, 0..1. */
  guided: number;
}

export interface C2Tally {
  /** Guided weapons that reached a jammed target and missed for it. */
  jammedWeapons: number;
  /** Of those, drones (loitering and one-way). */
  jammedDrones: number;
  hqHits: number;
  delayedOrders: number;
}

export interface C2State {
  hqs: Record<string, CommandNode>;
  /** Each land formation's immediate HQ. */
  chain: Record<FormationId, string>;
  /** Per emitting nation, the cells it jams. Rebuilt each tick. */
  jam: Record<NationId, Record<number, Jam>>;
  /** Comms satellites each nation had at the start, for the share still alive. */
  satcomBase: Record<NationId, number>;
  /** Share of each nation's comms satellites still alive. */
  satcom: Record<NationId, number>;
  formations: Record<FormationId, FormationC2>;
  /** Orders held in transit to a formation until `due`. */
  transit: Record<FormationId, { command: OrderCommand; due: number }>;
  /** Tick on which a released order is applied without being held again. */
  released: Record<FormationId, number>;
  tally: Record<NationId, C2Tally>;
  /** world.nextId when formations were last attached to HQs; formations get ids only from it. */
  attachedTo: number;
  /** Space formations and formations carrying EW platforms, found when formations are attached. */
  space: FormationId[];
  emitters: FormationId[];
}

declare module '../../core/types' {
  interface Slices {
    c2: C2State;
  }
}

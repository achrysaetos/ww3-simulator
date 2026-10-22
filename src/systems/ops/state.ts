import type { FormationId, NationId, NodeId, Operation, OperationId, OperationPhase, World, Formation } from '../../core/types';
import { allied } from '../land/state';

export interface OpsState {
  byId: Record<OperationId, Operation>;
  /** Operations each nation has planned, for code names. */
  planned: Record<NationId, number>;
  /** Platforms each committed formation had when it joined its operation: spent is measured against it. */
  base: Record<FormationId, number>;
  /** The last order the staff sent each formation, so a standing order is not re-sent every tick. */
  sent: Record<FormationId, { posture: string; target?: NodeId; tick: number }>;
  /** Tick each running operation began fighting for its current bound. */
  boundSince: Record<OperationId, { bound: number; tick: number }>;
}

declare module '../../core/types' {
  interface Slices {
    ops: OpsState;
  }
}

export function opsSlice(world: World): OpsState {
  return (world.slices.ops ??= { byId: {}, planned: {}, base: {}, sent: {}, boundSince: {} });
}

export const ACTIVE: ReadonlySet<OperationPhase> = new Set(['launched', 'stalled']);
/** The operation committing `f`, if one is running (launched or stalled). */
export function operationOf(world: World, f: FormationId): Operation | undefined {
  const ops = world.slices.ops;
  if (!ops) return undefined;
  for (const id in ops.byId) {
    const op = ops.byId[id as OperationId];
    if (ACTIVE.has(op.phase) && op.formations.includes(f)) return op;
  }
  return undefined;
}

/** Every formation committed to a running operation, by the operation. */
export function committedFormations(world: World): Map<FormationId, Operation> {
  const out = new Map<FormationId, Operation>();
  const ops = world.slices.ops;
  if (!ops) return out;
  for (const id in ops.byId) {
    const op = ops.byId[id as OperationId];
    if (ACTIVE.has(op.phase)) for (const f of op.formations) out.set(f, op);
  }
  return out;
}

/** Whether `nation` (or its side) holds `node`. */
export const holds = (world: World, nation: NationId, node: NodeId): boolean => {
  const holder = world.control[node];
  return !!holder && allied(world, nation, holder);
};

export const platforms = (f: Formation): number => {
  let n = 0;
  for (const v of Object.values(f.equipment)) n += v;
  return n;
};

/** Ends an operation and hands its formations back: they stop where they stand. */
export function endOperation(world: World, s: OpsState, op: Operation, phase: 'succeeded' | 'failed' | 'cancelled', note: string): void {
  op.phase = phase;
  op.endedTick = world.tick;
  op.progress.note = note;
  delete s.boundSince[op.id];
  for (const id of [...op.formations, ...op.progress.relieved]) {
    delete s.base[id];
    delete s.sent[id];
  }
}


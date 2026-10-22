/**
 * A battle plan on the page: the arrow the player draws and the force they give it, until it goes to
 * the engine as an operation command. The staff routes the real axis from the waypoints (ops/index.ts
 * routeAxis) and its forecast says where it runs.
 */
import type { Command, FormationId, NationId, NodeId, Operation, OperationId } from '../../core/types';
import type { OperationForecast, OperationPlan } from '../../forecast/operation';
import { CODE_NAMES } from '../../systems/ops';

export interface PlanDraft {
  /** The operation this re-plans (Adjust), or none for a new plan. */
  operation: OperationId | null;
  name: string | null;
  formations: FormationId[];
  /** Cells the player drew the arrow through before the objective, in order. */
  waypoints: NodeId[];
  objective: NodeId | null;
}

/** Drawing: the arrow follows the cursor until the objective is clicked. Review: the plan and its forecast, ready to launch. */
export type PlanStage = 'drawing' | 'review';

export type ForecastState =
  | { status: 'idle' }
  | { status: 'running'; key: string; done: number; total: number }
  | { status: 'done'; key: string; forecast: OperationForecast }
  | { status: 'failed'; key: string; reason: string };

export interface Planning {
  stage: PlanStage;
  draft: PlanDraft;
  forecast: ForecastState;
}

export const newDraft = (formations: FormationId[], objective: NodeId | null = null, name: string | null = null): PlanDraft => ({ operation: null, name, formations, waypoints: [], objective });

/** The staff's first code name not already on one of the nation's operations, so a plan has its name from the first click. */
export function freshName(ops: readonly Pick<Operation, 'name'>[]): string {
  const taken = new Set(ops.map((o) => o.name));
  for (let round = 1; ; round++)
    for (const w of CODE_NAMES) {
      const name = `Operation ${w}${round > 1 ? ` ${round}` : ''}`;
      if (!taken.has(name)) return name;
    }
}

/** The draft of an operation already on the books, to adjust it. */
export const draftOf = (op: Operation): PlanDraft => ({
  operation: op.id, name: op.name, formations: [...op.formations], waypoints: [], objective: op.objectives[op.objectives.length - 1] ?? null,
});

/** What the forecast and the engine are given: the objective, the drawn waypoints, the force. Null until the plan has both an objective and a force. */
export function planOf(d: PlanDraft, nation: NationId): OperationPlan | null {
  if (d.objective === null || !d.formations.length) return null;
  return { nation, kind: 'offensive', objectives: [d.objective], formations: [...d.formations], ...(d.waypoints.length ? { axis: [...d.waypoints] } : {}), ...(d.name ? { name: d.name } : {}) };
}

/** The forecast's cache key: a plan forecast once is not forecast again until it changes. */
export const planKey = (p: OperationPlan): string => JSON.stringify([p.objectives, p.axis ?? [], p.formations]);

/** The command that files the plan (a draft, or launched at once), or re-plans the operation it adjusts. */
export function planCommand(d: PlanDraft, nation: NationId, launch: boolean): Command | null {
  const p = planOf(d, nation);
  if (!p) return null;
  if (d.operation) return { type: 'adjust_operation', nation, operation: d.operation, objectives: p.objectives, formations: p.formations, ...(p.axis ? { axis: p.axis } : {}) };
  return { type: 'plan_operation', ...p, ...(launch ? { launch: true as const } : {}) };
}

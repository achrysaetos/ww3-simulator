/**
 * Forecast of one operation, from the planner's beliefs. The planner's believed world (enemy forces as its intelligence
 * holds them, at their estimated cells and strengths) is cut to the theatre around the axis and stepped with only the
 * systems a ground operation needs, many times over a spread of seeds and calibration params. Free of Node APIs, like
 * the rest of the forecast core, so a browser worker can run it; the Node pool is `./operation-pool`.
 */
import type { Catalog } from '../core/catalog';
import { Engine, type System } from '../core/engine';
import type { GameMap } from '../core/map';
import { paramDef, withParams } from '../core/params';
import type { Command, FormationId, NationId, NodeId, OperationId, World } from '../core/types';
import { loadCatalog } from '../data/catalog';
import { loadMap } from '../data/load';
import { SYSTEMS } from '../systems';
import { supplyFactor } from '../systems/logistics';
import { MAX_REFILL_FRACTION_PER_DAY } from '../systems/logistics/tables';
import { believedWorld, viewOf } from '../systems/intel/view';
import { holds, platforms } from '../systems/ops/state';
import { beyondWarAims, routeAxis } from '../systems/ops';
import type { RunSpec } from './run';
import { sampleRuns } from './sample';

export type OperationPlan = Omit<Extract<Command, { type: 'plan_operation' }>, 'type' | 'launch' | 'hHour' | 'byPlayer'>;

export interface OperationForecastInput {
  /** The planner's believed world cut to the theatre (`theatreWorld`): plain JSON, so it can go to a worker. */
  world: World;
  plan: OperationPlan;
  days: number;
  /** Age in hours of the planner's fix on each enemy formation in the theatre. */
  contactAgeHours: Record<FormationId, number>;
  /** The first cell of the plan past the planner's war aims, and why: launching it makes the war total. */
  beyondWarAims?: { node: NodeId; why: string };
}

/** One run of the forecast. */
export interface OperationRun {
  spec: RunSpec;
  /** First day (1-based) at whose end every objective was held, or 0 if never. */
  objectiveDay: number;
  /** Platforms the committed force lost. */
  losses: number;
  /** Personnel the committed force lost: killed, wounded and captured. */
  casualties: number;
  /** Axis cells taken past the line of departure (the axis's first cell), fractional: 0 to axis length - 1. */
  advance: number;
  /** The operation's phase at the end. */
  phase: string;
}

export interface Spread { p10: number; p50: number; p90: number }

export interface OperationForecast {
  runs: number;
  days: number;
  axis: NodeId[];
  /** Share of runs with every objective held by the end of day d, for d = 1..days (index d-1). */
  pObjectiveByDay: number[];
  losses: Spread;
  casualties: Spread;
  advance: Spread;
  /** Calibration params whose spread moved the outcome most, strongest first: what the forecast hinges on. */
  drivers: { param: string; tag: string; r: number; metric: 'advance' | 'losses' }[];
  /** Age of the planner's intelligence on the enemy formations in the theatre, hours: the freshest and the stalest fix. */
  intelAgeHours: { min: number; max: number } | null;
  /** Enemy formations in the theatre the planner holds a fix on; the forecast cannot see the rest. */
  enemyContacts: number;
  /** Set when the plan goes past the war aims: the forecast assumes it is launched, which makes the war total. */
  beyondWarAims?: { node: NodeId; why: string };
}

/** Formations this far from the axis or the committed force are left out of the forecast: they cannot reach the fight in its window. */
const THEATRE_KM = 350;
/**
 * The systems a ground operation's outcome turns on, with logistics' refill run over today's supply lines
 * (theatreSupply). Air, sea, the home front, diplomacy and the AI hold still: the forecast assumes the enemy defends
 * where it stands.
 */
const THEATRE_SYSTEMS: ReadonlySet<string> = new Set(['weather', 'orders', 'landMovement', 'landCombat', 'ops']);
/** World slices those systems read (logistics for its supply network, frozen as it stands: the forecast runs on today's supply lines); the rest stay behind. */
const THEATRE_SLICES = ['land', 'weather', 'command', 'logistics'] as const;
/** Swept by default: the ground-combat and operations knobs whose real values are uncertain. */
const SWEEP_PREFIXES = ['land.', 'ops.'];

/** The axis the staff would route for `plan` from its lead manoeuvre formation, as the ops system does. */
function planAxis(world: World, map: GameMap, plan: OperationPlan): NodeId[] {
  const first = plan.formations.map((id) => world.formations[id]).find((f) => f?.kind === 'maneuver') ?? world.formations[plan.formations[0]];
  return (first && routeAxis(world, map, plan.nation, [first.node, ...(plan.axis ?? []), ...plan.objectives])) || [];
}

/**
 * The world as `nation` believes it, cut to the theatre of `plan`: its own forces true, the enemy's as its intelligence
 * holds them, everything far from the axis left out. Per-formation records in the slices are kept only for the
 * formations in the cut, and foreign depots and bulk stocks are left out: the result goes to the page, so it carries
 * nothing the planner does not know. Built on the caller's thread from the live world; the result is plain JSON for
 * the workers.
 */
export function theatreWorld(world: World, map: GameMap, catalog: Catalog, nation: NationId, plan: OperationPlan): World {
  const belief = believedWorld(world, map, nation, catalog);
  const { friends } = viewOf(world, map, nation);
  const anchors = new Set<number>(plan.objectives);
  for (const id of plan.formations) if (belief.formations[id]) anchors.add(belief.formations[id].node);
  for (const n of planAxis(belief, map, plan)) anchors.add(n);
  const near = (node: NodeId) => {
    if (node >= map.landCount) return false;
    for (const a of anchors) if (map.distanceKm(node, a as NodeId) <= THEATRE_KM) return true;
    return false;
  };
  const formations: World['formations'] = {};
  for (const [id, f] of Object.entries(belief.formations)) {
    if (f.status === 'destroyed' || f.embarkedOn || f.kind === 'air_wing' || f.kind === 'surface_group' || f.kind === 'submarine' || f.kind === 'space' || f.kind === 'strategic') continue;
    if (near(f.node) || plan.formations.includes(id as FormationId)) formations[id as FormationId] = f;
  }
  const kept = <T>(r: Record<FormationId, T>) => Object.fromEntries(Object.entries(r).filter(([id]) => id in formations)) as Record<FormationId, T>;
  const slices: Partial<World['slices']> = {};
  for (const k of THEATRE_SLICES) if (world.slices[k]) (slices as Record<string, unknown>)[k] = world.slices[k];
  const { land, logistics } = world.slices;
  if (land) slices.land = { ...land, baseline: kept(land.baseline), isolatedDays: kept(land.isolatedDays), airlifted: kept(land.airlifted), airheads: kept(land.airheads) };
  // The forecast runs only logistics' supply network (theatreSupply); establishments, raisings and national ledgers stay behind.
  if (logistics)
    slices.logistics = {
      networks: logistics.networks, networkOf: logistics.networkOf, seen: logistics.seen, captured: logistics.captured,
      establishment: {}, fallen: {}, lift: {}, short: {}, raised: {}, raising: [], peaceBurn: {},
    };
  const nations = { ...world.nations };
  for (const id of Object.keys(nations) as NationId[]) if (!friends.has(id)) nations[id] = { ...nations[id], stockpile: {}, bulk: { fuel: 0, ammo: 0, food: 0 } };
  return structuredClone({ ...world, nations, formations, slices: slices as World['slices'], pending: [], events: [], history: [] });
}

/**
 * Logistics' refill over the frozen supply lines: each formation draws toward full at logistics' rate scaled by its
 * supply factor. Without it the force would run dry in about a week of fighting, which the real one, fed by
 * logistics, does not. Depot throughput and national stocks are not modelled here.
 */
const theatreSupply: System = {
  id: 'theatreSupply',
  step(world, ctx) {
    const rate = MAX_REFILL_FRACTION_PER_DAY * (world.dtHours / 24);
    for (const id in world.formations) {
      const f = world.formations[id as FormationId];
      if (f.status === 'destroyed' || f.status === 'embarked' || f.node >= ctx.map.landCount) continue;
      const phi = supplyFactor(world, ctx.map, f.node, f.nation);
      if (phi <= 0) continue;
      const cap = f.supplyCapacity, have = f.supply;
      have.fuel = Math.min(cap.fuel, have.fuel + cap.fuel * rate * phi);
      have.ammo = Math.min(cap.ammo, have.ammo + cap.ammo * rate * phi);
      have.food = Math.min(cap.food, have.food + cap.food * rate * phi);
    }
  },
};

let theatreEngine: Engine | undefined;
const engine = () => {
  if (theatreEngine) return theatreEngine;
  const systems = SYSTEMS.filter((s) => THEATRE_SYSTEMS.has(s.id));
  systems.splice(systems.findIndex((s) => s.id === 'landCombat') + 1, 0, theatreSupply);
  return (theatreEngine = new Engine(loadMap(), loadCatalog(), systems));
};

/** Loads the map, catalog and systems, so the first forecast pays only for its runs. */
export function warmOperationForecast(): void {
  engine();
}

/** Steps one draw of the forecast. Pure in its inputs: the same input and spec give the same run on any thread. */
export function runOperation(input: OperationForecastInput, spec: RunSpec): OperationRun {
  const eng = engine();
  const world = structuredClone(input.world);
  world.seed = spec.seed;
  world.rngState = spec.seed;
  const params = { ...world.params, ...spec.params };
  if (Object.keys(params).length) world.params = params;
  const nation = input.plan.nation;
  return withParams(world.params, () => {
    world.pending.push({ type: 'plan_operation', ...structuredClone(input.plan), launch: true });
    const perDay = Math.round(24 / world.dtHours);
    const base = new Map<FormationId, { platforms: number; personnel: number }>();
    for (const id of input.plan.formations) {
      const f = world.formations[id];
      if (f) base.set(id, { platforms: platforms(f), personnel: f.personnel });
    }
    let objectiveDay = 0;
    let op: OperationId | undefined;
    for (let d = 1; d <= input.days; d++) {
      for (let k = 0; k < perDay; k++)
        for (const e of eng.step(world)) if (e.type === 'command_result' && e.command === 'plan_operation' && e.operation) op = e.operation;
      if (!objectiveDay && input.plan.objectives.every((n) => holds(world, nation, n))) objectiveDay = d;
    }
    let losses = 0, casualties = 0;
    for (const [id, was] of base) {
      const f = world.formations[id];
      const alive = f && f.status !== 'destroyed';
      losses += was.platforms - (alive ? platforms(f) : 0);
      casualties += Math.max(0, was.personnel - (alive ? f.personnel : 0));
    }
    const o = op ? world.slices.ops.byId[op] : undefined;
    return { spec, objectiveDay, losses, casualties, advance: Math.max(0, (o?.progress.advance ?? 1) - 1), phase: o?.phase ?? 'refused' };
  });
}

/** The run specs of a forecast: `runs` Latin-hypercube draws over the uncertain ground knobs, across seeds 1..runs. */
export function operationRuns(runs: number, sampleSeed = 1): RunSpec[] {
  const sweep = sampleRuns(1, { seeds: [1], sweep: 'tagged', method: 'lhs' })[0].params ?? {};
  const ids = Object.keys(sweep).filter((id) => SWEEP_PREFIXES.some((p) => id.startsWith(p)));
  return sampleRuns(runs, { seeds: Array.from({ length: runs }, (_, i) => i + 1), sweep: ids, method: 'lhs', sampleSeed });
}

function spread(xs: number[]): Spread {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => {
    const at = (s.length - 1) * p, lo = Math.floor(at), hi = Math.ceil(at);
    return s[lo] + (s[hi] - s[lo]) * (at - lo);
  };
  return { p10: q(0.1), p50: q(0.5), p90: q(0.9) };
}

function correlation(xs: number[], ys: number[]): number {
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

/** Turns the runs into the forecast the staff briefs: odds by day, the spread of losses and ground, and what it hinges on. */
export function summarizeOperation(input: OperationForecastInput, map: GameMap, results: readonly OperationRun[]): OperationForecast {
  const n = results.length;
  const pObjectiveByDay = Array.from({ length: input.days }, (_, i) => results.filter((r) => r.objectiveDay > 0 && r.objectiveDay <= i + 1).length / n);
  const drivers: OperationForecast['drivers'] = [];
  const params = [...new Set(results.flatMap((r) => Object.keys(r.spec.params ?? {})))].sort();
  for (const metricId of ['advance', 'losses'] as const)
    for (const id of params) {
      const def = paramDef(id);
      if (!def) continue;
      const r = correlation(results.map((x) => x.spec.params?.[id] ?? def.value), results.map((x) => x[metricId]));
      drivers.push({ param: id, tag: def.tag, r, metric: metricId });
    }
  drivers.sort((a, b) => Math.abs(b.r) - Math.abs(a.r) || (a.param < b.param ? -1 : 1));
  const top = drivers.filter((d, i) => drivers.findIndex((e) => e.param === d.param) === i).slice(0, 3);

  const view = input.world;
  const ages = Object.values(input.contactAgeHours);
  return {
    runs: n,
    days: input.days,
    axis: planAxis(view, map, input.plan),
    pObjectiveByDay,
    losses: spread(results.map((r) => r.losses)),
    casualties: spread(results.map((r) => r.casualties)),
    advance: spread(results.map((r) => r.advance)),
    drivers: top,
    intelAgeHours: ages.length ? { min: Math.min(...ages), max: Math.max(...ages) } : null,
    enemyContacts: ages.length,
    ...(input.beyondWarAims ? { beyondWarAims: input.beyondWarAims } : {}),
  };
}

/** The forecast's input for `plan`, from the live world, as the planner sees it, with the age of each enemy contact. */
export function forecastInput(world: World, map: GameMap, catalog: Catalog, plan: OperationPlan, days: number): OperationForecastInput {
  const cut = theatreWorld(world, map, catalog, plan.nation, plan);
  const view = viewOf(world, map, plan.nation);
  const contactAgeHours: Record<FormationId, number> = {};
  for (const id of Object.keys(cut.formations) as FormationId[]) {
    const c = view.contacts.get(id);
    if (c) contactAgeHours[id] = c.ageHours;
  }
  const beyond = beyondWarAims(world, map, { nation: plan.nation, kind: plan.kind, objectives: plan.objectives, axis: planAxis(cut, map, plan) });
  return { world: cut, plan: structuredClone(plan), days, contactAgeHours, ...(beyond ? { beyondWarAims: { node: beyond.node, why: beyond.why } } : {}) };
}

/** A forecast in this thread, serially. The UI's worker and the Node pool run the same `runOperation` per draw. */
export function forecastOperation(input: OperationForecastInput, runs = 8): OperationForecast {
  const results = operationRuns(runs).map((spec) => runOperation(input, spec));
  return summarizeOperation(input, engine().map, results);
}

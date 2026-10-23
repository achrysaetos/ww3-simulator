import { beforeAll, describe, expect, it } from 'vitest';
import type { Engine } from '../src/core/engine';
import type { Command, FormationId, NationId, NodeId, Operation, OperationId, OperationPhase, World } from '../src/core/types';
import { forecastInput, forecastOperation, type OperationForecast } from '../src/forecast/operation';
import { createSession } from '../src/scenarios';
import { platforms } from '../src/systems/ops/state';

const UKR = 'UKR' as NationId;
const DAYS = 14;
type Plan = Omit<Extract<Command, { type: 'plan_operation' }>, 'type'>;

/** The `n` Ukrainian manoeuvre formations nearest `target`, not already taken. */
function forceFor(world: World, map: Engine['map'], target: NodeId, n: number, taken: Set<FormationId>): FormationId[] {
  const from = [...map.neighbors(target)].filter((m) => m < map.landCount && world.control[m] === UKR);
  const km = (node: NodeId) => Math.min(...from.map((m) => map.distanceKm(node, m)));
  const force = Object.values(world.formations)
    .filter((f) => f.nation === UKR && f.kind === 'maneuver' && f.status === 'active' && f.node < map.landCount && !taken.has(f.id))
    .sort((a, b) => km(a.node) - km(b.node) || (a.id < b.id ? -1 : 1))
    .slice(0, n)
    .map((f) => f.id);
  for (const id of force) taken.add(id);
  return force;
}

/**
 * ukraine-2026 at D+10 with Ukraine under a player, who plans two offensives: two brigades into the empty, belted Russian
 * cell at Tokmak, covered by the 58th Army's line on every side (P1 H3), and twelve formations into a thinly screened Russian
 * border cell in Bryansk oblast. Ukraine's picture of the Russian forces is made fresh and exact first, so the forecast and
 * the run differ only in what the forecast leaves out (the enemy's reactions, air and the swept calibration), not in
 * what the planner got wrong.
 */
function setup() {
  const s = createSession('ukraine-2026', 1);
  const { engine, world } = s;
  const map = engine.map;
  world.nations[UKR].controlledBy = 'human';
  engine.run(world, 10 * (24 / world.dtHours));
  const picture = world.slices.intel.pictures[UKR];
  for (const f of Object.values(world.formations))
    if (f.nation === 'RUS' && f.status !== 'destroyed' && f.node < map.landCount)
      picture[f.id] = { node: f.node, tick: world.tick, kind: f.kind, strength: platforms(f), equipment: { ...f.equipment }, source: 'satellite' };
  const taken = new Set<FormationId>();
  const plan = (target: NodeId, n: number): Plan => ({ nation: UKR, kind: 'offensive', objectives: [target], formations: forceFor(world, map, target, n, taken), byPlayer: true });
  return { engine, world, map, hopeless: plan(map.nodeAt(47.25, 35.75), 2), strong: plan(map.nodeAt(52.5, 32.5), 12) };
}

describe('a player offensive in ukraine-2026 advances when it can, stalls honestly when it cannot, and the forecast agrees', () => {
  let g: ReturnType<typeof setup>;
  const forecast: Record<'hopeless' | 'strong', OperationForecast> = {} as never;
  const ops: Record<'hopeless' | 'strong', OperationId> = {} as never;
  const phases: Record<'hopeless' | 'strong', OperationPhase[]> = { hopeless: [], strong: [] };
  const notes: string[] = [];
  const op = (k: 'hopeless' | 'strong'): Operation => g.world.slices.ops.byId[ops[k]];

  beforeAll(() => {
    g = setup();
    expect(g.world.control[g.hopeless.objectives[0]]).toBe('RUS');
    expect(g.world.control[g.strong.objectives[0]]).toBe('RUS');
    for (const k of ['hopeless', 'strong'] as const) forecast[k] = forecastOperation(forecastInput(g.world, g.map, g.engine.catalog, g[k], DAYS), 8);
    for (const k of ['hopeless', 'strong'] as const) g.world.pending.push({ type: 'plan_operation', ...g[k], launch: true });
    for (let d = 0; d < DAYS; d++) {
      for (let t = 0; t < 24 / g.world.dtHours; t++)
        for (const e of g.engine.step(g.world))
          if (e.type === 'command_result' && e.command === 'plan_operation' && e.operation)
            ops[g.world.slices.ops.byId[e.operation].objectives[0] === g.hopeless.objectives[0] ? 'hopeless' : 'strong'] = e.operation;
      for (const k of ['hopeless', 'strong'] as const) {
        phases[k].push(op(k).phase);
        notes.push(op(k).progress.note);
      }
    }
  }, 600_000);

  it('a well-resourced thrust into a thinly held cell takes it', () => {
    expect(op('strong').phase).toBe('succeeded');
    expect(g.world.control[g.strong.objectives[0]]).toBe(UKR);
  });

  it('a thrust into a cell the enemy line covers from every side stalls, says how slowly it is gaining, and is called off', () => {
    // Base: it crept a few hundred metres a day and reported "fighting for bound 1 of 1" for three weeks (P1 H3). Six brigades
    // now sweep the empty cell's whole width (land.SCREEN_DENSITY) at about 1.2 km a day, which is progress, so two are sent.
    expect(op('hopeless').progress.advance - 1).toBeLessThan(0.15);
    expect(phases.hopeless).toContain('stalled');
    expect(notes.some((n) => /^stalled at cell \d+: [\d.]+ km gained in 2 days$/.test(n))).toBe(true);
    expect(op('hopeless').phase).toBe('failed');
    expect(op('hopeless').progress.note).toMatch(/^called off after \d+ days under 1 km a day; [\d.]+ km gained in all$/);
  });

  it('the forecast\'s median ground matches the run, within a few kilometres, and never exceeds the axis', () => {
    for (const k of ['hopeless', 'strong'] as const) {
      const real = op(k).progress.advance - 1;
      const f = forecast[k];
      expect(f.advance.p90, k).toBeLessThanOrEqual(f.axis.length - 1);
      expect(Math.abs(f.advance.p50 - real), `${k}: forecast p50 ${f.advance.p50.toFixed(2)} cells, run ${real.toFixed(2)}`).toBeLessThan(0.15);
    }
    expect(forecast.hopeless.pObjectiveByDay[DAYS - 1]).toBe(0);
    expect(forecast.strong.pObjectiveByDay[DAYS - 1]).toBeGreaterThanOrEqual(0.5);
  });
});

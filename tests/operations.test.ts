import { beforeAll, describe, expect, it } from 'vitest';
import type { Engine } from '../src/core/engine';
import type { Command, CommandResult, Formation, NationId, NodeId, Operation, OperationId, OperationPhase, World } from '../src/core/types';
import { createSession } from '../src/scenarios';

const RUS = 'RUS' as NationId;

/** ukraine-2026 with Russia under a human player: the player plans operations, the delegate runs everything else. */
function game() {
  const s = createSession('ukraine-2026', 1);
  const { engine, world } = s;
  world.nations[RUS].controlledBy = 'human';
  const results: CommandResult[] = [];
  const step = () => {
    for (const e of engine.step(world)) if (e.type === 'command_result' && e.command !== 'order') results.push(e);
  };
  const send = (c: Command) => {
    world.pending.push(c);
    step();
    return results[results.length - 1];
  };
  return { engine, world, step, send, results };
}

const named = (world: World, prefix: string): Formation => {
  const f = Object.values(world.formations).find((x) => x.nation === RUS && x.name.startsWith(prefix));
  if (!f) throw new Error(`no formation ${prefix}`);
  return f;
};

describe('a player-planned offensive in ukraine-2026', () => {
  let g: ReturnType<typeof game>;
  let map: Engine['map'];
  let kramatorsk: NodeId;
  let force: Formation[];
  let opId: OperationId;
  const op = (): Operation => g.world.slices.ops.byId[opId];
  const phases: OperationPhase[] = [];

  beforeAll(() => {
    g = game();
    map = g.engine.map;
    kramatorsk = map.nodeAt(48.72, 37.56);
    force = ['3rd Motor Rifle Division', '2nd Guards Motor Rifle Brigade', '4th Guards Motor Rifle Brigade', '20th Guards Motor Rifle Division'].map((n) => named(g.world, n));
  });

  it('plans a draft: the staff routes an axis from the force to the objective and answers with the operation', () => {
    const r = g.send({ type: 'plan_operation', nation: RUS, kind: 'offensive', objectives: [kramatorsk], formations: force.map((f) => f.id), byPlayer: true });
    expect(r).toMatchObject({ command: 'plan_operation', ok: true, code: 'accepted', byPlayer: true });
    opId = r.operation!;
    expect(op()).toMatchObject({ nation: RUS, kind: 'offensive', phase: 'draft', planner: 'player', objectives: [kramatorsk] });
    expect(op().name).toMatch(/^Operation /);
    const { axis } = op();
    expect(axis[axis.length - 1]).toBe(kramatorsk);
    expect(g.world.control[axis[0]]).toBe(RUS);
    for (let i = 1; i < axis.length; i++) expect([...map.neighbors(axis[i - 1])]).toContain(axis[i]);
    // A draft commands nothing yet.
    g.step();
    expect(op().phase).toBe('draft');
  });

  it('refuses what it cannot do, with the order router\'s codes', () => {
    const ukr = Object.values(g.world.formations).find((f) => f.nation === 'UKR' && f.kind === 'maneuver')!;
    const wing = Object.values(g.world.formations).find((f) => f.nation === RUS && f.kind === 'air_wing')!;
    const plan = (formations: string[], extra: Partial<Extract<Command, { type: 'plan_operation' }>> = {}) =>
      g.send({ type: 'plan_operation', nation: RUS, kind: 'offensive', objectives: [kramatorsk], formations: formations as never, byPlayer: true, ...extra });
    expect(plan([ukr.id])).toMatchObject({ ok: false, code: 'not_yours' });
    expect(plan([wing.id])).toMatchObject({ ok: false, code: 'wrong_role' });
    expect(plan(['nope'])).toMatchObject({ ok: false, code: 'unknown_formation' });
    expect(plan([force[0].id], { objectives: [map.landCount + 3 as NodeId] })).toMatchObject({ ok: false, code: 'bad_target' });
    expect(plan([force[0].id], { hHour: g.world.tick - 1 })).toMatchObject({ ok: false, code: 'invalid' });
    expect(g.send({ type: 'launch_operation', nation: RUS, operation: 'op-none' as OperationId, byPlayer: true })).toMatchObject({ ok: false, code: 'invalid' });
    expect(g.send({ type: 'cancel_operation', nation: 'UKR' as NationId, operation: opId, byPlayer: true })).toMatchObject({ ok: false, code: 'not_yours' });
  });

  it('launches, and the force closes up on the axis and assaults its first bound together', () => {
    const r = g.send({ type: 'launch_operation', nation: RUS, operation: opId, byPlayer: true });
    expect(r).toMatchObject({ command: 'launch_operation', ok: true, code: 'accepted', operation: opId, etaHours: 0 });
    expect(op().phase).toBe('launched');
    expect(op().progress.platformsAtLaunch).toBeGreaterThan(1000);
    // A formation in a running operation cannot be given to a second one.
    expect(g.send({ type: 'plan_operation', nation: RUS, kind: 'raid', objectives: [kramatorsk], formations: [force[0].id], byPlayer: true })).toMatchObject({ ok: false, code: 'not_ready' });

    const axis = new Set<number>(op().axis);
    let attacked = false;
    for (let i = 0; i < 4 * 6 && !attacked; i++) {
      g.step();
      phases.push(op().phase);
      const bound = op().axis[Math.min(op().progress.bound, op().axis.length - 1)];
      for (const id of op().formations) {
        const f = g.world.formations[id];
        // Every order the force holds is the staff's: onto the axis or next to its bound, never the delegate's elsewhere.
        if (f.order.target !== undefined && f.order.posture !== 'defend') expect(axis.has(f.order.target) || [...map.neighbors(bound)].includes(f.order.target), `${f.name} ${f.order.posture} ${f.order.target}`).toBe(true);
      }
      attacked = op().formations.filter((id) => g.world.formations[id].order.posture === 'attack' && g.world.formations[id].order.target === bound).length >= 2;
    }
    expect(attacked, 'at least two formations assault the same bound').toBe(true);
  });

  it('reports progress and phase as it fights, and re-plans on adjust', () => {
    for (let i = 0; i < 4 * 6; i++) {
      g.step();
      phases.push(op().phase);
      if (op().phase === 'stalled') break;
    }
    expect(op().progress.platforms).toBeGreaterThan(0);
    expect(op().progress.platforms).toBeLessThan(op().progress.platformsAtLaunch);
    expect(op().progress.note.length).toBeGreaterThan(0);
    // The fortified Donbas line holds a four-formation thrust: it stalls rather than walking through (ISW 2024-25).
    expect(phases).toContain('stalled');

    const r = g.send({ type: 'adjust_operation', nation: RUS, operation: opId, formations: op().formations.slice(0, 2), byPlayer: true });
    expect(r).toMatchObject({ command: 'adjust_operation', ok: true, operation: opId });
    expect(op().formations).toHaveLength(2);
  });

  it('cancels: the force holds where it stands and goes back to the delegate', () => {
    const kept = [...op().formations];
    const r = g.send({ type: 'cancel_operation', nation: RUS, operation: opId, byPlayer: true });
    expect(r).toMatchObject({ command: 'cancel_operation', ok: true, code: 'accepted', operation: opId });
    expect(op().phase).toBe('cancelled');
    expect(op().endedTick).toBe(g.world.tick - 1);
    g.step();
    for (const id of kept) if (g.world.formations[id].status !== 'destroyed') expect(['defend', 'reserve', 'attack', 'move']).toContain(g.world.formations[id].order.posture);
    expect(g.send({ type: 'launch_operation', nation: RUS, operation: opId, byPlayer: true })).toMatchObject({ ok: false, code: 'not_ready' });
    expect(g.send({ type: 'adjust_operation', nation: RUS, operation: opId, hHour: g.world.tick, byPlayer: true })).toMatchObject({ ok: false, code: 'not_ready' });
  });

  it('answers each operation command with a command_result the UI can label', async () => {
    const { COMMAND_LABEL } = await import('../src/ui/events');
    const commands = new Set(g.results.map((r) => r.command));
    for (const c of ['plan_operation', 'launch_operation', 'cancel_operation', 'adjust_operation'] as const) {
      expect(commands.has(c), c).toBe(true);
      expect(COMMAND_LABEL[c]).toBeTruthy();
    }
  });
});

describe('the AI general staff in baltic-2027', () => {
  it('Russia masses its main effort as a launched operation on a contiguous axis into the Baltic states', () => {
    const s = createSession('baltic-2027', 1);
    s.engine.run(s.world, 8);
    const { map } = s.engine;
    const ops = Object.values(s.world.slices.ops.byId).filter((o) => o.nation === RUS && o.planner === 'ai');
    expect(ops.length).toBeGreaterThan(0);
    for (const o of ops) {
      expect(['launched', 'stalled', 'succeeded']).toContain(o.phase);
      expect(['EST', 'LVA', 'LTU']).toContain(map.owner[o.objectives[0]]);
      expect(o.formations.filter((id) => s.world.formations[id]?.kind === 'maneuver').length).toBeGreaterThanOrEqual(3);
      for (let i = 1; i < o.axis.length; i++) expect([...map.neighbors(o.axis[i - 1])]).toContain(o.axis[i]);
    }
  }, 300_000);

  it('Ukraine, defending in ukraine-2026, plans no offensive operation and keeps a reserve out of the line', () => {
    const s = createSession('ukraine-2026', 1);
    s.engine.run(s.world, 4);
    const ukr = 'UKR' as NationId;
    expect(Object.values(s.world.slices.ops.byId).filter((o) => o.nation === ukr)).toEqual([]);
    const reserve = Object.values(s.world.formations).filter((f) => f.nation === ukr && f.kind === 'maneuver' && f.status === 'active' && f.order.posture === 'reserve');
    expect(reserve.length).toBeGreaterThan(0);
  }, 300_000);
});

describe('operations and the war aims (south-asia-2027 opens as a punitive war)', () => {
  it("India's staff may not plan a ground operation into Pakistan; a player may, the forecast warns, and launching makes the war total", async () => {
    const { forecastInput } = await import('../src/forecast/operation');
    const s = createSession('south-asia-2027', 1);
    const { world, engine } = s;
    const { map } = engine;
    const IND = 'IND' as NationId;
    engine.step(world);
    const lahore = map.nodeAt(31.55, 74.35);
    const brigades = Object.values(world.formations)
      .filter((f) => f.nation === IND && f.kind === 'maneuver' && f.status === 'active')
      .sort((a, b) => map.distanceKm(a.node, lahore) - map.distanceKm(b.node, lahore))
      .slice(0, 2)
      .map((f) => f.id);
    const result = (c: Command) => {
      world.pending.push(c);
      return engine.step(world).find((e): e is CommandResult => e.type === 'command_result' && e.command === c.type)!;
    };
    const aims = () => world.slices.diplomacy.wars[0].sides.map((x) => x.aim.kind);
    const plan: Extract<Command, { type: 'plan_operation' }> = { type: 'plan_operation', nation: IND, kind: 'offensive', objectives: [lahore], formations: brigades };

    expect(result(plan)).toMatchObject({ ok: false, code: 'beyond_war_aims' });
    expect(forecastInput(world, map, engine.catalog, plan, 2).beyondWarAims?.why).toMatch(/punitive/);

    world.nations[IND].controlledBy = 'human';
    const drafted = result({ ...plan, byPlayer: true });
    expect(drafted).toMatchObject({ ok: true, reason: expect.stringMatching(/past the war aims/) });
    expect(aims()).toEqual(['punitive', 'punitive']);

    expect(result({ type: 'launch_operation', nation: IND, operation: drafted.operation!, byPlayer: true })).toMatchObject({ ok: true });
    expect(aims()).toEqual(['total', 'total']);
  }, 300_000);
});

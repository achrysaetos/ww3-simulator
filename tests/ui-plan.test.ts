import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import type { GameMap } from '../src/core/map';
import type { CommandResult, Formation, NationId, NodeId, SimEvent } from '../src/core/types';
import { loadMap } from '../src/data/load';
import { createSession } from '../src/scenarios';
import { saveRun } from '../src/scenarios/save';
import { SimHost } from '../src/ui/host';
import { seenOnMap, type PlayerSight } from '../src/ui/map/feedback';
import { orderOptions } from '../src/ui/orders/options';
import { draftOf, newDraft, planCommand } from '../src/ui/orders/plan';
import { PlanPanel } from '../src/ui/orders/PlanPanel';
import { OrderTracks, SHOW_ANSWER_TICKS } from '../src/ui/orders/tracks';
import { applySnapshot, emptyClientState, type ClientState, type FromWorker } from '../src/ui/snapshot';

const RUS = 'RUS' as NationId, UKR = 'UKR' as NationId;

/** The page's side of a game run through the worker host: its mirror of the war, the events it was sent, and the clock. */
function page(text: string, map: GameMap = loadMap()) {
  const posts: FromWorker[] = [];
  const host = new SimHost((m) => posts.push(m));
  let state: ClientState | null = null;
  let nationIds: NationId[] = [];
  const events: SimEvent[] = [];
  const drain = () => {
    for (const m of posts.splice(0)) {
      if (m.type !== 'ready' && m.type !== 'snapshot') continue;
      if (m.type === 'ready') {
        nationIds = m.meta.nationIds;
        state = emptyClientState(map.size);
      }
      applySnapshot(state!, m.snapshot, nationIds, new Map());
      events.push(...m.snapshot.events);
      host.handle({ type: 'ack' });
    }
  };
  host.handle({ type: 'load', text });
  drain();
  return {
    host,
    events,
    get state() { return state!; },
    get world() { return host.world!; },
    map,
    step(n = 1) {
      for (let i = 0; i < n; i++) {
        host.handle({ type: 'step' });
        drain();
      }
    },
  };
}

describe('battle plan from the planner to the engine', () => {
  let saved: string;
  let force: Formation['id'][];
  let objective: NodeId;

  beforeAll(() => {
    const s = createSession('ukraine-2026', 1);
    s.world.nations[RUS].controlledBy = 'human';
    s.engine.run(s.world, 8);
    saved = saveRun('ukraine-2026', s.world);
    objective = s.map.nodeAt(48.72, 37.56)!;
    force = ['3rd Motor Rifle Division', '2nd Guards Motor Rifle Brigade', '4th Guards Motor Rifle Brigade']
      .map((n) => Object.values(s.world.formations).find((f) => f.nation === RUS && f.name.startsWith(n))!.id);
  }, 120_000);

  it('issues plan_operation for the drawn plan, and the operation and its answer reach the page', () => {
    const p = page(saved);
    const cmd = planCommand(newDraft(force, objective), RUS, true);
    expect(cmd).toMatchObject({ type: 'plan_operation', nation: RUS, objectives: [objective], formations: force, launch: true });
    p.host.handle({ type: 'command', command: cmd! });
    p.step(2);

    const answer = p.events.find((e): e is CommandResult => e.type === 'command_result' && e.command === 'plan_operation');
    expect(answer, 'the engine answers the plan').toBeDefined();
    expect(answer!.ok, answer!.reason).toBe(true);
    expect(answer!.byPlayer).toBe(true);
    const op = p.state.ops.find((o) => o.id === answer!.operation);
    expect(op, 'the operation is in the page mirror').toBeDefined();
    expect(op!.formations).toEqual(force);
    expect(op!.objectives).toEqual([objective]);
    expect(op!.phase).toBe('launched');
    expect(op).toEqual(p.world.slices.ops!.byId[op!.id]);

    const planner = renderToStaticMarkup(createElement(PlanPanel, {
      planning: { stage: 'review', draft: draftOf(op!), forecast: { status: 'idle' } }, op, units: p.state.formations.filter((f) => force.includes(f.entry.id)),
      from: 'Horlivka', objective: 'Kramatorsk', via: [], dayOf: (d: number) => `D+${d}`,
      onLaunch: () => {}, onSave: () => {}, onRedraw: () => {}, onCancelOperation: () => {}, onClose: () => {}, onRemove: () => {},
    }));
    expect(planner).toContain(op!.name);
    expect(planner).toContain('Under way');
    expect(planner).toContain('data-testid="plan-adjust"');
    expect(planner).not.toContain('data-testid="plan-launch"');
  }, 120_000);

  it('adjusting the operation sends adjust_operation, which the engine applies', () => {
    const p = page(saved);
    p.host.handle({ type: 'command', command: planCommand(newDraft(force, objective), RUS, false)! });
    p.step(1);
    const op = p.state.ops.find((o) => o.phase === 'draft')!;
    expect(op, 'the plan is filed as a draft').toBeDefined();
    const draft = { ...draftOf(op), formations: force.slice(0, 2) };
    const cmd = planCommand(draft, RUS, true);
    expect(cmd).toMatchObject({ type: 'adjust_operation', operation: op.id, formations: force.slice(0, 2) });
    p.host.handle({ type: 'command', command: cmd! });
    p.step(1);
    expect(p.state.ops.find((o) => o.id === op.id)!.formations).toEqual(force.slice(0, 2));
  }, 120_000);
});

describe('order answers on the map', () => {
  it('follows a radial order from sent to the engine’s answer, in the player’s words, then lets it fade', () => {
    const s = createSession('ukraine-2026', 1);
    s.world.nations[UKR].controlledBy = 'human';
    s.engine.run(s.world, 4);
    const p = page(saveRun('ukraine-2026', s.world), s.map);
    const f = Object.values(p.world.formations).find((x) => x.nation === UKR && x.kind === 'maneuver' && x.status === 'active' && [...p.map.neighbors(x.node)].some((n) => p.world.control[n] === RUS))!;
    const target = [...p.map.neighbors(f.node)].find((n) => p.world.control[n] === RUS)!;
    const attack = orderOptions(p.world, s.engine, UKR, [f.id], target).options.find((o) => o.key === 'attack')!;
    expect(attack.ok).toEqual([f.id]);

    const tracks = new OrderTracks();
    tracks.sent(f.id, 'Attack', target, p.state.tick);
    p.host.handle({ type: 'command', command: attack.commands[0] });
    let seen = 0;
    for (let i = 0; i < 12 && !['accepted', 'refused'].includes(tracks.get(f.id)?.state ?? ''); i++) {
      p.step(1);
      tracks.observe(p.events.slice(seen), p.state.tick, (r) => `words: ${r}`);
      seen = p.events.length;
    }
    const t = tracks.get(f.id)!;
    const real = p.events.filter((e): e is CommandResult => e.type === 'command_result' && e.formation === f.id).pop()!;
    expect(t.state).toBe(real.ok ? (real.code === 'relayed' ? 'relayed' : 'accepted') : 'refused');
    expect(t.state).toBe('accepted');
    expect(t.etaHours).toBe(real.ok ? (real.etaHours ?? null) : null);

    const answered = t.answeredTick!;
    tracks.observe([], answered + SHOW_ANSWER_TICKS);
    expect(tracks.get(f.id), 'still shown just after the answer').toBeDefined();
    tracks.observe([], answered + SHOW_ANSWER_TICKS + 1);
    expect(tracks.get(f.id), 'faded').toBeUndefined();

    tracks.sent(f.id, 'Move', target, p.state.tick);
    tracks.observe([{ type: 'command_result', tick: p.state.tick, nation: UKR, command: 'order', formation: f.id, byPlayer: true, ok: false, code: 'no_route', reason: 'no land route to node 12' }], p.state.tick, (r) => `words: ${r}`);
    expect(tracks.get(f.id)).toMatchObject({ state: 'refused', reason: 'words: no land route to node 12' });
  }, 120_000);
});

describe('battle and strike feedback', () => {
  const sight = (friends: string[], held: number[], forces: number[]): PlayerSight => ({
    friend: (n) => friends.includes(n), heldByFriend: (n) => held.includes(n), forcesAt: (n) => forces.includes(n),
  });
  const battle = (attacker: string, defender: string, node: number): SimEvent => ({ type: 'battle', tick: 1, node: node as NodeId, attacker: attacker as NationId, defender: defender as NationId, losses: {}, casualties: {} });
  const strike = (by: string, target: number): SimEvent => ({ type: 'strike', tick: 1, by: by as NationId, munition: 'x' as never, fired: 1, intercepted: 0, target: target as NodeId, effects: [] });

  it('shows the fights the player would know of and no others', () => {
    const me = sight(['UKR', 'POL'], [10], [20]);
    expect(seenOnMap(battle('RUS', 'UKR', 99), me)).toBe(true);
    expect(seenOnMap(battle('POL', 'BLR', 99), me)).toBe(true);
    expect(seenOnMap(battle('CHN', 'TWN', 10), me)).toBe(true);
    expect(seenOnMap(battle('CHN', 'TWN', 20), me)).toBe(true);
    expect(seenOnMap(battle('CHN', 'TWN', 99), me)).toBe(false);
    expect(seenOnMap(strike('RUS', 10), me)).toBe(true);
    expect(seenOnMap(strike('UKR', 99), me)).toBe(true);
    expect(seenOnMap(strike('CHN', 99), me)).toBe(false);
    expect(seenOnMap({ type: 'nuclear_detonation', tick: 1, by: 'CHN' as NationId, node: 99 as NodeId, yieldKt: 100, casualties: 1 }, me)).toBe(true);
  });

  it('keeps a war the player has no part in off the map in a real game', () => {
    const s = createSession('ukraine-2026', 1);
    const events: SimEvent[] = [];
    for (let i = 0; i < 6; i++) events.push(...s.engine.step(s.world));
    const battles = events.filter((e) => e.type === 'battle');
    expect(battles.length).toBeGreaterThan(0);
    // Played as a nation out of the war, far from it, the map shows none of its fights.
    const far = sight(['BRA'], [], []);
    expect(battles.filter((e) => seenOnMap(e, far))).toEqual([]);
    const near = sight(['UKR'], [], []);
    expect(battles.filter((e) => seenOnMap(e, near)).length).toBe(battles.filter((e) => e.type === 'battle' && (e.attacker === UKR || e.defender === UKR)).length);
  }, 60_000);
});

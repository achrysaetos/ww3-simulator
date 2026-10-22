import { afterEach, describe, expect, it } from 'vitest';
import type { Command, CommandResult, Formation, FormationId, NationId, NodeId } from '../src/core/types';
import { loadMap } from '../src/data/load';
import { orderDelayHours } from '../src/systems/c2';
import { authority } from '../src/systems/orders';
import { SimHost } from '../src/ui/host';
import type { FromWorker, ToWorker } from '../src/ui/snapshot';

const N = (s: string) => s as NationId;
const map = loadMap();

/** A real scenario played through the worker host, the way the page drives it. */
function play(scenario: string, nation: string) {
  const posts: FromWorker[] = [];
  const host = new SimHost((m) => posts.push(m));
  host.handle({ type: 'start', scenario, nation: N(nation), seed: 1 });
  const world = host.world!;
  const results = (): CommandResult[] =>
    posts.flatMap((m) => (m.type === 'snapshot' || m.type === 'ready' ? m.snapshot.events : [])).filter((e): e is CommandResult => e.type === 'command_result');
  const send = (command: unknown) => host.handle({ type: 'command', command: command as Command });
  const step = () => {
    host.handle({ type: 'ack' });
    host.handle({ type: 'step' });
  };
  /** Step until the engine gives a final answer (not 'relayed') about this formation, for at most two weeks. */
  const finalAnswer = (formation: FormationId): CommandResult => {
    for (let i = 0; i < 56; i++) {
      const done = results().find((r) => r.formation === formation && r.code !== 'relayed');
      if (done) return done;
      step();
    }
    throw new Error(`no answer for ${formation}`);
  };
  const named = (prefix: string): Formation => {
    const f = Object.values(world.formations).find((x) => x.nation === nation && x.name.startsWith(prefix));
    if (!f) throw new Error(`no formation ${prefix}`);
    return f;
  };
  open.push(host);
  return { host, world, results, send, step, finalAnswer, named };
}

const open: SimHost[] = [];
afterEach(() => {
  for (const h of open.splice(0)) h.handle({ type: 'quit' });
});

describe('one player nation per game (BA-1)', () => {
  it('refuses peace offers and treaty answers made as the enemy, and no message switches sides', () => {
    const g = play('south-asia-2027', 'IND');
    for (let i = 0; i < 26; i++) g.step();
    const pending = g.world.pending.length;

    g.send({ type: 'offer_peace', nation: 'PAK', target: 'IND' });
    g.send({ type: 'answer_treaty', nation: 'PAK', war: 'any', treaty: 'any', join: false });
    expect(g.world.pending).toHaveLength(pending);
    expect(g.results().slice(-2).map((r) => [r.command, r.ok, r.code])).toEqual([['offer_peace', false, 'not_yours'], ['answer_treaty', false, 'not_yours']]);

    g.host.handle({ type: 'play_as', nation: N('PAK') } as ToWorker);
    expect(g.world.nations[N('PAK')].controlledBy).toBe('ai');
    expect(g.world.nations[N('IND')].controlledBy).toBe('human');
    g.send({ type: 'offer_peace', nation: 'PAK', target: 'IND' });
    expect(g.world.pending).toHaveLength(pending);
    expect(g.results().at(-1)).toMatchObject({ command: 'offer_peace', ok: false, code: 'not_yours' });
  }, 120_000);

  it('refuses an order to a formation of another nation at the boundary and in the engine', () => {
    const g = play('south-asia-2027', 'IND');
    const pak = Object.values(g.world.formations).find((f) => f.nation === 'PAK' && f.kind === 'maneuver')!;
    g.send({ type: 'order', nation: 'IND', formation: pak.id, order: { posture: 'defend' } });
    expect(g.results().at(-1)).toMatchObject({ formation: pak.id, ok: false, code: 'not_yours' });

    // A command that bypasses the boundary meets the same refusal inside the engine.
    const before = pak.order;
    g.world.pending.push({ type: 'order', nation: N('IND'), formation: pak.id, order: { posture: 'reserve' }, byPlayer: true });
    g.step();
    expect(g.results().at(-1)).toMatchObject({ formation: pak.id, ok: false, code: 'not_yours' });
    expect(pak.order).toEqual(before);
    expect(authority(g.world, N('IND')).held[pak.id]).toBeUndefined();
  }, 120_000);
});

describe('every order answers back (BB-4, BA-5)', () => {
  it('refuses an Iskander strike on Rzeszow about 1,000 km out, an air assault without air cover and a march with no land route, and the AI keeps each unit', () => {
    const g = play('ww3-2027', 'RUS');
    g.step();
    const cases: [Formation, Extract<Command, { type: 'order' }>['order'], CommandResult['code']][] = [
      [g.named('448th Missile Brigade'), { posture: 'strike', target: map.nodeAt(50.04, 22.0), targetClass: 'structure' }, 'out_of_range'],
      // The transports carry an assault echelon of the division, but NATO holds the air over Riga.
      [g.named('76th Guards Air Assault'), { posture: 'air_assault', target: map.nodeAt(56.95, 24.1) }, 'no_air_cover'],
      [g.named('47th Guards Tank Division'), { posture: 'attack', target: map.nodeAt(51.5, -0.1) }, 'no_route'],
    ];
    for (const [f, order, code] of cases) {
      g.send({ type: 'order', nation: 'RUS', formation: f.id, order });
      expect(g.finalAnswer(f.id), f.name).toMatchObject({ ok: false, code, byPlayer: true });
      expect(authority(g.world, N('RUS')).held[f.id], f.name).toBeUndefined();
      expect(f.order.posture === order.posture && f.order.target === order.target, f.name).toBe(false);
    }
  }, 180_000);
});

describe('orders in transit down a degraded chain of command', () => {
  it('answers relayed with an arrival time, keeps the delegate off the unit meanwhile, and hands it back when the order is refused', () => {
    const g = play('ukraine-2026', 'UKR');
    let slow: Formation | undefined;
    for (let i = 0; i < 40 && !slow; i++) {
      g.step();
      slow = Object.values(g.world.formations).find((f) => f.nation === 'UKR' && f.kind === 'maneuver' && f.status === 'active' && orderDelayHours(g.world, f.id) >= 2 * g.world.dtHours);
    }
    expect(slow).toBeDefined();
    const f = slow!;
    g.send({ type: 'order', nation: 'UKR', formation: f.id, order: { posture: 'attack', target: map.nodeAt(51.5, -0.1) } });
    g.step();
    expect(g.results().filter((r) => r.formation === f.id)).toEqual([expect.objectContaining({ ok: true, code: 'relayed', etaHours: expect.any(Number) })]);
    expect(authority(g.world, N('UKR')).held[f.id]).toBe(true);
    expect(g.finalAnswer(f.id)).toMatchObject({ ok: false, code: 'no_route' });
    expect(authority(g.world, N('UKR')).held[f.id]).toBeUndefined();
  }, 180_000);
});

describe('air wings rebase from the command path (BA-6)', () => {
  it('moves a wing to a friendly airfield within ferry range and reports it', () => {
    const g = play('ww3-2027', 'RUS');
    const wing = Object.values(g.world.formations).find((f) => f.nation === 'RUS' && f.kind === 'air_wing' && f.status === 'active')!;
    let base: NodeId | undefined;
    for (let n = 0; n < map.landCount && base === undefined; n++) {
      const km = map.distanceKm(wing.node, n as NodeId);
      if (map.airports[n] && g.world.control[n] === 'RUS' && km > 150 && km < 600) base = n as NodeId;
    }
    expect(base).toBeDefined();
    g.send({ type: 'order', nation: 'RUS', formation: wing.id, order: { posture: 'move', target: base } });
    expect(g.finalAnswer(wing.id)).toMatchObject({ ok: true, code: 'accepted' });
    expect(wing.node).toBe(base);
    expect(authority(g.world, N('RUS')).held[wing.id]).toBe(true);
  }, 120_000);
});

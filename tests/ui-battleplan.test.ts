import { describe, expect, it } from 'vitest';
import type { Command, CommandResult, Formation, NationId, NodeId, World } from '../src/core/types';
import { createSession } from '../src/scenarios';
import { orderOptions, type OrderOption } from '../src/ui/orders/options';
import { posturesOf } from '../src/ui/orders/postures';

type Session = ReturnType<typeof createSession>;

function war(scenario: string, player: string, ticks: number): Session {
  const s = createSession(scenario, 1);
  s.world.nations[player as NationId].controlledBy = 'human';
  for (let i = 0; i < ticks; i++) s.engine.step(s.world);
  return s;
}

/** The engine's final answer to `cmd` sent for real, on a copy of the world: through the chain of command if it is relayed. */
function realAnswer(s: Session, cmd: Command): CommandResult {
  const w: World = structuredClone(s.world);
  w.pending.push(cmd);
  for (let t = 0; t < 40; t++) {
    for (const e of s.engine.step(w)) {
      if (e.type !== 'command_result' || e.command !== cmd.type || e.code === 'relayed') continue;
      if (cmd.type === 'order' && e.formation !== cmd.formation) continue;
      return e;
    }
  }
  throw new Error(`no answer to ${JSON.stringify(cmd)}`);
}

function frontBrigade(s: Session, nation: string, enemy: string): { f: Formation; target: NodeId } {
  for (const f of Object.values(s.world.formations)) {
    if (f.nation !== nation || f.kind !== 'maneuver' || f.status !== 'active') continue;
    const target = s.map.neighbors(f.node).find((n) => s.world.control[n] === enemy);
    if (target !== undefined) return { f, target };
  }
  throw new Error('no brigade on the line');
}

const UKR = 'UKR' as NationId;

/** The command a radial option issues for one formation, as the page sends it. */
function sent(o: OrderOption, f: Formation, node: NodeId): Command {
  if (o.key === 'plan') return { type: 'plan_operation', nation: f.nation, kind: 'offensive', objectives: [node], formations: [f.id], launch: true, byPlayer: true };
  const needsTarget = o.key !== 'defend' && o.key !== 'reserve';
  return { type: 'order', nation: f.nation, formation: f.id, byPlayer: true, order: { posture: o.key, ...(needsTarget ? { target: node } : {}), ...(o.targetClass ? { targetClass: o.targetClass } : {}) } };
}

describe('radial order menu', () => {
  it('offers only the orders a brigade takes, greys the ones the engine refuses with its reason, and never writes the live world', () => {
    const s = war('ukraine-2026', 'UKR', 4);
    const { f, target } = frontBrigade(s, 'UKR', 'RUS');
    const ankara = s.map.nodeAt(39.9, 32.85)!;
    const before = JSON.stringify(s.world);
    let greyed = 0, offered = 0;
    for (const node of [target, f.node, ankara]) {
      const { options } = orderOptions(s.world, s.engine, UKR, [f.id], node);
      expect(options.map((o) => o.key).sort()).toEqual([...posturesOf(f), 'plan'].sort());
      for (const o of options) {
        const real = realAnswer(s, sent(o, f, node));
        if (o.ok.length) {
          offered++;
          expect(real.ok, `${o.key} at ${node}: ${real.reason}`).toBe(true);
        } else {
          greyed++;
          expect(real.ok, `${o.key} at ${node} greyed but accepted`).toBe(false);
          expect(o.refused[0].code).toBe(real.ok ? '' : real.code);
          expect(o.refused[0].reason).toBe(real.reason);
        }
      }
    }
    expect(offered).toBeGreaterThan(5);
    expect(greyed).toBeGreaterThan(1);
    expect(JSON.stringify(s.world)).toBe(before);
  });

  it('offers a bare cell the nearest units that can attack, strike and plan for it', () => {
    const s = war('ukraine-2026', 'UKR', 4);
    const { target } = frontBrigade(s, 'UKR', 'RUS');
    const { options } = orderOptions(s.world, s.engine, UKR, [], target);
    expect(options.map((o) => o.key)).toEqual(['attack', 'strike', 'plan']);
    for (const o of options) {
      expect(o.ok.length, o.key).toBeGreaterThan(0);
      for (const id of o.ok) expect(s.world.formations[id].nation).toBe(UKR);
    }
    expect(s.world.formations[options[0].ok[0]].kind).toBe('maneuver');
    expect(['artillery', 'missile', 'air_wing']).toContain(s.world.formations[options[1].ok[0]].kind);
    const real = realAnswer(s, options[1].commands[0]);
    expect(real.ok).toBe(true);
  });

  it('asking for options does not change the war: a run with the menu open every tick matches one without', () => {
    const a = war('ukraine-2026', 'UKR', 2), b = war('ukraine-2026', 'UKR', 2);
    for (let t = 0; t < 6; t++) {
      const { f, target } = frontBrigade(a, 'UKR', 'RUS');
      orderOptions(a.world, a.engine, UKR, [f.id], target);
      orderOptions(a.world, a.engine, UKR, [], target);
      a.engine.step(a.world);
      b.engine.step(b.world);
    }
    expect(JSON.stringify(a.world)).toBe(JSON.stringify(b.world));
  });
});

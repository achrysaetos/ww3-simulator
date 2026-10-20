import { describe, expect, it } from 'vitest';
import { relationMut, type System } from '../src/core/engine';
import type { Command, NodeId, SimEvent } from '../src/core/types';
import { createAi } from '../src/systems/ai';
import { createDiplomacy } from '../src/systems/diplomacy';
import { id, testWorld } from '../src/testkit';

const N = id.nation;
type T = ReturnType<typeof testWorld>;

const brigade = (t: T, nation: string, node: NodeId) =>
  t.add({ nation: N(nation), name: `${nation} armoured brigade`, kind: 'maneuver', echelon: 'brigade', node, equipment: { [id.platform('t_mbt')]: 30 } });

/** Commands the AI queued after each tick, over `ticks` ticks. */
function commandsOver(t: T, ticks: number): Command[] {
  const out: Command[] = [];
  t.engine.run(t.world, ticks, (w) => out.push(...w.pending));
  return out;
}

const orders = (cmds: Command[], nation: string, posture: string) =>
  cmds.filter((c): c is Extract<Command, { type: 'order' }> => c.type === 'order' && c.nation === nation && c.order.posture === posture);

/** Cells of `a` touching cells held by `b`, computed straight from the map. */
function border(t: T, a: string, b: string): NodeId[] {
  return t.map.nodesOf(N(a)).filter((n) => [...t.map.neighbors(n)].some((m) => !t.map.isSea(m) && t.world.control[m] === b));
}

describe('operational AI', () => {
  it('sends defenders to its own front cells', () => {
    const t = testWorld([createAi()]);
    t.war('EST', 'RUS');
    const tallinn = t.world.nations[N('EST')].capital;
    for (let i = 0; i < 3; i++) brigade(t, 'EST', tallinn);
    for (const n of border(t, 'RUS', 'EST').slice(0, 2)) brigade(t, 'RUS', n);

    const defend = orders(commandsOver(t, 4), 'EST', 'defend');
    const front = new Set(border(t, 'EST', 'RUS'));
    expect(defend.length).toBeGreaterThan(0);
    expect(defend.every((o) => front.has(o.order.target!))).toBe(true);
  });

  it('pulls a unit out of supply back from the front instead of keeping it in the line', () => {
    const t = testWorld([createAi()]);
    t.war('EST', 'RUS');
    const front = border(t, 'EST', 'RUS');
    const spent = brigade(t, 'EST', front[0]);
    spent.supply = { fuel: 0, ammo: 0, food: spent.supply.food };
    brigade(t, 'RUS', border(t, 'RUS', 'EST')[0]);

    const mine = commandsOver(t, 4).filter((c): c is Extract<Command, { type: 'order' }> => c.type === 'order' && c.formation === spent.id);
    expect(mine.length).toBeGreaterThan(0);
    for (const o of mine) {
      expect(o.order.posture).not.toBe('defend');
      expect(o.order.posture).not.toBe('attack');
      if (o.order.target !== undefined) expect(front).not.toContain(o.order.target);
    }
  });

  const CAUTIOUS = { casualtyTolerance: 0.4, interventionism: 0.3, riskTolerance: 0.3, aggression: 0.1 };
  const ATTRITIONAL = { casualtyTolerance: 0.85, interventionism: 0.5, riskTolerance: 0.6, aggression: 0.75 };
  const assault = (attackers: number, profile = CAUTIOUS) => {
    const t = testWorld([createAi({ RUS: profile })]);
    t.war('EST', 'RUS');
    for (const n of border(t, 'EST', 'RUS')) brigade(t, 'EST', n);
    const staging = border(t, 'RUS', 'EST')[0];
    for (let i = 0; i < attackers; i++) brigade(t, 'RUS', staging);
    return { t, cmds: commandsOver(t, 4) };
  };

  it('a cautious command does not attack without a 3:1 local superiority', () => {
    const { cmds } = assault(4);
    expect(orders(cmds, 'RUS', 'attack')).toEqual([]);
    expect(orders(cmds, 'RUS', 'defend').length).toBeGreaterThan(0);
  });

  it('an aggressive, casualty-tolerant command keeps assaulting at local parity', () => {
    const t = testWorld([createAi({ RUS: ATTRITIONAL })]);
    t.war('EST', 'RUS');
    const est = border(t, 'EST', 'RUS');
    for (const n of est) brigade(t, 'EST', n);
    const staging = border(t, 'RUS', 'EST')[0];
    brigade(t, 'RUS', staging);
    const attacks = orders(commandsOver(t, 4), 'RUS', 'attack');
    expect(attacks.length).toBeGreaterThan(0);
    for (const a of attacks) expect(est).toContain(a.order.target);
    // The same lone brigade under a cautious command only defends.
    const cautious = testWorld([createAi({ RUS: CAUTIOUS })]);
    cautious.war('EST', 'RUS');
    for (const n of est) brigade(cautious, 'EST', n);
    brigade(cautious, 'RUS', staging);
    expect(orders(commandsOver(cautious, 4), 'RUS', 'attack')).toEqual([]);
  });

  it('attacks with at least 3:1 at the point of attack when it has the forces', () => {
    const { t, cmds } = assault(12);
    const attacks = orders(cmds, 'RUS', 'attack');
    expect(attacks.length).toBeGreaterThan(0);
    const byTarget = new Map<number, number>();
    for (const a of attacks) byTarget.set(a.order.target!, (byTarget.get(a.order.target!) ?? 0) + 1);
    // All brigades are identical, so counting them is counting combat power.
    const estAt = (n: number) => Object.values(t.world.formations).filter((f) => f.nation === 'EST' && f.node === n).length;
    for (const [target, count] of byTarget) {
      expect(t.world.control[target]).toBe('EST');
      const support = [...t.map.neighbors(target as NodeId)].filter((m) => t.world.control[m] === 'EST').reduce((s, m) => s + estAt(m), 0);
      expect(count).toBeGreaterThanOrEqual(3 * (estAt(target) + 0.5 * support));
    }
  });
});

describe('nuclear release', () => {
  const emitter = (at: number, e: (tick: number) => SimEvent): System => ({ id: 'emitter', step: (w, ctx) => { if (w.tick === at) ctx.emit(e(w.tick)); } });

  /** `victim` has lost its most populous cells near the capital to `enemy`, whose troops stand next to the capital. */
  const losing = (t: T, victim: string, enemy: string, popLost: number) => {
    const cap = t.world.nations[N(victim)].capital;
    const cells = t.map.nodesOf(N(victim)).filter((n) => n !== cap).sort((a, b) => t.map.distanceKm(a, cap) - t.map.distanceKm(b, cap));
    let lost = 0;
    for (const n of cells) {
      if (lost >= popLost) break;
      t.world.control[n] = N(enemy);
      lost += t.map.popShare[n];
    }
    for (const n of [...t.map.neighbors(cap)].filter((m) => !t.map.isSea(m)).slice(0, 2)) brigade(t, enemy, n);
    t.add({ nation: N(victim), name: 'Strategic rocket division', kind: 'strategic', echelon: 'division', node: cells[cells.length - 1], equipment: { [id.platform('t_icbm')]: 10 } });
  };
  const releases = (cmds: Command[], nation: string) => cmds.filter((c) => c.type === 'nuclear_release' && c.nation === nation);

  it('a no-first-use state facing defeat does not release until it has been struck by nuclear weapons', () => {
    let struck: NodeId = 0 as NodeId;
    const t = testWorld([
      emitter(40, (tick) => ({ type: 'nuclear_detonation', tick, by: N('RUS'), node: struck, yieldKt: 10, casualties: 2000 })),
      createDiplomacy(),
      createAi({ CHN: { casualtyTolerance: 0.5, interventionism: 0.5, riskTolerance: 1, aggression: 0.5 } }),
    ]);
    t.world.nations[N('CHN')].nuclear = { warheads: 500, deployed: 300, doctrine: 'no_first_use' };
    t.war('CHN', 'RUS');
    losing(t, 'CHN', 'RUS', 0.3);
    struck = t.map.nodesOf(N('CHN'))[0];

    const before = commandsOver(t, 40);
    expect(t.world.slices.diplomacy.assessment[N('CHN')].capitalThreatened).toBe(true);
    expect(releases(before, 'CHN')).toEqual([]);
    const after = commandsOver(t, 12);
    expect(releases(after, 'CHN').length).toBeGreaterThan(0);
  });

  it('an escalate-to-deescalate state releases once its doctrine threshold is crossed, and not before', () => {
    const run = (popLost: number) => {
      const t = testWorld([createDiplomacy(), createAi({ RUS: { casualtyTolerance: 0.5, interventionism: 0.5, riskTolerance: 1, aggression: 0.5 } })]);
      t.world.nations[N('RUS')].nuclear = { warheads: 1500, deployed: 1500, doctrine: 'escalate_to_deescalate' };
      t.war('RUS', 'UKR');
      if (popLost > 0) losing(t, 'RUS', 'UKR', popLost);
      else t.add({ nation: N('RUS'), name: 'Strategic rocket division', kind: 'strategic', echelon: 'division', node: t.nodeAt(56, 60), equipment: { [id.platform('t_icbm')]: 10 } });
      return releases(commandsOver(t, 24), 'RUS') as Extract<Command, { type: 'nuclear_release' }>[];
    };
    expect(run(0)).toEqual([]);
    const fired = run(0.15);
    expect(fired.length).toBeGreaterThan(0);
    expect(fired[0]).toMatchObject({ munition: 't_nuke', warheads: 1 });
  });
});

describe('strikes on a neutral host', () => {
  /** Strike orders China's missile brigade aims at a US air wing based at Yonaguni, Japan, ~150 km from Taiwan. */
  const strikesOnJapan = (japanOpinionOfChina: number) => {
    const t = testWorld([createDiplomacy(), createAi()]);
    const base = t.map.nodeAt(24.45, 123.0);
    const launch = t.map.nodesOf(N('CHN')).sort((a, b) => t.map.distanceKm(a, base) - t.map.distanceKm(b, base))[0];
    t.add({ nation: N('USA'), name: 'US air wing', kind: 'air_wing', echelon: 'wing', node: base, equipment: { [id.platform('t_fighter')]: 24 } });
    t.add({ nation: N('CHN'), name: 'PLARF brigade', kind: 'missile', echelon: 'brigade', node: launch, equipment: { [id.platform('t_tel')]: 12 } });
    relationMut(t.world, N('CHN'), N('JPN')).opinion = japanOpinionOfChina;
    t.war('CHN', 'TWN');
    t.war('CHN', 'USA');
    return commandsOver(t, 8).filter((c) => c.type === 'order' && c.nation === 'CHN' && c.order.posture === 'strike' && c.order.target === base);
  };

  it('hits enemy forces on a hostile host inside the theatre', () => {
    expect(strikesOnJapan(-55).length).toBeGreaterThan(0);
  });

  it('leaves them alone on a host that is not hostile', () => {
    expect(strikesOnJapan(20)).toEqual([]);
  });
});

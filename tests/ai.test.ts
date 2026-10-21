import { describe, expect, it } from 'vitest';
import { atWar, relationMut, type System } from '../src/core/engine';
import type { Command, MunitionId, NationId, NodeId, SimEvent } from '../src/core/types';
import { createSession } from '../src/scenarios';
import { createAi } from '../src/systems/ai';
import { createDiplomacy } from '../src/systems/diplomacy';
import { isrFactor } from '../src/systems/strategic';
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
    // Deep stocks, so the fire budget never rations the salvo and only the host's politics decides.
    t.world.nations[N('CHN')].stockpile[id.munition('t_srbm')] = 10_000;
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

describe('strike wing basing', () => {
  it('long-range bombers in the continental US forward-deploy across the Pacific once at war with China, then fly strikes from there', () => {
    const s = createSession('taiwan-2027', 1);
    const [wing, other] = ['7th Bomb Wing', '28th Bomb Wing'].map((name) => Object.values(s.world.formations).find((f) => f.name === name)!);
    const home = wing.node;
    const perDay = 24 / s.world.dtHours;
    for (let i = 0; i < 30 * perDay && !atWar(s.world, 'USA' as NationId, 'CHN' as NationId); i++) s.engine.step(s.world);
    expect(atWar(s.world, 'USA' as NationId, 'CHN' as NationId)).toBe(true);
    // Both B-1B wings move together; LRASMs are rationed, so either may be the one a salvo draws.
    const lrasm = () => (wing.magazine['lrasm' as MunitionId] ?? 0) + (other.magazine['lrasm' as MunitionId] ?? 0);
    let firedAbroad = 0;
    for (let i = 0; i < 14 * perDay; i++) {
      const before = lrasm();
      s.engine.step(s.world);
      if (s.map.distanceKm(wing.node, home) > 8000) firedAbroad += before - lrasm();
    }
    expect(s.map.distanceKm(wing.node, home)).toBeGreaterThan(8000);
    expect(firedAbroad).toBeGreaterThan(0);
  }, 120_000);
});

describe('grid campaign', () => {
  it("Russia's strikes cut the grid serving Ukraine's largest cities; Ukraine, with no such doctrine, leaves Russia's grid alone", () => {
    const s = createSession('ukraine-2026', 1);
    s.engine.run(s.world, (21 * 24) / s.world.dtHours);
    const grid = s.world.theater.power ?? {};
    const cities = s.map.cities.filter((c) => c.nation === 'UKR').sort((a, b) => b.pop - a.pop).slice(0, 3);
    expect(cities.filter((c) => (grid[c.node] ?? 1) < 0.9).length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(grid).filter((n) => s.world.control[Number(n)] === 'RUS')).toEqual([]);
  }, 120_000);
});

describe('coalition allocation', () => {
  const NATO = ['POL', 'LTU', 'LVA', 'EST', 'FIN', 'DEU'];
  /** NATO at war with Russia, Russian brigades on the Estonian and Lithuanian borders, and a Polish army at Warsaw. */
  function alliance(polish: { readiness: number; territorial?: true }[]) {
    const t = testWorld([createAi()]);
    for (const n of NATO) t.world.nations[N(n)].blocs = ['NATO'];
    for (const n of NATO) t.war('RUS', n);
    for (const host of ['EST', 'LTU']) for (const n of border(t, 'RUS', host).slice(0, 3)) for (let i = 0; i < 3; i++) brigade(t, 'RUS', n);
    const tallinn = t.world.nations[N('EST')].capital;
    const estonians = [0, 1, 2].map(() => brigade(t, 'EST', tallinn));
    const warsaw = t.world.nations[N('POL')].capital;
    const poles = polish.map((o) => Object.assign(brigade(t, 'POL', warsaw), o));
    const last = new Map<string, Extract<Command, { type: 'order' }>>();
    for (const c of commandsOver(t, 8)) if (c.type === 'order') last.set(c.formation, c);
    const abroad = (f: { id: string }) => {
      const target = last.get(f.id)?.order.target;
      return target !== undefined && t.map.owner[target] !== N('POL');
    };
    return { t, estonians, poles, last, abroad };
  }

  it('keeps territorial defence and units still inside their notice to move at home', () => {
    const { poles, abroad } = alliance([
      { readiness: 0.9, territorial: true }, { readiness: 0.9, territorial: true },
      { readiness: 0.5 }, { readiness: 0.5 },
    ]);
    expect(poles.filter(abroad)).toHaveLength(0);
  });

  it('sends at most half of an untouched army to its partners', () => {
    const { poles, abroad } = alliance(Array.from({ length: 10 }, () => ({ readiness: 0.95 })));
    const tanks = (fs: typeof poles) => fs.reduce((a, f) => a + (f.equipment[id.platform('t_mbt')] ?? 0), 0);
    expect(tanks(poles.filter(abroad))).toBeGreaterThan(0);
    expect(tanks(poles.filter(abroad))).toBeLessThanOrEqual(tanks(poles) / 2);
  });

  it('holds a small country’s reserve inside it rather than across the water', () => {
    const { t, estonians, last } = alliance([]);
    const posts = estonians.map((f) => last.get(f.id)?.order.target).filter((n) => n !== undefined);
    expect(posts.length).toBeGreaterThan(0);
    for (const n of posts) expect(t.map.owner[n!]).toBe(N('EST'));
  });
});

describe('counter-space strikes', () => {
  it('ASAT units at war with a space power shoot down its satellites, each interceptor only within its ceiling', () => {
    const s = createSession('ww3-2027', 1);
    const gps = Object.values(s.world.formations).find((f) => f.name.startsWith('GPS constellation'))!;
    const kills: Record<string, number> = {};
    s.engine.run(s.world, (9 * 24) / s.world.dtHours, (_w, events) => {
      for (const e of events) {
        if (e.type !== 'strike') continue;
        for (const x of e.effects) if (x.kind === 'satellites_destroyed') kills[`${e.munition}@${e.target === gps.node ? 'gps' : 'leo'}`] = (kills[`${e.munition}@${e.target === gps.node ? 'gps' : 'leo'}`] ?? 0) + x.count;
      }
    });
    expect(Object.values(kills).reduce((a, n) => a + n, 0)).toBeGreaterThan(5);
    expect(isrFactor(s.world, N('USA'))).toBeLessThan(1);
    // SC-19 and Nudol top out near 1,000-1,500 km; only the DN-3 climbs to GPS at 20,200 km.
    expect(Object.keys(kills).filter((k) => k.endsWith('@gps') && !k.startsWith('dn3'))).toEqual([]);
  }, 180_000);

  it('moves its interceptors off a constellation shot down to its last satellite', () => {
    const s = createSession('ww3-2027', 1);
    const fs = Object.values(s.world.formations);
    const nro = fs.find((f) => f.name.startsWith('NRO imaging'))!;
    const brigade = fs.find((f) => f.nation === 'CHN' && f.name.includes('ASAT'))!;
    nro.equipment = { [id.platform('kh11')]: 1 };
    const r = relationMut(s.world, N('CHN'), N('USA'));
    Object.assign(r, { atWar: true, escalation: 'conventional', warSince: s.world.tick });
    s.world.nations[N('CHN')].status = s.world.nations[N('USA')].status = 'war';
    const targets = new Set<string>();
    s.engine.run(s.world, 4, (w) => {
      for (const c of w.pending) if (c.type === 'order' && c.formation === brigade.id && c.order.targetFormation) targets.add(c.order.targetFormation);
    });
    expect(targets.size).toBeGreaterThan(0);
    expect(targets.has(nro.id)).toBe(false);
  }, 60_000);
});

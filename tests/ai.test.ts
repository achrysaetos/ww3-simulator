import { describe, expect, it } from 'vitest';
import { atWar, relationMut, type System } from '../src/core/engine';
import type { Command, MunitionId, NationId, NodeId, SimEvent } from '../src/core/types';
import { createSession } from '../src/scenarios';
import { createAi } from '../src/systems/ai';
import { indexForces } from '../src/systems/ai/forces';
import { stagingSector } from '../src/systems/ai/fronts';
import { landSlice } from '../src/systems/land';
import { createDiplomacy } from '../src/systems/diplomacy';
import { DEFAULT_DELEGATION } from '../src/systems/orders';
import { isrFactor, strategic } from '../src/systems/strategic';
import { id, testWorld } from '../src/testkit';
import { airWorld, wing } from './air.fixture';
import { navalWar } from '../src/systems/naval';

const N = id.nation;
type T = ReturnType<typeof testWorld>;

const brigade = (t: T, nation: string, node: NodeId) =>
  t.add({ nation: N(nation), name: `${nation} armoured brigade`, kind: 'maneuver', echelon: 'brigade', node, equipment: { [id.platform('t_mbt')]: 30 } });

/** Commands the AI queued after each tick, over `ticks` ticks. */
function commandsOver(t: Pick<T, 'engine' | 'world'>, ticks: number): Command[] {
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
    // Estonia's border is four half-degree cells, each of which the command holds before it attacks.
    const { t, cmds } = assault(16);
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

  it('stages only from a host that consented: Russia from Belarus, never Turkey from Azerbaijan on the strength of a defence pact', () => {
    const t = testWorld([createAi()]);
    t.war('TUR', 'RUS');
    t.war('RUS', 'UKR');
    for (const n of ['TUR', 'AZE']) t.world.nations[N(n)].blocs = ['TUR-AZE'];
    for (const n of ['RUS', 'BLR']) t.world.nations[N(n)].blocs = ['RUS-BLR'];
    const index = indexForces(t.world, t.catalog);
    expect(stagingSector(t.world, t.map, N('TUR'), new Set([N('TUR')]), new Set([N('RUS')]), index)).toBeUndefined();
    const belarus = stagingSector(t.world, t.map, N('RUS'), new Set([N('RUS')]), new Set([N('UKR'), N('TUR')]), index);
    expect(belarus?.nodes.every((n) => t.world.control[n] === 'BLR')).toBe(true);
  });
});

describe('nuclear release', () => {
  const emitter = (at: number, e: (tick: number) => SimEvent): System => ({ id: 'emitter', step: (w, ctx) => { if (w.tick === at) ctx.emit(e(w.tick)); } });

  /** `victim` has lost its most populous cells near the capital to `enemy`, whose troops stand next to the capital. */
  const homeland = (t: T, victim: string) => {
    const cap = t.world.nations[N(victim)].capital;
    return t.map.nodesOf(N(victim)).filter((n) => n !== cap).sort((a, b) => t.map.distanceKm(a, cap) - t.map.distanceKm(b, cap));
  };
  /** `enemy` takes `victim`'s cells nearest the capital until it holds `popLost` of the homeland's people. */
  const take = (t: T, victim: string, enemy: string, popLost: number) => {
    let lost = 0;
    for (const n of homeland(t, victim)) {
      if (lost >= popLost) break;
      if (t.world.control[n] !== N(enemy)) t.world.control[n] = N(enemy);
      lost += t.map.popShare[n];
    }
  };
  const losing = (t: T, victim: string, enemy: string, popLost: number) => {
    const cells = homeland(t, victim);
    take(t, victim, enemy, popLost);
    const cap = t.world.nations[N(victim)].capital;
    for (const n of [...t.map.neighbors(cap)].filter((m) => !t.map.isSea(m)).slice(0, 2)) brigade(t, enemy, n);
    t.add({ nation: N(victim), name: 'Strategic rocket division', kind: 'strategic', echelon: 'division', node: cells[cells.length - 1], equipment: { [id.platform('t_icbm')]: 10 } });
  };
  const bold = { casualtyTolerance: 0.5, interventionism: 0.5, riskTolerance: 1, aggression: 0.5 };
  const refusals = (events: SimEvent[]) => events.filter((e) => e.type === 'message' && e.text.startsWith('nuclear release refused'));
  const releases = (cmds: Command[], nation: string) => cmds.filter((c) => c.type === 'nuclear_release' && c.nation === nation);
  /** Each release `nation` orders over `ticks`, with the tick it was ordered on. */
  const releasesOver = (t: T, ticks: number, nation: string) => {
    const out: (Extract<Command, { type: 'nuclear_release' }> & { tick: number })[] = [];
    t.engine.run(t.world, ticks, (w) => {
      for (const c of w.pending) if (c.type === 'nuclear_release' && c.nation === nation) out.push({ ...c, tick: w.tick });
    });
    return out;
  };

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
    // One attack draws one answer, not a salvo every few days for the rest of the war.
    const after = releasesOver(t, 120, 'CHN');
    expect(new Set(after.map((r) => r.tick)).size).toBe(1);
    // China's answer is massive and countervalue: Russian cities, several at once, never ground Russia does not hold.
    expect(after.length).toBeGreaterThan(2);
    for (const r of after) expect(t.world.control[r.target]).toBe('RUS');
    expect(after.some((r) => t.map.cities.some((c) => c.node === r.target && c.nation === 'RUS'))).toBe(true);
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

  it('chooses a target and warhead that one of its launchers can deliver', () => {
    const t = testWorld([strategic, createDiplomacy(), createAi({ RUS: bold })]);
    t.world.nations[N('RUS')].nuclear = { warheads: 1500, deployed: 1500, doctrine: 'escalate_to_deescalate' };
    t.war('RUS', 'UKR');
    losing(t, 'RUS', 'UKR', 0.15);
    // The smallest warhead Russia holds sits on rockets 6,000 km from the fighting.
    const far = t.add({ nation: N('RUS'), name: 'Pacific rocket brigade', kind: 'missile', echelon: 'brigade', node: t.nodeAt(43.1, 131.9), equipment: { [id.platform('t_tel')]: 4 } });
    far.magazine[id.munition('t_nuke_tac')] = 4;

    const events: SimEvent[] = [];
    t.engine.run(t.world, 24, (_, e) => events.push(...e));
    expect(refusals(events)).toEqual([]);
    expect(events.filter((e) => e.type === 'nuclear_detonation' && e.by === 'RUS').length).toBeGreaterThan(0);
  });

  it('weighs first use once at each rung of the ladder, and again only when the war worsens', () => {
    const t = testWorld([createDiplomacy(), createAi({ RUS: bold })]);
    t.world.nations[N('RUS')].nuclear = { warheads: 1500, deployed: 1500, doctrine: 'escalate_to_deescalate' };
    t.war('RUS', 'UKR');
    losing(t, 'RUS', 'UKR', 0.06);
    // A month at the threshold with nothing changing: one decision, whatever it was.
    expect(releases(commandsOver(t, 120), 'RUS').length).toBeLessThanOrEqual(1);
    take(t, 'RUS', 'UKR', 0.2);
    const next = releasesOver(t, 12, 'RUS');
    expect(next.length).toBeGreaterThan(0);
    expect(new Set(next.map((r) => r.tick)).size).toBe(1);
    expect(releases(commandsOver(t, 120), 'RUS')).toEqual([]);
  });

  it('answers a nuclear attack only on ground the attacker holds, never on the forces of a third party fighting it', () => {
    const t: T = testWorld([
      emitter(1, (tick) => ({ type: 'nuclear_detonation', tick, by: N('RUS'), node: t.nodeAt(52.2, 21), yieldKt: 10, casualties: 500 })),
      strategic, createDiplomacy(), createAi({ USA: bold }),
    ]);
    t.world.nations[N('USA')].nuclear = { warheads: 500, deployed: 500, doctrine: 'calculated_ambiguity' };
    t.world.nations[N('RUS')].nuclear = { warheads: 500, deployed: 500, doctrine: 'escalate_to_deescalate' };
    t.add({ nation: N('USA'), name: 'Strategic forces', kind: 'strategic', echelon: 'division', node: t.nodeAt(47.5, -111), equipment: { [id.platform('t_icbm')]: 20 } });
    t.war('RUS', 'UKR');
    t.war('RUS', 'USA');
    // Russia's heaviest concentration stands in a cell Ukraine holds, alongside Ukrainian troops; a lighter one inside Russia.
    const ukrHeld = t.map.nodesOf(N('UKR')).find((n) => t.map.popShare[n] < 0.02)!;
    for (let i = 0; i < 6; i++) brigade(t, 'RUS', ukrHeld);
    brigade(t, 'UKR', ukrHeld);
    const rusHeld = t.map.nodesOf(N('RUS')).find((n) => t.map.popShare[n] < 0.005 && t.map.distanceKm(n, ukrHeld) < 800)!;
    brigade(t, 'RUS', rusHeld);
    brigade(t, 'USA', t.nodeAt(52.2, 21));
    const answer = releasesOver(t, 12, 'USA');
    expect(answer.length).toBeGreaterThan(0);
    for (const r of answer) expect(t.world.control[r.target]).toBe('RUS');
    expect(atWar(t.world, N('USA'), N('UKR'))).toBe(false);
  });

  it('warns before first use: a war that jumps past the threshold in one step draws a warning, and release only a day later', () => {
    const t = testWorld([createDiplomacy(), createAi({ RUS: bold })]);
    t.world.nations[N('RUS')].nuclear = { warheads: 1500, deployed: 1500, doctrine: 'escalate_to_deescalate' };
    t.war('RUS', 'UKR');
    losing(t, 'RUS', 'UKR', 0.15);
    const events: SimEvent[] = [];
    const fired: number[] = [];
    t.engine.run(t.world, 24, (w, e) => {
      events.push(...e);
      for (const c of w.pending) if (c.type === 'nuclear_release' && c.nation === 'RUS') fired.push(w.tick);
    });
    const warning = events.find((e) => e.type === 'message' && e.nation === 'RUS' && /warns/.test(e.text));
    expect(warning).toBeDefined();
    expect(fired.length).toBeGreaterThan(0);
    expect((fired[0] - warning!.tick) * t.world.dtHours).toBeGreaterThanOrEqual(24);
  });

  it('Russia warns once any of its homeland is held and alerts as the enemy closes on Moscow, short of first use', () => {
    const t = testWorld([strategic, createDiplomacy(), createAi({ RUS: bold })]);
    t.world.nations[N('RUS')].nuclear = { warheads: 4000, deployed: 1500, doctrine: 'escalate_to_deescalate' };
    t.war('RUS', 'UKR');
    const moscow = t.world.nations[N('RUS')].capital;
    const at = (km: number) => t.map.nodesOf(N('RUS')).filter((n) => t.map.popShare[n] < 0.01).sort((a, b) => Math.abs(t.map.distanceKm(a, moscow) - km) - Math.abs(t.map.distanceKm(b, moscow) - km))[0];
    t.world.control[at(700)] = N('UKR');
    const early = commandsOver(t, 8);
    expect(t.world.history.some((e) => e.type === 'message' && e.nation === 'RUS' && /warns/.test(e.text))).toBe(true);
    expect(early.some((c) => c.type === 'nuclear_alert')).toBe(false);
    t.world.control[at(260)] = N('UKR');
    const later = commandsOver(t, 8);
    expect(later.some((c) => c.type === 'nuclear_alert' && c.nation === 'RUS')).toBe(true);
    expect(releases(later, 'RUS')).toEqual([]);
  });

  // Operation Spiderweb (June 2025) destroyed about a tenth of Russia's heavy bombers and drew no nuclear answer.
  it('Russia shrugs off the loss of a few bombers and alerts once a large share of its strategic launchers is gone', () => {
    const t = airWorld(42, [strategic, createDiplomacy(), createAi({ RUS: bold })]);
    t.world.nations[N('RUS')].nuclear = { warheads: 4000, deployed: 1500, doctrine: 'escalate_to_deescalate' };
    t.war('RUS', 'UKR');
    const icbm = id.platform('t_icbm');
    const rockets = t.add({ nation: N('RUS'), name: 'Strategic Rocket Forces', kind: 'strategic', echelon: 'division', node: t.node(56.0, 50.0), equipment: { [icbm]: 300 } });
    const bombers = t.add({ nation: N('RUS'), name: 'heavy bombers', kind: 'strategic', echelon: 'wing', node: t.node(51.48, 46.21), equipment: { [id.platform('x_bomber')]: 40 } });
    commandsOver(t, 4);
    bombers.equipment[id.platform('x_bomber')] = 30;
    expect(commandsOver(t, 8).some((c) => c.type === 'nuclear_alert' && c.nation === 'RUS')).toBe(false);
    rockets.equipment[icbm] = 150;
    expect(commandsOver(t, 8).some((c) => c.type === 'nuclear_alert' && c.nation === 'RUS')).toBe(true);
  });

  it('Pakistan holds while Indian forces stand near Islamabad and uses first once a Kidwai threshold is crossed', () => {
    const t = testWorld([createDiplomacy(), createAi({ PAK: bold })]);
    t.world.nations[N('PAK')].nuclear = { warheads: 170, deployed: 170, doctrine: 'escalate_to_deescalate' };
    t.war('PAK', 'IND');
    const islamabad = t.world.nations[N('PAK')].capital;
    const near = border(t, 'IND', 'PAK').sort((a, b) => t.map.distanceKm(a, islamabad) - t.map.distanceKm(b, islamabad));
    for (const n of near.slice(0, 2)) brigade(t, 'IND', n);
    const army = [0, 1, 2, 3].map(() => brigade(t, 'PAK', islamabad));
    t.add({ nation: N('PAK'), name: 'Army Strategic Forces Command', kind: 'strategic', echelon: 'division', node: t.nodeAt(30.2, 67.0), equipment: { [id.platform('t_icbm')]: 10 } });

    expect(releases(commandsOver(t, 40), 'PAK')).toEqual([]);
    expect(t.world.slices.diplomacy.assessment[N('PAK')].capitalThreatened).toBe(true);
    // The military threshold: most of the field army destroyed.
    for (const f of army) f.equipment[id.platform('t_mbt')] = 9;
    const fired = releases(commandsOver(t, 12), 'PAK');
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ warheads: 1 });
  });
});

describe('strikes on a neutral host', () => {
  /** Strike orders China's missile brigade aims at a US air wing based at Yonaguni, Japan, ~150 km from Taiwan. */
  const strikesOnJapan = (japanOpinionOfChina: number, setup: (t: T) => void = () => {}) => {
    const t = testWorld([createDiplomacy(), createAi()]);
    setup(t);
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

  it("leaves them alone when the striker is a player's delegate and the player kept strategic decisions", () => {
    const keepStrategic = (t: T) => {
      t.world.nations[N('CHN')].controlledBy = 'human';
      t.world.slices.command = { [N('CHN')]: { ai: { ...DEFAULT_DELEGATION, strategic: false }, held: {}, answers: {} } };
    };
    expect(strikesOnJapan(-55, keepStrategic)).toEqual([]);
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
    // Counted from strike events: a magazine refilled in the same tick hides the shots.
    let firedAbroad = 0;
    for (let i = 0; i < 14 * perDay; i++) {
      const events = s.engine.step(s.world);
      if (s.map.distanceKm(wing.node, home) > 8000 && s.map.distanceKm(other.node, home) > 8000)
        for (const e of events) if (e.type === 'strike' && e.by === 'USA' && e.munition === 'lrasm') firedAbroad += e.fired;
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

describe('homeland defence', () => {
  it('pulls brigades out of its own offensive to counter-attack a penetration of its soil 3:1 and screen the cells beyond', () => {
    const t = testWorld([createAi()]);
    t.war('RUS', 'UKR');
    landSlice(t.world).origin = t.world.control.slice(0, t.map.landCount);
    const lost = border(t, 'RUS', 'UKR')[0];
    t.world.control[lost] = N('UKR');
    brigade(t, 'UKR', lost);
    // The whole Russian army is fighting inside Ukraine, as in summer 2024.
    const inside = border(t, 'UKR', 'RUS')[3];
    const army = Array.from({ length: 8 }, () => brigade(t, 'RUS', inside));
    for (const f of army) f.order = { posture: 'attack', target: inside, issuedTick: 0 };

    const last = new Map<string, Extract<Command, { type: 'order' }>>();
    for (const c of commandsOver(t, 4)) if (c.type === 'order' && c.nation === N('RUS')) last.set(c.formation, c);
    const counter = army.filter((f) => last.get(f.id)?.order.posture === 'attack' && last.get(f.id)?.order.target === lost);
    expect(counter.length).toBeGreaterThanOrEqual(3);
    const beyond = new Set([...t.map.neighbors(lost)].filter((m) => m < t.map.landCount && t.map.owner[m] === N('RUS') && t.world.control[m] === N('RUS')));
    expect(army.some((f) => last.get(f.id)?.order.posture === 'defend' && beyond.has(last.get(f.id)!.order.target!))).toBe(true);
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

describe('air wing basing', () => {
  it('fighters with nothing in reach deploy to a host airfield within reach of the war, one the enemy missiles do not reach', () => {
    const t = airWorld(42, [navalWar, createAi()]);
    t.war('USA', 'CHN');
    for (const n of ['USA', 'CHN']) t.world.nations[N(n)].status = 'war';
    const w = wing(t, 'USA', t.node(13.5, 144.8), { x_stealth: 24, x_tanker: 4 });
    // A US garrison opens Japan's airfields; the brigade's MRBMs (1,700 km) reach Okinawa, Kyushu and Shikoku but not
    // northern Honshu, which the tanked fighters still reach the brigade from.
    t.add({ nation: N('USA'), name: 'US Army Japan', kind: 'maneuver', echelon: 'brigade', node: t.node(35.5, 139.4), equipment: { [id.platform('t_mbt')]: 10 } });
    const shanghai = t.node(31.2, 121.4);
    t.add({ nation: N('CHN'), name: 'PLARF brigade', kind: 'missile', echelon: 'brigade', node: shanghai, equipment: { [id.platform('x_mrbm_tel')]: 12 } });
    const moves = commandsOver(t, 8).flatMap((c) => (c.type === 'order' && c.formation === w.id && c.order.posture === 'move' ? [c.order.target!] : []));
    expect(moves.length).toBeGreaterThan(0);
    for (const to of moves) {
      expect(t.world.control[to]).toBe('JPN');
      expect(t.map.distanceKm(to, shanghai)).toBeGreaterThan(1700);
    }
  });
});

describe('strike target value', () => {
  // A salvo's hits fall on a group's hulls one at a time, so a flotilla of cheap patrol hulls (a China Coast Guard
  // bureau: 210 cutters at 30-120m) is a poor target beside one destroyer however much the flotilla costs in all.
  it('aims anti-ship salvos at a warship before a larger, costlier flotilla of cheap hulls', () => {
    const t = airWorld(42, [navalWar, createAi()]);
    t.war('CHN', 'TWN');
    for (const n of ['CHN', 'TWN']) t.world.nations[N(n)].status = 'war';
    const group = (name: string, lat: number, lon: number, equipment: Record<string, number>) =>
      t.add({ nation: N('TWN'), name, kind: 'surface_group', echelon: 'flotilla', node: t.node(lat, lon), equipment: Object.fromEntries(Object.entries(equipment).map(([k, v]) => [id.platform(k), v])) });
    const warship = group('destroyer', 22.6, 120.3, { t_destroyer: 1 });
    const flotilla = group('patrol flotilla', 25.15, 121.75, { t_ferry: 50 });
    t.add({ nation: N('CHN'), name: 'PLARF brigade', kind: 'missile', echelon: 'brigade', node: t.node(26.1, 119.3), equipment: { [id.platform('x_cruise_tel')]: 12 } });
    t.world.nations[N('CHN')].stockpile[id.munition('t_cruise')] = 10_000;
    const aimed = commandsOver(t, 8).flatMap((c) => (c.type === 'order' && c.nation === 'CHN' && c.order.posture === 'strike' ? [c.order.targetFormation] : []));
    expect(aimed).toContain(warship.id);
    expect(aimed).not.toContain(flotilla.id);
  });

  // Ukrainian drones and missiles went after the Tu-95s and Tu-22M3s at Engels (December 2022) and four bases at once
  // in Operation Spiderweb (June 2025).
  it('strikes heavy bombers parked within reach', () => {
    const t = airWorld(42, [navalWar, createAi()]);
    t.war('UKR', 'RUS');
    for (const n of ['UKR', 'RUS']) t.world.nations[N(n)].status = 'war';
    const bombers = t.add({ nation: N('RUS'), name: 'heavy bombers', kind: 'strategic', echelon: 'wing', node: t.node(51.48, 46.21), equipment: { [id.platform('x_bomber')]: 16 } });
    t.add({ nation: N('UKR'), name: 'cruise missile brigade', kind: 'missile', echelon: 'brigade', node: t.node(50.45, 30.52), equipment: { [id.platform('x_cruise_tel')]: 12 } });
    t.world.nations[N('UKR')].stockpile[id.munition('t_cruise')] = 10_000;
    const aimed = commandsOver(t, 8).flatMap((c) => (c.type === 'order' && c.nation === 'UKR' && c.order.posture === 'strike' ? [c.order.target] : []));
    expect(aimed).toContain(bombers.node);
  });

  // 2022-23: Ukrainian HIMARS and Storm Shadow strikes went after Russian army and corps command posts (RUSI).
  it('strikes an enemy army headquarters within reach as a hardened aimpoint', () => {
    const t = airWorld(42, [navalWar, createAi()]);
    t.war('UKR', 'RUS');
    for (const n of ['UKR', 'RUS']) t.world.nations[N(n)].status = 'war';
    const hq = t.node(50.6, 36.6);
    (t.world.slices as unknown as Record<string, unknown>).c2 = { hqs: { a: { id: 'a', nation: N('RUS'), level: 'army', name: '20th Army HQ', node: hq, integrity: 1 } } };
    for (let i = 0; i < 6; i++) t.add({ nation: N('UKR'), name: `cruise missile brigade ${i}`, kind: 'missile', echelon: 'brigade', node: t.node(50.45, 30.52), equipment: { [id.platform('x_cruise_tel')]: 12 } });
    t.world.nations[N('UKR')].stockpile[id.munition('t_cruise')] = 10_000;
    const aimed = commandsOver(t, 8).flatMap((c) => (c.type === 'order' && c.nation === 'UKR' && c.order.posture === 'strike' ? [`${c.order.target}|${c.order.targetClass}`] : []));
    expect(aimed).toContain(`${hq}|hardened`);
  });
});

describe('mobilization and the home front', () => {
  it('asks no more of a public than it will bear unless the nation is invaded', () => {
    const levels = (tolerance: number | undefined) => {
      const t = testWorld([createAi()]);
      t.war('USA', 'CHN');
      if (tolerance !== undefined)
        (t.world.slices as unknown as Record<string, unknown>).politics = { nations: { [N('USA')]: { mobilizationTolerance: tolerance } } };
      return commandsOver(t, 8).filter((c): c is Extract<Command, { type: 'set_mobilization' }> => c.type === 'set_mobilization' && c.nation === N('USA')).map((c) => c.level);
    };
    expect(Math.max(...levels(undefined))).toBeGreaterThan(0.1);
    expect(Math.max(0, ...levels(0.1))).toBeLessThanOrEqual(0.1);
  });
});

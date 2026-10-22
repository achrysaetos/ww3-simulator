import { describe, expect, it } from 'vitest';
import type { System } from '../src/core/engine';
import type { Command, Formation, NodeId } from '../src/core/types';
import { createDiplomacy, type AllianceTreaty } from '../src/systems/diplomacy';
import { createAi, type Plan } from '../src/systems/ai';
import { issue } from '../src/systems/ai/forces';
import { applyLandOrder, landMovement } from '../src/systems/land';
import { landMass } from '../src/systems/land/strategic';
import { allied } from '../src/systems/land/state';
import { navalWar } from '../src/systems/naval';
import { applyHits } from '../src/systems/naval/combat';
import { tickEnv } from '../src/systems/naval/env';
import { id, testWorld } from '../src/testkit';

const N = id.nation, P = id.platform;
type T = ReturnType<typeof testWorld>;

const heavyBrigade = (t: T, nation: string, node: NodeId, extra: Partial<Formation> = {}) =>
  t.add({ nation: N(nation), name: `${nation} armoured brigade`, kind: 'maneuver', echelon: 'brigade', node, equipment: { [P('t_mbt')]: 90, [P('t_ifv')]: 130, [P('t_inf')]: 60 }, ...extra });
const lightBrigade = (t: T, nation: string, node: NodeId, extra: Partial<Formation> = {}) =>
  t.add({ nation: N(nation), name: `${nation} airborne brigade`, kind: 'maneuver', echelon: 'brigade', node, equipment: { [P('t_inf')]: 80 }, ...extra });
const sealiftGroup = (t: T, node: NodeId, ships = 4) =>
  t.add({ nation: N('USA'), name: 'Sealift group', kind: 'surface_group', echelon: 'task_group', node, equipment: { [P('t_lmsr')]: ships } });

const NATO = ['USA', 'CAN', 'GBR', 'FRA', 'DEU', 'NLD', 'BEL', 'DNK', 'NOR', 'POL'];
const nato = (t: T) => { for (const n of NATO) t.world.nations[N(n)].blocs = ['NATO']; };

/** NATO as a treaty: its members that are not fighting grant passage to members that are. */
const natoTreaty = (extra: string[]): AllianceTreaty => ({
  id: 'NATO',
  kind: 'collective_defense',
  triggers: ['territory', 'forces'],
  members: Object.fromEntries([...NATO, ...extra].map((n) => [N(n), { role: 'mutual' as const, reliability: 1, delayDays: 1 }])),
});

function setup(systems: System[] = []) {
  const t = testWorld([landMovement, navalWar, ...systems]);
  nato(t);
  t.war('USA', 'RUS');
  // Ships alongside at Norfolk refuel from the national stocks the base holds.
  t.world.nations[N('USA')].bulk = { fuel: 1e6, ammo: 0, food: 1e5 };
  const order = (f: Formation, target: NodeId) => applyLandOrder(t.world, { type: 'order', nation: f.nation, formation: f.id, order: { posture: 'move', target } }, t.engine.context(t.world));
  const day = () => t.engine.run(t.world, Math.round(24 / t.world.dtHours));
  return { ...t, order, day };
}

const FORT_HOOD = [31.13, -97.78] as const, NORFOLK = [36.95, -76.33] as const, BREMERHAVEN = [53.55, 8.58] as const;

describe('strategic deployment', () => {
  it('ships a heavy brigade across the Atlantic: march to a home port, load, sail, unload at a friendly European port', () => {
    const t = setup();
    const target = t.nodeAt(...BREMERHAVEN);
    const brigade = heavyBrigade(t, 'USA', t.nodeAt(...FORT_HOOD));
    const ships = sealiftGroup(t, t.nodeAt(...NORFOLK));
    t.order(brigade, target);
    expect(brigade.order.posture).toBe('move');

    const mass = landMass(t.map);
    let sailedDay = -1, landedDay = -1;
    for (let d = 1; d <= 40 && landedDay < 0; d++) {
      t.day();
      if (sailedDay < 0 && brigade.status === 'embarked') sailedDay = d;
      if (brigade.status === 'active' && mass[brigade.node] === mass[target]) landedDay = d;
    }
    expect(sailedDay).toBeGreaterThan(0);
    expect(brigade.embarkedOn).toBeUndefined();
    expect(landedDay).toBeGreaterThan(sailedDay + 5);
    expect(t.map.ports[brigade.node]).toBeGreaterThan(0);
    expect(t.map.distanceKm(brigade.node, target)).toBeLessThan(500);
    expect(ships.status).toBe('active');
  });

  it('lands a brigade bound for Lithuania at a port out of Kaliningrad\'s missile reach, then marches it on to Vilnius', () => {
    const t = setup([createDiplomacy({ alliances: [natoTreaty(['LTU', 'LVA', 'EST'])] })]);
    const vilnius = t.nodeAt(54.69, 25.28), kaliningrad = t.nodeAt(54.7, 20.5);
    for (const n of ['LTU', 'LVA', 'EST']) t.world.nations[N(n)].blocs = ['NATO'];
    const brigade = heavyBrigade(t, 'USA', t.nodeAt(...FORT_HOOD));
    sealiftGroup(t, t.nodeAt(...NORFOLK));
    t.order(brigade, vilnius);
    const mass = landMass(t.map);
    let landedAt = -1;
    for (let d = 1; d <= 60 && t.map.distanceKm(brigade.node, vilnius) > 200; d++) {
      t.day();
      if (landedAt < 0 && brigade.status === 'active' && mass[brigade.node] === mass[vilnius]) landedAt = brigade.node;
    }
    expect(landedAt).toBeGreaterThanOrEqual(0);
    expect(t.map.distanceKm(landedAt as NodeId, kaliningrad)).toBeGreaterThan(450);
    expect(t.map.distanceKm(brigade.node, vilnius)).toBeLessThanOrEqual(200);
  }, 120_000);

  it('ships a formation too big for the decks in echelons, the rest waiting at the port for the next sailing', () => {
    const t = setup();
    const norfolk = t.nodeAt(...NORFOLK), target = t.nodeAt(...BREMERHAVEN);
    const division = heavyBrigade(t, 'USA', norfolk, { name: 'Armoured division', equipment: { [P('t_mbt')]: 300, [P('t_ifv')]: 130, [P('t_inf')]: 60 } });
    division.order = { posture: 'move', target, path: [], issuedTick: 0 };
    sealiftGroup(t, norfolk, 1);
    const mass = landMass(t.map);
    const parts = () => Object.values(t.world.formations).filter((f) => f.nation === N('USA') && f.kind === 'maneuver');
    const tanks = () => parts().reduce((n, f) => n + (f.equipment[P('t_mbt')] ?? 0), 0);
    let firstSailing: number | undefined;
    for (let d = 0; d < 80 && !parts().every((f) => f.status === 'active' && mass[f.node] === mass[target]); d++) {
      t.day();
      const aboard = parts().filter((f) => f.status === 'embarked');
      if (firstSailing === undefined && aboard.length) firstSailing = aboard.reduce((n, f) => n + (f.equipment[P('t_mbt')] ?? 0), 0);
    }
    expect(firstSailing).toBeGreaterThan(0);
    expect(firstSailing).toBeLessThan(300);
    expect(parts().length).toBeGreaterThan(1);
    expect(parts().every((f) => f.status === 'active' && mass[f.node] === mass[target])).toBe(true);
    expect(tanks()).toBe(300);
  }, 120_000);

  it('sinks the embarked vehicles with the ships that carried them', () => {
    const t = setup();
    const norfolk = t.nodeAt(...NORFOLK);
    const brigade = heavyBrigade(t, 'USA', norfolk);
    brigade.order = { posture: 'move', target: t.nodeAt(...BREMERHAVEN), path: [], issuedTick: 0 };
    const ships = sealiftGroup(t, norfolk);
    for (let d = 0; d < 12 && brigade.status !== 'embarked'; d++) t.day();
    expect(brigade.status).toBe('embarked');

    const tanks = brigade.equipment[P('t_mbt')];
    applyHits(tickEnv(t.world, t.engine.context(t.world), true), ships, [100, 100], N('RUS'));
    expect(ships.equipment[P('t_lmsr')]).toBeLessThanOrEqual(2);
    expect(brigade.equipment[P('t_mbt')]).toBeLessThanOrEqual(Math.round(tanks * 0.6));
  });

  it('flies a light brigade instead, when its nation has airlift', () => {
    const t = setup();
    const target = t.nodeAt(...BREMERHAVEN);
    t.add({ nation: N('USA'), name: 'Airlift wing', kind: 'logistics', echelon: 'wing', node: t.nodeAt(...NORFOLK), equipment: { [P('t_airlifter')]: 200 } });
    const brigade = lightBrigade(t, 'USA', t.nodeAt(...FORT_HOOD));
    t.order(brigade, target);

    const mass = landMass(t.map);
    let arrived = -1;
    for (let d = 1; d <= 20 && arrived < 0; d++) {
      t.day();
      expect(brigade.status).not.toBe('embarked');
      if (mass[brigade.node] === mass[target]) arrived = d;
    }
    expect(arrived).toBeGreaterThan(0);
    expect(arrived).toBeLessThan(10);
  });

  it('refuses an overseas move with nowhere to embark rather than dropping it silently', () => {
    const t = setup();
    const brigade = heavyBrigade(t, 'USA', t.nodeAt(...FORT_HOOD));
    // Every US and host-ally port in enemy hands.
    for (let n = 0; n < t.map.landCount; n++) if (t.world.control[n] && allied(t.world, N('USA'), t.world.control[n]) && t.map.ports[n]) t.world.control[n] = N('RUS');
    const result = applyLandOrder(t.world, { type: 'order', nation: N('USA'), formation: brigade.id, order: { posture: 'move', target: t.nodeAt(...BREMERHAVEN) } }, t.engine.context(t.world));
    expect(brigade.order.posture).toBe('defend');
    expect(result).toMatchObject({ ok: false, code: 'no_lift', reason: expect.stringContaining('port') });
  });
});

describe('strategic deployment planning', () => {
  /** A Russian army on Poland's border, Poland and the US at war with Russia, US brigades at home. */
  function theatre() {
    const t = testWorld([createAi()]);
    nato(t);
    t.war('RUS', 'POL');
    t.war('RUS', 'USA');
    const border = t.map.nodesOf(N('RUS')).filter((n) => [...t.map.neighbors(n)].some((m) => !t.map.isSea(m) && t.world.control[m] === N('POL')) && t.map.lon[n] > 22);
    for (const n of border.slice(0, 3)) for (let i = 0; i < 4; i++) heavyBrigade(t, 'RUS', n);
    heavyBrigade(t, 'POL', t.world.nations[N('POL')].capital);
    return t;
  }
  const movesOf = (cmds: Command[], f: Formation) => cmds.filter((c): c is Extract<Command, { type: 'order' }> => c.type === 'order' && c.formation === f.id && c.order.posture === 'move');

  it('sends ready brigades to a friendly port in the theatre and keeps unready and territorial ones home', () => {
    const t = theatre();
    const home = t.nodeAt(...FORT_HOOD);
    const ready = heavyBrigade(t, 'USA', home, { readiness: 0.9 });
    const guard = heavyBrigade(t, 'USA', home, { readiness: 0.45 });
    const militia = heavyBrigade(t, 'USA', home, { readiness: 0.9, territorial: true });
    for (let i = 0; i < 3; i++) heavyBrigade(t, 'USA', home, { readiness: 0.5 });
    const cmds: Command[] = [];
    t.engine.run(t.world, 4 * 6, (w) => cmds.push(...w.pending));

    const mass = landMass(t.map);
    const sent = movesOf(cmds, ready);
    expect(sent.length).toBeGreaterThan(0);
    const port = sent[0].order.target!;
    expect(mass[port]).toBe(mass[t.world.nations[N('POL')].capital]);
    expect(t.map.ports[port]).toBeGreaterThan(0);
    expect(movesOf(cmds, guard)).toHaveLength(0);
    expect(movesOf(cmds, militia)).toHaveLength(0);
  });

  it("sends ready brigades to the front its allies hold thinly, not to the bigger enemy army an ally's army already matches", () => {
    const t = testWorld([createAi()]);
    nato(t);
    for (const n of ['USA', 'KOR']) t.world.nations[N(n)].blocs.push('US-KOR');
    t.war('PRK', 'KOR');
    t.war('USA', 'PRK');
    t.war('RUS', 'EST');
    t.war('USA', 'RUS');
    const border = (a: string, b: string) => t.map.nodesOf(N(a)).filter((n) => [...t.map.neighbors(n)].some((m) => !t.map.isSea(m) && t.world.control[m] === N(b)));
    const dmz = border('PRK', 'KOR'), south = border('KOR', 'PRK'), narva = border('RUS', 'EST');
    for (let i = 0; i < 12; i++) heavyBrigade(t, 'PRK', dmz[i % dmz.length]);
    for (let i = 0; i < 12; i++) heavyBrigade(t, 'KOR', south[i % south.length]);
    for (let i = 0; i < 4; i++) heavyBrigade(t, 'RUS', narva[i % narva.length]);
    heavyBrigade(t, 'EST', border('EST', 'RUS')[0]);
    const us = Array.from({ length: 6 }, () => heavyBrigade(t, 'USA', t.nodeAt(...FORT_HOOD), { readiness: 0.9 }));
    const cmds: Command[] = [];
    t.engine.run(t.world, 4 * 6, (w) => cmds.push(...w.pending));

    const bound = us.flatMap((f) => movesOf(cmds, f).slice(-1).map((c) => c.order.target!));
    const toKorea = bound.filter((n) => t.map.owner[n] === N('KOR')).length;
    expect(bound.length).toBeGreaterThanOrEqual(4);
    expect(bound.length - toKorea).toBeGreaterThan(toKorea);
  });
});

describe('refused orders', () => {
  it('sends a refused order once, and again only when the formation moves or three days pass', () => {
    const t = testWorld([createAi()]);
    t.war('USA', 'RUS');
    const brigade = heavyBrigade(t, 'USA', t.nodeAt(...FORT_HOOD));
    for (let n = 0; n < t.map.landCount; n++) if (t.world.control[n] === N('USA') && t.map.ports[n]) t.world.control[n] = N('RUS');
    const p = { world: t.world, ai: t.world.slices.ai, out: [] as Command[] } as unknown as Plan;
    const ctx = t.engine.context(t.world);
    const overseas = { posture: 'move', target: t.nodeAt(...BREMERHAVEN) } as const;
    const pass = () => {
      const before = p.out.length;
      issue(p, brigade, overseas);
      for (const c of p.out.slice(before)) if (c.type === 'order') applyLandOrder(t.world, c, ctx);
      t.world.tick += 2;
      return p.out.length - before;
    };
    expect(pass()).toBe(1);
    expect(brigade.order.posture).toBe('defend');
    let resent = 0;
    for (let i = 0; i < 4; i++) resent += pass();
    expect(resent).toBe(0);
    brigade.node = t.nodeAt(32.5, -97.3);
    expect(pass()).toBe(1);
    for (let i = 0; i < 6; i++) resent += pass();
    expect(resent).toBe(1);
  });

  it('sends an order again once the formation carried it out, as a wing re-flies a strike on the same target', () => {
    const t = testWorld([createAi()]);
    const wing = t.add({ nation: N('USA'), name: 'Bomb wing', kind: 'air_wing', echelon: 'wing', node: t.nodeAt(...FORT_HOOD), equipment: { [P('t_inf')]: 1 } });
    const p = { world: t.world, ai: t.world.slices.ai, out: [] as Command[] } as unknown as Plan;
    const strike = { posture: 'strike', target: t.nodeAt(...BREMERHAVEN) } as const;
    issue(p, wing, strike);
    wing.order = { ...strike, issuedTick: t.world.tick + 1 };
    wing.order = { posture: 'defend', issuedTick: t.world.tick + 3 };
    t.world.tick += 4;
    issue(p, wing, strike);
    expect(p.out).toHaveLength(2);
  });
});

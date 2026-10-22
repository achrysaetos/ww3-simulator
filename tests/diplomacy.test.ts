import { describe, expect, it } from 'vitest';
import { atWar, relation, relationMut, type System } from '../src/core/engine';
import type { NationId, NodeId, SimEvent } from '../src/core/types';
import { createDiplomacy, type AllianceTreaty, type StrategicProfile } from '../src/systems/diplomacy';
import { DEFAULT_DELEGATION } from '../src/systems/orders';
import { id, testWorld } from '../src/testkit';

const N = id.nation;
const member = (delayDays: number, reliability = 1) => ({ role: 'mutual' as const, reliability, delayDays });
const NATO: AllianceTreaty = {
  id: 'NATO',
  kind: 'collective_defense',
  triggers: ['territory', 'forces'],
  members: { [N('POL')]: member(1), [N('USA')]: member(3), [N('DEU')]: member(10), [N('EST')]: member(1) },
};

/** A stand-in for the combat systems: emits the given events every tick, before diplomacy runs. */
function emitter(events: (tick: number) => SimEvent[]): System {
  return { id: 'emitter', step: (world, ctx) => events(world.tick).forEach((e) => ctx.emit(e)) };
}

/** A stand-in for ground combat: while at war, `by` attacks `victim`'s capital every tick, the armed attack that calls treaties. */
function assault(by: string, victim: string): System {
  return {
    id: `assault ${by} ${victim}`,
    step: (world, ctx) => {
      if (atWar(world, N(by), N(victim))) ctx.emit({ type: 'battle', tick: world.tick, node: world.nations[N(victim)].capital, attacker: N(by), defender: N(victim), losses: {}, casualties: {} });
    },
  };
}

const days = (d: number) => d * 4;

describe('alliances', () => {
  it('NATO members join an attacked member after their own delay; a non-member stays out', () => {
    const t = testWorld([assault('RUS', 'POL'), createDiplomacy({ alliances: [NATO] })]);
    t.world.pending.push({ type: 'declare_war', nation: N('RUS'), target: N('POL') });
    t.engine.step(t.world);
    expect(atWar(t.world, N('RUS'), N('POL'))).toBe(true);
    expect(atWar(t.world, N('RUS'), N('USA'))).toBe(false);

    t.engine.run(t.world, days(3));
    expect(atWar(t.world, N('RUS'), N('USA'))).toBe(true);
    expect(atWar(t.world, N('RUS'), N('DEU'))).toBe(false);
    const usEntry = t.world.history.find((e) => e.type === 'war_declared' && e.by === 'USA');
    expect(usEntry).toMatchObject({ on: 'RUS', reason: expect.stringContaining('NATO') });

    t.engine.run(t.world, days(10));
    expect(atWar(t.world, N('RUS'), N('DEU'))).toBe(true);
    expect(atWar(t.world, N('RUS'), N('AUT'))).toBe(false);
    expect(t.world.nations[N('AUT')].status).toBe('peace');
    // Co-belligerents never fight each other.
    expect(atWar(t.world, N('USA'), N('POL'))).toBe(false);
  });

  it("a belligerent that attacks a state fighting another war brings it into its own war, not itself into that state's coalition", () => {
    const t = testWorld([assault('RUS', 'POL'), createDiplomacy({ alliances: [NATO] })]);
    const declare = (by: string, on: string) => {
      t.world.pending.push({ type: 'declare_war', nation: N(by), target: N(on) });
      t.engine.step(t.world);
    };
    declare('RUS', 'POL');
    t.engine.run(t.world, days(11));
    expect(atWar(t.world, N('RUS'), N('DEU'))).toBe(true);
    declare('CHN', 'TWN');
    declare('RUS', 'JPN');
    declare('CHN', 'JPN');
    expect(atWar(t.world, N('CHN'), N('JPN'))).toBe(true);
    for (const n of ['POL', 'EST', 'DEU', 'USA']) expect(atWar(t.world, N('CHN'), N(n)), n).toBe(false);
    expect(atWar(t.world, N('JPN'), N('TWN'))).toBe(false);

    declare('BLR', 'POL');
    for (const n of ['POL', 'EST', 'DEU', 'USA', 'JPN']) expect(atWar(t.world, N('BLR'), N(n)), n).toBe(true);
  });

  it('does not trigger when the member is the aggressor', () => {
    const t = testWorld([assault('POL', 'RUS'), assault('RUS', 'POL'), createDiplomacy({ alliances: [NATO] })]);
    t.world.pending.push({ type: 'declare_war', nation: N('POL'), target: N('RUS') });
    t.engine.run(t.world, days(20));
    expect(atWar(t.world, N('RUS'), N('POL'))).toBe(true);
    expect(atWar(t.world, N('RUS'), N('USA'))).toBe(false);
    expect(atWar(t.world, N('RUS'), N('DEU'))).toBe(false);
  });

  it('an ambiguous commitment is honoured by an interventionist guarantor and mostly not by a reluctant one', () => {
    const treaty: AllianceTreaty = {
      id: 'TRA', kind: 'ambiguous', triggers: ['territory'],
      members: { [N('USA')]: { role: 'guarantor', reliability: 0, delayDays: 2 }, [N('TWN')]: { role: 'protected', reliability: 0, delayDays: 0 } },
    };
    const joins = (profile: StrategicProfile, opinionTwn: number, opinionChn: number) => {
      let n = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const t = testWorld([assault('CHN', 'TWN'), createDiplomacy({ alliances: [treaty], profiles: { USA: profile } })], seed);
        relationMut(t.world, N('USA'), N('TWN')).opinion = opinionTwn;
        relationMut(t.world, N('USA'), N('CHN')).opinion = opinionChn;
        t.world.pending.push({ type: 'declare_war', nation: N('CHN'), target: N('TWN') });
        t.engine.run(t.world, days(3));
        if (atWar(t.world, N('USA'), N('CHN'))) n++;
      }
      return n;
    };
    expect(joins({ casualtyTolerance: 0.5, interventionism: 0.9, riskTolerance: 0.6, aggression: 0.5 }, 70, -40)).toBeGreaterThanOrEqual(7);
    expect(joins({ casualtyTolerance: 0.5, interventionism: 0.05, riskTolerance: 0.05, aggression: 0.5 }, 0, 0)).toBeLessThanOrEqual(2);
  });
});

describe('escalation', () => {
  const strikesOn = (target: (t: ReturnType<typeof testWorld>) => NodeId) => {
    let node = 0 as NodeId;
    const t = testWorld([
      emitter((tick) => [{ type: 'strike', tick, by: N('USA'), munition: id.munition('t_cruise'), fired: 4, intercepted: 1, target: node, effects: [] }]),
      createDiplomacy(),
    ]);
    node = target(t);
    t.war('USA', 'RUS');
    t.engine.run(t.world, 20);
    return t;
  };

  it('repeated strikes on the homeland climb from conventional to strategic conventional', () => {
    const t = strikesOn((t) => t.nodeAt(54.6, 39.7)); // Ryazan, inside Russia
    expect(relation(t.world, N('USA'), N('RUS')).escalation).toBe('strategic_conventional');
    expect(t.world.history.some((e) => e.type === 'escalation' && e.level === 'strategic_conventional')).toBe(true);
  });

  it('the same number of strikes at sea does not', () => {
    const t = strikesOn((t) => t.nodeAt(43, 34)); // Black Sea
    expect(relation(t.world, N('USA'), N('RUS')).escalation).toBe('conventional');
  });
});

describe('war support', () => {
  it('falls with heavy casualties, faster for a liberal democracy than an authoritarian state', () => {
    const t = testWorld([
      emitter((tick) => [{ type: 'battle', tick, node: 0 as NodeId, attacker: N('USA'), defender: N('RUS'), losses: {}, casualties: { [N('USA')]: 20_000, [N('RUS')]: 20_000 } }]),
      createDiplomacy(),
    ]);
    const usa = t.world.nations[N('USA')], rus = t.world.nations[N('RUS')];
    usa.government = 'liberal_democracy';
    rus.government = 'authoritarian';
    usa.population = rus.population = 150e6;
    t.war('USA', 'RUS');
    const start = { usa: usa.warSupport, rus: rus.warSupport };
    t.engine.run(t.world, days(30));
    const drop = { usa: start.usa - usa.warSupport, rus: start.rus - rus.warSupport };
    expect(drop.rus).toBeGreaterThan(0.05);
    expect(drop.usa).toBeGreaterThan(drop.rus * 2);
  });
});

describe('peace offers', () => {
  function offerToExhaustedHuman(strategicDelegated: boolean) {
    const t = testWorld([createDiplomacy()]);
    const ukr = t.world.nations[N('UKR')];
    ukr.controlledBy = 'human';
    t.world.slices.command = { [N('UKR')]: { ai: { ...DEFAULT_DELEGATION, strategic: strategicDelegated }, held: {}, answers: {} } };
    t.world.pending.push({ type: 'declare_war', nation: N('RUS'), target: N('UKR') });
    t.engine.step(t.world);
    expect(atWar(t.world, N('RUS'), N('UKR'))).toBe(true);
    ukr.warSupport = 0.1;
    t.world.pending.push({ type: 'offer_peace', nation: N('RUS'), target: N('UKR') });
    t.engine.step(t.world);
    return atWar(t.world, N('RUS'), N('UKR'));
  }

  it('are accepted by the AI for a human nation that delegated strategic decisions', () => {
    expect(offerToExhaustedHuman(true)).toBe(false);
  });

  it('wait for a human who kept strategic decisions', () => {
    expect(offerToExhaustedHuman(false)).toBe(true);
  });

  it('stay on the table and are taken once the war turns against the AI that refused them', () => {
    const t = testWorld([createDiplomacy()]);
    t.world.pending.push({ type: 'declare_war', nation: N('RUS'), target: N('UKR') });
    t.engine.step(t.world);
    t.world.pending.push({ type: 'offer_peace', nation: N('UKR'), target: N('RUS') });
    t.engine.step(t.world);
    expect(atWar(t.world, N('RUS'), N('UKR'))).toBe(true);
    t.world.slices.diplomacy.records[N('RUS')].baseline = 0.2;
    t.engine.run(t.world, days(2));
    expect(atWar(t.world, N('RUS'), N('UKR'))).toBe(false);
  });

  it('an exhausted AI enemy offers a human who kept strategic decisions an armistice instead of imposing one', () => {
    const t = testWorld([createDiplomacy()]);
    t.world.nations[N('UKR')].controlledBy = 'human';
    t.world.slices.command = { [N('UKR')]: { ai: { ...DEFAULT_DELEGATION, strategic: false }, held: {}, answers: {} } };
    t.world.pending.push({ type: 'declare_war', nation: N('RUS'), target: N('UKR') });
    t.engine.step(t.world);
    for (const n of ['RUS', 'UKR']) t.world.slices.diplomacy.records[N(n)].baseline = 0.1;
    t.engine.run(t.world, days(40));
    expect(atWar(t.world, N('RUS'), N('UKR'))).toBe(true);
    expect(t.world.slices.diplomacy.offers['RUS|UKR']).toBe('RUS');
  });
});

describe('war support under nuclear attack', () => {
  /** Support of `victim` after two 150 kt weapons kill 460k people next to its capital, and whether it holds warheads. */
  const struck = (victim: string, armed: boolean) => {
    const t = testWorld([
      emitter((tick) => (tick === 2 ? [0, 1].map(() => ({ type: 'nuclear_detonation' as const, tick, by: N('PRK'), node: t.world.nations[N(victim)].capital, yieldKt: 150, casualties: 230_000 })) : [])),
      createDiplomacy(),
    ]);
    t.world.nations[N(victim)].nuclear = armed ? { warheads: 1700, deployed: 1700, doctrine: 'calculated_ambiguity' } : { warheads: 0, deployed: 0, doctrine: 'none' };
    t.war('PRK', victim);
    t.engine.run(t.world, 2);
    const before = t.world.nations[N(victim)].warSupport;
    t.engine.run(t.world, days(2));
    return { before, after: t.world.nations[N(victim)].warSupport, status: t.world.nations[N(victim)].status };
  };

  it('a nuclear-armed state struck at its capital rallies behind retaliation instead of collapsing', () => {
    const us = struck('USA', true);
    expect(us.after).toBeGreaterThanOrEqual(us.before);
    expect(us.status).toBe('war');
  });

  it('a state without nuclear weapons loses support under the same attack', () => {
    const jp = struck('JPN', false);
    expect(jp.after).toBeLessThan(jp.before - 0.1);
  });
});

describe('capitulation', () => {
  const occupy = (t: ReturnType<typeof testWorld>, nation: NationId, by: NationId, popShare: number) => {
    const nodes = t.map.nodesOf(nation).sort((a, b) => t.map.popShare[b] - t.map.popShare[a]);
    t.world.control[t.world.nations[nation].capital] = by;
    let taken = t.map.popShare[t.world.nations[nation].capital];
    for (const n of nodes) {
      if (taken >= popShare) break;
      if (t.world.control[n] === by) continue;
      t.world.control[n] = by;
      taken += t.map.popShare[n];
    }
  };

  it('a nation that has lost its capital and most of its territory capitulates and the occupier takes the rest', () => {
    const t = testWorld([createDiplomacy()]);
    t.war('RUS', 'UKR');
    occupy(t, N('UKR'), N('RUS'), 0.6);
    const events = t.engine.step(t.world);
    expect(events).toContainEqual(expect.objectContaining({ type: 'capitulation', nation: 'UKR', to: ['RUS'] }));
    expect(t.world.nations[N('UKR')].status).toBe('capitulated');
    expect(atWar(t.world, N('RUS'), N('UKR'))).toBe(false);
    expect(t.map.nodesOf(N('UKR')).every((n) => t.world.control[n] === 'RUS')).toBe(true);
  });

  const brigade = (t: ReturnType<typeof testWorld>, nation: string, node: NodeId) =>
    t.add({ nation: N(nation), name: `${nation} brigade at ${node}`, kind: 'maneuver', echelon: 'brigade', node, equipment: { [id.platform('t_inf')]: 400 } });

  it('a nation whose army still stands fights on after losing its capital and most of its people', () => {
    const t = testWorld([createDiplomacy()]);
    t.war('CHN', 'TWN');
    const cells = t.map.nodesOf(N('TWN')).filter((n) => n !== t.world.nations[N('TWN')].capital);
    for (const n of cells.slice(0, 20)) brigade(t, 'TWN', n);
    t.engine.step(t.world);
    occupy(t, N('TWN'), N('CHN'), 0.6);
    t.engine.run(t.world, days(3));
    expect(t.world.history.some((e) => e.type === 'capitulation')).toBe(false);
    expect(atWar(t.world, N('CHN'), N('TWN'))).toBe(true);
  });

  it('occupation terms hand over only the cells the capitulating state no longer holds with troops', () => {
    const t = testWorld([createDiplomacy()]);
    t.war('CHN', 'TWN');
    const far = t.map.nodesOf(N('TWN')).sort((a, b) => t.map.distanceKm(b, t.world.nations[N('TWN')].capital) - t.map.distanceKm(a, t.world.nations[N('TWN')].capital));
    const garrison = far[0];
    t.world.nations[N('TWN')].government = 'liberal_democracy';
    const army = Array.from({ length: 20 }, () => brigade(t, 'TWN', garrison));
    t.engine.step(t.world);
    for (const f of army.slice(1)) f.status = 'destroyed';
    occupy(t, N('TWN'), N('CHN'), 0.6);
    const events = t.engine.step(t.world);
    expect(events).toContainEqual(expect.objectContaining({ type: 'capitulation', nation: 'TWN' }));
    expect(t.world.control[garrison]).toBe('TWN');
    expect(t.map.nodesOf(N('TWN')).filter((n) => n !== garrison).every((n) => t.world.control[n] === 'CHN')).toBe(true);
  });

  it('losing only the capital region is not enough', () => {
    const t = testWorld([createDiplomacy()]);
    t.war('RUS', 'UKR');
    occupy(t, N('UKR'), N('RUS'), 0);
    const events = t.engine.step(t.world);
    expect(events.some((e) => e.type === 'capitulation')).toBe(false);
    expect(t.map.nodesOf(N('UKR')).some((n) => t.world.control[n] === 'UKR')).toBe(true);
    expect(atWar(t.world, N('RUS'), N('UKR'))).toBe(true);
  });
});

describe('who joins a war', () => {
  const CSTO: AllianceTreaty = { id: 'CSTO', kind: 'collective_defense', triggers: ['territory'], members: { [N('RUS')]: member(1), [N('KAZ')]: member(1) } };
  const UKR_FRIENDS: AllianceTreaty = { id: 'UKR-POL', kind: 'collective_defense', triggers: ['territory'], members: { [N('UKR')]: member(1), [N('POL')]: member(1) } };
  /** Hand `share` of `nation`'s homeland population to `by`, least populous cells first and far from the capital. */
  const invade = (t: ReturnType<typeof testWorld>, nation: NationId, by: NationId, share: number) => {
    const cap = t.world.nations[nation].capital;
    let taken = 0;
    const far = t.map.nodesOf(nation).filter((n) => t.map.distanceKm(n, cap) > 1000).sort((a, b) => t.map.popShare[a] - t.map.popShare[b]);
    for (const n of far) {
      if (taken >= share) break;
      if (t.world.control[n] !== nation) continue;
      t.world.control[n] = by;
      taken += t.map.popShare[n];
    }
  };

  it("the aggressor's allies stay out when the victim's friends join it, and come in only once the aggressor is seriously invaded", () => {
    const t = testWorld([assault('RUS', 'UKR'), createDiplomacy({ alliances: [CSTO, UKR_FRIENDS] })]);
    t.world.pending.push({ type: 'declare_war', nation: N('RUS'), target: N('UKR') });
    t.engine.run(t.world, days(5));
    expect(atWar(t.world, N('POL'), N('RUS'))).toBe(true);
    expect(atWar(t.world, N('KAZ'), N('UKR'))).toBe(false);

    invade(t, N('RUS'), N('UKR'), 0.005);
    t.engine.run(t.world, days(5));
    expect(atWar(t.world, N('KAZ'), N('UKR'))).toBe(false);

    invade(t, N('RUS'), N('UKR'), 0.05);
    t.engine.run(t.world, days(5));
    expect(atWar(t.world, N('KAZ'), N('UKR'))).toBe(true);
    expect(atWar(t.world, N('KAZ'), N('POL'))).toBe(true);
  });

  it('a guarantor or a frontline member honours a shaky commitment far more often than a distant member', () => {
    const shaky: AllianceTreaty = {
      id: 'PACT', kind: 'collective_defense', triggers: ['territory'], guarantors: [N('USA')],
      members: { [N('EST')]: member(1), [N('USA')]: member(1, 0.5), [N('FIN')]: member(1, 0.5), [N('PRT')]: member(1, 0.5) },
    };
    const count = { USA: 0, FIN: 0, PRT: 0 };
    for (let seed = 1; seed <= 30; seed++) {
      const t = testWorld([assault('RUS', 'EST'), createDiplomacy({ alliances: [shaky] })], seed);
      t.world.pending.push({ type: 'declare_war', nation: N('RUS'), target: N('EST') });
      t.engine.run(t.world, days(2));
      for (const m of ['USA', 'FIN', 'PRT'] as const) if (atWar(t.world, N(m), N('RUS'))) count[m]++;
    }
    expect(count.USA).toBeGreaterThanOrEqual(23);
    expect(count.FIN).toBeGreaterThanOrEqual(23);
    expect(count.PRT).toBeLessThanOrEqual(22);
  });

  it('a member that declines looks again a week later, once', () => {
    const reluctant: AllianceTreaty = { id: 'PACT', kind: 'collective_defense', triggers: ['territory'], members: { [N('EST')]: member(1), [N('PRT')]: member(1, 0) } };
    const t = testWorld([assault('RUS', 'EST'), createDiplomacy({ alliances: [reluctant] })]);
    t.world.pending.push({ type: 'declare_war', nation: N('RUS'), target: N('EST') });
    t.engine.run(t.world, days(30));
    const declines = t.world.history.filter((e) => e.type === 'message' && e.text.startsWith('PRT declines'));
    expect(declines.map((e) => Math.round(e.tick / days(1)))).toEqual([1, 8]);
  });

  describe('opportunistic entry', () => {
    const hawk: StrategicProfile = { casualtyTolerance: 0.5, interventionism: 1, riskTolerance: 0.5, aggression: 0.5 };
    /** Seeds out of 10 in which Belarus, leaning hard toward Russia, joins its war on Ukraine within 120 days. */
    const entries = (setup: (t: ReturnType<typeof testWorld>) => void) => {
      let n = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const t = testWorld([createDiplomacy({ profiles: { BLR: hawk } })], seed);
        relationMut(t.world, N('BLR'), N('RUS')).opinion = 100;
        relationMut(t.world, N('BLR'), N('UKR')).opinion = -100;
        setup(t);
        t.world.pending.push({ type: 'declare_war', nation: N('RUS'), target: N('UKR') });
        t.engine.run(t.world, days(120));
        if (atWar(t.world, N('BLR'), N('UKR'))) n++;
      }
      return n;
    };
    const collapse = (t: ReturnType<typeof testWorld>) => { t.world.control[t.world.nations[N('UKR')].capital] = N('RUS'); };

    it('a neighbour piles onto a collapsing victim', () => {
      expect(entries(collapse)).toBeGreaterThanOrEqual(7);
    });

    it('but a human player who kept strategic decisions is never taken into the war by its AI', () => {
      expect(entries((t) => {
        collapse(t);
        t.world.nations[N('BLR')].controlledBy = 'human';
        t.world.slices.command = { [N('BLR')]: { ai: { ...DEFAULT_DELEGATION, strategic: false }, held: {}, answers: {} } };
      })).toBe(0);
    });

    it('but not onto a victim that is holding', () => {
      expect(entries(() => {})).toBe(0);
    });

    it('nor against a nuclear-armed victim, however badly it is doing', () => {
      expect(entries((t) => { collapse(t); t.world.nations[N('UKR')].nuclear.warheads = 50; })).toBe(0);
    });

    it('nor from beyond the neighbourhood', () => {
      let n = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const t = testWorld([createDiplomacy({ profiles: { ESP: hawk } })], seed);
        relationMut(t.world, N('ESP'), N('RUS')).opinion = 100;
        relationMut(t.world, N('ESP'), N('UKR')).opinion = -100;
        collapse(t);
        t.world.pending.push({ type: 'declare_war', nation: N('RUS'), target: N('UKR') });
        t.engine.run(t.world, days(120));
        if (atWar(t.world, N('ESP'), N('UKR'))) n++;
      }
      expect(n).toBe(0);
    });
  });

  describe('strikes on a bystander', () => {
    const strikeOn = (host: string, opinion: number) => {
      let node = 0 as NodeId;
      const t = testWorld([
        emitter((tick) => (tick === 2 ? [{ type: 'strike', tick, by: N('CHN'), munition: id.munition('t_cruise'), fired: 4, intercepted: 1, target: node, effects: [] }] : [])),
        createDiplomacy(),
      ]);
      node = t.world.nations[N(host)].capital;
      relationMut(t.world, N(host), N('CHN')).opinion = opinion;
      t.war('CHN', 'TWN');
      t.engine.run(t.world, 4);
      return t;
    };

    it('bring a hostile host into the war against the striker', () => {
      const t = strikeOn('JPN', -55);
      expect(atWar(t.world, N('JPN'), N('CHN'))).toBe(true);
      expect(atWar(t.world, N('JPN'), N('TWN'))).toBe(false);
    });

    it('but a friendly host absorbs the strike', () => {
      expect(atWar(strikeOn('QAT', 0).world, N('QAT'), N('CHN'))).toBe(false);
    });
  });
});

describe('capital threat', () => {
  /** Whether Lithuania's capital reads as threatened with a brigade of a distant enemy at the given point. */
  function threatenedWithEnemyAt(lat: number, lon: number): boolean {
    const t = testWorld([createDiplomacy()]);
    t.war('FRA', 'LTU');
    t.add({ nation: N('FRA'), name: 'Brigade', kind: 'maneuver', echelon: 'brigade', node: t.nodeAt(lat, lon), equipment: { [id.platform('t_inf')]: 60 } });
    t.engine.step(t.world);
    return t.world.slices.diplomacy.assessment[N('LTU')].capitalThreatened;
  }

  it('reads enemy ground forces within 200 km of the capital as a threat, however fine the cells, and not beyond', () => {
    expect(threatenedWithEnemyAt(54.9, 23.9)).toBe(true);
    expect(threatenedWithEnemyAt(55.7, 21.1)).toBe(false);
  });
});

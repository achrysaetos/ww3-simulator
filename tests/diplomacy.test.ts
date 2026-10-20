import { describe, expect, it } from 'vitest';
import { atWar, relation, relationMut, type System } from '../src/core/engine';
import type { NationId, NodeId, SimEvent } from '../src/core/types';
import { createDiplomacy, type AllianceTreaty, type StrategicProfile } from '../src/systems/diplomacy';
import { id, testWorld } from '../src/testkit';

const N = id.nation;
const member = (delayDays: number, reliability = 1) => ({ role: 'mutual' as const, reliability, delayDays });
const NATO: AllianceTreaty = {
  id: 'NATO',
  kind: 'collective_defense',
  members: { [N('POL')]: member(1), [N('USA')]: member(3), [N('DEU')]: member(10), [N('EST')]: member(1) },
};

/** A stand-in for the combat systems: emits the given events every tick, before diplomacy runs. */
function emitter(events: (tick: number) => SimEvent[]): System {
  return { id: 'emitter', step: (world, ctx) => events(world.tick).forEach((e) => ctx.emit(e)) };
}

const days = (d: number) => d * 4;

describe('alliances', () => {
  it('NATO members join an attacked member after their own delay; a non-member stays out', () => {
    const t = testWorld([createDiplomacy({ alliances: [NATO] })]);
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

  it('does not trigger when the member is the aggressor', () => {
    const t = testWorld([createDiplomacy({ alliances: [NATO] })]);
    t.world.pending.push({ type: 'declare_war', nation: N('POL'), target: N('RUS') });
    t.engine.run(t.world, days(20));
    expect(atWar(t.world, N('RUS'), N('POL'))).toBe(true);
    expect(atWar(t.world, N('RUS'), N('USA'))).toBe(false);
    expect(atWar(t.world, N('RUS'), N('DEU'))).toBe(false);
  });

  it('an ambiguous commitment is honoured by an interventionist guarantor and mostly not by a reluctant one', () => {
    const treaty: AllianceTreaty = {
      id: 'TRA', kind: 'ambiguous',
      members: { [N('USA')]: { role: 'guarantor', reliability: 0, delayDays: 2 }, [N('TWN')]: { role: 'protected', reliability: 0, delayDays: 0 } },
    };
    const joins = (profile: StrategicProfile, opinionTwn: number, opinionChn: number) => {
      let n = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const t = testWorld([createDiplomacy({ alliances: [treaty], profiles: { USA: profile } })], seed);
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
      emitter((tick) => [{ type: 'strike', tick, by: N('USA'), munition: id.munition('t_cruise'), fired: 4, intercepted: 1, target: node, damage: 'hit' }]),
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

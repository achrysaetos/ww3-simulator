import { describe, expect, it } from 'vitest';
import { atWar, relation } from '../src/core/engine';
import { ESCALATION, type NationId, type NodeId, type SimEvent } from '../src/core/types';
import { createDiplomacy, type AllianceTreaty } from '../src/systems/diplomacy';
import { createStrategic } from '../src/systems/strategic';
import { id, testWorld } from '../src/testkit';

const N = id.nation;
const USA = N('USA'), RUS = N('RUS'), POL = N('POL');
const NUKE = id.munition('t_nuke'), SILO = id.platform('t_icbm'), MBT = id.platform('t_mbt');
const DAY = 4;
const rung = (a: NationId, b: NationId, t: { world: Parameters<typeof relation>[0] }) => ESCALATION.indexOf(relation(t.world, a, b).escalation);

const of = <K extends SimEvent['type']>(events: SimEvent[], type: K) => events.filter((e): e is Extract<SimEvent, { type: K }> => e.type === type);

function run(t: ReturnType<typeof testWorld>, ticks: number): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) out.push(...t.engine.step(t.world));
  return out;
}

describe('extended nuclear deterrence', () => {
  /** Russia at war with Poland; NATO's US guarantee covers Poland. Both sides hold ICBMs; Russian armour sits east of Smolensk. */
  function nato(reliability: number, usAtWar = true) {
    const treaty: AllianceTreaty = {
      id: 'NATO', kind: 'collective_defense', triggers: ['territory', 'forces'], guarantors: [USA],
      members: { [POL]: { role: 'mutual', reliability: 1, delayDays: 1 }, [USA]: { role: 'mutual', reliability, delayDays: 30 } },
    };
    const t = testWorld([createStrategic(), createDiplomacy({ alliances: [treaty] })]);
    t.war('RUS', 'POL');
    if (usAtWar) t.war('RUS', 'USA');
    for (const [n, node] of [[USA, t.nodeAt(41, -100)], [RUS, t.nodeAt(56, 60)]] as const) {
      t.world.nations[n].nuclear = { warheads: 10, deployed: 10, doctrine: 'calculated_ambiguity' };
      t.add({ nation: n, name: `${n} silos`, kind: 'strategic', echelon: 'wing', node, equipment: { [SILO]: 10 } });
    }
    const army = t.add({ nation: RUS, name: '1st Guards Tank Army', kind: 'maneuver', echelon: 'corps', node: t.nodeAt(54.5, 35.5), equipment: { [MBT]: 300 } });
    const struck = t.nodeAt(53.5, 22.5) as NodeId;
    t.world.pending.push({ type: 'nuclear_release', nation: RUS, target: struck, warheads: 1, munition: NUKE });
    return { t, army, struck };
  }

  it('answers a nuclear attack on an ally in kind, against the attacker\'s forces in the theatre and not a city', () => {
    const { t, army } = nato(1);
    const events = run(t, 2 * DAY);
    const us = of(events, 'nuclear_detonation').filter((e) => e.by === USA);
    expect(us.length).toBeGreaterThanOrEqual(1);
    expect(us.length).toBeLessThanOrEqual(2);
    for (const e of us) {
      expect(e.node).toBe(army.node);
      expect(t.map.popShare[e.node]).toBeLessThan(0.02);
    }
    expect(t.world.slices.diplomacy.records[RUS].nuclearStruckBy).toContain(USA);
  });

  it('brings a guarantor not yet at war into it at the nuclear rung, even when it answers conventionally', () => {
    const { t } = nato(0, false);
    const events = run(t, 2 * DAY);
    expect(atWar(t.world, USA, RUS)).toBe(true);
    expect(rung(USA, RUS, t)).toBeGreaterThanOrEqual(ESCALATION.indexOf('tactical_nuclear'));
    expect(of(events, 'nuclear_detonation').filter((e) => e.by === USA)).toEqual([]);
    expect(of(events, 'message').some((e) => e.nation === USA && /conventionally/.test(e.text))).toBe(true);
  });

  it('leaves a human guarantor to decide', () => {
    const { t } = nato(1);
    t.world.nations[USA].controlledBy = 'human';
    const events = run(t, 2 * DAY);
    expect(of(events, 'nuclear_detonation').filter((e) => e.by === USA)).toEqual([]);
    expect(of(events, 'message').some((e) => e.nation === USA && /awaits your response/.test(e.text))).toBe(true);
  });
});

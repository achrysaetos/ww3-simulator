import { describe, expect, it } from 'vitest';
import type { NodeId, SimEvent } from '../src/core/types';
import { createDiplomacy } from '../src/systems/diplomacy';
import { createStrategic, type AlertDoctrine } from '../src/systems/strategic';
import { id, testWorld } from '../src/testkit';

const N = id.nation;
const PAK = N('PAK'), IND = N('IND'), ISR = N('ISR'), IRN = N('IRN');
const NUKE = id.munition('t_nuke'), SILO = id.platform('t_icbm');
const DAY = 4;

const of = <K extends SimEvent['type']>(events: SimEvent[], type: K) => events.filter((e): e is Extract<SimEvent, { type: K }> => e.type === type);

function run(t: ReturnType<typeof testWorld>, ticks: number): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) out.push(...t.engine.step(t.world));
  return out;
}

describe('nuclear alerts', () => {
  const doctrine = (coreLossShare: number | null): AlertDoctrine => ({
    spec: { firstHours: 12, firstShare: 0.25, fullHours: 72 },
    threshold: { firstUse: true, coreLossShare, forceLossShare: null, economicLossShare: null, onStrategicAttack: true, onChemBio: true, coversAllies: false },
  });

  function southAsia() {
    const t = testWorld([createStrategic({ alerts: { PAK: doctrine(0.1) } }), createDiplomacy()]);
    t.world.nations[PAK].nuclear = { warheads: 170, deployed: 0, doctrine: 'escalate_to_deescalate' };
    t.world.nations[IND].nuclear = { warheads: 180, deployed: 0, doctrine: 'no_first_use' };
    t.add({ nation: PAK, name: 'Shaheen brigade', kind: 'strategic', echelon: 'brigade', node: t.nodeAt(30, 70), equipment: { [SILO]: 4 } });
    return t;
  }

  it('cannot release stored warheads in peacetime and never alerts', () => {
    const t = southAsia();
    t.world.pending.push({ type: 'nuclear_release', nation: PAK, target: t.nodeAt(28.6, 77.2) as NodeId, warheads: 1, munition: NUKE });
    const events = run(t, 10 * DAY);
    expect(of(events, 'message').some((e) => /no deployed warheads/.test(e.text))).toBe(true);
    expect(of(events, 'nuclear_alert')).toEqual([]);
    expect(t.world.nations[PAK].nuclear.deployed).toBe(0);
  });

  it('mates warheads hours to days after a war with a nuclear-armed rival begins, then can release them', () => {
    const t = southAsia();
    t.war('PAK', 'IND');
    run(t, 1);
    expect(of(t.world.history, 'nuclear_alert').map((e) => e.stage)).toEqual(['ordered']);
    run(t, 1);
    expect(t.world.nations[PAK].nuclear.deployed).toBe(0);
    run(t, 1);
    expect(t.world.nations[PAK].nuclear.deployed).toBe(Math.round(170 * 0.25));
    run(t, 3 * DAY);
    expect(t.world.nations[PAK].nuclear.deployed).toBe(170);
    expect(of(t.world.history, 'nuclear_alert').map((e) => e.stage)).toEqual(['ordered', 'ready', 'complete']);
    t.world.pending.push({ type: 'nuclear_release', nation: PAK, target: t.nodeAt(28.6, 77.2) as NodeId, warheads: 1, munition: NUKE });
    const events = run(t, 1);
    expect(of(events, 'nuclear_detonation').filter((e) => e.by === PAK)).toHaveLength(1);
  });

  it('waits for its doctrine threshold against a non-nuclear enemy', () => {
    const t = testWorld([createStrategic({ alerts: { ISR: doctrine(0.15) } }), createDiplomacy()]);
    t.world.nations[ISR].nuclear = { warheads: 90, deployed: 0, doctrine: 'calculated_ambiguity' };
    t.war('ISR', 'IRN');
    run(t, 2 * DAY);
    expect(of(t.world.history, 'nuclear_alert')).toEqual([]);
    // Iran takes the cells farthest from Jerusalem until a quarter of Israelis live under it: past the 15%
    // threshold, short of a loss that would make Israel capitulate first.
    const capital = t.world.nations[ISR].capital;
    const far = t.map.nodesOf(ISR).sort((a, b) => t.map.distanceKm(b, capital) - t.map.distanceKm(a, capital));
    for (let lost = 0, i = 0; lost < 0.25; i++) { t.world.control[far[i]] = IRN; lost += t.map.popShare[far[i]]; }
    run(t, 2 * DAY);
    expect(of(t.world.history, 'nuclear_alert')[0]).toMatchObject({ nation: ISR, stage: 'ordered' });
    expect(t.world.nations[ISR].nuclear.deployed).toBeGreaterThan(0);
  });
});

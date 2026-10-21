import { describe, expect, it } from 'vitest';
import type { NodeId, SimEvent } from '../src/core/types';
import type { AlertSpec } from '../src/data/nations';
import { createAi } from '../src/systems/ai';
import { createDiplomacy } from '../src/systems/diplomacy';
import { createStrategic } from '../src/systems/strategic';
import { id, testWorld } from '../src/testkit';

const N = id.nation;
const PAK = N('PAK'), IND = N('IND'), ISR = N('ISR'), IRN = N('IRN'), RUS = N('RUS'), UKR = N('UKR');
const NUKE = id.munition('t_nuke'), SILO = id.platform('t_icbm');
const DAY = 4;

const of = <K extends SimEvent['type']>(events: SimEvent[], type: K) => events.filter((e): e is Extract<SimEvent, { type: K }> => e.type === type);

function run(t: ReturnType<typeof testWorld>, ticks: number): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) out.push(...t.engine.step(t.world));
  return out;
}

describe('nuclear alerts', () => {
  const spec: AlertSpec = { firstHours: 12, firstShare: 0.25, fullHours: 72 };

  function southAsia() {
    const t = testWorld([createStrategic({ alerts: { PAK: spec } }), createDiplomacy(), createAi()]);
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
    for (let i = 0; i < DAY && !of(t.world.history, 'nuclear_alert').length; i++) run(t, 1);
    const ordered = of(t.world.history, 'nuclear_alert').filter((e) => e.nation === PAK);
    expect(ordered.map((e) => e.stage)).toEqual(['ordered']);
    expect(ordered[0].reason).toBe('war with nuclear-armed IND');
    const at = ordered[0].tick;
    run(t, at + 2 - t.world.tick);
    expect(t.world.nations[PAK].nuclear.deployed).toBe(0);
    run(t, 1);
    expect(t.world.nations[PAK].nuclear.deployed).toBe(Math.round(170 * 0.25));
    run(t, 3 * DAY);
    expect(t.world.nations[PAK].nuclear.deployed).toBe(170);
    expect(of(t.world.history, 'nuclear_alert').filter((e) => e.nation === PAK).map((e) => e.stage)).toEqual(['ordered', 'ready', 'complete']);
    t.world.pending.push({ type: 'nuclear_release', nation: PAK, target: t.nodeAt(28.6, 77.2) as NodeId, warheads: 1, munition: NUKE });
    const events = run(t, 1);
    expect(of(events, 'nuclear_detonation').filter((e) => e.by === PAK)).toHaveLength(1);
  });

  it('waits for its doctrine threshold against a non-nuclear enemy', () => {
    const t = testWorld([createStrategic({ alerts: { ISR: spec } }), createDiplomacy(), createAi()]);
    t.world.nations[ISR].nuclear = { warheads: 90, deployed: 0, doctrine: 'calculated_ambiguity' };
    t.war('ISR', 'IRN');
    run(t, 2 * DAY);
    expect(of(t.world.history, 'nuclear_alert')).toEqual([]);
    for (let n = 0; n < t.map.landCount; n++) if (t.map.owner[n] === ISR && n !== t.world.nations[ISR].capital) t.world.control[n] = IRN;
    run(t, 2 * DAY);
    expect(of(t.world.history, 'nuclear_alert')[0]).toMatchObject({ nation: ISR, stage: 'ordered' });
    expect(t.world.nations[ISR].nuclear.deployed).toBeGreaterThan(0);
  });

  it("a human player's warheads stay in storage until the player orders the alert", () => {
    const t = southAsia();
    t.world.nations[PAK].controlledBy = 'human';
    t.war('PAK', 'IND');
    run(t, 3 * DAY);
    expect(of(t.world.history, 'nuclear_alert').filter((e) => e.nation === PAK)).toEqual([]);
    t.world.pending.push({ type: 'nuclear_alert', nation: PAK });
    run(t, 4 * DAY);
    expect(of(t.world.history, 'nuclear_alert').filter((e) => e.nation === PAK).map((e) => e.stage)).toEqual(['ordered', 'ready', 'complete']);
    expect(t.world.nations[PAK].nuclear.deployed).toBe(170);
  });

  it('an alert loads non-strategic rounds from central storage onto dual-capable launchers', () => {
    const tac = id.munition('t_nuke_tac');
    const t = testWorld([createStrategic({ alerts: { RUS: { ...spec, loads: { t_tel: { munition: 't_nuke_tac', perLauncher: 1 } } } } }), createDiplomacy()]);
    t.world.nations[RUS].nuclear = { warheads: 100, deployed: 0, doctrine: 'escalate_to_deescalate' };
    const brigade = t.add({ nation: RUS, name: 'Iskander brigade', kind: 'missile', echelon: 'brigade', node: t.nodeAt(51, 36), equipment: { [id.platform('t_tel')]: 12 } });
    expect(brigade.magazine[tac] ?? 0).toBe(0);
    t.war('RUS', 'UKR');
    t.world.pending.push({ type: 'nuclear_alert', nation: RUS });
    run(t, 4 * DAY);
    expect(brigade.magazine[tac]).toBe(12);
    t.world.pending.push({ type: 'nuclear_release', nation: RUS, target: t.nodeAt(50.5, 36.3) as NodeId, warheads: 1, munition: tac });
    expect(of(run(t, 1), 'nuclear_detonation').filter((e) => e.by === RUS)).toHaveLength(1);
    expect(t.world.nations[UKR].status).toBe('war');
  });
});

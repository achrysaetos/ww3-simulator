import { describe, expect, it } from 'vitest';
import type { NodeId, SimEvent } from '../src/core/types';
import type { AlertSpec } from '../src/data/nations';
import { createSession } from '../src/scenarios';
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
    // Iran takes the cells farthest from Jerusalem until a quarter of Israelis live under it: past the 15%
    // threshold, short of a loss that would make Israel capitulate first.
    const capital = t.world.nations[ISR].capital;
    const far = t.map.nodesOf(ISR).sort((a, b) => t.map.distanceKm(b, capital) - t.map.distanceKm(a, capital));
    for (let lost = 0, i = 0; lost < 0.25; i++) { t.world.control[far[i]] = IRN; lost += t.map.popShare[far[i]]; }
    run(t, 2 * DAY);
    expect(of(t.world.history, 'nuclear_alert')[0]).toMatchObject({ nation: ISR, stage: 'ordered' });
    expect(t.world.nations[ISR].nuclear.deployed).toBeGreaterThan(0);
  });

  function russiaAbroad() {
    const t = testWorld([createStrategic({ alerts: { RUS: spec } }), createDiplomacy(), createAi()]);
    t.world.nations[RUS].nuclear = { warheads: 100, deployed: 0, doctrine: 'escalate_to_deescalate' };
    const army = t.add({ nation: RUS, name: 'Combined arms army', kind: 'maneuver', echelon: 'corps', node: t.nodeAt(48.0, 37.8), equipment: { [id.platform('t_mbt')]: 1000 } });
    t.war('RUS', 'UKR');
    run(t, DAY);
    const lose = (share: number) => { army.equipment[id.platform('t_mbt')]! -= Math.round(1000 * share); };
    return { t, lose };
  }

  it('does not mate warheads over a grinding war abroad that wears down a fifth of its forces in a year', () => {
    // ukraine-2026 at caa08de: Russia lost ~12% of its land and air platforms by day 50 and ~24% by day 325 while gaining
    // ground, and its alert fired on day 50. Russia lost more than its pre-war tank fleet in 2022-25 (Oryx) with no alert.
    const { t, lose } = russiaAbroad();
    for (let day = 0; day < 360; day += 3) {
      lose(0.2 / 120);
      run(t, 3 * DAY);
    }
    expect(of(t.world.history, 'nuclear_alert').filter((e) => e.nation === RUS)).toEqual([]);
    expect(t.world.nations[RUS].nuclear.deployed).toBe(0);
  }, 240_000);

  it('mates warheads when its forces collapse within weeks', () => {
    const { t, lose } = russiaAbroad();
    expect(of(t.world.history, 'nuclear_alert').filter((e) => e.nation === RUS)).toEqual([]);
    for (let day = 0; day < 6; day++) {
      lose(0.03);
      run(t, DAY);
    }
    expect(of(t.world.history, 'nuclear_alert').filter((e) => e.nation === RUS)[0]).toMatchObject({ stage: 'ordered', reason: 'first-use threshold approaching' });
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

  it('the United States can raise its readiness: the bombers\' weapons come out of base storage in days, the upload hedge over months', () => {
    const { engine, world } = createSession('peace-2027', 1);
    const USA = N('USA');
    world.nations[USA].controlledBy = 'human';
    const { warheads, deployed } = world.nations[USA].nuclear;
    expect(warheads - deployed).toBeGreaterThan(1500);
    world.pending.push({ type: 'nuclear_alert', nation: USA, reason: 'crisis' });
    const ticks = (hours: number) => {
      for (let i = 0; i < hours / world.dtHours; i++) engine.step(world);
    };
    ticks(72);
    expect(of(world.history, 'nuclear_alert').filter((e) => e.nation === USA).map((e) => e.stage)).toEqual(['ordered']);
    expect(world.nations[USA].nuclear.deployed).toBe(deployed);
    ticks(world.dtHours);
    expect(world.nations[USA].nuclear.deployed).toBe(deployed + Math.round((warheads - deployed) * 0.15));
    expect(of(world.history, 'nuclear_alert').filter((e) => e.nation === USA).map((e) => e.stage)).toEqual(['ordered', 'ready']);
  }, 240_000);
});

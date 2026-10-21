import { describe, expect, it } from 'vitest';
import { relationMut, type System } from '../src/core/engine';
import type { NodeId, SimEvent } from '../src/core/types';
import { civil } from '../src/systems/civil';
import type { Assessment } from '../src/systems/diplomacy';
import { logistics, supplyFactor } from '../src/systems/logistics';
import { id, testWorld } from '../src/testkit';

const DAY = 4; // ticks at the default 6 h
const UKR = id.nation('UKR'), RUS = id.nation('RUS');
const PLENTY = { fuel: 1e7, ammo: 1e7, food: 1e7 };

/** A Russian invasion of Ukraine as civil sees it: war, the capital threatened, and the given cells held by Russia. */
function invasion(systems: System[], occupy: (lat: number, lon: number) => boolean) {
  const t = testWorld(systems);
  t.war('RUS', 'UKR');
  relationMut(t.world, RUS, UKR).opinion = -95;
  relationMut(t.world, UKR, id.nation('BLR')).opinion = -60;
  for (let c = 0; c < t.map.landCount; c++) if (t.map.owner[c] === UKR && occupy(t.map.lat[c], t.map.lon[c])) t.world.control[c] = RUS;
  const threatened: Assessment = { areaLost: 0.1, popLost: 0.1, capitalLost: false, capitalThreatened: true };
  (t.world.slices as { diplomacy?: unknown }).diplomacy = { assessment: { UKR: threatened } };
  return t;
}

const crossed = (t: ReturnType<typeof testWorld>, host: string) => t.world.slices.civil.crossed[`UKR>${host}`] ?? 0;

describe('civilians', () => {
  it('empties an invaded country at the 2022 pace, about half abroad and most of those into Poland', () => {
    const t = invasion([civil], (lat, lon) => lon > 37.5 && lat < 50);
    const before = { ...t.world.slices.civil.nations[UKR] };
    t.engine.run(t.world, 60 * DAY);
    const n = t.world.slices.civil.nations[UKR];
    // UNHCR and IOM, May 2022: ~6M refugees and ~8M IDPs three months in.
    const fledAbroad = n.refugees - before.refugees, fledInside = n.idps - before.idps;
    expect(fledAbroad).toBeGreaterThan(2e6);
    expect(fledAbroad).toBeLessThan(9e6);
    expect(fledInside).toBeGreaterThan(fledAbroad * 0.6);
    expect(fledInside).toBeLessThan(12e6);
    // First-entry split, March 2022: Poland ~57%, Romania ~15%, Hungary and Moldova ~10% each.
    const total = ['POL', 'ROU', 'MDA', 'HUN', 'SVK', 'BLR', 'RUS'].reduce((a, h) => a + crossed(t, h), 0);
    expect(crossed(t, 'POL') / total).toBeGreaterThan(0.35);
    expect(crossed(t, 'POL')).toBeGreaterThan(crossed(t, 'ROU'));
    expect(crossed(t, 'ROU')).toBeGreaterThan(crossed(t, 'MDA') * 0.8);
    expect(crossed(t, 'MDA')).toBeGreaterThan(50_000);
    expect(crossed(t, 'BLR') / total).toBeLessThan(0.02);
    // Many move on from the border states to Germany and Czechia; Moldova keeps few of those who cross.
    const hosted = t.world.slices.civil.hosted;
    expect(hosted['UKR>DEU'] - 1_230_000).toBeGreaterThan(100_000);
    expect(hosted['UKR>MDA'] - 130_000).toBeLessThan(crossed(t, 'MDA') * 0.6);
  });

  it('moves nobody in a country at peace', () => {
    const t = testWorld([civil]);
    const before = structuredClone(t.world.slices.civil);
    t.engine.run(t.world, 10 * DAY);
    expect(t.world.slices.civil.nations).toEqual(before.nations);
    expect(t.world.slices.civil.hosted).toEqual(before.hosted);
  });

  it('kills civilians where strikes land on people, not in empty desert, and in proportion to the rounds that got through', () => {
    const t = testWorld([civil]);
    t.war('RUS', 'UKR');
    t.war('EGY', 'LBY');
    const kyiv = t.nodeAt(50.45, 30.52), desert = t.nodeAt(25, 25);
    const strike = (target: NodeId, by: string, fired: number, intercepted: number): SimEvent => ({ type: 'strike', tick: 0, by: id.nation(by), munition: id.munition('t_cruise'), fired, intercepted, target, effects: [] });
    const killed = () => ({ UKR: t.world.slices.civil.nations[UKR]?.killed ?? 0, LBY: t.world.slices.civil.nations[id.nation('LBY')]?.killed ?? 0 });
    const ctx = t.engine.context(t.world);
    t.world.events = [strike(kyiv, 'RUS', 100, 50), strike(desert, 'EGY', 100, 50)];
    civil.step(t.world, ctx);
    const first = killed();
    expect(first.UKR).toBeGreaterThan(5);
    expect(first.LBY).toBeLessThan(first.UKR / 100);
    t.world.events = [strike(kyiv, 'RUS', 100, 0)];
    civil.step(t.world, ctx);
    expect(killed().UKR - first.UKR).toBeGreaterThan(1.5 * first.UKR);
    expect(t.world.slices.civil.nations[UKR].injured).toBeGreaterThan(2 * t.world.slices.civil.nations[UKR].killed);
  });

  it('turns occupied people into partisans whose rail sabotage starves the occupier, and stays deterministic', () => {
    const south = (lat: number, lon: number) => lon > 33 && lat < 47.6;
    const run = (systems: System[]) => {
      const t = invasion(systems, south);
      // An occupation the world opens with, whose railways the occupier already runs, not ground freshly taken.
      t.engine.init(t.world);
      for (const n of Object.values(t.world.nations)) n.bulk = { ...PLENTY };
      const melitopol = t.nodeAt(46.85, 35.37);
      t.add({ nation: RUS, name: 'RUS brigade', kind: 'maneuver', echelon: 'brigade', node: melitopol, equipment: { [id.platform('t_mbt')]: 90, [id.platform('t_ifv')]: 100, [id.platform('t_inf')]: 60 } });
      let flow = 0;
      for (let d = 0; d < 120; d++) {
        t.engine.run(t.world, DAY);
        flow += supplyFactor(t.world, t.map, melitopol, RUS);
      }
      return { flow: flow / 120, sabotage: t.world.slices.civil?.nations[RUS]?.sabotage ?? 0, infra: [...t.world.theater.infrastructure] };
    };
    const quiet = run([logistics]);
    const partisans = run([civil, logistics]);
    expect(partisans.sabotage).toBeGreaterThan(3);
    expect(partisans.flow).toBeLessThan(quiet.flow - 0.02);
    expect(run([civil, logistics]).infra).toEqual(partisans.infra);
  });
});


import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { Formation, NodeId } from '../src/core/types';
import { applyAirOrder, combatRadiusKm, interceptSalvo, resolveAirBattle } from '../src/systems/air';
import { airWorld, battery, launchers, mid, nation, pid, wing } from './air.fixture';

const USA = nation('USA'), RUS = nation('RUS'), UKR = nation('UKR');
const TAIPEI = [25, 121.5] as const, FUZHOU = [26, 119.3] as const, KYIV = [50.45, 30.5] as const;

const count = (f: Formation) => Object.values(f.equipment).reduce((a, b) => a + b, 0);


describe('air performance', () => {
  it('steps ~800 air, air-defense and missile formations well under 50 ms', () => {
    const t = airWorld(5);
    t.war('USA', 'CHN');
    t.war('RUS', 'UKR');
    const rng = new Rng(99);
    const theaters = [
      { a: 'USA', b: 'CHN', aAt: [22, 120], bAt: [27, 117] },
      { a: 'RUS', b: 'UKR', aAt: [53, 36], bAt: [49, 31] },
    ];
    const targetsB: NodeId[] = [], targetsA: NodeId[] = [];
    for (const th of theaters)
      for (let i = 0; i < 20; i++) {
        targetsB.push(t.node(th.bAt[0] + rng.range(-3, 3), th.bAt[1] + rng.range(-3, 3)));
        targetsA.push(t.node(th.aAt[0] + rng.range(-2, 2), th.aAt[1] + rng.range(-2, 2)));
      }
    for (const th of theaters)
      for (let i = 0; i < 200; i++) {
        for (const [side, at, targets] of [[th.a, th.aAt, targetsB], [th.b, th.bAt, targetsA]] as const) {
          const node = t.node(at[0] + rng.range(-3, 3), at[1] + rng.range(-3, 3));
          const target = targets[i % targets.length];
          if (i % 4 === 0) wing(t, side, node, { t_fighter: 18 }, { posture: 'air_superiority', target });
          else if (i % 4 === 1) wing(t, side, node, { t_fighter: 18 }, { posture: i % 8 === 1 ? 'strike' : 'defend', target, targetClass: 'soft' });
          else if (i % 4 === 2) battery(t, side, node, { x_patriot: 1, x_shorad: 1 });
          else launchers(t, side, node, { x_cruise_tel: 12, x_drone_rack: 4 }, { posture: 'strike', target, targetClass: 'structure' });
        }
      }
    expect(Object.keys(t.world.formations).length).toBe(800);
    const times: number[] = [];
    let strikes = 0, battles = 0;
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      const events = t.tick();
      times.push(performance.now() - start);
      strikes += events.filter((e) => e.type === 'strike').length;
      battles += events.filter((e) => e.type === 'battle').length;
    }
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(`air step, 800 formations: mean ${mean.toFixed(1)} ms, first (cold JIT) ${times[0].toFixed(1)} ms, worst ${Math.max(...times).toFixed(1)} ms; ${strikes} strike and ${battles} battle events`);
    expect(strikes).toBeGreaterThan(100);
    expect(battles).toBeGreaterThan(10);
    expect(mean).toBeLessThan(50);
  });
});

import { expect, it } from 'vitest';
import type { NodeId } from '../src/core/types';
import { aim } from '../src/ui/drag/gesture';
import { beliefOf, buildKit } from '../src/ui/drag/kit';
import { controlOf, donbas, russia, RUS } from './drag.fixture';

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];

it('builds the kit for a four-unit stack in under 30 ms with the field cold and 10 ms warm, and aims 1,000 times in under 20 ms', () => {
  const s = russia();
  const force = donbas(s);
  const cold: number[] = [], warm: number[] = [];
  buildKit(beliefOf(s.world, s.map, RUS, s.engine.catalog), s.engine, RUS, force);
  for (let tick = 0; tick < 5; tick++) {
    s.engine.step(s.world);
    const belief = beliefOf(s.world, s.map, RUS, s.engine.catalog);
    let t = performance.now();
    buildKit(belief, s.engine, RUS, force);
    cold.push(performance.now() - t);
    for (let i = 0; i < 5; i++) {
      t = performance.now();
      buildKit(belief, s.engine, RUS, force);
      warm.push(performance.now() - t);
    }
  }
  expect(median(cold), `cold ${cold.map((x) => x.toFixed(1)).join(' ')} ms`).toBeLessThan(30);
  expect(median(warm), `warm median ${median(warm).toFixed(1)} ms`).toBeLessThan(10);

  const kit = buildKit(beliefOf(s.world, s.map, RUS, s.engine.catalog), s.engine, RUS, force)!;
  const control = controlOf(s.world, s.map);
  const home = kit.units[0].node;
  const targets: NodeId[] = [home, ...s.map.neighbors(home), s.map.nodeAt(48.72, 37.56), s.map.nodeAt(55.75, 37.62)];
  // A drag moves the pointer hundreds of times; the budget is for the warmed-up page.
  for (let i = 0; i < 2000; i++) aim(kit, { node: targets[i % targets.length], contact: null }, s.map, control);
  const t = performance.now();
  for (let i = 0; i < 1000; i++) aim(kit, { node: targets[i % targets.length], contact: null }, s.map, control);
  const ms = performance.now() - t;
  expect(ms, `1,000 aims in ${ms.toFixed(1)} ms`).toBeLessThan(20);
}, 120_000);

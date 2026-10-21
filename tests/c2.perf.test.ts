import { describe, expect, it } from 'vitest';
import { createSession } from '../src/scenarios';
import { c2 } from '../src/systems/c2';

describe('c2 performance', () => {
  it('steps the ww3-2027 world, every major army at war, in a small share of a tick', () => {
    const s = createSession('ww3-2027', 1);
    s.engine.run(s.world, 4);
    const ctx = s.engine.context(s.world);
    const c2Ms: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t = performance.now();
      c2.step(s.world, ctx);
      c2Ms.push(performance.now() - t);
    }
    const tickMs: number[] = [];
    for (let i = 0; i < 4; i++) {
      const t = performance.now();
      s.engine.step(s.world);
      tickMs.push(performance.now() - t);
    }
    // Fastest runs, so other processes on a loaded machine do not decide the verdict.
    const c2Best = Math.min(...c2Ms), tickBest = Math.min(...tickMs);
    console.log(`c2 step: ${c2Best.toFixed(2)} ms of a ${tickBest.toFixed(0)} ms ww3-2027 tick`);
    expect(c2Best).toBeLessThan(15);
    expect(c2Best).toBeLessThan(0.05 * tickBest);
  });
});

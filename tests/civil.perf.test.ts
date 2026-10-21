import { describe, expect, it } from 'vitest';
import type { System } from '../src/core/engine';
import { createSession } from '../src/scenarios';

describe('civil and politics performance', () => {
  it('cost under 5% of a ww3-2027 tick together, with every front, occupation and election calendar live', () => {
    const s = createSession('ww3-2027', 1);
    s.engine.run(s.world, 8);
    const spent: Record<string, number> = {};
    for (const sys of s.engine.systems as System[]) {
      const step = sys.step.bind(sys);
      (sys as { step: System['step'] }).step = (w, c) => {
        const t = performance.now();
        step(w, c);
        spent[sys.id] = (spent[sys.id] ?? 0) + performance.now() - t;
      };
    }
    s.engine.run(s.world, 40);
    const total = Object.values(spent).reduce((a, b) => a + b, 0);
    const ours = (spent.civil ?? 0) + (spent.politics ?? 0);
    console.log(`civil ${(spent.civil / 40).toFixed(2)} ms, politics ${(spent.politics / 40).toFixed(2)} ms, tick ${(total / 40).toFixed(1)} ms`);
    expect(spent.civil).toBeGreaterThan(0);
    expect(ours / total).toBeLessThan(0.05);
  }, 600_000);
});

import { describe, expect, it } from 'vitest';
import type { NationId } from '../src/core/types';
import { createSession } from '../src/scenarios';

const VEN = 'VEN' as NationId;

describe('peace-2027: Venezuela (Red Team XP-6)', () => {
  it('fields the IISS army, not 343k of generated Soviet kit, and keeps its fuel at peace', () => {
    const s = createSession('peace-2027', 1);
    const w = s.world;
    const forces = Object.values(w.formations).filter((f) => f.nation === VEN);
    const count = (id: string) => forces.reduce((n, f) => n + (f.equipment[id] ?? 0), 0);
    // Main: 21 identical infantry divisions with T-55s and MiG-21s that Venezuela never operated.
    expect({ t72: count('t72m1'), amx30: count('amx30'), su30: count('su30mk'), s300: count('s300vm'), t55: count('t55'), mig21: count('mig21') })
      .toEqual({ t72: 92, amx30: 81, su30: 21, s300: 12, t55: 0, mig21: 0 });
    // IISS 2025: about 123k active; the Bolivarian Militia is fielded on top of that.
    expect(forces.reduce((n, f) => n + f.personnel, 0)).toBeLessThan(200_000);

    const before = w.nations[VEN].bulk.fuel;
    s.engine.run(w, 10 * 4);
    // Main: national military fuel falls from 2,100 t to 32 t in ten peacetime days.
    expect(w.nations[VEN].bulk.fuel).toBeGreaterThan(0.8 * before);
  }, 300_000);
});

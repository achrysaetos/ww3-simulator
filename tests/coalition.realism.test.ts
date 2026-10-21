import { describe, expect, it } from 'vitest';
import { atWar } from '../src/core/engine';
import type { NationId } from '../src/core/types';
import { createSession } from '../src/scenarios';

const N = (s: string) => s as NationId;
/** diplomacy/support.ts CAPITULATE_BELOW: war support under which a state may give up. */
const CAPITULATION_FLOOR = 0.1;

describe('CD-1b, CD-3: a NATO-Russia war on its home fronts over 45 days', () => {
  it('Denmark stays willing and in the war, and Poland does not lose the will to fight', () => {
    const s = createSession('ww3-2027', 1);
    const { world } = s;
    const perDay = 24 / world.dtHours;
    const support: Record<string, number[]> = { DNK: [], POL: [] };
    let denmarkAtDay30 = false, sideMadePeace = false;
    for (let d = 1; d <= 45; d++) {
      for (let i = 0; i < perDay; i++) s.engine.step(world);
      for (const n of Object.keys(support)) support[n].push(world.nations[N(n)].warSupport);
      if (d === 30) {
        denmarkAtDay30 = atWar(world, N('DNK'), N('RUS'));
        sideMadePeace = !['USA', 'GBR', 'FRA', 'DEU', 'POL'].some((n) => atWar(world, N('RUS'), N(n)));
      }
    }
    expect(support.DNK[5]).toBeGreaterThan(0.5);
    expect(denmarkAtDay30 || sideMadePeace).toBe(true);
    expect(support.POL[44]).toBeGreaterThan(CAPITULATION_FLOOR);
  });
});

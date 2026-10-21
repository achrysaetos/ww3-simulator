import { describe, expect, it } from 'vitest';
import type { NationId } from '../src/core/types';
import { createWorld } from '../src/core/world';
import { loadMap } from '../src/data/load';
import { profiles, recallReservists } from '../src/data/nations';

const world = createWorld(loadMap(), { profiles });
const nation = (id: string) => world.nations[id as NationId];

describe('national reserves', () => {
  it('start from the IISS reserve figures, not a share of population', () => {
    expect(nation('CHN').reservists).toBe(510_000);
    expect(nation('TWN').reservists).toBe(1_657_000);
    expect(nation('KOR').reservists).toBe(3_100_000);
  });

  it('fall back to the median reserve-to-active ratio where IISS lists none', () => {
    const mys = nation('MYS');
    expect(mys.reservists).toBe(Math.round((mys.stats.armedForces ?? 0) * 0.57));
  });

  it('hold no one ready to replace losses until reservists are recalled', () => {
    for (const n of Object.values(world.nations)) expect(n.reserves).toBe(0);
  });

  it('reach units weeks after a full mobilization, and never in peacetime', () => {
    const twn = { ...nation('TWN') };
    const step = (days: number) => {
      let ready = 0;
      for (let t = 0; t < days * 4; t++) ready += recallReservists(twn, 6 / (24 * 30.4));
      return ready;
    };
    expect(step(30)).toBe(0);
    twn.mobilization = 1;
    const firstWeek = step(7);
    const byTwoMonths = firstWeek + step(53);
    expect(firstWeek / 1_657_000).toBeLessThan(0.15);
    expect(byTwoMonths / 1_657_000).toBeGreaterThan(0.55);
    expect(twn.reservists + byTwoMonths).toBeCloseTo(1_657_000, 0);
  });
});

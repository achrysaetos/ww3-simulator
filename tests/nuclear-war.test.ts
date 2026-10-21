import { describe, expect, it } from 'vitest';
import type { MunitionId, NationId, PlatformId } from '../src/core/types';
import { nuclearForces } from '../src/data/nations/nuclear';
import { createSession } from '../src/scenarios';

const N = (s: string) => s as NationId;
const NINE = ['USA', 'RUS', 'CHN', 'FRA', 'GBR', 'IND', 'PAK', 'ISR', 'PRK'];

describe('nuclear forces as fielded (FAS 2025)', () => {
  const s = createSession('peace-2027', 1);

  it('deploys within 10% of the FAS warhead count for each of the nine states, counting every MIRV', () => {
    for (const n of NINE) {
      const fas = nuclearForces[n].deployed;
      const sim = s.world.nations[N(n)].nuclear.deployed;
      expect(Math.abs(sim - fas), `${n}: ${sim} deployed against FAS ${fas}`).toBeLessThanOrEqual(0.1 * fas);
    }
  });

  it('keeps Russian SSBNs on patrol in peacetime, each carrying a MIRVed load', () => {
    const atSea = Object.values(s.world.formations).filter((f) => f.nation === 'RUS' && s.map.isSea(f.node)
      && Object.keys(f.equipment).some((p) => s.catalog.platform(p as PlatformId).class === 'ssbn'));
    expect(atSea.length).toBeGreaterThan(0);
    for (const f of atSea) expect(f.magazine['bulava' as MunitionId] ?? 0).toBeGreaterThanOrEqual(64);
  });
});

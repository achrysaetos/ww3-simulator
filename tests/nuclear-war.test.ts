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

describe('SSBNs in port', () => {
  it('die to a warhead or two on the base, while the boat on patrol survives', () => {
    const s = createSession('peace-2027', 1);
    const boats = (name: string) => {
      const f = Object.values(s.world.formations).find((x) => x.name === name)!;
      return f.status === 'destroyed' ? 0 : Object.values(f.equipment).reduce((a, n) => a + n, 0);
    };
    const port = Object.values(s.world.formations).find((f) => f.name === '25th Submarine Division')!;
    expect(boats('25th Submarine Division')).toBe(4);
    s.world.pending.push({ type: 'nuclear_release', nation: N('USA'), target: port.node, warheads: 2, munition: 'minuteman3' as MunitionId });
    s.engine.step(s.world);
    expect(boats('25th Submarine Division')).toBeLessThanOrEqual(1);
    expect(boats('25th Submarine Division, SSBN on patrol')).toBe(1);
  });
});

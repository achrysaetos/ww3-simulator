import { describe, expect, it } from 'vitest';
import { relationMut } from '../src/core/engine';
import type { FormationId, NationId } from '../src/core/types';
import { createSession } from '../src/scenarios';
import { cepFactor, isrFactor, spaceSupport } from '../src/systems/strategic';

const N = (s: string) => s as NationId;
const sats = (w: ReturnType<typeof createSession>['world'], n: string) => w.slices.strategic.space[N(n)];

describe('national satellite constellations', () => {
  const s = createSession('peace-2027', 1);
  s.engine.step(s.world);

  it('give the space powers navigation, reconnaissance and communications satellites', () => {
    const space = { USA: sats(s.world, 'USA'), CHN: sats(s.world, 'CHN'), RUS: sats(s.world, 'RUS'), GBR: sats(s.world, 'GBR') };
    expect(space.USA.nav_satellite.alive).toBe(31);
    expect(space.USA.recon_satellite.alive).toBe(20);
    expect(space.USA.comms_satellite.alive).toBeGreaterThan(200);
    expect(space.CHN.nav_satellite.alive).toBe(30);
    expect(space.CHN.recon_satellite.alive).toBeGreaterThan(200);
    expect(space.RUS.nav_satellite.alive).toBe(24);
    expect(space.GBR.comms_satellite.alive).toBeGreaterThan(0);
    expect(isrFactor(s.world, N('USA'))).toBe(1);
  });

  it('are what a Chinese ASAT brigade at war shoots down, leaving debris and blinding US strikes on mobile targets', () => {
    const w = createSession('peace-2027', 1);
    const find = (name: RegExp) => Object.values(w.world.formations).find((f) => name.test(f.name))!;
    const imaging = find(/NRO imaging/), asat = find(/SC-19/);
    relationMut(w.world, N('CHN'), N('USA')).atWar = true;
    asat.order = { posture: 'strike', targetFormation: imaging.id as FormationId, issuedTick: 0 };
    for (let i = 0; i < 8; i++) w.engine.step(w.world);
    const recon = sats(w.world, 'USA').recon_satellite;
    expect(recon.lost).toBeGreaterThan(0);
    expect(w.world.slices.strategic.debris).toBeGreaterThan(0);
    const jdam = { kind: 'glide_bomb' } as Parameters<typeof spaceSupport>[2];
    expect(isrFactor(w.world, N('USA'))).toBeLessThan(1);
    expect(spaceSupport(w.world, N('USA'), jdam, true)).toBeLessThan(1);
    expect(cepFactor(w.world, N('USA'))).toBe(1);
  });

  it('degrade GNSS-aided weapons when navigation satellites are lost, but not seeker-guided ones', () => {
    const w = createSession('peace-2027', 1);
    w.engine.step(w.world);
    const nav = sats(w.world, 'USA').nav_satellite;
    nav.lost = nav.alive;
    nav.alive = 0;
    const kind = (k: string) => ({ kind: k }) as Parameters<typeof spaceSupport>[2];
    expect(spaceSupport(w.world, N('USA'), kind('glide_bomb'), false)).toBeCloseTo(1 / 3);
    expect(spaceSupport(w.world, N('USA'), kind('antiship_cruise'), false)).toBe(1);
    expect(spaceSupport(w.world, N('CHN'), kind('glide_bomb'), false)).toBe(1);
  });
});

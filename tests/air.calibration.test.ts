/**
 * Historical anchors for the air model. Each case rebuilds a published engagement
 * with fixture weapons that mirror the real ones, averages over seeds, logs the
 * measured value, and asserts the range the record supports.
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { Formation } from '../src/core/types';
import { interceptSalvo, resolveAirBattle } from '../src/systems/air';
import { airWorld, battery, launchers, mid, pid, wing, type AirWorld } from './air.fixture';

const SEEDS = 12;
const KYIV = [50.45, 30.5] as const, NEVATIM = [31.2, 35.0] as const, ISFAHAN = [32.6, 51.6] as const;
const lostFrom = (f: Formation, start: number) => start - Object.values(f.equipment).reduce((a, b) => a + b, 0);

function raidRate(setup: (t: AirWorld, seed: number) => void, ticks = 1, munitions?: string[]) {
  let fired = 0, intercepted = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const t = airWorld(seed);
    setup(t, seed);
    for (const e of t.strikes(t.tick(ticks)))
      if (!munitions || munitions.includes(e.munition)) {
        fired += e.fired;
        intercepted += e.intercepted;
      }
  }
  return { fired: fired / SEEDS, rate: intercepted / fired };
}

describe('calibration', () => {
  it('a national Shahed raid on a deep, a frontline and an undefended city: ~80-90 % shot down by the counter-drone belt and SAMs (Ukrainian Air Force reports 2023-24)', () => {
    const r = raidRate((t) => {
      t.war('RUS', 'UKR');
      const cities = [[50.45, 30.5, 2, 1], [49.99, 36.23, 1, 0], [46.5, 30.7, 0, 0]] as const;
      for (const [lat, lon, shorad, patriot] of cities) {
        const city = t.node(lat, lon);
        for (let i = 0; i < shorad; i++) battery(t, 'UKR', city, { x_shorad: 1 });
        if (patriot) battery(t, 'UKR', city, { x_patriot: 1 });
        launchers(t, 'RUS', t.node(51.5, 36.5), { x_drone_rack: 30 }, { posture: 'strike', target: city, targetClass: 'structure' });
      }
    });
    console.log(`Shahed raid: ${r.fired.toFixed(0)} drones/raid, ${(r.rate * 100).toFixed(1)} % intercepted`);
    expect(r.rate).toBeGreaterThan(0.75);
    expect(r.rate).toBeLessThan(0.95);
  });

  it('Patriot PAC-3 vs Kinzhal: most intercepted when one battery faces a handful (Kyiv, May 2023)', () => {
    let killed = 0;
    const rng = new Rng(1);
    for (let i = 0; i < 200; i++)
      killed += interceptSalvo({ count: 6, speedMach: 8, interceptDifficulty: 0.45 }, { channels: 9 * 0.8, interceptors: 32, pk: 0.85, rangeKm: 100 * 0.25 }, rng).intercepted;
    const rate = killed / 1200;
    console.log(`Kinzhal vs one PAC-3 battery: ${(rate * 100).toFixed(1)} % intercepted`);
    expect(rate).toBeGreaterThan(0.55);
    expect(rate).toBeLessThan(0.95);
  });

  it('Iran vs Israel, Oct 2024: ~180 MRBMs, ~30-40 impacts at Nevatim, so ~75-85 % stopped', () => {
    const r = raidRate((t) => {
      t.war('IRN', 'ISR');
      const nev = t.node(...NEVATIM);
      for (let i = 0; i < 4; i++) battery(t, 'ISR', nev, { x_arrow_bty: 1 });
      for (let i = 0; i < 6; i++) battery(t, 'ISR', nev, { x_patriot: 1 });
      launchers(t, 'IRN', t.node(...ISFAHAN), { x_mrbm_tel: 900 }, { posture: 'strike', target: nev, targetClass: 'structure' });
    }, 1, ['x_mrbm']);
    console.log(`Iranian MRBM salvo: ${r.fired.toFixed(0)} missiles, ${(r.rate * 100).toFixed(1)} % intercepted`);
    expect(r.fired).toBeGreaterThan(150);
    expect(r.rate).toBeGreaterThan(0.65);
    expect(r.rate).toBeLessThan(0.9);
  });

  it('Iran vs Israel, Apr 2024: ~170 drones and ~30 cruise missiles, ~99 % downed with allied fighters', () => {
    const r = raidRate((t) => {
      t.war('IRN', 'ISR');
      t.war('IRN', 'USA');
      const nev = t.node(...NEVATIM);
      wing(t, 'ISR', t.node(32, 35), { t_fighter: 80 });
      wing(t, 'USA', t.node(31.5, 36.5), { t_fighter: 40 });
      for (let i = 0; i < 4; i++) battery(t, 'ISR', nev, { x_shorad: 1 });
      for (let i = 0; i < 2; i++) battery(t, 'ISR', nev, { x_patriot: 1 });
      const iran = t.node(...ISFAHAN);
      launchers(t, 'IRN', iran, { x_drone_rack: 170 }, { posture: 'strike', target: nev, targetClass: 'structure' });
      launchers(t, 'IRN', t.node(33.5, 46), { x_cruise_tel: 50 }, { posture: 'strike', target: nev, targetClass: 'structure' });
    }, 1, ['x_shahed', 't_cruise']);
    console.log(`April 2024 drone/cruise raid: ${r.fired.toFixed(0)} weapons, ${(r.rate * 100).toFixed(1)} % intercepted`);
    expect(r.fired).toBeGreaterThan(150);
    expect(r.rate).toBeGreaterThan(0.93);
  });

  it('loss per sortie into a dense IADS: ~0.5-3 % for 4th-gen strike, under 0.3 % for stealth (Linebacker II, ODS, F-117 record)', () => {
    const perSortie = (aircraft: string, perLoad: number) => {
      let lost = 0, sorties = 0;
      for (let seed = 1; seed <= SEEDS; seed++) {
        const t = airWorld(seed);
        t.war('USA', 'IRQ');
        const baghdad = t.node(33.3, 44.4);
        for (let i = 0; i < 4; i++) battery(t, 'IRQ', baghdad, { x_patriot: 1 });
        for (let i = 0; i < 4; i++) battery(t, 'IRQ', baghdad, { x_shorad: 1 });
        const w = wing(t, 'USA', t.node(28.5, 46), { [aircraft]: 48 }, { posture: 'strike', target: baghdad, targetClass: 'structure' });
        for (const e of t.strikes(t.tick(4))) if (e.munition === mid('x_jdam')) sorties += e.fired / perLoad;
        const l = lostFrom(w, 48) + Object.values(w.damaged).reduce((a, b) => a + b, 0);
        lost += l;
        sorties += l;
      }
      return lost / sorties;
    };
    const legacy = perSortie('x_striker', 4), stealth = perSortie('x_stealth_striker', 2);
    console.log(`loss per sortie vs dense IADS: 4th-gen ${(legacy * 100).toFixed(2)} %, stealth ${(stealth * 100).toFixed(3)} %`);
    expect(legacy).toBeGreaterThan(0.005);
    expect(legacy).toBeLessThan(0.03);
    expect(stealth).toBeLessThan(0.003);
  });

  it('Desert Storm air combat: AWACS-cued, longer-ranged coalition fighters won ~30+ to 1', () => {
    let blueLost = 0, redLost = 0;
    const t = airWorld();
    const p = (id: string) => t.catalog.platform(pid(id));
    for (let seed = 1; seed <= 50; seed++) {
      const r = resolveAirBattle(
        { flights: [{ platform: p('t_fighter'), aircraft: 24, aam: t.catalog.munition(mid('t_aam')), missiles: 24 * 6, experience: 0.8 }], awacsKm: 450 },
        { flights: [{ platform: p('x_mig'), aircraft: 24, aam: t.catalog.munition(mid('x_r27')), missiles: 24 * 4, experience: 0.3 }], awacsKm: 0 },
        new Rng(seed),
      );
      blueLost += r.a[0].lost;
      redLost += r.b[0].lost;
    }
    console.log(`ODS-style air combat exchange: ${redLost} lost vs ${blueLost} (${(redLost / Math.max(1, blueLost)).toFixed(1)}:1)`);
    expect(redLost).toBeGreaterThan(10 * Math.max(1, blueLost));
  });

  it('missile salvos on an unsheltered airbase kill aircraft on the ground (CSIS 2023: most US losses were parked aircraft)', () => {
    let killed = 0, hits = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const t = airWorld(seed);
      t.war('USA', 'CHN');
      const base = t.node(33, 131);
      const w = wing(t, 'USA', base, { t_fighter: 150 });
      launchers(t, 'CHN', t.node(26, 119.3), { x_mrbm_tel: 400 }, { posture: 'strike', target: base, targetClass: 'aircraft' });
      for (const e of t.strikes(t.tick())) hits += e.fired - e.intercepted;
      killed += lostFrom(w, 150);
    }
    const perHit = killed / hits;
    console.log(`airbase strike: ${(perHit).toFixed(2)} aircraft knocked out per arriving missile`);
    expect(perHit).toBeGreaterThan(0.2);
    expect(perHit).toBeLessThan(0.6);
  });
});

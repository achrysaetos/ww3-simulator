import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MunitionId, NationId, PlatformId, SimEvent } from '../src/core/types';
import { nuclearThreshold, strategicProfile } from '../src/data/nations';
import { nuclearForces } from '../src/data/nations/nuclear';
import { createSession } from '../src/scenarios';
import { atWar, relation } from '../src/core/engine';
import { detonate, targetList } from '../src/systems/strategic';

const N = (s: string) => s as NationId;
const NINE = ['USA', 'RUS', 'CHN', 'FRA', 'GBR', 'IND', 'PAK', 'ISR', 'PRK'];

describe('nuclear thresholds', () => {
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(p) ? [p] : [];
    });
  }

  it('are written in one table, and every armed state reads its threshold from it', () => {
    const writers = sources('src').filter((f) => /\bfirstUse: (true|false)/.test(readFileSync(f, 'utf8')));
    expect(writers).toEqual([join('src', 'data', 'nations', 'strategic.ts')]);
    for (const n of NINE) expect(nuclearThreshold(n)).toBe(strategicProfile[n].nuclearThreshold);
    expect(nuclearThreshold('BEL')).toMatchObject({ firstUse: false });
  });
});

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

describe('city casualties', () => {
  it('kills about as many as Hiroshima with a Hiroshima-size air burst on a city of Hiroshima\'s 1945 size', () => {
    const s = createSession('peace-2027', 1);
    const alone = (node: number) => s.map.cities.filter((c) => c.node === node).length === 1;
    const city = s.map.cities.filter((c) => c.pop >= 300_000 && c.pop <= 380_000 && alone(c.node)).sort((a, b) => a.node - b.node)[0];
    const ctx = s.engine.context(s.world);
    const nodong = s.catalog.munition('nodong' as MunitionId);
    expect(nodong.yieldKt).toBe(15);
    const before = s.world.slices.strategic.totals.deaths;
    detonate(s.world, ctx, N('PRK'), city.node, nodong, 1, 'air');
    // RERF: 70-80k immediate deaths in Hiroshima (15 kt air burst, ~340k people).
    const dead = s.world.slices.strategic.totals.deaths - before;
    expect(dead, `${city.name}, ${city.pop}`).toBeGreaterThan(55_000);
    expect(dead).toBeLessThan(110_000);
  });
});

describe('theatre missile defence', () => {
  it('stops much of a North Korean MRBM and IRBM salvo on Korea and Japan, but some warheads leak through', () => {
    const s = createSession('korea-2027', 1);
    const prk = s.world.nations[N('PRK')];
    prk.controlledBy = 'human';
    prk.nuclear.deployed = prk.nuclear.warheads;
    const city = (name: string) => s.map.cities.find((c) => c.name === name)!.node;
    for (const [target, munition, warheads] of [['Busan', 'nodong', 6], ['Seoul', 'nodong', 6], ['Tokyo', 'hwasong12', 8]] as const)
      s.world.pending.push({ type: 'nuclear_release', nation: N('PRK'), target: city(target), warheads, munition: munition as MunitionId });
    const strikes = s.engine.step(s.world).filter((e) => e.type === 'strike' && e.by === 'PRK');
    const fired = strikes.reduce((a, e) => a + (e.type === 'strike' ? e.fired : 0), 0);
    const intercepted = strikes.reduce((a, e) => a + (e.type === 'strike' ? e.intercepted : 0), 0);
    expect(fired).toBe(20);
    expect(intercepted).toBeGreaterThan(fired / 2);
    expect(intercepted).toBeLessThan(fired);
  });
});

describe('a nuclear attack is answered, declared or not', () => {
  const nuclearBy = (events: SimEvent[], by: string) => events.filter((e) => e.type === 'nuclear_detonation' && e.by === by).length;

  it('a US surprise counterforce strike from peace draws a Russian launch on warning of hundreds of warheads, before it lands', () => {
    const s = createSession('peace-2027', 1);
    const w = s.world;
    w.nations[N('USA')].controlledBy = 'human';
    s.engine.step(w);
    expect(atWar(w, N('USA'), N('RUS'))).toBe(false);
    for (const t of targetList(w, s, N('USA'), N('RUS'), 'counterforce').slice(0, 200))
      for (const munition of ['minuteman3', 'trident2_d5'] as MunitionId[]) w.pending.push({ type: 'nuclear_release', nation: N('USA'), target: t.node, warheads: 2, munition });
    const events = s.engine.step(w);
    expect(nuclearBy(events, 'USA')).toBeGreaterThan(250);
    expect(nuclearBy(events, 'RUS')).toBeGreaterThan(200);
    expect(atWar(w, N('USA'), N('RUS'))).toBe(true);
    expect(w.slices.diplomacy.records[N('RUS')].nuclearStruckBy).toContain('USA');
  });

  it('North Korea nuking Vladivostok puts Russia at war with it, and Russia answers within a day', () => {
    const s = createSession('korea-2027', 1);
    const w = s.world;
    const prk = w.nations[N('PRK')];
    prk.controlledBy = 'human';
    prk.nuclear.deployed = prk.nuclear.warheads;
    const vladivostok = s.map.cities.find((c) => c.name === 'Vladivostok')!.node;
    w.pending.push({ type: 'nuclear_release', nation: N('PRK'), target: vladivostok, warheads: 1, munition: 'hwasong12' as MunitionId });
    expect(nuclearBy(s.engine.step(w), 'PRK')).toBe(1);
    expect(atWar(w, N('PRK'), N('RUS'))).toBe(true);
    let answered = 0;
    for (let t = 0; t < 4; t++) for (const e of s.engine.step(w)) if (e.type === 'nuclear_detonation' && e.by === 'RUS' && s.map.owner[e.node] === 'PRK') answered++;
    expect(answered).toBeGreaterThan(0);
  });

  it('a nuclear salvo shot down whole is still a nuclear attack: Japan goes to war and its guarantor deliberates', () => {
    const s = createSession('korea-2027', 1);
    const w = s.world;
    w.params = { 'strategic.BMD_LEAKAGE': 0.05 };
    const prk = w.nations[N('PRK')];
    prk.controlledBy = 'human';
    prk.nuclear.deployed = prk.nuclear.warheads;
    const tokyo = s.map.cities.find((c) => c.name === 'Tokyo')!.node;
    w.pending.push({ type: 'nuclear_release', nation: N('PRK'), target: tokyo, warheads: 1, munition: 'hwasong12' as MunitionId });
    const events = s.engine.step(w);
    expect(nuclearBy(events, 'PRK')).toBe(0);
    expect(atWar(w, N('PRK'), N('JPN'))).toBe(true);
    expect(w.slices.diplomacy.records[N('JPN')].nuclearStruckBy).toContain('PRK');
    expect(relation(w, N('PRK'), N('JPN')).escalation).toBe('strategic_nuclear');
    expect(w.slices.diplomacy.umbrella.some((c) => c.ally === 'JPN' && c.attacker === 'PRK')).toBe(true);
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

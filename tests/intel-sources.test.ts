import { beforeAll, describe, expect, it } from 'vitest';
import { Engine } from '../src/core/engine';
import type { FormationId, NationId, PlatformId, World } from '../src/core/types';
import { createSession, type Session } from '../src/scenarios';
import { SYSTEMS } from '../src/systems';
import type { Contact } from '../src/systems/intel';

const UKR = 'UKR' as NationId, RUS = 'RUS' as NationId, USA = 'USA' as NationId, IRN = 'IRN' as NationId, ISR = 'ISR' as NationId;

const contactsOn = (w: World, observer: NationId, of: NationId, kind?: string): [FormationId, Contact][] =>
  (Object.entries(w.slices.intel.pictures[observer] ?? {}) as [FormationId, Contact][]).filter(([id, c]) => w.formations[id]?.nation === of && (!kind || c.kind === kind));

describe('gulf-2027: Israel can find Iranian missile bases (Red Team CE-6)', () => {
  it('holds contacts on Iranian missile formations at their bases within three days', () => {
    const s = createSession('gulf-2027', 1);
    s.engine.run(s.world, 12);
    const missiles = Object.values(s.world.formations).filter((f) => f.nation === IRN && f.kind === 'missile' && f.status !== 'destroyed');
    expect(missiles.length).toBeGreaterThan(5);
    // Main: none of the 14 bases is ever fixed, so the counter-force campaign never starts.
    expect(contactsOn(s.world, ISR, IRN, 'missile').length).toBeGreaterThanOrEqual(3);
  }, 300_000);
});

describe('ukraine-2026: intelligence a supporting power passes on (Red Team CE-7)', () => {
  let s: Session;
  beforeAll(() => {
    s = createSession('ukraine-2026', 1);
    s.engine.run(s.world, 4);
  }, 300_000);
  const satelliteFixes = (w: World) => contactsOn(w, UKR, RUS).filter(([, c]) => c.source === 'satellite' || c.source === 'airborne').length;

  it('Ukraine holds satellite and ISR fixes on Russian forces, fed by US and commercial collection', () => {
    // Main: Ukraine's only sources are its own ground, garrisons and contact; the US is not at war, so it shares nothing.
    expect(satelliteFixes(s.world)).toBeGreaterThan(5);
  });

  it('a US intelligence pause leaves Ukraine fewer of them', () => {
    const run = (share: number | undefined) => {
      const w = structuredClone(s.world);
      if (share !== undefined) w.params = { ...w.params, 'intel.SUPPORT_SHARE': share };
      const e = new Engine(s.map, s.catalog, SYSTEMS);
      e.run(w, 8);
      return satelliteFixes(w);
    };
    const shared = run(undefined), paused = run(0);
    expect(paused).toBeLessThan(shared);
    // Commercial imagery Ukraine buys itself still comes through.
    expect(paused).toBeGreaterThan(0);
  }, 300_000);

  it('a formation destroyed far from Ukrainian troops stays in the picture until it goes stale', () => {
    const w = structuredClone(s.world);
    const near = new Set<number>();
    for (const f of Object.values(w.formations))
      if (f.nation === UKR && f.status === 'active' && !s.map.isSea(f.node)) for (const n of [f.node, ...s.map.neighbors(f.node)]) near.add(n);
    const [id] = contactsOn(w, UKR, RUS, 'air_wing').find(([fid]) => !near.has(w.formations[fid].node))!;
    w.formations[id].status = 'destroyed';
    new Engine(s.map, s.catalog, SYSTEMS).step(w);
    // Main: dropped the tick it died, telling Ukraine of a loss no Ukrainian saw.
    expect(w.slices.intel.pictures[UKR][id]).toBeDefined();
  }, 300_000);
});

describe('ukraine-2026: airborne and satellite ISR need to fly and to see (Red Team CE-8)', () => {
  let s: Session;
  beforeAll(() => {
    s = createSession('ukraine-2026', 1);
    s.engine.run(s.world, 4);
  }, 300_000);
  const freshFixes = (w: World, source: string, ground: boolean) => {
    let n = 0;
    for (const p of Object.values(w.slices.intel.pictures))
      for (const [id, c] of Object.entries(p)) if (c.tick === w.tick - 1 && c.source === source && (c.kind === 'surface_group') !== ground && !!w.formations[id as FormationId]) n++;
    return n;
  };

  it('AEW and maritime patrol radars fix no ground forces', () => {
    const w = structuredClone(s.world);
    for (const f of Object.values(w.formations)) for (const pid in f.equipment) if (s.catalog.platform(pid as PlatformId).class === 'isr_drone') f.equipment[pid as PlatformId] = 0;
    // Russia's A-50 wing flown from Belgorod, within radar reach of the Ukrainian brigades around Kharkiv.
    const aew = Object.values(w.formations).find((f) => f.nation === RUS && f.kind === 'air_wing' && Object.keys(f.equipment).some((pid) => s.catalog.platform(pid as PlatformId).class === 'awacs'))!;
    aew.node = aew.home = s.map.nodeAt(50.64, 36.59);
    new Engine(s.map, s.catalog, SYSTEMS).step(w);
    // Main: any wing holding an A-50 or E-3 fixes every brigade within 300 km of its airfield.
    expect(freshFixes(w, 'airborne', true)).toBe(0);
  }, 300_000);

  it('satellites fix fewer formations under full overcast than under a clear sky', () => {
    const imaged = (cloud: number) => {
      const w = structuredClone(s.world);
      w.slices.weather.cloud.fill(cloud);
      const e = new Engine(s.map, s.catalog, SYSTEMS.filter((x) => x.id !== 'weather'));
      let fixes = 0;
      for (let t = 0; t < 8; t++) {
        e.step(w);
        fixes += freshFixes(w, 'satellite', true);
      }
      return fixes;
    };
    const clear = imaged(0), overcast = imaged(1);
    expect(clear).toBeGreaterThan(0);
    expect(overcast).toBeLessThan(0.8 * clear);
  }, 300_000);
});

describe('peace-2027: a march re-ordered every tick still gets there (Red Team XP-8)', () => {
  it('an Iranian division ordered over the Zagros again and again covers the ground one order would', () => {
    const s = createSession('peace-2027', 1);
    s.engine.step(s.world);
    const shiraz = s.map.nodeAt(29.6, 52.5);
    const march = (resend: boolean) => {
      const w = structuredClone(s.world);
      w.nations[IRN].controlledBy = 'human';
      const f = Object.values(w.formations).find((x) => x.name === '16th Armoured Division' && x.nation === IRN)!;
      const order = { type: 'order' as const, nation: IRN, formation: f.id, order: { posture: 'move' as const, target: shiraz }, byPlayer: true as const };
      const e = new Engine(s.map, s.catalog, SYSTEMS);
      w.pending.push(order);
      for (let t = 0; t < 24; t++) {
        e.step(w);
        if (resend) w.pending.push(order);
      }
      return s.map.distanceKm(f.node, shiraz);
    };
    const once = march(false), again = march(true);
    expect(once).toBeLessThan(400);
    // Main: each new order zeroes the progress toward the next hill cell, so the division never leaves Tehran (~800 km out).
    expect(again).toBeLessThanOrEqual(once + 150);
  }, 300_000);
});

describe('ww3-2027: co-belligerents without a treaty do not pool satellite intelligence (Red Team CE-7)', () => {
  it('Russia images US forces; Iran, with no satellites of its own and no treaty with Russia, gets none of it', () => {
    const s = createSession('ww3-2027', 1);
    s.engine.run(s.world, 24);
    const imaged = (o: NationId) => contactsOn(s.world, o, USA).filter(([, c]) => c.source === 'satellite').length;
    expect(imaged(RUS)).toBeGreaterThan(0);
    // Main: Iran and the DPRK each hold Russia's satellite fixes on US forces. The DPRK keeps them: its 2024 treaty with Russia (Art. 4) is an alliance.
    expect(imaged(IRN)).toBe(0);
  }, 300_000);
});


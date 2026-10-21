import { beforeAll, describe, expect, it } from 'vitest';
import { Engine } from '../src/core/engine';
import { addFormation } from '../src/core/forces';
import type { Formation, FormationId, MunitionId, NationId, NodeId, PlatformId, World } from '../src/core/types';
import { createSession, type Session } from '../src/scenarios';
import { SYSTEMS } from '../src/systems';
import { c2, c2FireFactor, jamAgainst, jammedHits, orderDelayHours } from '../src/systems/c2';
import { landCombat, landMovement } from '../src/systems/land';
import { platformCount } from '../src/core/forces';
import { id, testWorld } from '../src/testkit';

const UKR = 'UKR' as NationId, RUS = 'RUS' as NationId, USA = 'USA' as NationId;

let s: Session;
/** The Russian-held front cell where Russian EW jams Ukrainian GNSS hardest, and a Ukrainian cell beside it. */
let front: NodeId, launchSite: NodeId;
/** A Ukrainian rear cell with no Russian jammer in reach. */
let rear: NodeId;

const neighbours = (n: number) => Array.from({ length: s.map.adjStart[n + 1] - s.map.adjStart[n] }, (_, k) => s.map.adj[s.map.adjStart[n] + k] as NodeId);
const fork = (world: World) => ({ world: structuredClone(world), engine: new Engine(s.map, s.catalog, SYSTEMS) });

beforeAll(() => {
  s = createSession('ukraine-2026', 1);
  s.engine.step(s.world);
  let best = 0;
  for (let n = 0; n < s.map.landCount; n++) {
    if (s.world.control[n] !== RUS) continue;
    const site = neighbours(n).find((m) => s.world.control[m] === UKR);
    const j = jamAgainst(s.world, n as NodeId, UKR).gnss;
    if (site !== undefined && j > best) [best, front, launchSite] = [j, n as NodeId, site];
  }
  rear = s.map.nodeAt(49.84, 24.03); // Lviv
});

describe('ukraine-2026: Russian EW', () => {
  it('jams satellite navigation along the front and not in the Ukrainian rear', () => {
    expect(jamAgainst(s.world, front, UKR).gnss).toBeGreaterThan(0.85);
    expect(jamAgainst(s.world, rear, UKR)).toEqual({ gnss: 0, comms: 0, radar: 0 });
  });

  it('cuts GNSS-guided munitions and radio-flown drones near the front, as in 2023-24, and leaves the rest', () => {
    const kept = (id: string, at: NodeId) => jammedHits(s.world, at, UKR, s.catalog.munition(id as MunitionId), 1000) / 1000;
    // Excalibur's hit rate fell from ~70% to ~6% (Washington Post, May 2024): ~10% of its effect left.
    expect(kept('excalibur', front)).toBeLessThan(0.2);
    expect(kept('gmlrs', front)).toBeLessThan(0.6);
    expect(kept('jdam_er', front)).toBeLessThan(0.4);
    expect(kept('fpv', front)).toBeLessThan(0.9);
    // INS and terminal seekers: a cruise missile keeps most of its accuracy; a fibre-optic FPV and a laser-guided bomb all of it.
    expect(kept('storm_shadow', front)).toBeGreaterThan(0.8);
    expect(kept('fpv_fiber', front)).toBe(1);
    expect(kept('gbu12', front)).toBe(1);
    for (const id of ['excalibur', 'gmlrs', 'jdam_er', 'fpv']) expect(kept(id, rear)).toBe(1);
  });

  it('takes fire off HIMARS units at the front in land combat, not off units in the rear', () => {
    const { world, engine } = fork(s.world);
    const at = (node: NodeId) => addFormation(world, s.catalog, { nation: UKR, name: 'test HIMARS battalion', kind: 'artillery', echelon: 'battalion', node, equipment: { ['himars' as PlatformId]: 18 } });
    const near = at(front), far = at(rear);
    engine.step(world);
    // GMLRS loses ~60% of its effect under full jamming (above); communications jamming costs a little more.
    expect(c2FireFactor(world, near)).toBeLessThan(0.6);
    expect(c2FireFactor(world, far)).toBeGreaterThan(0.95);
  });

  it('jams Ukrainian strike drones flown into the front: fewer hits land than the same raid without EW', () => {
    const raid = (ew: boolean) => {
      const { world, engine } = fork(s.world);
      if (!ew) delete (world.slices as Partial<World['slices']>).c2;
      const e = ew ? engine : new Engine(s.map, s.catalog, SYSTEMS.filter((x) => x.id !== 'c2'));
      const f = addFormation(world, s.catalog, { nation: UKR, name: 'test drone group', kind: 'missile', echelon: 'battalion', node: launchSite, equipment: { ['lyutyi_launcher' as PlatformId]: 200 } });
      f.order = { posture: 'strike', target: front, targetClass: 'structure', issuedTick: world.tick };
      const before = world.theater.infrastructure[front];
      e.step(world);
      return { damage: before - world.theater.infrastructure[front], jammed: world.slices.c2?.tally[UKR]?.jammedDrones ?? 0 };
    };
    const jammed = raid(true), clear = raid(false);
    expect(jammed.jammed).toBeGreaterThan(0);
    expect(jammed.damage).toBeLessThan(clear.damage);
  });
});

describe('ukraine-2026: command posts', () => {
  /** A Russian army HQ with subordinates, its first subordinate, and a Ukrainian cell within Tochka range of it. */
  function target(world: World) {
    const c2 = world.slices.c2;
    for (const [fid, hq] of Object.entries(c2.chain)) {
      if (!hq.startsWith('RUS:army')) continue;
      const node = c2.hqs[hq].node;
      const site = s.map.nodesWithin(node, 110).find((n) => world.control[n] === UKR);
      if (site !== undefined) return { hq, sub: fid as FormationId, site };
    }
    throw new Error('no Russian army HQ within Tochka range of Ukrainian ground');
  }

  it('a missile strike on a Russian army HQ slows that army\'s orders for days', () => {
    const { hq, sub, site } = target(s.world);
    const struck = fork(s.world), quiet = fork(s.world);
    const node = struck.world.slices.c2.hqs[hq].node;
    const battery = addFormation(struck.world, s.catalog, { nation: UKR, name: 'test Tochka battalion', kind: 'missile', echelon: 'battalion', node: site, equipment: { ['tochka_tel' as PlatformId]: 240 } });
    battery.order = { posture: 'strike', target: node, targetClass: 'hardened', issuedTick: struck.world.tick };
    const delayBefore = orderDelayHours(s.world, sub);
    struck.engine.step(struck.world);
    quiet.engine.step(quiet.world);
    battery.order = { posture: 'reserve', issuedTick: struck.world.tick };
    const hit = struck.world.slices.c2.hqs[hq].integrity;
    expect(hit).toBeLessThan(0.6);
    expect(orderDelayHours(struck.world, sub)).toBeGreaterThan(delayBefore + 12);

    // The same move order reaches the subordinate a day or more later than in the world where the HQ stands.
    const actedAt = (run: ReturnType<typeof fork>) => {
      const f = run.world.formations[sub];
      run.world.pending.push({ type: 'order', nation: RUS, formation: sub, order: { posture: 'reserve' } });
      for (let i = 0; i < 12; i++) {
        run.engine.step(run.world);
        if (f.order.posture === 'reserve') return i;
      }
      return Infinity;
    };
    const slow = actedAt(struck), fast = actedAt(quiet);
    expect(fast).toBeLessThanOrEqual(1);
    expect(slow).toBeGreaterThanOrEqual(fast + 3);
    // ...and the HQ recovers as a replacement stands up.
    expect(struck.world.slices.c2.hqs[hq].integrity).toBeGreaterThan(hit + 0.3);
  });
});

describe('ukraine-2026: satellite communications', () => {
  it('Russian ASAT kills on the US LEO constellation degrade Starlink-dependent Ukrainian units, not Russian ones', () => {
    const base = fork(s.world);
    base.world.pending.push({ type: 'declare_war', nation: RUS, target: USA, reason: 'test' });
    base.engine.step(base.world);
    const asat = fork(base.world), calm = fork(base.world);
    const leo = Object.values(asat.world.formations).find((f) => f.nation === USA && (f.equipment['starshield' as PlatformId] ?? 0) > 0)!;
    const nudol = Object.values(asat.world.formations).find((f) => f.nation === RUS && (f.equipment['nudol' as PlatformId] ?? 0) > 0)!;
    nudol.equipment['nudol' as PlatformId] = 400;
    nudol.magazine['nudol_int' as MunitionId] = 400;
    nudol.order = { posture: 'strike', target: leo.node, targetFormation: leo.id, issuedTick: asat.world.tick };
    for (const run of [asat, calm]) for (let i = 0; i < 2; i++) run.engine.step(run.world);
    expect(asat.world.slices.c2.satcom[USA]).toBeLessThan(0.4);
    const mean = (w: World, nation: NationId, pick: (id: FormationId) => number) => {
      const ids = (Object.keys(w.slices.c2.formations) as FormationId[]).filter((id) => w.formations[id].nation === nation && id in calm.world.slices.c2.formations);
      return ids.reduce((a, id) => a + pick(id), 0) / ids.length;
    };
    const coord = (w: World, n: NationId) => mean(w, n, (id) => w.slices.c2.formations[id].coordination);
    const delay = (w: World, n: NationId) => mean(w, n, (id) => orderDelayHours(w, id));
    expect(coord(asat.world, UKR)).toBeLessThan(coord(calm.world, UKR) - 0.02);
    expect(delay(asat.world, UKR)).toBeGreaterThan(delay(calm.world, UKR) + 2);
    expect(coord(asat.world, RUS)).toBeCloseTo(coord(calm.world, RUS), 2);
  });
});

describe('land combat after an HQ loss', () => {
  /** A Ukrainian brigade attacks a Russian division for two days; returns the share of the division lost. */
  function assault(hqDown: boolean): number {
    const t = testWorld([landMovement, landCombat, c2], 3);
    t.war('RUS', 'UKR');
    const ukr = t.nodeAt(48.5, 38.5), rus = t.nodeAt(47.5, 38.5);
    const kit = (k: number) => ({ [id.platform('t_mbt')]: 90 * k, [id.platform('t_ifv')]: 130 * k, [id.platform('t_inf')]: 120 * k, [id.platform('t_spg')]: 18 * k });
    const def = t.add({ nation: RUS, name: 'def', kind: 'maneuver', echelon: 'division', node: rus, equipment: kit(1), entrenchment: 0.3 });
    const att = t.add({ nation: UKR, name: 'att', kind: 'maneuver', echelon: 'brigade', node: ukr, equipment: kit(2) });
    t.engine.step(t.world);
    if (hqDown) t.world.slices.c2.hqs[t.world.slices.c2.chain[att.id]].integrity = 0;
    att.order = { posture: 'attack', target: rus, path: [rus], issuedTick: t.world.tick };
    const before = platformCount(def);
    t.engine.run(t.world, 8);
    return 1 - platformCount(def) / before;
  }

  it('a brigade whose front HQ was destroyed inflicts fewer losses than the same brigade under an intact HQ', () => {
    const headless = assault(true), commanded = assault(false);
    expect(commanded).toBeGreaterThan(0);
    expect(headless).toBeLessThan(0.9 * commanded);
  });
});

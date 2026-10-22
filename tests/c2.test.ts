import { beforeAll, describe, expect, it } from 'vitest';
import { Engine } from '../src/core/engine';
import { addFormation, platformCount } from '../src/core/forces';
import { COMMAND_DOMAINS, type Formation, type FormationId, type MunitionId, type NationId, type NodeId, type PlatformId, type World } from '../src/core/types';
import { createSession, type Session } from '../src/scenarios';
import { SYSTEMS } from '../src/systems';
import { buildPicture } from '../src/systems/air/picture';
import { c2, c2FireFactor, jamAgainst, jammedHits, orderDelayHours } from '../src/systems/c2';
import { chainOf } from '../src/systems/c2/command';
import { landCombat, landMovement } from '../src/systems/land';
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
    expect(jamAgainst(s.world, rear, UKR)).toEqual({ gnss: 0, comms: 0, radar: 0, drone: 0 });
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

describe('ukraine-2026: Russian EW against sensors', () => {
  const withoutC2 = (world: World) => {
    const w = structuredClone(world);
    delete (w.slices as Partial<World['slices']>).c2;
    return { world: w, engine: new Engine(s.map, s.catalog, SYSTEMS.filter((x) => x.id !== 'c2')) };
  };

  it('blinds part of the fire-control channels of Ukrainian SAMs under Krasukha cover', () => {
    const channels = (world: World) => {
      const pic = buildPicture(world, s.engine.context(world), world.slices.air.runway);
      return new Map(pic.defenders.filter((d) => d.f.nation === UKR).map((d) => [d.f.id, d.channels]));
    };
    const jammed = channels(s.world), clear = channels(withoutC2(s.world).world);
    const covered = [...jammed.keys()].filter((fid) => jamAgainst(s.world, s.world.formations[fid].node, UKR).radar > 0.3);
    expect(covered.length).toBeGreaterThan(0);
    for (const fid of covered) expect(jammed.get(fid)!).toBeLessThan(0.97 * clear.get(fid)!);
    const uncovered = [...jammed.keys()].filter((fid) => jamAgainst(s.world, s.world.formations[fid].node, UKR).radar === 0);
    for (const fid of uncovered) expect(jammed.get(fid)).toBe(clear.get(fid));
  });

  it('denies Ukrainian ISR drones some of their fixes on Russian formations behind the line', () => {
    // Russian-held cells within the drones' reach, out of sight of Ukrainian troops and under Russian jamming.
    const watched = new Set<number>(Object.values(s.world.formations).filter((f) => f.nation === UKR && f.kind !== 'air_wing').flatMap((f) => [f.node, ...neighbours(f.node)]));
    const hidden = (n: NodeId) => s.world.control[n] === RUS && !watched.has(n) && jamAgainst(s.world, n, UKR).radar > 0;
    let site = launchSite, deep: NodeId[] = [];
    for (let n = 0; n < s.map.landCount; n++) {
      if (s.world.control[n] !== UKR) continue;
      const cells = s.map.nodesWithin(n as NodeId, 290).filter(hidden);
      if (cells.length > deep.length) [site, deep] = [n as NodeId, cells];
    }
    expect(deep.length).toBeGreaterThan(1);
    const fixes = (run: { world: World; engine: Engine }) => {
      addFormation(run.world, s.catalog, { nation: UKR, name: 'test ISR drone squadron', kind: 'air_wing', echelon: 'squadron', node: site, equipment: { ['rq4b' as PlatformId]: 4 } });
      const targets = deep.flatMap((n) => [0, 1, 2, 3, 4, 5].map(() => addFormation(run.world, s.catalog, { nation: RUS, name: 'test battery', kind: 'artillery', echelon: 'battalion', node: n, equipment: { ['2s19m2' as PlatformId]: 18 }, home: s.world.nations[RUS].capital }).id));
      // A day of flying: one tick's sortie can be grounded by weather or night.
      const fixed = new Set<FormationId>();
      for (let t = 0; t < 4; t++) {
        run.engine.step(run.world);
        const pic = run.world.slices.intel.pictures[UKR];
        for (const id of targets) if (pic[id]?.source === 'airborne' && pic[id].tick === run.world.tick - 1) fixed.add(id);
      }
      return fixed.size;
    };
    const jammed = fixes(fork(s.world)), clear = fixes(withoutC2(s.world));
    expect(clear).toBeGreaterThan(5);
    expect(jammed).toBeLessThan(0.85 * clear);
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

  it('a missile strike on a Russian army HQ slows that army\'s orders', () => {
    const { hq, sub, site } = target(s.world);
    const struck = fork(s.world), quiet = fork(s.world);
    const node = struck.world.slices.c2.hqs[hq].node;
    const battery = addFormation(struck.world, s.catalog, { nation: UKR, name: 'test Tochka battalion', kind: 'missile', echelon: 'battalion', node: site, equipment: { ['tochka_tel' as PlatformId]: 240 } });
    battery.order = { posture: 'strike', target: node, targetClass: 'hardened', issuedTick: struck.world.tick };
    // Ukrainian troops close up to the command post's cell, so it is found.
    const spotters = addFormation(struck.world, s.catalog, { nation: UKR, name: 'test recon company', kind: 'maneuver', echelon: 'battalion', node: [...s.map.neighbors(node)].find((n) => !s.map.isSea(n))!, equipment: { ['infantry_squad' as PlatformId]: 10 } });
    spotters.order = { posture: 'defend', issuedTick: struck.world.tick };
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
    // The alternate command post (c2.ALTERNATE_CP) takes back half the loss, so the lag is half a day or more, not days.
    expect(slow).toBeGreaterThanOrEqual(fast + 2);
    // ...and the HQ recovers as a replacement stands up, a fifth of the way a day for an army HQ.
    struck.engine.run(struck.world, 8 - (slow + 1));
    expect(struck.world.slices.c2.hqs[hq].integrity).toBeGreaterThan(hit + 0.3);
  });
});

describe('ukraine-2026: satellite communications', () => {
  it('Russian ASAT kills on the US LEO constellation degrade Starlink-dependent Ukrainian units, not Russian ones', () => {
    const base = fork(s.world);
    base.world.pending.push({ type: 'declare_war', nation: RUS, target: USA, reason: 'test' });
    // Held, or Russia's AI retargets the battalion and spends the first volley on the NRO imaging satellites.
    const battalion = Object.values(base.world.formations).find((f) => f.nation === RUS && (f.equipment['nudol' as PlatformId] ?? 0) > 0)!;
    base.world.nations[RUS].controlledBy = 'human';
    for (const domain of COMMAND_DOMAINS) base.world.pending.push({ type: 'delegate', nation: RUS, domain, ai: true });
    base.world.pending.push({ type: 'hold', nation: RUS, formations: [battalion.id], held: true });
    base.engine.step(base.world);
    const asat = fork(base.world), calm = fork(base.world);
    const leo = Object.values(asat.world.formations).find((f) => f.nation === USA && (f.equipment['starshield' as PlatformId] ?? 0) > 0)!;
    const nudol = asat.world.formations[battalion.id];
    nudol.equipment['nudol' as PlatformId] = 400;
    nudol.magazine['nudol_int' as MunitionId] = 400;
    nudol.order = { posture: 'strike', target: leo.node, targetFormation: leo.id, issuedTick: asat.world.tick };
    for (const run of [asat, calm]) for (let i = 0; i < 2; i++) run.engine.step(run.world);
    expect(asat.world.slices.c2.satcom[USA]).toBeLessThan(0.4);
    // Once the two runs' dice diverge, strikes on headquarters land differently: compare formations whose chain of
    // command fared the same in both, so only the satellites differ.
    const sameChain = (id: FormationId) => {
      const a = chainOf(asat.world.slices.c2, id), b = chainOf(calm.world.slices.c2, id);
      return a.length === b.length && a.every((hq, i) => hq.integrity === b[i].integrity);
    };
    const mean = (w: World, nation: NationId, pick: (id: FormationId) => number) => {
      const ids = (Object.keys(w.slices.c2.formations) as FormationId[]).filter((id) => w.formations[id].nation === nation && id in calm.world.slices.c2.formations && sameChain(id));
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
  /**
   * A Ukrainian brigade attacks a Russian division for three days, long enough that a few platforms either way do not
   * decide it; returns the share of the division lost.
   */
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
    t.engine.run(t.world, 12);
    return 1 - platformCount(def) / before;
  }

  it('a brigade whose front HQ was destroyed inflicts fewer losses than the same brigade under an intact HQ', () => {
    const headless = assault(true), commanded = assault(false);
    expect(commanded).toBeGreaterThan(0);
    expect(headless).toBeLessThan(0.9 * commanded);
  });
});

describe('c2 determinism', () => {
  it('replays the same slice from the same seed and never draws from the shared RNG', () => {
    const run = (systems: Parameters<typeof testWorld>[0]) => {
      const t = testWorld(systems, 9);
      t.war('RUS', 'UKR');
      t.add({ nation: RUS, name: 'rus (1st CAA)', kind: 'maneuver', echelon: 'division', node: t.nodeAt(47.5, 38.5), equipment: { [id.platform('t_inf')]: 300, [id.platform('t_spg')]: 36 } });
      t.add({ nation: UKR, name: 'ukr', kind: 'maneuver', echelon: 'brigade', node: t.nodeAt(48.5, 38.5), equipment: { [id.platform('t_inf')]: 300, [id.platform('t_spg')]: 18 } });
      t.engine.run(t.world, 6);
      return t.world;
    };
    const a = run([c2]), b = run([c2]);
    expect(JSON.stringify(a.slices.c2)).toBe(JSON.stringify(b.slices.c2));
    expect(JSON.parse(JSON.stringify(a.slices.c2))).toEqual(a.slices.c2);
    expect(a.slices.c2.hqs['RUS:army:1st CAA']).toBeDefined();
    expect(a.rngState).toBe(run([]).rngState);
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import { Engine } from '../src/core/engine';
import { addFormation } from '../src/core/forces';
import type { Formation, MunitionId, NationId, NodeId, PlatformId, World } from '../src/core/types';
import { createSession, type Session } from '../src/scenarios';
import { SYSTEMS } from '../src/systems';
import { c2FireFactor, jamAgainst, jammedHits } from '../src/systems/c2';
import { karabakh2020 } from '../src/validation/cases/karabakh-2020';

const UKR = 'UKR' as NationId, RUS = 'RUS' as NationId;

let s: Session;
/** A Ukrainian-held cell on the line, next to Russian-held ground. */
let line: NodeId;
let rear: NodeId;

const fork = (world: World) => ({ world: structuredClone(world), engine: new Engine(s.map, s.catalog, SYSTEMS) });
const droneFire = (f: Formation) => {
  let fire = 0;
  for (const [pid, n] of Object.entries(f.equipment)) {
    const p = s.catalog.platform(pid as PlatformId);
    if (p.class === 'loitering_munition_launcher') fire += n * (p.firepower.infantry ?? 0);
  }
  return fire;
};

beforeAll(() => {
  s = createSession('ukraine-2026', 1);
  s.engine.run(s.world, 2);
  const ruHeld = (n: number) => [...s.map.neighbors(n as NodeId)].some((m) => s.world.control[m] === RUS);
  line = Object.values(s.world.formations).find((f) => f.nation === UKR && f.kind === 'maneuver' && s.world.control[f.node] === UKR && ruHeld(f.node))!.node;
  rear = s.map.nodeAt(49.84, 24.03); // Lviv
}, 300_000);

describe('ukraine-2026: the drone war (Red Team CE-4)', () => {
  it('both armies fly FPV drones from their front-line brigades', () => {
    for (const n of [UKR, RUS]) {
      const brigades = Object.values(s.world.formations).filter((f) => f.nation === n && f.kind === 'maneuver' && f.echelon === 'brigade' && f.status === 'active');
      const flying = brigades.filter((f) => droneFire(f) > 0);
      // Main: no ORBAT has a drone team, and drone teams carry no land firepower.
      expect(flying.length / brigades.length, n).toBeGreaterThan(0.6);
    }
  });

  it('Russian counter-drone EW over the line takes a third or more of a Ukrainian drone unit\'s fire, none in the rear', () => {
    const { world, engine } = fork(s.world);
    const at = (node: NodeId) => addFormation(world, s.catalog, { nation: UKR, name: 'test drone company', kind: 'maneuver', echelon: 'battalion', node, equipment: { ['fpv_team' as PlatformId]: 20 } });
    const near = at(line), far = at(rear);
    engine.step(world);
    // Main: drone links are not a jammed band, so drone fire, had it any, would keep 99%.
    expect(c2FireFactor(world, near) / c2FireFactor(world, far)).toBeLessThan(0.67);
    expect(world.slices.c2.formations[far.id].guided).toBe(1);
  });

  it('fibre-optic FPVs fly through any jamming', () => {
    const { world, engine } = fork(s.world);
    world.params = { 'c2.FPV_LINK_VULN': 0.95, 'c2.DRONE_BAND_MAX': 0.95 };
    const f = addFormation(world, s.catalog, { nation: UKR, name: 'test drone company', kind: 'maneuver', echelon: 'battalion', node: line, equipment: { ['fpv_team' as PlatformId]: 20 } });
    engine.step(world);
    expect(jamAgainst(world, line, UKR).drone).toBeGreaterThan(0.9);
    // Five of a team's 35 drones fly on fibre: their share of its fire survives the strongest jamming.
    expect(world.slices.c2.formations[f.id].guided).toBeGreaterThan(5 / 35);
    expect(jammedHits(world, line, UKR, s.catalog.munition('fpv_fiber' as MunitionId), 1000)).toBe(1000);
  });

  it('Ukraine\'s city EW turns Shaheds away from Kyiv, not over open country', () => {
    const kept = (node: NodeId) => jammedHits(s.world, node, RUS, s.catalog.munition('shahed136' as MunitionId), 1000) / 1000;
    // Main: 1 of 730 Shaheds jammed in a 60-day run.
    expect(kept(s.map.nodeAt(50.45, 30.52))).toBeLessThan(0.9);
    expect(kept(s.map.nodeAt(51.2, 27.0))).toBe(1);
  });

  it('a Russian brigade\'s organic EW weakens as the brigade is ground down (Red Team CE-10)', () => {
    const gnssAt = (share: number) => {
      const { world, engine } = fork(s.world);
      for (const f of Object.values(world.formations)) if (f.nation === RUS && f.kind !== 'maneuver') f.status = 'destroyed';
      const bde = Object.values(world.formations).find((f) => f.nation === RUS && f.kind === 'maneuver' && f.echelon === 'brigade' && f.status === 'active')!;
      for (const f of Object.values(world.formations)) if (f.nation === RUS && f.id !== bde.id) f.status = 'destroyed';
      // Alone, far from any Russian HQ's EW brigade: deep in Ukraine's west.
      bde.node = s.map.nodeAt(49.0, 24.5);
      for (const pid of Object.keys(bde.equipment) as PlatformId[]) bde.equipment[pid] = Math.round(bde.equipment[pid] * share);
      engine.step(world);
      return jamAgainst(world, bde.node, UKR).gnss;
    };
    const full = gnssAt(1), worn = gnssAt(0.3);
    expect(full).toBeGreaterThan(0);
    // Main: a brigade with 30% of its strength jams as hard as a full one.
    expect(worn).toBeLessThan(full * 0.6);
  }, 300_000);
});

describe('karabakh-2020: Azerbaijan\'s drones fly', () => {
  it('TB2s strike Armenian armour in the first ten days', () => {
    const k = karabakh2020.setup(1);
    const fired: Record<string, number> = {};
    let armourStruck = 0;
    for (let i = 0; i < (10 * 24) / k.world.dtHours; i++)
      for (const e of k.engine.step(k.world)) {
        if (e.type !== 'strike' || e.by !== 'AZE') continue;
        fired[e.munition] = (fired[e.munition] ?? 0) + e.fired;
        for (const x of e.effects) if (x.kind === 'losses') for (const [pid, n] of Object.entries(x.platforms)) if (s.catalog.platform(pid as PlatformId).class === 'mbt') armourStruck += n ?? 0;
      }
    // Main: TB2s share a wing with the Su-25s and fly only in their FAB-500 packages, so no MAM-L is fired.
    expect(fired.mam_l ?? 0).toBeGreaterThan(50);
    expect(armourStruck).toBeGreaterThan(5);
  }, 300_000);
});

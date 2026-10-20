import { describe, expect, it } from 'vitest';
import { Engine } from '../src/core/engine';
import { addFormation } from '../src/core/forces';
import type { NationId, PlatformId, SimEvent } from '../src/core/types';
import { createWorld } from '../src/core/world';
import { loadMap } from '../src/data/load';
import { profiles } from '../src/data/nations';
import { SYSTEMS } from '../src/systems';
import { testCatalog } from '../src/testkit';

function theater() {
  const map = loadMap();
  const catalog = testCatalog();
  const engine = new Engine(map, catalog, SYSTEMS);
  const world = createWorld(map, { seed: 3, profiles });
  engine.init(world);
  const brigade = (nation: string, lat: number, lon: number, eq: Record<string, number>) =>
    addFormation(world, catalog, {
      nation: nation as NationId, name: `${nation} ${lat},${lon}`, kind: 'maneuver', echelon: 'brigade', node: map.nodeAt(lat, lon),
      equipment: Object.fromEntries(Object.entries(eq).map(([k, v]) => [k as PlatformId, v])),
    });
  return { map, engine, world, brigade };
}

describe('all systems together', () => {
  it('runs a Russia-Poland war for 30 days: allies join, fighting happens, state stays sane', () => {
    const { engine, world, brigade } = theater();
    const attackers = [[53.5, 24.5], [53.1, 25.5], [52.4, 30.9]].map(([la, lo]) => brigade('RUS', la, lo, { t_mbt: 90, t_ifv: 120, t_inf: 150, t_spg: 36 }));
    const defenders = [[53.5, 23.5], [52.2, 21.0], [51.2, 22.6]].map(([la, lo]) => brigade('POL', la, lo, { t_mbt: 58, t_ifv: 90, t_inf: 120, t_spg: 24 }));
    // A human-commanded Russia keeps its attack order (the AI would hold at 1:1), so contact is certain.
    world.nations['RUS' as NationId].controlledBy = 'human';
    world.pending.push({ type: 'declare_war', nation: 'RUS' as NationId, target: 'POL' as NationId, reason: 'test' });
    world.pending.push({ type: 'order', nation: 'RUS' as NationId, formation: attackers[0].id, order: { posture: 'attack', target: defenders[0].node } });
    brigade('USA', 50.0, 19.9, { t_mbt: 87, t_ifv: 120, t_inf: 100 });

    const kinds = new Map<SimEvent['type'], number>();
    for (let i = 0; i < 120; i++) for (const e of engine.step(world)) kinds.set(e.type, (kinds.get(e.type) ?? 0) + 1);

    const joined = Object.entries(world.relations).filter(([k, r]) => r.atWar && k.split('|').includes('RUS')).length;
    expect(joined).toBeGreaterThan(15);
    expect(kinds.get('battle') ?? 0).toBeGreaterThan(0);
    for (const n of Object.values(world.nations)) {
      expect(Number.isFinite(n.warSupport)).toBe(true);
      expect(Number.isFinite(n.treasuryUsdB)).toBe(true);
    }
    for (const f of Object.values(world.formations)) {
      for (const v of Object.values(f.equipment)) expect(v).toBeGreaterThanOrEqual(0);
      expect(f.supply.fuel).toBeGreaterThanOrEqual(0);
    }
    expect(() => JSON.parse(JSON.stringify(world))).not.toThrow();
  }, 60_000);
});

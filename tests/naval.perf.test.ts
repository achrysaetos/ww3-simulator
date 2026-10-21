import { describe, expect, it } from 'vitest';
import { Catalog } from '../src/core/catalog';
import { Engine, relationMut } from '../src/core/engine';
import { addFormation, type FormationSpec } from '../src/core/forces';
import { Rng } from '../src/core/rng';
import type { Formation, Munition, MunitionId, NationId, NodeId, Platform, PlatformId } from '../src/core/types';
import { createWorld } from '../src/core/world';
import { loadMap } from '../src/data/load';
import { applyNavalOrder, CHOKEPOINTS, navalWar, resolveSalvo, strikeNavalGroup } from '../src/systems/naval';
import { geography, nearestSea, seaNeighbour } from '../src/systems/naval/geography';
import { testMunitions, testPlatforms } from '../src/testkit';

const M = (m: Omit<Munition, 'producers' | 'id'> & { id: string }): Munition => ({ producers: [], ...m, id: m.id as MunitionId });
const P = (p: Omit<Platform, 'producers' | 'inService' | 'id'> & { id: string }): Platform => ({ producers: [], inService: 2015, ...p, id: p.id as PlatformId });
const mun = (id: string, count: number) => ({ munition: id as MunitionId, count });

/** Naval additions to the testkit catalog: the testkit has only a destroyer and an SSN. */
const navalMunitions: Munition[] = [
  M({ id: 'n_lwt', name: 'Lightweight ASW torpedo', kind: 'torpedo', rangeKm: 10, speedMach: 0.07, warheadKg: 45, cepM: 5, pk: { submarine: 0.5 }, interceptDifficulty: 0.8, unitCostUsdM: 1.5, weightKg: 280 }),
  M({ id: 'n_asbm', name: 'Anti-ship ballistic missile', kind: 'antiship_ballistic', rangeKm: 1500, speedMach: 10, warheadKg: 600, cepM: 20, pk: { ship: 0.6 }, interceptDifficulty: 0.8, unitCostUsdM: 10, weightKg: 15000 }),
  M({ id: 'n_exocet', name: 'Exocet-class ASCM', kind: 'antiship_cruise', rangeKm: 70, speedMach: 0.9, warheadKg: 165, cepM: 5, pk: { ship: 1 }, interceptDifficulty: 1, unitCostUsdM: 1, weightKg: 670 }),
  M({ id: 'n_neptune', name: 'Neptune-class ASCM', kind: 'antiship_cruise', rangeKm: 280, speedMach: 0.8, warheadKg: 150, cepM: 5, pk: { ship: 1 }, interceptDifficulty: 1, unitCostUsdM: 1, weightKg: 870 }),
  M({ id: 'n_mine', name: 'Influence mine', kind: 'mine', rangeKm: 0, speedMach: 0, warheadKg: 500, cepM: 0, pk: { ship: 0.5, submarine: 0.3 }, interceptDifficulty: 1, unitCostUsdM: 0.1, weightKg: 1000 }),
];

const ship = (id: string, cls: Platform['class'], extra: Partial<Platform>): Platform => P({
  id, name: id, class: cls, domain: 'sea', unitCostUsdM: 500, crew: 150,
  mobility: { speedKph: 30, rangeKm: 8000, fuelTonsPerHour: 1.5 }, protection: { armor: 0.2, stealth: 0.2 }, sensors: { detectionKm: 100 },
  firepower: {}, loadout: [], ...extra,
});

const navalPlatforms: Platform[] = [
  ship('n_frigate', 'frigate', { engagementChannels: 6, loadout: [mun('t_sam', 32), mun('n_lwt', 12)] }),
  ship('n_cruiser', 'cruiser', { crew: 500, engagementChannels: 10, loadout: [mun('t_sam', 64)] }),
  ship('n_lhd', 'amphibious', { crew: 1000, capacity: { troops: 6000, vehicles: 200 }, loadout: [] }),
  ship('n_mcm', 'mine_warfare', { crew: 50 }),
  ship('n_minelayer', 'corvette', { loadout: [mun('n_mine', 60)] }),
  ship('n_carrier', 'carrier', { crew: 3000, mobility: { speedKph: 55, rangeKm: 1e6, fuelTonsPerHour: 0 }, engagementChannels: 4, capacity: { aircraft: 60 }, loadout: [mun('t_sam', 16)] }),
  P({ id: 'n_helo', name: 'ASW helicopter', class: 'asw_helo', domain: 'air', unitCostUsdM: 40, crew: 4, mobility: { speedKph: 250, rangeKm: 300, fuelTonsPerHour: 0.5 }, protection: { armor: 0.1, stealth: 0.1 }, sensors: { detectionKm: 50 }, firepower: {}, loadout: [mun('n_lwt', 2)] }),
];

/** A world on the real map with the testkit catalog plus naval additions and the naval system. */
function navalWorld(seed = 42) {
  const map = loadMap();
  const catalog = new Catalog([...testPlatforms, ...navalPlatforms], [...testMunitions, ...navalMunitions]);
  const engine = new Engine(map, catalog, [navalWar]);
  const world = createWorld(map, { seed });
  engine.init(world);
  const nodeAt = (lat: number, lon: number) => map.nodeAt(lat, lon);
  const add = (spec: Omit<FormationSpec, 'echelon'> & Partial<FormationSpec>) => addFormation(world, catalog, { echelon: 'task_group', ...spec } as FormationSpec);
  const war = (a: string, b: string) => {
    const r = relationMut(world, a as NationId, b as NationId);
    r.atWar = true;
    r.escalation = 'conventional';
    world.nations[a as NationId].status = 'war';
    world.nations[b as NationId].status = 'war';
  };
  const order = (f: Formation, o: Omit<Formation['order'], 'issuedTick'>) =>
    applyNavalOrder(world, { type: 'order', nation: f.nation, formation: f.id, order: o }, engine.context(world));
  const eq = (o: Record<string, number>) => o as Record<PlatformId, number>;
  const portOf = (nation: string, lat: number, lon: number): NodeId => {
    const ports = geography(map).ports.filter((p) => map.owner[p.node] === nation);
    ports.sort((a, b) => Math.hypot(map.lat[a.node] - lat, map.lon[a.node] - lon) - Math.hypot(map.lat[b.node] - lat, map.lon[b.node] - lon));
    return ports[0].node;
  };
  return { map, catalog, engine, world, nodeAt, add, war, order, eq, portOf };
}

const USA = 'USA' as NationId, CHN = 'CHN' as NationId, RUS = 'RUS' as NationId, UKR = 'UKR' as NationId, TWN = 'TWN' as NationId;
const mid = (s: string) => s as MunitionId;
const led = (t: ReturnType<typeof navalWorld>, n: string) => t.world.slices.naval.ledger[n as NationId];
const count = (r: Record<string, number>, id: string) => r[id];

function runUntil(t: ReturnType<typeof navalWorld>, done: () => boolean, maxTicks: number): number {
  for (let i = 0; i < maxTicks; i++) {
    if (done()) return i;
    t.engine.step(t.world);
  }
  return done() ? maxTicks : -1;
}


describe('naval performance', () => {
  it('steps 600 naval formations in the Western Pacific within budget and replays deterministically', () => {
    const build = () => {
      const t = navalWorld(21);
      t.war('USA', 'CHN');
      const rng = new Rng(5);
      const nodes: NodeId[] = [];
      for (let n = t.map.landCount; n < t.map.size; n++) if (t.map.lat[n] > 0 && t.map.lat[n] < 40 && t.map.lon[n] > 110 && t.map.lon[n] < 150) nodes.push(n as NodeId);
      const postures = ['patrol', 'blockade', 'attack', 'defend', 'move'] as const;
      const groups: Formation[] = [];
      for (let i = 0; i < 600; i++) {
        const nation = i % 2 ? USA : CHN;
        const sub = i % 4 === 0;
        const f = t.add({ nation, name: `g${i}`, kind: sub ? 'submarine' : 'surface_group', echelon: sub ? 'squadron' : 'task_group', node: rng.pick(nodes), equipment: sub ? t.eq({ t_ssn: 1 }) : t.eq({ t_destroyer: 2, n_frigate: 1, n_helo: 2 }) });
        groups.push(f);
      }
      for (const f of groups) t.order(f, { posture: rng.pick(postures), target: rng.pick(nodes) });
      return t;
    };
    const t = build();
    t.engine.step(t.world);
    const ticks = 10;
    const start = performance.now();
    t.engine.run(t.world, ticks);
    const ms = (performance.now() - start) / ticks;
    console.log(`naval step, 600 formations: ${ms.toFixed(1)} ms/tick`);
    expect(ms).toBeLessThan(50);

    const a = build(), b = build();
    a.engine.run(a.world, 5);
    b.engine.run(b.world, 5);
    expect(JSON.stringify(a.world)).toBe(JSON.stringify(b.world));
  });
});

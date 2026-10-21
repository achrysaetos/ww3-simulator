import { describe, expect, it } from 'vitest';
import { Catalog } from '../src/core/catalog';
import { Engine, relationMut, type System } from '../src/core/engine';
import { addFormation, type FormationSpec } from '../src/core/forces';
import { Rng } from '../src/core/rng';
import type { Formation, Munition, MunitionId, NationId, NodeId, Platform, PlatformId } from '../src/core/types';
import { createWorld } from '../src/core/world';
import { loadMap } from '../src/data/load';
import { createAi } from '../src/systems/ai';
import { airWar } from '../src/systems/air';
import { applyNavalOrder, CHOKEPOINTS, navalWar, resolveSalvo, strikeNavalGroup } from '../src/systems/naval';
import { geography, nearestSea, seaNeighbour } from '../src/systems/naval/geography';
import { OFFLOAD_HOURS } from '../src/systems/naval/tables';
import { testMunitions, testPlatforms } from '../src/testkit';

const M = (m: Omit<Munition, 'producers' | 'id'> & { id: string }): Munition => ({ producers: [], ...m, id: m.id as MunitionId });
const P = (p: Omit<Platform, 'producers' | 'inService' | 'id'> & { id: string }): Platform => ({ producers: [], inService: 2015, ...p, id: p.id as PlatformId });
const mun = (id: string, count: number) => ({ munition: id as MunitionId, count });

/** Naval additions to the testkit catalog: the testkit has only a destroyer and an SSN. */
const navalMunitions: Munition[] = [
  M({ id: 'n_lwt', name: 'Lightweight ASW torpedo', kind: 'torpedo', rangeKm: 10, speedMach: 0.07, warheadKg: 45, cepM: 5, pk: { submarine: 0.5 }, interceptDifficulty: 0.8, unitCostUsdM: 1.5, weightKg: 280 }),
  M({ id: 'n_asbm', name: 'Anti-ship ballistic missile', kind: 'antiship_ballistic', rangeKm: 1500, speedMach: 10, warheadKg: 600, cepM: 20, pk: { ship: 0.6 }, interceptDifficulty: 0.8, unitCostUsdM: 10, weightKg: 15000 }),
  M({ id: 'n_sm3', name: 'Exo-atmospheric interceptor', kind: 'abm', rangeKm: 900, speedMach: 10, warheadKg: 0, cepM: 0, pk: { missile: 0.8 }, interceptDifficulty: 0, unitCostUsdM: 12, weightKg: 1500 }),
  M({ id: 'n_exocet', name: 'Exocet-class ASCM', kind: 'antiship_cruise', rangeKm: 70, speedMach: 0.9, warheadKg: 165, cepM: 5, pk: { ship: 1 }, interceptDifficulty: 1, unitCostUsdM: 1, weightKg: 670 }),
  M({ id: 'n_shore_ascm', name: 'Coastal ASCM', kind: 'antiship_cruise', rangeKm: 400, speedMach: 0.9, warheadKg: 165, cepM: 5, pk: { ship: 0.8 }, interceptDifficulty: 0.5, unitCostUsdM: 1, weightKg: 670 }),
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
  ship('n_usv', 'usv', { crew: 0, unitCostUsdM: 0.25, mobility: { speedKph: 40, rangeKm: 800, fuelTonsPerHour: 0 }, firepower: { ship: 0.05 } }),
  ship('n_minelayer', 'corvette', { loadout: [mun('n_mine', 60)] }),
  P({ id: 'n_ssk', name: 'Diesel submarine', class: 'ssk', domain: 'subsurface', unitCostUsdM: 500, crew: 50, mobility: { speedKph: 37, rangeKm: 1e6, fuelTonsPerHour: 0 }, protection: { armor: 0.2, stealth: 0.85 }, sensors: { detectionKm: 40 }, firepower: { ship: 0.3 }, loadout: [{ munition: 't_torpedo' as MunitionId, count: 18 }] }),
  P({ id: 'n_midget', name: 'Midget submarine', class: 'ssk', domain: 'subsurface', unitCostUsdM: 500, crew: 7, mobility: { speedKph: 37, rangeKm: 1e6, fuelTonsPerHour: 0 }, protection: { armor: 0.2, stealth: 0.85 }, sensors: { detectionKm: 40 }, firepower: { ship: 0.3 }, loadout: [{ munition: 't_torpedo' as MunitionId, count: 2 }] }),
  P({ id: 'n_coastal', name: 'Coastal ASBM launcher', class: 'coastal_asm', domain: 'land', unitCostUsdM: 5, crew: 4, mobility: { speedKph: 60, rangeKm: 600, fuelTonsPerHour: 0.05 }, protection: { armor: 0.1, stealth: 0.35 }, sensors: { detectionKm: 0 }, firepower: {}, loadout: [mun('n_asbm', 4)] }),
  ship('n_carrier', 'carrier', { crew: 3000, mobility: { speedKph: 55, rangeKm: 1e6, fuelTonsPerHour: 0 }, engagementChannels: 4, capacity: { aircraft: 60 }, loadout: [mun('t_sam', 16)] }),
  P({ id: 'n_helo', name: 'ASW helicopter', class: 'asw_helo', domain: 'air', unitCostUsdM: 40, crew: 4, mobility: { speedKph: 250, rangeKm: 300, fuelTonsPerHour: 0.5 }, protection: { armor: 0.1, stealth: 0.1 }, sensors: { detectionKm: 50 }, firepower: {}, loadout: [mun('n_lwt', 2)] }),
];

/** A world on the real map with the testkit catalog plus naval additions and the naval system. */
function navalWorld(seed = 42, systems: System[] = [navalWar]) {
  const map = loadMap();
  const catalog = new Catalog([...testPlatforms, ...navalPlatforms], [...testMunitions, ...navalMunitions]);
  const engine = new Engine(map, catalog, systems);
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

describe('naval salvo combat', () => {
  const southChinaSea = (t: ReturnType<typeof navalWorld>) => t.nodeAt(15, 114);

  it('a two-missile salvo at a destroyer with SAMs to spare is mostly stopped, but not always', () => {
    let leakers = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const t = navalWorld(seed);
      const at = southChinaSea(t);
      t.war('USA', 'CHN');
      const us = t.add({ nation: USA, name: 'US DESRON', kind: 'surface_group', node: at, equipment: t.eq({ t_destroyer: 4 }), magazine: { [mid('t_asm')]: 2 } });
      t.add({ nation: CHN, name: 'PLAN DDG', kind: 'surface_group', node: at, equipment: t.eq({ t_destroyer: 1 }), magazine: { [mid('t_sam')]: 64 } });
      us.order = { posture: 'attack', issuedTick: 0 };
      const fired = runUntil(t, () => (led(t, 'USA')?.missilesFired ?? 0) >= 2, 10);
      expect(fired).toBeGreaterThan(0);
      leakers += led(t, 'USA')!.leakers;
      expect(led(t, 'CHN')!.interceptorsFired).toBeGreaterThan(0);
    }
    expect(leakers).toBeGreaterThan(0);
    expect(leakers).toBeLessThan(8);
  });

  it('a salvo inside the fire channels leaks only the threats both interceptors miss; one that saturates them leaks its excess', () => {
    const t = navalWorld();
    const hhq9: Munition = { ...t.catalog.munition(mid('t_sam')), pk: { missile: 0.7 } };
    const harpoon: Munition = { ...t.catalog.munition(mid('t_asm')), interceptDifficulty: 0.3 };
    const leak = (fired: number) => {
      let n = 0;
      for (let s = 1; s <= 100; s++) n += resolveSalvo(new Rng(s), harpoon, fired, { channels: 12, interceptors: [{ munition: hhq9, available: 200 }], pointDefense: 0, capShots: 0 }, 'ship').leakers;
      return n / (100 * fired);
    };
    const small = leak(8), saturating = leak(60);
    expect(small).toBeGreaterThan(0.02);
    expect(small).toBeLessThan(0.15);
    expect(saturating).toBeGreaterThan(small * 3);
  });

  it('a salvo that saturates the defense leaks and sinks the target', () => {
    const t = navalWorld(3);
    const at = southChinaSea(t);
    t.war('USA', 'CHN');
    const us = t.add({ nation: USA, name: 'US DESRON', kind: 'surface_group', node: at, equipment: t.eq({ t_destroyer: 4 }), magazine: { [mid('t_asm')]: 200 } });
    const plan = t.add({ nation: CHN, name: 'PLAN DDG', kind: 'surface_group', node: at, equipment: t.eq({ t_destroyer: 1 }), magazine: { [mid('t_sam')]: 64 } });
    us.order = { posture: 'attack', issuedTick: 0 };
    expect(runUntil(t, () => plan.status === 'destroyed', 8)).toBeGreaterThan(0);
    expect(led(t, 'USA')!.leakers).toBeGreaterThan(0);
    expect(led(t, 'CHN')!.hullsSunk).toBe(1);
    expect(t.world.events.concat(t.world.history).some((e) => e.type === 'formation_destroyed' && e.formation === plan.id)).toBe(true);
  });

  it('anti-ship ballistic missiles leak through a defense that stops the same number of subsonic missiles', () => {
    const t = navalWorld();
    const sam = t.catalog.munition(mid('t_sam'));
    const defense = () => ({ channels: 10, interceptors: [{ munition: sam, available: 64 }], pointDefense: 0.3, capShots: 0 });
    let subsonic = 0, ballistic = 0;
    for (let s = 1; s <= 20; s++) {
      subsonic += resolveSalvo(new Rng(s), t.catalog.munition(mid('t_asm')), 6, defense(), 'ship').leakers;
      ballistic += resolveSalvo(new Rng(s), t.catalog.munition(mid('n_asbm')), 6, defense(), 'ship').leakers;
    }
    expect(subsonic / 120).toBeLessThan(0.35);
    expect(ballistic / 120).toBeGreaterThan(0.7);
  });

  it('an SM-3 layer stops most medium-range ballistic missiles in midcourse while its rounds last, and never fires at a sea-skimmer', () => {
    const t = navalWorld();
    const sam = t.catalog.munition(mid('t_sam'));
    const sm3 = t.catalog.munition(mid('n_sm3'));
    const defense = (exo: number) => ({ channels: 10, interceptors: [{ munition: sm3, available: exo }, { munition: sam, available: 64 }], pointDefense: 0.3, capShots: 0 });
    let layered = 0, spent = 0, skimmerSm3 = 0;
    for (let s = 1; s <= 40; s++) {
      layered += resolveSalvo(new Rng(s), t.catalog.munition(mid('n_asbm')), 6, defense(64), 'ship').leakers;
      spent += resolveSalvo(new Rng(s), t.catalog.munition(mid('n_asbm')), 6, defense(2), 'ship').leakers;
      skimmerSm3 += resolveSalvo(new Rng(s), t.catalog.munition(mid('t_asm')), 6, defense(64), 'ship').interceptorsUsed.get(mid('n_sm3')) ?? 0;
    }
    expect(layered / 240).toBeLessThan(0.15);
    expect(spent / 240).toBeGreaterThan(0.5);
    expect(skimmerSm3).toBe(0);
  });

  it('spends two to three interceptors per one-way drone it kills (Red Sea 2023-24: about two per engaged threat)', () => {
    const t = navalWorld();
    const sm2: Munition = { ...t.catalog.munition(mid('t_sam')), pk: { missile: 0.7 } };
    const drone: Munition = { ...t.catalog.munition(mid('t_asm')), kind: 'drone_oneway', speedMach: 0.4, interceptDifficulty: 0.25 };
    let used = 0, killed = 0;
    for (let s = 1; s <= 30; s++) {
      const out = resolveSalvo(new Rng(s), drone, 3, { channels: 12, interceptors: [{ munition: sm2, available: 90 }], pointDefense: 0.4, capShots: 0 }, 'ship');
      used += [...out.interceptorsUsed.values()].reduce((a, b) => a + b, 0);
      killed += out.intercepted;
    }
    expect(killed).toBeGreaterThanOrEqual(81);
    expect(used / killed).toBeGreaterThan(1.8);
    expect(used / killed).toBeLessThan(3);
  });

  it('two Neptunes sink a poorly kept cruiser (Moskva) but a well-drilled crew saves the ship', () => {
    const t = navalWorld();
    const ctx = t.engine.context(t.world);
    const blackSea = t.nodeAt(44.5, 31.5);
    const moskva = t.add({ nation: RUS, name: 'Moskva', kind: 'surface_group', node: blackSea, equipment: t.eq({ n_cruiser: 1 }), readiness: 0.5 });
    const drilled = t.add({ nation: RUS, name: 'Drilled cruiser', kind: 'surface_group', node: blackSea, equipment: t.eq({ n_cruiser: 1 }), readiness: 0.95 });
    strikeNavalGroup(t.world, ctx, UKR, mid('n_neptune'), 2, moskva.id);
    strikeNavalGroup(t.world, ctx, UKR, mid('n_neptune'), 2, drilled.id);
    expect(moskva.status).toBe('destroyed');
    expect(drilled.status).toBe('active');
    expect(count(drilled.damaged, 'n_cruiser')).toBe(1);
    expect(drilled.order.posture).toBe('reserve');
  });

  it('one Exocet mission-kills a destroyer without sinking it (Glamorgan 1982, Stark 1987)', () => {
    const t = navalWorld();
    const ctx = t.engine.context(t.world);
    const g = t.add({ nation: USA, name: 'DDG', kind: 'surface_group', node: t.nodeAt(-52, -55), equipment: t.eq({ t_destroyer: 2 }) });
    strikeNavalGroup(t.world, ctx, 'ARG' as NationId, mid('n_exocet'), 1, g.id);
    expect(count(g.equipment, 't_destroyer')).toBe(1);
    expect(count(g.damaged, 't_destroyer')).toBe(1);
    expect(led(t, 'USA')!.hullsSunk).toBe(0);
  });

  it('sinking an amphibious ship drowns the troops aboard', () => {
    const t = navalWorld();
    const port = t.portOf('CHN', 24.5, 118.1);
    const lift = t.add({ nation: CHN, name: 'Amphib group', kind: 'surface_group', node: port, equipment: t.eq({ n_lhd: 1 }) });
    const troops = t.add({ nation: CHN, name: 'Marine brigade', kind: 'maneuver', echelon: 'brigade', node: port, equipment: t.eq({ t_inf: 150, t_mbt: 20 }) });
    t.order(troops, { posture: 'embark', targetFormation: lift.id });
    expect(troops.status).toBe('embarked');
    strikeNavalGroup(t.world, t.engine.context(t.world), TWN, mid('n_exocet'), 6, lift.id);
    expect(lift.status).toBe('destroyed');
    expect(troops.status).toBe('destroyed');
  });

  it('sinking a cargo ship loses the vehicles aboard but not the troops, who fly', () => {
    const t = navalWorld();
    const port = t.portOf('USA', 36.9, -76.3);
    const lift = t.add({ nation: USA, name: 'RO-RO group', kind: 'surface_group', node: port, equipment: t.eq({ t_lmsr: 2 }) });
    const troops = t.add({ nation: USA, name: 'Armored battalion', kind: 'maneuver', echelon: 'battalion', node: port, equipment: t.eq({ t_inf: 30, t_mbt: 20 }) });
    const people = troops.personnel;
    // As naval/sealift.ts loads a waiting formation.
    troops.status = 'embarked';
    troops.embarkedOn = lift.id;
    strikeNavalGroup(t.world, t.engine.context(t.world), RUS, mid('n_exocet'), 12, lift.id);
    expect(lift.status).toBe('destroyed');
    expect(troops.status).toBe('active');
    expect(troops.personnel).toBe(people);
    expect(troops.equipment[mid('t_mbt') as unknown as PlatformId] ?? 0).toBe(0);
  });
});

describe('passage routing', () => {
  // The US squadrons lost in transit after the map change: sent from the Sea of Japan to the Philippine Sea, they
  // took the shortest route through the East China Sea past the PLA's bases. A task force on passage goes round.
  it('routes a passage out of reach of the enemy coast when the open ocean offers a way round', () => {
    const t = navalWorld();
    t.war('USA', 'CHN');
    const from = t.nodeAt(38.5, 134.5), to = t.nodeAt(19.5, 123.5);
    const g = t.add({ nation: USA, name: 'DESRON', kind: 'surface_group', node: from, equipment: t.eq({ n_cruiser: 2 }) });
    t.order(g, { posture: 'patrol', target: to });
    const path = g.order.path ?? [];
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toBe(to);
    const enemyCoast: NodeId[] = [];
    for (let n = 0; n < t.map.landCount; n++) if (t.world.control[n] === CHN && [...t.map.neighbors(n as NodeId)].some((m) => t.map.isSea(m))) enemyCoast.push(n as NodeId);
    const nearest = (z: NodeId) => Math.min(...enemyCoast.map((n) => t.map.distanceKm(n, z)));
    for (const z of path.slice(0, -1)) expect(nearest(z)).toBeGreaterThan(450);
  });
});

describe('submarine warfare', () => {
  const quietSsn = (t: ReturnType<typeof navalWorld>, at: NodeId) => {
    const s = t.add({ nation: USA, name: 'SSN', kind: 'submarine', echelon: 'squadron', node: at, equipment: t.eq({ t_ssn: 1 }), magazine: {} });
    s.order = { posture: 'reserve', issuedTick: 0 };
    return s;
  };
  const detectionRate = (screen: Record<string, number>) => {
    const t = navalWorld(11);
    const at = t.nodeAt(20, 125);
    t.war('USA', 'CHN');
    const ssn = quietSsn(t, at);
    t.add({ nation: CHN, name: 'Screen', kind: 'surface_group', node: at, equipment: t.eq(screen), magazine: {} });
    let seen = 0;
    const ticks = 200;
    for (let i = 0; i < ticks; i++) {
      t.engine.step(t.world);
      if (t.world.slices.naval.tracks[ssn.id]?.includes(CHN)) seen++;
    }
    return seen / ticks;
  };

  it('area search over a whole sea zone rarely finds a quiet SSN, even with an ASW screen', () => {
    expect(detectionRate({ t_destroyer: 1 })).toBeLessThan(0.03);
    expect(detectionRate({ t_destroyer: 1, n_frigate: 2, n_helo: 4 })).toBeLessThan(0.1);
  });

  it('a massed ASW force finds a quiet SSN far more often than a lone ship', () => {
    const bare = detectionRate({ t_destroyer: 1 });
    const massed = detectionRate({ n_frigate: 30, n_helo: 60 });
    expect(massed).toBeGreaterThan(0.1);
    expect(massed).toBeGreaterThan(bare * 3);
  });

  /** ASW torpedoes a frigate screen fires in ten days at a pack of SSNs in its zone, and the most boats one counterattack sank. */
  const counterattacks = (attacking: boolean) => {
    const t = navalWorld(3);
    const at = t.nodeAt(20, 125);
    t.war('USA', 'CHN');
    const pack = t.add({ nation: USA, name: 'SSN squadron', kind: 'submarine', echelon: 'squadron', node: at, equipment: t.eq({ t_ssn: 8 }) });
    pack.order = { posture: attacking ? 'patrol' : 'reserve', issuedTick: 0 };
    const force = t.add({ nation: CHN, name: 'Amphibious force', kind: 'surface_group', node: at, equipment: t.eq({ n_lhd: 40 }) });
    const screen = t.add({ nation: CHN, name: 'ASW screen', kind: 'surface_group', node: at, equipment: t.eq({ n_frigate: 6, n_helo: 12 }) });
    screen.order = { posture: 'escort', targetFormation: force.id, issuedTick: 0 };
    let worst = 0;
    for (let i = 0; i < 40; i++)
      for (const e of t.engine.step(t.world)) if (e.type === 'battle' && e.defender === USA) worst = Math.max(worst, e.losses[USA]?.['t_ssn' as PlatformId] ?? 0);
    return { torpedoes: led(t, 'CHN')?.torpedoesFired ?? 0, worst };
  };

  it('boats that attack a screened group draw far more counterattacks than boats lying quiet, and each sinks at most the boat that attacked', () => {
    const quiet = counterattacks(false), attacking = counterattacks(true);
    expect(attacking.torpedoes).toBeGreaterThan(Math.max(4, quiet.torpedoes * 3));
    expect(attacking.worst).toBeLessThanOrEqual(1);
  });

  it('a nuclear boat strikes a group one sea zone over and a diesel boat does not', () => {
    const sank = (boat: string) => {
      const t = navalWorld(5);
      const at = t.nodeAt(20, 125);
      const next = [...t.map.neighbors(at)].find((n) => t.map.isSea(n))!;
      t.war('USA', 'CHN');
      const sub = t.add({ nation: USA, name: 'Boat', kind: 'submarine', echelon: 'squadron', node: next, equipment: t.eq({ [boat]: 1 }) });
      sub.order = { posture: 'patrol', issuedTick: 0 };
      t.add({ nation: CHN, name: 'LHD', kind: 'surface_group', node: at, equipment: t.eq({ n_lhd: 4 }) });
      for (let i = 0; i < 12; i++) t.engine.step(t.world);
      return led(t, 'CHN')?.hullsSunk ?? 0;
    };
    expect(sank('t_ssn')).toBeGreaterThan(0);
    expect(sank('n_ssk')).toBe(0);
  });

  it('a boat that attacks tells its victims a submarine works that zone, while one that lies quiet stays unknown', () => {
    const t = navalWorld(5);
    const at = t.nodeAt(20, 125), quietAt = t.nodeAt(30, 140);
    t.war('USA', 'CHN');
    const boat = t.add({ nation: USA, name: 'SSN', kind: 'submarine', echelon: 'squadron', node: at, equipment: t.eq({ t_ssn: 1 }) });
    const quiet = t.add({ nation: USA, name: 'Quiet SSN', kind: 'submarine', echelon: 'squadron', node: quietAt, equipment: t.eq({ t_ssn: 1 }) });
    boat.order = { posture: 'patrol', issuedTick: 0 };
    quiet.order = { posture: 'patrol', issuedTick: 0 };
    t.add({ nation: CHN, name: 'LHD', kind: 'surface_group', node: at, equipment: t.eq({ n_lhd: 1 }) });
    t.engine.step(t.world);
    expect(t.world.slices.naval.tracks[boat.id]).toContain(CHN);
    expect(t.world.slices.naval.tracks[quiet.id] ?? []).not.toContain(CHN);
  });

  it('an SSN ambush sinks an unescorted amphibious ship and the submarine survives', () => {
    const t = navalWorld(5);
    const at = t.nodeAt(20, 125);
    t.war('USA', 'CHN');
    const ssn = t.add({ nation: USA, name: 'SSN', kind: 'submarine', echelon: 'squadron', node: at, equipment: t.eq({ t_ssn: 1 }) });
    ssn.order = { posture: 'patrol', issuedTick: 0 };
    const lhd = t.add({ nation: CHN, name: 'LHD', kind: 'surface_group', node: at, equipment: t.eq({ n_lhd: 1 }) });
    expect(runUntil(t, () => lhd.status === 'destroyed', 6)).toBeGreaterThan(0);
    expect(ssn.status).toBe('active');
    expect(led(t, 'USA')!.torpedoesFired).toBeGreaterThan(0);
  });

  const attacksOn = (screened: boolean) => {
    const t = navalWorld(7);
    const at = t.nodeAt(20, 125);
    t.war('USA', 'CHN');
    const ssn = t.add({ nation: USA, name: 'SSN', kind: 'submarine', echelon: 'squadron', node: at, equipment: t.eq({ t_ssn: 1 }) });
    ssn.order = { posture: 'patrol', issuedTick: 0 };
    const force = t.add({ nation: CHN, name: 'Amphibious force', kind: 'surface_group', node: at, equipment: t.eq({ n_lhd: 40 }) });
    if (screened) {
      const screen = t.add({ nation: CHN, name: 'ASW screen', kind: 'surface_group', node: at, equipment: t.eq({ n_frigate: 6, n_helo: 12 }), magazine: {} });
      screen.order = { posture: 'escort', targetFormation: force.id, issuedTick: 0 };
    }
    let attacks = 0;
    for (let i = 0; i < 32; i++) for (const e of t.engine.step(t.world)) if (e.type === 'strike' && e.by === USA) attacks++;
    return { attacks, torpedoes: led(t, 'USA')?.torpedoesFired ?? 0 };
  };

  it('one boat attacks with a spread of three about once a day, and an ASW screen turns most approaches away', () => {
    const bare = attacksOn(false);
    expect(bare.attacks).toBeGreaterThanOrEqual(6);
    expect(bare.attacks).toBeLessThanOrEqual(9);
    expect(bare.torpedoes).toBe(bare.attacks * 3);
    expect(attacksOn(true).attacks).toBeLessThan(bare.attacks * 0.6);
  });

  it('a dozen boats massed on one sea zone make three attacks a tick, not one', () => {
    const t = navalWorld(7);
    const at = t.nodeAt(20, 125);
    t.war('USA', 'CHN');
    const pack = t.add({ nation: USA, name: 'SSN squadron', kind: 'submarine', echelon: 'squadron', node: at, equipment: t.eq({ t_ssn: 12 }) });
    pack.order = { posture: 'patrol', issuedTick: 0 };
    t.add({ nation: CHN, name: 'Amphibious force', kind: 'surface_group', node: at, equipment: t.eq({ n_lhd: 40 }) });
    t.engine.step(t.world);
    expect(led(t, 'USA')!.torpedoesFired).toBe(9);
  });

  it('a submarine goes for a loaded troopship before a costlier warship group beside it', () => {
    const t = navalWorld(5);
    const at = t.nodeAt(20, 125);
    t.war('USA', 'CHN');
    const ssn = t.add({ nation: USA, name: 'SSN', kind: 'submarine', echelon: 'squadron', node: at, equipment: t.eq({ t_ssn: 1 }) });
    ssn.order = { posture: 'patrol', issuedTick: 0 };
    const warships = t.add({ nation: CHN, name: 'Cruisers', kind: 'surface_group', node: at, equipment: t.eq({ n_cruiser: 6 }), magazine: {} });
    const lift = t.add({ nation: CHN, name: 'Troopship', kind: 'surface_group', node: at, equipment: t.eq({ n_lhd: 1 }) });
    const troops = t.add({ nation: CHN, name: 'Brigade', kind: 'maneuver', echelon: 'brigade', node: at, equipment: t.eq({ t_inf: 100 }) });
    troops.status = 'embarked';
    troops.embarkedOn = lift.id;
    expect(runUntil(t, () => lift.status === 'destroyed', 12)).toBeGreaterThan(0);
    expect(troops.status).toBe('destroyed');
    expect(warships.equipment['n_cruiser' as PlatformId]).toBe(6);
  });
});

describe('anti-ship strikes from shore', () => {
  it("a coastal battery's salvo meets the target group's area defence and its hits reach the naval ledger", () => {
    const t = navalWorld(7, [airWar, navalWar]);
    t.war('UKR', 'RUS');
    const port = t.portOf('UKR', 46.5, 30.7);
    const at = seaNeighbour(t.map, port)!;
    const fleet = t.add({ nation: RUS, name: 'Frigates', kind: 'surface_group', node: at, equipment: t.eq({ n_frigate: 3 }) });
    fleet.order = { posture: 'reserve', issuedTick: 0 };
    const battery = t.add({ nation: UKR, name: 'ASBM battery', kind: 'missile', echelon: 'battalion', node: port, equipment: t.eq({ n_coastal: 12 }) });
    battery.order = { posture: 'strike', target: at, targetClass: 'ship', targetFormation: fleet.id, issuedTick: 0 };
    for (let i = 0; i < 8; i++) t.engine.step(t.world);
    const fired = 48 - battery.magazine[mid('n_asbm')];
    expect(fired).toBeGreaterThan(0);
    expect(led(t, 'UKR')!.missilesFired).toBe(fired);
    expect(led(t, 'RUS')!.interceptorsFired).toBeGreaterThan(0);
    expect(fleet.magazine[mid('t_sam')]).toBeLessThan(96);
    expect(led(t, 'RUS')!.hullsSunk + led(t, 'RUS')!.hullsDamaged).toBeGreaterThan(0);
  });

  it('ballistic rounds find a group at sea only on a fresh fix: none without a contact, few on a day-old radar track', () => {
    const hitsWith = (fix: { ageTicks: number; source: 'satellite' | 'naval' } | undefined) => {
      let hits = 0, fired = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const t = navalWorld(seed);
        t.war('UKR', 'RUS');
        const at = t.nodeAt(43, 34);
        const fleet = t.add({ nation: RUS, name: 'Frigates', kind: 'surface_group', node: at, equipment: t.eq({ n_frigate: 3 }), magazine: {} });
        fleet.home = t.portOf('RUS', 44.6, 33.5);
        t.world.tick = 20;
        t.world.slices.intel = { pictures: { [UKR]: fix ? { [fleet.id]: { node: at, tick: t.world.tick - fix.ageTicks, kind: 'surface_group', strength: 3, source: fix.source } } : {} } };
        hits += strikeNavalGroup(t.world, t.engine.context(t.world), UKR, mid('n_asbm'), 12, fleet.id)!.hits.length;
        fired += led(t, 'UKR')!.missilesFired;
      }
      expect(fired).toBe(72);
      return hits;
    };
    const fresh = hitsWith({ ageTicks: 1, source: 'satellite' });
    expect(fresh).toBeGreaterThan(10);
    expect(hitsWith(undefined)).toBe(0);
    expect(hitsWith({ ageTicks: 4, source: 'naval' })).toBeLessThan(fresh / 4);
  });
});

describe('strike USVs', () => {
  it('a wave of strike USVs expends itself on a tracked warship group, gets past its SAMs, and sinks ships', () => {
    let sunk = 0, samsSpent = 0, launched = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const t = navalWorld(seed);
      const at = t.nodeAt(44.5, 31.5);
      t.war('UKR', 'RUS');
      const usvs = t.add({ nation: UKR, name: 'USV squadron', kind: 'surface_group', node: at, equipment: t.eq({ n_usv: 8 }), magazine: {} });
      usvs.order = { posture: 'patrol', issuedTick: 0 };
      const fleet = t.add({ nation: RUS, name: 'Corvette group', kind: 'surface_group', node: at, equipment: t.eq({ n_minelayer: 4 }), magazine: { t_sam: 40 } as never });
      fleet.order = { posture: 'reserve', issuedTick: 0 };
      t.world.slices.naval.oceanSurveillance[UKR] = 5;
      for (let i = 0; i < 4 && (usvs.equipment['n_usv' as PlatformId] ?? 0) > 0; i++) t.engine.step(t.world);
      launched += 8 - (usvs.equipment['n_usv' as PlatformId] ?? 0);
      sunk += 4 - (fleet.equipment['n_minelayer' as PlatformId] ?? 0) - (fleet.damaged['n_minelayer' as PlatformId] ?? 0);
      samsSpent += 40 - (fleet.magazine['t_sam' as MunitionId] ?? 0);
    }
    expect(launched).toBe(48);
    expect(sunk).toBeGreaterThan(4);
    expect(samsSpent).toBe(0);
  });

  it('a USV group raids from its port at a group within range, then waits about two weeks before the next raid', () => {
    const t = navalWorld();
    t.war('UKR', 'RUS');
    const port = t.portOf('UKR', 46.5, 30.7);
    const usvs = t.add({ nation: UKR, name: 'USV squadron', kind: 'surface_group', node: port, equipment: t.eq({ n_usv: 40 }), magazine: {} });
    usvs.order = { posture: 'defend', issuedTick: 0 };
    const fleet = t.add({ nation: RUS, name: 'Patrol', kind: 'surface_group', node: t.nodeAt(43.5, 34.5), equipment: t.eq({ t_destroyer: 20 }), magazine: {} });
    fleet.order = { posture: 'reserve', issuedTick: 0 };
    t.world.slices.naval.oceanSurveillance[UKR] = 5;
    const left = () => usvs.equipment['n_usv' as PlatformId] ?? 0;
    t.engine.step(t.world);
    expect(left()).toBe(32);
    for (let i = 0; i < 13 * 4; i++) t.engine.step(t.world);
    expect(left()).toBe(32);
    for (let i = 0; i < 2 * 4; i++) t.engine.step(t.world);
    expect(left()).toBe(24);
  });
});

describe('sea control and blockade', () => {
  const malacca = CHOKEPOINTS.find((c) => c.name === 'Strait of Malacca')!;

  it('a blockade of Malacca interdicts Chinese trade, disrupts Japanese and Korean only once the PLAN fights there, and leaves Brazil alone', () => {
    const t = navalWorld();
    const at = geography(t.map).chokepoints.find((c) => c.def === malacca)!.nodes[1];
    const us = t.add({ nation: USA, name: 'Blockade force', kind: 'surface_group', node: at, equipment: t.eq({ t_destroyer: 3 }), magazine: {} });
    t.order(us, { posture: 'blockade', target: at });
    t.engine.step(t.world);
    expect((t.world.theater.tradeBlocked as Record<string, number>).CHN).toBe(0);

    t.war('USA', 'CHN');
    t.engine.step(t.world);
    const tb = t.world.theater.tradeBlocked as Record<string, number>;
    expect(tb.CHN).toBeGreaterThan(0.3);
    expect(tb.JPN).toBe(0);
    expect(tb.KOR).toBe(0);

    t.add({ nation: CHN, name: 'Escort force', kind: 'surface_group', node: at, equipment: t.eq({ t_destroyer: 1 }), magazine: {} });
    t.engine.step(t.world);
    const contested = t.world.theater.tradeBlocked as Record<string, number>;
    expect(contested.JPN).toBeGreaterThan(0.15);
    expect(contested.KOR).toBeGreaterThan(0.15);
    expect(contested.CHN).toBeGreaterThan(contested.KOR * 0.9);
    expect(contested.BRA).toBeLessThan(0.01);
    expect(contested.USA).toBe(0);
    expect(t.world.theater.seaControl[at]).toEqual({ nation: USA, level: expect.any(Number) });
    expect(t.world.theater.seaControl[at].level).toBeGreaterThan(0.5);
  });

  it('a submarine on patrol in the Strait of Hormuz cuts Iranian trade, a surface patrol (not blockade) does not, and neutrals sail on', () => {
    const t = navalWorld();
    const at = geography(t.map).chokepoints.find((c) => c.def.name === 'Strait of Hormuz')!.nodes[0];
    t.war('USA', 'IRN');
    const patrol = t.add({ nation: USA, name: 'Patrol', kind: 'surface_group', node: at, equipment: t.eq({ t_destroyer: 2 }), magazine: {} });
    t.order(patrol, { posture: 'patrol', target: at });
    t.engine.step(t.world);
    expect((t.world.theater.tradeBlocked as Record<string, number>).IRN).toBe(0);
    const ssn = t.add({ nation: USA, name: 'SSN', kind: 'submarine', echelon: 'squadron', node: at, equipment: t.eq({ t_ssn: 1 }), magazine: {} });
    t.order(ssn, { posture: 'patrol', target: at });
    t.engine.step(t.world);
    expect((t.world.theater.tradeBlocked as Record<string, number>).IRN).toBeGreaterThan(0.2);
    expect((t.world.theater.tradeBlocked as Record<string, number>).QAT).toBe(0);
  });

  it('a flotilla of midget submarines with two torpedoes each cuts a lane less than one diesel boat with eighteen', () => {
    const cut = (equipment: Record<string, number>) => {
      const t = navalWorld();
      const at = geography(t.map).chokepoints.find((c) => c.def.name === 'Strait of Hormuz')!.nodes[0];
      t.war('USA', 'IRN');
      const boats = t.add({ nation: USA, name: 'Boats', kind: 'submarine', echelon: 'squadron', node: at, equipment: t.eq(equipment), magazine: {} });
      t.order(boats, { posture: 'patrol', target: at });
      t.engine.step(t.world);
      return (t.world.theater.tradeBlocked as Record<string, number>).IRN;
    };
    expect(cut({ n_midget: 6 })).toBeLessThan(cut({ n_ssk: 1 }));
  });
});

describe('mine warfare', () => {
  it('hostile mines close a sea node to routing until minesweepers clear it', () => {
    const t = navalWorld();
    t.war('USA', 'RUS');
    const mined = nearestSea(t.map, 55.5, 13.5);
    const from = t.nodeAt(55.5, 17), to = t.nodeAt(55.5, 4.5);
    const probe = t.add({ nation: USA, name: 'Probe', kind: 'surface_group', node: from, equipment: t.eq({ t_destroyer: 1 }), magazine: {} });
    t.order(probe, { posture: 'move', target: to });
    expect(probe.order.path).toContain(mined);

    t.world.slices.naval.mines[mined] = { [RUS]: 12 };
    probe.order = { posture: 'defend', issuedTick: 0 };
    t.order(probe, { posture: 'move', target: to });
    expect(probe.order.path).toBeUndefined();
    // Only a player is told why: an AI nation's refused orders stay out of every log.
    expect(t.world.events.some((e) => e.type === 'message' && e.text.includes('no sea route'))).toBe(false);
    t.world.nations[USA].controlledBy = 'human';
    t.order(probe, { posture: 'move', target: to });
    expect(t.world.events.some((e) => e.type === 'message' && e.nation === USA && e.text.includes('no sea route'))).toBe(true);

    const mcm = t.add({ nation: USA, name: 'MCM group', kind: 'surface_group', node: mined, equipment: t.eq({ n_mcm: 4 }), magazine: {} });
    mcm.order = { posture: 'patrol', issuedTick: 0 };
    runUntil(t, () => (t.world.slices.naval.mines[mined]?.[RUS] ?? 0) < 10, 20);
    probe.node = from;
    t.order(probe, { posture: 'move', target: to });
    expect(probe.order.path).toContain(mined);
    expect(led(t, 'USA')!.minesSwept).toBeGreaterThan(2);
  });

  it('dived submarines strike hostile mines far less often than surface ships in the same field', () => {
    const t = navalWorld(11);
    t.war('USA', 'RUS');
    const mined = nearestSea(t.map, 55.5, 13.5);
    t.world.slices.naval.mines[mined] = { [RUS]: 400 };
    const boats = t.add({ nation: USA, name: 'Boats', kind: 'submarine', echelon: 'squadron', node: mined, equipment: t.eq({ t_ssn: 40 }), magazine: {} });
    const ships = t.add({ nation: USA, name: 'Ships', kind: 'surface_group', node: mined, equipment: t.eq({ t_destroyer: 40 }), magazine: {} });
    boats.order = ships.order = { posture: 'reserve', issuedTick: 0 };
    for (let i = 0; i < 4; i++) t.engine.step(t.world);
    const struck = (f: Formation, pid: string) => 40 - count(f.equipment, pid) + (f.damaged[pid as PlatformId] ?? 0);
    expect(struck(ships, 't_destroyer')).toBeGreaterThan(5);
    expect(struck(boats, 't_ssn')).toBeLessThan(struck(ships, 't_destroyer') / 2);
  });

  it('a minelayer on blockade lays its mines and they interdict trade', () => {
    const t = navalWorld();
    t.war('RUS', 'UKR');
    const odesaZone = seaNeighbour(t.map, t.portOf('UKR', 46.5, 30.7))!;
    const layer = t.add({ nation: RUS, name: 'Minelayer', kind: 'surface_group', node: odesaZone, equipment: t.eq({ n_minelayer: 2 }) });
    t.order(layer, { posture: 'blockade', target: odesaZone });
    t.engine.step(t.world);
    expect(t.world.slices.naval.mines[odesaZone][RUS]).toBe(40);
    expect(count(layer.magazine, 'n_mine')).toBe(80);
    expect((t.world.theater.tradeBlocked as Record<string, number>).UKR).toBeGreaterThan(0.1);
  });
});

describe('naval movement and lift', () => {
  it('a conventional ship without fuel stays put while a nuclear submarine with none sails on', () => {
    const t = navalWorld();
    const a = t.nodeAt(35, -40), b = t.nodeAt(42, -25);
    const dry = t.add({ nation: USA, name: 'Dry DDG', kind: 'surface_group', node: a, equipment: t.eq({ t_destroyer: 1 }), magazine: {} });
    dry.supply.fuel = 0;
    const fuelled = t.add({ nation: USA, name: 'DDG', kind: 'surface_group', node: a, equipment: t.eq({ t_destroyer: 1 }), magazine: {} });
    const ssn = t.add({ nation: USA, name: 'SSN', kind: 'submarine', echelon: 'squadron', node: a, equipment: t.eq({ t_ssn: 1 }), magazine: {} });
    ssn.supply.fuel = 0;
    for (const f of [dry, fuelled, ssn]) t.order(f, { posture: 'move', target: b });
    t.engine.run(t.world, 4);
    expect(dry.node).toBe(a);
    expect(fuelled.node).not.toBe(a);
    expect(fuelled.supply.fuel).toBeLessThan(fuelled.supplyCapacity.fuel);
    expect(ssn.node).not.toBe(a);
  });

  it('a ship alongside at its base draws fuel and stores from it, with no land supply line, while one on station at sea uses hers up', () => {
    const t = navalWorld();
    const port = t.portOf('RUS', 54.65, 19.9);
    const sea = t.nodeAt(56, 18);
    const alongside = t.add({ nation: RUS, name: 'Alongside', kind: 'surface_group', node: port, equipment: t.eq({ n_frigate: 2 }), magazine: {} });
    const onStation = t.add({ nation: RUS, name: 'On station', kind: 'surface_group', node: sea, equipment: t.eq({ n_frigate: 2 }) });
    onStation.home = port;
    alongside.supply.food *= 0.5;
    alongside.supply.fuel *= 0.5;
    t.order(onStation, { posture: 'patrol', target: sea });
    t.engine.run(t.world, Math.round((10 * 24) / t.world.dtHours));
    expect(alongside.node).toBe(port);
    expect(alongside.supply.food).toBeCloseTo(alongside.supplyCapacity.food);
    expect(alongside.supply.fuel).toBeCloseTo(alongside.supplyCapacity.fuel);
    expect(onStation.supply.food).toBeLessThan(0.8 * onStation.supplyCapacity.food);
  });

  it('a carrier in a refuelling overhaul refuses an order to sail, whoever gives it; one between deployments sails', () => {
    const t = navalWorld();
    const port = t.portOf('USA', 36.9, -76.3);
    const at = t.nodeAt(35, -40);
    const yard = t.add({ nation: USA, name: 'CVN in overhaul', kind: 'surface_group', node: port, equipment: t.eq({ n_carrier: 1 }) });
    const ready = t.add({ nation: USA, name: 'CVN', kind: 'surface_group', node: port, equipment: t.eq({ n_carrier: 1 }) });
    yard.readiness = 0.05;
    ready.readiness = 0.6;
    for (const f of [yard, ready]) t.order(f, { posture: 'patrol', target: at });
    t.engine.run(t.world, 8);
    expect(yard.node).toBe(port);
    expect(yard.order.posture).not.toBe('patrol');
    expect(ready.node).not.toBe(port);
  });

  it('routes through the Suez canal between the Mediterranean and the Red Sea', () => {
    const t = navalWorld();
    const g = t.add({ nation: USA, name: 'DDG', kind: 'surface_group', node: t.nodeAt(33, 30), equipment: t.eq({ t_destroyer: 1 }), magazine: {} });
    t.order(g, { posture: 'move', target: t.nodeAt(20, 38.5) });
    expect(g.order.path!.length).toBeLessThan(10);
  });

  describe('amphibious assault on Taiwan', () => {
    const assault = (defended: boolean, lodgement = false) => {
      const t = navalWorld(9);
      t.war('CHN', 'TWN');
      const port = t.portOf('CHN', 24.5, 118.1);
      const beach = [...Array(t.map.landCount).keys()]
        .filter((n) => t.map.owner[n] === TWN && seaNeighbour(t.map, n as NodeId) !== undefined)
        .sort((x, y) => t.map.lon[x] - t.map.lon[y])[0] as NodeId;
      const lift = t.add({ nation: CHN, name: 'Amphib group', kind: 'surface_group', node: port, equipment: t.eq({ n_lhd: 2, t_destroyer: 2 }) });
      const brigade = t.add({ nation: CHN, name: 'Amphibious combined-arms brigade', kind: 'maneuver', echelon: 'brigade', node: port, equipment: t.eq({ t_inf: 300, t_mbt: 40 }) });
      if (defended) t.add({ nation: TWN, name: 'Coastal defense brigade', kind: 'maneuver', echelon: 'brigade', node: beach, equipment: t.eq({ t_inf: 600, t_mbt: 100 }), entrenchment: 0.5 });
      if (lodgement) t.add({ nation: CHN, name: 'First wave', kind: 'maneuver', echelon: 'brigade', node: beach, equipment: t.eq({ t_inf: 600, t_mbt: 100 }) });
      t.order(brigade, { posture: 'embark', targetFormation: lift.id });
      t.order(lift, { posture: 'attack', target: beach });
      const before = brigade.personnel;
      t.engine.step(t.world);
      expect(brigade.node).toBe(lift.node);
      runUntil(t, () => lift.node === seaNeighbour(t.map, beach), 30);
      const offBeach = t.world.tick;
      expect(runUntil(t, () => brigade.status !== 'embarked', 30)).toBeGreaterThan(0);
      expect((t.world.tick - offBeach) * t.world.dtHours).toBeGreaterThanOrEqual(OFFLOAD_HOURS);
      expect(brigade.node).toBe(beach);
      expect(brigade.embarkedOn).toBeUndefined();
      return 1 - brigade.personnel / before;
    };

    it('an unopposed landing costs a few percent; a landing into a defended coast without sea or air control loses heavily', () => {
      const open = assault(false);
      const opposed = assault(true);
      expect(open).toBeLessThan(0.06);
      expect(opposed).toBeGreaterThan(0.3);
    });

    it('a follow-on wave landing behind its own troops on the beach loses far less than the assault wave', () => {
      const assaultWave = assault(true);
      const followOn = assault(true, true);
      expect(followOn).toBeLessThan(assaultWave * 0.7);
      expect(followOn).toBeGreaterThan(0);
    });
  });

  it('embarks only the landing team the lift can carry, leaves the rest ashore, and refuses once the lift is full', () => {
    const t = navalWorld();
    const port = t.portOf('CHN', 24.5, 118.1);
    const lift = t.add({ nation: CHN, name: 'Lift', kind: 'surface_group', node: port, equipment: t.eq({ n_lhd: 1 }) });
    const big = t.add({ nation: CHN, name: 'Group army', kind: 'maneuver', echelon: 'corps', node: port, equipment: t.eq({ t_inf: 2000 }) });
    const troops = big.personnel, inf = big.equipment['t_inf' as never];
    const capacity = t.catalog.platform('n_lhd' as never).capacity!.troops!;
    t.order(big, { posture: 'embark', targetFormation: lift.id });
    const team = Object.values(t.world.formations).find((f) => f.embarkedOn === lift.id)!;
    expect(big.status).toBe('active');
    expect(big.node).toBe(port);
    expect(team.status).toBe('embarked');
    expect(team.personnel).toBeLessThanOrEqual(capacity);
    expect(team.personnel).toBeGreaterThan(capacity * 0.9);
    expect(team.personnel + big.personnel).toBe(troops);
    expect(team.equipment['t_inf' as never] + big.equipment['t_inf' as never]).toBe(inf);

    const second = t.add({ nation: CHN, name: 'Second brigade', kind: 'maneuver', echelon: 'brigade', node: port, equipment: t.eq({ t_inf: 100 }) });
    t.world.nations[CHN].controlledBy = 'human';
    t.order(second, { posture: 'embark', targetFormation: lift.id });
    expect(second.status).toBe('active');
    expect(t.world.events.some((e) => e.type === 'message' && e.text.includes('lacks lift capacity'))).toBe(true);
  });
});


describe('naval AI against mines and submarines', () => {
  const orders = (t: ReturnType<typeof navalWorld>, f: Formation, days: number) => {
    const out: { posture: string; target?: NodeId }[] = [];
    t.engine.run(t.world, (days * 24) / t.world.dtHours, (w) => {
      for (const c of w.pending) if (c.type === 'order' && c.formation === f.id) out.push({ posture: c.order.posture, target: c.order.target });
    });
    return out;
  };

  it("sends sweepers to an enemy minefield, but not while the enemy's shore missiles reach it", () => {
    const sweep = (battery: boolean) => {
      const t = navalWorld(42, [navalWar, createAi()]);
      t.war('USA', 'CHN');
      const field = t.nodeAt(25, 123);
      t.world.slices.naval.mines[field] = { [CHN]: 100 };
      const mcm = t.add({ nation: USA, name: 'MCM', kind: 'surface_group', node: t.portOf('JPN', 26.2, 127.7), equipment: t.eq({ n_mcm: 4 }) });
      if (battery) {
        const site = t.nodeAt(25, 121.5);
        const b = t.add({ nation: CHN, name: 'Battery', kind: 'missile', echelon: 'battalion', node: site, equipment: t.eq({ t_inf: 2 }) });
        b.magazine = { n_shore_ascm: 24 } as Formation['magazine'];
      }
      return orders(t, mcm, 2).some((o) => o.target === field);
    };
    expect(sweep(false)).toBe(true);
    expect(sweep(true)).toBe(false);
  });

  it('sends an attack submarine to hunt an enemy boat known to be working a sea zone', () => {
    const t = navalWorld(42, [navalWar, createAi()]);
    t.war('USA', 'CHN');
    const zone = t.nodeAt(20, 135);
    t.add({ nation: CHN, name: 'Boat', kind: 'submarine', echelon: 'squadron', node: zone, equipment: t.eq({ n_ssk: 1 }) });
    const ssn = t.add({ nation: USA, name: 'SSN', kind: 'submarine', echelon: 'squadron', node: t.nodeAt(15, 145), equipment: t.eq({ t_ssn: 1 }) });
    expect(orders(t, ssn, 1).some((o) => o.target === zone)).toBe(true);
  });
});

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
  ship('n_usv', 'usv', { crew: 0, unitCostUsdM: 0.25, mobility: { speedKph: 40, rangeKm: 800, fuelTonsPerHour: 0 }, firepower: { ship: 0.05 } }),
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

describe('naval salvo combat', () => {
  const southChinaSea = (t: ReturnType<typeof navalWorld>) => t.nodeAt(15, 114);

  it('a salvo inside the defense capacity leaks nothing and sinks nothing', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const t = navalWorld(seed);
      const at = southChinaSea(t);
      t.war('USA', 'CHN');
      const us = t.add({ nation: USA, name: 'US DESRON', kind: 'surface_group', node: at, equipment: t.eq({ t_destroyer: 4 }), magazine: { [mid('t_asm')]: 2 } });
      t.add({ nation: CHN, name: 'PLAN DDG', kind: 'surface_group', node: at, equipment: t.eq({ t_destroyer: 1 }), magazine: { [mid('t_sam')]: 64 } });
      us.order = { posture: 'attack', issuedTick: 0 };
      const fired = runUntil(t, () => (led(t, 'USA')?.missilesFired ?? 0) >= 2, 10);
      expect(fired).toBeGreaterThan(0);
      const usLedger = led(t, 'USA')!;
      expect(usLedger.leakers).toBe(0);
      expect(led(t, 'CHN')?.hullsSunk ?? 0).toBe(0);
      expect(led(t, 'CHN')?.hullsDamaged ?? 0).toBe(0);
      expect(led(t, 'CHN')!.interceptorsFired).toBeGreaterThan(0);
    }
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
    expect(subsonic).toBe(0);
    expect(ballistic / 20).toBeGreaterThan(3);
  });

  it('spends about two interceptors per one-way drone, as in the Red Sea 2023-24', () => {
    const t = navalWorld();
    const sm2: Munition = { ...t.catalog.munition(mid('t_sam')), pk: { missile: 0.7 } };
    const drone: Munition = { ...t.catalog.munition(mid('t_asm')), kind: 'drone_oneway', speedMach: 0.4, interceptDifficulty: 0.25 };
    let used = 0, killed = 0;
    for (let s = 1; s <= 30; s++) {
      const out = resolveSalvo(new Rng(s), drone, 3, { channels: 12, interceptors: [{ munition: sm2, available: 90 }], pointDefense: 0.4, capShots: 0 }, 'ship');
      used += [...out.interceptorsUsed.values()].reduce((a, b) => a + b, 0);
      killed += out.intercepted;
    }
    expect(killed).toBe(90);
    expect(used / killed).toBeGreaterThan(1.5);
    expect(used / killed).toBeLessThan(2.5);
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
});

describe('submarine warfare', () => {
  const quietSsn = (t: ReturnType<typeof navalWorld>, at: NodeId) => {
    const s = t.add({ nation: USA, name: 'SSN', kind: 'submarine', echelon: 'squadron', node: at, equipment: t.eq({ t_ssn: 1 }), magazine: {} });
    s.order = { posture: 'reserve', issuedTick: 0 };
    return s;
  };
  const detectionRate = (screen: Record<string, number>, firing = false) => {
    const t = navalWorld(11);
    const at = t.nodeAt(20, 125);
    t.war('USA', 'CHN');
    const ssn = quietSsn(t, at);
    t.add({ nation: CHN, name: 'Screen', kind: 'surface_group', node: at, equipment: t.eq(screen), magazine: {} });
    let seen = 0;
    const ticks = 200;
    for (let i = 0; i < ticks; i++) {
      if (firing) t.world.slices.naval.lastFired[ssn.id] = t.world.tick - 1;
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

  it('a submarine that has just fired is found by the screen it attacked far more often than one lying quiet', () => {
    const quiet = detectionRate({ t_destroyer: 1, n_frigate: 2, n_helo: 4 });
    const datum = detectionRate({ t_destroyer: 1, n_frigate: 2, n_helo: 4 }, true);
    expect(datum).toBeGreaterThan(0.1);
    expect(datum).toBeGreaterThan(quiet * 3);
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
    expect(t.world.events.some((e) => e.type === 'message' && e.text.includes('no sea route'))).toBe(true);

    const mcm = t.add({ nation: USA, name: 'MCM group', kind: 'surface_group', node: mined, equipment: t.eq({ n_mcm: 4 }), magazine: {} });
    mcm.order = { posture: 'patrol', issuedTick: 0 };
    runUntil(t, () => (t.world.slices.naval.mines[mined]?.[RUS] ?? 0) < 10, 20);
    probe.node = from;
    t.order(probe, { posture: 'move', target: to });
    expect(probe.order.path).toContain(mined);
    expect(led(t, 'USA')!.minesSwept).toBeGreaterThan(2);
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
      expect(runUntil(t, () => brigade.status !== 'embarked', 30)).toBeGreaterThan(0);
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
    t.order(second, { posture: 'embark', targetFormation: lift.id });
    expect(second.status).toBe('active');
    expect(t.world.events.some((e) => e.type === 'message' && e.text.includes('lacks lift capacity'))).toBe(true);
  });
});


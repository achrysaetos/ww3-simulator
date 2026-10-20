import { describe, expect, it } from 'vitest';
import { Catalog } from '../src/core/catalog';
import { Engine } from '../src/core/engine';
import { addFormation } from '../src/core/forces';
import type { Formation, Munition, NationId, NodeId, Platform, SimEvent } from '../src/core/types';
import { createWorld } from '../src/core/world';
import { loadMap } from '../src/data/load';
import {
  cepFactor, createStrategic, detonate, globalCoolingC, globalFoodShock, isrFactor, release, setNuclearPosture, strategic, targetList, falloutDenied,
  type LaunchOnWarningHook,
} from '../src/systems/strategic';
import { downwind } from '../src/systems/strategic/fallout';
import { id, testMunitions, testPlatforms, testWorld } from '../src/testkit';

const USA = id.nation('USA'), RUS = id.nation('RUS'), CHN = id.nation('CHN');
const NUKE = id.munition('t_nuke');
const SILO = id.platform('t_icbm');

type T = ReturnType<typeof testWorld>;

function arm(t: T, nation: NationId, node: NodeId, silos: number): Formation {
  const n = t.world.nations[nation];
  n.nuclear = { warheads: n.nuclear.warheads + silos, deployed: n.nuclear.deployed + silos, doctrine: 'calculated_ambiguity' };
  return t.add({ nation, name: `${nation} silos`, kind: 'strategic', echelon: 'wing', node, equipment: { [SILO]: silos } });
}

const of = <K extends SimEvent['type']>(events: SimEvent[], type: K) => events.filter((e): e is Extract<SimEvent, { type: K }> => e.type === type);

describe('nuclear release', () => {
  it('kills NUKEMAP-scale numbers with a 300 kt air burst over Chicago and leaves no fallout', () => {
    const t = testWorld([strategic]);
    const chicago = t.nodeAt(41.88, -87.63);
    const silos = arm(t, RUS, t.nodeAt(51.7, 45.5), 5);
    t.world.slices.strategic.interceptors.gmd = 0;
    const popBefore = t.world.nations[USA].population;
    t.world.pending.push({ type: 'nuclear_release', nation: RUS, target: chicago, warheads: 1, munition: NUKE });
    const events = t.engine.step(t.world);

    const [det] = of(events, 'nuclear_detonation');
    // NUKEMAP puts a 300 kt air burst over a dense US downtown at roughly 0.3-1 million dead.
    expect(det.casualties).toBeGreaterThan(300_000);
    expect(det.casualties).toBeLessThan(1_500_000);
    expect(t.world.nations[USA].population).toBe(popBefore - det.casualties);
    expect(t.world.theater.infrastructure[chicago]).toBeLessThan(0.97);
    expect(t.world.theater.fallout).toEqual({});
    expect(silos.magazine[NUKE]).toBe(4);
    expect(t.world.nations[RUS].nuclear).toMatchObject({ warheads: 4, deployed: 4 });
  });

  it('a second warhead on the same city kills fewer, because the first already killed the core', () => {
    const t = testWorld([strategic]);
    const chicago = t.nodeAt(41.88, -87.63);
    arm(t, RUS, t.nodeAt(51.7, 45.5), 2);
    t.world.slices.strategic.interceptors.gmd = 0;
    t.world.pending.push({ type: 'nuclear_release', nation: RUS, target: chicago, warheads: 2, munition: NUKE });
    const [a, b] = of(t.engine.step(t.world), 'nuclear_detonation');
    expect(b.casualties).toBeLessThan(a.casualties);
  });

  it('refuses release when the nation has no deployed warheads, and consumes nothing', () => {
    const t = testWorld([strategic]);
    const silos = arm(t, RUS, t.nodeAt(51.7, 45.5), 3);
    t.world.nations[RUS].nuclear = { warheads: 0, deployed: 0, doctrine: 'none' };
    t.world.pending.push({ type: 'nuclear_release', nation: RUS, target: t.nodeAt(41.88, -87.63), warheads: 1, munition: NUKE });
    const events = t.engine.step(t.world);
    expect(of(events, 'nuclear_detonation')).toHaveLength(0);
    expect(of(events, 'message').some((m) => m.text.includes('no deployed warheads'))).toBe(true);
    expect(silos.magazine[NUKE]).toBe(3);
  });

  it('refuses a target beyond missile range', () => {
    const t = testWorld([strategic]);
    const silos = arm(t, RUS, t.nodeAt(55.75, 37.6), 3);
    const buenosAires = t.nodeAt(-34.6, -58.4);
    expect(t.map.distanceKm(silos.node, buenosAires)).toBeGreaterThan(12_000);
    t.world.pending.push({ type: 'nuclear_release', nation: RUS, target: buenosAires, warheads: 1, munition: NUKE });
    expect(of(t.engine.step(t.world), 'nuclear_detonation')).toHaveLength(0);
    expect(silos.magazine[NUKE]).toBe(3);
  });

  it('draws warheads from several launchers and never more than requested', () => {
    const t = testWorld([strategic]);
    const a = arm(t, RUS, t.nodeAt(51.7, 45.5), 2), b = arm(t, RUS, t.nodeAt(55, 60), 2);
    const ctx = t.engine.context(t.world);
    expect(release(t.world, ctx, { nation: RUS, target: t.nodeAt(28.6, 77.2), warheads: 3, munition: NUKE })).toBe(3);
    expect(a.magazine[NUKE] + b.magazine[NUKE]).toBe(1);
    expect(t.world.nations[RUS].nuclear.deployed).toBe(1);
  });
});

describe('missile defense', () => {
  it('GMD intercepts some but not most of a 100-warhead ICBM salvo, and spends interceptors', () => {
    const t = testWorld([strategic]);
    arm(t, RUS, t.nodeAt(51.7, 45.5), 100);
    t.world.pending.push({ type: 'nuclear_release', nation: RUS, target: t.nodeAt(47.5, -111.3), warheads: 100, munition: NUKE });
    const [strike] = of(t.engine.step(t.world), 'strike');
    expect(strike.fired).toBe(100);
    expect(strike.intercepted).toBeGreaterThan(0);
    expect(strike.intercepted).toBeLessThan(25);
    expect(t.world.slices.strategic.interceptors.gmd).toBeLessThan(44);
  });

  it('does not intercept warheads aimed at an undefended country', () => {
    const t = testWorld([strategic]);
    arm(t, RUS, t.nodeAt(51.7, 45.5), 20);
    t.world.pending.push({ type: 'nuclear_release', nation: RUS, target: t.nodeAt(28.6, 77.2), warheads: 20, munition: NUKE });
    const [strike] = of(t.engine.step(t.world), 'strike');
    expect(strike.intercepted).toBe(0);
    expect(t.world.slices.strategic.interceptors.gmd).toBe(44);
  });
});

describe('fallout', () => {
  it('a surface burst lays fallout downwind that decays by t^-1.2 and keeps killing', () => {
    const t = testWorld([strategic]);
    const chicago = t.nodeAt(41.88, -87.63);
    arm(t, RUS, t.nodeAt(51.7, 45.5), 1);
    t.world.slices.strategic.interceptors.gmd = 0;
    release(t.world, t.engine.context(t.world), { nation: RUS, target: chicago, warheads: 1, munition: NUKE, burst: 'ground' });
    t.engine.step(t.world);

    const east = downwind(t.map, chicago);
    expect(t.map.lon[east]).toBeGreaterThan(t.map.lon[chicago]);
    const first = t.world.theater.fallout[chicago];
    expect(first).toBeGreaterThan(0);
    expect(t.world.theater.fallout[east]).toBeGreaterThan(0);
    expect(falloutDenied(t.world, chicago)).toBe(true);

    const popAfterBlast = t.world.nations[USA].population;
    t.engine.run(t.world, 20); // five more days
    const later = t.world.theater.fallout[chicago];
    // t = 6 h vs t = 126 h: (126/6)^-1.2 is about 1/38.
    expect(later / first).toBeGreaterThan(1 / 60);
    expect(later / first).toBeLessThan(1 / 20);
    expect(t.world.nations[USA].population).toBeLessThan(popAfterBlast);
  });

  it('an air burst leaves no fallout and the map clears once deposits are spent', () => {
    const t = testWorld([strategic]);
    const ctx = t.engine.context(t.world);
    detonate(t.world, ctx, RUS, t.nodeAt(41.88, -87.63), t.catalog.munition(NUKE), 1, 'air');
    t.engine.step(t.world);
    expect(Object.keys(t.world.theater.fallout)).toHaveLength(0);
  });
});

describe('counterforce and launch on warning', () => {
  it('a surface burst on a silo field destroys most silos and their warheads', () => {
    const t = testWorld([strategic]);
    const field = t.nodeAt(51.7, 45.5);
    setNuclearPosture(t.world, RUS, 'ride_out');
    const rus = arm(t, RUS, field, 10);
    arm(t, USA, t.nodeAt(47.5, -111.3), 20);
    t.world.pending.push({ type: 'nuclear_release', nation: USA, target: field, warheads: 20, munition: NUKE });
    t.engine.step(t.world);
    // Two 300 kt warheads with 120 m CEP per 2000 psi silo: SSPK ~0.98 each.
    expect(rus.equipment[SILO]).toBeLessThanOrEqual(1);
    expect(t.world.nations[RUS].nuclear.deployed).toBe(rus.magazine[NUKE]);
  });

  it('a launch-on-warning nation fires its silos before the incoming strike lands; one that rides out loses them', () => {
    const retaliate: LaunchOnWarningHook = (world, w) => [{ nation: w.victim, target: world.nations[w.attacker].capital, warheads: world.nations[w.victim].nuclear.deployed, munition: NUKE }];
    const run = (posture: 'launch_on_warning' | 'ride_out') => {
      const t = testWorld([createStrategic({ onWarning: retaliate })]);
      setNuclearPosture(t.world, RUS, posture);
      const field = t.nodeAt(51.7, 45.5);
      arm(t, RUS, field, 10);
      arm(t, USA, t.nodeAt(47.5, -111.3), 20);
      t.world.slices.strategic.interceptors.gmd = 0;
      t.world.pending.push({ type: 'nuclear_release', nation: USA, target: field, warheads: 20, munition: NUKE });
      const events = t.engine.step(t.world);
      return { t, byRussia: of(events, 'nuclear_detonation').filter((e) => e.by === RUS).length };
    };
    const low = run('launch_on_warning');
    expect(low.t.world.slices.strategic.warnings.some((w) => w.victim === RUS && w.counterforce)).toBe(true);
    expect(low.byRussia).toBe(10);
    expect(run('ride_out').byRussia).toBe(0);
  });

  it('targetList ranks nuclear forces and command first for counterforce, cities by population for countervalue', () => {
    const t = testWorld([strategic]);
    const field = t.nodeAt(47.5, -111.3);
    arm(t, USA, field, 50);
    arm(t, RUS, t.nodeAt(55.75, 37.6), 5);
    const ctx = t.engine.context(t.world);
    const cf = targetList(t.world, ctx, RUS, USA, 'counterforce');
    expect(cf[0]).toMatchObject({ node: field, kind: 'silo_field' });
    expect(cf.some((x) => x.kind === 'command' && x.node === t.world.nations[USA].capital)).toBe(true);
    const cv = targetList(t.world, ctx, RUS, USA, 'countervalue');
    expect(cv[0].node).toBe(t.nodeAt(40.7, -74));
    for (let i = 1; i < cv.length; i++) expect(cv[i].value).toBeLessThanOrEqual(cv[i - 1].value);
    expect(targetList(t.world, ctx, CHN, USA, 'countervalue')).toEqual([]);
  });
});

describe('nuclear winter', () => {
  it('city fires loft soot that cuts global food output; a strike on an empty silo field does not', () => {
    const t = testWorld([strategic]);
    const ctx = t.engine.context(t.world);
    const m = t.catalog.munition(NUKE);
    detonate(t.world, ctx, USA, t.nodeAt(47.5, -111.3), m, 10, 'ground');
    t.engine.run(t.world, 4 * 200);
    expect(globalFoodShock(t.world)).toBeLessThan(0.01);

    const cities = [...t.map.cities].sort((a, b) => b.pop - a.pop).slice(0, 100);
    for (const c of cities) detonate(t.world, ctx, USA, c.node, m, 1, 'air');
    expect(globalFoodShock(t.world)).toBeLessThan(0.01); // the climate response takes months to build
    t.engine.run(t.world, 4 * 200);
    // Xia et al. 2022: 16-47 Tg (regional to large war) cuts global calories by ~13-35%.
    expect(globalFoodShock(t.world)).toBeGreaterThan(0.05);
    expect(globalFoodShock(t.world)).toBeLessThan(0.5);
    expect(globalCoolingC(t.world)).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------- space

const spacePlatforms: Platform[] = [
  { id: id.platform('x_recon'), name: 'Recon satellite', class: 'recon_satellite', domain: 'space', producers: [], inService: 2015, unitCostUsdM: 500, crew: 0, mobility: { speedKph: 27_000, rangeKm: 0, fuelTonsPerHour: 0 }, protection: { armor: 0, stealth: 0 }, sensors: { detectionKm: 1000 }, firepower: {}, loadout: [] },
  { id: id.platform('x_nav'), name: 'Nav satellite', class: 'nav_satellite', domain: 'space', producers: [], inService: 2015, unitCostUsdM: 500, crew: 0, mobility: { speedKph: 14_000, rangeKm: 0, fuelTonsPerHour: 0 }, protection: { armor: 0, stealth: 0 }, sensors: { detectionKm: 0 }, firepower: {}, loadout: [] },
  { id: id.platform('x_asat'), name: 'DA-ASAT launcher', class: 'asat', domain: 'land', producers: [], inService: 2015, unitCostUsdM: 50, crew: 5, mobility: { speedKph: 30, rangeKm: 500, fuelTonsPerHour: 0.1 }, protection: { armor: 0.1, stealth: 0.2 }, sensors: { detectionKm: 0 }, firepower: {}, loadout: [{ munition: id.munition('x_kkv'), count: 2 }] },
];
const kkv: Munition = { id: id.munition('x_kkv'), name: 'Kinetic kill vehicle', kind: 'abm', producers: [], rangeKm: 2000, speedMach: 20, warheadKg: 0, cepM: 1, pk: {}, interceptDifficulty: 0, unitCostUsdM: 20, weightKg: 10_000 };

function spaceWorld() {
  const map = loadMap();
  const catalog = new Catalog([...testPlatforms, ...spacePlatforms], [...testMunitions, kkv]);
  const engine = new Engine(map, catalog, [strategic]);
  const world = createWorld(map, { seed: 3 });
  engine.init(world);
  const sats = addFormation(world, catalog, { nation: USA, name: 'NRO', kind: 'space', echelon: 'wing', node: map.nodeAt(38.9, -77), equipment: { [id.platform('x_recon')]: 10, [id.platform('x_nav')]: 30 } });
  const asat = addFormation(world, catalog, { nation: CHN, name: 'ASAT brigade', kind: 'missile', echelon: 'brigade', node: map.nodeAt(40, 100), equipment: { [id.platform('x_asat')]: 4 } });
  asat.order = { posture: 'strike', targetFormation: sats.id, issuedTick: 0 };
  const war = () => {
    world.relations['CHN|USA'] = { opinion: -80, atWar: true, escalation: 'conventional', sanctions: false };
  };
  return { engine, world, sats, asat, war };
}

describe('space', () => {
  it('ASAT strikes destroy satellites, create debris, and lower isrFactor', () => {
    const s = spaceWorld();
    s.engine.step(s.world);
    expect(isrFactor(s.world, USA)).toBe(1);
    s.war();
    s.engine.run(s.world, 3);
    expect(s.sats.equipment[id.platform('x_recon')] + s.sats.equipment[id.platform('x_nav')]).toBeLessThan(40);
    expect(s.asat.magazine[id.munition('x_kkv')]).toBeLessThan(8);
    expect(s.world.slices.strategic.debris).toBeGreaterThan(0);
    expect(isrFactor(s.world, USA) < 1 || cepFactor(s.world, USA) > 1).toBe(true);
    expect(isrFactor(s.world, USA)).toBeGreaterThanOrEqual(0.6);
    expect(isrFactor(s.world, CHN)).toBe(1); // no constellation to lose
  });

  it('ASAT launchers hold fire when their nation is not at war with the satellite owner', () => {
    const s = spaceWorld();
    s.engine.run(s.world, 4);
    expect(s.sats.equipment[id.platform('x_recon')]).toBe(10);
    expect(s.asat.magazine[id.munition('x_kkv')]).toBe(8);
  });
});

describe('cyber', () => {
  it('at war, a tier-1 cyber power degrades enemy infrastructure or readiness; at peace nothing changes', () => {
    const t = testWorld([strategic]);
    const target = t.add({ nation: id.nation('IRN'), name: 'IRGC', kind: 'maneuver', echelon: 'division', node: t.nodeAt(35.7, 51.4), equipment: { [id.platform('t_inf')]: 300 } });
    const infra = () => t.map.nodesOf(id.nation('IRN')).reduce((a, n) => a + t.world.theater.infrastructure[n], 0);
    const before = infra();
    t.engine.run(t.world, 20);
    expect(infra()).toBe(before);
    expect(target.readiness).toBe(0.8);
    t.war('USA', 'IRN');
    t.engine.run(t.world, 40);
    expect(infra() < before || target.readiness < 0.8).toBe(true);
    // Modest: ten days of campaigning does not cripple a country.
    expect(infra()).toBeGreaterThan(before * 0.95);
  });
});

describe('performance', () => {
  it('steps a 6,000-formation world well under 50 ms', () => {
    const t = testWorld([strategic]);
    const nations = Object.keys(t.world.nations) as NationId[];
    for (let i = 0; i < 6000; i++) {
      const nation = nations[i % nations.length];
      t.add({ nation, name: `f${i}`, kind: i % 50 === 0 ? 'space' : 'maneuver', echelon: 'brigade', node: (i * 7) % t.map.landCount as NodeId, equipment: { [id.platform('t_mbt')]: 40 } });
    }
    t.war('USA', 'CHN');
    t.war('RUS', 'GBR');
    t.engine.run(t.world, 3);
    const start = performance.now();
    t.engine.run(t.world, 20);
    const ms = (performance.now() - start) / 20;
    console.log(`strategic step: ${ms.toFixed(2)} ms/tick at 6,000 formations`);
    expect(ms).toBeLessThan(50);
  });
});

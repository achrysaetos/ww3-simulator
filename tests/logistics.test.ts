import { describe, expect, it } from 'vitest';
import type { Formation, NodeId } from '../src/core/types';
import { id, testWorld } from '../src/testkit';
import { loadMap } from '../src/data/load';

const MAP = loadMap();
import { logistics, supplyFactor } from '../src/systems/logistics';
import { BEACH_CAPACITY, HOST_SUPPORT, INFRA_REPAIR_FRONT_SHARE, INFRA_REPAIR_PER_DAY, LAST_MILE_CAPACITY, NODE_TONS_PER_DAY } from '../src/systems/logistics/tables';

const PLENTY = { fuel: 1e7, ammo: 1e7, food: 1e7 };
const DAY = 4; // ticks at the default 6 h

function setup() {
  const t = testWorld([logistics]);
  for (const n of Object.values(t.world.nations)) n.bulk = { ...PLENTY };
  const brigade = (nation: string, node: NodeId, extra: Partial<Formation> = {}) =>
    t.add({
      nation: id.nation(nation), name: `${nation} brigade`, kind: 'maneuver', echelon: 'brigade', node,
      equipment: { [id.platform('t_mbt')]: 90, [id.platform('t_ifv')]: 100, [id.platform('t_inf')]: 60 }, ...extra,
    });
  const drain = (f: Formation, frac: number) => {
    for (const c of ['fuel', 'ammo', 'food'] as const) f.supply[c] = f.supplyCapacity[c] * frac;
  };
  const fill = (f: Formation, c: 'fuel' | 'ammo' | 'food') => f.supply[c] / f.supplyCapacity[c];
  return { ...t, brigade, drain, fill };
}

describe('logistics', () => {
  it('fully resupplies a formation deep in rail-rich friendly territory', () => {
    const t = setup();
    const f = t.brigade('POL', t.nodeAt(52.4, 16.9)); // Poznan
    t.drain(f, 0.3);
    t.engine.run(t.world, 2 * DAY);
    expect(supplyFactor(t.world, t.map, f.node, id.nation('POL'))).toBeGreaterThan(0.85);
    expect(t.fill(f, 'fuel')).toBeGreaterThan(0.95);
    expect(t.fill(f, 'ammo')).toBeGreaterThan(0.95);
    expect(t.world.nations[id.nation('POL')].bulk.fuel).toBeLessThan(PLENTY.fuel);
  });

  it('starves a formation 650 km of desert past the railhead', () => {
    const t = setup();
    const north = t.brigade('DZA', t.nodeAt(35.5, 0.5)); // on the coastal rail net
    const deep = t.brigade('DZA', t.nodeAt(27.2, 2.5)); // In Salah; rail ends near 33.5N
    t.drain(north, 0.3);
    t.drain(deep, 0.3);
    t.engine.run(t.world, 2 * DAY);
    const dza = id.nation('DZA');
    expect(supplyFactor(t.world, t.map, deep.node, dza)).toBeLessThan(0.2);
    expect(supplyFactor(t.world, t.map, north.node, dza)).toBeGreaterThan(0.8);
    expect(t.fill(deep, 'ammo')).toBeLessThan(0.45);
    expect(t.fill(north, 'ammo')).toBeGreaterThan(0.95);
  });

  it('gives an encircled formation nothing, so it runs dry', () => {
    const t = setup();
    const pocket = t.nodeAt(49.5, 33.5);
    expect(t.map.airports[pocket]).toBe(0);
    for (const n of t.map.neighbors(pocket)) t.world.control[n] = id.nation('RUS');
    t.war('UKR', 'RUS');
    const f = t.brigade('UKR', pocket);
    const bulkBefore = t.world.nations[id.nation('UKR')].bulk.food;
    const fuelBefore = f.supply.fuel;
    t.engine.run(t.world, 6 * DAY);
    expect(supplyFactor(t.world, t.map, pocket, id.nation('UKR'))).toBe(0);
    expect(f.supply.food).toBe(0);
    expect(f.supply.fuel).toBeLessThan(fuelBefore);
    expect(t.world.nations[id.nation('UKR')].bulk.food).toBe(bulkBefore);
  });

  it('feeds forces fighting in an enemy-held cell across the line from friendly ground, at the last-mile share, but not a spearhead two cells deep', () => {
    const t = setup();
    t.war('RUS', 'UKR');
    const rus = id.nation('RUS');
    const home = t.nodeAt(50.5, 37.5); // Belgorod oblast, beside Kharkiv oblast
    const contested = t.nodeAt(49.5, 36.5); // Kharkiv
    const deep = t.nodeAt(48.5, 34.5); // Dnipro region, no Russian ground next to it
    expect([t.world.control[home], t.world.control[contested], t.world.control[deep]]).toEqual([rus, id.nation('UKR'), id.nation('UKR')]);
    const assault = t.brigade('RUS', contested), spearhead = t.brigade('RUS', deep);
    t.drain(assault, 0.3);
    t.engine.run(t.world, 2 * DAY);
    const across = supplyFactor(t.world, t.map, contested, rus);
    const best = Math.max(...[...t.map.neighbors(contested)].filter((n) => t.world.control[n] === rus).map((n) => supplyFactor(t.world, t.map, n, rus)));
    expect(best).toBeGreaterThan(0);
    expect(across).toBeCloseTo(LAST_MILE_CAPACITY * best, 3);
    expect(t.fill(assault, 'ammo')).toBeGreaterThan(0.31);
    expect(supplyFactor(t.world, t.map, spearhead.node, rus)).toBe(0);
  });

  it('feeds an assault along the line of contact when the enemy outnumbers it in the own cell behind it', () => {
    const t = setup();
    t.war('RUS', 'UKR');
    const rus = id.nation('RUS');
    const contested = t.nodeAt(49.5, 36.5); // Kharkiv
    const behind = [...t.map.neighbors(contested)].filter((n) => n < t.map.landCount && t.world.control[n] === rus);
    expect(behind.length).toBeGreaterThan(0);
    const assault = t.brigade('RUS', contested);
    for (const n of behind) for (let i = 0; i < 3; i++) t.brigade('UKR', n as NodeId);
    t.drain(assault, 0.3);
    t.engine.run(t.world, 2 * DAY);
    const s = t.world.slices.logistics;
    expect(behind.every((n) => s.networks[s.networkOf[rus]].occupied.includes(n))).toBe(true);
    const fedBehind = behind.map((v) =>
      Math.max(0, ...[...t.map.neighbors(v)].filter((w) => w < t.map.landCount && t.world.control[w] === rus && !s.networks[s.networkOf[rus]].occupied.includes(w)).map((w) => supplyFactor(t.world, t.map, w as NodeId, rus))),
    );
    const across = supplyFactor(t.world, t.map, contested, rus);
    expect(across).toBeGreaterThan(0);
    expect(across).toBeCloseTo(LAST_MILE_CAPACITY * LAST_MILE_CAPACITY * Math.max(...fedBehind), 2);
    expect(t.fill(assault, 'ammo')).toBeGreaterThan(0.31);
  });

  it('lets a host nation supply foreign forces based on its ground in peacetime', () => {
    const t = setup();
    const udeid = t.nodeAt(25.12, 51.32);
    expect(t.world.control[udeid]).toBe(id.nation('QAT'));
    const wing = t.brigade('USA', udeid);
    t.drain(wing, 0.3);
    t.engine.run(t.world, 2 * DAY);
    expect(supplyFactor(t.world, t.map, udeid, id.nation('USA'))).toBeCloseTo(HOST_SUPPORT * t.world.theater.infrastructure[udeid], 2);
    expect(t.fill(wing, 'fuel')).toBeGreaterThan(0.31);
  });

  it('lets intruders cut the roads through a cell only while they outnumber its defenders', () => {
    const t = setup();
    t.war('RUS', 'UKR');
    const ukr = id.nation('UKR');
    const cell = t.nodeAt(49.5, 36.5);
    const defenders = [t.brigade('UKR', cell), t.brigade('UKR', cell)];
    const raid = t.brigade('RUS', cell);
    const cut = () => {
      const s = t.world.slices.logistics;
      return s.networks[s.networkOf[ukr]].occupied.includes(cell);
    };
    t.engine.run(t.world, 1);
    expect(cut()).toBe(false);
    expect(supplyFactor(t.world, t.map, cell, ukr)).toBeGreaterThan(0.2);
    defenders[1].status = 'destroyed';
    raid.personnel = 2 * defenders[0].personnel;
    t.engine.run(t.world, 1);
    expect(cut()).toBe(true);
  });

  it('supplies an island base the map lists no port for by sea', () => {
    const t = setup();
    for (const n of ['USA', 'JPN']) t.world.nations[id.nation(n)].blocs = ['us_japan'];
    t.war('USA', 'CHN');
    const amami = t.nodeAt(28.38, 129.49);
    expect(t.map.ports[amami]).toBe(0);
    const marines = t.brigade('USA', amami);
    t.drain(marines, 0.3);
    t.engine.run(t.world, 2 * DAY);
    expect(supplyFactor(t.world, t.map, amami, id.nation('USA'))).toBeGreaterThan(0.05);
    expect(t.fill(marines, 'ammo')).toBeGreaterThan(0.31);
  });

  it('supplies a lodgement on an enemy coast over the beach in step with its sealift, and not once the enemy takes the sea lane', () => {
    const t = setup();
    const chn = id.nation('CHN');
    t.war('CHN', 'TWN');
    const beach = t.nodeAt(23.5, 120.5);
    expect(t.world.control[beach]).toBe(id.nation('TWN'));
    const zone = [...t.map.neighbors(beach)].find((n) => t.map.isSea(n))!;
    const landing = t.brigade('CHN', beach);
    const lift = t.add({ nation: chn, name: 'landing ships', kind: 'surface_group', echelon: 'squadron', node: zone, equipment: { [id.platform('t_lst')]: 10 } });
    t.drain(landing, 0.3);
    t.engine.run(t.world, 2 * DAY);
    const held = supplyFactor(t.world, t.map, beach, chn);
    expect(held).toBeGreaterThan(0.05);
    expect(held).toBeLessThanOrEqual(0.25);
    expect(t.fill(landing, 'ammo')).toBeGreaterThan(0.31);
    lift.equipment[id.platform('t_lst')] = 5;
    t.engine.run(t.world, 1);
    expect(supplyFactor(t.world, t.map, beach, chn)).toBeCloseTo(held / 2, 2);
    for (const n of t.map.nodesWithin(zone, 600)) if (t.map.isSea(n)) t.world.theater.seaControl[n] = { nation: id.nation('TWN'), level: 1 };
    t.engine.run(t.world, 2 * DAY);
    expect(supplyFactor(t.world, t.map, beach, chn)).toBe(0);
  });

  it('weighs sealift by cargo tons, so losing a landing ship costs a lodgement less than losing a ferry', () => {
    const t = setup();
    const chn = id.nation('CHN');
    t.war('CHN', 'TWN');
    const beach = t.nodeAt(23.5, 120.5);
    const zone = [...t.map.neighbors(beach)].find((n) => t.map.isSea(n))!;
    const landing = t.brigade('CHN', beach);
    const lst = id.platform('t_lst'), ferry = id.platform('t_ferry');
    const lift = t.add({ nation: chn, name: 'landing ships', kind: 'surface_group', echelon: 'squadron', node: zone, equipment: { [lst]: 1, [ferry]: 2 } });
    t.drain(landing, 0.3);
    t.engine.run(t.world, 2 * DAY);
    const held = supplyFactor(t.world, t.map, beach, chn);
    expect(held).toBeGreaterThan(0.05);
    // 1,625 t of LST (50 vehicles, 500 troops) beside 10,000 t of ferries: a third of the hulls, a seventh of the tons.
    delete lift.equipment[lst];
    t.engine.run(t.world, 1);
    expect(supplyFactor(t.world, t.map, beach, chn)).toBeCloseTo((held * 10_000) / 11_625, 2);
  });

  it('lands no more over the beach than one beach can take, however many lodgements a nation holds', () => {
    const t = setup();
    t.war('CHN', 'TWN');
    const cells = [t.nodeAt(23.5, 120.5), t.nodeAt(25, 121.5)];
    expect(new Set(cells.map((n) => t.world.control[n]))).toEqual(new Set([id.nation('TWN')]));
    const zone = [...t.map.neighbors(cells[0])].find((n) => t.map.isSea(n))!;
    t.add({ nation: id.nation('CHN'), name: 'landing ships', kind: 'surface_group', echelon: 'squadron', node: zone, equipment: { [id.platform('t_lst')]: 10 } });
    const ashore = cells.flatMap((n) => Array.from({ length: 100 }, () => t.brigade('CHN', n)));
    t.engine.step(t.world);
    for (const n of cells) expect(supplyFactor(t.world, t.map, n, id.nation('CHN'))).toBeGreaterThan(0);
    for (const f of ashore) t.drain(f, 0);
    t.engine.step(t.world);
    const landed = ashore.reduce((a, f) => a + f.supply.fuel + f.supply.ammo + f.supply.food, 0);
    const beach = (NODE_TONS_PER_DAY * BEACH_CAPACITY * t.world.dtHours) / 24;
    expect(landed).toBeGreaterThan(0.9 * beach);
    expect(landed).toBeLessThanOrEqual(beach * 1.001);
  });

  it('cuts an expeditionary force when the enemy takes the sea lanes', () => {
    const t = setup();
    const usa = id.nation('USA');
    const outpost = MAP.nodeAt(66.5, -15.5); // Icelandic port cell held by a US garrison, no airfield
    expect(t.map.ports[outpost]).toBeGreaterThan(0);
    expect(t.map.airports[outpost]).toBe(0);
    t.world.control[outpost] = usa;
    const f = t.brigade('USA', outpost);
    t.engine.step(t.world);
    const open = supplyFactor(t.world, t.map, outpost, usa);
    expect(open).toBeGreaterThan(0.15); // a one-berth port caps it near a third

    t.war('USA', 'RUS');
    for (const n of t.map.nodesWithin(outpost, 2000)) if (t.map.isSea(n)) t.world.theater.seaControl[n] = { nation: id.nation('RUS'), level: 0.95 };
    t.engine.run(t.world, DAY);
    expect(supplyFactor(t.world, t.map, outpost, usa)).toBeLessThan(open * 0.2);
    t.drain(f, 0.3);
    t.engine.run(t.world, 2 * DAY);
    expect(t.fill(f, 'ammo')).toBeLessThan(0.36); // the open route would have refilled it past 0.5
  });

  it('supplies forces abroad through allied depots and ports only when they share a bloc, and by host support otherwise', () => {
    const t = setup();
    const lublin = t.nodeAt(51.2, 22.6);
    const f = t.brigade('USA', lublin);
    t.engine.step(t.world);
    // Outside a bloc only the host feeds them.
    expect(supplyFactor(t.world, t.map, lublin, f.nation)).toBeLessThanOrEqual(HOST_SUPPORT);

    t.world.nations[id.nation('USA')].blocs = ['NATO'];
    t.world.nations[id.nation('POL')].blocs = ['NATO'];
    t.engine.step(t.world);
    expect(supplyFactor(t.world, t.map, lublin, f.nation)).toBeGreaterThan(0.8);
  });

  it('chokes throughput when infrastructure is bombed, then repairs it on friendly ground', () => {
    const t = setup();
    const poznan = t.nodeAt(52.4, 16.9);
    t.brigade('POL', poznan);
    t.engine.step(t.world);
    const intact = supplyFactor(t.world, t.map, poznan, id.nation('POL'));

    const hit = t.map.nodesWithin(poznan, 250);
    for (const n of hit) t.world.theater.infrastructure[n] = 0.15;
    t.engine.run(t.world, DAY);
    const bombed = supplyFactor(t.world, t.map, poznan, id.nation('POL'));
    expect(bombed).toBeLessThan(intact * 0.3);

    t.engine.run(t.world, 10 * DAY);
    expect(t.world.theater.infrastructure[poznan]).toBeGreaterThan(0.4);
    expect(supplyFactor(t.world, t.map, poznan, id.nation('POL'))).toBeGreaterThan(bombed);
  });

  it('repairs infrastructure on the front line at a fraction of the rear rate', () => {
    const t = setup();
    const kharkiv = t.nodeAt(50, 36.2); // borders Russian-held cells
    const lviv = t.nodeAt(49.8, 24);
    t.war('UKR', 'RUS');
    t.world.theater.infrastructure[kharkiv] = t.world.theater.infrastructure[lviv] = 0.2;
    t.engine.run(t.world, 5 * DAY);
    expect(t.world.theater.infrastructure[kharkiv]).toBeCloseTo(0.2 + 5 * INFRA_REPAIR_PER_DAY * INFRA_REPAIR_FRONT_SHARE, 6);
    expect(t.world.theater.infrastructure[lviv]).toBeCloseTo(0.2 + 5 * INFRA_REPAIR_PER_DAY, 6);
  });

  it('drains national bulk stocks and reports a shortage once', () => {
    const t = setup();
    const pol = t.world.nations[id.nation('POL')];
    pol.bulk.fuel = 50;
    const f = t.brigade('POL', t.nodeAt(52.4, 16.9));
    f.supply.fuel = 0;
    const events: string[] = [];
    t.engine.run(t.world, 4, (_, ev) => ev.forEach((e) => e.type === 'shortage' && e.nation === 'POL' && events.push(e.what)));
    expect(pol.bulk.fuel).toBe(0);
    expect(f.supply.fuel).toBeLessThanOrEqual(50);
    expect(f.supply.fuel / f.supplyCapacity.fuel).toBeLessThan(0.05);
    expect(events).toEqual(['fuel']);
  });

  it('burns readiness fuel at each platform\'s own rate whatever formation it is filed under', () => {
    const t = setup();
    t.world.nations[id.nation('POL')].bulk.fuel = 0;
    const lifters = { [id.platform('t_airlifter')]: 10 };
    const wing = (kind: Formation['kind']) => t.add({ nation: id.nation('POL'), name: `POL ${kind} airlift`, kind, echelon: 'wing', node: t.nodeAt(52.4, 16.9), equipment: lifters });
    const filed = [wing('logistics'), wing('strategic')];
    const start = filed.map((f) => f.supply.fuel);
    t.engine.run(t.world, DAY);
    // A strategic airlifter flies about 800 h a year in peacetime (C-17 fleet), at 9 t/h.
    const expected = (10 * 9 * 800) / 365;
    for (const [i, f] of filed.entries()) expect(start[i] - f.supply.fuel).toBeCloseTo(expected, -1);
  });

  it('leaves the fuel of aircraft the air model flies and ships the naval model steams to those models', () => {
    const t = setup();
    t.world.nations[id.nation('POL')].bulk.fuel = 0;
    const at = t.nodeAt(54.4, 18.6); // Gdansk
    const wing = t.add({ nation: id.nation('POL'), name: 'POL fighter wing', kind: 'air_wing', echelon: 'wing', node: at, equipment: { [id.platform('t_fighter')]: 24 } });
    const group = t.add({ nation: id.nation('POL'), name: 'POL destroyers', kind: 'surface_group', echelon: 'task_group', node: at, equipment: { [id.platform('t_destroyer')]: 3 } });
    const full = [wing.supply.fuel, group.supply.fuel];
    t.engine.run(t.world, DAY);
    expect([wing.supply.fuel, group.supply.fuel]).toEqual(full);
  });

  it('returns damaged platforms to service over days when supplied, not when cut off', () => {
    const t = setup();
    const mbt = id.platform('t_mbt');
    const ok = t.brigade('POL', t.nodeAt(52.4, 16.9), { equipment: { [mbt]: 60 }, damaged: { [mbt]: 30 } });
    const pocket = t.nodeAt(49.5, 33.5);
    for (const n of t.map.neighbors(pocket)) t.world.control[n] = id.nation('RUS');
    t.war('UKR', 'RUS');
    const cut = t.brigade('UKR', pocket, { equipment: { [mbt]: 60 }, damaged: { [mbt]: 30 } });
    t.engine.run(t.world, DAY);
    expect(ok.equipment[mbt]).toBeGreaterThan(60);
    expect(ok.equipment[mbt]).toBeLessThan(70);
    t.engine.run(t.world, 20 * DAY);
    expect(ok.equipment[mbt] + (ok.damaged[mbt] ?? 0)).toBe(90);
    expect(ok.damaged[mbt] ?? 0).toBeLessThan(10);
    expect(cut.equipment[mbt]).toBe(60);
    expect(cut.damaged[mbt]).toBe(30);
  });

  it('rebuilds losses from the national stockpile and reserves, never beyond establishment', () => {
    const t = setup();
    const mbt = id.platform('t_mbt');
    const pol = t.world.nations[id.nation('POL')];
    pol.reserves = 100_000;
    const f = t.brigade('POL', t.nodeAt(52.4, 16.9), { equipment: { [mbt]: 100 } });
    t.engine.step(t.world);
    const fullCrew = f.personnel;
    f.equipment[mbt] = 40;
    f.personnel = Math.round(fullCrew * 0.4);
    f.order = { posture: 'reserve', issuedTick: t.world.tick };
    pol.stockpile[mbt] = 1000;
    const reserves = pol.reserves;
    t.engine.run(t.world, 30 * DAY);
    expect(f.equipment[mbt]).toBe(100);
    expect(pol.stockpile[mbt]).toBe(940);
    expect(f.personnel).toBe(fullCrew);
    expect(pol.reserves).toBe(reserves - (fullCrew - Math.round(fullCrew * 0.4)));

    const t2 = setup();
    const g = t2.brigade('POL', t2.nodeAt(52.4, 16.9), { equipment: { [mbt]: 100 } });
    t2.engine.step(t2.world);
    g.equipment[mbt] = 40;
    t2.engine.run(t2.world, 10 * DAY);
    expect(g.equipment[mbt]).toBe(40);
  });

  it('re-forms rifle squads from the troops a formation has, with no stockpile, in step with its manpower', () => {
    const t = setup();
    const inf = id.platform('t_inf');
    const f = t.brigade('POL', t.nodeAt(52.4, 16.9));
    t.engine.step(t.world);
    const full = f.personnel;
    t.world.nations[id.nation('POL')].reserves = 0;
    f.equipment[inf] = 20;
    f.personnel = Math.round(full * 0.5);
    t.engine.run(t.world, 30 * DAY);
    expect(t.world.nations[id.nation('POL')].stockpile[inf] ?? 0).toBe(0);
    expect(f.equipment[inf]).toBe(30);
  });

  it('re-forms a destroyed brigade at its garrison months later from reserves and stockpile, and only then', () => {
    const t = setup();
    const pol = t.world.nations[id.nation('POL')];
    const home = t.nodeAt(52.4, 16.9);
    const mbt = id.platform('t_mbt'), ifv = id.platform('t_ifv'), inf = id.platform('t_inf');
    const f = t.brigade('POL', home);
    t.engine.step(t.world);
    const est = { ...f.equipment }, crew = f.personnel;
    Object.assign(f, { status: 'destroyed', equipment: {}, personnel: 0, node: t.nodeAt(50.5, 23.5) });
    pol.stockpile[mbt] = 200;
    pol.stockpile[ifv] = 60;
    pol.reserves = crew * 2;
    t.engine.run(t.world, 80 * DAY);
    expect(f.status).toBe('destroyed');
    t.engine.run(t.world, 15 * DAY);
    expect(f.status).toBe('active');
    expect(f.node).toBe(home);
    expect(f.equipment[mbt]).toBe(est[mbt]);
    expect(f.equipment[ifv]).toBe(60);
    expect(f.equipment[inf]).toBe(est[inf]);
    expect(pol.stockpile[mbt]).toBe(200 - est[mbt]);
    expect(pol.reserves).toBeLessThanOrEqual(crew);
  });

  it('reloads a warship from the national stockpile in port but not at sea', () => {
    const t = setup();
    const cruise = id.munition('t_cruise');
    const pol = t.world.nations[id.nation('POL')];
    const port = t.nodeAt(54.5, 18.5); // Gdansk/Gdynia
    expect(t.map.ports[port]).toBeGreaterThan(0);
    const sea = [...t.map.neighbors(port)].find((n) => t.map.isSea(n))!;
    const ship = (node: NodeId) => t.add({ nation: id.nation('POL'), name: 'frigate', kind: 'surface_group', echelon: 'squadron', node, equipment: { [id.platform('t_destroyer')]: 1 } });
    const docked = ship(port), afloat = ship(sea);
    docked.magazine[cruise] = afloat.magazine[cruise] = 0;
    pol.stockpile[cruise] = 100;
    t.engine.run(t.world, 4 * DAY);
    expect(docked.magazine[cruise]).toBe(24);
    expect(afloat.magazine[cruise]).toBe(0);
    expect(pol.stockpile[cruise]).toBe(76);
  });

  it('rations a cell shared by many formations', () => {
    const t = setup();
    const node = t.nodeAt(52.4, 16.9);
    const one = t.brigade('POL', node);
    t.drain(one, 0);
    const t2 = setup();
    const crowd = Array.from({ length: 40 }, () => t2.brigade('POL', node));
    crowd.forEach((f) => t2.drain(f, 0));
    t.engine.step(t.world);
    t2.engine.step(t2.world);
    expect(t2.fill(crowd[0], 'fuel')).toBeLessThan(t.fill(one, 'fuel') * 0.8);
  });

  it('is deterministic', () => {
    const run = () => {
      const t = setup();
      t.war('UKR', 'RUS');
      t.brigade('UKR', t.nodeAt(50, 36.2), { damaged: { [id.platform('t_mbt')]: 20 } });
      t.brigade('RUS', t.nodeAt(51, 38));
      t.engine.run(t.world, 12);
      return JSON.stringify(t.world);
    };
    expect(run()).toBe(run());
  });

});

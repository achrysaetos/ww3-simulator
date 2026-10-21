import { describe, expect, it } from 'vitest';
import { relationMut } from '../src/core/engine';
import { Rng } from '../src/core/rng';
import type { Formation, NodeId } from '../src/core/types';
import { applyAirOrder, combatRadiusKm, interceptSalvo, resolveAirBattle } from '../src/systems/air';
import { airWorld, battery, launchers, mid, nation, pid, wing } from './air.fixture';

const USA = nation('USA'), RUS = nation('RUS'), UKR = nation('UKR');
const TAIPEI = [25, 121.5] as const, FUZHOU = [26, 119.3] as const, KYIV = [50.45, 30.5] as const;

const count = (f: Formation) => Object.values(f.equipment).reduce((a, b) => a + b, 0);

describe('air superiority', () => {
  it('stealth fighters beat a 4th-gen force twice their size in BVR', () => {
    const t = airWorld();
    const catalog = t.catalog;
    const flight = (id: string, n: number) => ({ platform: catalog.platform(pid(id)), aircraft: n, aam: catalog.munition(mid('t_aam')), missiles: n * 6, experience: 0.5 });
    let stealthLost = 0, legacyLost = 0, mirrorLost = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const r = resolveAirBattle({ flights: [flight('x_stealth', 20)], awacsKm: 0 }, { flights: [flight('t_fighter', 40)], awacsKm: 0 }, new Rng(seed));
      stealthLost += r.a[0].lost;
      legacyLost += r.b[0].lost;
      const m = resolveAirBattle({ flights: [flight('t_fighter', 20)], awacsKm: 0 }, { flights: [flight('t_fighter', 40)], awacsKm: 0 }, new Rng(seed));
      mirrorLost += m.a[0].lost;
    }
    expect(legacyLost).toBeGreaterThan(stealthLost * 4);
    expect(legacyLost / 30).toBeGreaterThan(25);
    // The same 20 airframes without stealth lose heavily to the larger force.
    expect(mirrorLost).toBeGreaterThan(stealthLost * 3);
  });

  it('a stealth wing wins air control over a larger 4th-gen defense; a 4th-gen wing of the same size does not', () => {
    const run = (attacker: string) => {
      const t = airWorld(7);
      t.war('USA', 'CHN');
      const fz = t.node(...FUZHOU);
      const usa = wing(t, 'USA', t.node(...TAIPEI), { [attacker]: 24 }, { posture: 'air_superiority', target: fz });
      const chn = wing(t, 'CHN', fz, { t_fighter: 48 });
      t.tick();
      return { control: t.world.theater.airControl[fz], usaLost: 24 - count(usa), chnLost: 48 - count(chn), aamLeft: usa.magazine[mid('t_aam')] };
    };
    const stealth = run('x_stealth');
    expect(stealth.control?.nation).toBe(USA);
    expect(stealth.chnLost).toBeGreaterThan(stealth.usaLost * 3);
    expect(stealth.aamLeft).toBeLessThan(24 * 6);
    const legacy = run('t_fighter');
    expect(legacy.control?.nation).not.toBe(USA);
  });

  it('writes air control only where hostile air forces made contact', () => {
    const t = airWorld();
    t.war('USA', 'CHN');
    const wichita = t.node(38, -97), kansas = t.node(40, -100), fz = t.node(...FUZHOU);
    wing(t, 'USA', kansas, { t_fighter: 24 });
    wing(t, 'CHN', fz, { t_fighter: 24 });
    wing(t, 'USA', kansas, { t_fighter: 24 }, { posture: 'air_superiority', target: wichita });
    t.tick();
    expect(t.world.theater.airControl).toEqual({});

    wing(t, 'USA', t.node(...TAIPEI), { x_stealth: 36 }, { posture: 'air_superiority', target: fz });
    t.tick();
    expect(Object.keys(t.world.theater.airControl).map(Number)).toEqual([fz]);
  });

  it('tankers extend combat radius, so a CAP beyond unrefuelled radius only happens with tanker support', () => {
    const t = airWorld();
    const f35 = t.catalog.platform(pid('x_stealth'));
    expect(combatRadiusKm(f35, 0)).toBe(1100);
    expect(combatRadiusKm(f35, 0.25)).toBeCloseTo(1375);
    expect(combatRadiusKm(f35, 10)).toBe(2200);

    const run = (tankers: number) => {
      const w = airWorld(3);
      w.war('USA', 'CHN');
      const fz = w.node(...FUZHOU), busan = w.node(35.5, 127.5);
      expect(w.map.distanceKm(busan, fz)).toBeGreaterThan(1150);
      expect(w.map.distanceKm(busan, fz)).toBeLessThan(1500);
      wing(w, 'USA', busan, { x_stealth: 24 }, { posture: 'air_superiority', target: fz });
      if (tankers) wing(w, 'USA', busan, { x_tanker: tankers });
      const chn = wing(w, 'CHN', fz, { t_fighter: 24 });
      w.tick();
      return 24 - count(chn);
    };
    expect(run(0)).toBe(0);
    expect(run(24)).toBeGreaterThan(0);
  });
});

describe('integrated air defense', () => {
  it('interceptSalvo leaks once a time-on-target salvo exceeds fire-control channels', () => {
    const rng = new Rng(1);
    const ballistic = { speedMach: 7, interceptDifficulty: 0.3 };
    const defense = { channels: 9, interceptors: 200, pk: 0.9, rangeKm: 25 };
    const saturated = interceptSalvo({ ...ballistic, count: 30, arrivalWindowS: 0 }, defense, rng);
    expect(saturated.leaked).toBeGreaterThanOrEqual(21);
    expect(saturated.interceptorsUsed).toBe(18);
    const light = interceptSalvo({ ...ballistic, count: 6, arrivalWindowS: 0 }, defense, rng);
    expect(light.leaked).toBeLessThanOrEqual(1);
    // The same 30 arriving over ten minutes let each channel engage again and again.
    const staggered = interceptSalvo({ ...ballistic, count: 30, arrivalWindowS: 600 }, defense, rng);
    expect(staggered.leaked).toBeLessThanOrEqual(3);
    // Slow drones in a time-on-target salvo still give each channel many engagement cycles.
    const drones = interceptSalvo({ count: 30, speedMach: 0.15, interceptDifficulty: 0.1, arrivalWindowS: 0 }, { ...defense, rangeKm: 50 }, rng);
    expect(drones.leaked).toBeLessThanOrEqual(2);
  });

  it('a SAM site facing more missiles than its magazine can answer leaks the rest into the target', () => {
    const t = airWorld();
    t.war('RUS', 'UKR');
    const kyiv = t.node(...KYIV);
    const ad = battery(t, 'UKR', kyiv, { x_patriot: 1 });
    launchers(t, 'RUS', t.node(53.9, 27.6), { x_mrbm_tel: 200 }, { posture: 'strike', target: kyiv, targetClass: 'structure' });
    const s = t.strikes(t.tick()).find((e) => e.munition === mid('x_mrbm'))!;
    expect(s.fired).toBeGreaterThan(25);
    expect(s.intercepted).toBeGreaterThan(0);
    // 32 PAC-3s fired in 2-round salvos engage at most 16 ballistic missiles.
    expect(s.intercepted).toBeLessThanOrEqual(16);
    expect(ad.magazine[mid('x_pac3')]).toBe(0);
    expect(t.world.theater.infrastructure[kyiv]).toBeLessThan(1);
  });

  it('a strike order left standing after a peace fires nothing at the former enemy or its airfields', () => {
    const t = airWorld();
    t.war('RUS', 'UKR');
    const kyiv = t.node(...KYIV);
    wing(t, 'UKR', kyiv, { t_fighter: 12 });
    const city = launchers(t, 'RUS', t.node(53.9, 27.6), { x_mrbm_tel: 20 }, { posture: 'strike', target: kyiv, targetClass: 'structure' });
    const base = launchers(t, 'RUS', t.node(53.9, 27.6), { x_mrbm_tel: 20 }, { posture: 'strike', target: kyiv, targetClass: 'aircraft' });
    expect(t.strikes(t.tick()).length).toBeGreaterThan(0);
    relationMut(t.world, RUS, UKR).atWar = false;
    const rounds = (f: Formation) => f.magazine[mid('x_mrbm')];
    const before = [rounds(city), rounds(base)], runway = t.world.slices.air?.runway?.[kyiv];
    expect(t.strikes(t.tick(4))).toEqual([]);
    expect([rounds(city), rounds(base)]).toEqual(before);
    expect(t.world.slices.air?.runway?.[kyiv]).toBe(runway);
  });

  it('a strike order whose raids all vanish into the defences stops after two; one that lands keeps striking', () => {
    const raids = (defended: boolean) => {
      const t = airWorld(5);
      t.war('RUS', 'UKR');
      const kyiv = t.node(...KYIV);
      if (defended) battery(t, 'UKR', kyiv, { x_patriot: 6 });
      launchers(t, 'RUS', t.node(53.9, 27.6), { x_cruise_tel: 2 }, { posture: 'strike', target: kyiv, targetClass: 'structure' });
      const s = t.strikes(t.tick(8));
      return s;
    };
    const blocked = raids(true);
    expect(blocked.every((e) => e.intercepted === e.fired)).toBe(true);
    expect(blocked.length).toBe(2);
    expect(raids(false).length).toBeGreaterThan(2);
  });

  it('a raid on the power grid cuts the grid serving the cell and leaves its other infrastructure alone; the grid then mends', () => {
    const t = airWorld(5);
    t.war('RUS', 'UKR');
    const kyiv = t.node(...KYIV);
    const infra = t.world.theater.infrastructure[kyiv];
    launchers(t, 'RUS', t.node(53.9, 27.6), { x_cruise_tel: 4 }, { posture: 'strike', target: kyiv, targetClass: 'power' });
    expect(t.strikes(t.tick()).length).toBeGreaterThan(0);
    const cut = t.world.theater.power?.[kyiv] ?? 1;
    expect(cut).toBeLessThan(0.95);
    expect(t.world.theater.infrastructure[kyiv]).toBe(infra);
    for (const f of Object.values(t.world.formations)) if (f.nation === 'RUS') f.order = { posture: 'defend', issuedTick: t.world.tick };
    t.tick(40);
    expect(t.world.theater.power?.[kyiv] ?? 1).toBeGreaterThan(cut);
  });

  it('runs interceptor stocks down until only the counter-drone belt stops drones', () => {
    const t = airWorld();
    t.war('RUS', 'UKR');
    const kyiv = t.node(...KYIV);
    const ad = battery(t, 'UKR', kyiv, { x_shorad: 1 });
    launchers(t, 'RUS', t.node(53.9, 27.6), { x_drone_rack: 20 }, { posture: 'strike', target: kyiv, targetClass: 'structure' });
    const stock: number[] = [];
    const rate: number[] = [];
    for (let i = 0; i < 8; i++) {
      const s = t.strikes(t.tick());
      stock.push(ad.magazine[mid('x_shorad_msl')]);
      rate.push(s.reduce((a, e) => a + e.intercepted, 0) / s.reduce((a, e) => a + e.fired, 0));
    }
    expect(stock[0]).toBeLessThan(24);
    expect(stock.at(-1)).toBe(0);
    for (let i = 1; i < stock.length; i++) expect(stock[i]).toBeLessThanOrEqual(stock[i - 1]);
    expect(rate[0]).toBeGreaterThan(rate.at(-1)! + 0.1);
    expect(rate.at(-1)).toBeLessThan(0.85);
  });

  it('suppression with anti-radiation missiles lets more of a cruise raid through', () => {
    const run = (sead: boolean) => {
      let leaked = 0, armsFired = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const t = airWorld(seed);
        t.war('USA', 'CHN');
        const fz = t.node(...FUZHOU), tw = t.node(...TAIPEI);
        battery(t, 'CHN', fz, { x_patriot: 1 });
        launchers(t, 'USA', tw, { x_cruise_tel: 80 }, { posture: 'strike', target: fz, targetClass: 'structure' });
        wing(t, 'USA', tw, { x_weasel: 24 }, sead ? { posture: 'strike', target: fz, targetClass: 'soft' } : {});
        for (const e of t.strikes(t.tick())) {
          if (e.munition === mid('t_cruise')) leaked += e.fired - e.intercepted;
          if (e.munition === mid('x_arm')) armsFired += e.fired;
        }
      }
      return { leaked, armsFired };
    };
    const without = run(false), withSead = run(true);
    expect(without.armsFired).toBe(0);
    expect(withSead.armsFired).toBeGreaterThan(0);
    expect(withSead.leaked).toBeGreaterThan(without.leaked * 1.3 + 10);
  });
});

describe('strikes', () => {
  it('a strike on an enemy node lowers its infrastructure; a node held by a nation not at war is untouched', () => {
    const t = airWorld();
    t.war('USA', 'CHN');
    const fz = t.node(...FUZHOU), busan = t.node(37.5, 127);
    const tw = t.node(...TAIPEI);
    launchers(t, 'USA', tw, { x_cruise_tel: 12 }, { posture: 'strike', target: fz, targetClass: 'structure' });
    launchers(t, 'USA', tw, { x_cruise_tel: 12 }, { posture: 'strike', target: busan, targetClass: 'structure' });
    const events = t.strikes(t.tick());
    expect(t.world.theater.infrastructure[fz]).toBeLessThan(0.99);
    expect(t.world.theater.infrastructure[busan]).toBe(1);
    expect(events.find((e) => e.target === fz)?.damage).toMatch(/infrastructure/);
  });

  it('never strikes beyond range: the order is refused and a forced order fires nothing', () => {
    const t = airWorld();
    t.war('RUS', 'UKR');
    const kyiv = t.node(...KYIV), moscow = t.node(55.75, 37.6);
    expect(t.map.distanceKm(moscow, kyiv)).toBeGreaterThan(500);
    const far = launchers(t, 'RUS', moscow, { t_tel: 20 });
    const ctx = t.ctx();
    expect(applyAirOrder(t.world, { type: 'order', nation: RUS, formation: far.id, order: { posture: 'strike', target: kyiv, targetClass: 'structure' } }, ctx)).toBe(true);
    expect(far.order.posture).toBe('defend');
    expect(t.world.events.some((e) => e.type === 'message' && /beyond reach/.test(e.text))).toBe(true);

    far.order = { posture: 'strike', target: kyiv, targetClass: 'structure', issuedTick: 0 };
    const before = far.magazine[mid('t_srbm')];
    expect(t.strikes(t.tick(2))).toEqual([]);
    expect(far.magazine[mid('t_srbm')]).toBe(before);
    expect(t.world.theater.infrastructure[kyiv]).toBe(1);

    const near = launchers(t, 'RUS', t.node(51.5, 31.3), { t_tel: 20 });
    expect(applyAirOrder(t.world, { type: 'order', nation: RUS, formation: near.id, order: { posture: 'strike', target: kyiv, targetClass: 'structure' } }, t.ctx())).toBe(true);
    expect(near.order.posture).toBe('strike');
    expect(t.strikes(t.tick()).length).toBeGreaterThan(0);
  });

  it('a strike aimed at one formation kills in that formation, not in another one sharing its cell', () => {
    const t = airWorld();
    t.war('RUS', 'UKR');
    const cell = t.node(47.5, 35);
    const aimed = launchers(t, 'UKR', cell, { x_cruise_tel: 40 });
    const bystander = launchers(t, 'UKR', cell, { x_mrbm_tel: 40 });
    launchers(t, 'RUS', t.node(46.5, 36.5), { t_tel: 200 }, { posture: 'strike', target: cell, targetClass: 'soft', targetFormation: aimed.id });
    t.tick(4);
    expect(count(aimed)).toBeLessThan(40);
    expect(count(bystander)).toBe(40);
  });

  it('missile strikes on an airbase destroy parked aircraft and crater the runway, cutting sorties', () => {
    const t = airWorld();
    t.war('USA', 'CHN');
    const tw = t.node(...TAIPEI), fz = t.node(...FUZHOU);
    const parked = wing(t, 'USA', tw, { t_fighter: 60 });
    launchers(t, 'CHN', fz, { t_tel: 200 }, { posture: 'strike', target: tw, targetClass: 'aircraft' });
    t.tick();
    expect(count(parked)).toBeLessThan(60);
    expect(Object.values(parked.damaged).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(t.world.slices.air.runway[tw]).toBeLessThan(1);
  });

  it('the same salvo kills a larger share of a packed ramp than of a few dispersed aircraft', () => {
    const lostShare = (n: number) => {
      let lost = 0;
      for (let seed = 1; seed <= 4; seed++) {
        const t = airWorld(seed);
        t.war('USA', 'CHN');
        const tw = t.node(...TAIPEI), fz = t.node(...FUZHOU);
        const parked = wing(t, 'USA', tw, { t_fighter: n });
        launchers(t, 'CHN', fz, { t_tel: 40 }, { posture: 'strike', target: tw, targetClass: 'aircraft' });
        t.tick();
        lost += n - count(parked) + Object.values(parked.damaged).reduce((a, b) => a + b, 0);
      }
      return lost / (4 * n);
    };
    expect(lostShare(200)).toBeGreaterThan(2 * lostShare(10));
  });

  it('applyAirOrder ignores formations it does not own and rebases wings within ferry range', () => {
    const t = airWorld();
    const tank = t.add({ nation: UKR, name: 'tanks', kind: 'maneuver', echelon: 'brigade', node: t.node(...KYIV), equipment: { [pid('t_mbt')]: 30 } });
    expect(applyAirOrder(t.world, { type: 'order', nation: UKR, formation: tank.id, order: { posture: 'attack', target: t.node(50, 36) } }, t.ctx())).toBe(false);
    expect(tank.order.posture).toBe('defend');

    const w = wing(t, 'USA', t.node(...TAIPEI), { t_fighter: 12 });
    const kyushu = t.node(33, 131);
    expect(t.map.isSea(kyushu)).toBe(false);
    applyAirOrder(t.world, { type: 'order', nation: USA, formation: w.id, order: { posture: 'move', target: kyushu } }, t.ctx());
    expect(w.node).toBe(kyushu);
    applyAirOrder(t.world, { type: 'order', nation: USA, formation: w.id, order: { posture: 'move', target: t.node(40, -100) } }, t.ctx());
    expect(w.node).toBe(kyushu);
  });

  it('replays exactly for a seed', () => {
    const run = () => {
      const t = airWorld(11);
      t.war('USA', 'CHN');
      const fz = t.node(...FUZHOU), tw = t.node(...TAIPEI);
      battery(t, 'CHN', fz, { x_patriot: 2, x_shorad: 2 });
      wing(t, 'USA', tw, { x_stealth: 24 }, { posture: 'air_superiority', target: fz });
      wing(t, 'USA', tw, { t_fighter: 24 }, { posture: 'strike', target: fz, targetClass: 'soft' });
      wing(t, 'CHN', fz, { t_fighter: 40 });
      t.tick(5);
      return JSON.stringify(t.world);
    };
    expect(run()).toBe(run());
  });
});


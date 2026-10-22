import { describe, expect, it } from 'vitest';
import { atWar } from '../src/core/engine';
import { COMMAND_DOMAINS, type Formation, type NationId, type NodeId, type Order } from '../src/core/types';
import { createSession, type Session } from '../src/scenarios';
import { cannotDrop } from '../src/systems/land/airborne';
import { airTons, liftTons } from '../src/systems/land/strategic';
import { seaPath } from '../src/systems/naval/movement';

const nation = (n: string) => n as NationId;

/** Steps a session `days` days, handing each tick's events to `on`. */
function runDays(s: Session, days: number, on?: (events: ReturnType<Session['engine']['step']>) => void): void {
  const perDay = Math.round(24 / s.world.dtHours);
  for (let i = 0; i < days * perDay; i++) {
    const events = s.engine.step(s.world);
    on?.(events);
  }
}

const named = (s: Session, name: string | RegExp, by?: string) =>
  Object.values(s.world.formations).find((f) => (!by || f.nation === by) && (typeof name === 'string' ? f.name === name : name.test(f.name)))!;

/** Makes a nation human with every domain delegated, holds `fs` and gives each the order. */
function command(s: Session, by: string, fs: Formation[], order: Omit<Order, 'issuedTick'>): void {
  const n = nation(by);
  s.world.nations[n].controlledBy = 'human';
  for (const domain of COMMAND_DOMAINS) s.world.pending.push({ type: 'delegate', nation: n, domain, ai: true });
  s.world.pending.push({ type: 'hold', nation: n, formations: fs.map((f) => f.id), held: true });
  for (const f of fs) s.world.pending.push({ type: 'order', nation: n, formation: f.id, order });
}

/** Sea km from the zone holding one point to the zone holding another, or -1 with no route. */
function routeKm(s: Session, by: string, from: [number, number], to: [number, number]): number {
  const { map, world } = s;
  const zone = (p: [number, number]) => map.nodesWithin(map.nodeAt(...p), 250).filter((n) => map.isSea(n)).sort((a, b) => map.distanceKm(a, map.nodeAt(...p)) - map.distanceKm(b, map.nodeAt(...p)))[0];
  const a = zone(from), b = zone(to);
  const path = seaPath(world, map, nation(by), a, b);
  if (!path) return -1;
  let km = 0;
  for (let i = 0, at: NodeId = a; i < path.length; at = path[i++]) km += map.distanceKm(at, path[i]);
  return km;
}

describe('straits on the sea map (EX-4, EX-10)', () => {
  // On main Lisbon to Algiers went round Africa (22,406 km) and the Aegean had no sea route to the Black Sea.
  it('ships pass Gibraltar and, at peace, the Turkish Straits', () => {
    const s = createSession('peace-2027', 1);
    expect(routeKm(s, 'USA', [38.7, -9.6], [36.8, 3.1])).toBeLessThan(1600);
    expect(routeKm(s, 'USA', [36.9, -76.3], [32.8, 35.0]), 'Norfolk to Haifa is about 10,000 km by Gibraltar').toBeLessThan(11_000);
    const aegeanToBlackSea = routeKm(s, 'TUR', [37.5, 25.5], [43.5, 31.5]);
    expect(aegeanToBlackSea).toBeGreaterThan(0);
    expect(aegeanToBlackSea).toBeLessThan(1500);
  }, 180_000);

  it('Montreux shuts the Turkish Straits to belligerents Turkey is not fighting beside', () => {
    const s = createSession('ukraine-2026', 1);
    runDays(s, 1);
    expect(atWar(s.world, nation('RUS'), nation('UKR'))).toBe(true);
    expect(routeKm(s, 'RUS', [37.5, 25.5], [43.5, 31.5])).toBe(-1);
    expect(routeKm(s, 'UKR', [37.5, 25.5], [43.5, 31.5])).toBe(-1);
    expect(routeKm(s, 'USA', [37.5, 25.5], [43.5, 31.5])).toBeGreaterThan(0);
  }, 180_000);

  // On main the Chennai zone joined an inland "sea" zone over Kerala, so India's Eastern Fleet crossed the peninsula.
  it('ships from the Bay of Bengal to the Arabian Sea round Sri Lanka', () => {
    const s = createSession('south-asia-2027', 1);
    expect(routeKm(s, 'IND', [13.1, 80.3], [12.9, 74.8]), 'Chennai to Mangaluru is about 1,900 km by sea').toBeGreaterThan(1800);
    expect(routeKm(s, 'IND', [17.7, 83.3], [24.8, 66.9]), 'Vizag to Karachi is about 3,300 km by sea').toBeGreaterThan(3200);
  }, 180_000);
});

describe('airborne forces beyond the big three (EX-1)', () => {
  // On main only 21 US, Russian and Chinese formations carried the flag; an air assault order to any other was refused.
  it('flags the parachute and air-assault brigades of other nations', () => {
    const s = createSession('peace-2027', 1);
    for (const [by, name] of [
      ['GBR', '16 Air Assault Brigade Combat Team'],
      ['FRA', '11e Brigade parachutiste'],
      ['IND', 'Para SF and 50th Parachute Brigade'],
      ['POL', '6th Airborne Brigade'],
      ['JPN', '1st Airborne Brigade'],
      ['ITA', 'Brigata paracadutisti "Folgore"'],
      ['UKR', '79th Separate Air Assault Brigade'],
      ['UKR', '46th Separate Airmobile Brigade'],
      ['USA', '2nd Infantry Brigade Combat Team (Airborne), 11th Airborne Division'],
    ]) expect(named(s, name, by).airborne, name).toBe(true);
  }, 180_000);

  it('the UK, France, India and Japan drop an assault echelon their transports can carry', () => {
    const s = createSession('peace-2027', 1);
    const drops: [string, string, [number, number]][] = [
      ['GBR', '16 Air Assault Brigade Combat Team', [55.9, -4.3]],
      ['FRA', '11e Brigade parachutiste', [48.6, 7.8]],
      ['IND', 'Para SF and 50th Parachute Brigade', [34.2, 77.6]],
      ['JPN', '1st Airborne Brigade', [43.1, 141.3]],
    ];
    for (const [by, name, at] of drops) command(s, by, [named(s, name, by)], { posture: 'air_assault', target: s.map.nodeAt(...at) });
    s.engine.step(s.world);
    for (const [by, name, at] of drops) {
      const down = Object.values(s.world.formations).filter((f) => f.nation === by && f.name.startsWith(name) && f.node === s.map.nodeAt(...at));
      expect(down.length, name).toBe(1);
      expect(down[0].id in s.world.slices.land.airheads, name).toBe(true);
    }
  }, 180_000);
});

describe('one transport fleet for every drop (EX-2)', () => {
  // On main the 11th and 83rd Guards Air Assault Brigades (6,518 t) both dropped on Tallinn in one tick against a
  // 4,240 t two-lift fleet, and a human could drop again the next tick.
  it('Russia cannot drop two brigades on Tallinn in one day on two lifts that carry one and a third', () => {
    const s = createSession('baltic-2027', 1);
    // Russia's own planners fly no other drop first, so the whole fleet is free on day 2.
    command(s, 'RUS', Object.values(s.world.formations).filter((f) => f.nation === 'RUS' && f.airborne), { posture: 'defend' });
    runDays(s, 2);
    const { world, map, catalog } = s;
    const tallinn = map.nodeAt(59.44, 24.75);
    const vdv = ['11th Guards Air Assault Brigade', '83rd Guards Air Assault Brigade'].map((n) => named(s, n, 'RUS'));
    for (const f of vdv) expect(cannotDrop(world, map, catalog, f, tallinn), f.name).toBeUndefined();
    const twoLifts = 2 * liftTons(world, catalog, nation('RUS'));
    expect(vdv.reduce((t, f) => t + airTons(catalog, f), 0)).toBeGreaterThan(twoLifts);
    command(s, 'RUS', vdv, { posture: 'air_assault', target: tallinn });
    s.engine.step(world);
    const down = Object.values(world.formations).filter((f) => f.nation === 'RUS' && f.node === tallinn);
    expect(down.length).toBeGreaterThan(0);
    // What landed is what two lifts carried, less what the defence shot down on the way in.
    expect(down.reduce((t, f) => t + airTons(catalog, f), 0)).toBeLessThanOrEqual(twoLifts);
    const behind = vdv.find((f) => f.node !== tallinn)!;
    expect(cannotDrop(world, map, catalog, behind, tallinn)?.code).toBe('no_lift');
  }, 180_000);
});

describe('strategic airlift into a contested theatre (EX-3)', () => {
  // On main three 82nd Airborne BCTs landed at Taoyuan on days 3, 6 and 9 of the US war while China held the air.
  it('the 82nd does not fly brigade after brigade onto Taiwan under PLA air', () => {
    const s = createSession('taiwan-2027', 1);
    runDays(s, 3);
    s.world.pending.push({ type: 'declare_war', nation: nation('USA'), target: nation('CHN'), reason: 'Taiwan Relations Act' });
    const bcts = ['1st', '2nd', '3rd'].map((i) => named(s, `${i} Brigade Combat Team, 82nd Airborne Division`, 'USA'));
    command(s, 'USA', bcts, { posture: 'move', target: s.map.nodeAt(25.03, 121.56) });
    let landed = 0;
    runDays(s, 14, (events) => {
      for (const e of events) if (e.type === 'message' && bcts.some((f) => e.text === `${f.name} airlifted to the theatre`)) landed++;
    });
    expect(landed).toBeLessThan(3);
  }, 300_000);

  it('the Global Response Force still reaches Poland in about four days', () => {
    const s = createSession('baltic-2027', 1);
    runDays(s, 1);
    const bct = named(s, '1st Brigade Combat Team, 82nd Airborne Division', 'USA');
    const poznan = s.map.nodeAt(52.41, 16.93);
    command(s, 'USA', [bct], { posture: 'move', target: poznan });
    let day = 0;
    for (; day < 8 && s.map.distanceKm(bct.node, poznan) > 400; day++) runDays(s, 1);
    expect(day).toBeLessThanOrEqual(5);
  }, 300_000);
});

describe('forward-based forces redeploy between theatres (EX-5)', () => {
  // On main the 4th Marines on Okinawa had no airfield (Japan's), and the 173rd in Vicenza and 2nd Cavalry in
  // Vilseck had "no land route" to Korea; all three were still at home on day 25.
  it('III MEF from Okinawa and the 173rd from Italy reach Korea; 2nd Cavalry heads for a port', () => {
    const s = createSession('korea-2027', 1);
    runDays(s, 1);
    s.world.pending.push({ type: 'declare_war', nation: nation('USA'), target: nation('PRK'), reason: 'treaty' });
    const pyeongtaek = s.map.nodeAt(36.99, 127.08);
    const fs = ['4th Marine Regiment', '173rd Airborne Brigade', '2nd Cavalry Regiment'].map((n) => named(s, n, 'USA'));
    const home = fs.map((f) => f.node);
    command(s, 'USA', fs, { posture: 'move', target: pyeongtaek });
    runDays(s, 10);
    const [marines, sky, cav] = fs;
    expect(s.map.distanceKm(marines.node, pyeongtaek)).toBeLessThan(250);
    expect(s.map.distanceKm(sky.node, pyeongtaek)).toBeLessThan(250);
    expect(cav.node).not.toBe(home[2]);
    expect(cav.order).toMatchObject({ posture: 'move', target: pyeongtaek, lift: 'sea' });
  }, 300_000);
});

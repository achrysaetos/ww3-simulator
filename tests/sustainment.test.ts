import { describe, expect, it } from 'vitest';
import type { NationId, PlatformId } from '../src/core/types';
import { createSession } from '../src/scenarios';
import { supplyFactor } from '../src/systems/logistics';

/** Steps a session `days` days, handing each tick's events to `on`. */
function runDays(s: ReturnType<typeof createSession>, days: number, on?: (events: ReturnType<typeof s.engine.step>, day: number) => void): void {
  const perDay = Math.round(24 / s.world.dtHours);
  for (let i = 0; i < days * perDay; i++) {
    const events = s.engine.step(s.world);
    on?.(events, i / perDay);
  }
}

describe('peacetime fuel (LE-7)', () => {
  // Peacetime militaries are funded for the fuel they train on. On main 40-odd armies at peace ran their
  // depots dry within 30 days of south-asia-2027, and Pakistan ran short on day 5 of its war.
  it('no army runs out of fuel in the first 30 days of south-asia-2027', () => {
    const s = createSession('south-asia-2027', 1);
    const short: string[] = [];
    runDays(s, 30, (events, day) => {
      for (const e of events) if (e.type === 'shortage' && e.what === 'fuel') short.push(`${e.nation} (${s.world.nations[e.nation].status}) day ${day.toFixed(1)}`);
    });
    expect(short).toEqual([]);
    expect(s.world.nations['PAK' as NationId].status).toBe('war');
  }, 120_000);
});

describe('repair and replenishment at sea (NV-2)', () => {
  // Battle damage needs a yard: on main a mission-killed Burke 4,000 km from Rota was back in the line in ten days.
  it('a damaged destroyer stays damaged at sea and is repaired once its squadron reaches port', () => {
    const s = createSession('peace-2027', 1);
    const { world, map } = s;
    const usa = 'USA' as NationId;
    world.nations[usa].controlledBy = 'human';
    const des = Object.values(world.formations).find((f) => f.name.startsWith('Destroyer Squadron 60'))!;
    const sub = Object.values(world.formations).find((f) => f.name === 'Submarine Squadron 4')!;
    const station = map.nodeAt(43.5, -28.5);
    for (const f of [des, sub]) world.pending.push({ type: 'order', nation: usa, formation: f.id, order: { posture: 'patrol', target: station } });
    runDays(s, 6);
    expect(map.isSea(des.node) && des.node !== des.home).toBe(true);
    const burke = Object.keys(des.equipment)[0] as PlatformId;
    des.equipment[burke] -= 1;
    des.damaged[burke] = 1;
    const subFood: number[] = [];
    runDays(s, 12, (_, day) => {
      if (des.node !== des.home) expect(des.damaged[burke], `day ${day}: repaired at sea`).toBe(1);
      if (sub.node !== sub.home) subFood.push(sub.supply.food);
    });
    expect(subFood.length).toBeGreaterThan(10);
    for (let i = 1; i < subFood.length; i++) expect(subFood[i], 'a submarine is not revictualled at sea').toBeLessThanOrEqual(subFood[i - 1]);

    world.pending.push({ type: 'order', nation: usa, formation: des.id, order: { posture: 'reserve' } });
    runDays(s, 30);
    expect(des.node).toBe(des.home);
    expect(des.damaged[burke] ?? 0).toBe(0);
  }, 120_000);
});

describe('manpower (LE-1, LE-8)', () => {
  // A war footing in force when the scenario opens has already drawn on the reservists: on main Russia at 0.33 and
  // Ukraine at 0.8 recalled ~550k men in 30 days without any order, and both held ~1M idle trained men by day 330.
  it('ukraine-2026: no reservists are recalled without a new call-up, so the replacement pool is only what training turns out', () => {
    const s = createSession('ukraine-2026', 1);
    const opening = Object.fromEntries((['RUS', 'UKR'] as NationId[]).map((n) => [n, s.world.nations[n].reservists]));
    runDays(s, 30);
    for (const id of ['RUS', 'UKR'] as NationId[]) {
      const n = s.world.nations[id], e = s.world.slices.economy.nations[id];
      expect(n.reservists, id).toBe(opening[id]);
      expect(n.reserves, id).toBeLessThanOrEqual(e.recruited);
      expect(n.reserves, id).toBeLessThan(50_000);
    }
  }, 120_000);

  // Men under arms leave the labour force: on main the USA at mobilization 0.98 kept GDP at 1.000 with 9.6M called up.
  it('peace-2027: a USA ordered to full mobilization loses output to the men it takes, a nation at peace does not', () => {
    const s = createSession('peace-2027', 1);
    const usa = 'USA' as NationId;
    s.world.nations[usa].controlledBy = 'human';
    s.world.pending.push({ type: 'delegate', nation: usa, domain: 'homefront', ai: false }, { type: 'set_mobilization', nation: usa, level: 1 });
    runDays(s, 60);
    const e = s.world.slices.economy.nations;
    expect(e[usa].recruited).toBeGreaterThan(1_000_000);
    expect(e[usa].gdpIndex).toBeLessThan(0.995);
    expect(e['POL' as NationId].gdpIndex).toBeCloseTo(1, 3);
  }, 120_000);
});

describe('raising formations (LE-2)', () => {
  // On main mobilised men never became new units on a player's order: no command could raise one.
  it('peace-2027: a raise_formation order takes men and kit now and fields a brigade after training', () => {
    const s = createSession('peace-2027', 1);
    const { world } = s;
    const pol = 'POL' as NationId;
    const nation = world.nations[pol];
    nation.controlledBy = 'human';
    world.pending.push({ type: 'delegate', nation: pol, domain: 'homefront', ai: false });
    runDays(s, 1);
    const before = new Set(Object.keys(world.formations));
    // War stocks of every platform Poland fields, as a mobilised war economy would hold.
    for (const f of Object.values(world.formations)) if (f.nation === pol) for (const pid in f.equipment) nation.stockpile[pid as PlatformId] = 1_000;
    const stock = Object.values(nation.stockpile).reduce((a, n) => a + n, 0);
    nation.reserves = 20_000;
    const brigades = Object.values(world.formations).filter((f) => f.nation === pol && f.kind === 'maneuver' && f.echelon === 'brigade');
    const template = brigades.reduce((a, b) => (Object.keys(b.equipment).length > Object.keys(a.equipment).length ? b : a));
    world.pending.push({ type: 'raise_formation', nation: pol, template: template.id });
    runDays(s, 1);
    const drawn = 20_000 - nation.reserves;
    expect(drawn).toBeGreaterThan(2_000);
    expect(Object.values(nation.stockpile).reduce((a, n) => a + n, 0)).toBeLessThan(stock);
    const fresh = () => Object.values(world.formations).filter((f) => !before.has(f.id));
    runDays(s, 85);
    expect(fresh()).toEqual([]);
    runDays(s, 6);
    expect(fresh().map((f) => [f.nation, f.kind, f.personnel, f.node])).toEqual([[pol, 'maneuver', drawn, nation.capital]]);
  }, 120_000);
});

describe('end of the supply line (LE-3)', () => {
  // Kyiv axis, 2022: Russia could not run trains on the Ukrainian rail it overran and stalled ~100 km past its
  // Belarusian railheads (RUSI, Operation Z). On main a corridor 350 km deep was fed as well as the border cell.
  it('ukraine-2026: a corridor seized from the Belarus border to 49N is fed by road, thinning with depth, for weeks', () => {
    const s = createSession('ukraine-2026', 1);
    const { world, map } = s;
    const rus = 'RUS' as NationId;
    runDays(s, 1);
    const spine = [51.9, 51.1, 50.3, 49.5, 49.0].map((lat) => map.nodeAt(lat, 30.3));
    const band = new Set<number>();
    for (const n of spine) {
      band.add(n);
      for (const v of map.neighbors(n)) if (!map.isSea(v) && map.owner[v] !== 'BLR') band.add(v);
    }
    const hold = () => { for (const n of band) world.control[n] = rus; };
    hold();
    const template = Object.values(world.formations).find((f) => f.nation === rus && f.kind === 'maneuver')!;
    for (const n of spine) world.formations[`corridor${n}` as never] = { ...structuredClone(template), id: `corridor${n}` as never, node: n as never, home: n as never };
    const border = spine[0], deep = spine[spine.length - 1];
    const deepSupply: number[] = [];
    for (let week = 1; week <= 4; week++) {
      for (let d = 0; d < 7; d++) { runDays(s, 1); hold(); }
      deepSupply.push(supplyFactor(world, map, deep, rus));
    }
    for (const phi of deepSupply) expect(phi).toBeLessThan(0.3);
    expect(supplyFactor(world, map, border, rus)).toBeGreaterThan(2 * deepSupply[3]);
  }, 120_000);
});

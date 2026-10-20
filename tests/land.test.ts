import { describe, expect, it } from 'vitest';
import { platformCount } from '../src/core/forces';
import type { Formation, NodeId, Order, PlatformId, SimEvent } from '../src/core/types';
import { applyLandOrder, combatPower, landCombat, landMovement, terrainDefense } from '../src/systems/land';
import { id, testWorld } from '../src/testkit';

const RUS = id.nation('RUS'), UKR = id.nation('UKR'), KAZ = id.nation('KAZ');
// Real map cells: Donbas plain (UKR) with a Russian plain cell next door; Kharkiv-area hills (UKR) beside a Russian urban cell.
const PLAIN_UKR = 6557 as NodeId, PLAIN_RUS = 6766 as NodeId;
const HILLS_UKR = 6128 as NodeId, URBAN_RUS = 6129 as NodeId;

const brigade = (k = 1): Record<PlatformId, number> => ({
  [id.platform('t_mbt')]: Math.round(90 * k),
  [id.platform('t_ifv')]: Math.round(130 * k),
  [id.platform('t_inf')]: Math.round(120 * k),
  [id.platform('t_spg')]: Math.round(18 * k),
});

function setup(seed = 1) {
  const t = testWorld([landMovement, landCombat], seed);
  t.war('RUS', 'UKR');
  const events: SimEvent[] = [];
  const order = (f: Formation, o: Omit<Order, 'issuedTick'>) => applyLandOrder(t.world, { type: 'order', nation: f.nation, formation: f.id, order: o }, t.engine.context(t.world));
  const days = (n: number) => t.engine.run(t.world, Math.round((n * 24) / t.world.dtHours), (_w, ev) => events.push(...ev));
  return { ...t, events, order, days };
}

function assault(opts: { ratio: number; defNode: NodeId; attNode: NodeId; entrench: number; seed?: number; days: number; before?: (s: ReturnType<typeof setup>, att: Formation, def: Formation) => void }) {
  const s = setup(opts.seed);
  const def = s.add({ nation: UKR, name: 'def', kind: 'maneuver', echelon: 'brigade', node: opts.defNode, equipment: brigade(1), entrenchment: opts.entrench });
  const att = s.add({ nation: RUS, name: 'att', kind: 'maneuver', echelon: 'brigade', node: opts.attNode, equipment: brigade(opts.ratio) });
  opts.before?.(s, att, def);
  const att0 = platformCount(att), def0 = platformCount(def);
  s.order(att, { posture: 'attack', target: opts.defNode });
  s.days(opts.days);
  return { ...s, att, def, attLoss: 1 - platformCount(att) / att0, defLoss: 1 - platformCount(def) / def0 };
}

describe('land combat', () => {
  it('an entrenched brigade on hills holds against an equal attacker', () => {
    for (const seed of [1, 2, 3]) {
      const r = assault({ ratio: 1, defNode: HILLS_UKR, attNode: URBAN_RUS, entrench: 1, days: 7, seed });
      expect(r.world.control[HILLS_UKR]).toBe(UKR);
      expect(r.def.node).toBe(HILLS_UKR);
      expect(r.def.status).toBe('active');
      expect(r.attLoss).toBeGreaterThan(2 * r.defLoss);
      expect(r.events.some((e) => e.type === 'battle' && e.node === HILLS_UKR)).toBe(true);
    }
  });

  it('a 4:1 attacker breaks a defender on plains within days and takes the ground', () => {
    const r = assault({ ratio: 4, defNode: PLAIN_UKR, attNode: PLAIN_RUS, entrench: 0.4, days: 6 });
    expect(r.world.control[PLAIN_UKR]).toBe(RUS);
    expect(r.att.node).toBe(PLAIN_UKR);
    expect(r.def.node).not.toBe(PLAIN_UKR);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'node_captured', node: PLAIN_UKR, from: UKR, to: RUS }));
    // Attacker losses stay in the 1-3%/day band of intense assaults; the defender bleeds several times faster.
    expect(r.attLoss).toBeGreaterThan(0.005);
    expect(r.attLoss).toBeLessThan(0.15);
    expect(r.defLoss).toBeGreaterThan(2 * r.attLoss);
  });

  it('splits losses into destroyed and damaged and reports them in battle events', () => {
    const r = assault({ ratio: 3, defNode: PLAIN_UKR, attNode: PLAIN_RUS, entrench: 1, days: 2 });
    const damaged = Object.values(r.def.damaged).reduce((a, b) => a + b, 0);
    expect(damaged).toBeGreaterThan(0);
    const reported = r.events
      .filter((e): e is Extract<SimEvent, { type: 'battle' }> => e.type === 'battle')
      .reduce((sum, e) => sum + Object.values(e.losses[UKR] ?? {}).reduce((a, b) => a + b, 0), 0);
    expect(reported).toBe(platformCount({ ...r.def, equipment: brigade(1) }) - platformCount(r.def));
    expect(damaged).toBeLessThan(reported);
  });

  it('consumes ammunition and fuel in combat, and an unsupplied defender fights worse', () => {
    const supplied = assault({ ratio: 3, defNode: PLAIN_UKR, attNode: PLAIN_RUS, entrench: 1, days: 2 });
    expect(supplied.def.supply.ammo).toBeLessThan(supplied.def.supplyCapacity.ammo);
    expect(supplied.def.supply.fuel).toBeLessThan(supplied.def.supplyCapacity.fuel);
    const dry = assault({ ratio: 3, defNode: PLAIN_UKR, attNode: PLAIN_RUS, entrench: 1, days: 2, before: (_s, _a, def) => (def.supply.ammo = 0) });
    expect(dry.attLoss).toBeLessThan(supplied.attLoss * 0.3);
  });

  it('air control decides an even fight', () => {
    const withAir = (nation: typeof RUS) =>
      assault({ ratio: 1, defNode: PLAIN_UKR, attNode: PLAIN_RUS, entrench: 0, days: 7, before: (s) => (s.world.theater.airControl[PLAIN_UKR] = { nation, level: 1 }) });
    const rusAir = withAir(RUS), ukrAir = withAir(UKR);
    expect(rusAir.world.control[PLAIN_UKR]).toBe(RUS);
    expect(ukrAir.world.control[PLAIN_UKR]).toBe(UKR);
    expect(ukrAir.att.order.posture).toBe('defend');
    expect(rusAir.defLoss).toBeGreaterThan(rusAir.attLoss);
    expect(ukrAir.attLoss).toBeGreaterThan(3 * ukrAir.defLoss);
  });

  it('artillery in an adjacent node adds to the defence', () => {
    const attLoss = (arty: boolean) =>
      [1, 2, 3].reduce((sum, seed) => sum + assault({
        ratio: 3, defNode: PLAIN_UKR, attNode: PLAIN_RUS, entrench: 1, days: 3, seed,
        before: (s) => void (arty && s.add({ nation: UKR, name: 'arty', kind: 'artillery', echelon: 'brigade', node: 6556 as NodeId, equipment: { [id.platform('t_spg')]: 72 } })),
      }).attLoss, 0);
    expect(attLoss(true)).toBeGreaterThan(attLoss(false) * 1.25);
  });

  it('is deterministic for a seed', () => {
    const run = () => {
      const r = assault({ ratio: 3, defNode: PLAIN_UKR, attNode: PLAIN_RUS, entrench: 0.5, days: 5, seed: 9 });
      return JSON.stringify({ f: r.world.formations, c: r.world.control.slice(6000, 7000), e: r.events });
    };
    expect(run()).toBe(run());
  });

  it('combatPower weighs firepower against the target mix and terrainDefense ranks terrain', () => {
    const s = setup();
    const f = s.add({ nation: UKR, name: 'tanks', kind: 'maneuver', echelon: 'brigade', node: PLAIN_UKR, equipment: { [id.platform('t_mbt')]: 10 } });
    expect(combatPower(f, s.catalog, { armor: 1 })).toBeGreaterThan(0);
    f.supply.ammo = 0;
    const dry = combatPower(f, s.catalog, { armor: 1 });
    f.supply.ammo = f.supplyCapacity.ammo;
    expect(dry).toBeLessThan(combatPower(f, s.catalog, { armor: 1 }) * 0.1);
    expect(combatPower(f, s.catalog, { aircraft: 1 })).toBe(0);
    expect(terrainDefense('mountain')).toBeGreaterThan(terrainDefense('hills'));
    expect(terrainDefense('hills')).toBeGreaterThan(terrainDefense('plain'));
  });
});

describe('land movement', () => {
  it('capturing undefended enemy ground flips control along the route', () => {
    const s = setup();
    const f = s.add({ nation: RUS, name: 'raid', kind: 'maneuver', echelon: 'brigade', node: PLAIN_RUS, equipment: brigade(1) });
    const target = s.nodeAt(48.5, 35.5);
    s.order(f, { posture: 'move', target });
    const path = [...f.order.path!];
    expect(path.length).toBeGreaterThan(1);
    s.days(10);
    expect(f.node).toBe(target);
    for (const n of path) expect(s.world.control[n]).toBe(RUS);
    expect(s.events.filter((e) => e.type === 'node_captured')).toHaveLength(path.filter((n) => s.map.owner[n] === UKR).length);
    expect(f.order.posture).toBe('defend');
  });

  it('support formations cannot push into enemy-held ground', () => {
    const s = setup();
    const f = s.add({ nation: RUS, name: 'trucks', kind: 'logistics', echelon: 'brigade', node: PLAIN_RUS, equipment: { [id.platform('t_ifv')]: 10 } });
    s.order(f, { posture: 'move', target: PLAIN_UKR });
    expect(f.order.path).toBeUndefined();
    s.days(3);
    expect(f.node).toBe(PLAIN_RUS);
    expect(s.world.control[PLAIN_UKR]).toBe(UKR);
  });

  it('will not enter a neutral country, but allies grant passage', () => {
    const s = setup();
    const from = 5935 as NodeId, kaz = 6153 as NodeId;
    const f = s.add({ nation: RUS, name: 'x', kind: 'maneuver', echelon: 'brigade', node: from, equipment: brigade(1) });
    s.order(f, { posture: 'move', target: kaz });
    s.days(3);
    expect(f.node).toBe(from);
    expect(s.world.control[kaz]).toBe(KAZ);

    s.world.nations[RUS].blocs = ['CSTO'];
    s.world.nations[KAZ].blocs = ['CSTO'];
    s.order(f, { posture: 'move', target: kaz });
    s.days(3);
    expect(f.node).toBe(kaz);
    expect(s.world.control[kaz]).toBe(KAZ);
    expect(s.events.some((e) => e.type === 'node_captured')).toBe(false);
  });

  it('halts at an enemy-held node when only ordered to move', () => {
    const s = setup();
    s.add({ nation: UKR, name: 'def', kind: 'maneuver', echelon: 'brigade', node: PLAIN_UKR, equipment: brigade(1) });
    const f = s.add({ nation: RUS, name: 'x', kind: 'maneuver', echelon: 'brigade', node: PLAIN_RUS, equipment: brigade(1) });
    s.order(f, { posture: 'move', target: PLAIN_UKR });
    s.days(3);
    expect(f.node).toBe(PLAIN_RUS);
    expect(s.events.some((e) => e.type === 'battle')).toBe(false);
  });

  it('moves faster by rail through intact friendly infrastructure, and crawls without fuel', () => {
    const ticksToArrive = (prep: (s: ReturnType<typeof setup>, f: Formation) => void) => {
      const s = setup();
      const f = s.add({ nation: RUS, name: 'x', kind: 'maneuver', echelon: 'brigade', node: s.nodeAt(55.75, 37.6), equipment: brigade(1) });
      prep(s, f);
      s.order(f, { posture: 'move', target: s.nodeAt(51.7, 39.2) });
      for (let i = 1; i <= 200; i++) {
        s.engine.step(s.world);
        if (!f.order.path) return i;
      }
      return Infinity;
    };
    const rail = ticksToArrive(() => {});
    const wrecked = ticksToArrive((s) => s.world.theater.infrastructure.fill(0));
    const dry = ticksToArrive((_s, f) => (f.supply.fuel = 0));
    expect(rail).toBeLessThan(wrecked);
    expect(dry).toBeGreaterThan(wrecked * 3);
  });

  it('enemy air control slows movement', () => {
    const arrive = (air: boolean) => {
      const s = setup();
      const f = s.add({ nation: RUS, name: 'x', kind: 'maneuver', echelon: 'brigade', node: PLAIN_RUS, equipment: brigade(1) });
      s.order(f, { posture: 'move', target: s.nodeAt(48.5, 35.5) });
      if (air) for (let n = 0; n < s.map.landCount; n++) s.world.theater.airControl[n] = { nation: UKR, level: 1 };
      s.days(2);
      return s.map.distanceKm(PLAIN_RUS, f.node);
    };
    expect(arrive(true)).toBeLessThan(arrive(false));
  });
});

describe('encirclement', () => {
  it('cuts off a pocket from supply and it surrenders over time; a connected unit does not', () => {
    const s = setup();
    const pocket = 5043 as NodeId;
    s.world.control[pocket] = UKR;
    const trapped = s.add({ nation: UKR, name: 'pocket', kind: 'maneuver', echelon: 'brigade', node: pocket, equipment: brigade(1) });
    const home = s.add({ nation: UKR, name: 'home', kind: 'maneuver', echelon: 'brigade', node: PLAIN_UKR, equipment: brigade(1) });
    s.days(2);
    expect(s.world.slices.land.isolatedDays[trapped.id]).toBeGreaterThan(0);
    expect(s.world.slices.land.isolatedDays[home.id]).toBeUndefined();
    s.days(60);
    expect(trapped.status).toBe('destroyed');
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'formation_destroyed', formation: trapped.id }));
    expect(home.status).toBe('active');
  });
});

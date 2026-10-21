import { describe, expect, it } from 'vitest';
import type { Formation, NodeId, Order } from '../src/core/types';
import { createAi } from '../src/systems/ai';
import { applyLandOrder, landCombat, landMovement, landSlice } from '../src/systems/land';
import { logistics } from '../src/systems/logistics';
import { createOrderRouter } from '../src/systems/orders';
import { id, testWorld } from '../src/testkit';
import { posturesOf } from '../src/ui/FormationPanel';

const N = id.nation, P = id.platform, Node = id.node;
type T = ReturnType<typeof testWorld>;

const BELGOROD = [50.6, 36.6] as const, KHARKIV = [49.99, 36.23] as const, POLTAVA = [49.6, 34.55] as const;

/** Russia and Ukraine at war, a Russian airborne brigade at an airfield near Belgorod with a transport wing behind it. */
function setup(systems = [landMovement]) {
  const t = testWorld(systems);
  t.war('RUS', 'UKR');
  const airfield = nearestAirfield(t, t.nodeAt(...BELGOROD), 'RUS');
  t.add({ nation: N('RUS'), name: 'Transport aviation', kind: 'logistics', echelon: 'wing', node: airfield, equipment: { [P('t_airlifter')]: 60 } });
  const paras = t.add({ nation: N('RUS'), name: 'Guards airborne brigade', kind: 'maneuver', echelon: 'brigade', node: airfield, equipment: { [P('t_inf')]: 100 }, airborne: true });
  const messages: string[] = [];
  const ctx = { ...t.engine.context(t.world), emit: (e: { type: string; text?: string }) => { if (e.type === 'message' && e.text) messages.push(e.text); } };
  const order = (f: Formation, o: Omit<Order, 'issuedTick'>) => applyLandOrder(t.world, { type: 'order', nation: f.nation, formation: f.id, order: o }, ctx);
  const airOver = (node: NodeId, nation: string) => { t.world.theater.airControl[node] = { nation: N(nation), level: 1 }; };
  const day = () => t.engine.run(t.world, Math.round(24 / t.world.dtHours));
  return { ...t, airfield, paras, messages, order, airOver, day };
}

function nearestAirfield(t: T, near: NodeId, nation: string): NodeId {
  let best = Node(-1), bestKm = Infinity;
  for (let i = 0; i < t.map.landCount; i++) {
    const n = Node(i);
    if (!t.map.airports[n] || t.world.control[n] !== N(nation)) continue;
    const km = t.map.distanceKm(n, near);
    if (km < bestKm) [best, bestKm] = [n, km];
  }
  return best;
}

describe('airborne insertion', () => {
  it('lands an airborne brigade on a cell under friendly air in one lift, losing only a few per cent', () => {
    const t = setup();
    const target = t.nodeAt(...KHARKIV);
    t.airOver(target, 'RUS');
    t.order(t.paras, { posture: 'air_assault', target });

    expect(t.paras.node).toBe(target);
    expect(t.paras.equipment[P('t_inf')]).toBeGreaterThanOrEqual(95);
    expect(t.paras.order).toMatchObject({ posture: 'attack', target });
    expect(t.paras.supply.ammo).toBeLessThanOrEqual(t.paras.supplyCapacity.ammo * 0.5);
    expect(t.messages.some((m) => m.includes('inserted by air'))).toBe(true);
  });

  it('pays for a drop into enemy air defence', () => {
    const t = setup();
    const target = t.nodeAt(...KHARKIV);
    t.airOver(target, 'RUS');
    t.add({ nation: N('UKR'), name: 'SAM brigade', kind: 'air_defense', echelon: 'brigade', node: target, equipment: { [P('t_sam_bn')]: 24 } });
    t.order(t.paras, { posture: 'air_assault', target });

    expect(t.paras.node).toBe(target);
    expect(t.paras.equipment[P('t_inf')]).toBeLessThan(60);
  });

  it('refuses a drop where the enemy holds the air, beyond the transports’ reach, on neutral ground, or by a unit not trained for it', () => {
    const t = setup();
    const contested = t.nodeAt(...KHARKIV);
    t.airOver(contested, 'UKR');
    t.order(t.paras, { posture: 'air_assault', target: contested });
    expect(t.paras.node).toBe(t.airfield);

    const far = t.nodeAt(48.5, -2.5);
    t.world.control[far] = N('UKR');
    t.airOver(far, 'RUS');
    t.order(t.paras, { posture: 'air_assault', target: far });
    expect(t.paras.node).toBe(t.airfield);

    const neutral = t.nodeAt(52.2, 21.0);
    t.airOver(neutral, 'RUS');
    t.order(t.paras, { posture: 'air_assault', target: neutral });
    expect(t.paras.node).toBe(t.airfield);

    const legs = t.add({ nation: N('RUS'), name: 'Motor rifle brigade', kind: 'maneuver', echelon: 'brigade', node: t.airfield, equipment: { [P('t_inf')]: 100 } });
    t.airOver(t.nodeAt(...POLTAVA), 'RUS');
    t.order(legs, { posture: 'air_assault', target: t.nodeAt(...POLTAVA) });
    expect(legs.node).toBe(t.airfield);
    expect(t.messages.filter((m) => m.includes('cannot be inserted by air'))).toHaveLength(4);
  });

  it('flies into a sky nobody fought over only when no enemy fighter squadron can reach it', () => {
    const open = setup();
    open.order(open.paras, { posture: 'air_assault', target: open.nodeAt(...POLTAVA) });
    expect(open.paras.node).toBe(open.nodeAt(...POLTAVA));

    const covered = setup();
    covered.add({ nation: N('UKR'), name: 'Tactical aviation brigade', kind: 'air_wing', echelon: 'wing', node: covered.nodeAt(50.45, 30.52), equipment: { [P('t_fighter')]: 24 } });
    covered.order(covered.paras, { posture: 'air_assault', target: covered.nodeAt(...POLTAVA) });
    expect(covered.paras.node).toBe(covered.airfield);
  });

  it('keeps an airhead alive on air drops only while it holds the air above it', () => {
    const t = setup();
    const target = t.nodeAt(...POLTAVA);
    t.airOver(target, 'RUS');
    t.order(t.paras, { posture: 'air_assault', target });
    t.paras.order = { posture: 'defend', issuedTick: t.world.tick };
    t.paras.supply.food = 0;
    t.day();
    const fed = t.paras.supply.food;
    expect(fed).toBeGreaterThan(t.paras.supplyCapacity.food * 0.2);
    expect(landSlice(t.world).airheads[t.paras.id]).toBeDefined();

    t.airOver(target, 'UKR');
    t.day();
    expect(t.paras.supply.food).toBeLessThanOrEqual(fed);
  });

  it('is not a starving pocket while it is fed by air, and becomes one when the air is lost', () => {
    const t = setup([landMovement, landCombat, logistics]);
    const target = t.nodeAt(...POLTAVA);
    t.order(t.paras, { posture: 'air_assault', target });
    t.paras.order = { posture: 'defend', issuedTick: t.world.tick };
    for (let d = 0; d < 10; d++) t.day();
    expect(t.paras.status).toBe('active');
    expect(landSlice(t.world).isolatedDays[t.paras.id]).toBeUndefined();

    t.add({ nation: N('UKR'), name: 'Tactical aviation brigade', kind: 'air_wing', echelon: 'wing', node: t.nodeAt(50.45, 30.52), equipment: { [P('t_fighter')]: 24 } });
    for (let d = 0; d < 3; d++) t.day();
    expect(landSlice(t.world).isolatedDays[t.paras.id]).toBeGreaterThan(0);
  });

  it('ends the airhead once ground supply reaches it', () => {
    const t = setup([landMovement, logistics]);
    const target = t.nodeAt(...BELGOROD);
    t.airOver(target, 'RUS');
    t.order(t.paras, { posture: 'air_assault', target });
    expect(landSlice(t.world).airheads[t.paras.id]).toBeDefined();
    t.day();
    expect(landSlice(t.world).airheads[t.paras.id]).toBeUndefined();
  });
});

describe('airborne planning', () => {
  it('drops one airborne brigade on the lightly held airfield ahead of its own ground attack, and only one a month', () => {
    const t = setup([createOrderRouter([applyLandOrder]), landMovement, createAi()]);
    const target = t.nodeAt(...KHARKIV);
    const second = t.add({ nation: N('RUS'), name: 'Second airborne brigade', kind: 'maneuver', echelon: 'brigade', node: t.airfield, equipment: { [P('t_inf')]: 100 }, airborne: true });
    for (let i = 0; i < t.map.landCount; i++) if (t.map.distanceKm(Node(i), target) < 400) t.airOver(Node(i), 'RUS');
    t.add({ nation: N('RUS'), name: 'Tank army', kind: 'maneuver', echelon: 'division', node: t.nodeAt(...BELGOROD), equipment: { [P('t_mbt')]: 300, [P('t_ifv')]: 300, [P('t_inf')]: 200 } });
    t.add({ nation: N('UKR'), name: 'Kharkiv garrison', kind: 'maneuver', echelon: 'brigade', node: target, equipment: { [P('t_inf')]: 20 } });
    for (let d = 0; d < 10; d++) t.day();
    const dropped = [t.paras, second].filter((f) => landSlice(t.world).airheads[f.id] !== undefined);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].node).toBe(target);
  });

  it('holds its airborne troops back while the ground thrust is not winning, rather than drop them beyond relief', () => {
    const t = setup([createOrderRouter([applyLandOrder]), landMovement, createAi()]);
    const target = t.nodeAt(...KHARKIV);
    for (let i = 0; i < t.map.landCount; i++) if (t.map.distanceKm(Node(i), target) < 400) t.airOver(Node(i), 'RUS');
    t.add({ nation: N('RUS'), name: 'Combined arms army', kind: 'maneuver', echelon: 'division', node: t.nodeAt(...BELGOROD), equipment: { [P('t_mbt')]: 60, [P('t_ifv')]: 80, [P('t_inf')]: 120 } });
    // Every Ukrainian cell on the border is held by a brigade the player keeps in place; the depth behind is empty.
    const line = [];
    for (let i = 0; i < t.map.landCount; i++)
      if (t.world.control[i] === N('UKR') && [...t.map.neighbors(Node(i))].some((m) => t.world.control[m] === N('RUS')))
        line.push(t.add({ nation: N('UKR'), name: 'Defence brigade', kind: 'maneuver', echelon: 'brigade', node: Node(i), equipment: { [P('t_mbt')]: 30, [P('t_ifv')]: 40, [P('t_inf')]: 60 } }).id);
    t.world.nations[N('UKR')].controlledBy = 'human';
    t.world.pending.push({ type: 'hold', nation: N('UKR'), formations: line, held: true });
    for (let d = 0; d < 10; d++) t.day();
    expect(landSlice(t.world).airheads).toEqual({});
  });
});

describe('player orders', () => {
  it('offers an air assault to airborne formations only', () => {
    const t = setup();
    const legs = t.add({ nation: N('RUS'), name: 'Motor rifle brigade', kind: 'maneuver', echelon: 'brigade', node: t.airfield, equipment: { [P('t_inf')]: 100 } });
    expect(posturesOf(t.paras)).toContain('air_assault');
    expect(posturesOf(legs)).not.toContain('air_assault');
  });
});

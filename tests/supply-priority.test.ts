import { describe, expect, it } from 'vitest';
import type { Formation, NodeId } from '../src/core/types';
import { id, testWorld } from '../src/testkit';
import { logistics, priorityEffect, priorityScale } from '../src/systems/logistics';
import { PRIORITY_BOOST, PRIORITY_DIVERT } from '../src/systems/logistics/tables';

const tonsOf = (f: Formation) => f.supply.fuel + f.supply.ammo + f.supply.food;

describe('priorityScale', () => {
  const total = (ceiling: number[], here: number[], rest: number[]) => {
    const m = priorityScale(ceiling, here, rest);
    return here.reduce((t, i) => t + ceiling[i] * m.here, 0) + rest.reduce((t, i) => t + ceiling[i] * m.rest, 0);
  };

  it('moves push capacity to the sector without changing the total', () => {
    const ceiling = [100, 300, 600];
    const m = priorityScale(ceiling, [0], [1, 2]);
    expect(m.here).toBeCloseTo(PRIORITY_BOOST);
    expect(m.rest).toBeCloseTo(1 - 100 / 900);
    expect(total(ceiling, [0], [1, 2])).toBeCloseTo(1000);
  });

  it('takes at most PRIORITY_DIVERT of the rest, and nothing when there is no rest or no sector', () => {
    const m = priorityScale([1000, 100], [0], [1]);
    expect(m.rest).toBeCloseTo(1 - PRIORITY_DIVERT);
    expect(m.here).toBeCloseTo(1 + (PRIORITY_DIVERT * 100) / 1000);
    expect(total([1000, 100], [0], [1])).toBeCloseTo(1100);
    expect(priorityScale([100], [0], [])).toEqual({ here: 1, rest: 1 });
    expect(priorityScale([100], [], [0])).toEqual({ here: 1, rest: 1 });
  });
});

describe('supply_priority', () => {
  function setup() {
    const t = testWorld([logistics]);
    const pol = id.nation('POL');
    t.world.nations[pol].bulk = { fuel: 1e7, ammo: 1e7, food: 1e7 };
    const brigade = (node: NodeId) =>
      t.add({ nation: pol, name: 'POL brigade', kind: 'maneuver', echelon: 'brigade', node, equipment: { [id.platform('t_mbt')]: 90, [id.platform('t_ifv')]: 100, [id.platform('t_inf')]: 60 } });
    const east = brigade(t.nodeAt(51.2, 22.6)); // Lublin
    const west = brigade(t.nodeAt(52.4, 16.9)); // Poznan
    for (const f of [east, west]) for (const c of ['fuel', 'ammo', 'food'] as const) f.supply[c] = f.supplyCapacity[c] * 0.2;
    return { t, pol, east, west };
  }

  it('fills the priority sector faster and the rest slower, out of the same deliveries', () => {
    const base = setup();
    base.t.engine.step(base.t.world);
    const prio = setup();
    prio.t.world.pending.push({ type: 'supply_priority', nation: prio.pol, node: prio.east.node });
    prio.t.engine.step(prio.t.world);
    expect(prio.t.world.slices.logistics.priority[prio.pol]).toBe(prio.east.node);
    expect(tonsOf(prio.east)).toBeGreaterThan(tonsOf(base.east) * 1.05);
    expect(tonsOf(prio.west)).toBeLessThan(tonsOf(base.west) * 0.95);
    expect(tonsOf(prio.east) + tonsOf(prio.west)).toBeCloseTo(tonsOf(base.east) + tonsOf(base.west), 3);
    expect(prio.t.world.nations[prio.pol].bulk.fuel).toBeCloseTo(base.t.world.nations[base.pol].bulk.fuel, 3);
  });

  it('sends the sector the lift units elsewhere leave idle', () => {
    const base = setup();
    for (const c of ['fuel', 'ammo', 'food'] as const) base.west.supply[c] = base.west.supplyCapacity[c];
    base.t.engine.step(base.t.world);
    const prio = setup();
    for (const c of ['fuel', 'ammo', 'food'] as const) prio.west.supply[c] = prio.west.supplyCapacity[c];
    prio.t.world.pending.push({ type: 'supply_priority', nation: prio.pol, node: prio.east.node });
    prio.t.engine.step(prio.t.world);
    expect(tonsOf(prio.east)).toBeGreaterThan(tonsOf(base.east) * 1.05);
  });

  it('predicts the move it makes, and clears with null', () => {
    const { t, pol, east } = setup();
    t.engine.step(t.world);
    const e = priorityEffect(t.world, t.map, pol, east.node);
    expect(e).toMatchObject({ here: 1, rest: 1 });
    expect(e.after).toBeGreaterThan(e.before);
    expect(e.short).toBeGreaterThan(e.after);
    expect(e.restCut).toBeCloseTo(PRIORITY_DIVERT);
    t.world.pending.push({ type: 'supply_priority', nation: pol, node: east.node });
    t.engine.step(t.world);
    t.world.pending.push({ type: 'supply_priority', nation: pol, node: null });
    t.engine.step(t.world);
    expect(t.world.slices.logistics.priority[pol]).toBeUndefined();
  });

  it('refuses a cell the nation does not hold', () => {
    const { t, pol } = setup();
    t.world.pending.push({ type: 'supply_priority', nation: pol, node: t.nodeAt(50.45, 30.5) });
    t.engine.step(t.world);
    expect(t.world.slices.logistics.priority[pol]).toBeUndefined();
    expect(t.world.events.some((e) => e.type === 'message' && /cannot give supply priority/.test(e.text))).toBe(true);
  });
});

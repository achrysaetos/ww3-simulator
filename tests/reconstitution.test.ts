import { describe, expect, it } from 'vitest';
import { Engine } from '../src/core/engine';
import type { FormationId, NationId, PlatformId } from '../src/core/types';
import { createSession } from '../src/scenarios';
import { economy } from '../src/systems/economy';
import { logistics } from '../src/systems/logistics';
import { RECONSTITUTE_AIR_DAYS, RECONSTITUTE_NAVAL_DAYS } from '../src/systems/logistics/tables';

const USA = 'USA' as NationId;

/**
 * peace-2027 with only industry and logistics stepping, a day a tick: a US formation is destroyed on day 0,
 * and the run reports the day it is back in the field (null if never) and the day its kind's first new
 * platform left the line into the stockpile.
 */
function destroyAndWait(formation: string, platform: string, days: number, setup: (line: { carry: number } | undefined, s: ReturnType<typeof createSession>) => void = () => {}) {
  const s = createSession('peace-2027', 1);
  s.world.dtHours = 24;
  const engine = new Engine(s.map, s.catalog, [economy, logistics]);
  const id = formation as FormationId, pid = platform as PlatformId;
  engine.step(s.world);
  const f = s.world.formations[id];
  // One hull or one squadron of one type, so a single delivery decides when it can come back.
  const est = s.world.slices.logistics.establishment[id];
  est.equipment = { [pid]: est.equipment[pid] } as Record<PlatformId, number>;
  setup(s.world.slices.economy.nations[USA].lines[pid], s);
  // Crews on hand, so only the work-up and the line decide the return.
  s.world.nations[USA].reserves = 10_000;
  f.status = 'destroyed';
  f.equipment = {};
  let back: number | null = null, delivered: number | null = null;
  for (let d = 1; d <= days && back === null; d++) {
    engine.step(s.world);
    if (delivered === null && (s.world.slices.economy.nations[USA].delivered[pid] ?? 0) > 0) delivered = d;
    if (f.status !== 'destroyed') back = d;
  }
  return { back, delivered, f, stock: s.world.nations[USA].stockpile[pid] ?? 0, need: est.equipment[pid] };
}

describe('ships and air wings come back only through production', () => {
  it('a sunk Virginia-class boat returns once the yard delivers a new hull, never before', () => {
    const r = destroyAndWait('f267', 'virginia', 500);
    expect(r.delivered, 'the yard delivers a hull (~1 every 10 months, 2025 rate)').not.toBeNull();
    expect(r.delivered!).toBeGreaterThan(RECONSTITUTE_NAVAL_DAYS());
    expect(r.back).toBe(r.delivered);
    expect(r.f.equipment).toEqual({ virginia: 1 });
    expect(r.stock).toBe(0);
  }, 120_000);

  it('a hull already off the line still waits out the crew work-up', () => {
    const r = destroyAndWait('f267', 'virginia', 300, (line) => (line!.carry = 0.99));
    expect(r.delivered!).toBeLessThan(5);
    // Logistics marks the loss on the day after it happens.
    expect(r.back).toBe(RECONSTITUTE_NAVAL_DAYS() + 1);
  }, 120_000);

  it('with no line building its class, a sunk boat never returns', () => {
    const r = destroyAndWait('f267', 'virginia', 400, (_, s) => delete s.world.slices.economy.nations[USA].lines.virginia);
    expect(r.delivered).toBeNull();
    expect(r.back).toBeNull();
  }, 120_000);

  it('a destroyed F-35A wing returns after its work-up, on airframes the line built since', () => {
    const r = destroyAndWait('f180', 'f35a', 200);
    expect(r.delivered!).toBeLessThan(RECONSTITUTE_AIR_DAYS());
    expect(r.back).toBe(RECONSTITUTE_AIR_DAYS() + 1);
    // Half its 20 airframes at least, all of them new: no airframes were warehoused at the start.
    expect(r.f.equipment.f35a).toBeGreaterThanOrEqual(10);
    expect(r.f.equipment.f35a).toBeLessThanOrEqual(r.need);
  }, 120_000);
});

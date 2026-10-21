import { describe, expect, it } from 'vitest';
import type { Formation, NationId, PlatformId } from '../src/core/types';
import { createSession } from '../src/scenarios';

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

export type { Formation };

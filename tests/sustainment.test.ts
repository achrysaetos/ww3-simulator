import { describe, expect, it } from 'vitest';
import type { NationId } from '../src/core/types';
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

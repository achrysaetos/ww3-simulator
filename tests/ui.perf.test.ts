import { serialize } from 'node:v8';
import { describe, expect, it } from 'vitest';
import type { NationId } from '../src/core/types';
import { createSession } from '../src/scenarios';
import { SnapshotEncoder } from '../src/ui/snapshot';

/**
 * Per-tick wire cost with the full World War III world. v8.serialize is the
 * structured-clone format postMessage uses, so its length is what crosses the
 * worker boundary each tick.
 */
describe('snapshot size, ww3-2027', () => {
  it('stays under 60 KB per tick with ~2,500 formations and the player nation in focus', () => {
    const s = createSession('ww3-2027', 1);
    const enc = new SnapshotEncoder(s.map.nationIds, s.catalog, s.map.size);
    const focus = { nation: 'USA' as NationId };
    const first = serialize(enc.encode(s.world, s.map, focus)).length;
    const perTick: number[] = [];
    for (let i = 0; i < 6; i++) {
      enc.collect(s.engine.step(s.world));
      perTick.push(serialize(enc.encode(s.world, s.map, focus)).length);
    }
    const formations = Object.keys(s.world.formations).length;
    console.log(`formations ${formations}; first snapshot ${first} B; per tick ${perTick.join(', ')} B`);
    expect(formations).toBeGreaterThan(2_000);
    for (const b of perTick) expect(b).toBeLessThan(60_000);
  }, 120_000);
});

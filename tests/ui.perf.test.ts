import { serialize } from 'node:v8';
import { describe, expect, it } from 'vitest';
import type { NationId } from '../src/core/types';
import { createSession } from '../src/scenarios';
import { ControlMask, OverlayRaster, relations } from '../src/ui/map/situation';
import { applySnapshot, emptyClientState, SnapshotEncoder } from '../src/ui/snapshot';

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

/**
 * The map's share of applying a tick on the main thread: repainting and smoothing the control mask and
 * the overlay raster where the snapshot changed them. The GPU redraw that follows covers only what these
 * report, so their size bounds it too.
 */
describe('tick repaint, ww3-2027', () => {
  it('repaints the control mask and overlay in under 25 ms over six ticks once the war is under way', () => {
    const s = createSession('ww3-2027', 1);
    const ids = s.map.nationIds as readonly NationId[];
    const enc = new SnapshotEncoder(s.map.nationIds, s.catalog, s.map.size);
    const focus = { nation: 'USA' as NationId };
    const state = emptyClientState(s.map.size);
    const mask = new ControlMask(s.map, ids), overlay = new OverlayRaster(s.map);
    const repaint = () => {
      const rel = relations(ids, state.wars, 'USA');
      const t = performance.now();
      mask.update(state.control, rel, state.contest);
      overlay.paint({ air: null, sea: null, infra: state.infra, fallout: state.fallout, weather: null }, rel);
      return performance.now() - t;
    };
    applySnapshot(state, enc.encode(s.world, s.map, focus), ids, new Map());
    repaint();
    const perTick: number[] = [];
    for (let i = 0; i < 8; i++) {
      enc.collect(s.engine.step(s.world));
      applySnapshot(state, enc.encode(s.world, s.map, focus), ids, new Map());
      perTick.push(repaint());
    }
    console.log(`tick repaint ms ${perTick.map((m) => m.toFixed(1)).join(', ')}`);
    // The first ticks declare the war and repaint whole countries; after them the front moves cell by cell.
    expect(perTick.slice(2).reduce((a, b) => a + b, 0)).toBeLessThan(25);
  }, 120_000);
});

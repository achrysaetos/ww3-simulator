import { describe, expect, it } from 'vitest';
import { snapshotFront } from '../../src/forecast/metrics';
import type { NationId, NodeId } from '../../src/core/types';
import { createSession } from '../../src/scenarios';
import { cellDepthKm } from '../../src/systems/land/state';
import { groundKm2On } from '../../src/validation/cases/measure';
import type { CaseRun } from '../../src/validation/types';

describe('groundKm2On', () => {
  it('counts a cell taken and then mostly pushed back across as the sliver still held', () => {
    const { world, map } = createSession('ukraine-2026', 1);
    const sudzha = map.nodeAt(51.19, 35.27) as NodeId;
    const start = snapshotFront(world);
    const area = (2 * map.halfDeg[sudzha] * 111.32) ** 2 * Math.cos((map.lat[sudzha] * Math.PI) / 180);
    world.control[sudzha] = 'UKR' as NationId;
    world.slices.land.contest[sudzha] = { by: 'RUS' as NationId, km: 0.9 * cellDepthKm(map, sudzha) };
    const run = { map, start, end: world, days: 21 } as unknown as CaseRun;
    expect(groundKm2On(run, 'UKR', 'RUS')).toBeCloseTo(0.1 * area, 0);
    delete world.slices.land.contest[sudzha];
    expect(groundKm2On(run, 'UKR', 'RUS')).toBeCloseTo(area, 0);
  }, 120_000);
});

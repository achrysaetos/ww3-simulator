import { describe, expect, it } from 'vitest';
import type { NationId } from '../../src/core/types';
import { parseValidateArgs } from '../../src/cli/validate-args';
import { runJobs } from '../../src/validation/ensemble';
import { runCase } from '../../src/validation/run';
import { CASES, caseById } from '../../src/validation/cases';

describe('validation cases', () => {
  it('at least four cases are not tuned on as a whole, and each says what it was tuned on and how it is represented', () => {
    expect(CASES.filter((c) => c.provenance !== 'tuned-on').length).toBeGreaterThanOrEqual(4);
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
    for (const c of CASES) {
      expect(c.contamination.length, c.id).toBeGreaterThan(20);
      expect(c.representation.length, c.id).toBeGreaterThan(20);
    }
  });

  it('every question cites a source for its observed range and has a baseline', () => {
    for (const c of CASES) {
      expect(new Set(c.questions.map((q) => q.id)).size, c.id).toBe(c.questions.length);
      expect(c.questions.filter((q) => (q.provenance ?? c.provenance) !== 'tuned-on').length, c.id).toBeGreaterThan(0);
      for (const q of c.questions) {
        expect(q.observed.lo, `${c.id}/${q.id}`).toBeLessThanOrEqual(q.observed.hi);
        expect(q.observed.sources.length, `${c.id}/${q.id}`).toBeGreaterThan(0);
        expect(q.baseline.label.length, `${c.id}/${q.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('karabakh-2020 opens on the 1994 line: five cells Armenian-held, defenders dug in on them, Azerbaijan declaring war', () => {
    const { world, map } = caseById('karabakh-2020').setup(1);
    const held = Array.from({ length: map.landCount }, (_, n) => n).filter((n) => map.owner[n] === 'AZE' && world.control[n] === 'ARM');
    expect(held.length).toBe(5);
    for (const name of ['1st Army Corps', '2nd Army Corps', '4th Army Corps', '5th Army Corps']) {
      const f = Object.values(world.formations).find((x) => x.nation === 'ARM' && x.name === name)!;
      expect(held, name).toContain(f.node);
      expect(f.entrenchment).toBe(1);
    }
    expect(world.startDate).toBe('2020-09-27T00:00:00Z');
    expect(world.pending).toContainEqual(expect.objectContaining({ type: 'declare_war', nation: 'AZE', target: 'ARM' }));
  });

  it('kursk-2024 opens with the border cleared of the 2025 Russian units and six Ukrainian brigades ordered across', () => {
    const { world, map } = caseById('kursk-2024').setup(1);
    const sudzha = map.nodeAt(51.19, 35.27);
    const near = Object.values(world.formations).filter((f) => f.nation === 'RUS' && f.kind === 'maneuver' && f.node < map.landCount && map.distanceKm(sudzha, f.node) <= 60);
    expect(near).toEqual([]);
    const orders = world.pending.filter((c) => c.type === 'order' && c.nation === ('UKR' as NationId) && c.byPlayer && c.order.posture === 'attack');
    expect(orders.length).toBe(6);
    expect(world.nations['UKR' as NationId].controlledBy).toBe('human');
    expect(world.slices.land.fortified[sudzha] ?? 0).toBe(0);
  });

  it('a case run is deterministic, and the worker pool gives what a serial run gives', async () => {
    const spec = { seed: 3, params: { 'land.ATTRITION_KM_PER_DAY': 0.2 } };
    const serial = runCase('sindoor-2025', spec);
    const [pooled] = await runJobs([{ caseId: 'sindoor-2025', spec }], { workers: 1 });
    expect(pooled).toEqual(serial);
    expect(Object.keys(serial.values).sort()).toEqual(caseById('sindoor-2025').questions.map((q) => q.id).sort());
  }, 300_000);
});

describe('validate CLI flags', () => {
  it('defaults to every case, 8 runs, seeds 1-4 and the tagged sweep', () => {
    expect(parseValidateArgs([])).toEqual({ cases: CASES.map((c) => c.id), runs: 8, seeds: [1, 2, 3, 4], sweep: 'tagged', workers: undefined, json: false });
  });

  it('rejects an unknown case, a bad sweep and a flag without a value', () => {
    expect(() => parseValidateArgs(['--cases', 'stalingrad-1942'])).toThrow(/unknown case stalingrad-1942/);
    expect(() => parseValidateArgs(['--sweep', 'all'])).toThrow(/tagged or none/);
    expect(() => parseValidateArgs(['--runs'])).toThrow(/needs a value/);
  });
});

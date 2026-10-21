import { describe, expect, it } from 'vitest';
import { createSession } from '../src/scenarios';
import { jsonViolations, resumeRun, saveRun } from '../src/scenarios/save';

describe('save and resume', () => {
  it('flags values JSON would not give back', () => {
    const bad = jsonViolations({ a: new Set([1]), b: [1, undefined], c: { d: NaN, e: new Float64Array(2), f: undefined }, g: () => 0 });
    expect(bad).toEqual(['world.a: Set instance', 'world.b[1]: undefined', 'world.c.d: NaN', 'world.c.e: Float64Array instance', 'world.g: function']);
  });

  it('keeps every slice of a running war plain JSON', () => {
    const s = createSession('ukraine-2026', 1);
    s.engine.run(s.world, 8);
    expect(Object.keys(s.world.slices).length).toBeGreaterThanOrEqual(8);
    for (const [name, slice] of Object.entries(s.world.slices)) expect(jsonViolations(slice, `slices.${name}`)).toEqual([]);
    expect(jsonViolations(s.world)).toEqual([]);
  }, 300_000);

  // Saved at tick `at`, resumed in a fresh World, and stepped `then` more ticks, a run
  // must match the uninterrupted one exactly, or replays and resumed games drift.
  it.each([
    ['ukraine-2026', 8, 8],
    ['ww3-2027', 4, 6],
  ])('resumes %s saved at tick %i and matches the uninterrupted run %i ticks on', (scenario, at, then) => {
    const s = createSession(scenario, 1);
    s.engine.run(s.world, at);
    const saved = saveRun(scenario, s.world);
    const before = JSON.stringify(s.world);
    let battles = 0;
    s.engine.run(s.world, then, (_, events) => (battles += events.filter((e) => e.type === 'battle').length));

    const r = resumeRun(saved);
    expect(r.world).not.toBe(s.world);
    expect(r.world.tick).toBe(at);
    r.engine.run(r.world, then);

    expect(battles).toBeGreaterThan(0);
    expect(JSON.stringify(s.world)).not.toBe(before);
    expect(r.world.tick).toBe(at + then);
    expect(JSON.stringify(r.world)).toBe(JSON.stringify(s.world));
  }, 300_000);

  it('refuses a file that is not a save, or comes from another format version', () => {
    expect(() => resumeRun('{"world":{}}')).toThrow('not a ww3 save file');
    expect(() => resumeRun('{"format":"ww3-save","version":99}')).toThrow('version 99');
  });

  describe('refuses a save whose world is broken', () => {
    const good = JSON.parse(saveRun('peace-2027', createSession('peace-2027', 1).world));
    const broken = (edit: (w: Record<string, any>) => void) => {
      const save = structuredClone(good);
      edit(save.world);
      return JSON.stringify(save);
    };
    it.each<[string, (w: Record<string, any>) => void, string]>([
      ['no slices', (w) => delete w.slices, 'world.slices'],
      ['string dtHours', (w) => (w.dtHours = '6'), 'world.dtHours'],
      ['negative tick', (w) => (w.tick = -1), 'world.tick'],
      ['no formations', (w) => delete w.formations, 'world.formations'],
      ['control not an array', (w) => (w.control = {}), 'world.control'],
      ['bad start date', (w) => (w.startDate = 'soon'), 'world.startDate'],
    ])('%s', (_, edit, message) => {
      expect(() => resumeRun(broken(edit))).toThrow(message);
    });
    it('not JSON at all', () => {
      expect(() => resumeRun('{oops')).toThrow('not valid JSON');
    });
    it('still accepts the unbroken save', () => {
      expect(resumeRun(JSON.stringify(good)).world.tick).toBe(0);
    });
  });
});

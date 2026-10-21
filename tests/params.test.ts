import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { paramDef, paramRegistry, withParams } from '../src/core/params';
import type { SimEvent } from '../src/core/types';
import { alliances, strategicProfile } from '../src/data/nations';
import { createSession } from '../src/scenarios';
import { resumeRun, saveRun } from '../src/scenarios/save';
import { warTreaties } from '../src/systems';
import { KILL_ZONE_COMMIT } from '../src/systems/land/tables';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sources(p) : p.endsWith('.ts') ? [p] : [];
  });
}

const casualties = (events: SimEvent[]) =>
  events.reduce((sum, e) => sum + (e.type === 'battle' ? Object.values(e.casualties).reduce((a, b) => a + b, 0) : 0), 0);

describe('param registry', () => {
  it('registers every param written in the source once, each with a range around its default and a source', () => {
    const written = sources('src')
      .filter((f) => !f.endsWith('core/params.ts'))
      .reduce((n, f) => n + (readFileSync(f, 'utf8').match(/\b(defineParam|tableParam)\(\{/g)?.length ?? 0), 0);
    const defs = paramRegistry();
    expect(written).toBeGreaterThan(50);
    expect(defs.length).toBe(written);
    expect(new Set(defs.map((d) => d.id)).size).toBe(defs.length);
    for (const d of defs) {
      expect(d.range[0], d.id).toBeLessThan(d.range[1]);
      expect(d.value, d.id).toBeGreaterThanOrEqual(d.range[0]);
      expect(d.value, d.id).toBeLessThanOrEqual(d.range[1]);
      expect(d.source.length, d.id).toBeGreaterThan(10);
    }
  });

  it('tags the knobs issue #2 asks to sweep', () => {
    for (const id of [
      'diplomacy.RELIABILITY_LOGIT', 'land.KILL_ZONE_COMMIT', 'land.DIRECT_DENSITY_EXP',
      'economy.ENERGY_GDP_ELASTICITY', 'economy.FOOD_GDP_ELASTICITY', 'economy.IMPORT_GDP_LOSS', 'economy.ENERGY_BILL_SHARE',
      'ai.ATTACK_RATIO', 'land.DELIBERATE_ASSAULT_RATIO', 'ai.MAX_DRIVE_CELLS', 'land.ATTRITION_KM_PER_DAY', 'land.ATTRITION_MAX_KM_PER_DAY',
    ])
      expect(paramDef(id), id).toBeDefined();
  });

  it('applies overrides only inside withParams, and restores them when the body throws', () => {
    expect(KILL_ZONE_COMMIT()).toBe(0.3);
    expect(withParams({ 'land.KILL_ZONE_COMMIT': 0.5 }, () => KILL_ZONE_COMMIT())).toBe(0.5);
    expect(() => withParams({ 'land.KILL_ZONE_COMMIT': 0.5 }, () => { throw new Error('boom'); })).toThrow('boom');
    expect(KILL_ZONE_COMMIT()).toBe(0.3);
    expect(() => withParams({ 'land.NO_SUCH_KNOB': 1 }, () => 0)).toThrow('unknown param land.NO_SUCH_KNOB');
    expect(KILL_ZONE_COMMIT()).toBe(0.3);
  });

  it('keeps the outer overrides for a body with none of its own, and restores them after a nested set', () => {
    withParams({ 'land.KILL_ZONE_COMMIT': 0.5 }, () => {
      expect(withParams(undefined, () => KILL_ZONE_COMMIT())).toBe(0.5);
      expect(withParams({ 'land.KILL_ZONE_COMMIT': 0.2 }, () => KILL_ZONE_COMMIT())).toBe(0.2);
      expect(KILL_ZONE_COMMIT()).toBe(0.5);
    });
  });

  it('reads RELIABILITY_LOGIT when diplomacy asks, so a run override reaches treaties built at load', () => {
    const nato = warTreaties(alliances, strategicProfile).find((t) => t.id.toLowerCase().includes('nato'))!;
    const [member] = Object.entries(nato.members).filter(([n]) => Math.abs((strategicProfile[n]?.allianceReliability ?? 0.5) - 0.5) > 0.1).map(([, m]) => m);
    const at = (logit: number) => withParams({ 'diplomacy.RELIABILITY_LOGIT': logit }, () => [member.reliability, member.delayDays]);
    expect(at(2)[0]).not.toBe(at(6)[0]);
    expect(withParams(undefined, () => member.reliability)).toBe(at(4)[0]);
  });
});

describe('params in a running world (ukraine-2026)', () => {
  const OVERRIDE = { 'land.KILL_ZONE_COMMIT': 0.6, 'land.ENGAGED_HOURS_PER_DAY': 2.5 };

  it('changes the outcome of a run, and replays exactly after save and resume', () => {
    const plain = createSession('ukraine-2026', 1);
    let plainCas = 0;
    plain.engine.run(plain.world, 12, (_, ev) => (plainCas += casualties(ev)));

    const s = createSession('ukraine-2026', 1);
    s.world.params = { ...OVERRIDE };
    let cas = 0;
    s.engine.run(s.world, 6, (_, ev) => (cas += casualties(ev)));
    const saved = saveRun('ukraine-2026', s.world);
    s.engine.run(s.world, 6, (_, ev) => (cas += casualties(ev)));
    expect(cas).not.toBe(plainCas);

    const r = resumeRun(saved);
    expect(r.world.params).toEqual(OVERRIDE);
    r.engine.run(r.world, 6);
    expect(JSON.stringify(r.world)).toBe(JSON.stringify(s.world));
  }, 300_000);

  it('does not leak one world\'s overrides into another stepped alongside it', () => {
    const alone = createSession('ukraine-2026', 2);
    alone.engine.run(alone.world, 6);

    const a = createSession('ukraine-2026', 2);
    const b = createSession('ukraine-2026', 2);
    b.world.params = { ...OVERRIDE };
    for (let i = 0; i < 6; i++) {
      b.engine.step(b.world);
      a.engine.step(a.world);
    }
    expect(JSON.stringify(a.world)).toBe(JSON.stringify(alone.world));
    expect(JSON.stringify({ ...b.world, params: undefined })).not.toBe(JSON.stringify(alone.world));
  }, 300_000);
});

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { atWar, Engine, enemiesOf, hostility, setAtWar, setSanctions, type System } from '../src/core/engine';
import { id, testWorld } from '../src/testkit';

const USA = id.nation('USA'), CHN = id.nation('CHN'), RUS = id.nation('RUS');

describe('hostility index', () => {
  it('shows a war declared mid-tick to the systems that run after it', () => {
    const seen: Record<string, unknown> = {};
    const before: System = { id: 'before', step: (w) => void (seen.before = atWar(w, USA, CHN)) };
    const declare: System = { id: 'declare', step: (w) => void setAtWar(w, CHN, USA, true) };
    const after: System = {
      id: 'after',
      step: (w) => {
        seen.after = atWar(w, USA, CHN);
        seen.enemies = enemiesOf(w, USA);
        setSanctions(w, RUS, USA, true);
        seen.pairs = hostility(w).pairs;
        setAtWar(w, USA, CHN, false);
        seen.peace = atWar(w, CHN, USA);
      },
    };
    const { engine, world } = testWorld([before, declare, after]);
    engine.step(world);
    expect(seen).toEqual({ before: false, after: true, enemies: [CHN], pairs: [{ a: CHN, b: USA, war: true }, { a: RUS, b: USA, war: false }], peace: false });
  });

  it('reads relations edited between ticks', () => {
    const { engine, world } = testWorld([{ id: 'noop', step: () => {} }]);
    engine.step(world);
    world.relations['CHN|USA'] = { opinion: -80, atWar: true, escalation: 'conventional', sanctions: false };
    expect(atWar(world, USA, CHN)).toBe(true);
    let during: boolean | undefined;
    const probe = new Engine(engine.map, engine.catalog, [{ id: 'probe', step: (w) => void (during = atWar(w, CHN, USA)) }]);
    probe.step(world);
    expect(during).toBe(true);
  });

  it('is written only through setAtWar and setSanctions in a running sim', () => {
    const src = path.resolve(import.meta.dirname, '../src');
    const files = fs.readdirSync(src, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts'));
    // The test kit sets up wars before the first tick, where no index exists.
    const allowed = new Set(['core/engine.ts', 'testkit/index.ts']);
    const writers = files.filter((f) => !allowed.has(f.split(path.sep).join('/')) && /\.(atWar|sanctions)\s*=[^=]/.test(fs.readFileSync(path.join(src, f), 'utf8')));
    expect(writers, 'set war and sanctions with setAtWar/setSanctions so the per-tick hostility index is dropped').toEqual([]);
  });
});

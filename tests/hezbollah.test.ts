import { describe, expect, it } from 'vitest';
import type { NationId } from '../src/core/types';
import { createSession } from '../src/scenarios';

const ISR = 'ISR' as NationId, LBN = 'LBN' as NationId;

describe('peace-2027: Israel against Hezbollah (Red Team XP-5)', () => {
  it('Hezbollah holds southern Lebanon\'s hills with ATGMs and rockets, and Israel is nowhere near Beirut after three weeks', () => {
    const s = createSession('peace-2027', 1);
    const { map, catalog } = s.engine;
    const w = s.world;
    const hezbollah = Object.values(w.formations).filter((f) => f.nation === LBN && f.name.startsWith('Hezbollah'));
    // Main: Lebanon is a generated army of 80,000 with no Hezbollah in it.
    expect(hezbollah.every((f) => f.territorial)).toBe(true);
    const count = (cls: string) => hezbollah.reduce((n, f) => n + Object.entries(f.equipment).reduce((k, [p, c]) => k + (catalog.platform(p as never).class === cls ? c : 0), 0), 0);
    expect(count('atgm')).toBeGreaterThanOrEqual(150);
    expect(count('mlrs')).toBeGreaterThanOrEqual(100);

    const lebanon = [...Array(map.landCount).keys()].filter((n) => w.control[n] === LBN);
    const beirut = map.nodeAt(33.89, 35.5);
    w.pending.push({ type: 'declare_war', nation: ISR, target: LBN, reason: 'Hezbollah' });
    s.engine.run(w, 21 * 4);
    // Main: Israel takes Beirut on day 8 and half of Lebanon by day 15.
    expect(w.control[beirut]).toBe(LBN);
    // In 2006 and 2024 the IDF fought for weeks over a strip a few kilometres to a few tens of kilometres deep.
    expect(lebanon.filter((n) => w.control[n] !== LBN).length).toBeLessThanOrEqual(4);
  }, 600_000);
});

import { describe, expect, it } from 'vitest';
import type { MunitionId, NationId, SimEvent } from '../src/core/types';
import { createSession } from '../src/scenarios';
import { enemyMap } from '../src/systems/diplomacy';
import { targetList } from '../src/systems/strategic';

const N = (s: string) => s as NationId;

describe('a nuclear exchange stays between the parties to it', () => {
  it('a US counterforce strike on Russia and the Russian launch on warning land only on the parties to the war; North Korea is not struck into it', () => {
    const s = createSession('peace-2027', 1);
    const w = s.world;
    w.nations[N('USA')].controlledBy = 'human';
    s.engine.step(w);
    for (const t of targetList(w, s, N('USA'), N('RUS'), 'counterforce').slice(0, 200))
      for (const munition of ['minuteman3', 'trident2_d5'] as MunitionId[]) w.pending.push({ type: 'nuclear_release', nation: N('USA'), target: t.node, warheads: 2, munition });
    const detonations: Extract<SimEvent, { type: 'nuclear_detonation' }>[] = [];
    const strayed: string[] = [];
    for (let t = 0; t < 40; t++) {
      // A party to the exchange: the two of them, or a state already at war with the striker when it fires.
      const foes = enemyMap(w);
      for (const e of s.engine.step(w)) {
        if (e.type !== 'nuclear_detonation') continue;
        detonations.push(e);
        const owner = s.map.isSea(e.node) ? undefined : s.map.owner[e.node];
        if (owner && owner !== 'USA' && owner !== 'RUS' && !foes.get(e.by)?.has(owner)) strayed.push(`${e.by}>${owner}`);
      }
    }
    expect(detonations.filter((e) => e.by === 'RUS').length).toBeGreaterThan(200);
    expect(strayed).toEqual([]);
    // North Korea may still answer its 2024 treaty with Russia, a decision of its own days later; no strike drags it in.
    const prkEntries = w.history.filter((e) => e.type === 'war_declared' && (e.by === 'PRK' || e.on === 'PRK'));
    expect(prkEntries.every((e) => e.type === 'war_declared' && e.by === 'PRK' && e.reason.startsWith('RUS-PRK'))).toBe(true);
  });
});

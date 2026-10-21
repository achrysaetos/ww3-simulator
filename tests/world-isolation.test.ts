import { describe, expect, it } from 'vitest';
import type { NationId } from '../src/core/types';
import { createSession } from '../src/scenarios';

describe('world isolation', () => {
  it('a war fought in one session leaves the nation data of the next session untouched', () => {
    const CHN = 'CHN' as NationId;
    const first = createSession('taiwan-2027', 3);
    const fresh = structuredClone(first.world.nations[CHN].nuclear);
    first.world.nations[CHN].nuclear.deployed += 100;
    first.world.nations[CHN].stats.population = 1;
    const second = createSession('taiwan-2027', 3);
    expect(second.world.nations[CHN].nuclear).toEqual(fresh);
    expect(second.world.nations[CHN].stats.population).not.toBe(1);
  }, 60_000);
});

import { describe, expect, it } from 'vitest';
import type { NationId } from '../src/core/types';
import { CONTEST_STRIDE, emptyClientState } from '../src/ui/snapshot';
import { openingFacts } from '../src/ui/start/openingFacts';

describe('the situation report counts', () => {
  it('one cell under attack per contest record', () => {
    const state = emptyClientState(10);
    state.contest = new Float32Array(2 * CONTEST_STRIDE);
    expect(openingFacts(state, 'UKR' as NationId, undefined).contested).toBe(2);
  });
});

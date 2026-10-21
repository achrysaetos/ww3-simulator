import { describe, expect, it } from 'vitest';
import { createSession } from '../src/scenarios';

describe('scenario setup', () => {
  it('ukraine-2026 starts with the occupied Azov coast, Berdiansk included, in Russian hands', () => {
    const s = createSession('ukraine-2026');
    expect(s.world.control[s.map.nodeAt(46.75, 36.8)]).toBe('RUS');
    expect(s.world.control[s.map.nodeAt(46.64, 32.61)]).toBe('UKR'); // Kherson city, right bank
  });

});

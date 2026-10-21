import { describe, expect, it } from 'vitest';
import { createSession } from '../src/scenarios';

const at = (s: ReturnType<typeof createSession>, name: string) => {
  const f = Object.values(s.world.formations).find((x) => x.name === name)!;
  return [s.map.lat[f.node], s.map.lon[f.node]];
};

describe('scenario setup', () => {
  it('ukraine-2026 starts with the occupied Azov coast, Berdiansk included, in Russian hands', () => {
    const s = createSession('ukraine-2026');
    expect(s.world.control[s.map.nodeAt(46.76, 36.79)]).toBe('RUS');
    expect(s.world.control[s.map.nodeAt(46.64, 32.61)]).toBe('UKR'); // Kherson city, right bank
  });

  it('baltic-2027 opens with the Leningrad district army in garrison by the Baltic and the southern army still in Ukraine', () => {
    const s = createSession('baltic-2027');
    expect(at(s, '76th Guards Air Assault Division')).toEqual([57.75, 28.25]);
    expect(at(s, '69th Guards Motor Rifle Division (6th CAA)')).toEqual([60.5, 29.5]);
    expect(at(s, '20th Guards Motor Rifle Division (8th CAA)')).toEqual([48.25, 37.75]);
  });
});

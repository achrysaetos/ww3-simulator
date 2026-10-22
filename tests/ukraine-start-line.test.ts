import { describe, expect, it } from 'vitest';
import { createSession } from '../src/scenarios';

/**
 * Ukraine's 2025 sector bases (Pokrovsk, Kupiansk, Siversk, Velyka Novosilka) fall in half-degree cells the late-2025
 * line puts on the Russian side. Formations left there stand on Russian-held ground with no enemy in the cell: neither
 * side fights them and they hold no line, so a third of Ukraine's front force sat out every ukraine-2026 run while the
 * cells next to it were held by a few platforms against Russian groups of 1,000 or more.
 */
describe('ukraine-2026 start line', () => {
  it('every Ukrainian formation starts on ground its own side holds, the near side of the line', () => {
    const { world, map } = createSession('ukraine-2026', 1);
    const across = Object.values(world.formations).filter((f) => f.nation === 'UKR' && f.node < map.landCount && world.control[f.node] === 'RUS');
    expect(across.map((f) => `${f.name} @ ${map.lat[f.node]},${map.lon[f.node]}`)).toEqual([]);
    const pokrovsk = Object.values(world.formations).filter((f) => f.nation === 'UKR' && f.name === '1st Separate Tank Brigade');
    expect(pokrovsk.length).toBe(1);
    expect(world.control[pokrovsk[0].node]).toBe('UKR');
    expect(map.distanceKm(pokrovsk[0].node, map.nodeAt(48.28, 37.18))).toBeLessThan(80);
  }, 120_000);
});

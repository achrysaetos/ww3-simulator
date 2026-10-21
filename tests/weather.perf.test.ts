import { describe, expect, it } from 'vitest';
import { Engine } from '../src/core/engine';
import { createSession } from '../src/scenarios';
import { SYSTEMS } from '../src/systems';
import { weather } from '../src/systems/weather';
import { testWorld } from '../src/testkit';

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];

describe('weather performance', () => {
  it('draws a day of weather for every region in a few milliseconds, a fraction of a millisecond per tick', () => {
    const t = testWorld([weather]);
    const t0 = performance.now();
    const ticks = 400;
    for (let i = 0; i < ticks; i++) t.engine.step(t.world);
    const perTick = (performance.now() - t0) / ticks;
    console.log(`weather: ${perTick.toFixed(3)} ms per tick over ${ticks} ticks (${(perTick * (24 / t.world.dtHours)).toFixed(2)} ms per simulated day)`);
    expect(perTick).toBeLessThan(1.5);
  });

  it('adds little to a ukraine-2026 tick: the daily draw plus the movement, sortie and landing hooks', () => {
    const timed = (withWeather: boolean) => {
      const s = createSession('ukraine-2026', 1);
      const engine = withWeather ? s.engine : new Engine(s.map, s.catalog, SYSTEMS.filter((x) => x.id !== 'weather'));
      if (!withWeather) delete (s.world.slices as Partial<typeof s.world.slices>).weather;
      engine.run(s.world, 4);
      const times: number[] = [];
      for (let i = 0; i < 16; i++) {
        const t0 = performance.now();
        engine.step(s.world);
        times.push(performance.now() - t0);
      }
      return median(times);
    };
    const without = timed(false), withWeather = timed(true);
    console.log(`ukraine-2026 tick: ${without.toFixed(1)} ms without weather, ${withWeather.toFixed(1)} ms with`);
    expect(withWeather).toBeLessThan(without * 1.2 + 2);
  }, 300_000);
});

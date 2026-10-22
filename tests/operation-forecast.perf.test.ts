import { afterAll, expect, it } from 'vitest';
import type { NationId } from '../src/core/types';
import { forecastInput, forecastOperation } from '../src/forecast/operation';
import { OperationForecastPool } from '../src/forecast/operation-pool';
import { createSession } from '../src/scenarios';

const RUS = 'RUS' as NationId;
const pool = new OperationForecastPool();
afterAll(() => pool.close());

it('a week-long forecast of a four-formation Donbas offensive, 8 runs on a warm worker pool, returns inside 2 s and matches the serial forecast', async () => {
  const s = createSession('ukraine-2026', 1);
  s.engine.run(s.world, 8);
  const force = ['3rd Motor Rifle Division', '2nd Guards Motor Rifle Brigade', '4th Guards Motor Rifle Brigade', '20th Guards Motor Rifle Division']
    .map((n) => Object.values(s.world.formations).find((f) => f.nation === RUS && f.name.startsWith(n))!.id);
  const input = forecastInput(s.world, s.engine.map, s.engine.catalog, { nation: RUS, kind: 'offensive', objectives: [s.engine.map.nodeAt(48.72, 37.56)], formations: force }, 7);
  await pool.warm();
  await pool.forecast(input, 8);
  const t0 = performance.now();
  const pooled = await pool.forecast(input, 8);
  const ms = performance.now() - t0;
  expect(ms, `${ms.toFixed(0)} ms`).toBeLessThan(2000);
  expect(pooled).toEqual(forecastOperation(input, 8));
}, 300_000);

/**
 * Regenerate src/forecast/quick.ts, the drag pill's ground table, from runOperation duels.
 * npm run calibrate:quick
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { calibrateQuick, quickSource } from '../src/forecast/calibrate-quick';
import { OperationForecastPool } from '../src/forecast/operation-pool';

const t0 = performance.now();
const pool = new OperationForecastPool();
try {
  const table = await calibrateQuick((input, runs) => pool.forecast(input, runs));
  const land = execFileSync('git', ['log', '-1', '--format=%h', '--', 'src/systems/land/tables.ts'], { encoding: 'utf8' }).trim() || 'uncommitted';
  writeFileSync(new URL('../src/forecast/quick.ts', import.meta.url), quickSource(table, land));
  console.log(`wrote src/forecast/quick.ts in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
} finally {
  await pool.close();
}

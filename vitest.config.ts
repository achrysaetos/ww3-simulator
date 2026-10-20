import { defineConfig } from 'vitest/config';

// Wall-clock budgets only mean something on an idle core, so *.perf.test.ts runs
// separately and serially via `npm run perf`, never in the parallel unit suite.
const perf = process.env.PERF === '1';
// Realism bands run whole scenarios for weeks of game time, so they run on their own via `npm run realism`.
const realism = process.env.REALISM === '1';

export default defineConfig({
  test: {
    include: perf ? ['tests/**/*.perf.test.ts'] : realism ? ['tests/**/*.realism.test.ts'] : ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '.claude/**', 'dist/**', ...(perf ? [] : ['tests/**/*.perf.test.ts']), ...(realism ? [] : ['tests/**/*.realism.test.ts'])],
    fileParallelism: !perf,
    testTimeout: realism ? 600_000 : undefined,
    hookTimeout: realism ? 900_000 : undefined,
  },
});

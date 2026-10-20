import { defineConfig } from 'vitest/config';

// Wall-clock budgets only mean something on an idle core, so *.perf.test.ts runs
// separately and serially via `npm run perf`, never in the parallel unit suite.
const perf = process.env.PERF === '1';

export default defineConfig({
  test: {
    include: perf ? ['tests/**/*.perf.test.ts'] : ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '.claude/**', 'dist/**', ...(perf ? [] : ['tests/**/*.perf.test.ts'])],
    fileParallelism: !perf,
  },
});

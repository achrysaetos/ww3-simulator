import { defineConfig } from 'vitest/config';

// Wall-clock budgets only mean something on an idle core, so *.perf.test.ts runs
// separately and serially via `npm run perf`, never in the parallel unit suite.
// *.realism.test.ts runs whole scenarios for minutes and has its own `npm run realism`.
const perf = process.env.PERF === '1';
const realism = process.env.REALISM === '1';
const separate = ['tests/**/*.perf.test.ts', 'tests/**/*.realism.test.ts'];

export default defineConfig({
  test: {
    include: perf ? ['tests/**/*.perf.test.ts'] : realism ? ['tests/**/*.realism.test.ts'] : ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '.claude/**', 'dist/**', ...(perf || realism ? [] : separate)],
    fileParallelism: !perf,
    // Simulation tests step the real map for weeks; a loaded machine stretches them past the 5 s default.
    testTimeout: realism ? 600_000 : 60_000,
    hookTimeout: realism ? 600_000 : 60_000,
  },
});

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const TESTS = path.resolve(import.meta.dirname);

describe('test conventions', () => {
  it('keeps wall-clock budgets out of the parallel unit suite', () => {
    const offenders = fs
      .readdirSync(TESTS)
      .filter((f) => f.endsWith('.test.ts') && !f.endsWith('.perf.test.ts'))
      .filter((f) => /performance\.now\(|Date\.now\(|process\.hrtime/.test(fs.readFileSync(path.join(TESTS, f), 'utf8')));
    expect(offenders, 'move timing assertions into <area>.perf.test.ts (npm run perf)').toEqual([]);
  });
});

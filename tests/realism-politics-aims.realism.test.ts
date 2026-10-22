import { beforeAll, describe, expect, it } from 'vitest';
import { ensemble } from '../src/validation/ensemble';
import type { CaseResult } from '../src/validation/run';

/** Runs, of an ensemble of 8, whose answer to `question` passes `ok`, listed with every value when the test fails. */
const majority = (runs: CaseResult[], question: string, ok: (v: number) => boolean) => {
  const values = runs.map((r) => r.values[question]);
  return { passing: values.filter(ok).length, values: values.join(', ') };
};

// The held-out validation cases (src/validation/cases) as ensembles of 8 over seeds and swept params.
describe('karabakh-2020: a war for the districts round Karabakh, ensemble of 8', () => {
  let runs: CaseResult[];
  beforeAll(async () => {
    runs = await ensemble('karabakh-2020');
  });

  it('Azerbaijan takes no cell of Armenia proper in most runs (observed: none; Wikipedia, "Second Nagorno-Karabakh War")', () => {
    const r = majority(runs, 'armenia_taken', (v) => v === 0);
    expect(r.passing, r.values).toBeGreaterThan(4);
  });

  it('Turkey does not enter under the 2021 Shusha Declaration, which did not exist in 2020', () => {
    const r = majority(runs, 'others_join', (v) => v === 0);
    expect(r.passing, r.values).toBeGreaterThan(4);
  });
});

describe('sindoor-2025: a punitive strike exchange, ensemble of 8', () => {
  let runs: CaseResult[];
  beforeAll(async () => {
    runs = await ensemble('sindoor-2025');
  });

  it('no ground war: no territory changes hands and land casualties stay in the hundreds at most (observed 21 dead on the Line of Control)', () => {
    const territory = majority(runs, 'territory', (v) => v === 0);
    expect(territory.passing, territory.values).toBeGreaterThan(4);
    const casualties = majority(runs, 'land_casualties', (v) => v <= 300);
    expect(casualties.passing, casualties.values).toBeGreaterThan(4);
  });

  it('no naval battle: no warship is lost', () => {
    const r = majority(runs, 'warships_lost', (v) => v === 0);
    expect(r.passing, r.values).toBeGreaterThan(4);
  });
});

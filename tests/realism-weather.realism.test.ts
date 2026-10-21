/**
 * The season in whole scenarios: the same opening from different start dates. The spring
 * rasputitsa slows the war in Ukraine against July; the Taiwan Strait's winter monsoon holds
 * China's landings offshore and makes them costlier than in the April window; overcast cuts sorties.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { NationId } from '../src/core/types';
import { createSession } from '../src/scenarios';
import { isLandFormation } from '../src/systems/land/state';
import { sortieFactorAt } from '../src/systems/weather/effects';

/** Bounds of the theater whose air bases count: [south, north, west, east]. */
function run(scenario: string, startDate: string, days: number, nations: string[], box: [number, number, number, number], seed = 1) {
  const s = createSession(scenario, seed);
  s.world.startDate = startDate;
  let cellsEntered = 0, sortieWeight = 0, aircraft = 0, offshoreTicks = 0;
  const theater = new Set(nations);
  for (let i = 0; i < (days * 24) / s.world.dtHours; i++) {
    const land = Object.values(s.world.formations).filter((f) => theater.has(f.nation) && isLandFormation(f, s.map));
    const before = new Map(land.map((f) => [f.id, f.node]));
    s.engine.step(s.world);
    for (const [id, node] of before) if (s.world.formations[id].node !== node) cellsEntered++;
    offshoreTicks += Object.keys(s.world.slices.naval.offshore).length;
    // The weather's multiplier on each theater air wing's sortie rate this tick, weighted by its aircraft.
    for (const f of Object.values(s.world.formations)) {
      if (f.kind !== 'air_wing' || f.status !== 'active' || !theater.has(f.nation)) continue;
      const lat = s.map.lat[f.node], lon = s.map.lon[f.node];
      if (lat < box[0] || lat > box[1] || lon < box[2] || lon > box[3]) continue;
      const n = Object.values(f.equipment).reduce((a, b) => a + b, 0);
      sortieWeight += n * sortieFactorAt(s.world, s.map, f.node);
      aircraft += n;
    }
  }
  const chn = s.world.slices.naval.ledger['CHN' as NationId];
  return {
    cellsEntered,
    sortieFactor: sortieWeight / aircraft,
    offshoreTicks,
    landed: chn?.troopsLanded ?? 0,
    lost: chn?.troopsLostLanding ?? 0,
  };
}

describe('ukraine-2026 from March and from July, 10 days', () => {
  let spring: ReturnType<typeof run>, summer: ReturnType<typeof run>;
  beforeAll(() => {
    const europe: [number, number, number, number] = [40, 60, 20, 50];
    spring = run('ukraine-2026', '2026-03-20T00:00:00Z', 10, ['RUS', 'UKR'], europe);
    summer = run('ukraine-2026', '2026-07-01T00:00:00Z', 10, ['RUS', 'UKR'], europe);
    console.log(`ukraine spring ${JSON.stringify(spring)}; summer ${JSON.stringify(summer)}`);
  });

  it('moves less ground in the spring rasputitsa', () => {
    expect(spring.cellsEntered).toBeLessThan(summer.cellsEntered * 0.92);
  });

  it('flies fewer sorties under the cloudier spring sky', () => {
    expect(spring.sortieFactor).toBeLessThan(summer.sortieFactor - 0.03);
  });
});

describe('taiwan-2027 in January and in the April window, 14 days', () => {
  let winter: ReturnType<typeof run>, april: ReturnType<typeof run>;
  beforeAll(() => {
    const strait: [number, number, number, number] = [18, 32, 110, 128];
    winter = run('taiwan-2027', '2027-01-10T00:00:00Z', 14, ['CHN', 'TWN'], strait);
    april = run('taiwan-2027', '2027-04-01T00:00:00Z', 14, ['CHN', 'TWN'], strait);
    console.log(`taiwan winter ${JSON.stringify(winter)}; april ${JSON.stringify(april)}`);
  });

  it('holds the landing force offshore waiting out the winter monsoon seas, so fewer troops get ashore', () => {
    expect(april.landed).toBeGreaterThan(20_000);
    expect(winter.offshoreTicks).toBeGreaterThan(april.offshoreTicks * 2);
    expect(winter.landed).toBeLessThan(april.landed * 0.85);
  });
});

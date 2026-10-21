import { beforeAll, describe, expect, it } from 'vitest';
import { atWar, relationMut } from '../src/core/engine';
import type { MunitionKind, NationId, SimEvent } from '../src/core/types';
import { createSession } from '../src/scenarios';

interface Surrender {
  nation: NationId;
  name: string;
  /** The cell's holder was at war with the formation when it surrendered. */
  onEnemyGround: boolean;
}

interface IsolationRun {
  surrenders: Surrender[];
  /** Rounds landing on a nation's land cells, keyed `shooter->owner:place` with place 'guam' or 'homeland'. */
  rounds: Record<string, number>;
  /** Day of the first round on Guam, and day the China-US war began; -1 if never. */
  firstGuamDay: number;
  chnUsaWarDay: number;
  rungs: Record<string, string>;
  ballistic: Record<string, number>;
}

const BALLISTIC: ReadonlySet<MunitionKind> = new Set(['srbm', 'mrbm', 'irbm', 'hgv']);
const inGuam = (lat: number, lon: number) => lat >= 12 && lat <= 21 && lon >= 144 && lon <= 147;

function run(scenario: string, days: number, seed: number, atWarFromStart: [string, string][] = []): IsolationRun {
  const { world, map, engine, catalog } = createSession(scenario, seed);
  for (const [a, b] of atWarFromStart) {
    Object.assign(relationMut(world, a as NationId, b as NationId), { atWar: true, escalation: 'conventional', warSince: world.tick });
    for (const n of [a, b]) world.nations[n as NationId].status = 'war';
  }
  const out: IsolationRun = { surrenders: [], rounds: {}, firstGuamDay: -1, chnUsaWarDay: -1, rungs: {}, ballistic: {} };
  for (let i = 0; i < Math.round((days * 24) / world.dtHours); i++) {
    const day = (world.tick * world.dtHours) / 24;
    for (const e of engine.step(world) as SimEvent[]) {
      // An ASAT engagement is reported at the constellation's operations centre but lands nowhere.
      if (e.type === 'strike' && !map.isSea(e.target) && !e.effects.some((x) => x.kind === 'satellites_destroyed')) {
        const owner = map.owner[e.target];
        const guam = inGuam(map.lat[e.target], map.lon[e.target]);
        const key = `${e.by}->${owner}:${guam ? 'guam' : 'homeland'}`;
        out.rounds[key] = (out.rounds[key] ?? 0) + e.fired;
        if (guam && out.firstGuamDay < 0) out.firstGuamDay = day;
        const kind = catalog.munitions.get(e.munition)?.kind;
        if (kind && BALLISTIC.has(kind)) out.ballistic[`${e.by}->${world.control[e.target]}`] = (out.ballistic[`${e.by}->${world.control[e.target]}`] ?? 0) + e.fired;
      }
      if (e.type === 'message' && e.nation && e.text.includes('surrendered after')) {
        const f = Object.values(world.formations).find((g) => g.nation === e.nation && g.status === 'destroyed' && e.text.startsWith(g.name));
        if (f) out.surrenders.push({ nation: f.nation, name: f.name, onEnemyGround: atWar(world, f.nation, world.control[f.node]) });
      }
    }
    if (out.chnUsaWarDay < 0 && world.relations['CHN|USA']?.atWar) out.chnUsaWarDay = day;
  }
  for (const [k, r] of Object.entries(world.relations)) if (r.atWar) out.rungs[k] = r.escalation;
  return out;
}

const SEEDS = [1, 2, 3];
/** Three 30-day runs of a full-world scenario take several minutes each on a loaded machine. */
const RUN_MS = 3_600_000;
const homeSurrenders = (r: IsolationRun, nation: string) => r.surrenders.filter((s) => s.nation === nation && !s.onEnemyGround);

describe('taiwan-2027, 30 days', () => {
  let runs: IsolationRun[];
  beforeAll(() => {
    // Pinned: CSIS's 2023 base case has the US fighting from the first day; whether and when the US enters is the
    // diplomacy model's call, not what these bands measure.
    runs = SEEDS.map((s) => run('taiwan-2027', 30, s, [['USA', 'CHN']]));
  }, RUN_MS);

  // US garrisons in Japan, Korea and Guam stand on allied or US soil that no enemy reaches on land in a Taiwan war
  // (CSIS "The First Battle of the Next War", 2023: no ground fighting outside Taiwan). None can be encircled.
  it('no US or Japanese formation surrenders encircled', () => {
    for (const r of runs) {
      expect(r.surrenders.filter((s) => s.nation === 'USA')).toEqual([]);
      expect(r.surrenders.filter((s) => s.nation === 'JPN')).toEqual([]);
    }
  });

  // DoD China Military Power Report 2023 (DF-26 "Guam killer"); CSIS 2023 wargames: PLARF strikes Guam's
  // Andersen AFB in the opening salvos once the US is in the war. Judgment: within 5 days of US entry.
  it('China strikes Guam within 5 days of the US entering the war', () => {
    for (const r of runs) {
      expect(r.chnUsaWarDay).toBeGreaterThanOrEqual(0);
      expect(r.rounds['CHN->USA:guam'] ?? 0).toBeGreaterThanOrEqual(20);
      expect(r.firstGuamDay - r.chnUsaWarDay).toBeLessThanOrEqual(5);
    }
  });

  // CSIS 2023 base case: China does not strike the US homeland (Hawaii, Alaska, CONUS) and the war stays below
  // strategic conventional escalation for its first month. Striking Guam must not by itself climb the ladder.
  it('the US homeland beyond Guam goes unstruck and China-US stays at conventional war', () => {
    for (const r of runs) {
      expect(r.rounds['CHN->USA:homeland'] ?? 0).toBe(0);
      expect(r.rungs['CHN|USA']).toBe('conventional');
    }
  });
});

describe('baltic-2027, 30 days', () => {
  let runs: IsolationRun[];
  beforeAll(() => {
    runs = SEEDS.map((s) => run('baltic-2027', 30, s));
  }, RUN_MS);

  // US forces in Japan, Germany and Poland, and Russian garrisons on their own Arctic islands, are far from any front.
  it('no US formation, and no Russian formation on Russian soil, surrenders encircled', () => {
    for (const r of runs) {
      expect(r.surrenders.filter((s) => s.nation === 'USA')).toEqual([]);
      expect(homeSurrenders(r, 'RUS')).toEqual([]);
    }
  });
});

describe('ukraine-2026, 30 days', () => {
  let runs: IsolationRun[];
  beforeAll(() => {
    runs = SEEDS.map((s) => run('ukraine-2026', 30, s));
  }, RUN_MS);

  // Formation-sized pockets have been rare since 2022: Mariupol (2022) and the Kursk salient's collapse (2025) over
  // three years (ISW). Judgment: at most two brigade-or-larger surrenders per side in a month.
  it('pockets are rare: at most two formations surrender per side in a month', () => {
    for (const r of runs)
      for (const n of ['RUS', 'UKR']) expect(r.surrenders.filter((s) => s.nation === n).length).toBeLessThanOrEqual(2);
  });
});

describe('gulf-2027, 30 days', () => {
  let runs: IsolationRun[];
  beforeAll(() => {
    runs = SEEDS.map((s) => run('gulf-2027', 30, s));
  }, RUN_MS);

  // Iran fired ~120 ballistic missiles on 13-14 April 2024, ~200 on 1 October 2024 and ~550 in the 12 days of
  // June 2025 (IDF, CSIS Missile Defense Project). Judgment for a month of open war: 150-800.
  it('Iran fires 150-800 ballistic missiles at Israel', () => {
    for (const r of runs) {
      expect(r.ballistic['IRN->ISR'] ?? 0).toBeGreaterThanOrEqual(150);
      expect(r.ballistic['IRN->ISR'] ?? 0).toBeLessThanOrEqual(800);
    }
  });

  // Israel used air-launched ballistic missiles (Rocks, Air LORA, Blue Sparrow family) against Iran's air defences
  // in October 2024 and June 2025 (IISS, Israeli press). Judgment: at least 10 in a month.
  it('Israel fires air-launched ballistic missiles at Iran', () => {
    for (const r of runs) expect(r.ballistic['ISR->IRN'] ?? 0).toBeGreaterThanOrEqual(10);
  });
});

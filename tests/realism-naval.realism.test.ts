import { describe, expect, it } from 'vitest';
import type { NationId, NodeId, PlatformClass, PlatformId } from '../src/core/types';
import { measureRun, type RunMetrics } from '../src/metrics';
import { createSession } from '../src/scenarios';
import { nearestSea } from '../src/systems/naval/geography';

const DAYS = 30;
const SEEDS = [1, 2, 3];
const SURFACE: PlatformClass[] = ['cruiser', 'destroyer', 'frigate', 'corvette'];

interface TaiwanRun {
  m: RunMetrics;
  usInWar: boolean;
  /** Taiwan's 1-degree land cells (4 at this resolution) held by China at the end. */
  cellsTaken: number;
  taipeiHeld: boolean;
  start: Record<string, Partial<Record<PlatformClass, number>>>;
}

function fielded(world: ReturnType<typeof createSession>['world'], catalog: ReturnType<typeof createSession>['catalog'], nation: string) {
  const out: Partial<Record<PlatformClass, number>> = {};
  for (const f of Object.values(world.formations)) {
    if (f.nation !== nation || f.status === 'destroyed') continue;
    for (const [pid, n] of Object.entries(f.equipment)) {
      const c = catalog.platform(pid as PlatformId).class;
      out[c] = (out[c] ?? 0) + n;
    }
  }
  return out;
}

const taiwanRuns = new Map<number, TaiwanRun>();
function taiwan(seed: number): TaiwanRun {
  let r = taiwanRuns.get(seed);
  if (r) return r;
  const s = createSession('taiwan-2027', seed);
  const start = Object.fromEntries(['CHN', 'TWN', 'USA', 'JPN'].map((n) => [n, fielded(s.world, s.catalog, n)]));
  const m = measureRun(s.engine, s.world, s.map, DAYS);
  let cellsTaken = 0;
  for (let n = 0; n < s.map.landCount; n++) if (s.map.owner[n] === 'TWN' && s.world.control[n] === 'CHN') cellsTaken++;
  const usInWar = m.wars.some((w) => [w.a, w.b].sort().join() === 'CHN,USA');
  r = { m, usInWar, cellsTaken, taipeiHeld: s.world.control[s.world.nations['TWN' as NationId].capital] === 'TWN', start };
  taiwanRuns.set(seed, r);
  const lost = (n: string, c: PlatformClass) => m.nations[n]?.lossesByClass[c] ?? 0;
  console.log(`taiwan seed ${seed}: US in war ${usInWar}; first landing day ${m.nations.CHN?.naval?.firstAssaultDay}; landings ${m.nations.CHN?.naval?.assaultLandings}; ` +
    `landed ${m.nations.CHN?.naval?.troopsLanded} lost ${m.nations.CHN?.naval?.troopsLostLanding} ashore ${m.nations.CHN?.naval?.troopsOnEnemySoil}; cells taken ${cellsTaken}; ` +
    `CHN major ${m.nations.CHN?.naval?.majorShipsLost} (amphib ${lost('CHN', 'amphibious')}, carrier ${lost('CHN', 'carrier')}); ` +
    `USA carriers ${lost('USA', 'carrier')} surface ${SURFACE.reduce((a, c) => a + lost('USA', c), 0)} ssn ${lost('USA', 'ssn')}; ` +
    `TWN surface ${SURFACE.reduce((a, c) => a + lost('TWN', c), 0)}/${SURFACE.reduce((a, c) => a + (start.TWN[c] ?? 0), 0)}; JPN major ${m.nations.JPN?.naval?.majorShipsLost ?? 0}`);
  return r;
}

describe('Taiwan 2027 naval war and invasion (CSIS "The First Battle of the Next War", Jan 2023, 24 iterations)', () => {
  // CSIS: the invasion opens with the landing; every iteration has PLA forces ashore within days. Judgement: within two weeks.
  it.each(SEEDS)('China mounts an opposed landing on Taiwan within 14 days (seed %i)', (seed) => {
    const { m } = taiwan(seed);
    expect(m.nations.CHN.naval?.assaultLandings ?? 0).toBeGreaterThan(0);
    expect(m.nations.CHN.naval?.firstAssaultDay ?? Infinity).toBeLessThanOrEqual(14);
    expect(m.nations.CHN.naval?.troopsLostLanding ?? 0).toBeGreaterThan(0);
  }, 300_000);

  // CSIS base case: Taiwan's navy is sunk in the opening days.
  it.each(SEEDS)("Taiwan's surface fleet is largely sunk (seed %i)", (seed) => {
    const { m, start } = taiwan(seed);
    const lost = SURFACE.reduce((a, c) => a + (m.nations.TWN.lossesByClass[c] ?? 0), 0);
    const had = SURFACE.reduce((a, c) => a + (start.TWN[c] ?? 0), 0);
    expect(lost / had).toBeGreaterThanOrEqual(0.6);
  }, 300_000);

  // CSIS base case over the whole campaign: China ~138 major ships, the US 2 carriers and 7-20 major surface
  // warships. A 30-day run covers most of the decisive fighting; bands are widened for that (judgement).
  it.each(SEEDS)('once the US is in, the PLAN loses dozens of major ships including amphibious lift, and the US loses 0-3 carriers and a band of surface combatants (seed %i)', (seed) => {
    const { m, usInWar } = taiwan(seed);
    if (!usInWar) return;
    const chn = m.nations.CHN, usa = m.nations.USA;
    expect(chn.naval?.majorShipsLost ?? 0).toBeGreaterThanOrEqual(20);
    expect(chn.naval?.majorShipsLost ?? 0).toBeLessThanOrEqual(160);
    expect(chn.lossesByClass.amphibious ?? 0).toBeGreaterThanOrEqual(2);
    expect(usa.lossesByClass.carrier ?? 0).toBeLessThanOrEqual(3);
    const usSurface = (usa.lossesByClass.cruiser ?? 0) + (usa.lossesByClass.destroyer ?? 0) + (usa.lossesByClass.frigate ?? 0);
    expect(usSurface).toBeGreaterThanOrEqual(3);
    expect(usSurface).toBeLessThanOrEqual(25);
  }, 300_000);

  // CSIS base case: the PLA gets ashore but cannot be sustained once its shipping is attrited; Taipei never falls.
  it('with the US in, the landing fails or holds a small lodgement without breakout in most seeds, and Taipei holds in every seed', () => {
    const runs = SEEDS.map(taiwan).filter((r) => r.usInWar);
    expect(runs.length).toBeGreaterThan(0);
    for (const r of runs) expect(r.taipeiHeld).toBe(true);
    expect(runs.filter((r) => r.cellsTaken <= 1).length).toBeGreaterThanOrEqual(Math.ceil(runs.length / 2 + 0.01));
  }, 900_000);
});

describe('Black Sea 2026 (Russian Black Sea Fleet after 2022-24: ~a third lost to missiles and USVs, withdrawn east of Crimea)', () => {
  it.each(SEEDS)('the Russian fleet does not hold the sea off Odesa (seed %i)', (seed) => {
    const s = createSession('ukraine-2026', seed);
    const odesaSea = nearestSea(s.map, 46.5, 30.7) as NodeId;
    let russianDays = 0;
    for (let d = 0; d < DAYS; d++) {
      measureRun(s.engine, s.world, s.map, 1);
      const c = s.world.theater.seaControl[odesaSea];
      if (c?.nation === 'RUS' && c.level >= 0.5) russianDays++;
    }
    console.log(`ukraine seed ${seed}: days of firm Russian sea control off Odesa ${russianDays}/${DAYS}`);
    expect(russianDays).toBeLessThanOrEqual(DAYS / 3);
  }, 300_000);
});

import { describe, expect, it } from 'vitest';
import type { NationId, NodeId, PlatformClass, PlatformId } from '../src/core/types';
import { measureRun, type RunMetrics } from '../src/metrics';
import { createSession } from '../src/scenarios';
import { nearestSea } from '../src/systems/naval/geography';

const DAYS = 30;
const SEEDS = [1, 2, 3];
const SURFACE: PlatformClass[] = ['cruiser', 'destroyer', 'frigate', 'corvette'];
/** CSIS's base case has the US fighting from D-day; a US entry after this many days is a different game and gets no loss band. */
const US_EARLY_DAYS = 10;
/**
 * theater.seaControl level counted as working control: half of full control, which two unopposed
 * destroyers reach in their own zone (blockade.ts CONTROL_SCALE). Judgement.
 */
const WORKING_CONTROL = 0.5;

interface TaiwanRun {
  m: RunMetrics;
  /** The US at war with China by US_EARLY_DAYS, as in the CSIS base case. */
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
  const entry = (n: string) => m.wars.find((w) => [w.a, w.b].sort().join() === ['CHN', n].sort().join())?.since;
  const day = (tick: number | undefined) => (tick === undefined ? undefined : (tick * s.world.dtHours) / 24);
  const usInWar = (day(entry('USA')) ?? Infinity) <= US_EARLY_DAYS;
  r = { m, usInWar, cellsTaken, taipeiHeld: s.world.control[s.world.nations['TWN' as NationId].capital] === 'TWN', start };
  taiwanRuns.set(seed, r);
  const lost = (n: string, c: PlatformClass) => m.nations[n]?.lossesByClass[c] ?? 0;
  console.log(`taiwan seed ${seed}: US enters day ${day(entry('USA'))}, JPN day ${day(entry('JPN'))}; first landing day ${m.nations.CHN?.naval?.firstAssaultDay}; landings ${m.nations.CHN?.naval?.assaultLandings}; ` +
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
  it.each(SEEDS)('with the US in from the start, the PLAN loses dozens of major ships including amphibious lift, and the US loses 0-3 carriers and a band of surface combatants (seed %i)', (seed) => {
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
  it('with the US in from the start, the landing fails or holds a small lodgement without breakout in most seeds, and Taipei holds in every seed', () => {
    const runs = SEEDS.map(taiwan).filter((r) => r.usInWar);
    expect(runs.length).toBeGreaterThan(0);
    for (const r of runs) expect(r.taipeiHeld).toBe(true);
    expect(runs.filter((r) => r.cellsTaken <= 1).length).toBeGreaterThanOrEqual(Math.ceil(runs.length / 2 + 0.01));
  }, 900_000);
});

describe('Black Sea 2026 (Russian Black Sea Fleet after 2022-24: ~a third lost to missiles and USVs, withdrawn east of Crimea)', () => {
  // Since mid-2023 Russian warships no longer operate west of Crimea and Ukrainian grain sails from Odesa
  // (UK MoD and ISW updates 2023-24). Judgement: Russia holds working control off Odesa on at most a third of days.
  // Control is a matter of degree (Corbett, "Some Principles of Maritime Strategy", 1911: the normal state of
  // the sea is uncommanded). Till ("Seapower", 4th ed. 2018) calls the useful degree "working control": using a
  // sea area at acceptable risk and denying it to the enemy. A remnant group a zone away that leaves a trace of
  // presence off Odesa is not that, so a day counts only at control level WORKING_CONTROL or above.
  it.each(SEEDS)('the Russian fleet does not hold working control of the sea off Odesa (seed %i)', (seed) => {
    const s = createSession('ukraine-2026', seed);
    const odesaSea = nearestSea(s.map, 46.5, 30.7) as NodeId;
    let russianDays = 0;
    for (let d = 0; d < DAYS; d++) {
      measureRun(s.engine, s.world, s.map, 1);
      const c = s.world.theater.seaControl[odesaSea];
      if (c?.nation === 'RUS' && c.level >= WORKING_CONTROL) russianDays++;
    }
    console.log(`ukraine seed ${seed}: days of Russian working control off Odesa ${russianDays}/${DAYS}`);
    expect(russianDays).toBeLessThanOrEqual(DAYS / 3);
  }, 300_000);
});

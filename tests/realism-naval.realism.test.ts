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
  /** Trade blocked at the end for each nation at war with no one. */
  neutralTrade: Record<string, number>;
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
  const belligerent = new Set(Object.entries(s.world.relations).filter(([, x]) => x.atWar).flatMap(([k]) => k.split('|')));
  const neutralTrade = Object.fromEntries(Object.entries(s.world.theater.tradeBlocked).filter(([n]) => !belligerent.has(n)));
  r = { m, usInWar, cellsTaken, taipeiHeld: s.world.control[s.world.nations['TWN' as NationId].capital] === 'TWN', start, neutralTrade };
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

  // Trade is cut by hostile forces on a nation's sea lanes; a nation at peace loses only what avoids the war zone.
  // Red Sea 2024: attacks cut Suez transits by about two thirds, but cargo rerouted round the Cape (UNCTAD).
  // A Taiwan Strait war zone carries about a fifth of Korean and Japanese trade (geography.ts). Judgement: <= 0.25.
  it.each(SEEDS)('nations at peace keep their seaborne trade (seed %i)', (seed) => {
    const worst = Object.entries(taiwan(seed).neutralTrade).sort((a, b) => b[1] - a[1])[0];
    console.log(`taiwan seed ${seed}: most blockaded neutral ${worst?.[0]} ${worst?.[1].toFixed(2)}`);
    expect(worst?.[1] ?? 0).toBeLessThanOrEqual(0.25);
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

  // CSIS base case: allied submarines, bombers and Taiwan's shore batteries sink most of the PLAN's amphibious
  // fleet in the first weeks. Judgement: at least half the amphibious hulls by day 30.
  it.each(SEEDS)('with the US in from the start, the PLAN loses most of its amphibious fleet (seed %i)', (seed) => {
    const { m, start, usInWar } = taiwan(seed);
    if (!usInWar) return;
    expect((m.nations.CHN.lossesByClass.amphibious ?? 0) / (start.CHN.amphibious ?? 1)).toBeGreaterThanOrEqual(0.5);
  }, 300_000);

  // CSIS base case: China gets about 30,000 troops ashore, who are cut off once its shipping is sunk.
  // Judgement: fewer than 80,000 PLA troops on Taiwan at day 30.
  it.each(SEEDS)('with the US in from the start, the PLA has tens of thousands ashore, not hundreds of thousands (seed %i)', (seed) => {
    const { m, usInWar } = taiwan(seed);
    if (!usInWar) return;
    expect(m.nations.CHN.naval?.troopsOnEnemySoil ?? 0).toBeGreaterThan(5_000);
    expect(m.nations.CHN.naval?.troopsOnEnemySoil ?? 0).toBeLessThan(80_000);
  }, 300_000);

  // CSIS base case: US attack submarines do much of the killing of PLAN shipping and lose few boats. Judgement: at most
  // 6 of the ~50 US SSNs in 30 days. Boats wait one zone off the PLAN's screen and the datum falls on the boat that
  // attacked (naval/combat.ts), so few are lost.
  it('with the US in from the start, the US loses only a handful of attack submarines', () => {
    const runs = SEEDS.map(taiwan).filter((r) => r.usInWar);
    expect(runs.length).toBeGreaterThan(0);
    for (const { m } of runs) expect(m.nations.USA.lossesByClass.ssn ?? 0).toBeLessThanOrEqual(6);
  }, 900_000);

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
    expect(blackSea(seed).russianDays).toBeLessThanOrEqual(DAYS / 3);
  }, 300_000);

  // UK government statements in early 2024 put the Black Sea Fleet's losses at about a third of its ships over two
  // years of war, about one hull a month. Judgement: at most 3 surface hulls in a month.
  it.each(SEEDS)('the Black Sea Fleet loses ships at the 2023-24 rate, not all at once (seed %i)', (seed) => {
    expect(blackSea(seed).rusSurfaceLost).toBeLessThanOrEqual(3);
  }, 300_000);

  // GUR and SBU sea-drone raids came every one to three weeks (Ivanovets 1 Feb, Tsezar Kunikov 14 Feb,
  // Sergei Kotov 5 Mar 2024), each with 5-10 boats. Judgement: at most 30 boats spent in a month.
  it.each(SEEDS)('Ukraine paces its strike USV raids instead of spending them in days (seed %i)', (seed) => {
    expect(blackSea(seed).usvSpent).toBeLessThanOrEqual(30);
  }, 300_000);

  // The Ukrainian corridor from Odesa ran at close to pre-war volumes through 2024 (Ukrainian Sea Ports
  // Authority). Judgement: Russia interdicts at most a quarter of Ukraine's seaborne trade.
  it.each(SEEDS)("Ukraine's seaborne trade is not blockaded (seed %i)", (seed) => {
    expect(blackSea(seed).ukrTradeBlocked).toBeLessThanOrEqual(0.25);
  }, 300_000);
});

interface BlackSeaRun { russianDays: number; rusSurfaceLost: number; usvSpent: number; ukrTradeBlocked: number }
const blackSeaRuns = new Map<number, BlackSeaRun>();
function blackSea(seed: number): BlackSeaRun {
  let r = blackSeaRuns.get(seed);
  if (r) return r;
  const s = createSession('ukraine-2026', seed);
  const odesaSea = nearestSea(s.map, 46.5, 30.7) as NodeId;
  const start = { RUS: fielded(s.world, s.catalog, 'RUS'), UKR: fielded(s.world, s.catalog, 'UKR') };
  let russianDays = 0;
  for (let d = 0; d < DAYS; d++) {
    measureRun(s.engine, s.world, s.map, 1);
    const c = s.world.theater.seaControl[odesaSea];
    if (c?.nation === 'RUS' && c.level >= WORKING_CONTROL) russianDays++;
  }
  const end = { RUS: fielded(s.world, s.catalog, 'RUS'), UKR: fielded(s.world, s.catalog, 'UKR') };
  const rusSurfaceLost = [...SURFACE, 'patrol', 'amphibious'].reduce((a, c) => a + (start.RUS[c as PlatformClass] ?? 0) - (end.RUS[c as PlatformClass] ?? 0), 0);
  const usvSpent = (start.UKR.usv ?? 0) - (end.UKR.usv ?? 0);
  r = { russianDays, rusSurfaceLost, usvSpent, ukrTradeBlocked: s.world.theater.tradeBlocked['UKR' as NationId] ?? 0 };
  blackSeaRuns.set(seed, r);
  console.log(`ukraine seed ${seed}: Russian working control off Odesa ${russianDays}/${DAYS} days; RUS surface hulls lost ${rusSurfaceLost}; UKR USVs spent ${usvSpent}; UKR trade blocked ${r.ukrTradeBlocked.toFixed(2)}`);
  return r;
}

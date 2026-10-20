import type { Catalog } from '../core/catalog';
import type { Engine } from '../core/engine';
import type { GameMap } from '../core/map';
import type { Domain, Munition, MunitionId, MunitionKind, NationId, NodeId, PlatformClass, PlatformId, SimEvent, World } from '../core/types';

/** What happened in a run, aggregated per nation. The common currency for calibration. */
export interface RunMetrics {
  days: number;
  nations: Record<string, NationMetrics>;
  wars: { a: string; b: string; since: number }[];
  nuclearDetonations: { by: string; yieldKt: number; casualties: number; day: number }[];
  capitulations: { nation: string; day: number }[];
  msPerTick: number;
}

export interface NationMetrics {
  /** Land cells controlled minus at start. */
  territoryDelta: number;
  /** Platforms lost (destroyed + damaged-not-repaired is not tracked; destroyed via battle and strike accounting) by class. */
  lossesByClass: Partial<Record<PlatformClass, number>>;
  lossesByDomain: Partial<Record<Domain, number>>;
  /** Personnel casualties from land battles. */
  casualties: number;
  /** Cruise and ballistic missiles this nation fired (the 'missiles' line of Ukrainian Air Force tallies). */
  missilesFired: number;
  /** Of the missiles this nation fired, how many the enemy shot down. */
  missilesIntercepted: number;
  /** Every strike weapon this nation fired, by how open-source tallies count it; intercepted = shot down by the enemy. */
  strikes: Partial<Record<StrikeWeaponClass, { fired: number; intercepted: number }>>;
  /** The same, split by the nation holding the target cell (sea targets are left out). */
  strikesOn: Record<string, Partial<Record<StrikeWeaponClass, { fired: number; intercepted: number }>>>;
  /**
   * Mean share of this nation's front-line cells (land cells touching an enemy-held
   * cell) over which it held air control at level >= 0.5, sampled every tick.
   */
  frontAirControl: number;
  /** Interceptor rounds (SAM, ABM, SHORAD missile) in magazines and national stockpile, at start and end. */
  interceptors: { start: number; end: number };
  formationsDestroyed: number;
  warSupport: number;
  mobilization: number;
  civilianDeaths: number;
}

/**
 * How open-source tallies count a strike weapon. 'one_way_drone' is a long-range
 * Shahed-class drone (FPVs and tactical loitering munitions are 'tactical');
 * 'air_ordnance' is what aircraft and helicopters drop or fire at the front
 * (rockets, ATGMs, bombs, ARMs), which daily air-defense reports do not count.
 */
export type StrikeWeaponClass = 'one_way_drone' | 'cruise_missile' | 'ballistic_missile' | 'glide_bomb' | 'air_ordnance' | 'tactical';

const LONG_RANGE_DRONE_KM = 300;
const WEAPON_CLASS: Record<MunitionKind, StrikeWeaponClass> = {
  srbm: 'ballistic_missile', mrbm: 'ballistic_missile', irbm: 'ballistic_missile', icbm: 'ballistic_missile', slbm: 'ballistic_missile', hgv: 'ballistic_missile', antiship_ballistic: 'ballistic_missile', abm: 'ballistic_missile',
  cruise: 'cruise_missile', antiship_cruise: 'cruise_missile',
  glide_bomb: 'glide_bomb',
  drone_oneway: 'one_way_drone', loitering: 'one_way_drone',
  guided_bomb: 'air_ordnance', unguided_bomb: 'air_ordnance', arm: 'air_ordnance', rocket: 'air_ordnance', guided_rocket: 'air_ordnance', atgm: 'air_ordnance', aam: 'air_ordnance',
  sam: 'tactical', shorad_missile: 'tactical', shell: 'tactical', guided_shell: 'tactical', torpedo: 'tactical', mine: 'tactical', small_arms: 'tactical',
};

export function strikeWeaponClass(m: Munition): StrikeWeaponClass {
  const c = WEAPON_CLASS[m.kind];
  return c === 'one_way_drone' && m.rangeKm < LONG_RANGE_DRONE_KM ? 'tactical' : c;
}

const INTERCEPTOR_KINDS: ReadonlySet<MunitionKind> = new Set(['sam', 'abm', 'shorad_missile']);

function interceptorStock(world: World, catalog: Catalog): Map<NationId, number> {
  const out = new Map<NationId, number>();
  const add = (n: NationId, id: string, count: number) => {
    const m = catalog.munitions.get(id as MunitionId);
    if (m && INTERCEPTOR_KINDS.has(m.kind)) out.set(n, (out.get(n) ?? 0) + count);
  };
  for (const f of Object.values(world.formations)) if (f.status !== 'destroyed') for (const [id, c] of Object.entries(f.magazine)) add(f.nation, id, c);
  for (const n of Object.values(world.nations)) for (const [id, c] of Object.entries(n.stockpile)) add(n.id, id, c);
  return out;
}

/**
 * Adds, per nation, the front cells of its wars (cells on either side of a line
 * between enemies) and those over which it holds air control at level >= 0.5.
 */
function sampleFrontAir(world: World, map: GameMap, front: Map<NationId, number>, held: Map<NationId, number>) {
  const atWar = (a: NationId, b: NationId) => a !== b && !!(world.relations[`${a}|${b}`] ?? world.relations[`${b}|${a}`])?.atWar;
  const sides = new Set<NationId>();
  for (let n = 0; n < map.landCount; n++) {
    const c = world.control[n];
    if (!c) continue;
    sides.clear();
    for (let i = map.adjStart[n]; i < map.adjStart[n + 1]; i++) {
      const o = map.adj[i] < map.landCount ? world.control[map.adj[i]] : undefined;
      if (o && atWar(c, o)) sides.add(o);
    }
    if (!sides.size) continue;
    sides.add(c);
    for (const s of sides) front.set(s, (front.get(s) ?? 0) + 1);
    const air = world.theater.airControl[n as NodeId];
    if (air && air.level >= 0.5) held.set(air.nation, (held.get(air.nation) ?? 0) + 1);
  }
}

function totals(world: World, catalog: Catalog): Map<NationId, Map<PlatformId, number>> {
  const out = new Map<NationId, Map<PlatformId, number>>();
  for (const f of Object.values(world.formations)) {
    if (f.status === 'destroyed') continue;
    const m = out.get(f.nation) ?? new Map();
    for (const [p, n] of Object.entries(f.equipment)) m.set(p as PlatformId, (m.get(p as PlatformId) ?? 0) + n);
    for (const [p, n] of Object.entries(f.damaged)) m.set(p as PlatformId, (m.get(p as PlatformId) ?? 0) + n);
    out.set(f.nation, m);
  }
  void catalog;
  return out;
}

/**
 * Run `days` and measure. Losses are counted as the drop in each nation's total
 * fielded platforms (operational + under repair), net of replacements, so they
 * are comparable with open-source loss tallies like Oryx.
 */
export function measureRun(engine: Engine, world: World, map: GameMap, days: number): RunMetrics {
  const catalog = engine.catalog;
  const ticks = Math.round((days * 24) / world.dtHours);
  const startControl = [...world.control];
  const startTotals = totals(world, catalog);
  const startPop = new Map(Object.values(world.nations).map((n) => [n.id, n.population]));
  const per = new Map<string, NationMetrics>();
  const get = (n: string) => {
    let m = per.get(n);
    if (!m) per.set(n, (m = { territoryDelta: 0, lossesByClass: {}, lossesByDomain: {}, casualties: 0, missilesFired: 0, missilesIntercepted: 0, strikes: {}, strikesOn: {}, frontAirControl: 0, interceptors: { start: 0, end: 0 }, formationsDestroyed: 0, warSupport: 0, mobilization: 0, civilianDeaths: 0 }));
    return m;
  };
  const nukes: RunMetrics['nuclearDetonations'] = [];
  const caps: RunMetrics['capitulations'] = [];
  const startInterceptors = interceptorStock(world, catalog);
  const frontCells = new Map<NationId, number>(), frontHeld = new Map<NationId, number>();
  const t0 = performance.now();
  for (let i = 0; i < ticks; i++) {
    const day = (world.tick * world.dtHours) / 24;
    for (const e of engine.step(world) as SimEvent[]) {
      if (e.type === 'battle') for (const [n, c] of Object.entries(e.casualties)) get(n).casualties += c;
      else if (e.type === 'strike') {
        const m = catalog.munitions.get(e.munition);
        const cls = m ? strikeWeaponClass(m) : 'air_ordnance';
        const by = get(e.by), victim = map.isSea(e.target) ? undefined : world.control[e.target];
        for (const t of [(by.strikes[cls] ??= { fired: 0, intercepted: 0 }), ...(victim ? [((by.strikesOn[victim] ??= {})[cls] ??= { fired: 0, intercepted: 0 })] : [])]) {
          t.fired += e.fired;
          t.intercepted += e.intercepted;
        }
        if (cls === 'cruise_missile' || cls === 'ballistic_missile') {
          by.missilesFired += e.fired;
          by.missilesIntercepted += e.intercepted;
        }
      }
      else if (e.type === 'formation_destroyed') get(e.nation).formationsDestroyed++;
      else if (e.type === 'nuclear_detonation') nukes.push({ by: e.by, yieldKt: e.yieldKt, casualties: e.casualties, day });
      else if (e.type === 'capitulation') caps.push({ nation: e.nation, day });
    }
    sampleFrontAir(world, map, frontCells, frontHeld);
  }
  const msPerTick = (performance.now() - t0) / ticks;
  const endTotals = totals(world, catalog);
  for (const [nation, start] of startTotals) {
    const end = endTotals.get(nation) ?? new Map();
    for (const [pid, n] of start) {
      const lost = n - (end.get(pid) ?? 0);
      if (lost <= 0) continue;
      const p = catalog.platform(pid);
      const m = get(nation);
      m.lossesByClass[p.class] = (m.lossesByClass[p.class] ?? 0) + lost;
      m.lossesByDomain[p.domain] = (m.lossesByDomain[p.domain] ?? 0) + lost;
    }
  }
  for (let n = 0; n < map.landCount; n++) {
    if (startControl[n] === world.control[n]) continue;
    if (startControl[n]) get(startControl[n]).territoryDelta--;
    if (world.control[n]) get(world.control[n]).territoryDelta++;
  }
  const endInterceptors = interceptorStock(world, catalog);
  for (const [n, cells] of frontCells) get(n).frontAirControl = (frontHeld.get(n) ?? 0) / cells;
  for (const m of per.keys()) {
    const n = m as NationId;
    get(n).interceptors = { start: startInterceptors.get(n) ?? 0, end: endInterceptors.get(n) ?? 0 };
  }
  for (const n of Object.values(world.nations)) {
    const m = per.get(n.id);
    if (!m && n.status === 'peace') continue;
    const mm = m ?? get(n.id);
    mm.warSupport = n.warSupport;
    mm.mobilization = n.mobilization;
    mm.civilianDeaths = Math.max(0, (startPop.get(n.id) ?? 0) - n.population);
  }
  const wars = Object.entries(world.relations).filter(([, r]) => r.atWar).map(([k, r]) => { const [a, b] = k.split('|'); return { a, b, since: r.warSince ?? 0 }; });
  return { days, nations: Object.fromEntries(per), wars, nuclearDetonations: nukes, capitulations: caps, msPerTick };
}

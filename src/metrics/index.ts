import type { Catalog } from '../core/catalog';
import type { Engine } from '../core/engine';
import type { GameMap } from '../core/map';
import { economyProbe, type EconomyMetrics } from './economy';
import type { Domain, NationId, PlatformClass, PlatformId, SimEvent, World } from '../core/types';

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
  /** Platforms knocked out in battle events (destroyed, damaged or abandoned), before repair and replacement: comparable with Oryx's visually confirmed tallies. */
  battleLossesByClass: Partial<Record<PlatformClass, number>>;
  /** Personnel casualties from land battles. */
  casualties: number;
  missilesFired: number;
  missilesIntercepted: number;
  formationsDestroyed: number;
  warSupport: number;
  mobilization: number;
  civilianDeaths: number;
  economy?: EconomyMetrics;
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
    if (!m) per.set(n, (m = { territoryDelta: 0, lossesByClass: {}, lossesByDomain: {}, battleLossesByClass: {}, casualties: 0, missilesFired: 0, missilesIntercepted: 0, formationsDestroyed: 0, warSupport: 0, mobilization: 0, civilianDeaths: 0 }));
    return m;
  };
  const nukes: RunMetrics['nuclearDetonations'] = [];
  const caps: RunMetrics['capitulations'] = [];
  const eco = economyProbe(world, catalog);
  const t0 = performance.now();
  for (let i = 0; i < ticks; i++) {
    eco.tick();
    const day = (world.tick * world.dtHours) / 24;
    for (const e of engine.step(world) as SimEvent[]) {
      if (e.type === 'battle') {
        for (const [n, c] of Object.entries(e.casualties)) get(n).casualties += c;
        for (const [n, lost] of Object.entries(e.losses)) {
          const g = get(n).battleLossesByClass;
          for (const [pid, k] of Object.entries(lost)) {
            const cls = catalog.platform(pid as PlatformId).class;
            g[cls] = (g[cls] ?? 0) + k;
          }
        }
      }
      else if (e.type === 'strike') { get(e.by).missilesFired += e.fired; const victim = world.control[e.target]; if (victim) get(victim).missilesIntercepted += e.intercepted; }
      else if (e.type === 'formation_destroyed') get(e.nation).formationsDestroyed++;
      else if (e.type === 'nuclear_detonation') nukes.push({ by: e.by, yieldKt: e.yieldKt, casualties: e.casualties, day });
      else if (e.type === 'capitulation') caps.push({ nation: e.nation, day });
    }
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
  for (const n of Object.values(world.nations)) {
    const m = per.get(n.id);
    if (!m && n.status === 'peace') continue;
    const mm = m ?? get(n.id);
    mm.warSupport = n.warSupport;
    mm.mobilization = n.mobilization;
    mm.civilianDeaths = Math.max(0, (startPop.get(n.id) ?? 0) - n.population);
    mm.economy = eco.finish(n.id);
  }
  const wars = Object.entries(world.relations).filter(([, r]) => r.atWar).map(([k, r]) => { const [a, b] = k.split('|'); return { a, b, since: r.warSince ?? 0 }; });
  return { days, nations: Object.fromEntries(per), wars, nuclearDetonations: nukes, capitulations: caps, msPerTick };
}

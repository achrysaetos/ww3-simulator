import type { SimContext, System } from '../../core/engine';
import { relationMut } from '../../core/engine';
import type { GameMap } from '../../core/map';
import type { ItemId, MunitionId, Nation, NationId, PlatformId, World } from '../../core/types';
import {
  CATEGORIES, MIL_FUEL_TONS_PER_USD_M, RATION_TONS_PER_DAY, RESOURCES, RESOURCE_SPECS, SHIPBUILDING_GT_PER_YEAR, SHIPYARD_WARSHIP_SHARE,
  itemSpec, type ItemCategory, type Resource,
} from '../../data/industry';
import { bufferMonths, newLine, newNationEconomy, type LineState, type NationEconomy } from './state';

export type { EconomyState, LineState, NationEconomy } from './state';

const HOURS_PER_MONTH = 730;
const REPORT_HOURS = 720;

/**
 * Peak defence share of GDP at mobilization 1. WWII peaks: US ~37% (1944), UK ~55%,
 * USSR ~60% (Harrison, The Economics of World War II, 1998).
 */
const MAX_DEFENSE_SHARE = 0.5;
/** Extra revenue a state can raise in war, share of GDP at mobilization 1. US federal receipts rose from ~7% to ~20% of GDP 1940-45. */
const WAR_TAX_SHARE = 0.12;
/** Months for the economy to convert toward a new mobilization level (contracts, laws, labour). Demobilization is faster. */
const MOBILIZE_MONTHS = 3;
const DEMOBILIZE_MONTHS = 1;
/**
 * Share of a sanctioning partner's trade that still arrives through third countries.
 * Russia's imports of Western dual-use chips recovered largely via China, Turkey and Central Asia (KSE 2023-24).
 */
const SANCTION_LEAK = 0.3;
/** Months of normal flow needed to rebuild one month of drawn-down stocks. */
const BUFFER_REFILL_PER_MONTH = 0.25;
/** Fraction of imports that GDP cannot replace at home in the short run (est.). */
const IMPORT_GDP_LOSS = 0.5;
const ENERGY_GDP_ELASTICITY = 0.7;
const FOOD_GDP_ELASTICITY = 0.3;
/** Peacetime under-arms ceiling: standing forces plus 1% of the population as reserves (createWorld's default). */
const BASE_RESERVE_SHARE = 0.01;
/**
 * Under-arms ceiling at full mobilization, share of population at a 65% working-age share.
 * WWII peaks: USSR and Germany ~12-13%, US ~9%.
 */
const MAX_UNDER_ARMS_SHARE = 0.12;
/**
 * Monthly call-up at mobilization 1, share of population. The US Army grew by ~4M in
 * 1942 (~330k a month on 134M people). Russia's 2022 partial mobilization (300k in about
 * two months) corresponds to mobilization ~0.4.
 */
const INTAKE_POP_SHARE = 0.0025;
/** Mean months from call-up to a usable reservist: Russia 2022 weeks, Ukraine 1-2 months, NATO basic plus branch 3-6 months. */
const TRAINING_MONTHS = 2.5;
/** Full mobilization quadruples peacetime military fuel draw (est.). */
const FUEL_MOBILIZATION_MULTIPLE = 4;
const SHORT_BELOW = 0.8;
const RECOVERED_ABOVE = 0.95;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lag = (dtMonths: number, tauMonths: number) => 1 - Math.exp(-dtMonths / tauMonths);

function peaceShare(n: Nation): number {
  return Math.max(0.005, (n.stats.milexPctGdp ?? 2) / 100);
}

/** Defence spending as a share of GDP at the nation's current mobilization. */
export function defenseShare(n: Nation): number {
  const s0 = peaceShare(n);
  return s0 + n.mobilization * Math.max(0, MAX_DEFENSE_SHARE - s0);
}

/**
 * Economic pressure on war support, 0..1: deficit-financed war spending, energy and
 * food shortfalls, lost output, and debt. Pure; diplomacy reads it to erode warSupport.
 */
export function economicStress(world: World, nation: NationId): number {
  const e = world.slices.economy?.nations[nation];
  const n = world.nations[nation];
  if (!e || !n) return 0;
  const gdpB = ((n.stats.gdp ?? 0) / 1e9) * e.gdpIndex;
  const debtB = ((n.stats.govDebtPctGdp ?? 60) / 100) * ((n.stats.gdp ?? 0) / 1e9) - n.treasuryUsdB;
  const debtRatio = gdpB > 0 ? debtB / gdpB : 0;
  return clamp01(
    0.35 * clamp01(e.deficitPctGdp / 0.25) +
      0.3 * (1 - e.supply.energy) +
      0.35 * (1 - e.supply.food) +
      0.3 * (1 - e.gdpIndex) +
      0.15 * clamp01((debtRatio - 1.2) / 1.5),
  );
}

// ---------------------------------------------------------------- per-tick world scans

const ownerIndexCache = new WeakMap<GameMap, Int32Array>();
function ownerIndex(map: GameMap): Int32Array {
  let idx = ownerIndexCache.get(map);
  if (!idx) {
    const pos = new Map(map.nationIds.map((id, i) => [id, i]));
    idx = new Int32Array(map.landCount);
    for (let n = 0; n < map.landCount; n++) idx[n] = pos.get(map.owner[n]) ?? -1;
    ownerIndexCache.set(map, idx);
  }
  return idx;
}

/** Population-weighted share of each nation's home cells that are intact and still under its control. */
function industrialIntegrity(world: World, map: GameMap): Map<NationId, number> {
  const idx = ownerIndex(map);
  const intact = new Float64Array(map.nationIds.length);
  const total = new Float64Array(map.nationIds.length);
  const infra = world.theater.infrastructure;
  for (let n = 0; n < map.landCount; n++) {
    const i = idx[n];
    if (i < 0) continue;
    const w = map.popShare[n];
    total[i] += w;
    if (world.control[n] === map.owner[n]) intact[i] += w * (infra[n] ?? 1);
  }
  const out = new Map<NationId, number>();
  map.nationIds.forEach((id, i) => out.set(id, total[i] > 0 ? intact[i] / total[i] : 1));
  return out;
}

/** For each nation, the partners whose trade it has lost: 0 for war, the leak share for sanctions. */
function tradePartners(world: World): Map<NationId, Map<NationId, number>> {
  const out = new Map<NationId, Map<NationId, number>>();
  const put = (a: NationId, b: NationId, v: number) => {
    let m = out.get(a);
    if (!m) out.set(a, (m = new Map()));
    m.set(b, v);
  };
  for (const [k, r] of Object.entries(world.relations)) {
    if (!r.atWar && !r.sanctions) continue;
    const [a, b] = k.split('|') as NationId[];
    const v = r.atWar ? 0 : SANCTION_LEAK;
    put(a, b, v);
    put(b, a, v);
  }
  return out;
}

interface Scan {
  integrity: Map<NationId, number>;
  cut: Map<NationId, Map<NationId, number>>;
  personnel: Map<NationId, number>;
  worldGdp: number;
}

function scan(world: World, ctx: SimContext): Scan {
  const personnel = new Map<NationId, number>();
  for (const f of Object.values(world.formations)) if (f.status !== 'destroyed') personnel.set(f.nation, (personnel.get(f.nation) ?? 0) + f.personnel);
  let worldGdp = 0;
  for (const n of Object.values(world.nations)) worldGdp += n.stats.gdp ?? 0;
  return { integrity: industrialIntegrity(world, ctx.map), cut: tradePartners(world), personnel, worldGdp };
}

// ---------------------------------------------------------------- per-nation model

/** How much of a supplier's exports reach `buyer`, 0..1. */
function supplierFlow(world: World, s: Scan, buyer: NationId, supplier: string): number {
  if (supplier === 'other' || !world.nations[supplier as NationId]) return 1;
  const cut = s.cut.get(buyer)?.get(supplier as NationId);
  const politics = cut ?? 1;
  return politics * (1 - (world.theater.tradeBlocked[supplier as NationId] ?? 0)) * (s.integrity.get(supplier as NationId) ?? 1);
}

function rawAccess(world: World, s: Scan, n: Nation, r: Resource): number {
  const spec = RESOURCE_SPECS[r];
  const self = clamp01(spec.selfSufficiency[n.id] ?? spec.defaultSelf(n.stats));
  if (self >= 1) return 1;
  let num = 0, den = 0;
  for (const [supplier, share] of Object.entries(spec.market)) {
    if (supplier === n.id) continue;
    den += share;
    num += share * supplierFlow(world, s, n.id, supplier);
  }
  const imported = (den > 0 ? num / den : 1) * (1 - (world.theater.tradeBlocked[n.id] ?? 0));
  return self + (1 - self) * imported;
}

/** National stocks cover a shortfall until they run out, then the shortfall bites. */
function drawSupply(e: NationEconomy, id: NationId, r: Resource, raw: number, dtMonths: number): number {
  const shortfall = 1 - raw;
  if (shortfall <= 1e-3) {
    e.buffers[r] = Math.min(bufferMonths(id, r), e.buffers[r] + BUFFER_REFILL_PER_MONTH * dtMonths);
    return raw;
  }
  if (e.buffers[r] > 0) {
    e.buffers[r] = Math.max(0, e.buffers[r] - shortfall * dtMonths);
    return 1;
  }
  return raw;
}

function tradeLossOf(world: World, s: Scan, n: Nation): number {
  let lost = 0;
  const gdpOthers = s.worldGdp - (n.stats.gdp ?? 0);
  for (const [p, flow] of s.cut.get(n.id) ?? []) lost += ((world.nations[p]?.stats.gdp ?? 0) / gdpOthers) * (1 - flow);
  const blocked = world.theater.tradeBlocked[n.id] ?? 0;
  return clamp01(1 - (1 - blocked) * (1 - clamp01(lost)));
}

function categoryFactor(e: NationEconomy, cat: ItemCategory): number {
  let f = e.integrity;
  for (const [r, w] of Object.entries(CATEGORIES[cat].inputs) as [Resource, number][]) f *= 1 - w * (1 - e.supply[r]);
  return Math.max(0, f);
}

function runLine(n: Nation, e: NationEconomy, line: LineState, spendMultiple: number, dtMonths: number): void {
  const pull = Math.max(line.baselinePerMonth * spendMultiple, line.orderPerMonth ?? 0);
  const target = Math.min(line.surgePerMonth, pull);
  line.capacityPerMonth += (target - line.capacityPerMonth) * lag(dtMonths, line.rampMonths);
  const rate = line.orderPerMonth === null ? line.capacityPerMonth : Math.min(line.capacityPerMonth, line.orderPerMonth);
  const spec = itemSpec(line.item);
  const out = rate * dtMonths * categoryFactor(e, spec?.category ?? 'bulk_ammo') + line.carry;
  let whole = Math.floor(out);
  line.carry = out - whole;
  if (line.maxTotal !== null) whole = Math.min(whole, line.maxTotal - line.built);
  if (whole <= 0) return;
  line.built += whole;
  e.produced[line.item] = (e.produced[line.item] ?? 0) + whole;
  const sink = spec?.sink ?? { kind: 'stockpile' };
  if (sink.kind === 'bulk_ammo') n.bulk.ammo += whole * sink.tonsPerUnit;
  else n.stockpile[line.item] = (n.stockpile[line.item] ?? 0) + whole;
}

function announceShortages(world: World, ctx: SimContext, id: NationId, e: NationEconomy): void {
  for (const r of RESOURCES) {
    const flagged = e.short.includes(r);
    if (!flagged && e.supply[r] < SHORT_BELOW) {
      e.short.push(r);
      ctx.emit({ type: 'shortage', tick: world.tick, nation: id, what: r });
    } else if (flagged && e.supply[r] > RECOVERED_ABOVE) e.short = e.short.filter((x) => x !== r);
  }
}

function stepNation(world: World, ctx: SimContext, s: Scan, n: Nation, e: NationEconomy, dtMonths: number): void {
  if (e.mobilizationTarget !== null) {
    const tau = e.mobilizationTarget > n.mobilization ? MOBILIZE_MONTHS : DEMOBILIZE_MONTHS;
    n.mobilization += (e.mobilizationTarget - n.mobilization) * lag(dtMonths, tau);
  }
  e.integrity = s.integrity.get(n.id) ?? 1;
  e.tradeLoss = tradeLossOf(world, s, n);
  for (const r of RESOURCES) e.supply[r] = drawSupply(e, n.id, r, rawAccess(world, s, n, r), dtMonths);
  announceShortages(world, ctx, n.id, e);

  e.gdpIndex =
    e.integrity *
    (1 - ENERGY_GDP_ELASTICITY * (1 - e.supply.energy)) *
    (1 - FOOD_GDP_ELASTICITY * (1 - e.supply.food)) *
    (1 - ((n.stats.importsPctGdp ?? 30) / 100) * e.tradeLoss * IMPORT_GDP_LOSS);

  const gdpB = ((n.stats.gdp ?? 0) / 1e9) * e.gdpIndex;
  const share = defenseShare(n);
  const s0 = peaceShare(n);
  const deficitB = gdpB * (share - s0 - WAR_TAX_SHARE * n.mobilization);
  e.deficitPctGdp = gdpB > 0 ? deficitB / gdpB : 0;
  n.treasuryUsdB -= deficitB * (dtMonths / 12);

  const spendMultiple = share / s0;
  for (const line of Object.values(e.lines)) runLine(n, e, line, spendMultiple, dtMonths);

  const fuelPerMonth = (((n.stats.milexUsd ?? 0) / 1e6) * MIL_FUEL_TONS_PER_USD_M / 12) * (1 + (FUEL_MOBILIZATION_MULTIPLE - 1) * n.mobilization);
  n.bulk.fuel = Math.min(Math.max(n.bulk.fuel, fuelPerMonth * 6), n.bulk.fuel + fuelPerMonth * dtMonths * Math.min(1, 2 * e.supply.energy));

  const personnel = s.personnel.get(n.id) ?? 0;
  const underArms = n.reserves + e.inTraining + personnel;
  const foodPerMonth = underArms * RATION_TONS_PER_DAY * 30.4;
  n.bulk.food = Math.min(Math.max(n.bulk.food, foodPerMonth * 6), n.bulk.food + foodPerMonth * dtMonths * Math.min(1, 1.5 * e.supply.food));

  const standing = n.stats.armedForces ?? 0;
  const base = standing + BASE_RESERVE_SHARE * n.population;
  const workingAge = (n.stats.workingAgePct ?? 65) / 65;
  const ceiling = Math.max(base, MAX_UNDER_ARMS_SHARE * n.population * workingAge);
  const cap = base + n.mobilization * (ceiling - base);
  const intake = Math.max(0, Math.min(n.mobilization * n.population * INTAKE_POP_SHARE * dtMonths, cap - underArms));
  e.inTraining += intake;
  const graduates = e.inTraining * lag(dtMonths, TRAINING_MONTHS);
  e.inTraining -= graduates;
  n.reserves += graduates;
}

function report(world: World, ctx: SimContext): void {
  const state = world.slices.economy;
  if ((world.tick + 1 - state.lastReportTick) * world.dtHours < REPORT_HOURS) return;
  state.lastReportTick = world.tick + 1;
  for (const [id, e] of Object.entries(state.nations) as [NationId, NationEconomy][]) {
    for (const [item, count] of Object.entries(e.produced)) ctx.emit({ type: 'production', tick: world.tick, nation: id, item: item as ItemId, count });
    e.produced = {};
  }
}

// ---------------------------------------------------------------- commands

function produce(world: World, ctx: SimContext, nation: NationId, item: ItemId, ratePerMonth: number): void {
  const e = world.slices.economy.nations[nation];
  if (!e) return;
  const rate = Math.max(0, ratePerMonth);
  const existing = e.lines[item];
  if (existing) {
    existing.orderPerMonth = rate;
    return;
  }
  const entry = ctx.catalog.platforms.get(item as PlatformId) ?? ctx.catalog.munitions.get(item as MunitionId);
  if (!entry?.producers.includes(nation)) {
    ctx.emit({ type: 'message', tick: world.tick, nation, text: `${nation} has no industry to build ${item}` });
    return;
  }
  const spec = itemSpec(item);
  let surgePerYear = rate * 12;
  if (spec?.tons) surgePerYear = Math.min(surgePerYear, ((SHIPBUILDING_GT_PER_YEAR[nation] ?? 0) * SHIPYARD_WARSHIP_SHARE) / spec.tons);
  // Greenfield lines take twice their category's ramp: new plant, tooling, and a trained workforce.
  const line = newLine(item, 0, surgePerYear, 2 * CATEGORIES[spec?.category ?? 'cruise_missile'].rampMonths);
  line.orderPerMonth = rate;
  e.lines[item] = line;
}

export const economy: System = {
  id: 'economy',
  commands: ['set_mobilization', 'produce', 'sanction'],

  init(world) {
    world.slices.economy = { nations: {}, lastReportTick: world.tick };
    for (const n of Object.values(world.nations)) world.slices.economy.nations[n.id] = newNationEconomy(n);
  },

  apply(world, cmd, ctx) {
    switch (cmd.type) {
      case 'set_mobilization': {
        const e = world.slices.economy.nations[cmd.nation];
        if (e) e.mobilizationTarget = clamp01(cmd.level);
        return;
      }
      case 'produce':
        return produce(world, ctx, cmd.nation, cmd.item, cmd.ratePerMonth);
      case 'sanction':
        if (cmd.nation !== cmd.target) relationMut(world, cmd.nation, cmd.target).sanctions = cmd.on;
        return;
    }
  },

  step(world, ctx) {
    const dtMonths = world.dtHours / HOURS_PER_MONTH;
    const s = scan(world, ctx);
    for (const [id, e] of Object.entries(world.slices.economy.nations) as [NationId, NationEconomy][]) {
      const n = world.nations[id];
      if (n && n.status !== 'collapsed') stepNation(world, ctx, s, n, e, dtMonths);
    }
    report(world, ctx);
  },
};

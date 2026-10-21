import type { SimContext, System } from '../../core/engine';
import { atWar, hostility, setSanctions } from '../../core/engine';
import type { GameMap } from '../../core/map';
import type { ItemId, MunitionId, Nation, NationId, PlatformId, World } from '../../core/types';
import {
  AID_FLOWS, BASELINE_SANCTIONS, CATEGORIES, DEFAULT_SEABORNE_TRADE_SHARE, ITEMS, MIL_FUEL_TONS_PER_USD_M, SEABORNE_TRADE_SHARE, OIL_CONSUMPTION_MT, OIL_TONS_PER_PPP_USD_M, RATION_TONS_PER_DAY, RESOURCES, RESOURCE_SPECS, SHIPBUILDING_GT_PER_YEAR, SHIPYARD_WARSHIP_SHARE,
  itemSpec, type AidFlow, type ItemCategory, type Resource,
} from '../../data/industry';
import { defenseObligations } from '../../data/nations';
import { recallReservists } from '../../data/nations/reserves';
import { newLine, newNationEconomy, stocksOf, type LineState, type NationEconomy } from './state';

export type { EconomyState, LineState, NationEconomy } from './state';

const HOURS_PER_MONTH = 730;
const REPORT_HOURS = 720;

/**
 * Peak defence share of GDP at mobilization 1. WWII peaks: US ~37% (1944), UK ~55%,
 * USSR ~60% (Harrison, The Economics of World War II, 1998).
 */
const MAX_DEFENSE_SHARE = 0.5;
/** Defence share of a nation at peace with no threat; the 2024 world median is ~1.5-2% (SIPRI). */
const NORMAL_PEACE_SHARE = 0.02;
/**
 * Share of extra war spending paid from taxes rather than borrowing. The US raised ~45%
 * of WWII spending in taxes (Rockoff, NBER 2012); Russia 2023-24 covered most of its
 * defence rise with revenue and ran deficits of ~1-2% of GDP (MinFin).
 */
const WAR_TAX_FINANCED = 0.45;
/** Months for the economy to convert toward a new mobilization level (contracts, laws, labour). Demobilization is faster. */
const MOBILIZE_MONTHS = 3;
const DEMOBILIZE_MONTHS = 1;
/**
 * Share of a partner's trade that still arrives, by why it stopped. Under sanctions, export-
 * controlled inputs (`ResourceSpec.exportControlled`) leak through third countries: Russia's
 * imports of Western dual-use chips recovered largely via China, Turkey and Central Asia (KSE
 * 2023-24). Ordinary goods mostly reroute: Russia's goods imports fell ~15% in 2022 and were back
 * near 2021 levels by 2023 (Bank of Russia balance of payments) though most of the world's GDP
 * sanctioned it, as Chinese, Turkish and Central Asian suppliers replaced Western ones; traded
 * commodities such as oil and grain find other buyers and sellers the same way.
 */
const STILL_ARRIVES: Record<Breach, { goods: number; controlled: number }> = {
  war: { goods: 0, controlled: 0 },
  sanctions: { goods: 0.8, controlled: 0.3 },
};
type Breach = 'war' | 'sanctions';
/** Months of normal flow needed to rebuild one month of drawn-down stocks. */
const BUFFER_REFILL_PER_MONTH = 0.25;
/** Fraction of imports that GDP cannot replace at home in the short run (est.). */
const IMPORT_GDP_LOSS = 0.5;
const ENERGY_GDP_ELASTICITY = 0.7;
/**
 * Electricity's share of final energy use (IEA World Energy Balances: ~20% worldwide, ~18% in
 * Ukraine), the part strikes on the grid take away whatever fuel the nation holds. Ukraine lost
 * about half its generating capacity to strikes in 2024 (Ukrenergo, IEA Ukraine's Energy Security
 * and the Coming Winter 2024) and cut supply with rolling blackouts of up to 12-16 hours a day.
 */
const ELECTRICITY_SHARE = 0.2;
/**
 * Short-run price elasticity of world energy supply and demand combined, with stock
 * releases. Losing ~20% of world oil exports through Hormuz then lifts prices ~2.4x,
 * inside the USD 150-200/bbl range of EIA and IEA closure scenarios from ~USD 75 (est.).
 */
const ENERGY_PRICE_ELASTICITY = 0.25;
const MAX_ENERGY_PRICE = 4;
/**
 * Energy imports cost ~3-5% of GDP for large net importers at 2024 prices (World Bank,
 * IEA); half of a price rise passes through to lost output in the short run (est.;
 * IMF rule of thumb: +USD 10/bbl costs ~0.15% of world GDP).
 */
const ENERGY_BILL_SHARE = 0.04;
const ENERGY_PRICE_PASSTHROUGH = 0.5;
const FOOD_GDP_ELASTICITY = 0.3;
/**
 * Output lost per unit of chip supply short, once inventories are gone. Est., set so the shortfall a
 * Taiwan blockade leaves the US (~30% of its chips) costs ~4% of GDP, against Bloomberg Economics'
 * 2024 estimate of -3.3% for the US and -5% for the world in a blockade's first year.
 */
const SEMI_GDP_ELASTICITY = 0.15;
/** Peacetime under-arms ceiling: standing forces plus 1% of the population as reserves (createWorld's default). */
const BASE_RESERVE_SHARE = 0.01;
/**
 * Under-arms ceiling at full mobilization, share of population at a 65% working-age share.
 * WWII peaks: USSR and Germany ~12-13%, US ~9%.
 */
const MAX_UNDER_ARMS_SHARE = 0.12;
/**
 * Two ways a state fills its ranks; each month it gets whichever yields more.
 *
 * Recruitment bought with money: monthly recruits per head of population per unit of
 * defence share above the peacetime norm. Fitted between Russia's ~30k contract soldiers
 * a month in 2024 at ~8% of GDP (MoD: ~450k contracts signed in 2024; ISW) and Ukraine's
 * ~25-35k mobilized a month at ~34% (Ukrainian MoD statements, 2024).
 */
const INTAKE_PER_DEFENSE_SHARE = 0.003;
/**
 * Conscription: share of the remaining draft pool (src/data/nations/conscription.ts) called
 * up a month at mobilization 1, falling off as mobilization^2.5 so that only a general
 * mobilization drafts at scale. With the default law the pool is ~13% of the population,
 * so this keeps the anchors of a population-wide rate of 0.25% a month: the US Army grew
 * ~4M in 1942 (~330k a month on 134M people); US forces grew ~90k a month in 1950-52 at
 * partial mobilization (0.5 gives ~70k); Russia at 0.35 drafts ~25k a month, below what
 * its contract bonuses buy. A narrow law or a pool drawn down by years of war yields less
 * at the same level: Ukraine's draft at 0.8 yields ~30k a month, not the ~55k its population
 * alone would give, so the ~37k its 34% of GDP buys sets its intake. The call-up follows the ordered level at once, as Ukraine's did in February 2022;
 * factories take months to follow.
 */
const DRAFT_SHARE_PER_MONTH = 0.019;
const CONSCRIPTION_EXPONENT = 2.5;
/** Mean months from call-up to a usable reservist: Russia 2022 weeks, Ukraine 1-2 months, NATO basic plus branch 3-6 months. */
const TRAINING_MONTHS = 2.5;
/** Full mobilization quadruples the fuel a military's budget buys (est.). */
const FUEL_MOBILIZATION_MULTIPLE = 4;
/** Military depot capacity, months of peacetime fuel use; scenarios start them half full (initialStockpiles). */
const DEPOT_MONTHS = 6;
/**
 * Share of national oil use a state can route to its forces. In peacetime militaries
 * burn ~1-2% (US DoD ~11.6 Mt of ~1,000 Mt); in WWII the US armed forces took about a
 * third of US petroleum output (Petroleum Administration for War, 1946). Linear between (est.).
 */
const MIL_OIL_SHARE_PEACE = 0.02;
const MIL_OIL_SHARE_FULL = 0.3;
const SHORT_BELOW = 0.8;
const RECOVERED_ABOVE = 0.95;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const DAYS_PER_MONTH = 30.4;
/** Months of peacetime fuel use a scenario's depots open with (initialStockpiles). */
const OPENING_DEPOT_MONTHS = 3;

/**
 * Fuel a military buys a month at peace: what its budget buys, and never less than its fielded
 * forces burn at peacetime readiness. Peacetime forces are funded for their own training fuel,
 * whether the bill sits in a defence budget or, for gendarmeries and security forces with no
 * reported defence spending (Costa Rica, Panama, Iceland), in an interior ministry's.
 */
function peaceFuelPerMonthOf(world: World, n: Nation): number {
  const budget = ((n.stats.milexUsd ?? 0) / 1e6) * MIL_FUEL_TONS_PER_USD_M / 12;
  return Math.max(budget, (world.slices.logistics?.peaceBurn?.[n.id] ?? 0) * DAYS_PER_MONTH);
}
const lag = (dtMonths: number, tauMonths: number) => 1 - Math.exp(-dtMonths / tauMonths);

function peaceShare(n: Nation): number {
  return Math.max(0.005, (n.stats.milexPctGdp ?? 2) / 100);
}

/**
 * Defence spending as a share of GDP at the nation's current mobilization, never below
 * what the baseline stats already show it spending. Mobilization buys spending
 * quadratically: partial mobilization (0.5) matches the US Korean War peak of ~14% of
 * GDP (OMB Historical Tables 3.1, 1953), full mobilization (1) the WWII peaks. Nations
 * whose baseline is already wartime (Russia 7.1%, Ukraine 34%; SIPRI 2025) need a high level before
 * spending rises further, so a scenario's "partial mobilization" for Russia keeps it near
 * the 6-9% it spends in 2024-25 (SIPRI 2025) instead of tripling it.
 */
export function defenseShare(n: Nation): number {
  return Math.max(peaceShare(n), NORMAL_PEACE_SHARE + (MAX_DEFENSE_SHARE - NORMAL_PEACE_SHARE) * n.mobilization ** 2);
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

/**
 * Grid capacity per land cell, 0..1, absent = intact. Written by air strikes on power targets
 * (theater.power); read through this narrow view so the economy runs on worlds without it.
 */
const powerOf = (world: World): Record<number, number> | undefined => (world.theater as { power?: Record<number, number> }).power;

/** Population-weighted grid capacity serving the home cells each nation still holds, 0..1. */
function gridIntact(world: World, map: GameMap): Map<NationId, number> {
  const out = new Map<NationId, number>();
  const power = powerOf(world);
  if (!power) return out;
  const idx = ownerIndex(map);
  const intact = new Float64Array(map.nationIds.length);
  const held = new Float64Array(map.nationIds.length);
  for (let n = 0; n < map.landCount; n++) {
    const i = idx[n];
    if (i < 0 || world.control[n] !== map.owner[n]) continue;
    held[i] += map.popShare[n];
    intact[i] += map.popShare[n] * (power[n] ?? 1);
  }
  map.nationIds.forEach((id, i) => out.set(id, held[i] > 0 ? intact[i] / held[i] : 1));
  return out;
}

/** For each nation, the partners whose trade it has lost and why. */
function tradePartners(world: World): Map<NationId, Map<NationId, Breach>> {
  const out = new Map<NationId, Map<NationId, Breach>>();
  const put = (a: NationId, b: NationId, v: Breach) => {
    let m = out.get(a);
    if (!m) out.set(a, (m = new Map()));
    m.set(b, v);
  };
  for (const { a, b, war } of hostility(world).pairs) {
    const v: Breach = war ? 'war' : 'sanctions';
    put(a, b, v);
    put(b, a, v);
  }
  return out;
}

interface Scan {
  integrity: Map<NationId, number>;
  grid: Map<NationId, number>;
  cut: Map<NationId, Map<NationId, Breach>>;
  personnel: Map<NationId, number>;
  worldGdp: number;
  /** Each resource's import flow for a buyer that trades with every supplier and is not one itself, which most nations are. */
  openMarket: Map<Resource, ImportFlow>;
}

/** Share-weighted flow arriving from a resource's suppliers, and the shares counted. */
interface ImportFlow {
  num: number;
  den: number;
}

/** Each resource's suppliers and their shares, listed once: the specs are constants. */
const MARKETS = new Map(RESOURCES.map((r) => [r, Object.entries(RESOURCE_SPECS[r].market)]));

function scan(world: World, ctx: SimContext): Scan {
  const integrity = industrialIntegrity(world, ctx.map);
  for (const [id, v] of integrity) integrity.set(id, v / (world.slices.economy.nations[id]?.baseIntegrity || 1));
  const personnel = new Map<NationId, number>();
  for (const f of Object.values(world.formations)) if (f.status !== 'destroyed') personnel.set(f.nation, (personnel.get(f.nation) ?? 0) + f.personnel);
  let worldGdp = 0;
  for (const n of Object.values(world.nations)) worldGdp += n.stats.gdp ?? 0;
  const s: Scan = { integrity, grid: gridIntact(world, ctx.map), cut: tradePartners(world), personnel, worldGdp, openMarket: new Map() };
  for (const r of RESOURCES) s.openMarket.set(r, importFlow(world, s, undefined, r));
  return s;
}

// ---------------------------------------------------------------- per-nation model

/** Share of a nation's total foreign trade a naval blockade has cut. */
function seaCut(world: World, id: NationId): number {
  return (world.theater.tradeBlocked[id] ?? 0) * (SEABORNE_TRADE_SHARE[id] ?? DEFAULT_SEABORNE_TRADE_SHARE);
}

/** Share of world energy exports lost to blockade or damage. Sanctions only reroute oil, so they do not count. */
function energyExportsLost(world: World, integrity: Map<NationId, number>): number {
  let lost = 0;
  for (const [supplier, share] of Object.entries(RESOURCE_SPECS.energy.market)) {
    if (!world.nations[supplier as NationId]) continue;
    lost += share * (1 - (1 - seaCut(world, supplier as NationId)) * (integrity.get(supplier as NationId) ?? 1));
  }
  return lost;
}

/** World energy price relative to normal: lost export capacity through a short-run elasticity. */
const energyPrice = (lost: number) => Math.min(MAX_ENERGY_PRICE, Math.pow(Math.max(1e-3, 1 - lost), -1 / ENERGY_PRICE_ELASTICITY));

/** How much of a supplier's exports reach `buyer`, 0..1. */
function supplierFlow(world: World, s: Scan, buyer: NationId | undefined, supplier: string, r: Resource): number {
  if (supplier === 'other' || !world.nations[supplier as NationId]) return 1;
  const breach = buyer && s.cut.get(buyer)?.get(supplier as NationId);
  const politics = breach ? STILL_ARRIVES[breach][RESOURCE_SPECS[r].exportControlled ? 'controlled' : 'goods'] : 1;
  return politics * (1 - seaCut(world, supplier as NationId)) * (s.integrity.get(supplier as NationId) ?? 1);
}

const selfShare = (n: Nation, r: Resource) => clamp01(RESOURCE_SPECS[r].selfSufficiency[n.id] ?? RESOURCE_SPECS[r].defaultSelf(n.stats));

function rawAccess(world: World, s: Scan, n: Nation, r: Resource): number {
  const self = selfShare(n, r);
  if (self >= 1) return 1;
  const open = !s.cut.has(n.id) && !Object.hasOwn(RESOURCE_SPECS[r].market, n.id);
  const { num, den } = open ? s.openMarket.get(r)! : importFlow(world, s, n.id, r);
  const imported = (den > 0 ? num / den : 1) * (1 - seaCut(world, n.id));
  return self + (1 - self) * imported;
}

function importFlow(world: World, s: Scan, buyer: NationId | undefined, r: Resource): ImportFlow {
  let num = 0, den = 0;
  for (const [supplier, share] of MARKETS.get(r)!) {
    if (supplier === buyer) continue;
    den += share;
    num += share * supplierFlow(world, s, buyer, supplier, r);
  }
  return { num, den };
}

/**
 * Each national stock covers its stream's share of a shortfall until it runs out, then that share
 * bites. A rationed resource (`ResourceSpec.rationing`) cuts non-priority demand as a stock's cover
 * falls, so supply sags and the stock lasts longer instead of holding full and then falling off a
 * cliff. `need` is demand relative to normal: output idled by lost trade burns no energy.
 */
function drawSupply(e: NationEconomy, id: NationId, r: Resource, raw: number, need: number, dtMonths: number): number {
  const stocks = stocksOf(id, r), left = e.buffers[r];
  const shortfall = need - raw;
  if (shortfall <= 1e-3) {
    for (let i = 0; i < stocks.length; i++) left[i] = Math.min(stocks[i].months, left[i] + BUFFER_REFILL_PER_MONTH * dtMonths);
    return 1;
  }
  const rationing = RESOURCE_SPECS[r].rationing;
  let covered = 0;
  for (let i = 0; i < stocks.length; i++) {
    if (left[i] <= 0) continue;
    const served = rationing ? rationing.priority + (1 - rationing.priority) * Math.min(1, left[i] / rationing.belowMonths) : 1;
    covered += stocks[i].share * served;
    left[i] = Math.max(0, left[i] - shortfall * served * dtMonths);
  }
  return (raw + shortfall * covered) / need;
}

/**
 * Share of a nation's foreign trade lost to blockade, sanctions and war, 0..1. With `beyondBaseline`,
 * sanctions already in force in the 2024 baseline (BASELINE_SANCTIONS) are not counted, for the
 * output lost against a baseline GDP that already carries them.
 */
function tradeLossOf(world: World, s: Scan, n: Nation, beyondBaseline: boolean): number {
  let lost = 0;
  const gdpOthers = s.worldGdp - (n.stats.gdp ?? 0);
  const baseline = beyondBaseline ? BASELINE_SANCTIONS[n.id] : undefined;
  for (const [p, breach] of s.cut.get(n.id) ?? []) {
    if (breach === 'sanctions' && baseline?.includes(p)) continue;
    lost += ((world.nations[p]?.stats.gdp ?? 0) / gdpOthers) * (1 - STILL_ARRIVES[breach].goods);
  }
  const blocked = seaCut(world, n.id);
  return clamp01(1 - (1 - blocked) * (1 - clamp01(lost)));
}

function categoryFactor(e: NationEconomy, cat: ItemCategory): number {
  let f = e.integrity;
  for (const [r, w] of Object.entries(CATEGORIES[cat].inputs) as [Resource, number][]) f *= 1 - w * (1 - e.supply[r]);
  return Math.max(0, f);
}

/**
 * Runs one line for a tick. The defence budget buys the baseline rate scaled by spending; output
 * an order pulls beyond that is bought from the treasury at the catalog unit cost on delivery.
 */
function runLine(n: Nation, e: NationEconomy, line: LineState, spendMultiple: number, dtMonths: number, unitCostUsdM: number): void {
  const budgetRate = line.baselinePerMonth * spendMultiple;
  const pull = Math.max(budgetRate, line.orderPerMonth ?? 0);
  const target = Math.min(line.surgePerMonth, pull);
  line.capacityPerMonth += (target - line.capacityPerMonth) * lag(dtMonths, line.rampMonths);
  const rate = line.orderPerMonth === null ? line.capacityPerMonth : Math.min(line.capacityPerMonth, line.orderPerMonth);
  const spec = itemSpec(line.item);
  const out = rate * dtMonths * categoryFactor(e, spec?.category ?? 'bulk_ammo') + line.carry;
  let whole = Math.floor(out);
  line.carry = out - whole;
  if (line.maxTotal !== null) whole = Math.min(whole, line.maxTotal - line.built);
  if (whole <= 0) return;
  const paidUsdB = (whole * Math.max(0, rate - budgetRate) / rate * unitCostUsdM) / 1000;
  n.treasuryUsdB -= paidUsdB;
  e.orderSpendUsdB = (e.orderSpendUsdB ?? 0) + paidUsdB;
  line.built += whole;
  e.produced[line.item] = (e.produced[line.item] ?? 0) + whole;
  e.delivered[line.item] = (e.delivered[line.item] ?? 0) + whole;
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
  e.tradeLoss = tradeLossOf(world, s, n, false);
  const newTradeLoss = BASELINE_SANCTIONS[n.id] ? tradeLossOf(world, s, n, true) : e.tradeLoss;
  const tradeOutput = 1 - ((n.stats.importsPctGdp ?? 30) / 100) * newTradeLoss * IMPORT_GDP_LOSS;
  for (const r of RESOURCES) e.supply[r] = drawSupply(e, n.id, r, rawAccess(world, s, n, r), r === 'energy' ? tradeOutput : 1, dtMonths);
  e.supply.energy *= 1 - ELECTRICITY_SHARE * (1 - (s.grid.get(n.id) ?? 1));
  announceShortages(world, ctx, n.id, e);

  const energyImported = 1 - selfShare(n, 'energy');
  e.gdpIndex =
    e.integrity *
    (1 - ENERGY_GDP_ELASTICITY * (1 - e.supply.energy)) *
    (1 - ENERGY_BILL_SHARE * energyImported * (world.slices.economy.energyPrice - 1) * ENERGY_PRICE_PASSTHROUGH) *
    (1 - FOOD_GDP_ELASTICITY * (1 - e.supply.food)) *
    (1 - SEMI_GDP_ELASTICITY * (1 - e.supply.semiconductors)) *
    tradeOutput;

  const gdpB = ((n.stats.gdp ?? 0) / 1e9) * e.gdpIndex;
  const share = defenseShare(n);
  const s0 = peaceShare(n);
  const deficitB = gdpB * (share - s0) * (1 - WAR_TAX_FINANCED);
  e.deficitPctGdp = gdpB > 0 ? deficitB / gdpB : 0;
  n.treasuryUsdB -= deficitB * (dtMonths / 12);

  const spendMultiple = share / s0;
  for (const line of Object.values(e.lines)) runLine(n, e, line, spendMultiple, dtMonths, unitCostOf(ctx, line.item));

  // Refills are the larger of what the budget buys abroad and what the state can commandeer from
  // national oil supply, which in war far exceeds the peacetime budget. Forces are priority demand
  // under rationing, so energy reaches them first. Depots are tanks built in peacetime:
  // they hold DEPOT_MONTHS of the peacetime budget's fuel whatever the mobilization, so war raises
  // the flow through them, not the stock they can keep.
  const peaceFuelPerMonth = peaceFuelPerMonthOf(world, n);
  const budgetFuelPerMonth = peaceFuelPerMonth * (1 + (FUEL_MOBILIZATION_MULTIPLE - 1) * n.mobilization);
  const oilMt = OIL_CONSUMPTION_MT[n.id];
  const oilTonsPerYear = oilMt !== undefined ? oilMt * 1e6 : ((n.stats.gdpPpp ?? n.stats.gdp ?? 0) / 1e6) * OIL_TONS_PER_PPP_USD_M;
  const commandeeredPerMonth = (oilTonsPerYear / 12) * (MIL_OIL_SHARE_PEACE + (MIL_OIL_SHARE_FULL - MIL_OIL_SHARE_PEACE) * n.mobilization);
  const fuelPerMonth = Math.max(budgetFuelPerMonth, commandeeredPerMonth);
  const fuelBefore = n.bulk.fuel;
  const served = Math.min(1, e.supply.energy / (RESOURCE_SPECS.energy.rationing?.priority ?? 1));
  n.bulk.fuel = Math.min(Math.max(n.bulk.fuel, DEPOT_MONTHS * peaceFuelPerMonth), n.bulk.fuel + fuelPerMonth * dtMonths * served);
  e.fuelDelivered += n.bulk.fuel - fuelBefore;

  const personnel = s.personnel.get(n.id) ?? 0;
  const underArms = n.reserves + e.inTraining + personnel;
  const foodPerMonth = underArms * RATION_TONS_PER_DAY * 30.4;
  n.bulk.food = Math.min(Math.max(n.bulk.food, foodPerMonth * 6), n.bulk.food + foodPerMonth * dtMonths * Math.min(1, 1.5 * e.supply.food));

  const standing = n.stats.armedForces ?? 0;
  const base = standing + BASE_RESERVE_SHARE * n.population;
  const workingAge = (n.stats.workingAgePct ?? 65) / 65;
  const ceiling = Math.max(base, MAX_UNDER_ARMS_SHARE * n.population * workingAge);
  const cap = base + n.mobilization * (ceiling - base);
  const callUp = n.mobilization > 0
    ? Math.max(n.population * INTAKE_PER_DEFENSE_SHARE * Math.max(0, share - NORMAL_PEACE_SHARE), e.draftPool * DRAFT_SHARE_PER_MONTH * (e.mobilizationTarget ?? n.mobilization) ** CONSCRIPTION_EXPONENT)
    : 0;
  // Volunteers and conscripts alike come out of the pool of men the state can take.
  const intake = Math.max(0, Math.min(callUp * dtMonths, cap - underArms, e.draftPool));
  e.draftPool -= intake;
  e.inTraining += intake;
  e.recruited += intake;
  const graduates = e.inTraining * lag(dtMonths, TRAINING_MONTHS);
  e.inTraining -= graduates;
  n.reserves += graduates;
  n.reserves += recallReservists(n, dtMonths);
}

export const aidKey = (f: AidFlow) => `${f.donor}>${f.recipient}:${f.item}${f.source === 'market' ? ':market' : ''}`;

/** Ships each arms pipeline's monthly quota, from the donor's stocks or bought abroad, while the recipient fights a war the donor is not fighting against it. */
function shipAid(world: World, dtMonths: number): void {
  const state = world.slices.economy;
  for (const flow of AID_FLOWS) {
    const donor = world.nations[flow.donor as NationId], recipient = world.nations[flow.recipient as NationId];
    if (!donor || !recipient || recipient.status !== 'war' || donor.status === 'capitulated' || donor.status === 'collapsed') continue;
    if (atWar(world, donor.id, recipient.id) || world.slices.politics?.nations[donor.id]?.aid?.continues === false) continue;
    const a = (state.aid[aidKey(flow)] ??= { carry: 0, delivered: 0 });
    const due = (flow.perYear / 12) * dtMonths * (1 - seaCut(world, donor.id)) * (1 - seaCut(world, recipient.id)) + a.carry;
    const spec = ITEMS[flow.item];
    const sink = spec.sink;
    const fromStocks = flow.source === 'stocks';
    const have = !fromStocks ? Infinity : sink.kind === 'bulk_ammo' ? Math.max(0, donor.bulk.ammo) / sink.tonsPerUnit : (donor.stockpile[spec.id] ?? 0);
    const units = Math.min(Math.floor(due), Math.floor(have));
    a.carry = Math.min(due - units, 1);
    if (units <= 0) continue;
    a.delivered += units;
    if (!fromStocks) {
      if (sink.kind === 'bulk_ammo') recipient.bulk.ammo += units * sink.tonsPerUnit;
      else recipient.stockpile[spec.id] = (recipient.stockpile[spec.id] ?? 0) + units;
    } else if (sink.kind === 'bulk_ammo') {
      donor.bulk.ammo = Math.max(0, donor.bulk.ammo - units * sink.tonsPerUnit);
      recipient.bulk.ammo += units * sink.tonsPerUnit;
    } else {
      donor.stockpile[spec.id] = (donor.stockpile[spec.id] ?? 0) - units;
      recipient.stockpile[spec.id] = (recipient.stockpile[spec.id] ?? 0) + units;
    }
  }
}

/**
 * Allies cross-level bulk ammunition in war, as NATO's mutual-support arrangements (STANAG 2034)
 * provide and as the US did for Israel in 1973 (Operation Nickel Grass: ~22,000 t airlifted in a
 * month, more by sea). A donor is a co-belligerent or a treaty ally bound to fight (commitment of
 * at least ALLY_COMMITMENT); it tops up any such partner at war whose stock per soldier is below
 * CROSS_LEVEL_SHARE of its own, releasing at most RELEASE_PER_MONTH of its stock a month in all.
 * A pair with a standing shell pipeline in AID_FLOWS ships at that observed rate instead. A naval
 * blockade of either end cuts what moves by the share of its trade that goes by sea, as it does aid.
 */
const ALLY_COMMITMENT = 0.5;
const CROSS_LEVEL_SHARE = 0.5;
const RELEASE_PER_MONTH = 0.1;

const PIPELINES = new Set(AID_FLOWS.filter((f) => ITEMS[f.item].sink.kind === 'bulk_ammo').map((f) => `${f.donor}>${f.recipient}`));

const allyCache = new Map<string, boolean>();
function treatyAlly(donor: NationId, recipient: NationId): boolean {
  const key = `${donor}>${recipient}`;
  let v = allyCache.get(key);
  if (v === undefined) allyCache.set(key, (v = defenseObligations(donor, recipient).some((a) => a.commitment >= ALLY_COMMITMENT)));
  return v;
}

function crossLevelAmmo(world: World, s: Scan, dtMonths: number): void {
  const enemies = hostility(world).foes;
  if (!enemies.size) return;
  const state = world.slices.economy;
  const usable = (n: Nation | undefined): n is Nation => !!n && n.status !== 'capitulated' && n.status !== 'collapsed';
  const perHead = (n: Nation) => Math.max(0, n.bulk.ammo) / Math.max(1, s.personnel.get(n.id) ?? 0);
  for (const donor of Object.values(world.nations)) {
    if (!usable(donor) || donor.bulk.ammo <= 0) continue;
    let budget = donor.bulk.ammo * RELEASE_PER_MONTH * dtMonths * (1 - seaCut(world, donor.id));
    for (const [rid, foes] of enemies) {
      if (budget <= 0) break;
      const r = world.nations[rid];
      if (rid === donor.id || !usable(r) || foes.has(donor.id) || !(s.personnel.get(rid) ?? 0) || PIPELINES.has(`${donor.id}>${rid}`)) continue;
      const coBelligerent = [...foes].some((f) => enemies.get(donor.id)?.has(f));
      if (!coBelligerent && !treatyAlly(donor.id, rid)) continue;
      const gap = (CROSS_LEVEL_SHARE * perHead(donor) - perHead(r)) * (s.personnel.get(rid) ?? 0);
      const tons = Math.min(gap, budget) * (1 - seaCut(world, rid));
      if (tons <= 0) continue;
      budget -= tons;
      donor.bulk.ammo -= tons;
      r.bulk.ammo += tons;
      const key = `${donor.id}>${rid}`;
      state.allied[key] = (state.allied[key] ?? 0) + tons;
    }
  }
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

const unitCostOf = (ctx: SimContext, item: ItemId): number =>
  (ctx.catalog.platforms.get(item as PlatformId) ?? ctx.catalog.munitions.get(item as MunitionId))?.unitCostUsdM ?? 0;

/**
 * Value a new production line can turn out per year at full rate, as a share of the nation's
 * manufacturing value added. General Dynamics' greenfield 155 mm shell plant at Mesquite, Texas
 * (2023-25) reached ~30k shells a month, ~USD 2-3B a year at ~USD 8k a round, about 0.1% of US
 * manufacturing value added (~USD 2.5T, World Bank).
 */
const GREENFIELD_MFG_SHARE = 0.001;

/**
 * Most a greenfield line for `item` can make a month once built: the plant the nation can put up
 * (GREENFIELD_MFG_SHARE of manufacturing value added at the item's unit cost) and, for hulls, its
 * yards' warship tonnage. What a `produce` order for an item with no line can reach; the UI shows it.
 */
export function greenfieldCeilingPerMonth(n: Nation, unitCostUsdM: number, item: ItemId): number {
  const mfgUsdM = (n.stats.manufacturing ?? (n.stats.gdp ?? 0) * 0.12) / 1e6;
  let perYear = (mfgUsdM * GREENFIELD_MFG_SHARE) / Math.max(1e-6, unitCostUsdM);
  const tons = itemSpec(item)?.tons;
  if (tons) perYear = Math.min(perYear, ((SHIPBUILDING_GT_PER_YEAR[n.id] ?? 0) * SHIPYARD_WARSHIP_SHARE) / tons);
  return perYear / 12;
}

/**
 * Sets an ordered rate. An existing line runs toward it within its surge ceiling; an item with no
 * line gets a greenfield one whose ceiling is what plant the nation can build (GREENFIELD_MFG_SHARE,
 * and yard tonnage for hulls) and which ramps in at twice its category's lag.
 */
function produce(world: World, ctx: SimContext, nation: NationId, item: ItemId, ratePerMonth: number): void {
  const e = world.slices.economy.nations[nation];
  const n = world.nations[nation];
  if (!e || !n) return;
  if (!Number.isFinite(ratePerMonth) || ratePerMonth < 0) {
    ctx.emit({ type: 'message', tick: world.tick, nation, text: `${nation}: production order for ${item} needs a rate of zero or more a month` });
    return;
  }
  const existing = e.lines[item];
  if (existing) {
    existing.orderPerMonth = ratePerMonth;
    return;
  }
  const entry = ctx.catalog.platforms.get(item as PlatformId) ?? ctx.catalog.munitions.get(item as MunitionId);
  if (!entry?.producers.includes(nation)) {
    ctx.emit({ type: 'message', tick: world.tick, nation, text: `${nation} has no industry to build ${item}` });
    return;
  }
  const spec = itemSpec(item);
  const line = newLine(item, 0, Math.min(ratePerMonth, greenfieldCeilingPerMonth(n, entry.unitCostUsdM, item)) * 12, 2 * CATEGORIES[spec?.category ?? 'cruise_missile'].rampMonths);
  line.orderPerMonth = ratePerMonth;
  e.lines[item] = line;
}

export const economy: System = {
  id: 'economy',
  commands: ['set_mobilization', 'produce', 'sanction'],

  init(world, ctx) {
    world.slices.economy = { nations: {}, lastReportTick: world.tick, aid: {}, allied: {}, energyPrice: 1, energyExportsLost: 0 };
    const integrity = industrialIntegrity(world, ctx.map);
    for (const n of Object.values(world.nations)) {
      const e = newNationEconomy(n);
      e.baseIntegrity = integrity.get(n.id) ?? 1;
      world.slices.economy.nations[n.id] = e;
      n.bulk.fuel = Math.max(n.bulk.fuel, OPENING_DEPOT_MONTHS * peaceFuelPerMonthOf(world, n));
    }
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
        if (cmd.nation !== cmd.target) setSanctions(world, cmd.nation, cmd.target, cmd.on);
        return;
    }
  },

  step(world, ctx) {
    const dtMonths = world.dtHours / HOURS_PER_MONTH;
    const s = scan(world, ctx);
    const state = world.slices.economy;
    state.energyExportsLost = energyExportsLost(world, s.integrity);
    state.energyPrice = energyPrice(state.energyExportsLost);
    for (const [id, e] of Object.entries(state.nations) as [NationId, NationEconomy][]) {
      const n = world.nations[id];
      if (n && n.status !== 'collapsed') stepNation(world, ctx, s, n, e, dtMonths);
    }
    shipAid(world, dtMonths);
    crossLevelAmmo(world, s, dtMonths);
    report(world, ctx);
  },
};

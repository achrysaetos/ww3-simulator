import type { ItemId, Nation, NationId } from '../../core/types';
import { DEFAULT_DRAFT_LAW, DRAFT_LAWS } from '../../data/nations/conscription';
import { CATEGORIES, GENERIC_AMMO_SURGE_MULTIPLE, GENERIC_AMMO_TONS_PER_MFG_USD_B, ITEMS, LINES, RESOURCES, RESOURCE_SPECS, type Resource, type Stock } from '../../data/industry';

export interface LineState {
  item: ItemId;
  baselinePerMonth: number;
  surgePerMonth: number;
  /** Installed rate, which chases its target with a lag of `rampMonths`. */
  capacityPerMonth: number;
  /** Rate set by a `produce` command; null runs the line at capacity. */
  orderPerMonth: number | null;
  rampMonths: number;
  /** Fraction of a unit finished but not yet delivered. */
  carry: number;
  built: number;
  maxTotal: number | null;
}

export interface NationEconomy {
  /** Level set by `set_mobilization`; null holds `nation.mobilization` where it is. */
  mobilizationTarget: number | null;
  lines: Record<ItemId, LineState>;
  /** Months of national stocks left per resource, one entry per stock in `stocksOf`. */
  buffers: Record<Resource, number[]>;
  /** Share of need actually available this tick after drawing on stocks, 0..1. */
  supply: Record<Resource, number>;
  /**
   * Population-weighted industry intact and held, relative to the scenario start. The
   * baseline GDP in stats already excludes what was occupied or ruined before the start
   * (Ukraine's 2024 GDP is net of the occupied east), so only later change counts.
   */
  integrity: number;
  /** Absolute intact-and-held share at the scenario start, 0..1. */
  baseIntegrity: number;
  /** Share of foreign trade lost to blockade, sanctions, and war, 0..1. */
  tradeLoss: number;
  /** Output relative to the baseline GDP in stats. */
  gdpIndex: number;
  /** Annualised government deficit from war spending, share of current GDP. */
  deficitPctGdp: number;
  /** Recruits in the training pipeline, not yet available as reserves. */
  inTraining: number;
  /** Men the state can still call up: liable, available, not yet under arms or lost. */
  draftPool: number;
  /** Resources currently reported short, so a shortage is announced once, not every tick. */
  short: Resource[];
  /** Units delivered since the last monthly production report. */
  produced: Record<ItemId, number>;
  /** Units delivered since the run began; never reset, for measurement. */
  delivered: Record<ItemId, number>;
  /** People called up since the run began. */
  recruited: number;
  /** Bulk fuel delivered to national depots since the run began, tons. */
  fuelDelivered: number;
}

export interface AidState {
  /** Fraction of a unit due but not yet shipped. */
  carry: number;
  /** Units shipped since the run began. */
  delivered: number;
}

export interface EconomyState {
  nations: Record<NationId, NationEconomy>;
  lastReportTick: number;
  /** Arms pipelines, keyed by aidKey(flow). */
  aid: Record<string, AidState>;
  /** World energy price relative to the start, from export capacity lost to blockade and war damage. */
  energyPrice: number;
}

declare module '../../core/types' {
  interface Slices {
    economy: EconomyState;
  }
}

const perResource = (f: (r: Resource) => number) => Object.fromEntries(RESOURCES.map((r) => [r, f(r)])) as Record<Resource, number>;

export function stocksOf(nation: NationId, r: Resource): Stock[] {
  const spec = RESOURCE_SPECS[r];
  return spec.tiered?.[nation] ?? [{ share: 1, months: spec.buffers?.[nation] ?? spec.bufferMonths }];
}

export function newLine(item: ItemId, baselinePerYear: number, surgePerYear: number, rampMonths: number, maxTotal?: number): LineState {
  return {
    item,
    baselinePerMonth: baselinePerYear / 12,
    surgePerMonth: Math.max(baselinePerYear, surgePerYear) / 12,
    capacityPerMonth: baselinePerYear / 12,
    orderPerMonth: null,
    rampMonths,
    carry: 0,
    built: 0,
    maxTotal: maxTotal ?? null,
  };
}

/**
 * Men in the liable age band, approximated as half the 15-64 working-age share spread
 * evenly over its 50 years, less the unavailable, standing forces, reserves, reservists and prior losses.
 */
function draftPool(nation: Nation): number {
  const law = DRAFT_LAWS[nation.id] ?? DEFAULT_DRAFT_LAW;
  const [from, to] = law.ages;
  const liable = nation.population * 0.5 * ((nation.stats.workingAgePct ?? 65) / 100) * ((Math.min(to, 64) - Math.max(from, 15)) / 50);
  return Math.max(0, liable * (1 - law.unavailable) - (nation.stats.armedForces ?? 0) - nation.reserves - nation.reservists - law.priorLosses);
}

export function newNationEconomy(nation: Nation): NationEconomy {
  const lines: Record<ItemId, LineState> = {};
  const mfgB = (nation.stats.manufacturing ?? (nation.stats.gdp ?? 0) * 0.12) / 1e9;
  const ammoPerYear = mfgB * GENERIC_AMMO_TONS_PER_MFG_USD_B;
  if (ammoPerYear > 0) lines[ITEMS.ammo_generic.id] = newLine(ITEMS.ammo_generic.id, ammoPerYear, ammoPerYear * GENERIC_AMMO_SURGE_MULTIPLE, CATEGORIES.bulk_ammo.rampMonths);
  for (const l of LINES[nation.id] ?? []) {
    const spec = ITEMS[l.item];
    lines[spec.id] = newLine(spec.id, l.baselinePerYear, l.surgePerYear, CATEGORIES[spec.category].rampMonths, l.maxTotal);
  }
  return {
    mobilizationTarget: null,
    lines,
    buffers: Object.fromEntries(RESOURCES.map((r) => [r, stocksOf(nation.id, r).map((s) => s.months)])) as Record<Resource, number[]>,
    supply: perResource(() => 1),
    integrity: 1,
    baseIntegrity: 1,
    tradeLoss: 0,
    gdpIndex: 1,
    deficitPctGdp: 0,
    inTraining: 0,
    draftPool: draftPool(nation),
    short: [],
    produced: {},
    delivered: {},
    recruited: 0,
    fuelDelivered: 0,
  };
}

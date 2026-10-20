import type { ItemId, Nation, NationId } from '../../core/types';
import { CATEGORIES, GENERIC_AMMO_SURGE_MULTIPLE, GENERIC_AMMO_TONS_PER_MFG_USD_B, ITEMS, LINES, RESOURCES, RESOURCE_SPECS, type Resource } from '../../data/industry';

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
  /** Months of national stocks left per resource. */
  buffers: Record<Resource, number>;
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

export interface EconomyState {
  nations: Record<NationId, NationEconomy>;
  lastReportTick: number;
}

declare module '../../core/types' {
  interface Slices {
    economy: EconomyState;
  }
}

const perResource = (f: (r: Resource) => number) => Object.fromEntries(RESOURCES.map((r) => [r, f(r)])) as Record<Resource, number>;

export function bufferMonths(nation: NationId, r: Resource): number {
  const spec = RESOURCE_SPECS[r];
  return spec.buffers?.[nation] ?? spec.bufferMonths;
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
    buffers: perResource((r) => bufferMonths(nation.id, r)),
    supply: perResource(() => 1),
    integrity: 1,
    baseIntegrity: 1,
    tradeLoss: 0,
    gdpIndex: 1,
    deficitPctGdp: 0,
    inTraining: 0,
    short: [],
    produced: {},
    delivered: {},
    recruited: 0,
    fuelDelivered: 0,
  };
}

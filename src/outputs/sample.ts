import type { Catalog } from '../core/catalog';
import type { ItemId, Munition, MunitionId, MunitionKind, NationId, PlatformId, World } from '../core/types';
import { AID_FLOWS, ITEMS, itemSpec } from '../data/industry';
import { aidKey } from '../systems/economy';
import type { RaceItem } from './types';

/** The counters of one nation at one tick. Cumulative counters run from the start of the run. */
export interface NationSample {
  /** Discrete items in magazines and warehouses; `ammo` in national depots, tons. */
  stock: Partial<Record<RaceItem, number>>;
  produced: Partial<Record<RaceItem, number>>;
  /** Net arms aid received so far: deliveries in, less what it shipped from its own stocks. */
  aid: Partial<Record<RaceItem, number>>;
  /** Units of every kind received through standing arms pipelines (AID_FLOWS). */
  aidReceived: number;
  shellsFired: number;
  /** Catalog value of everything its production lines have delivered, USD M. */
  producedUsdM: number;
}

export interface OutputSample {
  tick: number;
  nations: Record<NationId, NationSample>;
}

const GROUP: Partial<Record<MunitionKind, RaceItem>> = {
  sam: 'interceptors', abm: 'interceptors', shorad_missile: 'interceptors',
  cruise: 'cruise', antiship_cruise: 'cruise',
  srbm: 'ballistic', mrbm: 'ballistic', irbm: 'ballistic', antiship_ballistic: 'ballistic', hgv: 'ballistic',
  drone_oneway: 'drones', loitering: 'drones',
};
/** Long-range one-way drones (Shahed class) count; FPVs and tactical loitering munitions do not, as in metrics/strikeWeaponClass. */
const LONG_RANGE_DRONE_KM = 300;

function groupOf(m: Munition | undefined): RaceItem | undefined {
  if (!m || m.yieldKt) return undefined;
  const g = GROUP[m.kind];
  return g === 'drones' && m.rangeKm < LONG_RANGE_DRONE_KM ? undefined : g;
}

/** Each unit of `item` as race counts: its discrete group, or tons of ammunition plus a round if it is a shell. */
function credit(catalog: Catalog, item: ItemId, k: number, into: Partial<Record<RaceItem, number>>): void {
  const add = (g: RaceItem, x: number) => (into[g] = (into[g] ?? 0) + x);
  const spec = itemSpec(item);
  if (spec?.sink.kind === 'bulk_ammo') {
    add('ammo', k * spec.sink.tonsPerUnit);
    if (spec.category === 'shell') add('shells', k);
    return;
  }
  const g = groupOf(catalog.munitions.get(item as Munition['id']));
  if (g) add(g, k);
}

/** Nations a war touches: belligerents (and those about to be, by a queued declaration), nations that lost people to it, and arms donors that have shipped. */
export function involved(world: World): NationId[] {
  const out = new Set<NationId>();
  for (const n of Object.values(world.nations)) if (n.status !== 'peace') out.add(n.id);
  for (const c of world.pending) if (c.type === 'declare_war') out.add(c.nation).add(c.target);
  for (const [id, c] of Object.entries(world.slices.civil?.nations ?? {})) if (c.killed > 0 || (c.military ?? 0) > 0) out.add(id as NationId);
  for (const f of AID_FLOWS) if ((world.slices.economy?.aid[aidKey(f)]?.delivered ?? 0) > 0) out.add(f.donor as NationId).add(f.recipient as NationId);
  return [...out].filter((id) => world.nations[id]).sort();
}

/** Reads the counters of `nations` from the World. Pure. */
export function sampleOutputs(world: World, catalog: Catalog, nations: readonly NationId[] = involved(world)): OutputSample {
  const out: Record<NationId, NationSample> = {};
  for (const id of nations) out[id] = { stock: { ammo: world.nations[id].bulk.ammo }, produced: {}, aid: {}, aidReceived: 0, shellsFired: world.slices.land?.shellsFired[id] ?? 0, producedUsdM: 0 };
  for (const f of Object.values(world.formations)) {
    const s = out[f.nation];
    if (!s || f.status === 'destroyed') continue;
    for (const [m, k] of Object.entries(f.magazine)) {
      const g = groupOf(catalog.munitions.get(m as Munition['id']));
      if (g) s.stock[g] = (s.stock[g] ?? 0) + k;
    }
  }
  for (const id of nations) {
    const s = out[id];
    for (const [m, k] of Object.entries(world.nations[id].stockpile)) {
      const g = groupOf(catalog.munitions.get(m as Munition['id']));
      if (g) s.stock[g] = (s.stock[g] ?? 0) + k;
    }
    for (const [item, k] of Object.entries(world.slices.economy?.nations[id]?.delivered ?? {})) {
      credit(catalog, item as ItemId, k, s.produced);
      s.producedUsdM += k * ((catalog.platforms.get(item as PlatformId) ?? catalog.munitions.get(item as MunitionId))?.unitCostUsdM ?? 0);
    }
  }
  for (const f of AID_FLOWS) {
    const k = world.slices.economy?.aid[aidKey(f)]?.delivered ?? 0;
    if (!k) continue;
    const item = ITEMS[f.item].id;
    const r = out[f.recipient as NationId];
    if (r) {
      credit(catalog, item, k, r.aid);
      r.aidReceived += k;
    }
    if (out[f.donor as NationId] && f.source === 'stocks') credit(catalog, item, -k, out[f.donor as NationId].aid);
  }
  for (const [key, tons] of Object.entries(world.slices.economy?.allied ?? {})) {
    const [donor, recipient] = key.split('>') as NationId[];
    if (out[recipient]) out[recipient].aid.ammo = (out[recipient].aid.ammo ?? 0) + tons;
    if (out[donor]) out[donor].aid.ammo = (out[donor].aid.ammo ?? 0) - tons;
  }
  return { tick: world.tick, nations: out };
}

import type { Catalog } from '../core/catalog';
import type { ItemId, MunitionId, NationId, World } from '../core/types';
import { itemSpec } from '../data/industry';
import { defenseShare } from '../systems/economy';

/** War-economy outcomes for one nation over a run. */
export interface EconomyMetrics {
  gdpIndex: number;
  /** Level last ordered by set_mobilization; mobilization itself lags toward it. */
  mobilizationTarget: number | null;
  defenseSharePct: number;
  deficitPctGdp: number;
  treasuryUsdB: number;
  /** Call-ups per 30 days over the run. */
  recruitsPerMonth: number;
  reserves: number;
  /** National bulk ammunition, tons: what the depots held, what industry added, what forces drew. */
  ammo: { start: number; end: number; producedTons: number; drawnTonsPerDay: number };
  /** Sampled every 7 days from the start. */
  weekly: { ammoTons: number[]; fuelTons: number[]; energySupply: number[]; tradeBlocked: number[]; gdpIndex: number[] };
  fuel: { start: number; end: number; deliveredTonsPerDay: number; drawnTonsPerDay: number };
  /** Days a supply class (logistics) or strategic resource (economy) was flagged short. */
  shortageDays: Record<string, number>;
  /** Units delivered by each production line over the run. */
  produced: Record<string, number>;
  /**
   * Items held by formations (magazines for munitions, equipment plus damaged for platforms) and in
   * the national stockpile at start and end. Every munition that moved, every platform produced or
   * drawn from stock. Production lands in the stockpile; only logistics moves it to formations.
   */
  items: Record<string, { fielded: [number, number]; stockpile: [number, number]; produced: number }>;
}

function bulkTons(item: ItemId): number {
  const sink = itemSpec(item)?.sink;
  return sink?.kind === 'bulk_ammo' ? sink.tonsPerUnit : 0;
}

interface Held { fielded: Map<string, number>; stockpile: Map<string, number> }

function itemsHeld(world: World): Map<NationId, Held> {
  const out = new Map<NationId, Held>();
  const at = (n: NationId) => out.get(n) ?? out.set(n, { fielded: new Map(), stockpile: new Map() }).get(n)!;
  const add = (m: Map<string, number>, rec: Record<string, number>) => { for (const [id, k] of Object.entries(rec)) m.set(id, (m.get(id) ?? 0) + k); };
  for (const f of Object.values(world.formations)) {
    if (f.status === 'destroyed') continue;
    const m = at(f.nation).fielded;
    add(m, f.magazine);
    add(m, f.equipment);
    add(m, f.damaged);
  }
  for (const n of Object.values(world.nations)) add(at(n.id).stockpile, n.stockpile);
  return out;
}

/** Samples the economy each tick of a run; `finish` reports per nation. */
export function economyProbe(world: World, catalog: Catalog) {
  const startTick = world.tick;
  const startHeld = itemsHeld(world);
  const start = new Map(Object.values(world.nations).map((n) => [n.id, { ...n.bulk }]));
  const at0 = new Map(Object.entries(world.slices.economy?.nations ?? {}).map(([id, e]) => [id, { delivered: { ...e.delivered }, recruited: e.recruited, fuelDelivered: e.fuelDelivered }]));
  const shortage = new Map<NationId, Record<string, number>>();
  const weekly = new Map<NationId, EconomyMetrics['weekly']>();
  const ticksPerWeek = Math.round((7 * 24) / world.dtHours);

  return {
    tick(): void {
      const dtDays = world.dtHours / 24;
      const add = (n: NationId, what: string) => {
        const r = shortage.get(n) ?? shortage.set(n, {}).get(n)!;
        r[what] = (r[what] ?? 0) + dtDays;
      };
      for (const [n, classes] of Object.entries(world.slices.logistics?.short ?? {})) for (const c of classes) add(n as NationId, c);
      for (const [n, e] of Object.entries(world.slices.economy?.nations ?? {})) for (const r of e.short) add(n as NationId, r);
      if ((world.tick - startTick) % ticksPerWeek === 0)
        for (const n of Object.values(world.nations)) {
          const w = weekly.get(n.id) ?? weekly.set(n.id, { ammoTons: [], fuelTons: [], energySupply: [], tradeBlocked: [], gdpIndex: [] }).get(n.id)!;
          const e = world.slices.economy?.nations[n.id];
          w.ammoTons.push(Math.round(n.bulk.ammo));
          w.fuelTons.push(Math.round(n.bulk.fuel));
          w.energySupply.push(Math.round((e?.supply.energy ?? 1) * 100) / 100);
          w.tradeBlocked.push(Math.round((world.theater.tradeBlocked[n.id] ?? 0) * 100) / 100);
          w.gdpIndex.push(Math.round((e?.gdpIndex ?? 1) * 1000) / 1000);
        }
    },

    finish(id: NationId): EconomyMetrics | undefined {
      const n = world.nations[id];
      const e = world.slices.economy?.nations[id];
      if (!n || !e) return undefined;
      const days = ((world.tick - startTick) * world.dtHours) / 24 || 1;
      const before = at0.get(id) ?? { delivered: {} as Record<string, number>, recruited: 0, fuelDelivered: 0 };
      const produced: Record<string, number> = {};
      let producedTons = 0;
      for (const [item, k] of Object.entries(e.delivered)) {
        const d = k - (before.delivered[item as ItemId] ?? 0);
        if (d <= 0) continue;
        produced[item] = d;
        producedTons += d * bulkTons(item as ItemId);
      }
      const s = start.get(id)!;
      const fuelIn = e.fuelDelivered - before.fuelDelivered;
      const items: EconomyMetrics['items'] = {};
      const empty: Held = { fielded: new Map(), stockpile: new Map() };
      const h0 = startHeld.get(id) ?? empty, h1 = itemsHeld(world).get(id) ?? empty;
      for (const item of new Set([...h0.fielded.keys(), ...h0.stockpile.keys(), ...h1.fielded.keys(), ...h1.stockpile.keys(), ...Object.keys(produced)])) {
        if (bulkTons(item as ItemId)) continue;
        const fielded: [number, number] = [Math.round(h0.fielded.get(item) ?? 0), Math.round(h1.fielded.get(item) ?? 0)];
        const stockpile: [number, number] = [h0.stockpile.get(item) ?? 0, h1.stockpile.get(item) ?? 0];
        const p = produced[item] ?? 0;
        const munition = catalog.munitions.has(item as MunitionId);
        if (p || stockpile[0] !== stockpile[1] || (munition && fielded[0] !== fielded[1])) items[item] = { fielded, stockpile, produced: p };
      }
      const round = (x: number, k = 1000) => Math.round(x * k) / k;
      return {
        gdpIndex: round(e.gdpIndex),
        mobilizationTarget: e.mobilizationTarget === null ? null : round(e.mobilizationTarget),
        defenseSharePct: round(defenseShare(n) * 100, 10),
        deficitPctGdp: round(e.deficitPctGdp * 100, 10),
        treasuryUsdB: round(n.treasuryUsdB, 10),
        recruitsPerMonth: Math.round(((e.recruited - before.recruited) / days) * 30),
        reserves: Math.round(n.reserves),
        ammo: { start: Math.round(s.ammo), end: Math.round(n.bulk.ammo), producedTons: Math.round(producedTons), drawnTonsPerDay: Math.round((s.ammo + producedTons - n.bulk.ammo) / days) },
        fuel: { start: Math.round(s.fuel), end: Math.round(n.bulk.fuel), deliveredTonsPerDay: Math.round(fuelIn / days), drawnTonsPerDay: Math.round((s.fuel + fuelIn - n.bulk.fuel) / days) },
        shortageDays: Object.fromEntries(Object.entries(shortage.get(id) ?? {}).map(([k, v]) => [k, round(v, 10)])),
        weekly: weekly.get(id) ?? { ammoTons: [], fuelTons: [], energySupply: [], tradeBlocked: [], gdpIndex: [] },
        produced,
        items,
      };
    },
  };
}

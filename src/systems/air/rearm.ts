/**
 * Rearming air wings, missile brigades and air-defense units from national stocks, where
 * the supply chain reaches them: a battery cut off in a pocket, or a wing at a base the
 * network cannot reach, does not reload. A formation's full load is its platforms'
 * loadouts; rounds carried beyond that (an ORBAT's extra magazine) are spent first and
 * never topped up.
 */
import type { SimContext } from '../../core/engine';
import type { Formation, FormationKind, ItemId, MunitionId, Nation, PlatformId, World } from '../../core/types';
import { supplyFactor } from '../logistics';
import { BULK_AMMO_KINDS, isRoundOnRail, REARM_SHARE_PER_DAY } from './tables';

const REARMED: ReadonlySet<FormationKind> = new Set(['air_wing', 'missile', 'air_defense']);

export function rearm(world: World, ctx: SimContext): void {
  const share = REARM_SHARE_PER_DAY * (world.dtHours / 24);
  for (const f of Object.values(world.formations)) {
    if (f.status !== 'active' || !REARMED.has(f.kind)) continue;
    // A carrier's wing draws on the ship's magazine, which the naval model does not track apart from it;
    // a world run without the logistics system has no supply chain to limit it.
    if (f.node < ctx.map.landCount && world.slices.logistics && supplyFactor(world, ctx.map, f.node, f.nation) <= 0) continue;
    const nation = world.nations[f.nation];
    let phi: number | undefined;
    for (const [mid, full, item] of fullLoad(f, ctx)) {
      const deficit = full - (f.magazine[mid] ?? 0);
      if (deficit < 1) continue;
      // Reloads come up the supply lines: a battery in a pocket or on a blockaded island fires what it holds.
      // A nation with no supply network yet (peace, or a world without logistics) draws freely.
      phi ??= world.slices.logistics?.networkOf[f.nation] ? supplyFactor(world, ctx.map, f.node, f.nation) : 1;
      const want = Math.min(Math.floor(deficit), Math.ceil(full * share * phi));
      if (want <= 0) continue;
      const got = draw(nation, ctx, mid, item, want);
      if (got > 0) f.magazine[mid] = (f.magazine[mid] ?? 0) + got;
    }
  }
}

/** Full load per munition, and the stockpile item a round is drawn as (a staged drone is stocked as its rail row). */
function fullLoad(f: Formation, ctx: SimContext): [MunitionId, number, ItemId][] {
  const out = new Map<MunitionId, [MunitionId, number, ItemId]>();
  for (const [pid, n] of Object.entries(f.equipment) as [PlatformId, number][]) {
    if (n <= 0) continue;
    const p = ctx.catalog.platform(pid);
    for (const l of p.loadout) {
      const row = out.get(l.munition) ?? [l.munition, 0, isRoundOnRail(p) ? pid : l.munition];
      row[1] += l.count * n;
      out.set(l.munition, row);
    }
  }
  return [...out.values()];
}

function draw(nation: Nation, ctx: SimContext, mid: MunitionId, item: ItemId, want: number): number {
  const m = ctx.catalog.munition(mid);
  if (BULK_AMMO_KINDS.has(m.kind)) {
    const got = Math.min(want, Math.floor((nation.bulk.ammo * 1000) / Math.max(1, m.weightKg)));
    nation.bulk.ammo -= (got * m.weightKg) / 1000;
    return got;
  }
  // Rounds stocked as the rail row first, then fresh production, which the economy books under the munition.
  let got = 0;
  for (const key of item === mid ? [item] : [item, mid]) {
    const stock = nation.stockpile[key] ?? 0;
    const take = Math.min(want - got, Math.floor(stock));
    if (take > 0) nation.stockpile[key] = stock - take;
    got += Math.max(0, take);
  }
  return got;
}

import type { Formation, Munition, MunitionId } from '../../core/types';
import { dailyRounds } from '../air';
import { arsenal, FireBudget, pickTarget, pkAgainst, withinKm, type StrikeTarget, type TargetGrid } from './strikes';
import type { Plan } from './types';

/**
 * The munition in reach that kills most per day: kill probability times the rounds the
 * formation's launchers for it put up. A unit with one Lyutyi and two Bober launch sites
 * flies Bobers at targets both reach.
 */
function volleyMunition(p: Plan, f: Formation, stock: readonly Munition[], t: StrikeTarget, km: number): MunitionId | undefined {
  let best: MunitionId | undefined, bestKills = 0;
  for (const m of stock) {
    const kills = m.rangeKm >= km ? pkAgainst(m, t) * dailyRounds(f, m.id, p.ctx.catalog) : 0;
    if (kills > bestKills) { bestKills = kills; best = m.id; }
  }
  return best;
}

/**
 * Ground-launched missile brigades fire at the most valuable target any of
 * their conventional munitions can reach and kill. Nuclear rounds are never
 * used here; release goes through the strategic layer. Precision rounds are
 * rationed by the national fire budget, so a brigade holds fire on some days.
 */
export function planMissiles(p: Plan, targets: TargetGrid): void {
  const { map } = p.ctx;
  const budget = new FireBudget(p);
  for (const f of p.index.byNation.get(p.nation) ?? []) {
    if (f.kind !== 'missile' || f.status !== 'active') continue;
    const stock = arsenal(p, f);
    if (!stock.length) continue;
    const reach = Math.max(...stock.map((m) => m.rangeKm));
    const t = pickTarget(targets.near(f.node, reach), (t) => withinKm(map, f.node, t.node, reach) && volleyMunition(p, f, stock, t, map.distanceKm(f.node, t.node)) !== undefined);
    if (!t) continue;
    const munition = volleyMunition(p, f, stock, t, map.distanceKm(f.node, t.node))!;
    budget.propose(f, [p.ctx.catalog.munition(munition)], t, { posture: 'strike', target: t.node, targetClass: t.cls, targetFormation: t.formation, munition });
  }
  budget.settle();
}

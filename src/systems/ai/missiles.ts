import { arsenal, bestMunition, FireBudget, pickTarget, withinKm, type TargetGrid } from './strikes';
import type { Plan } from './types';

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
    const t = pickTarget(targets.near(f.node, reach), (t) => withinKm(map, f.node, t.node, reach) && bestMunition(stock, t.cls, map.distanceKm(f.node, t.node)) !== undefined);
    if (!t) continue;
    const munition = bestMunition(stock, t.cls, map.distanceKm(f.node, t.node))!;
    budget.propose(f, p.ctx.catalog.munition(munition), t, { posture: 'strike', target: t.node, targetClass: t.cls, targetFormation: t.formation, munition });
  }
  budget.settle();
}

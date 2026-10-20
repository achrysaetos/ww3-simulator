import { issue } from './forces';
import { arsenal, bestMunition, pickTarget, withinKm, type TargetGrid } from './strikes';
import type { Plan } from './types';

/**
 * Ground-launched missile brigades fire at the most valuable target any of
 * their conventional munitions can reach and kill. Nuclear rounds are never
 * used here; release goes through the strategic layer.
 */
export function planMissiles(p: Plan, targets: TargetGrid): void {
  const { map } = p.ctx;
  for (const f of p.index.byNation.get(p.nation) ?? []) {
    if (f.kind !== 'missile' || f.status !== 'active') continue;
    const stock = arsenal(p, f);
    if (!stock.length) continue;
    const reach = Math.max(...stock.map((m) => m.rangeKm));
    const t = pickTarget(targets.near(f.node, reach), (t) => withinKm(map, f.node, t.node, reach) && bestMunition(stock, t.cls, map.distanceKm(f.node, t.node)) !== undefined);
    if (!t) continue;
    const munition = bestMunition(stock, t.cls, map.distanceKm(f.node, t.node));
    issue(p, f, { posture: 'strike', target: t.node, targetClass: t.cls, targetFormation: t.formation, munition });
  }
}

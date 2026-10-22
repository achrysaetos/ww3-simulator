import type { Formation, NodeId } from '../../core/types';
import type { Warning } from '../intel';
import { isGround, issue } from './forces';
import { enemyPowerAt, landMass } from './fronts';
import type { Plan } from './types';

/** By the 3:1 rule a dug-in defender holds at one third of the attacker's strength (land.ts ATTACK_RATIO). */
const HOLD_RATIO = 3;
/** Farther than this a formation is in another theatre and stays where it is. */
const MAX_COMMIT_KM = 1500;

/**
 * A nation warned of a build-up on its border (intel WARN_RISE) and not yet at war with the
 * builder deploys to meet it: each of its border cells facing believed hostile ground power
 * draws the nearest manoeuvre formations to defend it until they reach a third of the power
 * across, the heaviest-threatened cell first. Israel's reserve call-up on 6 October 1973 and
 * Ukraine's redeployments of early 2022 answered warning this way, before any shot.
 */
export function planWarning(p: Plan, w: Warning): void {
  const { map } = p.ctx;
  const { world } = p;
  const mass = landMass(map);
  const threat = new Map<NodeId, number>();
  for (const n of map.nodesOf(p.nation)) {
    if (world.control[n] !== p.nation) continue;
    let t = 0;
    for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
      const m = map.adj[k];
      if (m < map.landCount && world.control[m] === w.from) t += enemyPowerAt(m, p.index, p.enemies);
    }
    if (t > 0) threat.set(n, t);
  }
  if (!threat.size) return;
  const power = p.index.power;
  const own = (p.index.byNation.get(p.nation) ?? []).filter((f) => f.status === 'active' && f.kind === 'maneuver' && isGround(f) && !map.isSea(f.node));
  const held = new Map<NodeId, number>();
  const committed = new Set<Formation>();
  for (const f of own) {
    if (f.order.posture !== 'defend' || f.order.target === undefined || !threat.has(f.order.target)) continue;
    committed.add(f);
    held.set(f.order.target, (held.get(f.order.target) ?? 0) + power(f));
  }
  for (const [n, t] of [...threat].sort((a, b) => b[1] - a[1] || a[0] - b[0])) {
    let got = held.get(n) ?? 0;
    const need = t / HOLD_RATIO;
    if (got >= need) continue;
    const near = own
      .filter((f) => !committed.has(f) && mass[f.node] === mass[n] && map.distanceKm(f.node, n) <= MAX_COMMIT_KM)
      .sort((a, b) => map.distanceKm(a.node, n) - map.distanceKm(b.node, n) || (a.id < b.id ? -1 : 1));
    for (const f of near) {
      if (got >= need) break;
      committed.add(f);
      got += power(f);
      issue(p, f, { posture: 'defend', target: n });
    }
  }
}

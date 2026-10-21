import type { Formation, NodeId } from '../../core/types';
import { cannotDrop, departure, dropLoss } from '../land/airborne';
import { enemyPowerAt } from './fronts';
import { isGround, issue } from './forces';
import type { Plan } from './types';

/**
 * Airborne operations, used sparingly: one a month per nation at most, to seize an airfield
 * or a bridgehead just ahead of a ground thrust that can reach it, where the drop zone is
 * lightly held and the enemy's air defence would take little of the lift. Airborne forces
 * dropped beyond relief are lost, as at Arnhem in 1944; dropped onto a defended airfield
 * without a link-up they are mauled, as at Hostomel in 2022.
 */

/** Days between one nation's airborne operations (judgement call: corps-scale drops have been rare even in long wars). */
const COOLDOWN_DAYS = 30;
/** Most of a drop the planners will accept losing to air defence. */
const MAX_LOSS = 0.15;
/** Enemy ground power in and next to the drop zone, which can attack the airhead, as a share of the dropped formation's, above which a drop is not tried. */
const MAX_DEFENDERS = 0.5;
/**
 * Ground power a thrust must bring against the defenders of the cell it attacks before an
 * airborne force is dropped ahead of it, so the airhead is relieved within days, not left
 * as at Arnhem (the classic 3:1 attacker's ratio, as homeland defence uses).
 */
const RELIEF_RATIO = 3;

export function planAirborne(p: Plan): void {
  const { world } = p;
  const { map, catalog } = p.ctx;
  const last = p.ai.airborne[p.nation];
  if (last !== undefined && ((world.tick - last) * world.dtHours) / 24 < COOLDOWN_DAYS) return;
  const own = p.index.byNation.get(p.nation) ?? [];
  const troops = own
    .filter((f) => f.airborne && f.status === 'active' && isGround(f) && f.order.posture !== 'attack' && !map.isSea(f.node) && departure(world, map, f) !== undefined)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  if (!troops.length) return;
  // Drop zones: the cell a winning ground thrust in contact is attacking, and the enemy-held cells just beyond it.
  const thrust = new Map<NodeId, number>();
  for (const f of own) {
    const t = f.order.target;
    if (f.order.posture !== 'attack' || t === undefined || !isGround(f) || f.airborne) continue;
    if (f.node !== t && ![...map.neighbors(t)].includes(f.node)) continue;
    thrust.set(t, (thrust.get(t) ?? 0) + p.index.power(f));
  }
  const zones = new Set<NodeId>();
  for (const [t, power] of thrust) {
    if (power < RELIEF_RATIO * enemyPowerAt(t, p.index, p.enemies)) continue;
    zones.add(t);
    for (const m of map.neighbors(t)) if (m < map.landCount && p.enemies.has(world.control[m])) zones.add(m);
  }
  let best: { f: Formation; zone: NodeId; score: number } | undefined;
  for (const zone of [...zones].sort((a, b) => a - b)) {
    let defenders = enemyPowerAt(zone, p.index, p.enemies);
    for (const m of map.neighbors(zone)) if (m < map.landCount) defenders += enemyPowerAt(m, p.index, p.enemies);
    const value = map.airports[zone] ? 2 : 1;
    for (const f of troops) {
      if (defenders > MAX_DEFENDERS * p.index.power(f) || cannotDrop(world, map, catalog, f, zone)) continue;
      const loss = dropLoss(world, map, catalog, p.nation, zone);
      if (loss > MAX_LOSS) continue;
      const score = value * (1 - loss) - defenders / Math.max(1e-9, p.index.power(f));
      if (!best || score > best.score) best = { f, zone, score };
    }
  }
  if (!best) return;
  issue(p, best.f, { posture: 'air_assault', target: best.zone });
  p.ai.airborne[p.nation] = world.tick;
}

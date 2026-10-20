import type { Formation, NodeId, PlatformClass, PlatformId, TargetClass } from '../../core/types';
import { effectPk, visibility } from '../air';
import { TUNING } from '../air/tables';
import { dominant, issue } from './forces';
import { arsenal, FireBudget, pickTarget, SamCover, reachKm, strikeOptions, withinKm, type StrikeTarget, type TargetGrid } from './strikes';
import type { Plan } from './types';

type AirRole = 'fighter' | 'multirole' | 'strike' | 'support';

const AIR_ROLE: Partial<Record<PlatformClass, AirRole>> = {
  fighter: 'fighter',
  multirole: 'multirole',
  attack_aircraft: 'strike',
  bomber: 'strike',
  stealth_bomber: 'strike',
  strike_drone: 'strike',
  loitering_munition_launcher: 'strike',
  attack_helo: 'strike',
  awacs: 'support',
  tanker: 'support',
  ew_aircraft: 'support',
  isr_drone: 'support',
  maritime_patrol: 'support',
  transport_aircraft: 'support',
  transport_helo: 'support',
  asw_helo: 'support',
};

function roleOf(p: Plan, f: Formation): AirRole | undefined {
  let best: AirRole | undefined, n = 0;
  for (const [role, count] of dominant(f, p.ctx.catalog, (c) => AIR_ROLE[c as PlatformClass])) if (count > n) { n = count; best = role; }
  return best;
}

/**
 * Air wings: fighters contest the air over the fronts, most threatened and
 * enemy-held skies first; multiroles join them while the enemy holds the air
 * over a front in reach and strike otherwise; bombers and drones strike
 * (see strikes.ts for target order); support aircraft orbit the main front.
 */
export function planAir(p: Plan, targets: TargetGrid): void {
  const { map } = p.ctx;
  const km = (a: number, b: number) => map.distanceKm(a as NodeId, b as NodeId);
  const wings = (p.index.byNation.get(p.nation) ?? []).filter((f) => f.kind === 'air_wing' && f.status === 'active');
  if (!wings.length) return;
  const keys = p.sectors.map((s) => s.key);
  const enemySky = (n: NodeId) => {
    const c = p.world.theater.airControl[n];
    return !!c && p.enemies.has(c.nation);
  };
  const cover = new Map<NodeId, number>(keys.map((k) => [k, 0]));
  const budget = new FireBudget(p);
  const sams = new SamCover(p);
  const fighters = wings.filter((w) => roleOf(p, w) === 'fighter').length;
  // Strike packages are planned with the tanker support the nation can lay on; the
  // air system then works out each day's actual radius from tanker sorties in range.
  const tanked = wings.some((w) => Object.entries(w.equipment).some(([id, n]) => n > 0 && p.ctx.catalog.platform(id as PlatformId).class === 'tanker')) ? 1 + TUNING.maxTankerExtension : 1;

  const airSuperiority = (w: Formation, radius: number): boolean => {
    let best: NodeId | undefined, bestScore = -Infinity;
    for (const k of keys) {
      if (km(w.node, k) > radius) continue;
      const score = (enemySky(k) ? 2 : 1) - cover.get(k)!;
      if (score > bestScore) { bestScore = score; best = k; }
    }
    if (best === undefined) return false;
    cover.set(best, cover.get(best)! + 1);
    issue(p, w, { posture: 'air_superiority', target: best });
    return true;
  };
  const strike = (w: Formation, radius: number): boolean => {
    const stock = arsenal(p, w);
    const vis = visibility(Math.min(...Object.keys(w.equipment).map((id) => p.ctx.catalog.platform(id as PlatformId)).filter((pl) => AIR_ROLE[pl.class] && AIR_ROLE[pl.class] !== 'support').map((pl) => pl.protection.stealth)));
    const standoff = new Map<string, number>();
    const canHit = (t: StrikeTarget) => {
      let km = standoff.get(t.cls);
      if (km === undefined) {
        km = stock.reduce((best, m) => (effectPk(m, t.cls) > 0 ? Math.max(best, m.rangeKm) : best), hasFirepower(p, w, t.cls) ? 0 : -1);
        standoff.set(t.cls, km);
      }
      return km >= 0 && withinKm(map, w.node, t.node, radius + km) && sams.clear(w.node, t.node, km, vis);
    };
    const longest = stock.reduce((best, m) => Math.max(best, m.rangeKm), 0);
    const t = pickTarget(targets.near(w.node, radius + longest), canHit);
    if (!t) return false;
    const order = { posture: 'strike' as const, target: t.node, targetClass: t.cls, targetFormation: t.formation };
    budget.propose(w, strikeOptions(stock, t.cls).filter((m) => withinKm(map, w.node, t.node, radius + m.rangeKm)), t, order);
    return true;
  };

  for (const w of wings) {
    const radius = reachKm(p, w);
    switch (roleOf(p, w)) {
      case 'fighter':
        airSuperiority(w, radius);
        break;
      case 'multirole': {
        const contested = keys.some((k) => enemySky(k) && km(w.node, k) <= radius);
        if ((contested || fighters < keys.length) && airSuperiority(w, radius)) break;
        strike(w, radius * tanked);
        break;
      }
      case 'strike':
        strike(w, radius * tanked);
        break;
      case 'support': {
        const k = keys.find((k) => km(w.node, k) <= radius);
        if (k !== undefined) issue(p, w, { posture: 'patrol', target: k });
        break;
      }
    }
  }
  budget.settle();
}

/** Organic weapons (guns, rockets) able to hit `cls`, for aircraft without a suitable missile or bomb. */
function hasFirepower(p: Plan, w: Formation, cls: TargetClass): boolean {
  for (const [id, n] of Object.entries(w.equipment)) if (n > 0 && (p.ctx.catalog.platform(id as PlatformId).firepower[cls] ?? 0) > 0) return true;
  return false;
}

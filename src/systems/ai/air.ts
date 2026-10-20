import type { Formation, NodeId, PlatformClass, PlatformId, TargetClass } from '../../core/types';
import { dominant, issue } from './forces';
import { arsenal, pickTarget, reachKm, withinKm, type StrikeTarget, type TargetGrid } from './strikes';
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
  const fighters = wings.filter((w) => roleOf(p, w) === 'fighter').length;

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
    const hits = new Map<string, boolean>();
    const canHit = (t: StrikeTarget) => {
      let h = hits.get(t.cls);
      if (h === undefined) hits.set(t.cls, (h = stock.some((m) => (m.pk[t.cls] ?? 0) > 0) || hasFirepower(p, w, t.cls)));
      return h;
    };
    const t = pickTarget(targets.near(w.node, radius), (t) => withinKm(map, w.node, t.node, radius) && canHit(t));
    if (!t) return false;
    issue(p, w, { posture: 'strike', target: t.node, targetClass: t.cls, targetFormation: t.formation });
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
        strike(w, radius);
        break;
      }
      case 'strike':
        strike(w, radius);
        break;
      case 'support': {
        const k = keys.find((k) => km(w.node, k) <= radius);
        if (k !== undefined) issue(p, w, { posture: 'patrol', target: k });
        break;
      }
    }
  }
}

/** Organic weapons (guns, rockets) able to hit `cls`, for aircraft without a suitable missile or bomb. */
function hasFirepower(p: Plan, w: Formation, cls: TargetClass): boolean {
  for (const [id, n] of Object.entries(w.equipment)) if (n > 0 && (p.ctx.catalog.platform(id as PlatformId).firepower[cls] ?? 0) > 0) return true;
  return false;
}

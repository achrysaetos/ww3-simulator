import type { Formation, Munition, MunitionId, NodeId, PlatformClass, PlatformId, TargetClass } from '../../core/types';
import { FERRY_FACTOR, visibility } from '../air';
import { TUNING } from '../air/tables';
import { dominant, issue } from './forces';
import { arsenal, FireBudget, pickTarget, pkAgainst, SamCover, reachKm, strikeOptions, withinKm, type StrikeTarget, type TargetGrid } from './strikes';
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

/**
 * Closest a strike wing forward-deploys to the target it flies against: beyond SRBM and
 * tactical-aircraft reach. CSIS's 2023 Taiwan wargame flew LRASM-armed bombers from bases
 * outside the first island chain (Guam, Australia) and from the continental US with tankers.
 */
const STANDOFF_BASE_KM = 1500;

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
  let fields: NodeId[] | undefined;
  const airfields = () => (fields ??= friendlyAirfields(p));
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
  /**
   * A strike goes in with the aircraft that carry the weapon, so each weapon reaches as far as
   * the longest-legged type loading it, not the wing's shortest: the air system flies each type
   * to its own radius. A naval strike brigade's H-6Js take YJ-12s past the JH-7As' reach.
   */
  const weaponReach = (w: Formation, radius: number, tanking: number) => {
    const legs = new Map<MunitionId, number>();
    for (const pl of strikersOf(p, w)) for (const l of pl.loadout) legs.set(l.munition, Math.max(legs.get(l.munition) ?? 0, pl.mobility.rangeKm * tanking));
    return (m: Munition) => (legs.get(m.id) ?? radius) + m.rangeKm;
  };
  const strike = (w: Formation, radius: number): boolean => {
    const stock = arsenal(p, w);
    const vis = visibility(Math.min(...strikersOf(p, w).map((pl) => pl.protection.stealth)));
    const reach = weaponReach(w, radius, tanked);
    const canHit = (t: StrikeTarget) => {
      for (const m of stock) if (pkAgainst(m, t) > 0 && withinKm(map, w.node, t.at ?? t.node, reach(m)) && sams.clear(w.node, t.node, m.rangeKm, vis)) return true;
      return hasFirepower(p, w, t.cls) && withinKm(map, w.node, t.at ?? t.node, radius) && sams.clear(w.node, t.node, 0, vis);
    };
    const t = pickTarget(targets.near(w.node, stock.reduce((best, m) => Math.max(best, reach(m)), radius)), canHit);
    if (!t) return false;
    const order = { posture: 'strike' as const, target: t.node, targetClass: t.cls, targetFormation: t.formation };
    budget.propose(w, strikeOptions(stock, t).filter((m) => withinKm(map, w.node, t.at ?? t.node, reach(m))), t, order);
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
        if (!forwardDeploy(p, w, targets, airfields, weaponReach(w, radius, 1))) strike(w, radius * tanked);
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

function strikersOf(p: Plan, w: Formation) {
  return Object.entries(w.equipment).filter(([, n]) => n > 0).map(([id]) => p.ctx.catalog.platform(id as PlatformId)).filter((pl) => AIR_ROLE[pl.class] && AIR_ROLE[pl.class] !== 'support');
}

/**
 * A strike wing whose weapons cannot reach the most valuable target they could kill without
 * tankers moves toward the war: to the friendly airfield nearest its present base from which
 * they can, no closer to that target than STANDOFF_BASE_KM, staging through airfields within
 * ferry range. Returns whether it moves. Tankers stretch a raid; they do not base a campaign.
 */
function friendlyAirfields(p: Plan): NodeId[] {
  const { map } = p.ctx;
  const fields: NodeId[] = [];
  for (let n = 0; n < map.landCount; n++) if (map.airports[n] > 0 && p.friends.has(p.world.control[n])) fields.push(n as NodeId);
  return fields;
}

function forwardDeploy(p: Plan, w: Formation, targets: TargetGrid, airfields: () => NodeId[], reach: (m: Munition) => number): boolean {
  const { map } = p.ctx;
  const stock = arsenal(p, w);
  const goal = targets.targets.find((t) => stock.some((m) => pkAgainst(m, t) > 0));
  if (!goal) return false;
  const at = goal.at ?? goal.node;
  if (stock.some((m) => pkAgainst(m, goal) > 0 && withinKm(map, w.node, at, reach(m)))) return false;
  const fields = airfields();
  let base: NodeId | undefined, km = Infinity;
  for (const n of fields) {
    if (map.distanceKm(n, at) < STANDOFF_BASE_KM || !stock.some((m) => pkAgainst(m, goal) > 0 && withinKm(map, n, at, reach(m)))) continue;
    const d = map.distanceKm(w.node, n);
    if (d < km) { km = d; base = n; }
  }
  if (base === undefined) return false;
  const ferry = Math.min(...Object.keys(w.equipment).map((id) => p.ctx.catalog.platform(id as PlatformId).mobility.rangeKm)) * FERRY_FACTOR;
  let hop = base;
  if (km > ferry) {
    let left = map.distanceKm(w.node, base);
    for (const n of fields) {
      const d = map.distanceKm(n, base);
      if (d < left && map.distanceKm(w.node, n) <= ferry) { left = d; hop = n; }
    }
    if (hop === base) return false;
  }
  issue(p, w, { posture: 'move', target: hop });
  return true;
}

/** Organic weapons (guns, rockets) able to hit `cls`, for aircraft without a suitable missile or bomb. */
function hasFirepower(p: Plan, w: Formation, cls: TargetClass): boolean {
  for (const [id, n] of Object.entries(w.equipment)) if (n > 0 && (p.ctx.catalog.platform(id as PlatformId).firepower[cls === 'power' ? 'structure' : cls] ?? 0) > 0) return true;
  return false;
}

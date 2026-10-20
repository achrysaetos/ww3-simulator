import type { Formation, NodeId } from '../../core/types';
import { isGround, issue, strength } from './forces';
import { enemyPowerAt, landMass } from './fronts';
import type { Plan, Sector } from './types';

/**
 * Force ratios. The 3:1 attacker's rule (Mearsheimer 1989, "Assessing the
 * Conventional Balance"; Dupuy's QJM analyses of WWII and Arab-Israeli
 * battles) is the local ratio below which assaults on prepared defences
 * usually fail; by the same rule a dug-in defender holds at one third of the
 * attacker's strength.
 */
export const ATTACK_RATIO = 3;
const HOLD_RATIO = 3;
/** Fraction of power kept back as an operational reserve: 30% for a cautious command, 15% for an aggressive one. */
const reserveShare = (aggression: number) => 0.3 - 0.15 * aggression;
/** Farther than this, a formation is in another theatre and is not pulled into this front. */
const MAX_COMMIT_KM = 1500;
const RETREAT_BELOW = { strength: 0.4, supply: 0.15, morale: 0.25 };

function needsRetreat(p: Plan, f: Formation): boolean {
  if (f.status === 'routed') return true;
  const cap = f.supplyCapacity.fuel + f.supplyCapacity.ammo;
  const supply = cap > 0 ? (f.supply.fuel + f.supply.ammo) / cap : 1;
  return strength(p.ai, f) < RETREAT_BELOW.strength || supply < RETREAT_BELOW.supply || f.morale < RETREAT_BELOW.morale;
}

/** A friendly cell at least two cells behind the front, by breadth-first search from `from`. */
function rear(p: Plan, from: NodeId, front: Set<number>): NodeId {
  const { map } = p.ctx;
  const ok = (n: number) => n < map.landCount && p.friends.has(p.world.control[n]);
  const quiet = (n: number) => {
    if (front.has(n)) return false;
    for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) if (front.has(map.adj[k])) return false;
    return true;
  };
  const seen = new Set<number>([from]);
  const queue = [from as number];
  for (let i = 0; i < queue.length && i < 400; i++) {
    const n = queue[i];
    if (ok(n) && quiet(n)) return n as NodeId;
    for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
      const m = map.adj[k];
      if (!seen.has(m) && ok(m)) { seen.add(m); queue.push(m); }
    }
  }
  return from;
}

/**
 * Operational plan for one nation's ground forces: pull back spent units,
 * man every sector in proportion to the threat against it, keep a reserve,
 * and launch attacks only where a local 3:1 can be assembled.
 */
export function planLand(p: Plan): void {
  const { map } = p.ctx;
  if (!p.sectors.length) return;
  const mass = landMass(map);
  const theatres = new Set(p.sectors.map((s) => mass[s.key]));
  const front = new Set<number>();
  for (const s of p.sectors) for (const n of s.nodes) front.add(n);
  const sectorOf = new Map<number, Sector>();
  for (const s of p.sectors) for (const n of s.nodes) sectorOf.set(n, s);

  const pool: Formation[] = [];
  const power = p.index.power;
  for (const f of p.index.byNation.get(p.nation) ?? []) {
    if (!isGround(f) || map.isSea(f.node) || !theatres.has(mass[f.node])) continue;
    if (needsRetreat(p, f)) {
      const to = rear(p, f.node, front);
      issue(p, f, to === f.node ? { posture: 'reserve' } : { posture: 'move', target: to });
      continue;
    }
    pool.push(f);
  }
  if (!pool.length) return;
  const total = pool.reduce((a, f) => a + power(f), 0);
  const km = (a: number, b: number) => map.distanceKm(a as NodeId, b as NodeId);
  const free = new Set(pool);

  // Defence: required power per sector in reach, scaled down together when the army is too small.
  const need = p.sectors.map((s) => (pool.some((f) => km(f.node, s.key) <= MAX_COMMIT_KM) ? s.threat / HOLD_RATIO : 0));
  const needTotal = need.reduce((a, b) => a + b, 0);
  const scale = needTotal > total ? total / needTotal : 1;
  p.sectors.forEach((s, i) => {
    const req = need[i] * scale;
    const holding = (f: Formation) => f.order.posture === 'defend' && f.order.target !== undefined && sectorOf.get(f.order.target) === s;
    const candidates = [...free]
      .map((f) => ({ f, d: holding(f) ? 0 : km(f.node, s.key) }))
      .filter((c) => c.d <= MAX_COMMIT_KM)
      .sort((a, b) => a.d - b.d || (a.f.id < b.f.id ? -1 : 1));
    let got = 0, k = 0;
    for (const { f } of candidates) {
      if (k > 0 && got >= req) break;
      const target = holding(f) ? f.order.target! : s.nodes[k % s.nodes.length];
      issue(p, f, { posture: 'defend', target });
      free.delete(f);
      got += power(f);
      k++;
    }
  });

  // Attack: spare power beyond the reserve goes to sectors where 3:1 is achievable.
  let spare = [...free].reduce((a, f) => a + power(f), 0) - reserveShare(p.profile.aggression) * total;
  const aims = p.ai.aims[p.nation] ?? [];
  const pull = (t: number) => {
    let best = 0;
    for (const o of aims) best = Math.max(best, o.value / (1 + km(t, o.node) / 300));
    return best;
  };
  const unit = total / pool.length;
  for (const s of p.sectors) {
    if (spare <= 0 || !free.size) break;
    const defence = (t: number) => {
      let d = enemyPowerAt(t, p.index, p.enemies);
      for (let k = map.adjStart[t]; k < map.adjStart[t + 1]; k++) {
        const m = map.adj[k];
        if (m < map.landCount && p.enemies.has(p.world.control[m])) d += 0.5 * enemyPowerAt(m, p.index, p.enemies);
      }
      return d;
    };
    let target = -1, bestScore = -1, targetDefence = 0;
    for (const t of s.enemyNodes) {
      const d = defence(t);
      const score = (1 + pull(t)) / (1 + d / unit);
      if (score > bestScore) { bestScore = score; target = t; targetDefence = d; }
    }
    if (target < 0) continue;
    const required = ATTACK_RATIO * targetDefence;
    if (required > spare) continue;
    const assaulting = (f: Formation) => f.order.posture === 'attack' && f.order.target === target;
    const group: Formation[] = [];
    let got = 0;
    const candidates = [...free]
      .map((f) => ({ f, d: assaulting(f) ? 0 : km(f.node, target) }))
      .filter((c) => c.d <= MAX_COMMIT_KM)
      .sort((a, b) => a.d - b.d || (a.f.id < b.f.id ? -1 : 1));
    for (const { f } of candidates) {
      if (group.length && got >= required) break;
      group.push(f);
      got += power(f);
    }
    if (!group.length || got < required || got > spare + 1e-9) continue;
    for (const f of group) {
      issue(p, f, { posture: 'attack', target: target as NodeId });
      free.delete(f);
    }
    spare -= got;
  }

  // Reserve: everything left waits behind the nearest sector.
  const rearOf = new Map<Sector, NodeId>();
  for (const f of free) {
    let near = p.sectors[0], bestD = Infinity;
    for (const s of p.sectors) {
      const d = km(f.node, s.key);
      if (d < bestD) { bestD = d; near = s; }
    }
    if (bestD > MAX_COMMIT_KM) continue;
    if (!rearOf.has(near)) rearOf.set(near, rear(p, near.key, front));
    issue(p, f, { posture: 'reserve', target: rearOf.get(near)! });
  }
}

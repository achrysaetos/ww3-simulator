import type { Formation, NodeId } from '../../core/types';
import { canEnter, landSlice } from '../land';
import { isGround, issue, strength } from './forces';
import { enemyPowerAt, landMass, stagingSector } from './fronts';
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
/**
 * Attritional offensive doctrine: a command that accepts heavy losses keeps
 * line units assaulting wherever they locally match the defender, instead of
 * waiting for a 3:1. Russia 2023-25 (Avdiivka, Pokrovsk: continuous small-unit
 * assaults along most of the front, ISW/RUSI) and North Korean doctrine of
 * massed continuous attack. Gated on aggression x casualty tolerance.
 */
const AGGRESSOR = 0.3;
/** Local ratio at which line units keep assaulting: 3:1 scaled down by the command's appetite for offensive losses (Russia ~0.85:1, DPRK ~1.3:1). */
const pressureRatio = (aggression: number, casualtyTolerance: number) => ATTACK_RATIO / (1 + 4 * aggression * casualtyTolerance);
/**
 * Culminating point: offensives stall as supply lines lengthen and units wear
 * out. No attack is launched more than MAX_DRIVE_CELLS (~300 km) beyond the
 * ground the coalition held at the start, the depth Russia's 2022 drives and
 * Ukraine's 2022 Kharkiv and 2024 Kursk offensives reached before stalling;
 * worn or under-supplied units stop attacking.
 */
const MAX_DRIVE_CELLS = 3;
const FIT_TO_ATTACK = { strength: 0.6, supply: 0.4 };

function needsRetreat(p: Plan, f: Formation): boolean {
  if (f.status === 'routed') return true;
  const cap = f.supplyCapacity.fuel + f.supplyCapacity.ammo;
  const supply = cap > 0 ? (f.supply.fuel + f.supply.ammo) / cap : 1;
  return strength(p.ai, f) < RETREAT_BELOW.strength || supply < RETREAT_BELOW.supply || f.morale < RETREAT_BELOW.morale;
}

/** Connected regions of land the nation's troops can march through without fighting: own, allied and open neutral ground. -1 elsewhere. */
function passableRegions(p: Plan): Int32Array {
  const { map } = p.ctx;
  const region = new Int32Array(map.landCount).fill(-1);
  const open = new Uint8Array(map.landCount);
  for (let n = 0; n < map.landCount; n++) {
    const c = p.world.control[n];
    open[n] = canEnter(p.world, map, p.nation, n as NodeId) && !p.enemies.has(c) ? 1 : 0;
  }
  let next = 0;
  for (let s = 0; s < map.landCount; s++) {
    if (!open[s] || region[s] >= 0) continue;
    const stack = [s];
    region[s] = next;
    while (stack.length) {
      const n = stack.pop()!;
      for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
        const m = map.adj[k];
        if (m < map.landCount && open[m] && region[m] < 0) { region[m] = next; stack.push(m); }
      }
    }
    next++;
  }
  return region;
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
  const staging = stagingSector(p.world, map, p.nation, p.friends, p.enemies, p.index);
  const sectors = staging ? [...p.sectors, staging] : p.sectors;
  if (!sectors.length) return;
  const mass = landMass(map);
  const theatres = new Set(sectors.map((s) => mass[s.key]));
  const front = new Set<number>();
  for (const s of sectors) for (const n of s.nodes) front.add(n);
  const sectorOf = new Map<number, Sector>();
  for (const s of sectors) for (const n of s.nodes) sectorOf.set(n, s);

  const pool: Formation[] = [];
  const power = p.index.power;
  const attritional = p.profile.aggression >= AGGRESSOR;
  const pressAt = pressureRatio(p.profile.aggression, p.profile.casualtyTolerance);
  const origin = landSlice(p.world).origin;
  const inReach = (t: number) => {
    if (!origin.length) return true;
    const seen = new Set<number>([t]);
    let ring = [t];
    for (let hop = 0; hop <= MAX_DRIVE_CELLS; hop++) {
      const next: number[] = [];
      for (const n of ring) {
        if (p.friends.has(origin[n])) return true;
        for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
          const m = map.adj[k];
          if (m < map.landCount && !seen.has(m)) { seen.add(m); next.push(m); }
        }
      }
      ring = next;
    }
    return false;
  };
  const fit = (f: Formation) => {
    const cap = f.supplyCapacity.fuel + f.supplyCapacity.ammo;
    return f.kind === 'maneuver' && strength(p.ai, f) >= FIT_TO_ATTACK.strength && (cap <= 0 || (f.supply.fuel + f.supply.ammo) / cap >= FIT_TO_ATTACK.supply);
  };
  const friendlyPowerAt = (n: number) => {
    let v = 0;
    for (const g of p.index.groundAt.get(n) ?? []) if (p.friends.has(g.nation)) v += power(g);
    return v;
  };
  /** The enemy-held cell next to `n` with the least enemy ground power in it, or -1. */
  const weakestNeighbour = (n: number) => {
    let best = -1, bestPower = Infinity;
    for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
      const m = map.adj[k];
      if (m >= map.landCount || !p.enemies.has(p.world.control[m])) continue;
      const e = enemyPowerAt(m, p.index, p.enemies);
      if (e < bestPower) { bestPower = e; best = m; }
    }
    return best;
  };
  const canPress = (from: number, t: number) => attritional && inReach(t) && friendlyPowerAt(from) >= pressAt * enemyPowerAt(t, p.index, p.enemies);
  for (const f of p.index.byNation.get(p.nation) ?? []) {
    if (!isGround(f) || map.isSea(f.node) || !theatres.has(mass[f.node])) continue;
    if (needsRetreat(p, f)) {
      const to = rear(p, f.node, front);
      issue(p, f, to === f.node ? { posture: 'reserve' } : { posture: 'move', target: to });
      continue;
    }
    // Already fighting inside an enemy-held cell: hold the ground won, and keep pushing if the doctrine allows.
    if (p.enemies.has(p.world.control[f.node])) {
      if (fit(f) && f.order.posture !== 'attack' && canPress(f.node, f.node)) issue(p, f, { posture: 'attack', target: f.node });
      continue;
    }
    // Staged on a host ally's ground next to the enemy (Russian troops in Belarus): that border is a front the sector picture does not cover.
    if (!p.friends.has(p.world.control[f.node]) && fit(f)) {
      const t = weakestNeighbour(f.node);
      const ratio = attritional ? pressAt : ATTACK_RATIO;
      if (t >= 0 && inReach(t) && friendlyPowerAt(f.node) >= ratio * enemyPowerAt(t, p.index, p.enemies)) {
        issue(p, f, { posture: 'attack', target: t as NodeId });
        continue;
      }
    }
    pool.push(f);
  }
  if (!pool.length) return;
  const total = pool.reduce((a, f) => a + power(f), 0);
  const km = (a: number, b: number) => map.distanceKm(a as NodeId, b as NodeId);
  const free = new Set(pool);

  /** The weakest adjacent enemy cell the line units in `n` can assault under attritional doctrine, or -1. */
  const pressureTarget = (n: number) => {
    if (!attritional) return -1;
    const best = weakestNeighbour(n);
    return best >= 0 && canPress(n, best) ? best : -1;
  };

  // Defence: required power per sector in reach, scaled down together when the army is too small.
  const region = passableRegions(p);
  const inRange = (f: Formation, n: number) => km(f.node, n) <= MAX_COMMIT_KM && region[f.node] >= 0 && region[f.node] === region[n];
  const need = sectors.map((s) => (pool.some((f) => inRange(f, s.key)) ? s.threat / HOLD_RATIO : 0));
  const needTotal = need.reduce((a, b) => a + b, 0);
  const scale = needTotal > total ? total / needTotal : 1;
  sectors.forEach((s, i) => {
    const req = need[i] * scale;
    // A unit already on a cell of this line stays on it; one marching to it keeps its post.
    const post = (f: Formation): number | undefined => {
      if (sectorOf.get(f.node) === s) return f.node;
      const t = f.order.target;
      return f.order.posture === 'defend' && t !== undefined && sectorOf.get(t) === s ? t : undefined;
    };
    const candidates = [...free]
      .filter((f) => post(f) !== undefined || inRange(f, s.key))
      .map((f) => ({ f, d: post(f) !== undefined ? 0 : km(f.node, s.key) }))
      .sort((a, b) => a.d - b.d || (a.f.id < b.f.id ? -1 : 1));
    // Newcomers go where the enemy presses hardest relative to what already holds there.
    const pressure = new Map<number, number>();
    const manned = new Map<number, number>();
    for (const n of s.nodes) {
      let e = 2 * enemyPowerAt(n, p.index, p.enemies);
      for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
        const m = map.adj[k];
        if (m < map.landCount && p.enemies.has(p.world.control[m])) e += enemyPowerAt(m, p.index, p.enemies);
      }
      pressure.set(n, e);
      manned.set(n, 0);
    }
    // An unmanned cell on the line is a gap the enemy walks through, so every cell gets a screen before any is reinforced.
    const neediest = () => {
      let best: number = s.nodes[0], gap = -Infinity;
      for (const n of s.nodes) {
        const g = (manned.get(n)! > 0 ? 0 : 1e9) + pressure.get(n)! / HOLD_RATIO - manned.get(n)!;
        if (g > gap) { gap = g; best = n; }
      }
      return best;
    };
    let got = 0, k = 0, unmanned = s.nodes.length;
    for (const { f } of candidates) {
      if (k > 0 && got >= req && !unmanned) break;
      const at = post(f);
      const stay = at !== undefined && manned.get(at)! < pressure.get(at)! / HOLD_RATIO;
      const target = at !== undefined && (stay || !manned.get(at)) ? at : neediest();
      if (!manned.get(target)) unmanned--;
      manned.set(target, manned.get(target)! + power(f));
      const push = f.node === target && fit(f) ? pressureTarget(target) : -1;
      issue(p, f, push >= 0 ? { posture: 'attack', target: push as NodeId } : { posture: 'defend', target: target as NodeId });
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
  for (const s of sectors) {
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
      if (!inReach(t)) continue;
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
      .filter((f) => fit(f) && (assaulting(f) || inRange(f, s.key)))
      .map((f) => ({ f, d: assaulting(f) ? 0 : km(f.node, target) }))
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
    let near = sectors[0], bestD = Infinity;
    for (const s of sectors) {
      const d = inRange(f, s.key) ? km(f.node, s.key) : Infinity;
      if (d < bestD) { bestD = d; near = s; }
    }
    if (bestD > MAX_COMMIT_KM) continue;
    if (!rearOf.has(near)) rearOf.set(near, rear(p, near.key, front));
    issue(p, f, { posture: 'reserve', target: rearOf.get(near)! });
  }
}

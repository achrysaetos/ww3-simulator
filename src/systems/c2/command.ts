import { atWar, type SimContext } from '../../core/engine';
import type { GameMap } from '../../core/map';
import type { Formation, FormationId, FormationKind, NationId, NodeId, World } from '../../core/types';
import type { C2State, C2Tally, CommandNode } from './state';
import { EMITTERS, FRONT_CELL_DEG, HQ, HQ_AIMED_HIT_PER_WEAPON, HQ_HIT_DAMAGE, HQ_HIT_PER_WEAPON, PRECISION_CEP_M } from './tables';

/** Kinds of ground formation that answer to a field HQ. */
const COMMANDED: ReadonlySet<FormationKind> = new Set(['maneuver', 'artillery', 'missile', 'air_defense', 'logistics']);

/** An army or corps named in an order-of-battle entry, as in "69th Guards Motor Rifle Division (6th CAA)". */
const PARENT_ARMY = /\((\d+(?:st|nd|rd|th) (?:Guards )?(?:CAA|GTA|AC|GA|Army|Corps|Army Corps|Tank Army))\)\s*$/;

/** A deterministic draw in [0, 1) per key, tick and seed, so C2 never moves the shared RNG stream. */
export function draw(key: string, tick: number, seed: number): number {
  let h = 2166136261 ^ tick ^ Math.imul(seed, 2654435761);
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export function tallyOf(s: C2State, nation: NationId): C2Tally {
  return (s.tally[nation] ??= { jammedWeapons: 0, jammedDrones: 0, hqHits: 0, delayedOrders: 0 });
}

/**
 * Put every ground formation under an HQ: the army or corps its order-of-battle name gives, else a
 * front HQ derived for its nation's formations in the same FRONT_CELL_DEG square. Each answers to its
 * national command authority at the capital. Formations added later join on the next call.
 */
export function attach(world: World, map: GameMap, s: C2State): void {
  if (s.attachedTo === world.nextId) return;
  s.attachedTo = world.nextId;
  s.space = [];
  s.emitters = [];
  for (const f of Object.values(world.formations)) {
    if (f.status === 'destroyed') continue;
    if (f.kind === 'space') s.space.push(f.id);
    for (const pid in f.equipment) if (pid in EMITTERS) { s.emitters.push(f.id); break; }
    if (f.id in s.chain || !COMMANDED.has(f.kind)) continue;
    const national = `${f.nation}:national`;
    s.hqs[national] ??= { id: national, nation: f.nation, level: 'national', name: `${f.nation} national command`, node: world.nations[f.nation].capital, integrity: 1 };
    const army = PARENT_ARMY.exec(f.name)?.[1];
    // Until relocate places it among its subordinates, a new HQ sits with this formation on home ground, else at the capital.
    const node = world.control[f.node] === f.nation ? f.node : world.nations[f.nation].capital;
    let id: string;
    if (army) {
      id = `${f.nation}:army:${army}`;
      s.hqs[id] ??= { id, nation: f.nation, level: 'army', name: `${army} HQ`, node, parent: national, integrity: 1 };
    } else {
      const lat = Math.floor(map.lat[f.node] / FRONT_CELL_DEG) * FRONT_CELL_DEG, lon = Math.floor(map.lon[f.node] / FRONT_CELL_DEG) * FRONT_CELL_DEG;
      id = `${f.nation}:front:${lat}:${lon}`;
      s.hqs[id] ??= { id, nation: f.nation, level: 'front', name: `${f.nation} front HQ ${lat}..${lat + FRONT_CELL_DEG}N ${lon}..${lon + FRONT_CELL_DEG}E`, node, parent: national, integrity: 1 };
    }
    s.chain[f.id] = id;
  }
}

/**
 * Each field HQ moves to the rear cell, held by its own nation and with no enemy-held neighbour, among or beside its
 * subordinates' that is closest to all of them; command posts sit back from the line. With no rear cell
 * in reach it stays where it is.
 */
export function relocate(world: World, map: GameMap, s: C2State, live: readonly Formation[]): void {
  const subs = new Map<string, Formation[]>();
  for (const f of live) {
    if (map.isSea(f.node)) continue;
    const list = subs.get(s.chain[f.id]);
    if (list) list.push(f);
    else subs.set(s.chain[f.id], [f]);
  }
  const rear = (nation: NationId, n: number) => {
    if (n >= map.landCount || world.control[n] !== nation) return false;
    for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) if (map.adj[k] < map.landCount && atWar(world, nation, world.control[map.adj[k]])) return false;
    return true;
  };
  for (const [id, list] of subs) {
    const hq = s.hqs[id];
    const near = new Set<number>();
    for (const f of list) {
      near.add(f.node);
      for (let k = map.adjStart[f.node]; k < map.adjStart[f.node + 1]; k++) near.add(map.adj[k]);
    }
    let best = -1, bestKm = Infinity;
    for (const a of near) {
      if (!rear(hq.nation, a)) continue;
      let km = 0;
      for (const f of list) km += map.distanceKm(a as NodeId, f.node);
      if (km < bestKm) { bestKm = km; best = a; }
    }
    if (best >= 0) hq.node = best as NodeId;
  }
}

/**
 * Damage to HQs this tick: enemy strikes that reached an HQ's cell (each weapon a chance of finding
 * the command post, better when aimed at it, less for imprecise weapons and hardened sites), nuclear detonations on it,
 * and enemy ground forces overrunning it. Then every HQ recovers toward intact as a replacement stands up.
 */
export function assessHqs(world: World, ctx: SimContext, s: C2State): void {
  const at = new Map<number, CommandNode[]>();
  for (const hq of Object.values(s.hqs)) (at.get(hq.node) ?? at.set(hq.node, []).get(hq.node)!).push(hq);
  let aimed: Set<string> | undefined;
  const aimedAt = (by: NationId, node: number) => {
    aimed ??= new Set(Object.values(world.formations).filter((f) => f.order.posture === 'strike' && f.order.targetClass === 'hardened').map((f) => `${f.nation}|${f.order.target}`));
    return aimed.has(`${by}|${node}`);
  };
  const hit = (hq: CommandNode, damage: number, why: string) => {
    hq.integrity = Math.max(0, hq.integrity - damage);
    tallyOf(s, hq.nation).hqHits++;
    ctx.emit({ type: 'message', tick: world.tick, nation: hq.nation, text: `${hq.name} ${why}` });
  };
  world.events.forEach((e, i) => {
    if (e.type !== 'strike' && e.type !== 'nuclear_detonation') return;
    for (const hq of at.get(e.type === 'strike' ? e.target : e.node) ?? []) {
      if (hq.integrity <= 0 || !atWar(world, e.by, hq.nation)) continue;
      if (e.type === 'nuclear_detonation') {
        hit(hq, 1, 'destroyed by a nuclear detonation');
        continue;
      }
      const leaked = e.fired - e.intercepted;
      if (leaked <= 0 || e.effects.some((x) => x.kind === 'no_effect' && x.why === 'not_hostile')) continue;
      const m = ctx.catalog.munitions.get(e.munition);
      const p = (aimedAt(e.by, e.target) ? HQ_AIMED_HIT_PER_WEAPON : HQ_HIT_PER_WEAPON) * (m && m.cepM <= PRECISION_CEP_M ? 1 : 1 / 3) * (1 - HQ[hq.level].hardness);
      if (draw(`${hq.id}|${i}`, world.tick, world.seed) < 1 - (1 - p) ** leaked) hit(hq, HQ_HIT_DAMAGE, `hit by a ${m?.name ?? e.munition} strike`);
    }
  });
  const days = world.dtHours / 24;
  const hostile = (hq: CommandNode) => atWar(world, hq.nation, world.control[hq.node]);
  for (const hq of Object.values(s.hqs)) {
    if (!hostile(hq)) {
      hq.integrity = Math.min(1, hq.integrity + days / HQ[hq.level].recoverDays);
      continue;
    }
    if (hq.integrity > 0) hit(hq, 1, 'overrun');
    // The survivors fall back on the next HQ up, or a national authority on any field HQ still standing.
    const parent = hq.parent ? s.hqs[hq.parent] : undefined;
    const refuge = parent && !hostile(parent) ? parent : Object.values(s.hqs).find((h) => h.nation === hq.nation && h !== hq && !hostile(h));
    if (refuge) hq.node = refuge.node;
  }
}

/** The HQs above a formation, its own first. */
export function chainOf(s: C2State, id: FormationId): CommandNode[] {
  const out: CommandNode[] = [];
  for (let hq: CommandNode | undefined = s.hqs[s.chain[id]]; hq; hq = hq.parent ? s.hqs[hq.parent] : undefined) out.push(hq);
  return out;
}

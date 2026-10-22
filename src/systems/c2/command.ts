import { atWar, type SimContext } from '../../core/engine';
import { platformCount } from '../../core/forces';
import type { GameMap } from '../../core/map';
import type { Formation, FormationId, FormationKind, NationId, NodeId, World } from '../../core/types';
import { isrOverwatch } from '../intel';
import type { C2State, C2Tally, CommandNode } from './state';
import { ALTERNATE_CP, CORPS_REACH_KM, CORPS_SPAN, DISPLACE_DAYS, EMITTERS, FRONT_CELL_DEG, HQ, HQ_AIMED_HIT_PER_WEAPON, HQ_HIT_DAMAGE, HQ_HIT_PER_WEAPON, HQ_SPACING_KM, PRECISION_CEP_M } from './tables';

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
 * corps HQ derived for up to CORPS_SPAN of its nation's formations within CORPS_REACH_KM. Armies and
 * corps answer to a front HQ for their FRONT_CELL_DEG square, and fronts to the national command
 * authority at the capital. Formations added later join on the next call.
 */
export function attach(world: World, map: GameMap, s: C2State): void {
  if (s.attachedTo === world.nextId) return;
  s.attachedTo = world.nextId;
  s.space = [];
  s.emitters = [];
  // Per HQ, how many formations it commands and where the first of them stands: a corps gathers the formations around it.
  const span = new Map<string, { count: number; anchor: NodeId }>();
  const join = (hq: string, f: Formation) => {
    const at = span.get(hq);
    if (at) at.count++;
    else span.set(hq, { count: 1, anchor: f.node });
  };
  for (const id in s.chain) {
    const f = world.formations[id as FormationId];
    if (f) join(s.chain[id as FormationId], f);
  }
  for (const f of Object.values(world.formations)) {
    if (f.status === 'destroyed') continue;
    if (f.kind === 'space') s.space.push(f.id);
    for (const pid in f.equipment) if (pid in EMITTERS) { s.emitters.push(f.id); break; }
    if (f.id in s.chain || !COMMANDED.has(f.kind)) continue;
    s.size[f.id] = platformCount(f);
    const national = `${f.nation}:national`;
    s.hqs[national] ??= { id: national, nation: f.nation, level: 'national', name: `${f.nation} national command`, node: world.nations[f.nation].capital, integrity: 1 };
    // Until relocate places it among its subordinates, a new HQ sits with this formation on home ground, else at the capital.
    const node = world.control[f.node] === f.nation ? f.node : world.nations[f.nation].capital;
    const lat = Math.floor(map.lat[f.node] / FRONT_CELL_DEG) * FRONT_CELL_DEG, lon = Math.floor(map.lon[f.node] / FRONT_CELL_DEG) * FRONT_CELL_DEG;
    const front = `${f.nation}:front:${lat}:${lon}`;
    s.hqs[front] ??= { id: front, nation: f.nation, level: 'front', name: `${f.nation} front HQ ${lat}..${lat + FRONT_CELL_DEG}N ${lon}..${lon + FRONT_CELL_DEG}E`, node, parent: national, integrity: 1 };
    const army = PARENT_ARMY.exec(f.name)?.[1];
    let id: string;
    if (army) {
      id = `${f.nation}:army:${army}`;
      s.hqs[id] ??= { id, nation: f.nation, level: 'army', name: `${army} HQ`, node, parent: front, integrity: 1 };
    } else {
      id = corpsFor(map, s, f, front, span) ?? newCorps(s, f.nation, front, node);
    }
    s.chain[f.id] = id;
    join(id, f);
  }
}

/** The nearest derived corps of the formation's front with room for it, if any. */
function corpsFor(map: GameMap, s: C2State, f: Formation, front: string, span: Map<string, { count: number; anchor: NodeId }>): string | undefined {
  let best: string | undefined, bestKm = CORPS_REACH_KM;
  for (const hq of Object.values(s.hqs)) {
    const at = span.get(hq.id);
    if (hq.parent !== front || !hq.id.startsWith(`${f.nation}:corps:`) || !at || at.count >= CORPS_SPAN) continue;
    const km = map.distanceKm(at.anchor, f.node);
    if (km <= bestKm) [best, bestKm] = [hq.id, km];
  }
  return best;
}

function newCorps(s: C2State, nation: NationId, front: string, node: NodeId): string {
  const stem = front.replace(':front:', ':corps:');
  let k = 1;
  while (`${stem}:${k}` in s.hqs) k++;
  const id = `${stem}:${k}`;
  s.hqs[id] = { id, nation, level: 'army', name: `${nation} corps HQ ${k}, ${s.hqs[front].name.replace(`${nation} front HQ `, '')}`, node, parent: front, integrity: 1 };
  return id;
}

/**
 * Each field HQ moves to the rear cell, held by its own nation and with no enemy-held neighbour, within two cells of
 * its subordinates' that is closest to all of them: command posts sit back from the line. A front HQ sits among
 * its armies and corps, placed after them. HQs of one nation keep apart (HQ_SPACING_KM), and a struck HQ keeps
 * out of the cell it was hit in. With no rear cell in reach an HQ stays where it is.
 */
export function relocate(world: World, map: GameMap, s: C2State, live: readonly Formation[]): void {
  const subs = new Map<string, Map<number, number>>();
  const weigh = (id: string, node: number, w: number) => {
    const m = subs.get(id) ?? subs.set(id, new Map()).get(id)!;
    m.set(node, (m.get(node) ?? 0) + w);
  };
  for (const f of live) if (!map.isSea(f.node)) weigh(s.chain[f.id], f.node, 1);
  const rear = (nation: NationId, n: number) => {
    if (n >= map.landCount || world.control[n] !== nation) return false;
    for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) if (map.adj[k] < map.landCount && atWar(world, nation, world.control[map.adj[k]])) return false;
    return true;
  };
  const taken = new Map<string, number>();
  const place = (id: string, weight: Map<number, number>) => {
    const hq = s.hqs[id];
    if (hq.displaced && hq.displaced.until <= world.tick) delete hq.displaced;
    const near = new Set<number>(weight.keys());
    for (let ring = 0; ring < 2; ring++) for (const n of [...near]) for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) near.add(map.adj[k]);
    let total = 0;
    for (const w of weight.values()) total += w;
    let best = -1, bestKm = Infinity;
    for (const a of near) {
      if (!rear(hq.nation, a) || a === hq.displaced?.from) continue;
      let km = HQ_SPACING_KM * (taken.get(`${hq.nation}|${a}`) ?? 0);
      for (const [n, w] of weight) km += (w / total) * map.distanceKm(a as NodeId, n as NodeId);
      if (km < bestKm) [bestKm, best] = [km, a];
    }
    if (best >= 0) hq.node = best as NodeId;
    taken.set(`${hq.nation}|${hq.node}`, (taken.get(`${hq.nation}|${hq.node}`) ?? 0) + 1);
    const parent = hq.parent ? s.hqs[hq.parent] : undefined;
    if (parent && parent.level !== 'national') weigh(parent.id, hq.node, total);
  };
  for (const [id, weight] of [...subs]) if (s.hqs[id].level !== 'front') place(id, weight);
  for (const [id, weight] of subs) if (s.hqs[id].level === 'front') place(id, weight);
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
    if (hq.level !== 'national') hq.displaced = { from: hq.node, until: world.tick + Math.round((DISPLACE_DAYS * 24) / world.dtHours) };
    tallyOf(s, hq.nation).hqHits++;
    ctx.emit({ type: 'message', tick: world.tick, nation: hq.nation, text: `${hq.name} ${why}` });
  };
  // Answers to commands are bookkeeping: they do not count toward the event index the hit draws are keyed by.
  let i = -1;
  world.events.forEach((e) => {
    if (e.type !== 'command_result') i++;
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
      const p = (aimedAt(e.by, e.target) && located(world, ctx.map, e.by, hq) ? HQ_AIMED_HIT_PER_WEAPON : HQ_HIT_PER_WEAPON) * (m && m.cepM <= PRECISION_CEP_M ? 1 : 1 / 3) * (1 - HQ[hq.level].hardness);
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

/**
 * Whether `by` has pinned the HQ down: its troops are in or beside the HQ's cell, or its drones
 * watch the cell through the jamming there. Knowing only that an army is somewhere in a cell of
 * thousands of km² does not find its command post; Ukraine's 2022 HIMARS raids found Russian CPs by
 * drone overwatch and their emissions (RUSI, Nov 2022).
 */
function located(world: World, map: GameMap, by: NationId, hq: CommandNode): boolean {
  for (const f of Object.values(world.formations)) {
    if (f.nation !== by || f.status !== 'active' || !COMMANDED.has(f.kind)) continue;
    if (f.node === hq.node) return true;
    for (let k = map.adjStart[f.node]; k < map.adjStart[f.node + 1]; k++) if (map.adj[k] === hq.node) return true;
  }
  return isrOverwatch(world, map, by, hq.node, hq.id);
}

/** How well an HQ works: its own integrity, plus what its alternate command post takes back of the rest. */
export function hqFunction(hq: CommandNode): number {
  return hq.level === 'national' ? hq.integrity : hq.integrity + (1 - hq.integrity) * ALTERNATE_CP();
}

/** The HQs above a formation, its own first. */
export function chainOf(s: C2State, id: FormationId): CommandNode[] {
  const out: CommandNode[] = [];
  for (let hq: CommandNode | undefined = s.hqs[s.chain[id]]; hq; hq = hq.parent ? s.hqs[hq.parent] : undefined) out.push(hq);
  return out;
}

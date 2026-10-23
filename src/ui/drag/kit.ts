/**
 * What the page needs to aim a drag, built on the sim worker once per press: the player's believed world as
 * per-node arrays, the dragged formations' own facts, and routes from where they stand. Built from a `Belief`
 * only, so nothing the player has not seen reaches the page.
 */
import type { Catalog } from '../../core/catalog';
import { atWar, hostility, type Engine } from '../../core/engine';
import { platformCount } from '../../core/forces';
import type { GameMap } from '../../core/map';
import type { Formation, FormationId, FormationKind, Munition, MunitionId, NationId, NodeId, PlatformId, Posture, World } from '../../core/types';
import { combatPower, isGround } from '../../systems/ai/forces';
import { ferryKm, maxReachKm } from '../../systems/air';
import { pkAgainst, threatCategory } from '../../systems/air/iads';
import type { SalvoDefense, SalvoThreat } from '../../systems/air/intercept';
import { dailyRounds, isStrikeMunition } from '../../systems/air/strike';
import { coverageShare, engages, type ThreatCategory } from '../../systems/air/tables';
import { orderDelayHours } from '../../systems/c2';
import { believedWorld, viewOf } from '../../systems/intel/view';
import { infiltrating, TERRAIN } from '../../systems/land/tables';
import { acrossRiver } from '../../systems/land/combat';
import { allied, openTo } from '../../systems/land/state';
import { edgeKm, marchKmPerDay } from '../../systems/land/movement';
import { supplyFactor } from '../../systems/logistics';
import { geography } from '../../systems/naval/geography';
import { minedClosed, navalDestination, straitBarred } from '../../systems/naval/movement';

export type SubjectClass = 'ground' | 'fires' | 'air' | 'fleet' | 'air_defense';
export const SUBJECT_OF_KIND: Record<FormationKind, SubjectClass | null> = {
  maneuver: 'ground', logistics: 'ground', artillery: 'fires', missile: 'fires', air_defense: 'air_defense',
  air_wing: 'air', surface_group: 'fleet', submarine: 'fleet', strategic: null, space: null,
};

declare const BELIEF: unique symbol;
/** The believed world, branded. The only producer is `beliefOf`, so `buildKit` cannot be handed the truth. */
export type Belief = World & { readonly [BELIEF]: true };
export const beliefOf = (w: World, map: GameMap, n: NationId, c: Catalog): Belief => believedWorld(w, map, n, c) as Belief;

/** How the player stands to a nation: indexed by `map.nationIds` position, as the snapshot's control array is. */
export const SIDE = { own: 0, friend: 1, hostile: 2, neutral: 3 } as const;

/** One own formation being dragged. Own facts are true, because the player knows their own forces. */
export interface SubjectUnit {
  id: FormationId;
  cls: SubjectClass;
  kind: FormationKind;
  node: NodeId;
  /** combatPower for land subjects (ai/forces.ts); firepower x readiness for air and naval ones. */
  power: number;
  /** 0..1, operational platforms over operational plus damaged. */
  strength: number;
  /** Land march (land/movement marchKmPerDay) or sea speed, km a day; 0 when it does not march. */
  kmPerDay: number;
  strikeKm: number;
  /** Counter-air reach for an air patrol, else 0. */
  patrolKm: number;
  ferryKm: number;
  /** The munition and rounds one day's strike puts up (air/strike dailyRounds), else 0 and no threat. */
  salvo: number;
  threat?: SalvoThreat;
  c2DelayHours: number;
}

/** Per-node arrays over the whole map. Believed enemy facts and public facts only. */
export interface BeliefField {
  tick: number;
  /** Sum of combatPower of believed hostile ground at the node. */
  enemyPower: Float32Array;
  /** Power-weighted contact confidence, 0..1 (0 where nothing is seen). */
  enemyConf: Float32Array;
  /** Hours since the freshest fix at the node. */
  enemyAgeH: Float32Array;
  /** Believed entrenchment: the cell's standing fortifications, since belief fills unseen units in as freshly on the defence. */
  enemyDig: Float32Array;
  /** TERRAIN defence multiplier: public geography. */
  defense: Float32Array;
  /** 1 on enemy ground the player's side reaches only across a major river (land/combat acrossRiver), where the river duels apply. */
  river: Uint8Array;
  /** The player's supplyFactor at the node, in hundredths (logistics: 100 at home, about 50 in held ground, 25 across the contact line). */
  supply: Uint8Array;
  /** 1 where the holder is at war with the player. */
  hostile: Uint8Array;
  /** Own ground power already standing at the node. */
  ownPower: Float32Array;
}

/** A believed hostile formation, for target classification, contest ratios and the stale-fix caveat. */
export interface KitContact {
  id: FormationId;
  node: NodeId;
  domain: 'ground' | 'air' | 'sea' | 'other';
  power: number;
  conf: number;
  ageH: number;
  mobile: boolean;
}

/** Believed enemy air defence that could cover a strike from the stack, priced against the stack's main threat. */
export interface BelievedSite { node: NodeId; defense: SalvoDefense; conf: number; ageH: number }

/**
 * Effective route km from one source node to every node, as the engine's handlers cost them: land march (move), land
 * assault (a manoeuvre unit's attack, which may enter enemy ground), and sea transit to the node's naval destination.
 * Infinity means no route; NaN means the land search stopped before settling the node (past LAND_SEARCH_KM), so the
 * page neither refuses nor times a march there. Null when no unit at the source moves that way.
 */
export interface Route {
  from: NodeId;
  marchKm: Float32Array | null;
  assaultKm: Float32Array | null;
  /** The node before each one on its shortest assault route (-1: none), so the cells an attack must fight through are known. */
  assaultVia: Int32Array | null;
  seaKm: Float32Array | null;
}

export interface DragKit {
  tick: number;
  player: NationId;
  sides: Uint8Array;
  units: SubjectUnit[];
  field: BeliefField;
  routes: Route[];
  sites: BelievedSite[];
  contacts: Record<string, KitContact>;
}

/** Route km for `u` to `node` as the land handler costs it: a manoeuvre unit's attack may cross enemy ground, a move may not. */
export function routeKm(kit: DragKit, u: SubjectUnit, node: NodeId, posture: Posture): number {
  if (u.node === node) return 0;
  const r = kit.routes.find((x) => x.from === u.node);
  const km = posture === 'attack' && u.kind === 'maneuver' ? r?.assaultKm : r?.marchKm;
  return km ? km[node] : Infinity;
}

/** The cells between `u` and `node` on its shortest assault route, nearest `node` first. */
export function assaultPath(kit: DragKit, u: SubjectUnit, node: NodeId): NodeId[] {
  const via = kit.routes.find((x) => x.from === u.node)?.assaultVia;
  const out: NodeId[] = [];
  if (!via) return out;
  for (let x = via[node]; x >= 0 && x !== u.node && out.length < via.length; x = via[x]) out.push(x as NodeId);
  return out;
}

const fields = new WeakMap<Belief, Map<NationId, BeliefField>>();

/** Worker side. The field is cached per belief (one per tick); routes are searched per press. */
export function buildKit(belief: Belief, engine: Engine, player: NationId, ids: readonly FormationId[]): DragKit | null {
  const { map, catalog } = engine;
  const fs = ids.map((id) => belief.formations[id]).filter((f): f is Formation => !!f && f.nation === player && f.status === 'active' && !f.embarkedOn && SUBJECT_OF_KIND[f.kind] !== null);
  if (!fs.length) return null;
  let byPlayer = fields.get(belief);
  if (!byPlayer) fields.set(belief, (byPlayer = new Map()));
  let field = byPlayer.get(player);
  if (!field) byPlayer.set(player, (field = beliefField(belief, map, catalog, player)));
  const view = viewOf(belief, map, player);
  const contacts: Record<string, KitContact> = {};
  for (const c of view.contacts.values()) {
    const f = belief.formations[c.id];
    if (!f || f.status === 'destroyed' || !atWar(belief, player, c.nation)) continue;
    contacts[c.id] = { id: c.id, node: c.node, domain: domainOf(f.kind), power: powerOf(f, catalog), conf: c.confidence, ageH: c.ageHours, mobile: f.kind !== 'strategic' && f.kind !== 'space' };
  }
  const units = fs.map((f) => subjectOf(belief, engine, f));
  const lead = units.reduce((a, b) => (b.salvo > a.salvo ? b : a));
  return {
    tick: belief.tick,
    player,
    sides: sidesOf(belief, map, player),
    units,
    // Copies: the host transfers the kit's buffers to the page, which would detach the cached field's.
    field: copyField(field),
    routes: routesOf(belief, map, fs),
    sites: lead.threat ? sitesOf(belief, engine, player, units, lead) : [],
    contacts,
  };
}

const domainOf = (k: FormationKind): KitContact['domain'] =>
  k === 'maneuver' || k === 'artillery' || k === 'logistics' || k === 'missile' || k === 'air_defense' ? 'ground' : k === 'air_wing' ? 'air' : k === 'surface_group' || k === 'submarine' ? 'sea' : 'other';

function airSeaPower(f: Formation, catalog: Catalog): number {
  let raw = 0;
  for (const [pid, n] of Object.entries(f.equipment) as [PlatformId, number][]) {
    if (n <= 0) continue;
    for (const v of Object.values(catalog.platform(pid).firepower)) raw += n * (v ?? 0);
  }
  return raw * f.readiness;
}

const powerOf = (f: Formation, catalog: Catalog) => (domainOf(f.kind) === 'ground' ? combatPower(f, catalog) : airSeaPower(f, catalog));

function sidesOf(belief: World, map: GameMap, player: NationId): Uint8Array {
  return Uint8Array.from(map.nationIds, (n) =>
    n === player ? SIDE.own : atWar(belief, player, n) ? SIDE.hostile : allied(belief, player, n) || openTo(belief, player, n) ? SIDE.friend : SIDE.neutral);
}

function beliefField(belief: World, map: GameMap, catalog: Catalog, player: NationId): BeliefField {
  const size = map.size;
  const f: BeliefField = {
    tick: belief.tick,
    enemyPower: new Float32Array(size), enemyConf: new Float32Array(size), enemyAgeH: new Float32Array(size).fill(Infinity),
    enemyDig: new Float32Array(size), defense: new Float32Array(size).fill(1), supply: new Uint8Array(size), hostile: new Uint8Array(size), river: new Uint8Array(size), ownPower: new Float32Array(size),
  };
  const view = viewOf(belief, map, player);
  const foes = hostility(belief).foes.get(player) ?? new Set<NationId>();
  for (const g of Object.values(belief.formations)) {
    if ((g.status !== 'active' && g.status !== 'routed') || g.embarkedOn || !isGround(g) || g.node >= map.landCount) continue;
    if (g.nation === player) f.ownPower[g.node] += combatPower(g, catalog);
    else if (foes.has(g.nation)) {
      const c = view.contacts.get(g.id);
      if (!c) continue;
      const p = combatPower(g, catalog);
      f.enemyConf[g.node] += p * c.confidence;
      f.enemyPower[g.node] += p;
      f.enemyAgeH[g.node] = Math.min(f.enemyAgeH[g.node], c.ageHours);
    }
  }
  const fortified = belief.slices.land?.fortified ?? {};
  for (let n = 0; n < map.landCount; n++) {
    if (f.enemyPower[n] > 0) f.enemyConf[n] /= f.enemyPower[n];
    f.defense[n] = TERRAIN[map.terrain[n]].defense;
    if (foes.has(belief.control[n])) {
      f.hostile[n] = 1;
      f.river[n] = acrossRiver(belief, map, n as NodeId, player) ? 1 : 0;
      f.enemyDig[n] = fortified[n] ?? 0;
    }
    f.supply[n] = Math.round(100 * supplyFactor(belief, map, n as NodeId, player));
  }
  return f;
}

function copyField(f: BeliefField): BeliefField {
  return {
    tick: f.tick, enemyPower: f.enemyPower.slice(), enemyConf: f.enemyConf.slice(), enemyAgeH: f.enemyAgeH.slice(), enemyDig: f.enemyDig.slice(),
    defense: f.defense.slice(), supply: f.supply.slice(), hostile: f.hostile.slice(), river: f.river.slice(), ownPower: f.ownPower.slice(),
  };
}

/** The munition a day's strike would mostly fire: the strike round the formation puts up most of. */
function mainStrike(f: Formation, catalog: Catalog): { m: Munition; rounds: number } | undefined {
  let best: { m: Munition; rounds: number } | undefined;
  for (const [mid, n] of Object.entries(f.magazine) as [MunitionId, number][]) {
    const m = catalog.munitions.get(mid);
    if (!m || n < 1 || !isStrikeMunition(m)) continue;
    const rounds = Math.floor(Math.min(n, dailyRounds(f, mid, catalog)));
    if (rounds > 0 && (!best || rounds > best.rounds)) best = { m, rounds };
  }
  return best;
}

function subjectOf(belief: World, engine: Engine, f: Formation): SubjectUnit {
  const { catalog } = engine;
  const cls = SUBJECT_OF_KIND[f.kind]!;
  const ops = platformCount(f);
  let damaged = 0;
  for (const v of Object.values(f.damaged)) damaged += v;
  const strike = cls === 'fires' || cls === 'air' ? mainStrike(f, catalog) : undefined;
  let seaKph = Infinity;
  if (cls === 'fleet') for (const [pid, n] of Object.entries(f.equipment) as [PlatformId, number][]) if (n > 0) seaKph = Math.min(seaKph, catalog.platform(pid).mobility.speedKph);
  return {
    id: f.id, cls, kind: f.kind, node: f.node,
    power: powerOf(f, catalog),
    strength: ops + damaged > 0 ? ops / (ops + damaged) : 0,
    kmPerDay: cls === 'fleet' ? (Number.isFinite(seaKph) ? seaKph * 24 : 0) : cls === 'air' ? 0 : marchKmPerDay(belief, catalog, f),
    strikeKm: cls === 'fires' || cls === 'air' ? maxReachKm(belief, f, true, engine) : 0,
    patrolKm: cls === 'air' ? maxReachKm(belief, f, false, engine) : 0,
    ferryKm: cls === 'air' ? ferryKm(belief, catalog, f) : 0,
    salvo: strike?.rounds ?? 0,
    ...(strike ? { threat: { count: strike.rounds, speedMach: strike.m.speedMach, interceptDifficulty: strike.m.interceptDifficulty } } : {}),
    c2DelayHours: orderDelayHours(belief, f.id),
  };
}

/** Believed hostile SAM sites and ships within reach of the stack's strike plus their own range, priced against the lead striker's munition. */
function sitesOf(belief: World, engine: Engine, player: NationId, units: SubjectUnit[], lead: SubjectUnit): BelievedSite[] {
  const { map, catalog } = engine;
  const strike = mainStrike(belief.formations[lead.id], catalog);
  const cat: ThreatCategory | null = strike ? threatCategory(strike.m) : null;
  if (!strike || !cat) return [];
  const view = viewOf(belief, map, player);
  const out: BelievedSite[] = [];
  for (const c of view.contacts.values()) {
    const f = belief.formations[c.id];
    if (!f || f.status !== 'active' || (f.kind !== 'air_defense' && f.kind !== 'surface_group') || !atWar(belief, player, f.nation)) continue;
    let channels = 0;
    for (const [pid, n] of Object.entries(f.equipment) as [PlatformId, number][]) channels += (catalog.platform(pid).engagementChannels ?? 0) * n;
    let shot: { m: Munition; eff: number; n: number } | undefined;
    for (const [mid, n] of Object.entries(f.magazine) as [MunitionId, number][]) {
      const m = catalog.munitions.get(mid);
      if (!m || n < 1 || !engages(m, cat)) continue;
      const eff = pkAgainst(m, cat) * (1 - strike.m.interceptDifficulty);
      if (eff > 0 && (!shot || eff > shot.eff)) shot = { m, eff, n };
    }
    if (!channels || !shot) continue;
    const rangeKm = shot.m.rangeKm * coverageShare(shot.m.kind, cat);
    if (!units.some((u) => u.strikeKm > 0 && map.distanceKm(u.node, c.node) <= u.strikeKm + rangeKm)) continue;
    out.push({ node: c.node, conf: c.confidence, ageH: c.ageHours, defense: { channels: channels * f.readiness, interceptors: shot.n, pk: pkAgainst(shot.m, cat), rangeKm } });
  }
  return out.sort((a, b) => b.defense.rangeKm - a.defense.rangeKm);
}

/**
 * Land searches stop at this many effective km, over a week's march for a brigade: searching the whole of Eurasia
 * for every press costs several times the kit's budget, and past a week the pill only says the march is long.
 */
const LAND_SEARCH_KM = 1500;

const MARCHES: ReadonlySet<SubjectClass> = new Set(['ground', 'fires', 'air_defense']);

/**
 * Land edge costs (edgeKm) per adjacency entry, filled as searches reach them, kept for the belief's tick: every
 * press of that tick by the same nation, from any cell, shares them. NaN marks an edge not costed yet.
 */
const edgeCosts = new WeakMap<World, Map<string, Float32Array>>();

function landCost(belief: World, map: GameMap, f: Formation, seize: boolean): (a: NodeId, b: NodeId, km: number, k: number) => number {
  let byKey = edgeCosts.get(belief);
  if (!byKey) edgeCosts.set(belief, (byKey = new Map()));
  const key = `${f.nation}|${seize}|${infiltrating(f)}`;
  let cost = byKey.get(key);
  if (!cost) byKey.set(key, (cost = new Float32Array(map.adj.length).fill(NaN)));
  const c = cost;
  return (a, b, km, k) => {
    let v = c[k];
    if (v !== v) v = c[k] = edgeKm(belief, map, f, a, b, km, seize, false);
    return v;
  };
}

function routesOf(belief: World, map: GameMap, fs: Formation[]): Route[] {
  const out: Route[] = [];
  for (const node of new Set(fs.map((f) => f.node))) {
    const here = fs.filter((f) => f.node === node);
    const walker = here.find((f) => MARCHES.has(SUBJECT_OF_KIND[f.kind]!) && f.node < map.landCount);
    const assault = here.find((f) => f.kind === 'maneuver' && f.node < map.landCount);
    const fleet = here.find((f) => SUBJECT_OF_KIND[f.kind] === 'fleet');
    const assaultVia = assault ? new Int32Array(map.size).fill(-1) : null;
    out.push({
      from: node,
      marchKm: walker ? search(map, node, landCost(belief, map, walker, false), LAND_SEARCH_KM) : null,
      assaultKm: assault ? search(map, node, landCost(belief, map, assault, true), LAND_SEARCH_KM, undefined, assaultVia!) : null,
      assaultVia,
      seaKm: fleet ? seaGoals(belief, map, fleet) : null,
    });
  }
  return out;
}

/**
 * seaPath's costs (naval/movement.ts) as a search from the fleet to every node: barred straits and charted hostile
 * minefields close a zone except as the destination, canal cells are water, and a port is only ever a destination.
 * Each node then takes the km to where a ship ordered there goes (navalDestination).
 */
function seaGoals(belief: World, map: GameMap, f: Formation): Float32Array {
  const geo = geography(map);
  const barred = map.straits.filter((s) => straitBarred(belief, s, f.nation));
  const mines = viewOf(belief, map, f.nation).minefields();
  const terminal = (n: number) => (n >= map.landCount ? minedClosed(belief, n, f.nation, mines) : !geo.canalNodes.has(n));
  const km = search(map, f.node, (a, b, d) => {
    if (barred.some((s) => (s.a === a && s.b === b) || (s.a === b && s.b === a))) return Infinity;
    if (map.isSea(b) || geo.canalNodes.has(b)) return d;
    return geo.portZone.has(b) ? d : Infinity;
  }, Infinity, terminal);
  const out = new Float32Array(map.size).fill(Infinity);
  for (let n = 0; n < map.size; n++) {
    const dest = navalDestination(belief, map, f.nation, n as NodeId);
    if (dest !== undefined) out[n] = km[dest];
  }
  return out;
}

/** Dijkstra from `from` out to `maxKm`; a node `stop` names is reached but not passed through. Fills `prev` with each node's predecessor. */
function search(
  map: GameMap, from: NodeId, cost: (a: NodeId, b: NodeId, km: number, k: number) => number, maxKm: number, stop?: (n: number) => boolean, prev?: Int32Array,
): Float32Array {
  const dist = new Float64Array(map.size).fill(Infinity);
  const heap = new Heap();
  dist[from] = 0;
  heap.push(from, 0);
  let cut = false;
  while (heap.size) {
    const d = heap.minKey(), n = heap.pop();
    if (d > dist[n]) continue;
    if (d > maxKm) {
      cut = true;
      break;
    }
    if (n !== from && stop?.(n)) continue;
    for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
      const m = map.adj[k];
      const c = cost(n as NodeId, m as NodeId, map.adjKm[k], k);
      if (!(c < Infinity)) continue;
      const g = d + c;
      if (g < dist[m]) {
        dist[m] = g;
        if (prev) prev[m] = n;
        heap.push(m, g);
      }
    }
  }
  const out = new Float32Array(dist.length);
  for (let i = 0; i < dist.length; i++) out[i] = dist[i] <= maxKm ? dist[i] : cut ? NaN : Infinity;
  return out;
}

class Heap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.ids.length;
  }
  minKey() {
    return this.keys[0];
  }
  push(id: number, key: number) {
    const { ids, keys } = this;
    let i = ids.length;
    ids.push(id);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p];
      keys[i] = keys[p];
      i = p;
    }
    ids[i] = id;
    keys[i] = key;
  }
  pop(): number {
    const { ids, keys } = this;
    const top = ids[0];
    const id = ids.pop()!, key = keys.pop()!;
    if (ids.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, mk = key;
        if (l < ids.length && keys[l] < mk) (m = l), (mk = keys[l]);
        if (r < ids.length && keys[r] < mk) m = r;
        if (m === i) break;
        ids[i] = ids[m];
        keys[i] = keys[m];
        i = m;
      }
      ids[i] = id;
      keys[i] = key;
    }
    return top;
  }
}

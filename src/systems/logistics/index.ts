import { atWar, type SimContext, type System } from '../../core/engine';
import type { GameMap } from '../../core/map';
import type { Formation, FormationId, MunitionId, NationId, NodeId, Platform, PlatformId, World } from '../../core/types';
import type { NetworkSearch } from './network';
import { refreshNetworks, searchesOf, snapshotInputs, type NetworkState } from './refresh';
import {
  FOOD_TONS_PER_PERSON_DAY, IDLE_FUEL_HOURS_PER_DAY, BEACH_CAPACITY, INFRA_REPAIR_PER_DAY, LIFT_TONS_PER_TROOP, LIFT_TONS_PER_VEHICLE, MAX_REFILL_FRACTION_PER_DAY, NODE_TONS_PER_DAY,
  REARM_PER_DAY, REARMS_IN_PORT_ONLY, SEALIFT_CLASSES, RECONSTITUTE_DAYS, RECONSTITUTE_MIN_STRENGTH, RECONSTITUTED_KINDS, REGENERATED_CLASSES,
  REPAIR_FRACTION_PER_DAY, REPLACE_FRACTION_PER_DAY, RESERVE_REPLACE_MULTIPLIER, SUPPLY_CLASSES, type SupplyClass,
} from './tables';

export { depotsOf } from './network';
export type { NetworkInputs } from './refresh';
export type { SupplyClass } from './tables';

export interface Establishment {
  equipment: Record<PlatformId, number>;
  personnel: number;
}

export interface LogisticsState extends NetworkState {
  /** Strength each formation is rebuilt toward, captured the first tick it is seen; kept for a destroyed formation that can be re-formed. */
  establishment: Record<FormationId, Establishment>;
  /** Tick each destroyed formation awaiting re-forming was destroyed. */
  fallen: Record<FormationId, number>;
  /** Sealift cargo tons (amphibious and cargo ships) each nation fields now, and the most it has fielded; a lodgement's beach supply scales with their ratio. */
  lift: Record<NationId, { now: number; most: number }>;
  /** Bulk classes each nation is currently short of, so a shortage is reported once per episode. */
  short: Record<NationId, SupplyClass[]>;
}

declare module '../../core/types' {
  interface Slices {
    logistics: LogisticsState;
  }
}

/** Share of nominal supply tonnage that reaches `nation`'s forces at `node`, 0..1. Zero for nations with no forces and no war. */
export function supplyFactor(world: World, map: GameMap, node: NodeId, nation: NationId): number {
  const s = world.slices.logistics;
  const key = s?.networkOf[nation];
  return key ? forcesFactor(s, searchesOf(s, map).byKey.get(key)!, node, nation).phi : 0;
}

/** Supply factor for `nation`'s forces at `node`, and whether it comes over the beach. */
function forcesFactor(s: LogisticsState, search: NetworkSearch, node: NodeId, nation: NationId): { phi: number; beach: boolean } {
  const { milli, route } = search.forcesSupplyAt(s.seen, node);
  if (route !== 'beach' || milli <= 0) return { phi: milli / 1000, beach: false };
  const lift = s.lift[nation];
  return { phi: lift ? ((milli / 1000) * lift.now) / lift.most : 0, beach: true };
}

const initialState = (world: World): LogisticsState => ({
  networks: {}, networkOf: {}, seen: snapshotInputs(world), establishment: {}, fallen: {}, lift: {}, short: {},
});

export const logistics: System = {
  id: 'logistics',
  init(world, ctx) {
    const s = (world.slices.logistics = initialState(world));
    // The opening networks belong to a ready-to-run world, so they are searched at setup rather than on the first tick.
    const forces = Object.values(world.formations).filter((f) => f.status !== 'destroyed' && f.status !== 'embarked');
    refreshNetworks(world, ctx.map, s, forces);
  },
  step(world, ctx) {
    const s = (world.slices.logistics ??= initialState(world));
    const dtDays = world.dtHours / 24;
    reconstitute(world, ctx, s);
    const forces = activeFormations(world, ctx, s);
    refreshNetworks(world, ctx.map, s, forces);
    repairInfrastructure(world, ctx, dtDays);
    sustain(world, ctx, s, forces, dtDays);
  },
};

function activeFormations(world: World, ctx: SimContext, s: LogisticsState): Formation[] {
  const out: Formation[] = [];
  const lift = new Map<NationId, number>();
  for (const id in world.formations) {
    const f = world.formations[id as FormationId];
    if (f.status === 'destroyed') {
      if (RECONSTITUTED_KINDS.has(f.kind) && s.establishment[f.id]) s.fallen[f.id] ??= world.tick;
      else delete s.establishment[f.id];
      continue;
    }
    s.establishment[f.id] ??= { equipment: sumCounts(f.equipment, f.damaged), personnel: f.personnel };
    if (f.status !== 'embarked') out.push(f);
    if (f.kind === 'surface_group')
      for (const pid in f.equipment) {
        const p = ctx.catalog.platform(pid as PlatformId);
        if (SEALIFT_CLASSES.has(p.class)) lift.set(f.nation, (lift.get(f.nation) ?? 0) + liftTons(p) * f.equipment[pid as PlatformId]);
      }
  }
  for (const n in s.lift) s.lift[n as NationId].now = 0;
  for (const [n, now] of lift) {
    const l = (s.lift[n] ??= { now, most: now });
    l.now = now;
    l.most = Math.max(l.most, now);
  }
  return out;
}

function liftTons(p: Platform): number {
  const c = p.capacity;
  return c?.cargoTons ?? (c?.vehicles ?? 0) * LIFT_TONS_PER_VEHICLE + (c?.troops ?? 0) * LIFT_TONS_PER_TROOP;
}

/** Repair crews restore cells their controller holds, except along the front where work is under fire. */
function repairInfrastructure(world: World, ctx: SimContext, dtDays: number): void {
  const infra = world.theater.infrastructure, map = ctx.map, control = world.control;
  const step = INFRA_REPAIR_PER_DAY * dtDays;
  for (let n = 0; n < map.landCount; n++) {
    if (infra[n] >= 1) continue;
    const c = control[n];
    if (!c) continue;
    let front = false;
    for (let k = map.adjStart[n]; k < map.adjStart[n + 1] && !front; k++) {
      const o = control[map.adj[k]];
      front = !!o && atWar(world, o, c);
    }
    if (!front) infra[n] = Math.min(1, infra[n] + step);
  }
}

/**
 * Baseline consumption, then resupply. Each formation asks for its deficit, capped by
 * what the chain can push in a tick and scaled by the supply factor at its node. A
 * cell's throughput is shared by everyone in it, and each nation's bulk stocks are
 * shared pro rata when they cannot cover all requests. Forces ashore on an enemy
 * coast also share one beach for the whole nation, BEACH_CAPACITY of a full cell
 * scaled by surviving sealift, and their repair and replacement shrink with it.
 */
function sustain(world: World, ctx: SimContext, s: LogisticsState, forces: Formation[], dtDays: number): void {
  const n = forces.length;
  const factor = new Float64Array(n);
  const want = new Float64Array(n * 3); // fuel, ammo, food per formation
  const nodeTons = new Map<number, number>(), nodeFactor = new Map<number, number>();
  const ashore = new Uint8Array(n), beachTons = new Map<NationId, number>();
  // Hoisted: dev loaders (vitest, tsx) compile imported bindings to getters, which dominates this loop.
  const refill = MAX_REFILL_FRACTION_PER_DAY * dtDays, idleHours = IDLE_FUEL_HOURS_PER_DAY, food = FOOD_TONS_PER_PERSON_DAY * dtDays;
  const { networkOf } = s, searches = searchesOf(s, ctx.map).byKey;

  for (let i = 0; i < n; i++) {
    const f = forces[i];
    consumeBaseline(f, ctx, idleHours[f.kind] * dtDays, food);
    const search = searches.get(networkOf[f.nation]);
    const supply = search ? forcesFactor(s, search, f.node, f.nation) : undefined;
    const phi = (factor[i] = supply?.phi ?? 0);
    if (phi <= 0) continue;
    ashore[i] = supply!.beach ? 1 : 0;
    // Spelled out per class: keyed access by class name dominated this loop.
    const cap = f.supplyCapacity, have = f.supply, j = i * 3;
    const tons =
      (want[j] = Math.min(Math.max(0, cap.fuel - have.fuel), cap.fuel * refill * phi)) +
      (want[j + 1] = Math.min(Math.max(0, cap.ammo - have.ammo), cap.ammo * refill * phi)) +
      (want[j + 2] = Math.min(Math.max(0, cap.food - have.food), cap.food * refill * phi));
    nodeTons.set(f.node, (nodeTons.get(f.node) ?? 0) + tons);
    nodeFactor.set(f.node, Math.max(nodeFactor.get(f.node) ?? 0, phi));
  }

  const nationWant = new Map<NationId, number[]>();
  for (let i = 0; i < n; i++) {
    if (factor[i] <= 0) continue;
    const f = forces[i];
    const tons = nodeTons.get(f.node)!;
    if (tons <= 0) continue;
    const ration = Math.min(1, (NODE_TONS_PER_DAY * nodeFactor.get(f.node)! * dtDays) / tons);
    for (let c = 0; c < 3; c++) want[i * 3 + c] *= ration;
    if (ashore[i]) beachTons.set(f.nation, (beachTons.get(f.nation) ?? 0) + want[i * 3] + want[i * 3 + 1] + want[i * 3 + 2]);
  }
  const beachRation = new Map<NationId, number>();
  for (const [id, tons] of beachTons) {
    const lift = s.lift[id]!;
    if (tons <= 0) continue;
    beachRation.set(id, Math.min(1, (NODE_TONS_PER_DAY * BEACH_CAPACITY * (lift.now / lift.most) * dtDays) / tons));
  }
  for (let i = 0; i < n; i++) {
    if (factor[i] <= 0) continue;
    const f = forces[i];
    if (ashore[i]) {
      const r = beachRation.get(f.nation) ?? 1;
      factor[i] *= r;
      for (let c = 0; c < 3; c++) want[i * 3 + c] *= r;
    }
    const req = nationWant.get(f.nation) ?? nationWant.set(f.nation, [0, 0, 0]).get(f.nation)!;
    for (let c = 0; c < 3; c++) req[c] += want[i * 3 + c];
  }

  const share = new Map<NationId, number[]>();
  for (const [id, req] of nationWant) share.set(id, drawBulk(world, ctx, s, id, req));

  for (let i = 0; i < n; i++) {
    const phi = factor[i];
    if (phi <= 0) continue;
    const f = forces[i];
    const sh = share.get(f.nation);
    if (sh) {
      const cap = f.supplyCapacity, have = f.supply, j = i * 3;
      have.fuel = Math.min(cap.fuel, have.fuel + want[j] * sh[0]);
      have.ammo = Math.min(cap.ammo, have.ammo + want[j + 1] * sh[1]);
      have.food = Math.min(cap.food, have.food + want[j + 2] * sh[2]);
    }
    repair(f, ctx, phi * REPAIR_FRACTION_PER_DAY * dtDays);
    replace(world, ctx, f, s.establishment[f.id], phi * REPLACE_FRACTION_PER_DAY * dtDays * (f.order.posture === 'reserve' ? RESERVE_REPLACE_MULTIPLIER : 1));
  }
  rearm(world, ctx, s, forces, factor, dtDays);
}

/**
 * Reloads magazines from the national stockpile toward the platforms' full loadouts,
 * at a rate set by formation kind and scaled by the supply factor; ships only in a
 * friendly port. A nation's stock of each munition is shared pro rata when it cannot
 * cover every request. Rounds an ORBAT carries beyond the loadouts are not topped up.
 */
function rearm(world: World, ctx: SimContext, s: LogisticsState, forces: Formation[], factor: Float64Array, dtDays: number): void {
  const requests: { f: Formation; m: MunitionId; want: number }[] = [];
  const asked = new Map<string, number>();
  const landCount = ctx.map.landCount;
  for (let i = 0; i < forces.length; i++) {
    const f = forces[i], phi = factor[i];
    const rate = REARM_PER_DAY[f.kind] * phi * dtDays;
    if (rate <= 0 || (REARMS_IN_PORT_ONLY.has(f.kind) && f.node >= landCount)) continue;
    const stock = world.nations[f.nation].stockpile;
    for (const [m, full] of fullLoad(f, ctx)) {
      const missing = full - (f.magazine[m] ?? 0);
      if (missing <= 0 || !((stock[m] ?? 0) >= 1)) continue;
      const want = Math.min(missing, full * rate);
      requests.push({ f, m, want });
      const k = `${f.nation}|${m}`;
      asked.set(k, (asked.get(k) ?? 0) + want);
    }
  }
  for (const { f, m, want } of requests) {
    const stock = world.nations[f.nation].stockpile;
    const x = want * Math.min(1, stock[m] / asked.get(`${f.nation}|${m}`)!);
    const k = Math.min(stock[m], Math.floor(x) + (ctx.rng.chance(x - Math.floor(x)) ? 1 : 0));
    if (k <= 0) continue;
    f.magazine[m] = (f.magazine[m] ?? 0) + k;
    stock[m] -= k;
  }
}

function fullLoad(f: Formation, ctx: SimContext): Map<MunitionId, number> {
  const out = new Map<MunitionId, number>();
  for (const key in f.equipment) {
    const n = f.equipment[key as PlatformId];
    if (n > 0) for (const l of ctx.catalog.platform(key as PlatformId).loadout) out.set(l.munition, (out.get(l.munition) ?? 0) + l.count * n);
  }
  return out;
}

/**
 * Re-forms land formations destroyed at least RECONSTITUTE_DAYS ago at their home
 * garrison, or the capital if that is lost: full manpower from reserves, equipment
 * from the stockpile, green and with empty stocks for logistics to fill. A formation
 * waits while reserves cannot man it or the stockpile cannot field half its platforms.
 */
function reconstitute(world: World, ctx: SimContext, s: LogisticsState): void {
  const due = world.tick - (RECONSTITUTE_DAYS * 24) / world.dtHours;
  for (const key in s.fallen) {
    const id = key as FormationId;
    if (s.fallen[id] > due) continue;
    const f = world.formations[id], est = s.establishment[id], nation = world.nations[f.nation];
    if (nation.status === 'capitulated' || nation.status === 'collapsed') {
      delete s.fallen[id];
      delete s.establishment[id];
      continue;
    }
    const node = world.control[f.home] === f.nation ? f.home : world.control[nation.capital] === f.nation ? nation.capital : undefined;
    if (node === undefined || nation.reserves < est.personnel) continue;
    const equipment: Record<PlatformId, number> = {};
    let fielded = 0, full = 0;
    for (const k in est.equipment) {
      const pid = k as PlatformId, n = est.equipment[pid];
      const free = REGENERATED_CLASSES.has(ctx.catalog.platform(pid).class);
      const take = free ? n : Math.min(n, Math.max(0, Math.floor(nation.stockpile[pid] ?? 0)));
      if (take > 0) equipment[pid] = take;
      fielded += take;
      full += n;
    }
    if (fielded < RECONSTITUTE_MIN_STRENGTH * full) continue;
    for (const k in equipment) {
      const pid = k as PlatformId;
      if (!REGENERATED_CLASSES.has(ctx.catalog.platform(pid).class)) nation.stockpile[pid] -= equipment[pid];
    }
    nation.reserves -= est.personnel;
    Object.assign(f, {
      node, home: node, equipment, damaged: {}, personnel: est.personnel, magazine: {}, supply: { fuel: 0, ammo: 0, food: 0 },
      readiness: 0.5, morale: 0.6, experience: 0.2, fatigue: 0, entrenchment: 0, progressKm: 0,
      order: { posture: 'reserve', issuedTick: world.tick }, status: 'active',
    } satisfies Partial<Formation>);
    delete s.fallen[id];
    ctx.emit({ type: 'message', tick: world.tick, nation: f.nation, text: `${f.name} re-formed at full manpower from reserves` });
  }
}

/** Takes what a nation's forces asked for from its bulk stocks; returns the share of each class it could cover and reports new shortages. */
function drawBulk(world: World, ctx: SimContext, s: LogisticsState, id: NationId, req: number[]): number[] {
  const nation = world.nations[id];
  const flagged = (s.short[id] ??= []);
  const sh = [1, 1, 1];
  for (let c = 0; c < 3; c++) {
    if (req[c] <= 0) continue;
    const cls = SUPPLY_CLASSES[c];
    const have = Math.max(0, nation.bulk[cls]);
    sh[c] = Math.min(1, have / req[c]);
    nation.bulk[cls] = have - req[c] * sh[c];
    const at = flagged.indexOf(cls);
    if (sh[c] < 1 && at < 0) {
      flagged.push(cls);
      ctx.emit({ type: 'shortage', tick: world.tick, nation: id, what: cls });
    } else if (sh[c] >= 1 && at >= 0) flagged.splice(at, 1);
  }
  return sh;
}

function consumeBaseline(f: Formation, ctx: SimContext, idleHours: number, foodPerPerson: number): void {
  let fuelPerHour = 0;
  for (const pid in f.equipment) fuelPerHour += ctx.catalog.platform(pid as PlatformId).mobility.fuelTonsPerHour * f.equipment[pid as PlatformId];
  f.supply.fuel = Math.max(0, f.supply.fuel - fuelPerHour * idleHours);
  f.supply.food = Math.max(0, f.supply.food - f.personnel * foodPerPerson);
}

function repair(f: Formation, ctx: SimContext, p: number): void {
  for (const key in f.damaged) {
    const pid = key as PlatformId, n = f.damaged[pid];
    const back = ctx.rng.binomial(n, p);
    if (!back) continue;
    f.equipment[pid] = (f.equipment[pid] ?? 0) + back;
    if (n === back) delete f.damaged[pid];
    else f.damaged[pid] = n - back;
  }
}

/**
 * Draws platforms from the national stockpile and troops from reserves toward the
 * formation's establishment. Rifle squads re-form from the troops the formation has,
 * in proportion to its manpower, and trucks are requisitioned, so neither needs stock.
 */
function replace(world: World, ctx: SimContext, f: Formation, est: Establishment, rate: number): void {
  const nation = world.nations[f.nation];
  const manned = Math.min(1, f.personnel / Math.max(1, est.personnel));
  for (const key in est.equipment) {
    const pid = key as PlatformId, full = est.equipment[pid];
    const free = REGENERATED_CLASSES.has(ctx.catalog.platform(pid).class);
    const missing = (free ? Math.floor(full * manned) : full) - (f.equipment[pid] ?? 0) - (f.damaged[pid] ?? 0);
    if (missing <= 0) continue;
    const stock = free ? Infinity : nation.stockpile[pid] ?? 0;
    if (stock <= 0) continue;
    const x = full * rate;
    const k = Math.min(missing, stock, Math.floor(x) + (ctx.rng.chance(x - Math.floor(x)) ? 1 : 0));
    if (k <= 0) continue;
    f.equipment[pid] = (f.equipment[pid] ?? 0) + k;
    if (!free) nation.stockpile[pid] = stock - k;
  }
  if (f.personnel >= est.personnel) return;
  const troops = Math.min(est.personnel - f.personnel, nation.reserves, Math.round(est.personnel * rate));
  if (troops > 0) {
    f.personnel += troops;
    nation.reserves -= troops;
  }
}

function sumCounts(a: Record<PlatformId, number>, b: Record<PlatformId, number>): Record<PlatformId, number> {
  const out = { ...a };
  for (const key in b) {
    const k = key as PlatformId;
    out[k] = (out[k] ?? 0) + b[k];
  }
  return out;
}

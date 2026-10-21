import { atWar, type SimContext, type System } from '../../core/engine';
import { addFormation } from '../../core/forces';
import type { Catalog } from '../../core/catalog';
import type { GameMap } from '../../core/map';
import type { Echelon, Formation, FormationId, FormationKind, MunitionId, Nation, NationId, NodeId, Platform, PlatformId, World } from '../../core/types';
import { AIRFRAME } from '../air/tables';
import { NAVAL_KINDS } from '../naval/state';
import { delegated } from '../orders';
import type { NetworkSearch } from './network';
import { refreshNetworks, searchesOf, snapshotInputs, type NetworkState } from './refresh';
import {
  FOOD_TONS_PER_PERSON_DAY, BEACH_CAPACITY, CAPTURED_INFRASTRUCTURE, CAPTURED_REPAIR_SHARE, FRONT_REPAIR_SHARE, INFRA_REPAIR_PER_DAY, LIFT_TONS_PER_TROOP, LIFT_TONS_PER_VEHICLE, MAX_REFILL_FRACTION_PER_DAY, NODE_TONS_PER_DAY,
  MIN_BRIGADE_PERSONNEL, PEACETIME_READINESS_HOURS_PER_DAY, RAISE_EVERY_DAYS, RAISE_TRAINING_DAYS, READINESS_HOURS_PER_DAY, REARM_PER_DAY, REARMS_IN_PORT_ONLY, RESERVE_BUFFER_SHARE, SEALIFT_CLASSES, RECONSTITUTE_DAYS, RECONSTITUTE_MIN_STRENGTH, RECONSTITUTED_KINDS, REGENERATED_CLASSES,
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
  /** Formations each nation has raised from reserves, and the tick its AI last tried. */
  raised: Record<NationId, { count: number; tick: number }>;
  /** Formations in training, their men and kit already drawn, in the order they were raised. */
  raising: Raising[];
  /** Fuel tons a day each nation's fielded forces burn at peacetime readiness: what its peacetime budget must buy. */
  peaceBurn: Record<NationId, number>;
}

/** A formation being raised: manned and equipped, taking the field at tick `ready`. */
export interface Raising {
  nation: NationId;
  name: string;
  kind: FormationKind;
  echelon: Echelon;
  equipment: Record<PlatformId, number>;
  personnel: number;
  ready: number;
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
  networks: {}, networkOf: {}, seen: snapshotInputs(world), establishment: {}, fallen: {}, lift: {}, short: {}, raised: {}, raising: [], captured: {}, peaceBurn: {},
});

export const logistics: System = {
  id: 'logistics',
  commands: ['raise_formation'],
  apply(world, cmd, ctx) {
    if (cmd.type !== 'raise_formation') return;
    const r = raiseFormation(world, ctx, cmd.nation, cmd.template);
    if (typeof r === 'string') ctx.emit({ type: 'message', tick: world.tick, nation: cmd.nation, text: `${cmd.nation} cannot raise a formation: ${r}` });
  },
  init(world, ctx) {
    const s = (world.slices.logistics = initialState(world));
    // The opening networks belong to a ready-to-run world, so they are searched at setup rather than on the first tick.
    const forces = Object.values(world.formations).filter((f) => f.status !== 'destroyed' && f.status !== 'embarked');
    refreshNetworks(world, ctx.map, s, forces);
    s.peaceBurn = peaceBurn(forces, upkeepOf(ctx.catalog));
  },
  step(world, ctx) {
    const s = (world.slices.logistics ??= initialState(world));
    const dtDays = world.dtHours / 24;
    reconstitute(world, ctx, s);
    fieldRaised(world, ctx, s);
    const forces = activeFormations(world, ctx, s);
    raiseFromReserves(world, ctx, s);
    demolishCaptured(world, ctx, s);
    refreshNetworks(world, ctx.map, s, forces);
    repairInfrastructure(world, ctx, s, dtDays);
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

/**
 * Cells that changed hands in war since logistics last looked lose their infrastructure to the
 * retreating side's demolitions, down to CAPTURED_INFRASTRUCTURE of what was there, and stay
 * marked as captured ground until rebuilt. Read before the network refresh takes in the new control.
 */
function demolishCaptured(world: World, ctx: SimContext, s: LogisticsState): void {
  const infra = world.theater.infrastructure, control = world.control, before = s.seen.control;
  s.captured ??= {};
  for (let n = 0; n < ctx.map.landCount; n++) {
    const was = before[n], now = control[n];
    if (was === now || !was || !now || !atWar(world, was, now)) continue;
    infra[n] *= CAPTURED_INFRASTRUCTURE;
    s.captured[n] = world.tick;
  }
}

/**
 * Repair crews restore cells their controller holds, at FRONT_REPAIR_SHARE of the rate along the front
 * where work is under fire, and at CAPTURED_REPAIR_SHARE on ground taken in war until it is rebuilt.
 */
function repairInfrastructure(world: World, ctx: SimContext, s: LogisticsState, dtDays: number): void {
  const infra = world.theater.infrastructure, map = ctx.map, control = world.control;
  const step = INFRA_REPAIR_PER_DAY * dtDays;
  for (const key in s.captured) if (infra[Number(key)] >= 1) delete s.captured[Number(key)];
  for (let n = 0; n < map.landCount; n++) {
    if (infra[n] >= 1) continue;
    const c = control[n];
    if (!c) continue;
    let front = false;
    for (let k = map.adjStart[n]; k < map.adjStart[n + 1] && !front; k++) {
      const o = control[map.adj[k]];
      front = !!o && atWar(world, o, c);
    }
    const rate = (front ? FRONT_REPAIR_SHARE : 1) * (s.captured[n] !== undefined ? CAPTURED_REPAIR_SHARE : 1);
    infra[n] = Math.min(1, infra[n] + rate * step);
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
  const { tons: nodeTons, factor: nodeFactor } = nodeScratch(ctx.map);
  const ashore = new Uint8Array(n), beachTons = new Map<NationId, number>();
  // Hoisted: dev loaders (vitest, tsx) compile imported bindings to getters, which dominates this loop.
  const refill = MAX_REFILL_FRACTION_PER_DAY * dtDays, food = FOOD_TONS_PER_PERSON_DAY * dtDays;
  const { networkOf } = s, searches = searchesOf(s, ctx.map).byKey, upkeep = upkeepOf(ctx.catalog);
  const landCount = ctx.map.landCount, atSea = new Uint8Array(n);

  s.peaceBurn = peaceBurn(forces, upkeep);
  for (let i = 0; i < n; i++) {
    const f = forces[i];
    consumeBaseline(f, upkeep, dtDays, food, world.nations[f.nation].status === 'war');
    const search = searches.get(networkOf[f.nation]);
    atSea[i] = NAVAL_KINDS.has(f.kind) && !alongside(f, landCount) ? 1 : 0;
    // Surface groups take on fuel and food at sea from the fleet's oilers and stores ships, which the
    // orders of battle do not list (US Combat Logistics Force, PLAN Type 901/903); a submarine is not
    // replenished on patrol and gets nothing until it docks.
    if (atSea[i] && f.kind === 'submarine') continue;
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
    nodeTons[f.node] += tons;
    nodeFactor[f.node] = Math.max(nodeFactor[f.node], phi);
  }

  const nationWant = new Map<NationId, number[]>();
  for (let i = 0; i < n; i++) {
    if (factor[i] <= 0) continue;
    const f = forces[i];
    const tons = nodeTons[f.node];
    if (tons <= 0) continue;
    const ration = Math.min(1, (NODE_TONS_PER_DAY * nodeFactor[f.node] * dtDays) / tons);
    for (let c = 0; c < 3; c++) want[i * 3 + c] *= ration;
    if (ashore[i]) beachTons.set(f.nation, (beachTons.get(f.nation) ?? 0) + want[i * 3] + want[i * 3 + 1] + want[i * 3 + 2]);
  }
  for (const f of forces) nodeTons[f.node] = nodeFactor[f.node] = 0;
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
    if (atSea[i]) continue;
    repair(f, ctx, phi * REPAIR_FRACTION_PER_DAY * dtDays);
    replace(world, ctx, upkeep, f, s.establishment[f.id], phi * REPLACE_FRACTION_PER_DAY * dtDays * (f.order.posture === 'reserve' ? RESERVE_REPLACE_MULTIPLIER : 1));
  }
  rearm(world, ctx, upkeep, forces, factor, dtDays);
}

/** In port: a port cell, or the sea zone off a home base whose quay the map's coastline puts offshore (Rota, Norfolk). */
const alongside = (f: Formation, landCount: number): boolean => f.node < landCount || f.node === f.home;

const nodeScratches = new WeakMap<GameMap, { tons: Float64Array; factor: Float64Array }>();

/** Per-node tonnage asked for and best supply factor, all zero between calls to `sustain`. */
function nodeScratch(map: GameMap): { tons: Float64Array; factor: Float64Array } {
  let hit = nodeScratches.get(map);
  if (!hit) nodeScratches.set(map, (hit = { tons: new Float64Array(map.size), factor: new Float64Array(map.size) }));
  return hit;
}

/**
 * Reloads magazines from the national stockpile toward the platforms' full loadouts,
 * at a rate set by formation kind and scaled by the supply factor; ships only in a
 * friendly port. A nation's stock of each munition is shared pro rata when it cannot
 * cover every request. Rounds an ORBAT carries beyond the loadouts are not topped up.
 */
function rearm(world: World, ctx: SimContext, upkeep: Upkeep, forces: Formation[], factor: Float64Array, dtDays: number): void {
  const requests: { f: Formation; m: MunitionId; want: number; asked: Map<MunitionId, number> }[] = [];
  const askedBy = new Map<NationId, Map<MunitionId, number>>();
  const landCount = ctx.map.landCount;
  const load = loadScratch;
  for (let i = 0; i < forces.length; i++) {
    const f = forces[i], phi = factor[i];
    const rate = REARM_PER_DAY[f.kind] * phi * dtDays;
    if (rate <= 0 || (REARMS_IN_PORT_ONLY.has(f.kind) && !alongside(f, landCount))) continue;
    const stock = world.nations[f.nation].stockpile;
    fullLoad(f, upkeep, load);
    for (let j = 0; j < load.munitions.length; j++) {
      const m = load.munitions[j], full = load.rounds[j];
      const missing = full - (f.magazine[m] ?? 0);
      if (missing <= 0 || !((stock[m] ?? 0) >= 1)) continue;
      const want = Math.min(missing, full * rate);
      const asked = askedBy.get(f.nation) ?? askedBy.set(f.nation, new Map()).get(f.nation)!;
      requests.push({ f, m, want, asked });
      asked.set(m, (asked.get(m) ?? 0) + want);
    }
  }
  for (const { f, m, want, asked } of requests) {
    const stock = world.nations[f.nation].stockpile;
    const x = want * Math.min(1, stock[m] / asked.get(m)!);
    const k = Math.min(stock[m], Math.floor(x) + (ctx.rng.chance(x - Math.floor(x)) ? 1 : 0));
    if (k <= 0) continue;
    f.magazine[m] = (f.magazine[m] ?? 0) + k;
    stock[m] -= k;
  }
}

/** Rounds of each munition at full load, in the order the formation's platforms first name them. */
interface FullLoad {
  readonly at: Map<MunitionId, number>;
  readonly munitions: MunitionId[];
  readonly rounds: number[];
}

const loadScratch: FullLoad = { at: new Map(), munitions: [], rounds: [] };

/** Fills `out` with the rounds the formation's platforms carry at full load. */
function fullLoad(f: Formation, upkeep: Upkeep, out: FullLoad): void {
  const { at, munitions, rounds } = out;
  at.clear();
  munitions.length = rounds.length = 0;
  for (const key in f.equipment) {
    const n = f.equipment[key as PlatformId];
    if (n > 0)
      for (const l of upkeep.get(key as PlatformId)!.loadout) {
        const j = at.get(l.munition);
        if (j === undefined) {
          at.set(l.munition, munitions.length);
          munitions.push(l.munition);
          rounds.push(l.count * n);
        } else rounds[j] += l.count * n;
      }
  }
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
    const equipment = equipFromStock(ctx, nation, est, true);
    if (!equipment) continue;
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

/**
 * Equipment for a formation built to `est`: rifle squads and trucks without stock, every other platform
 * drawn from the stockpile, which this takes. Undefined, taking nothing, when the stockpile cannot
 * field RECONSTITUTE_MIN_STRENGTH of the platforms; with `stocked`, of the platforms that need stock,
 * so a tank brigade is not re-formed from free rifle squads and trucks without its tanks.
 */
function equipFromStock(ctx: SimContext, nation: Nation, est: Establishment, stocked: boolean): Record<PlatformId, number> | undefined {
  const equipment: Record<PlatformId, number> = {};
  let fielded = 0, full = 0;
  for (const k in est.equipment) {
    const pid = k as PlatformId, n = est.equipment[pid];
    const free = REGENERATED_CLASSES.has(ctx.catalog.platform(pid).class);
    const take = free ? n : Math.min(n, Math.max(0, Math.floor(nation.stockpile[pid] ?? 0)));
    if (take > 0) equipment[pid] = take;
    if (stocked && free) continue;
    fielded += take;
    full += n;
  }
  if (fielded < RECONSTITUTE_MIN_STRENGTH * full) return undefined;
  for (const k in equipment) {
    const pid = k as PlatformId;
    if (!REGENERATED_CLASSES.has(ctx.catalog.platform(pid).class)) nation.stockpile[pid] -= equipment[pid];
  }
  return equipment;
}

/**
 * Each nation at war whose home front the AI runs turns trained reserves beyond what replacing
 * losses needs into new brigades, starting one every RAISE_EVERY_DAYS, as Ukraine raised the 150-155th
 * mechanized brigades from mobilised men in 2024. A human player's nation raises them by order
 * (`raise_formation`), or by delegating its home front to the AI.
 */
function raiseFromReserves(world: World, ctx: SimContext, s: LogisticsState): void {
  const every = (RAISE_EVERY_DAYS * 24) / world.dtHours;
  s.raised ??= {};
  for (const id in world.nations) {
    const nation = world.nations[id as NationId];
    if (nation.status !== 'war' || !delegated(world, nation.id, 'homefront')) continue;
    const r = (s.raised[nation.id] ??= { count: 0, tick: world.tick - every });
    if (world.tick - r.tick < every) continue;
    // A failed attempt waits as long as a success, so a nation short of men or kit is not rescanned every tick.
    r.tick = world.tick;
    const template = lightestBrigade(world, s, nation.id);
    if (template && nation.reserves >= template.est.personnel + RESERVE_BUFFER_SHARE * fieldedPersonnel(world, s, nation.id)) raiseFormation(world, ctx, nation.id);
  }
}

/** Troops a nation fields, counting formations still in training. */
function fieldedPersonnel(world: World, s: LogisticsState, nation: NationId): number {
  let fielded = 0;
  for (const r of s.raising ?? []) if (r.nation === nation) fielded += r.personnel;
  for (const id in world.formations) {
    const f = world.formations[id as FormationId];
    if (f.nation === nation && f.status !== 'destroyed') fielded += f.personnel;
  }
  return fielded;
}

/**
 * Starts raising a formation for `nationId` modelled on `templateId`, one of its own land formations,
 * or by default on its lightest fielded manoeuvre brigade: the template's establishment manned from
 * trained reserves and equipped as a re-formed one is (rifle squads and trucks free, the rest from
 * the stockpile, at least RECONSTITUTE_MIN_STRENGTH of the platforms). Men and kit leave the pools
 * now; the formation takes the field at the capital after RAISE_TRAINING_DAYS (`fieldRaised`).
 * Returns why not when men, equipment, a template or a held capital are lacking. The AI keeps a
 * replacement reserve back (raiseFromReserves); a player's order may spend it.
 */
export function raiseFormation(world: World, ctx: SimContext, nationId: NationId, templateId?: FormationId): Raising | string {
  const nation = world.nations[nationId];
  const s = world.slices.logistics;
  if (!nation || !s) return 'no such nation';
  if (world.control[nation.capital] !== nation.id) return 'its capital is lost';
  const template = templateId ? templateOf(s, world.formations[templateId], nation.id) : lightestBrigade(world, s, nation.id);
  if (!template) return templateId ? `${templateId} is not one of its land formations` : 'it fields no brigade to model one on';
  if (nation.reserves < template.est.personnel) return `it needs ${template.est.personnel} trained reserves and has ${Math.floor(nation.reserves)}`;
  const equipment = equipFromStock(ctx, nation, template.est, false);
  if (!equipment) return `its stockpile cannot equip half of ${template.f.name}`;
  const r = (s.raised[nation.id] ??= { count: 0, tick: world.tick });
  r.count++;
  const raising: Raising = {
    nation: nation.id, name: `${nation.id} new ${template.f.echelon} ${r.count}`, kind: template.f.kind, echelon: template.f.echelon,
    equipment, personnel: template.est.personnel, ready: world.tick + Math.round((RAISE_TRAINING_DAYS * 24) / world.dtHours),
  };
  nation.reserves -= raising.personnel;
  (s.raising ??= []).push(raising);
  ctx.emit({ type: 'message', tick: world.tick, nation: nation.id, text: `${raising.name} is forming at the capital, ready in ${RAISE_TRAINING_DAYS} days` });
  return raising;
}

function templateOf(s: LogisticsState, f: Formation | undefined, nation: NationId): { f: Formation; est: Establishment } | undefined {
  const est = f && s.establishment[f.id];
  return f && est && f.nation === nation && RECONSTITUTED_KINDS.has(f.kind) ? { f, est } : undefined;
}

function lightestBrigade(world: World, s: LogisticsState, nation: NationId): { f: Formation; est: Establishment } | undefined {
  let template: { f: Formation; est: Establishment } | undefined;
  for (const id in world.formations) {
    const f = world.formations[id as FormationId];
    if (f.nation !== nation || f.status === 'destroyed' || f.kind !== 'maneuver' || f.echelon !== 'brigade') continue;
    const est = s.establishment[f.id];
    if (!est || est.personnel < MIN_BRIGADE_PERSONNEL) continue;
    if (!template || est.personnel < template.est.personnel || (est.personnel === template.est.personnel && f.id < template.f.id)) template = { f, est };
  }
  return template;
}

/**
 * Puts formations whose training is done into the field at the capital, green and in reserve with
 * empty stocks for logistics to fill. One whose capital has fallen waits for it, and is lost if its
 * nation has given up.
 */
function fieldRaised(world: World, ctx: SimContext, s: LogisticsState): void {
  if (!s.raising?.length) return;
  s.raising = s.raising.filter((r) => {
    const nation = world.nations[r.nation];
    if (nation.status === 'capitulated' || nation.status === 'collapsed') return false;
    if (world.tick < r.ready || world.control[nation.capital] !== nation.id) return true;
    const f = addFormation(world, ctx.catalog, {
      nation: r.nation, name: r.name, kind: r.kind, echelon: r.echelon, node: nation.capital, equipment: r.equipment,
      personnel: r.personnel, magazine: {}, supply: { fuel: 0, ammo: 0, food: 0 },
      readiness: 0.5, morale: 0.6, experience: 0.2, order: { posture: 'reserve', issuedTick: world.tick },
    });
    ctx.emit({ type: 'message', tick: world.tick, nation: r.nation, text: `${f.name}, raised from reserves, takes the field at the capital` });
    return false;
  });
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

/**
 * Readiness fuel and rations. Each platform burns its own fuel rate for its class's
 * readiness hours, at wartime rates once its nation is at war, except where another system
 * already burns fuel for what it does: the naval model charges a fleet's station-keeping for
 * everything aboard, and the air model flies an air wing's aircraft every day.
 */
function consumeBaseline(f: Formation, upkeep: Upkeep, dtDays: number, foodPerPerson: number, war: boolean): void {
  if (!NAVAL_KINDS.has(f.kind)) {
    const flown = f.kind === 'air_wing';
    let fuel = 0;
    for (const pid in f.equipment) {
      const u = upkeep.get(pid as PlatformId)!;
      if (!(flown && u.airframe)) fuel += (war ? u.readinessFuel : u.peaceFuel) * f.equipment[pid as PlatformId];
    }
    f.supply.fuel = Math.max(0, f.supply.fuel - fuel * dtDays);
  }
  f.supply.food = Math.max(0, f.supply.food - f.personnel * foodPerPerson);
}

/** Fuel tons a day each nation's forces burn at peacetime readiness, every platform counted whichever system charges it. */
function peaceBurn(forces: readonly Formation[], upkeep: Upkeep): Record<NationId, number> {
  const out: Record<NationId, number> = {};
  for (const f of forces) {
    let fuel = 0;
    for (const pid in f.equipment) fuel += upkeep.get(pid as PlatformId)!.peaceFuel * f.equipment[pid as PlatformId];
    out[f.nation] = (out[f.nation] ?? 0) + fuel;
  }
  return out;
}

/** What sustain reads of each platform, by id. */
type Upkeep = ReadonlyMap<PlatformId, PlatformUpkeep>;

interface PlatformUpkeep {
  /** Fuel tons a day at readiness in war: the platform's hourly burn times its class's readiness hours. */
  readinessFuel: number;
  /** The same at peacetime readiness. */
  peaceFuel: number;
  /** Flown by the air model, which charges its own fuel. */
  airframe: boolean;
  /** Re-formed without stock (REGENERATED_CLASSES). */
  regenerated: boolean;

  loadout: Platform['loadout'];
}

const upkeepCache = new WeakMap<Catalog, Upkeep>();

/** The catalog's platforms as sustain reads them, built once per catalog. */
function upkeepOf(catalog: Catalog): Upkeep {
  let hit = upkeepCache.get(catalog);
  if (!hit) {
    const out = new Map<PlatformId, PlatformUpkeep>();
    for (const [id, p] of catalog.platforms)
      out.set(id, {
        readinessFuel: p.mobility.fuelTonsPerHour * READINESS_HOURS_PER_DAY[p.class],
        peaceFuel: p.mobility.fuelTonsPerHour * PEACETIME_READINESS_HOURS_PER_DAY[p.class],
        airframe: !!AIRFRAME[p.class],
        regenerated: REGENERATED_CLASSES.has(p.class),

        loadout: p.loadout,
      });
    upkeepCache.set(catalog, (hit = out));
  }
  return hit;
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
function replace(world: World, ctx: SimContext, upkeep: Upkeep, f: Formation, est: Establishment, rate: number): void {
  const nation = world.nations[f.nation];
  const manned = Math.min(1, f.personnel / Math.max(1, est.personnel));
  for (const key in est.equipment) {
    const pid = key as PlatformId, full = est.equipment[pid];
    const free = upkeep.get(pid)!.regenerated;
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
  const troops = Math.floor(Math.min(est.personnel - f.personnel, nation.reserves, Math.round(est.personnel * rate)));
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

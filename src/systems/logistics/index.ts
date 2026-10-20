import { atWar, type SimContext, type System } from '../../core/engine';
import type { GameMap } from '../../core/map';
import type { Formation, FormationId, NationId, NodeId, PlatformId, World } from '../../core/types';
import { Controllers } from './network';
import { refreshNetworks, snapshotInputs, type InputSnapshot, type SupplyNetwork } from './refresh';
import {
  FOOD_TONS_PER_PERSON_DAY, IDLE_FUEL_HOURS_PER_DAY, INFRA_REPAIR_PER_DAY, MAX_REFILL_FRACTION_PER_DAY, NODE_TONS_PER_DAY,
  REPAIR_FRACTION_PER_DAY, REPLACE_FRACTION_PER_DAY, RESERVE_REPLACE_MULTIPLIER, SUPPLY_CLASSES, type SupplyClass,
} from './tables';

export { depotsOf } from './network';
export type { SupplyNetwork } from './refresh';
export type { SupplyClass } from './tables';

export interface Establishment {
  equipment: Record<PlatformId, number>;
  personnel: number;
}

export interface LogisticsState {
  /** Keyed by networkKey(members). Only networks some nation currently needs. */
  networks: Record<string, SupplyNetwork>;
  /** Which network each nation with forces or at war draws through. */
  networkOf: Record<NationId, string>;
  /** Network inputs as last seen, for change detection. */
  seen: InputSnapshot;
  /** Strength each formation is rebuilt toward, captured the first tick it is seen. */
  establishment: Record<FormationId, Establishment>;
  /** Bulk classes each nation is currently short of, so a shortage is reported once per episode. */
  short: Record<NationId, SupplyClass[]>;
}

declare module '../../core/types' {
  interface Slices {
    logistics: LogisticsState;
  }
}

/** Share of nominal supply tonnage that reaches `nation`'s forces at `node`, 0..1. Zero for nations with no forces and no war. */
export function supplyFactor(world: World, node: NodeId, nation: NationId): number {
  const s = world.slices.logistics;
  const key = s?.networkOf[nation];
  const net = key ? s.networks[key] : undefined;
  return net ? net.search.milliForForcesAt(s.seen, node) / 1000 : 0;
}

const initialState = (world: World, map: GameMap): LogisticsState => ({
  networks: {}, networkOf: {}, seen: snapshotInputs(world, new Controllers(world, map)), establishment: {}, short: {},
});

export const logistics: System = {
  id: 'logistics',
  init(world, ctx) {
    const s = (world.slices.logistics = initialState(world, ctx.map));
    // The opening networks belong to a ready-to-run world, so they are searched at setup rather than on the first tick.
    const forces = Object.values(world.formations).filter((f) => f.status !== 'destroyed' && f.status !== 'embarked');
    s.networkOf = refreshNetworks(world, ctx.map, s.networks, s.seen, forces);
  },
  step(world, ctx) {
    const s = (world.slices.logistics ??= initialState(world, ctx.map));
    const dtDays = world.dtHours / 24;
    const forces = activeFormations(world, s);
    s.networkOf = refreshNetworks(world, ctx.map, s.networks, s.seen, forces);
    repairInfrastructure(world, ctx, dtDays);
    sustain(world, ctx, s, forces, dtDays);
  },
};

function activeFormations(world: World, s: LogisticsState): Formation[] {
  const out: Formation[] = [];
  for (const id in world.formations) {
    const f = world.formations[id as FormationId];
    if (f.status === 'destroyed') {
      delete s.establishment[f.id];
      continue;
    }
    s.establishment[f.id] ??= { equipment: sumCounts(f.equipment, f.damaged), personnel: f.personnel };
    if (f.status !== 'embarked') out.push(f);
  }
  return out;
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
 * shared pro rata when they cannot cover all requests.
 */
function sustain(world: World, ctx: SimContext, s: LogisticsState, forces: Formation[], dtDays: number): void {
  const n = forces.length;
  const factor = new Float64Array(n);
  const want = new Float64Array(n * 3); // fuel, ammo, food per formation
  const nodeTons = new Map<number, number>(), nodeFactor = new Map<number, number>();
  // Hoisted: dev loaders (vitest, tsx) compile imported bindings to getters, which dominates this loop.
  const refill = MAX_REFILL_FRACTION_PER_DAY * dtDays, idleHours = IDLE_FUEL_HOURS_PER_DAY, food = FOOD_TONS_PER_PERSON_DAY * dtDays;
  const { networks, networkOf } = s;

  for (let i = 0; i < n; i++) {
    const f = forces[i];
    consumeBaseline(f, ctx, idleHours[f.kind] * dtDays, food);
    const net = networks[networkOf[f.nation]];
    const phi = (factor[i] = net ? net.search.milliForForcesAt(s.seen, f.node) / 1000 : 0);
    if (phi <= 0) continue;
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
    const req = nationWant.get(f.nation) ?? nationWant.set(f.nation, [0, 0, 0]).get(f.nation)!;
    for (let c = 0; c < 3; c++) req[c] += want[i * 3 + c] *= ration;
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

/** Draws platforms from the national stockpile and troops from reserves toward the formation's establishment. */
function replace(world: World, ctx: SimContext, f: Formation, est: Establishment, rate: number): void {
  const nation = world.nations[f.nation];
  for (const key in est.equipment) {
    const pid = key as PlatformId, full = est.equipment[pid];
    const missing = full - (f.equipment[pid] ?? 0) - (f.damaged[pid] ?? 0);
    if (missing <= 0) continue;
    const stock = nation.stockpile[pid] ?? 0;
    if (stock <= 0) continue;
    const x = full * rate;
    const k = Math.min(missing, stock, Math.floor(x) + (ctx.rng.chance(x - Math.floor(x)) ? 1 : 0));
    if (k <= 0) continue;
    f.equipment[pid] = (f.equipment[pid] ?? 0) + k;
    nation.stockpile[pid] = stock - k;
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

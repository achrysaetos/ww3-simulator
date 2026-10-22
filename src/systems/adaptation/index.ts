/**
 * Military adaptation (issue #2, section 3): each measure in PAIRS loses effect as the enemy notices it,
 * develops a counter and fields it, and a new generation of the measure restarts the clock. One duel per
 * pair, measure user and countering enemy, kept as a small state machine in slices.adaptation.
 *
 * Noticing reads only what the countering side observed this tick: its own casualties, hulls and parked
 * aircraft lost, attack drones that got through to its ground, its own drone fire lost to jamming, and
 * outages of its own networks. Sole writer of slices.adaptation; it also pays each counter's development
 * cost from the developer's treasury, as occupation costs are paid (nonkinetic/occupation.ts).
 *
 * Other systems read it through `measureEffect` alone: 1 without this system or before a war.
 */
import type { Catalog } from '../../core/catalog';
import { hostility, type SimContext, type System } from '../../core/engine';
import type { FormationId, NationId, PlatformId, World } from '../../core/types';
import { draw } from '../c2/command';
import { LAND_KINDS } from '../land/tables';
import { duelKey, parseDuelKey, type AdaptationState, type Duel } from './state';
import { FIELDING_SHARE, LAG_DAYS, PAIR_IDS, PAIRS, type LagClass, type PairId } from './tables';

export type { AdaptationState, Duel } from './state';
export { duelKey, parseDuelKey } from './state';
export { PAIR_IDS, PAIRS, type PairId } from './tables';

/** One-way drones of at least this range are the long-range attack drones (Shahed class), not FPVs; as outputs/sample.ts counts them. */
const LONG_RANGE_DRONE_KM = 300;

/** Share of the counter fielded, 0..1. */
function counterShare(d: Duel, tick: number): number {
  if (d.stage === 'unnoticed') return 0;
  if (d.stage === 'fielded') return 1;
  return Math.max(0, Math.min(1, (tick - d.fieldFrom) / Math.max(1, d.fieldTo - d.fieldFrom)));
}

/**
 * The measure's effect in this duel relative to the calibrated constants: (1 + swing) ** (opening - fielded),
 * where opening is 1 for a pair calibrated with the counter in service and 0 for one calibrated before it.
 * Exactly 1 at the calibrated point.
 */
export function duelEffect(pair: PairId, d: Duel, tick: number): number {
  const spec = PAIRS[pair];
  return (1 + spec.swing()) ** ((spec.opening === 'countered' ? 1 : 0) - counterShare(d, tick));
}

const opening = (pair: PairId): Duel => (PAIRS[pair].opening === 'fresh' ? { stage: 'unnoticed', gen: 0, seen: 0 } : { stage: 'fielded', gen: 0 });

function lagTicks(world: World, lag: LagClass, key: string): number {
  const [lo, hi] = LAG_DAYS[lag]();
  return Math.round(((lo + (hi - lo) * draw(`adapt|${key}`, world.tick, world.seed)) * 24) / world.dtHours);
}

function pay(world: World, nation: NationId, usdB: number): void {
  const n = world.nations[nation];
  if (n) n.treasuryUsdB -= usdB;
}

/** Advances one duel by a tick in which the counter side observed `seen` losses to the measure. */
function advance(world: World, ctx: SimContext, key: string, d: Duel, seen: number): Duel {
  const { pair, user, counter } = parseDuelKey(key);
  const spec = PAIRS[pair];
  switch (d.stage) {
    case 'unnoticed': {
      const total = d.seen + seen;
      if (total < spec.notice()) return { ...d, seen: total };
      const delay = lagTicks(world, spec.counterLag, key);
      pay(world, counter, spec.costUsdB());
      ctx.emit({ type: 'message', tick: world.tick, nation: counter, text: `${counter} is developing ${spec.counter} against ${user}'s ${spec.measure}` });
      return { stage: 'developing', gen: d.gen, fieldFrom: world.tick + Math.round(delay * (1 - FIELDING_SHARE())), fieldTo: world.tick + delay };
    }
    case 'developing':
      if (world.tick < d.fieldTo) return d;
      ctx.emit({ type: 'message', tick: world.tick, nation: counter, text: `${counter} has fielded ${spec.counter} against ${user}'s ${spec.measure}` });
      return { stage: 'fielded', gen: d.gen };
    case 'fielded':
      if (d.nextGen === undefined) {
        // The measure's side sees its weapon countered the first time it uses it against the counter.
        if (seen <= 0) return d;
        pay(world, user, spec.costUsdB());
        return { ...d, nextGen: world.tick + lagTicks(world, spec.measureLag, key) };
      }
      if (world.tick < d.nextGen) return d;
      ctx.emit({ type: 'message', tick: world.tick, nation: user, text: `${user} has fielded a new generation of ${spec.measure} against ${counter}` });
      return { stage: 'unnoticed', gen: d.gen + 1, seen: 0 };
  }
}

// ---------------------------------------------------------------- what each side observed this tick

const fireCache = new WeakMap<Catalog, Map<PlatformId, { fire: number; drone: boolean; air: boolean }>>();
function platformFacts(catalog: Catalog, pid: PlatformId): { fire: number; drone: boolean; air: boolean } {
  let byId = fireCache.get(catalog);
  if (!byId) fireCache.set(catalog, (byId = new Map()));
  let v = byId.get(pid);
  if (!v) {
    const p = catalog.platforms.get(pid);
    let fire = 0;
    if (p) for (const k in p.firepower) fire += p.firepower[k as keyof typeof p.firepower] ?? 0;
    byId.set(pid, (v = { fire, drone: p?.class === 'loitering_munition_launcher', air: p?.domain === 'air' }));
  }
  return v;
}

/**
 * Per nation, the share of its land fire its drone teams deliver: the share of its enemies' casualties
 * the enemies' own casualty reporting puts down to drones (2024-25: 60-80% of Ukrainian and Russian
 * losses, RUSI Feb 2025), which the model draws from the composition doing the killing.
 */
function droneShares(world: World, catalog: Catalog): Map<NationId, number> {
  const fire = new Map<NationId, [number, number]>();
  for (const id in world.formations) {
    const f = world.formations[id as FormationId];
    if (f.status === 'destroyed' || !LAND_KINDS.has(f.kind)) continue;
    let acc = fire.get(f.nation);
    if (!acc) fire.set(f.nation, (acc = [0, 0]));
    for (const pid in f.equipment) {
      const x = platformFacts(catalog, pid as PlatformId);
      const v = x.fire * f.equipment[pid as PlatformId];
      acc[1] += v;
      if (x.drone) acc[0] += v;
    }
  }
  const out = new Map<NationId, number>();
  for (const [n, [d, all]] of fire) out.set(n, all > 0 ? d / all : 0);
  return out;
}

function usvNations(world: World, catalog: Catalog): Set<NationId> {
  const out = new Set<NationId>();
  for (const id in world.formations) {
    const f = world.formations[id as FormationId];
    if (f.status === 'destroyed' || f.kind !== 'surface_group' || out.has(f.nation)) continue;
    for (const pid in f.equipment) {
      const p = catalog.platforms.get(pid as PlatformId);
      if (p?.class === 'usv' && (p.firepower.ship ?? 0) > 0 && f.equipment[pid as PlatformId] > 0) out.add(f.nation);
    }
  }
  return out;
}

/** This tick's losses each countering side observed to each enemy's measures, by duel key. */
function observe(world: World, ctx: SimContext, foes: ReadonlyMap<NationId, ReadonlySet<NationId>>): Map<string, number> {
  const out = new Map<string, number>();
  const add = (pair: PairId, user: NationId, counter: NationId, x: number) => {
    if (!(x > 0) || !foes.get(user)?.has(counter)) return;
    const k = duelKey(pair, user, counter);
    out.set(k, (out.get(k) ?? 0) + x);
  };
  const { catalog } = ctx;
  let drones: Map<NationId, number> | undefined;
  let usvs: Set<NationId> | undefined;
  for (const e of world.events) {
    if (e.type === 'battle') {
      if (e.domain === 'sea') {
        usvs ??= usvNations(world, catalog);
        if (usvs.has(e.attacker)) add('sea_drone_port', e.attacker, e.defender, Object.values(e.losses[e.defender] ?? {}).reduce((a, b) => a + b, 0));
      } else if (!e.domain || e.domain === 'land') {
        drones ??= droneShares(world, catalog);
        add('fpv_jamming', e.attacker, e.defender, (e.casualties[e.defender] ?? 0) * (drones.get(e.attacker) ?? 0));
        add('fpv_jamming', e.defender, e.attacker, (e.casualties[e.attacker] ?? 0) * (drones.get(e.defender) ?? 0));
      }
    } else if (e.type === 'strike') {
      const victim = world.control[e.target];
      if (!victim) continue;
      const m = catalog.munitions.get(e.munition);
      if (m?.kind === 'drone_oneway' && m.rangeKm >= LONG_RANGE_DRONE_KM) add('jet_drone_interceptor', e.by, victim, e.fired - e.intercepted);
      for (const fx of e.effects) {
        if (fx.kind !== 'losses') continue;
        let parked = 0;
        for (const pid in fx.platforms) if (platformFacts(catalog, pid as PlatformId).air) parked += fx.platforms[pid as PlatformId] ?? 0;
        add('base_dispersal', e.by, victim, parked);
      }
    }
  }
  const dtDays = world.dtHours / 24;
  const c2 = world.slices.c2;
  if (c2) {
    // The share of its commanded formations' fire a side sees jamming take away, averaged over them, per day.
    const jammed = new Map<NationId, [number, number]>();
    for (const id in c2.formations) {
      const f = world.formations[id as FormationId];
      if (!f) continue;
      let acc = jammed.get(f.nation);
      if (!acc) jammed.set(f.nation, (acc = [0, 0]));
      acc[0] += 1 - c2.formations[id as FormationId].guided;
      acc[1]++;
    }
    for (const [victim, [lost, n]] of jammed) {
      const jammers = [...(foes.get(victim) ?? [])].filter((j) => c2.jam[j]);
      for (const j of jammers) add('jamming_fiber', j, victim, ((lost / n) * dtDays) / jammers.length);
    }
  }
  for (const [victim, o] of Object.entries(world.slices.nonKinetic?.outage ?? {}) as [NationId, { telecom?: number }][]) {
    const attackers = [...(foes.get(victim) ?? [])];
    for (const a of attackers) add('cyber_hunting', a, victim, ((o.telecom ?? 0) * dtDays) / attackers.length);
  }
  return out;
}

// ---------------------------------------------------------------- the lookup other systems read

/** Per slice, the mean effect by `pair|user>counter`, `pair|user>*` and `pair|*>counter`, for one tick. */
const effectCache = new WeakMap<AdaptationState, { tick: number; mean: Map<string, number> }>();

function effects(world: World, s: AdaptationState): Map<string, number> {
  const hit = effectCache.get(s);
  if (hit?.tick === world.tick) return hit.mean;
  const sum = new Map<string, [number, number]>();
  const put = (k: string, x: number) => {
    const acc = sum.get(k);
    if (acc) {
      acc[0] += x;
      acc[1]++;
    } else sum.set(k, [x, 1]);
  };
  for (const key in s.duels) {
    const { pair, user, counter } = parseDuelKey(key);
    const x = duelEffect(pair, s.duels[key], world.tick);
    put(key, x);
    put(`${pair}|${user}>*`, x);
    put(`${pair}|*>${counter}`, x);
  }
  const mean = new Map<string, number>();
  for (const [k, [x, n]] of sum) mean.set(k, n === 1 ? x : x / n);
  effectCache.set(s, { tick: world.tick, mean });
  return mean;
}

/**
 * The effect of `user`'s measure of `pair` against `counter`'s counter-measure, relative to the calibrated
 * constants: above 1 while a new generation is unanswered, below 1 once a counter the calibration did not
 * include is in service. Leave out either side to average over its duels, for a hook that sees only one
 * side (a jamming field that merges every enemy emitter). 1 without this system or before a war.
 */
export function measureEffect(world: World, pair: PairId, user: NationId | undefined, counter: NationId | undefined): number {
  const s = world.slices.adaptation;
  if (!s) return 1;
  return effects(world, s).get(`${pair}|${user ?? '*'}>${counter ?? '*'}`) ?? 1;
}

/**
 * A side's adaptation edge: the mean log effect of its measures against its enemies, less that of its
 * enemies' measures against it. Positive while its measures outpace the enemy's counters. 0 at the
 * calibrated point and for a side in no duel.
 */
export function adaptationEdge(world: World, nation: NationId): number {
  const s = world.slices.adaptation;
  if (!s) return 0;
  let sum = 0, n = 0;
  for (const key in s.duels) {
    const { pair, user, counter } = parseDuelKey(key);
    if (user !== nation && counter !== nation) continue;
    const x = Math.log(duelEffect(pair, s.duels[key], world.tick));
    sum += user === nation ? x : -x;
    n++;
  }
  return n ? sum / n : 0;
}

export const adaptation: System = {
  id: 'adaptation',
  init(world) {
    world.slices.adaptation = { duels: {} };
  },
  step(world, ctx) {
    const s = (world.slices.adaptation ??= { duels: {} });
    const foes = hostility(world).foes;
    for (const [user, enemies] of foes)
      for (const counter of enemies)
        for (const pair of PAIR_IDS) {
          const key = duelKey(pair, user, counter);
          s.duels[key] ??= opening(pair);
        }
    const seen = observe(world, ctx, foes);
    for (const key in s.duels) {
      const { user, counter } = parseDuelKey(key);
      // A duel between nations no longer at war keeps where it stands: what each side learnt it keeps.
      if (!foes.get(user)?.has(counter)) continue;
      s.duels[key] = advance(world, ctx, key, s.duels[key], seen.get(key) ?? 0);
    }
    effectCache.delete(s);
  },
};

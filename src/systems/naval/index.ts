import type { SimContext, System } from '../../core/engine';
import type { GameMap } from '../../core/map';
import type { Formation, FormationId, MunitionId, MunitionKind, NationId, NodeId, World } from '../../core/types';
import { estimate, SOURCE_ERROR, STALENESS } from '../intel';
import { landings } from './amphibious';
import { computeSeaControl, computeTradeBlocked } from './blockade';
import { applyHits, fire, navalCombat, targetValue } from './combat';
import { detect } from './detection';
import { harbour, seaNeighbour } from './geography';
import { reindex, tickEnv } from './env';
import { mineWarfare } from './mines';
import { advance } from './movement';
import { refreshOrders } from './orders';
import { sealift } from './sealift';
import { isNavalFormation, ledger } from './state';
import type { SalvoOutcome } from './salvo';
import { OCEAN_SURVEILLANCE } from './tables';

export { applyNavalOrder, isNavalOrder } from './orders';
export { resolveSalvo, hitWeight } from './salvo';
export type { NavalState, NavalLedger } from './state';
export { CHOKEPOINTS } from './geography';
export { isSealift } from './sealift';
export { ANTISHIP_KINDS } from './tables';

/**
 * Surface groups, submarines and naval lift. Each tick: follow/RTB orders, movement with
 * fuel and stores, mine warfare, detection, submarine and missile combat, landings, then
 * sea control and trade interdiction (sole writer of theater.seaControl and tradeBlocked).
 */
export const navalWar: System = {
  id: 'naval',
  init(world, ctx) {
    for (const f of Object.values(world.formations)) {
      if (!isNavalFormation(f) || ctx.map.isSea(f.node) || f.node !== f.home) continue;
      f.node = f.home = harbour(ctx.map, f.home);
    }
    world.slices.naval = {
      mines: {},
      oceanSurveillance: Object.fromEntries(Object.keys(world.nations).map((n) => [n, OCEAN_SURVEILLANCE[n] ?? 0])),
      tracks: {},
      lastFired: {},
      offshore: {},
      ledger: {},
      attrition: {},
    };
  },
  step(world, ctx) {
    const env = tickEnv(world, ctx, true);
    const prior = world.slices.naval.tracks;
    for (const f of env.naval) refreshOrders(world, ctx, f, isTrackedByOwnSide(prior, f.order.targetFormation, f.nation));
    sealift(env);
    for (const f of env.naval) {
      const from = f.node;
      advance(world, ctx.map, f, env.comp(f));
      if (f.node !== from) reindex(env, f, from);
      for (const e of env.embarked.get(f.id) ?? []) e.node = f.node;
    }
    mineWarfare(env);
    const tracks = detect(env);
    world.slices.naval.tracks = Object.fromEntries([...tracks].map(([id, s]) => [id, [...s]]));
    navalCombat(env, tracks);
    landings(env);
    env.naval = env.naval.filter((f) => f.status === 'active');
    computeSeaControl(env);
    computeTradeBlocked(env);
  },
};

function isTrackedByOwnSide(tracks: Record<FormationId, NationId[]>, target: FormationId | undefined, nation: NationId): boolean {
  return !!target && (tracks[target]?.includes(nation) ?? false);
}

/**
 * Radius, km, a ballistic anti-ship warhead's terminal seeker searches once it pulls out of its
 * dive: it must arrive over a basket that holds the ship. A fix from a satellite or a patrol
 * aircraft (5-20 km) puts the ship in the basket; an over-the-horizon radar or ELINT track
 * (~50 km, intel SOURCE_ERROR) does about two times in three; a fix a day old, when the group has
 * steamed hundreds of km, almost never: the ASBM needs a near-real-time cueing chain, which is
 * why CSIS 2023 lists disrupting anti-ship kill chains among its recommendations. Estimate.
 */
const BALLISTIC_SEEKER_KM = 40;
const BALLISTIC_KINDS: ReadonlySet<MunitionKind> = new Set(['antiship_ballistic', 'hgv', 'srbm', 'mrbm', 'irbm']);

/**
 * Share of ballistic rounds fired at group `t` whose seeker basket holds it. Against a poor fix
 * the salvo spreads its aimpoints over the error area, so each round covers basket/error of it.
 * A group in its home port is a fixed target. Intelligence updates after strikes are planned and
 * strikes resolve the next tick, so a fix one tick old is the freshest any strike flies on; only
 * age beyond that adds drift. A world run without intel has perfect intelligence.
 */
function seekerCoverage(world: World, by: NationId, t: Formation): number {
  if ((t.node === t.home && !t.order.path?.length) || !world.slices.intel) return 1;
  const est = estimate(world, by, t.id);
  if (!est || est.node !== t.node) return 0;
  const errorKm = SOURCE_ERROR[est.source].km + STALENESS.surface_group.driftKph * Math.max(0, est.ageHours - world.dtHours);
  return Math.min(1, (BALLISTIC_SEEKER_KM / errorKm) ** 2);
}

/**
 * For air and missile systems striking ships (anti-ship ballistic missiles from shore, air-
 * launched ASCMs): resolve a salvo against a naval formation through the same defenses and
 * damage model the naval system uses. A ballistic round flies to where the striker's
 * intelligence last fixed the group (seekerCoverage); air-launched rounds are carried to the
 * group by aircraft that find it themselves. Spends nothing from the striker; the caller owns
 * its own magazines.
 */
export function strikeNavalGroup(world: World, ctx: SimContext, by: NationId, munition: MunitionId, count: number, target: FormationId): SalvoOutcome | undefined {
  const t = world.formations[target];
  if (!t || t.status !== 'active') return undefined;
  const env = tickEnv(world, ctx);
  const m = ctx.catalog.munition(munition);
  const against = env.comp(t).submerged ? 'submarine' : 'ship';
  const n = Math.floor(count);
  const found = BALLISTIC_KINDS.has(m.kind) ? ctx.rng.binomial(n, seekerCoverage(world, by, t)) : n;
  const out = fire(env, null, t, m, found, against, undefined, by);
  ledger(world, by).missilesFired += n - found;
  if (out.hits.length) applyHits(env, t, out.hits, by);
  return { ...out, fired: n };
}

/**
 * Where a naval group lies within its 3-degree sea zone, for weapon range: a group closing on a
 * coast it is ordered to (a lift group making its landing, or returning to its port) lies off that
 * cell; any other group is taken at the zone's centre. Ships unloading on a beach are within a few
 * km of the shore batteries defending it, not the ~200 km to the zone's centre.
 */
export function navalPosition(map: GameMap, f: Formation): NodeId {
  const t = f.order.target;
  return t !== undefined && !map.isSea(t) && map.isSea(f.node) && seaNeighbour(map, t) === f.node ? t : f.node;
}

/** What sinking a naval group would cost its owner (see targetValue), for strikers choosing among ships. */
export function shipValue(world: World, ctx: SimContext, f: Formation): number {
  return targetValue(tickEnv(world, ctx), f);
}

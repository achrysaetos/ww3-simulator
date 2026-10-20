import type { SimContext, System } from '../../core/engine';
import type { FormationId, MunitionId, NationId, World } from '../../core/types';
import { landings } from './amphibious';
import { computeSeaControl, computeTradeBlocked } from './blockade';
import { applyHits, fire, navalCombat } from './combat';
import { detect } from './detection';
import { reindex, tickEnv } from './env';
import { mineWarfare } from './mines';
import { advance } from './movement';
import { refreshOrders } from './orders';
import type { SalvoOutcome } from './salvo';
import { OCEAN_SURVEILLANCE } from './tables';

export { applyNavalOrder, isNavalOrder } from './orders';
export { resolveSalvo, hitWeight } from './salvo';
export type { NavalState, NavalLedger } from './state';
export { CHOKEPOINTS } from './geography';

/**
 * Surface groups, submarines and naval lift. Each tick: follow/RTB orders, movement with
 * fuel and stores, mine warfare, detection, submarine and missile combat, landings, then
 * sea control and trade interdiction (sole writer of theater.seaControl and tradeBlocked).
 */
export const navalWar: System = {
  id: 'naval',
  init(world) {
    world.slices.naval = {
      mines: {},
      oceanSurveillance: Object.fromEntries(Object.keys(world.nations).map((n) => [n, OCEAN_SURVEILLANCE[n] ?? 0])),
      tracks: {},
      lastFired: {},
      ledger: {},
      attrition: {},
    };
  },
  step(world, ctx) {
    const env = tickEnv(world, ctx, true);
    const prior = world.slices.naval.tracks;
    for (const f of env.naval) refreshOrders(world, ctx, f, isTrackedByOwnSide(prior, f.order.targetFormation, f.nation));
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
 * For air and missile systems striking ships (anti-ship ballistic missiles from shore, air-
 * launched ASCMs): resolve a salvo against a naval formation through the same defenses and
 * damage model the naval system uses. Spends nothing from the striker; the caller owns its
 * own magazines.
 */
export function strikeNavalGroup(world: World, ctx: SimContext, by: NationId, munition: MunitionId, count: number, target: FormationId): SalvoOutcome | undefined {
  const t = world.formations[target];
  if (!t || t.status !== 'active') return undefined;
  const env = tickEnv(world, ctx);
  const m = ctx.catalog.munition(munition);
  const against = env.comp(t).submerged ? 'submarine' : 'ship';
  const out = fire(env, null, t, m, count, against, undefined, by);
  if (out.hits.length) applyHits(env, t, out.hits, by);
  return out;
}

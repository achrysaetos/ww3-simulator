import type { SimContext } from '../../core/engine';
import type { Formation, FormationId, PlatformId, World } from '../../core/types';
import { type Composition, compose, isNavalFormation } from './state';
import { AIR_ROLES } from './tables';

/** Per-tick indexes over the world that every naval phase shares. */
export interface TickEnv {
  world: World;
  ctx: SimContext;
  comp(f: Formation): Composition;
  /** Drop a cached composition after equipment changes. */
  invalidate(f: Formation): void;
  /** Active naval formations by node. */
  byNode: Map<number, Formation[]>;
  /** Air wings with maritime search roles, by the sea node they work over. */
  maritimeAir: Map<number, Formation[]>;
  /** Formations embarked on each lift group. */
  embarked: Map<FormationId, Formation[]>;
  naval: Formation[];
  /** Active land air-defence formations, which cover ships lying in a port within their reach. */
  airDefense: Formation[];
}

const cache = new WeakMap<World, { tick: number; env: TickEnv }>();

export function tickEnv(world: World, ctx: SimContext, fresh = false): TickEnv {
  const hit = cache.get(world);
  if (!fresh && hit && hit.tick === world.tick) return hit.env;
  const comps = new Map<FormationId, Composition>();
  const env: TickEnv = {
    world, ctx,
    comp: (f) => {
      let c = comps.get(f.id);
      if (!c) comps.set(f.id, (c = compose(f, ctx.catalog)));
      return c;
    },
    invalidate: (f) => comps.delete(f.id),
    byNode: new Map(), maritimeAir: new Map(), embarked: new Map(), naval: [], airDefense: [],
  };
  for (const f of Object.values(world.formations)) {
    if (f.status === 'embarked' && f.embarkedOn) push(env.embarked, f.embarkedOn, f);
    if (f.status !== 'active') continue;
    if (isNavalFormation(f)) {
      env.naval.push(f);
      push(env.byNode, f.node, f);
    } else if (f.kind === 'air_defense') env.airDefense.push(f);
    else if (f.kind === 'air_wing') {
      const over = f.order.posture === 'patrol' && f.order.target !== undefined ? f.order.target : f.node;
      if (ctx.map.isSea(over) && Object.keys(f.equipment).some((p) => AIR_ROLES[ctx.catalog.platform(p as PlatformId).class]))
        push(env.maritimeAir, over, f);
    }
  }
  cache.set(world, { tick: world.tick, env });
  return env;
}

/** Re-index a formation after it changes node mid-tick. */
export function reindex(env: TickEnv, f: Formation, from: number): void {
  const list = env.byNode.get(from);
  if (list) {
    const i = list.indexOf(f);
    if (i >= 0) list.splice(i, 1);
    if (!list.length) env.byNode.delete(from);
  }
  if (f.status === 'active') push(env.byNode, f.node, f);
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const l = m.get(k);
  if (l) l.push(v);
  else m.set(k, [v]);
}

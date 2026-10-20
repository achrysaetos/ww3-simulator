import type { Catalog } from '../core/catalog';
import type { SimContext, System } from '../core/engine';
import type { Command, Domain, Formation, PlatformId, World } from '../core/types';

export type OrderCommand = Extract<Command, { type: 'order' }>;
export type OrderHandler = (world: World, cmd: OrderCommand, ctx: SimContext) => void;

/** The domain that moves a formation: the domain holding most of its platforms. */
export function formationDomain(f: Formation, catalog: Catalog): Domain {
  const weight = new Map<Domain, number>();
  for (const [pid, n] of Object.entries(f.equipment)) {
    const d = catalog.platforms.get(pid as PlatformId)?.domain ?? 'land';
    weight.set(d, (weight.get(d) ?? 0) + n);
  }
  let best: Domain = 'land', bestN = -1;
  for (const [d, n] of weight) if (n > bestN) { best = d; bestN = n; }
  return best === 'subsurface' ? 'sea' : best;
}

/**
 * Owns the shared 'order' command. Validates that the issuing nation owns the
 * formation, then hands it to the domain system that moves that kind of unit.
 */
export function createOrderRouter(handlers: Partial<Record<Domain, OrderHandler>>): System {
  return {
    id: 'orders',
    commands: ['order'],
    apply(world, cmd, ctx) {
      if (cmd.type !== 'order') return;
      const f = world.formations[cmd.formation];
      if (!f || f.nation !== cmd.nation || f.status === 'destroyed') return;
      const handler = handlers[formationDomain(f, ctx.catalog)];
      if (handler) handler(world, cmd, ctx);
      else f.order = { ...cmd.order, issuedTick: world.tick };
    },
    step() {},
  };
}

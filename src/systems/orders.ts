import type { SimContext, System } from '../core/engine';
import type { Command, World } from '../core/types';

export type OrderCommand = Extract<Command, { type: 'order' }>;
/** Returns true when it took the order; false passes it to the next handler. */
export type OrderHandler = (world: World, cmd: OrderCommand, ctx: SimContext) => boolean;

/**
 * Owns the shared 'order' command and offers it to each domain in turn. The
 * first domain that recognises the formation takes the order.
 */
export function createOrderRouter(handlers: readonly OrderHandler[]): System {
  return {
    id: 'orders',
    commands: ['order'],
    apply(world, cmd, ctx) {
      if (cmd.type !== 'order') return;
      const f = world.formations[cmd.formation];
      if (!f || f.nation !== cmd.nation || f.status === 'destroyed') return;
      if (handlers.some((h) => h(world, cmd, ctx))) return;
      f.order = { ...cmd.order, issuedTick: world.tick };
    },
    step() {},
  };
}

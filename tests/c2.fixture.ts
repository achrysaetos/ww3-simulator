import type { Formation, NationId, World } from '../src/core/types';
import { chainOf } from '../src/systems/c2/command';

/**
 * Knock out the field HQ above one of `nation`'s active manoeuvre formations, the way a missile
 * strike on it would, so orders to that formation go out by relay. Tests whose subject is the relay,
 * not the enemy's targeting, set the degraded chain up here instead of waiting for a strike.
 * Needs one step run first, so that c2 has attached the formations to their HQs.
 */
export function degradeChain(world: World, nation: NationId): Formation {
  const s = world.slices.c2;
  if (!s) throw new Error('no c2 slice');
  const underFieldHq = (x: Formation) => x.nation === nation && x.kind === 'maneuver' && x.status === 'active' && (chainOf(s, x.id)[0]?.level ?? 'national') !== 'national';
  const f = Object.values(world.formations).find(underFieldHq);
  if (!f) throw new Error(`no ${nation} manoeuvre formation under a field HQ`);
  chainOf(s, f.id)[0].integrity = 0;
  return f;
}

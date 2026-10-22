import { atWar, enemiesOf } from '../../core/engine';
import type { NationId, World } from '../../core/types';
import { friendsOf } from '../../systems/intel/view';
import type { Humanitarian, ItemRace, NationOutputs, Outputs, Workaround } from '../../outputs';

/**
 * The War Cost drawer's slice of Outputs for one viewer. Its own side is shown in full. For an
 * enemy it keeps what reaches a real staff from outside: battle reports and public casualty and
 * displacement counts, damage seen from above, assessed industrial output, shells fired as
 * counter-battery tallies them, and open-source sanctions tracking. Stocks, which only the enemy's
 * own magazines and depots know, and its rationing of food, energy and fuel are left out.
 */
export interface OutputsView {
  day: number;
  /** The viewer first, then co-belligerents on its side. */
  mine: NationId[];
  enemies: NationId[];
  nations: Record<NationId, NationOutputsView>;
  /** Where the viewer's own refugees shelter, most first. */
  hosts: NationOutputs['refugeeHosts'];
}

export interface NationOutputsView {
  humanitarian: Omit<Humanitarian, 'food' | 'energy' | 'fuel'> & { needs: Pick<Humanitarian, 'food' | 'energy' | 'fuel'> | null };
  race: RaceView[];
  workarounds: Workaround[];
}

export type RaceView = Omit<ItemRace, 'monthly' | 'usedPerMonth'> & {
  /** Null when the viewer cannot see it: an enemy's draw on its own stocks. */
  usedPerMonth: number | null;
};

function nationView(o: Outputs['nations'][NationId], own: boolean): NationOutputsView {
  const { food, energy, fuel, ...rest } = o.humanitarian;
  return {
    humanitarian: { ...rest, needs: own ? { food, energy, fuel } : null },
    race: o.race.map(({ monthly: _monthly, ...r }) => (own || r.item === 'shells' ? r : { ...r, stock: null, usedPerMonth: null, zeroDay: null, ranOutDay: null })),
    workarounds: o.workarounds,
  };
}

export function outputsView(world: World, outputs: Outputs, viewer: NationId): OutputsView {
  const enemies = enemiesOf(world, viewer).sort();
  const mine = [viewer, ...[...friendsOf(world, viewer)].filter((n) => n !== viewer && enemies.some((e) => atWar(world, n, e))).sort()];
  const nations: Record<NationId, NationOutputsView> = {};
  for (const id of mine) if (outputs.nations[id]) nations[id] = nationView(outputs.nations[id], true);
  for (const id of enemies) if (outputs.nations[id]) nations[id] = nationView(outputs.nations[id], false);
  return { day: outputs.day, mine: mine.filter((n) => nations[n]), enemies: enemies.filter((n) => nations[n]), nations, hosts: outputs.nations[viewer]?.refugeeHosts ?? [] };
}

import { describe, expect, it } from 'vitest';
import type { NationId } from '../src/core/types';
import { navalWar } from '../src/systems/naval';
import { seaPath, sailable } from '../src/systems/naval/movement';
import { MINE_CLOSURE } from '../src/systems/naval/tables';
import { id, testWorld } from '../src/testkit';

describe('naval tasking past minefields', () => {
  it('a fleet cannot be tasked into the Gulf once hostile mines close Hormuz, as the order would be refused', () => {
    const t = testWorld([navalWar]);
    t.war('ISR', 'IRN');
    const zone = (lat: number, lon: number) => {
      for (let n = t.map.landCount; n < t.map.size; n++) if (t.map.lat[n] === lat && t.map.lon[n] === lon) return id.node(n);
      throw new Error(`no sea zone centred at ${lat}, ${lon}`);
    };
    const redSea = zone(16.5, 40.5), gulf = zone(25.5, 49.5), hormuz = zone(25.5, 55.5);
    const sub = t.add({ nation: id.nation('ISR'), name: 'sub', kind: 'submarine', echelon: 'squadron', node: redSea, equipment: { [id.platform('t_ssn')]: 1 } });
    expect(sailable(t.world, t.map, sub, gulf)).toBe(true);
    t.world.slices.naval.mines[hormuz] = { ['IRN' as NationId]: MINE_CLOSURE * 2 };
    expect(seaPath(t.world, t.map, sub.nation, sub.node, gulf)).toBeNull();
    expect(sailable(t.world, t.map, sub, gulf)).toBe(false);
  });
});

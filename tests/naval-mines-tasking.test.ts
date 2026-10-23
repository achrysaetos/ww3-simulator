import { describe, expect, it } from 'vitest';
import type { NationId } from '../src/core/types';
import { navalWar } from '../src/systems/naval';
import { seaPath, seaRoutes, sailable, straitBarred } from '../src/systems/naval/movement';
import { geography } from '../src/systems/naval/geography';
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
    expect(sailable(t.world, t.map, sub, gulf, seaRoutes(t.world, t.map, sub.nation))).toBe(true);
    t.world.slices.naval.mines[hormuz] = { ['IRN' as NationId]: MINE_CLOSURE * 2 };
    expect(seaPath(t.world, t.map, sub.nation, sub.node, gulf)).toBeNull();
    expect(sailable(t.world, t.map, sub, gulf, seaRoutes(t.world, t.map, sub.nation))).toBe(false);
  });

  it('answers whether a route exists exactly as a search does, past mines, a closed strait, ports and canals', () => {
    const t = testWorld([navalWar]);
    t.war('RUS', 'UKR');
    t.war('ISR', 'IRN');
    const geo = geography(t.map);
    for (let n = t.map.landCount; n < t.map.size; n += 37) t.world.slices.naval.mines[n] = { ['UKR' as NationId]: MINE_CLOSURE, ['IRN' as NationId]: MINE_CLOSURE };
    const ports = [...geo.portZone.keys()];
    const nodes = [...ports.filter((_, i) => i % 8 === 0), ...geo.canalNodes, ...Array.from({ length: 60 }, (_, i) => (t.map.landCount + i * 97) % t.map.size)].map(id.node);
    expect(t.map.straits.some((s) => straitBarred(t.world, s, id.nation('RUS')))).toBe(true);
    for (const [nation, closed] of [['RUS', true], ['ISR', true], ['TUR', false]] as const) {
      const routes = seaRoutes(t.world, t.map, id.nation(nation));
      expect(routes.closed).toBe(closed);
      let joined = 0;
      for (let i = 0; i < nodes.length; i += 2)
        for (let j = 1; j < nodes.length; j += 3) {
          const found = seaPath(t.world, t.map, id.nation(nation), nodes[i], nodes[j]) !== null;
          expect(routes.joins(nodes[i], nodes[j]), `${nation} ${nodes[i]} to ${nodes[j]}`).toBe(found);
          if (found) joined++;
        }
      expect(joined).toBeGreaterThan(0);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { Catalog } from '../src/core/catalog';
import { Engine } from '../src/core/engine';
import { addFormation } from '../src/core/forces';
import type { Formation, Munition, NationId, NodeId, Platform, SimEvent } from '../src/core/types';
import { createWorld } from '../src/core/world';
import { loadMap } from '../src/data/load';
import {
  cepFactor, createStrategic, detonate, globalCoolingC, globalFoodShock, isrFactor, release, setNuclearPosture, strategic, targetList, falloutDenied,
  type LaunchOnWarningHook,
} from '../src/systems/strategic';
import { downwind } from '../src/systems/strategic/fallout';
import { id, testMunitions, testPlatforms, testWorld } from '../src/testkit';

const USA = id.nation('USA'), RUS = id.nation('RUS'), CHN = id.nation('CHN');
const NUKE = id.munition('t_nuke');
const SILO = id.platform('t_icbm');

type T = ReturnType<typeof testWorld>;

function arm(t: T, nation: NationId, node: NodeId, silos: number): Formation {
  const n = t.world.nations[nation];
  n.nuclear = { warheads: n.nuclear.warheads + silos, deployed: n.nuclear.deployed + silos, doctrine: 'calculated_ambiguity' };
  return t.add({ nation, name: `${nation} silos`, kind: 'strategic', echelon: 'wing', node, equipment: { [SILO]: silos } });
}

const of = <K extends SimEvent['type']>(events: SimEvent[], type: K) => events.filter((e): e is Extract<SimEvent, { type: K }> => e.type === type);


describe('strategic performance', () => {
  it('steps a 6,000-formation world well under 50 ms', () => {
    const t = testWorld([strategic]);
    const nations = Object.keys(t.world.nations) as NationId[];
    for (let i = 0; i < 6000; i++) {
      const nation = nations[i % nations.length];
      t.add({ nation, name: `f${i}`, kind: i % 50 === 0 ? 'space' : 'maneuver', echelon: 'brigade', node: (i * 7) % t.map.landCount as NodeId, equipment: { [id.platform('t_mbt')]: 40 } });
    }
    t.war('USA', 'CHN');
    t.war('RUS', 'GBR');
    t.engine.run(t.world, 3);
    const start = performance.now();
    t.engine.run(t.world, 20);
    const ms = (performance.now() - start) / 20;
    console.log(`strategic step: ${ms.toFixed(2)} ms/tick at 6,000 formations`);
    expect(ms).toBeLessThan(50);
  });
});

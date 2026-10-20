/**
 * The one place the UI learns what world to run. Swap `createSession` for the
 * real scenario loader once src/systems and src/data/scenarios land.
 */
import { Engine, relationMut } from '../core/engine';
import type { NationId, Posture, TargetClass, World } from '../core/types';
import { createWorld, type NationProfile } from '../core/world';
import { loadMap } from '../data/load';
import { SYSTEMS } from '../systems';
import { testCatalog } from '../testkit';
import { demoSystem, seedDemoForces } from './demo';

export interface Session {
  engine: Engine;
  world: World;
}

const NATO = ['USA', 'GBR', 'FRA', 'DEU', 'POL', 'ITA', 'CAN', 'NLD', 'NOR', 'TUR', 'ESP', 'ROU', 'LTU', 'LVA', 'EST', 'FIN', 'SWE', 'DNK', 'BEL', 'CZE', 'SVK', 'HUN', 'BGR', 'GRC', 'PRT', 'HRV', 'SVN', 'ALB', 'MNE', 'MKD', 'ISL', 'LUX'];
const CSTO = ['RUS', 'BLR', 'KAZ', 'ARM', 'KGZ', 'TJK'];
const SCO = ['CHN', 'IRN', 'PAK', 'UZB'];

function demoProfiles(): Record<string, NationProfile> {
  const p: Record<string, NationProfile> = {};
  for (const n of NATO) p[n] = { blocs: ['NATO'] };
  for (const n of CSTO) p[n] = { blocs: ['CSTO'] };
  for (const n of SCO) p[n] = { blocs: ['SCO'] };
  // Warhead counts: SIPRI Yearbook 2024 estimates (total inventory / deployed).
  p.USA.nuclear = { warheads: 3708, deployed: 1770, doctrine: 'calculated_ambiguity' };
  p.RUS.nuclear = { warheads: 4380, deployed: 1710, doctrine: 'escalate_to_deescalate' };
  p.CHN.nuclear = { warheads: 500, deployed: 24, doctrine: 'no_first_use' };
  p.GBR.nuclear = { warheads: 225, deployed: 120, doctrine: 'calculated_ambiguity' };
  p.FRA.nuclear = { warheads: 290, deployed: 280, doctrine: 'calculated_ambiguity' };
  return p;
}

export function createSession(scenario: string): Session {
  const map = loadMap();
  const catalog = testCatalog();
  const engine = new Engine(map, catalog, SYSTEMS.length ? SYSTEMS : [demoSystem]);
  const world = createWorld(map, { seed: 2027, profiles: demoProfiles() });
  engine.init(world);
  seedDemoForces(world, map, catalog);
  if (scenario === 'demo') {
    const war = (a: string, b: string) => {
      Object.assign(relationMut(world, a as NationId, b as NationId), { atWar: true, escalation: 'conventional', warSince: 0 });
      world.nations[a as NationId].status = 'war';
      world.nations[b as NationId].status = 'war';
    };
    war('RUS', 'POL');
    war('RUS', 'USA');
    war('BLR', 'POL');
    war('RUS', 'LTU');
    const order = (name: string, posture: Posture, lat: number, lon: number, targetClass?: TargetClass) => {
      const f = Object.values(world.formations).find((x) => x.name === name)!;
      world.pending.push({ type: 'order', nation: f.nation, formation: f.id, order: { posture, target: map.nodeAt(lat, lon), targetClass } });
    };
    order('1st Guards Tank Army', 'attack', 52.2, 21.0);
    order('11th Army Corps', 'attack', 54.7, 25.3);
    order('6th Mechanized Brigade', 'attack', 53.1, 23.2);
    order('152nd Missile Brigade', 'strike', 50.0, 22.0, 'structure');
  }
  return { engine, world };
}

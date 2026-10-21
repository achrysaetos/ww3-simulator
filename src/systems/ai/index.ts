import type { System } from '../../core/engine';
import type { NationId, SimEvent, World } from '../../core/types';
import { enemyMap } from '../diplomacy/assess';
import { DEFAULT_PROFILE, type StrategicProfile } from '../diplomacy/types';
import { planAir } from './air';
import { indexForces } from './forces';
import { coBelligerents, hostileEdges, sectorsFor } from './fronts';
import { planLand } from './land';
import { planMissiles } from './missiles';
import { planNaval } from './naval';
import { planStrategy, sanctionDecisions } from './strategy';
import { battleAreaOf, strikeTargets } from './strikes';
import type { Plan, Sector } from './types';

export * from './types';
export { ATTACK_RATIO } from './land';

/**
 * Ticks between planning passes (6-hour ticks). Ground plans every 12 hours;
 * air, missile and naval tasking daily, matching the 24-hour Air Tasking Order
 * cycle (USAF AFDP 3-0); strategy daily. Nations are staggered so the load
 * spreads across ticks.
 */
const STRATEGY_EVERY = 4;
const LAND_EVERY = 2;
const TASKING_EVERY = 4;
const FRONT_CHANGES: ReadonlySet<SimEvent['type']> = new Set(['node_captured', 'capitulation', 'war_declared', 'peace']);

/**
 * Computer opponents for every AI nation at war. Runs last in the tick and only
 * queues Commands into world.pending for the next tick; it never touches
 * formations directly. Reads diplomacy's assessment when that system is present.
 */
export function createAi(profiles: Readonly<Record<string, StrategicProfile>> = {}): System {
  const fronts = new WeakMap<World, Int32Array>();
  return {
    id: 'ai',
    init(world) {
      world.slices.ai = { baseStrength: {}, aims: {}, lastNuclear: {}, lastPeaceOffer: {} };
    },
    step(world, ctx) {
      if (world.events.some((e) => FRONT_CHANGES.has(e.type))) fronts.delete(world);
      if (world.tick % STRATEGY_EVERY === 0) world.pending.push(...sanctionDecisions(world));
      const ids = Object.keys(world.nations) as NationId[];
      const due = ids
        .map((n, i) => ({
          n,
          strategy: (world.tick + i) % STRATEGY_EVERY === 0,
          land: (world.tick + i) % LAND_EVERY === 0,
          tasking: (world.tick + i + 1) % TASKING_EVERY === 0,
        }))
        .filter(({ n, strategy, land, tasking }) => (strategy || land || tasking) && world.nations[n].controlledBy === 'ai' && world.nations[n].status === 'war');
      if (!due.length) return;

      const enemies = enemyMap(world);
      let edges = fronts.get(world);
      if (!edges) fronts.set(world, (edges = hostileEdges(world, ctx.map, enemies)));
      const index = indexForces(world, ctx.catalog);
      // Coalition partners usually share both friend and enemy sets, so they share one front picture.
      const sectorCache = new Map<string, Sector[]>();
      const sectorsOf = (friends: Set<NationId>, foes: Set<NationId>) => {
        const key = `${[...friends].sort().join(',')}|${[...foes].sort().join(',')}`;
        let s = sectorCache.get(key);
        if (!s) sectorCache.set(key, (s = sectorsFor(world, ctx.map, edges!, friends, foes, index)));
        return s;
      };
      for (const { n, strategy, land, tasking } of due) {
        const foes = enemies.get(n);
        if (!foes?.size) continue;
        const friends = coBelligerents(n, enemies);
        const p: Plan = {
          world, ctx, ai: world.slices.ai, nation: n, profile: profiles[n] ?? DEFAULT_PROFILE,
          enemies: foes, friends, index, out: world.pending,
          sectors: sectorsOf(friends, foes),
        };
        if (strategy) planStrategy(p);
        if (land) planLand(p);
        if (tasking) {
          const battleArea = battleAreaOf(p);
          const targets = strikeTargets(p, battleArea);
          planAir(p, targets);
          planMissiles(p, targets);
          planNaval(p);
        }
      }
    },
  };
}

export const ai = createAi();

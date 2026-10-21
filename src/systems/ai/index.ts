import type { System } from '../../core/engine';
import { COMMAND_DOMAINS, type Command, type NationId, type SimEvent, type World } from '../../core/types';
import { enemyMap } from '../diplomacy/assess';
import { aiMayIssue, delegated } from '../orders';
import { DEFAULT_PROFILE, type DiplomacyState, type StrategicProfile } from '../diplomacy/types';
import { planAir } from './air';
import { indexForces } from './forces';
import { coBelligerents, hostileEdges, sectorsFor } from './fronts';
import { planDeploy } from './deploy';
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
 * Computer opponents for every AI nation at war, and the delegate of every human nation
 * at war that hands it any domain. Runs last in the tick and only queues Commands into
 * world.pending for the next tick; it never touches formations directly. A delegate plans
 * as the full AI would and keeps only the commands its player let it give. Reads
 * diplomacy's assessment when that system is present.
 */
export function createAi(profiles: Readonly<Record<string, StrategicProfile>> = {}): System {
  const fronts = new WeakMap<World, Int32Array>();
  const memos = new WeakMap<World, Map<string, unknown>>();
  return {
    id: 'ai',
    init(world) {
      world.slices.ai = { baseStrength: {}, aims: {}, lastNuclear: {}, lastPeaceOffer: {}, deployments: {} };
    },
    step(world, ctx) {
      if (world.events.some((e) => FRONT_CHANGES.has(e.type))) {
        fronts.delete(world);
        memos.delete(world);
      }
      let memo = memos.get(world);
      if (!memo) memos.set(world, (memo = new Map()));
      if (world.tick % STRATEGY_EVERY === 0) world.pending.push(...sanctionDecisions(world));
      const ids = Object.keys(world.nations) as NationId[];
      const surging = prewarSurges(world);
      const due = ids
        .map((n, i) => ({
          n,
          strategy: (world.tick + i) % STRATEGY_EVERY === 0,
          land: (world.tick + i) % LAND_EVERY === 0,
          tasking: (world.tick + i + 1) % TASKING_EVERY === 0,
        }))
        .filter(({ n, strategy, land, tasking }) => (strategy || land || tasking) && (world.nations[n].status === 'war' || surging.has(n)) && COMMAND_DOMAINS.some((d) => delegated(world, n, d)));
      if (!due.length) return;

      const enemies = enemyMap(world);
      let edges = fronts.get(world);
      if (!edges) fronts.set(world, (edges = hostileEdges(world, ctx.map, enemies)));
      const index = indexForces(world, ctx.catalog);
      for (const { n, tasking } of due) {
        const surge = surging.get(n);
        if (!surge || !tasking || enemies.has(n)) continue;
        // Plans against the war it expects to join; nobody fires on a nation it is not at war with.
        planNaval({
          world, ctx, ai: world.slices.ai, nation: n, profile: profiles[n] ?? DEFAULT_PROFILE,
          enemies: surge.enemies, friends: surge.friends, index, out: world.pending, sectors: [], memo: memo!,
        });
      }
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
        const human = world.nations[n].controlledBy === 'human';
        const out: Command[] = human ? [] : world.pending;
        const p: Plan = {
          world, ctx, ai: world.slices.ai, nation: n, profile: profiles[n] ?? DEFAULT_PROFILE,
          enemies: foes, friends, index, out,
          sectors: sectorsOf(friends, foes), memo: memo!,
        };
        if (strategy) planStrategy(p);
        if (land) {
          planLand(p);
          planDeploy(p);
        }
        if (tasking) {
          const battleArea = battleAreaOf(p);
          const targets = strikeTargets(p, battleArea);
          planAir(p, targets);
          planMissiles(p, targets);
          planNaval(p);
        }
        if (human) for (const c of out) if (aiMayIssue(world, c)) world.pending.push(c);
      }
    },
  };
}

/**
 * Nations at peace that owe a decision on joining a war (a treaty call pending in diplomacy),
 * with the side they would fight and the side they would fight for. Their submarines surge on
 * warning, before a formal entry (planNaval): CSIS's 2023 Taiwan wargame has US attack
 * submarines in action from D-day.
 */
function prewarSurges(world: World): Map<NationId, { enemies: Set<NationId>; friends: Set<NationId> }> {
  const out = new Map<NationId, { enemies: Set<NationId>; friends: Set<NationId> }>();
  const d = world.slices.diplomacy as DiplomacyState | undefined;
  for (const j of d?.joins ?? []) {
    const war = d!.wars.find((w) => w.id === j.war);
    if (!war || world.nations[j.nation].status !== 'peace') continue;
    out.set(j.nation, { enemies: new Set(war.sides[1 - j.side]), friends: new Set([j.nation, ...war.sides[j.side]]) });
  }
  return out;
}

export const ai = createAi();

import type { System } from '../../core/engine';
import { COMMAND_DOMAINS, type Command, type NationId, type SimEvent, type World } from '../../core/types';
import { enemyMap } from '../diplomacy/assess';
import { members } from '../diplomacy/wars';
import { aiMayIssue, delegated } from '../orders';
import { DEFAULT_PROFILE, type DiplomacyState, type StrategicProfile } from '../diplomacy/types';
import { warningOf } from '../intel';
import { believedWorld, viewOf } from '../intel/view';
import { planAir } from './air';
import { indexForces } from './forces';
import { coBelligerents, hostileEdges, sectorsFor } from './fronts';
import { planWarning } from './warning';
import { planAirborne } from './airborne';
import { planDeploy } from './deploy';
import { planLand } from './land';
import { planMissiles } from './missiles';
import { planNaval } from './naval';
import { planStrategy, sanctionDecisions } from './strategy';
import { battleAreaOf, strikeTargets } from './strikes';
import type { ForceIndex, Plan, Sector } from './types';

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
      world.slices.ai = { baseStrength: {}, aims: {}, nuclear: {}, lastPeaceOffer: {}, deployments: {}, airborne: {}, sent: {} };
    },
    step(world, ctx) {
      if (world.events.some((e) => FRONT_CHANGES.has(e.type))) {
        fronts.delete(world);
        memos.delete(world);
        world.slices.ai.sent = {};
      }
      let memo = memos.get(world);
      if (!memo) memos.set(world, (memo = new Map()));
      if (world.tick % STRATEGY_EVERY === 0) world.pending.push(...sanctionDecisions(world));
      const ids = Object.keys(world.nations) as NationId[];
      const surging = prewarSurges(world);
      // A nation entering a war flies the opening strikes it planned while the decision was pending, not the next day's.
      const entered = new Set<NationId>();
      for (const e of world.events) if (e.type === 'war_declared') entered.add(e.by).add(e.on);
      const due = ids
        .map((n, i) => ({
          n,
          strategy: (world.tick + i) % STRATEGY_EVERY === 0,
          land: (world.tick + i) % LAND_EVERY === 0,
          tasking: (world.tick + i + 1) % TASKING_EVERY === 0 || entered.has(n),
        }))
        .filter(({ n, strategy, land, tasking }) => (strategy || land || tasking) && (world.nations[n].status === 'war' || surging.has(n) || (land && warningOf(world, n))) && COMMAND_DOMAINS.some((d) => delegated(world, n, d)));
      if (!due.length) return;

      const enemies = enemyMap(world);
      let edges = fronts.get(world);
      if (!edges) fronts.set(world, (edges = hostileEdges(world, ctx.map, enemies)));
      // Each nation plans in its believed world, on the forces its intelligence shows it. Without the
      // intel system every belief is the world itself, so nations share one index, and coalition
      // partners with the same friends and foes share one front picture.
      const indexes = new Map<World, ForceIndex>();
      const beliefOf = (n: NationId) => {
        const believed = believedWorld(world, ctx.map, n, ctx.catalog);
        let index = indexes.get(believed);
        if (!index) indexes.set(believed, (index = indexForces(believed, ctx.catalog)));
        return { world: believed, view: viewOf(world, ctx.map, n), index };
      };
      const sectorCache = new Map<World, Map<string, Sector[]>>();
      const sectorsOf = (belief: { world: World; index: ForceIndex }, friends: Set<NationId>, foes: Set<NationId>) => {
        const key = `${[...friends].sort().join(',')}|${[...foes].sort().join(',')}`;
        let byKey = sectorCache.get(belief.world);
        if (!byKey) sectorCache.set(belief.world, (byKey = new Map()));
        let s = byKey.get(key);
        if (!s) byKey.set(key, (s = sectorsFor(belief.world, ctx.map, edges!, friends, foes, belief.index)));
        return s;
      };
      for (const { n, land, tasking } of due) {
        if (enemies.has(n)) continue;
        const surge = surging.get(n);
        const warning = land ? warningOf(world, n) : undefined;
        if (!(surge && tasking) && !warning) continue;
        const out: Command[] = [];
        const base = { ctx, ai: world.slices.ai, nation: n, profile: profiles[n] ?? DEFAULT_PROFILE, out, sectors: [], memo: memo!, ...beliefOf(n) };
        // Plans against the war it expects to join; nobody fires on a nation it is not at war with.
        if (surge && tasking) planNaval({ ...base, enemies: surge.enemies, friends: surge.friends });
        if (warning) planWarning({ ...base, enemies: new Set([warning.from]), friends: new Set([n]) }, warning);
        keepAllowed(world, out);
      }
      for (const { n, strategy, land, tasking } of due) {
        const foes = enemies.get(n);
        if (!foes?.size) continue;
        const friends = coBelligerents(n, enemies);
        const out: Command[] = [];
        const belief = beliefOf(n);
        const p: Plan = {
          ctx, ai: world.slices.ai, nation: n, profile: profiles[n] ?? DEFAULT_PROFILE,
          enemies: foes, friends, out, ...belief,
          sectors: sectorsOf(belief, friends, foes), memo: memo!,
        };
        if (strategy) planStrategy(p);
        if (land) {
          planLand(p);
          planDeploy(p);
          planAirborne(p);
        }
        if (tasking) {
          const battleArea = battleAreaOf(p);
          const targets = strikeTargets(p, battleArea);
          planAir(p, targets);
          planMissiles(p, targets);
          planNaval(p);
        }
        keepAllowed(world, out);
      }
    },
  };
}

/** Queues what the AI may give: a human nation's delegate only what its player let it, and nobody orders a formation an operation commands. */
function keepAllowed(world: World, out: Command[]): void {
  for (const c of out) {
    if (aiMayIssue(world, c)) world.pending.push(c);
    // Never sent: not to be taken for a refusal.
    else if (c.type === 'order') delete world.slices.ai.sent[c.formation];
  }
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
    out.set(j.nation, { enemies: new Set(members(war.sides[1 - j.side])), friends: new Set([j.nation, ...members(war.sides[j.side])]) });
  }
  return out;
}

export const ai = createAi();

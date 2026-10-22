import type { SimContext } from '../../core/engine';
import { defineParam } from '../../core/params';
import type { Government, NationId, NodeId, World } from '../../core/types';
import { strategicProfile } from '../../data/nations';
import { economicMeans } from '../economy';
import type { DiplomacyState, Side } from './types';

/**
 * A draw in [0, 1) fixed by the run's seed, the tick and a key, so political chance never moves the shared RNG stream
 * that combat draws from: a coup in one run does not reshuffle every battle after it.
 */
export function politicalDraw(world: World, key: string): number {
  let h = 2166136261 ^ world.seed ^ Math.imul(world.tick, 2654435761);
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * Irregular removals of a leader (coup, forced resignation, assassination) per leader-year, by regime, outside war and
 * crisis. Powell and Thyne, "Global Instances of Coups from 1950 to 2010" (J. Peace Research, 2011): 457 attempts,
 * about half successful, nearly all against autocracies and juntas, and far fewer after 1990; the Archigos data
 * (Goemans, Gleditsch and Chiozza 2009) count about a third of autocratic leaders leaving office irregularly. The rates
 * are estimates from those counts; elections change democratic leaders and run in the politics system.
 */
const IRREGULAR_EXIT: Record<Government, number> = {
  liberal_democracy: 0.001,
  flawed_democracy: 0.004,
  hybrid: 0.012,
  monarchy: 0.008,
  authoritarian: 0.015,
  military_junta: 0.05,
  theocracy: 0.008,
  totalitarian: 0.004,
};

/**
 * How many times more likely a leader is to fall when the war is lost outright than in peace. Leaders who lose wars
 * are removed far more often, autocrats most violently (Goemans, "War and Punishment", 2000; Chiozza and Goemans,
 * "Leaders and International Conflict", 2011): the Argentine junta fell three days after Port Stanley in 1982, the
 * Greek junta within days of Cyprus in 1974, the Tsar and the Kaiser in the last years of their wars.
 */
const DEFEAT_FACTOR = defineParam({
  id: 'diplomacy.DEFEAT_FACTOR', value: 30, range: [5, 100], tag: 'contested',
  source: 'Goemans 2000; Chiozza and Goemans 2011: defeated leaders, autocrats most of all, are removed at many times the base rate',
  affects: 'how often a beaten government falls',
});

/** As DEFEAT_FACTOR for an economy that can no longer keep the country going (economy economicMeans at zero). Coups follow economic crises (Galetovic and Sanhueza, "Citizens, Autocrats and Plotters", 2000). Estimate. */
const COLLAPSE_FACTOR = defineParam({
  id: 'diplomacy.COLLAPSE_FACTOR', value: 5, range: [1, 20], tag: 'judgment',
  source: 'judgment after Galetovic and Sanhueza 2000: coups cluster in economic crises',
  affects: 'how often a government falls when its economy breaks',
});

/** How badly a war is going for `n`, 0..1: the larger of the share of its people under enemy rule (the capital counts as half) and its will to fight gone. */
function defeat(world: World, s: DiplomacyState, n: NationId): number {
  const a = s.assessment[n];
  if (world.nations[n].status !== 'war') return 0;
  return Math.min(1, Math.max(a?.popLost ?? 0, a?.capitalLost ? 0.5 : 0, 1 - world.nations[n].warSupport / 0.6));
}

/** The aim a new government brings to a war its predecessor led: it keeps what is held, or the part of its claim it holds, and seeks terms on that. */
function shrink(world: World, map: { landCount: number; owner: NationId[] }, own: Side, foes: Side): Side['aim'] {
  const holds = (n: NodeId) => world.control[n] in own.members;
  if (own.aim.kind === 'limited') return { kind: 'limited', claim: own.aim.claim.filter(holds) };
  if (own.aim.kind === 'punitive') return own.aim;
  const claim: NodeId[] = [];
  for (let n = 0 as NodeId; n < map.landCount; n++) if (map.owner[n] in foes.members && holds(n)) claim.push(n);
  return { kind: 'limited', claim };
}

/** Odds per day that `n`'s government falls: its regime's base rate, lowered by its stability and raised by defeat and economic collapse. */
export function fallChance(world: World, s: DiplomacyState, n: NationId): number {
  const nation = world.nations[n];
  const stability = strategicProfile[n]?.regimeStability ?? 0.6;
  const perYear = IRREGULAR_EXIT[nation.government] * 2 * (1 - stability)
    * (1 + DEFEAT_FACTOR() * defeat(world, s, n) + COLLAPSE_FACTOR() * (1 - economicMeans(world, n)));
  return 1 - Math.exp(-perYear / 365);
}

/** A new government in `n`: it drops any ultimatum it stood behind, and in a war whose side it leads cuts the aim back to what is held. */
export function newLeadership(world: World, ctx: SimContext, s: DiplomacyState, n: NationId): void {
  (s.leaders ??= {})[n] = world.tick;
  ctx.emit({ type: 'message', tick: world.tick, nation: n, text: `${n}'s government falls; a new leadership takes power` });
  if (s.crises) s.crises = s.crises.filter((c) => c.by !== n);
  for (const war of s.wars) {
    const i = war.sides[0].leader === n ? 0 : war.sides[1].leader === n ? 1 : -1;
    if (i === -1) continue;
    const [own, foes] = [war.sides[i], war.sides[1 - i]];
    own.aim = shrink(world, ctx.map, own, foes);
    own.gained = world.tick;
    s.rev++;
    ctx.emit({ type: 'message', tick: world.tick, nation: n, text: `${n}'s new leadership narrows its aims in the ${war.name} to the ground it holds` });
  }
}

/**
 * Leaders fall. Daily, each government at war or pressing a crisis faces fallChance of irregular removal. A new
 * government that leads a side in a war cuts its aim back to what it holds and so seeks a ceasefire on it (Russia
 * 1917, Argentina 1982); one pressing a crisis backs down. Governments elsewhere change too, but nothing in the model
 * would notice.
 */
export function leaderChanges(world: World, ctx: SimContext, s: DiplomacyState): void {
  const busy = new Set<NationId>();
  for (const w of s.wars) for (const side of w.sides) for (const m of Object.keys(side.members)) busy.add(m as NationId);
  for (const c of s.crises ?? []) busy.add(c.by);
  for (const n of [...busy].sort()) {
    const nation = world.nations[n];
    if (!nation || nation.status === 'capitulated' || nation.status === 'collapsed') continue;
    if (politicalDraw(world, `leader:${n}`) < fallChance(world, s, n)) newLeadership(world, ctx, s, n);
  }
}

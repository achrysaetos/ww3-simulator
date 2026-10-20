import { atWar, enemiesOf, relationKey, type SimContext } from '../../core/engine';
import type { Government, NationId, World } from '../../core/types';
import { DEFAULT_PROFILE, type Assessment, type DiplomacyState, type StrategicProfile, type WarRecord } from './types';
import { makePeace } from './wars';

/**
 * How each regime's war support responds. `casualty` scales the public's
 * reaction to losses; `elite` scales the reaction to defeat and economic pain,
 * which is what breaks autocracies (elite defection, cf. Russia 1917, Argentina
 * 1982). Ordering follows Gartner (1997) and Weeks (2008) on audience costs;
 * magnitudes are estimates.
 */
const REGIME: Record<Government, { casualty: number; elite: number }> = {
  liberal_democracy: { casualty: 1.0, elite: 0.8 },
  flawed_democracy: { casualty: 0.85, elite: 0.9 },
  hybrid: { casualty: 0.6, elite: 1.0 },
  monarchy: { casualty: 0.45, elite: 1.1 },
  authoritarian: { casualty: 0.4, elite: 1.2 },
  military_junta: { casualty: 0.4, elite: 1.3 },
  theocracy: { casualty: 0.35, elite: 1.1 },
  totalitarian: { casualty: 0.25, elite: 1.0 },
};

/**
 * Mueller (1973, "War, Presidents and Public Opinion") found US support for
 * Korea and Vietnam fell ~15 points per tenfold rise in cumulative casualties.
 * Casualties are taken per 100k population so the curve transfers across
 * nations: Vietnam (~58k dead + 150k wounded on 200M) is x ~ 100, a 0.3 drop
 * at full democratic sensitivity, matching the slide from ~60% to ~30%.
 */
const MUELLER_PER_DECADE = 0.15;
/** Rally effects fade in months (Mueller 1970; Baker and Oneal 2001). */
const RALLY_HALF_LIFE_DAYS = 60;
const WEARINESS_PER_YEAR = 0.05;
const TERRITORY_WEIGHT = 0.6;
const CAPITAL_LOSS = 0.2;
const TRADE_WEIGHT = 0.2;
const NUCLEAR_SHOCK = 0.08;

const CAPITULATE_BELOW = 0.1;
/** Capital in enemy hands plus this share of homeland population: the state can no longer field a government. */
const OCCUPIED_COLLAPSE = 0.5;
const EXHAUSTED_BELOW = 0.3;
const MIN_WAR_DAYS_FOR_TERMS = 30;

export function warSupport(nation: World['nations'][NationId], rec: WarRecord, a: Assessment | undefined, profile: StrategicProfile, world: World): number {
  const regime = REGIME[nation.government];
  const sensitivity = regime.casualty * (1.5 - profile.casualtyTolerance);
  const perCapita = (rec.casualties / Math.max(1, nation.population)) * 1e5;
  const days = ((world.tick - rec.enteredTick) * world.dtHours) / 24;
  const rally = rec.rally * 0.5 ** ((((world.tick - rec.rallyTick) * world.dtHours) / 24) / RALLY_HALF_LIFE_DAYS);
  const casualties = MUELLER_PER_DECADE * sensitivity * Math.log10(1 + perCapita);
  const territory = regime.elite * (TERRITORY_WEIGHT * (a?.popLost ?? 0) + (a?.capitalLost ? CAPITAL_LOSS : 0));
  const economy = regime.elite * TRADE_WEIGHT * (world.theater.tradeBlocked[nation.id] ?? 0);
  const nuclear = NUCLEAR_SHOCK * (0.5 + 0.5 * sensitivity) * Math.min(3, rec.nuclearHits);
  const weariness = WEARINESS_PER_YEAR * sensitivity * (days / 365);
  return Math.min(1, Math.max(0, rec.baseline + rally - casualties - territory - economy - nuclear - weariness));
}

export function updateSupport(world: World, s: DiplomacyState, profiles: Readonly<Record<string, StrategicProfile>>): void {
  for (const [n, rec] of Object.entries(s.records) as [NationId, WarRecord][]) {
    const nation = world.nations[n];
    if (nation.status !== 'war' || rec.enteredTick < 0) continue;
    nation.warSupport = warSupport(nation, rec, s.assessment[n], profiles[n] ?? DEFAULT_PROFILE, world);
  }
}

/**
 * Surrender. When the capital has fallen and most of the country is occupied,
 * the occupier of the capital takes the rest (occupation terms). When support
 * collapses first, the front freezes where it stands (armistice terms).
 */
export function checkCapitulation(world: World, ctx: SimContext, s: DiplomacyState): void {
  for (const nation of Object.values(world.nations)) {
    if (nation.status !== 'war') continue;
    const a = s.assessment[nation.id];
    const occupied = !!a && a.capitalLost && a.popLost >= OCCUPIED_COLLAPSE;
    if (!occupied && nation.warSupport > CAPITULATE_BELOW) continue;
    const victors = enemiesOf(world, nation.id);
    if (!victors.length) continue;
    if (occupied) {
      const occupier = world.control[nation.capital];
      if (victors.includes(occupier)) {
        const { map } = ctx;
        for (let n = 0; n < map.landCount; n++) if (world.control[n] === nation.id) world.control[n] = occupier;
      }
    }
    ctx.emit({ type: 'capitulation', tick: world.tick, nation: nation.id, to: victors });
    for (const v of victors) makePeace(world, ctx, s, nation.id, v, occupied ? 'capitulation: occupation' : 'capitulation: armistice on current lines');
    nation.status = 'capitulated';
    s.joins = s.joins.filter((j) => j.nation !== nation.id && j.victim !== nation.id);
  }
}

/** Both sides of a dyad worn out after a month or more: armistice on current lines. */
export function negotiatedPeace(world: World, ctx: SimContext, s: DiplomacyState): void {
  for (const war of [...s.wars])
    for (const a of [...war.sides[0]])
      for (const b of [...war.sides[1]]) {
        if (!atWar(world, a, b)) continue;
        const since = world.relations[relationKey(a, b)].warSince ?? world.tick;
        if (((world.tick - since) * world.dtHours) / 24 < MIN_WAR_DAYS_FOR_TERMS) continue;
        if (world.nations[a].warSupport < EXHAUSTED_BELOW && world.nations[b].warSupport < EXHAUSTED_BELOW) makePeace(world, ctx, s, a, b, 'negotiated: armistice on current lines');
      }
}

/**
 * An AI target accepts when its own support is low or it is losing ground;
 * a human target accepts by sending its own offer back.
 */
export function offerPeace(world: World, ctx: SimContext, s: DiplomacyState, from: NationId, to: NationId): void {
  if (!atWar(world, from, to)) return;
  const k = relationKey(from, to);
  const target = world.nations[to];
  const reciprocal = s.offers[k] === to;
  const losing = (s.assessment[to]?.popLost ?? 0) > (s.assessment[from]?.popLost ?? 0);
  const accepts = reciprocal || (target.controlledBy === 'ai' && (target.warSupport < 0.4 || (losing && target.warSupport < 0.55)));
  if (accepts) makePeace(world, ctx, s, from, to, 'negotiated: armistice on current lines');
  else {
    s.offers[k] = from;
    ctx.emit({ type: 'message', tick: world.tick, nation: from, text: `${from} offers peace to ${to}` });
  }
}

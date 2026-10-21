import { atWar, enemiesOf, relationKey, type SimContext } from '../../core/engine';
import type { Government, NationId, World } from '../../core/types';
import { DEFAULT_PROFILE, type Assessment, type DiplomacyState, type StrategicProfile, type WarRecord } from './types';
import { delegated } from '../orders';
import { makePeace } from './wars';

/**
 * How each regime's war support responds, and when it yields. `casualty` scales the public's
 * reaction to losses; `elite` scales the reaction to defeat and economic pain,
 * which is what breaks autocracies (elite defection, cf. Russia 1917, Argentina
 * 1982). Ordering follows Gartner (1997) and Weeks (2008) on audience costs;
 * magnitudes are estimates. `yields` is the means to fight (see meansToFight)
 * below which a regime whose will has collapsed gives up: leaders who answer to
 * no one fight on with less (Germany 1945; Goemans, "War and Punishment", 2000),
 * so the order runs from democracies down to totalitarian states. Estimates.
 */
const REGIME: Record<Government, { casualty: number; elite: number; yields: number }> = {
  liberal_democracy: { casualty: 1.0, elite: 0.8, yields: 0.45 },
  flawed_democracy: { casualty: 0.85, elite: 0.9, yields: 0.45 },
  hybrid: { casualty: 0.6, elite: 1.0, yields: 0.35 },
  monarchy: { casualty: 0.45, elite: 1.1, yields: 0.4 },
  authoritarian: { casualty: 0.4, elite: 1.2, yields: 0.35 },
  military_junta: { casualty: 0.4, elite: 1.3, yields: 0.4 },
  theocracy: { casualty: 0.35, elite: 1.1, yields: 0.3 },
  totalitarian: { casualty: 0.25, elite: 1.0, yields: 0.25 },
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
/** Capital in enemy hands plus this share of homeland population, with its means to fight gone: the state can no longer field a government. */
const OCCUPIED_COLLAPSE = 0.5;
/**
 * Weights of the means to fight. Forces in being weigh most: France signed in June 1940 with
 * half its territory still free once its field army was destroyed, while Ukraine fought on in
 * 2022 with Kyiv threatened and its army intact. Land still held is strategic depth, and a
 * co-belligerent still fighting is the hope of rescue that kept Britain and the ROC in their
 * wars. Estimates.
 */
const MEANS = { forces: 0.6, land: 0.4, allies: 0.2 } as const;
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
  const nuclear = nation.nuclear.warheads > 0 ? 0 : NUCLEAR_SHOCK * (0.5 + 0.5 * sensitivity) * Math.min(3, rec.nuclearHits);
  const weariness = WEARINESS_PER_YEAR * sensitivity * (days / 365);
  return Math.min(1, Math.max(0, rec.baseline + rally - casualties - territory - economy - nuclear - weariness));
}

export function updateSupport(world: World, s: DiplomacyState, profiles: Readonly<Record<string, StrategicProfile>>): void {
  for (const [n, rec] of Object.entries(s.records) as [NationId, WarRecord][]) {
    const nation = world.nations[n];
    if (nation.status !== 'war' || rec.enteredTick < 0) continue;
    nation.warSupport = Math.min(1, Math.max(0, warSupport(nation, rec, s.assessment[n], profiles[n] ?? DEFAULT_PROFILE, world) + (world.slices.politics?.nations[n]?.supportShift ?? 0)));
  }
}

/** Personnel of each nation's ground formations in being, routed ones at half strength. */
function groundStrength(world: World): Map<NationId, number> {
  const out = new Map<NationId, number>();
  for (const f of Object.values(world.formations)) {
    if ((f.kind !== 'maneuver' && f.kind !== 'artillery') || f.status === 'destroyed') continue;
    out.set(f.nation, (out.get(f.nation) ?? 0) + (f.status === 'routed' ? 0.5 : 1) * f.personnel);
  }
  return out;
}

/**
 * A nation's means to keep fighting, 0..1: the share of the ground strength it went to war with
 * still in being, the share of its homeland it still holds, and whether a co-belligerent is still
 * in the fight. A nation that went to war with no ground forces has only its land.
 */
export function meansToFight(forcesLeft: number, a: Assessment | undefined, allied: boolean): number {
  return Math.min(1, MEANS.forces * forcesLeft + MEANS.land * (1 - (a?.areaLost ?? 0)) + (allied ? MEANS.allies : 0));
}

/** Whether `n` has a co-belligerent in one of its wars that has not given up. */
function allied(world: World, s: DiplomacyState, n: NationId): boolean {
  for (const w of s.wars) {
    const side = w.sides.find((m) => m.includes(n));
    if (side?.some((m) => m !== n && world.nations[m].status === 'war')) return true;
  }
  return false;
}

/**
 * Surrender needs both the will and the means to fight to be gone: war support below
 * CAPITULATE_BELOW, or the capital and most of the people in enemy hands, and in either case
 * means to fight below what the regime yields at. Losing the capital is a heavy blow to support
 * (see warSupport) but a state whose army stands fights on. Occupation terms hand the occupier of
 * the capital the cells the capitulating state no longer holds with troops; elsewhere the front
 * freezes where it stands (armistice terms).
 */
export function checkCapitulation(world: World, ctx: SimContext, s: DiplomacyState): void {
  let ground: Map<NationId, number> | undefined;
  for (const nation of Object.values(world.nations)) {
    if (nation.status !== 'war') continue;
    const a = s.assessment[nation.id];
    const occupied = !!a && a.capitalLost && a.popLost >= OCCUPIED_COLLAPSE;
    const rec = s.records[nation.id];
    const strength = () => (ground ??= groundStrength(world)).get(nation.id) ?? 0;
    if (rec && rec.groundAtEntry === undefined) rec.groundAtEntry = strength();
    if (!occupied && nation.warSupport > CAPITULATE_BELOW) continue;
    const now = strength();
    const atEntry = rec?.groundAtEntry ?? now;
    const forcesLeft = atEntry > 0 ? Math.min(1, now / atEntry) : 0;
    if (meansToFight(forcesLeft, a, allied(world, s, nation.id)) >= REGIME[nation.government].yields) continue;
    const victors = enemiesOf(world, nation.id);
    if (!victors.length) continue;
    if (occupied) {
      const occupier = world.control[nation.capital];
      if (victors.includes(occupier)) {
        const held = new Set<number>();
        for (const f of Object.values(world.formations))
          if (f.nation === nation.id && (f.kind === 'maneuver' || f.kind === 'artillery') && f.status === 'active') held.add(f.node);
        const { map } = ctx;
        for (let n = 0; n < map.landCount; n++) if (world.control[n] === nation.id && !held.has(n)) world.control[n] = occupier;
      }
    }
    ctx.emit({ type: 'capitulation', tick: world.tick, nation: nation.id, to: victors });
    for (const v of victors) makePeace(world, ctx, s, nation.id, v, occupied ? 'capitulation: occupation' : 'capitulation: armistice on current lines');
    nation.status = 'capitulated';
    s.joins = s.joins.filter((j) => j.nation !== nation.id && j.victim !== nation.id);
  }
}

/**
 * Both sides of a dyad worn out after a month or more: armistice on current lines. A human who
 * kept strategic decisions is not signed up for it; the other side's offer is put to the player.
 */
export function negotiatedPeace(world: World, ctx: SimContext, s: DiplomacyState): void {
  for (const war of [...s.wars])
    for (const a of [...war.sides[0]])
      for (const b of [...war.sides[1]]) {
        if (!atWar(world, a, b)) continue;
        const since = world.relations[relationKey(a, b)].warSince ?? world.tick;
        if (((world.tick - since) * world.dtHours) / 24 < MIN_WAR_DAYS_FOR_TERMS) continue;
        if (world.nations[a].warSupport >= EXHAUSTED_BELOW || world.nations[b].warSupport >= EXHAUSTED_BELOW) continue;
        const [da, db] = [delegated(world, a, 'strategic'), delegated(world, b, 'strategic')];
        if (da && db) makePeace(world, ctx, s, a, b, 'negotiated: armistice on current lines');
        else if (da !== db && !s.offers[relationKey(a, b)]) offerPeace(world, ctx, s, da ? a : b, da ? b : a);
      }
}

/** Whether `to`, its strategic decisions in the AI's hands, takes `from`'s offer: its own support is low, or it is losing ground. */
function aiAccepts(world: World, s: DiplomacyState, from: NationId, to: NationId): boolean {
  if (!delegated(world, to, 'strategic')) return false;
  const support = world.nations[to].warSupport;
  const losing = (s.assessment[to]?.popLost ?? 0) > (s.assessment[from]?.popLost ?? 0);
  return support < 0.4 || (losing && support < 0.55);
}

/**
 * A target whose strategic decisions the AI makes accepts per aiAccepts; a human who kept
 * strategic control accepts by sending its own offer back. A refused offer stays on the table
 * (see reviewOffers).
 */
export function offerPeace(world: World, ctx: SimContext, s: DiplomacyState, from: NationId, to: NationId): void {
  if (!atWar(world, from, to)) return;
  const k = relationKey(from, to);
  if (s.offers[k] === to || aiAccepts(world, s, from, to)) makePeace(world, ctx, s, from, to, 'negotiated: armistice on current lines');
  else {
    s.offers[k] = from;
    ctx.emit({ type: 'message', tick: world.tick, nation: from, text: `${from} offers peace to ${to}` });
  }
}

/** Open offers are weighed again as the war turns: an AI-run target takes one once aiAccepts holds. */
export function reviewOffers(world: World, ctx: SimContext, s: DiplomacyState): void {
  for (const [k, from] of Object.entries(s.offers)) {
    const [a, b] = k.split('|') as [NationId, NationId];
    const to = a === from ? b : a;
    if (!atWar(world, from, to)) delete s.offers[k];
    else if (aiAccepts(world, s, from, to)) makePeace(world, ctx, s, from, to, 'negotiated: armistice on current lines');
  }
}

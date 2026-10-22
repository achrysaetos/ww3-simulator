import { atWar, enemiesOf, relationKey, relationMut, type SimContext } from '../../core/engine';
import type { Government, NationId, World } from '../../core/types';
import { DEFAULT_PROFILE, type Assessment, type DiplomacyState, type Side, type StrategicProfile, type War, type WarRecord } from './types';
import { delegated } from '../orders';
import { economicMeans } from '../economy';
import { aimStatus, unbounded } from './aims';
import { endWar, leaveWar, members, sideOf, sideWith, warBetween } from './wars';

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
  const nuclear = nation.nuclear.warheads > 0 ? 0 : NUCLEAR_SHOCK * (0.5 + 0.5 * sensitivity) * Math.min(3, rec.nuclearHits);
  const weariness = WEARINESS_PER_YEAR * sensitivity * (days / 365);
  return Math.min(1, Math.max(0, rec.baseline + rally - casualties - territory - nuclear - weariness));
}

/**
 * War support is warSupport's own terms plus the home front's (politics `supportShift`), each
 * cost counted once: trade lost reaches the public through output (economy gdpIndex, in the
 * politics economy driver), and casualties through Mueller's cumulative curve here, so the
 * politics marginal-loss driver, which equals it in a war's first weeks, is left out.
 */
export function updateSupport(world: World, s: DiplomacyState, profiles: Readonly<Record<string, StrategicProfile>>): void {
  for (const [n, rec] of Object.entries(s.records) as [NationId, WarRecord][]) {
    const nation = world.nations[n];
    if (nation.status !== 'war' || rec.enteredTick < 0) continue;
    const home = world.slices.politics?.nations[n];
    const shift = home ? home.supportShift - home.drivers.losses : 0;
    nation.warSupport = Math.min(1, Math.max(0, warSupport(nation, rec, s.assessment[n], profiles[n] ?? DEFAULT_PROFILE, world) + shift));
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
 * in the fight. A nation that went to war with no ground forces has only its land. Forces count
 * only as far as the economy keeps them in fuel and food (economy economicMeans): at none, half of
 * them, since an army fights on its stocks for a while after the economy behind it breaks, as the
 * German army did into May 1945. The half is an estimate.
 */
export function meansToFight(forcesLeft: number, a: Assessment | undefined, allied: boolean, economy = 1): number {
  return Math.min(1, MEANS.forces * forcesLeft * (0.5 + 0.5 * economy) + MEANS.land * (1 - (a?.areaLost ?? 0)) + (allied ? MEANS.allies : 0));
}

/** Whether `n` has a co-belligerent in one of its wars that has not given up. */
function allied(world: World, s: DiplomacyState, n: NationId): boolean {
  for (const w of s.wars) {
    const side = sideOf(w, n);
    if (side !== -1 && members(w.sides[side]).some((m) => m !== n && world.nations[m].status === 'war')) return true;
  }
  return false;
}

/**
 * Surrender needs both the will and the means to fight to be gone: war support below
 * CAPITULATE_BELOW, or the capital and most of the people in enemy hands, and in either case
 * means to fight below what the regime yields at. Losing the capital is a heavy blow to support
 * (see warSupport) but a state whose army stands fights on. Occupation terms hand the occupier of
 * the capital the cells the capitulating state no longer holds with troops; elsewhere the front
 * freezes where it stands (armistice terms). The capitulating state leaves its wars; its allies
 * fight on.
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
    if (meansToFight(forcesLeft, a, allied(world, s, nation.id), economicMeans(world, nation.id)) >= REGIME[nation.government].yields) continue;
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
    const terms = occupied ? 'capitulation: occupation' : 'capitulation: armistice on current lines';
    for (const war of s.wars.filter((w) => sideOf(w, nation.id) !== -1)) leaveWar(world, ctx, s, war, nation.id, terms, 'capitulation');
    nation.status = 'capitulated';
    s.joins = s.joins.filter((j) => j.nation !== nation.id && j.victim !== nation.id);
  }
}

const ARMISTICE = 'negotiated: armistice on current lines';
const CEASEFIRE = 'negotiated: ceasefire, ground taken beyond the war aims handed back';

/**
 * Both side leaders worn out after a month or more: armistice on current lines for the whole war.
 * A human who kept strategic decisions is not signed up for it; the other side's offer is put to
 * the player.
 */
export function negotiatedPeace(world: World, ctx: SimContext, s: DiplomacyState): void {
  for (const war of [...s.wars]) {
    const [a, b] = [war.sides[0].leader, war.sides[1].leader];
    if (((world.tick - war.since) * world.dtHours) / 24 < MIN_WAR_DAYS_FOR_TERMS) continue;
    if (world.nations[a].warSupport >= EXHAUSTED_BELOW || world.nations[b].warSupport >= EXHAUSTED_BELOW) continue;
    const [da, db] = [delegated(world, a, 'strategic'), delegated(world, b, 'strategic')];
    if (da && db) endWar(world, ctx, s, war, ARMISTICE, 'armistice');
    else if (da !== db && !s.offers[relationKey(a, b)]) offerPeace(world, ctx, s, da ? a : b, da ? b : a);
  }
}

/**
 * Whether `to`, its strategic decisions in the AI's hands, takes `from`'s offer. A side fighting for a punitive or
 * limited aim takes it once it has what it fought for or has passed its walk-away point (aimStatus). A side fighting for
 * everything takes it when its support is low or it is losing ground, and one fighting to bring down the other's
 * government takes nothing short of exhaustion while that capital stands.
 */
function aiAccepts(world: World, s: DiplomacyState, from: NationId, to: NationId): boolean {
  if (!delegated(world, to, 'strategic')) return false;
  const war = warBetween(s, from, to);
  const side = war ? sideOf(war, to) : -1;
  const support = world.nations[to].warSupport;
  if (war && side !== -1) {
    const aim = war.sides[side].aim;
    if (aim.kind === 'regime_change' && world.control[world.nations[from].capital] === from) return support < EXHAUSTED_BELOW;
    // A side fighting for less than everything settles by its aim alone: ground lost elsewhere is not what it fights over.
    if (!unbounded(aim)) return aimStatus(world, war, side).status !== 'fighting';
  }
  const losing = (s.assessment[to]?.popLost ?? 0) > (s.assessment[from]?.popLost ?? 0);
  return support < 0.4 || (losing && support < 0.55);
}

/** Whether an ally's ground forces stand on `n`'s homeland while an enemy holds part of it. */
function defendedOnItsSoil(world: World, ctx: SimContext, s: DiplomacyState, side: Side, n: NationId): boolean {
  if ((s.assessment[n]?.areaLost ?? 0) <= 0) return false;
  const { map } = ctx;
  return Object.values(world.formations).some((f) =>
    f.nation !== n && f.nation in side.members && f.status === 'active' && f.node < map.landCount && map.owner[f.node] === n
    && (f.kind === 'maneuver' || f.kind === 'artillery'));
}

/**
 * Whether `n` may leave `war` on its own. Coalitions bind their members against a separate peace
 * (Pact of London, Sept 1914; Declaration by United Nations, 1 Jan 1942), and members broke away
 * only once spent: Russia at Brest-Litovsk in 1918, Finland in March 1940, Italy in 1943. So a
 * member goes alone only with its will to fight gone, never while allies fight on its soil, and
 * never while treaty allies are in the war on its behalf.
 */
export function mayLeaveAlone(world: World, ctx: SimContext, s: DiplomacyState, side: Side, n: NationId): boolean {
  if (world.nations[n].warSupport >= CAPITULATE_BELOW) return false;
  if (members(side).some((m) => side.members[m].defends === n)) return false;
  return !defendedOnItsSoil(world, ctx, s, side, n);
}

/** Opinion each ally loses of a member that makes a separate peace; as for a refused treaty call (see wars.ts resolveJoins). */
const SEPARATE_PEACE_COST = 30;

/** What an offer between `from` and `to` settles: the whole war between the side leaders, or a separate peace for `leaver`. */
type Deal = { war: War; leaver?: { nation: NationId; side: Side } } | { refused: string };

function dealFor(world: World, ctx: SimContext, s: DiplomacyState, from: NationId, to: NationId): Deal | undefined {
  const war = warBetween(s, from, to);
  const [fromSide, toSide] = war ? [sideWith(war, from), sideWith(war, to)] : [];
  if (!war || !fromSide || !toSide) return undefined;
  const [fromLeads, toLeads] = [fromSide.leader === from, toSide.leader === to];
  if (fromLeads && toLeads) return { war };
  const leaver = fromLeads ? { nation: to, side: toSide } : toLeads ? { nation: from, side: fromSide } : undefined;
  if (!leaver) return { refused: `peace in the ${war.name} is made between ${war.sides[0].leader} and ${war.sides[1].leader}` };
  if (!mayLeaveAlone(world, ctx, s, leaver.side, leaver.nation)) return { refused: `${leaver.nation} cannot make a separate peace while its allies fight on` };
  return { war, leaver };
}

function settle(world: World, ctx: SimContext, s: DiplomacyState, deal: { war: War; leaver?: { nation: NationId; side: Side } }): void {
  if (!deal.leaver) {
    const limited = deal.war.sides.some((side) => !unbounded(side.aim));
    return limited ? endWar(world, ctx, s, deal.war, CEASEFIRE, 'ceasefire') : endWar(world, ctx, s, deal.war, ARMISTICE, 'armistice');
  }
  const { war, leaver: { nation: leaver, side } } = deal;
  for (const m of members(side)) {
    if (m === leaver) continue;
    const r = relationMut(world, m, leaver);
    r.opinion = Math.max(-100, r.opinion - SEPARATE_PEACE_COST);
  }
  ctx.emit({ type: 'message', tick: world.tick, nation: leaver, text: `${leaver} makes a separate peace and leaves the ${war.name}` });
  leaveWar(world, ctx, s, war, leaver, `separate peace: armistice on current lines`, 'separate_peace');
}

/** An AI-run counterpart takes a separate peace from a spent member, and a peace between leaders per aiAccepts. */
const accepts = (world: World, s: DiplomacyState, deal: { leaver?: unknown }, from: NationId, to: NationId) =>
  delegated(world, to, 'strategic') && (deal.leaver !== undefined || aiAccepts(world, s, from, to));

/**
 * Peace is made between side leaders and ends the war for every member of both sides. A member
 * that does not lead its side can only make a separate peace, and only when mayLeaveAlone allows.
 * A target whose strategic decisions the AI makes accepts per `accepts`; a human who kept
 * strategic control accepts by sending its own offer back. A refused offer stays on the table
 * (see reviewOffers).
 */
export function offerPeace(world: World, ctx: SimContext, s: DiplomacyState, from: NationId, to: NationId): void {
  if (!atWar(world, from, to)) return;
  const deal = dealFor(world, ctx, s, from, to);
  if (!deal) return;
  if ('refused' in deal) {
    ctx.emit({ type: 'message', tick: world.tick, nation: from, text: `${from} offers peace to ${to}, but ${deal.refused}` });
    return;
  }
  const k = relationKey(from, to);
  if (s.offers[k] === to || accepts(world, s, deal, from, to)) settle(world, ctx, s, deal);
  else {
    s.offers[k] = from;
    ctx.emit({ type: 'message', tick: world.tick, nation: from, text: `${from} offers peace to ${to}` });
  }
}

/** Open offers are weighed again as the war turns: an AI-run target takes one once it would accept it. */
export function reviewOffers(world: World, ctx: SimContext, s: DiplomacyState): void {
  for (const [k, from] of Object.entries(s.offers)) {
    if (s.offers[k] !== from) continue;
    const [a, b] = k.split('|') as [NationId, NationId];
    const to = a === from ? b : a;
    const deal = atWar(world, from, to) ? dealFor(world, ctx, s, from, to) : undefined;
    if (!deal || 'refused' in deal) delete s.offers[k];
    else if (accepts(world, s, deal, from, to)) settle(world, ctx, s, deal);
  }
}

/**
 * A side leader whose war aim is met, or spent (aimStatus), offers the other side's leader peace; the offer stands and
 * is weighed again daily (reviewOffers). A punitive exchange ends this way within days and a limited war once the claim
 * is held or the offensive stalls, rather than running on until both sides are exhausted (negotiatedPeace). A human who
 * kept strategic decisions is never signed up: the AI makes offers only for nations it decides for.
 */
export function pursueAims(world: World, ctx: SimContext, s: DiplomacyState): void {
  for (const war of [...s.wars]) {
    for (const i of [0, 1] as const) {
      const leader = war.sides[i].leader, other = war.sides[1 - i].leader;
      if (!s.wars.includes(war) || !delegated(world, leader, 'strategic') || s.offers[relationKey(leader, other)] === leader) continue;
      const st = aimStatus(world, war, i);
      if (st.status === 'fighting') continue;
      ctx.emit({ type: 'message', tick: world.tick, nation: leader, text: `${leader} seeks a ceasefire in the ${war.name}: ${st.why}` });
      offerPeace(world, ctx, s, leader, other);
    }
  }
}

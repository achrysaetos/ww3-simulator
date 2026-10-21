import { atWar, currentDate, type SimContext, type System } from '../../core/engine';
import type { Government, Nation, NationId, World } from '../../core/types';
import { AID_FLOWS } from '../../data/industry/aid';
import { DONOR_POLITICS } from '../../data/politics/aid';
import { ELECTIONS, type Election } from '../../data/politics/elections';
import { draw, keyOf } from '../civil/hash';
import { hostedBy } from '../civil/state';
import type { AidPolitics, PoliticsNation, PoliticsState } from './state';

export type * from './state';

/**
 * How far public opinion moves policy, by regime: the casualty sensitivity diplomacy uses for
 * war support (Gartner 1997; Weeks 2008 on audience costs). Autocracies answer pain through
 * regime stability instead.
 */
const VOICE: Record<Government, number> = {
  liberal_democracy: 1, flawed_democracy: 0.85, hybrid: 0.6, monarchy: 0.45,
  authoritarian: 0.4, military_junta: 0.4, theocracy: 0.35, totalitarian: 0.25,
};
const VOTES: ReadonlySet<Government> = new Set(['liberal_democracy', 'flawed_democracy', 'hybrid']);

/**
 * Cost-of-living pain. Europe's 2022 energy shock (gas prices up five-fold, inflation near
 * 10%) cost governments popularity but moved support for Ukraine only a few points
 * (Eurobarometer 2022-23), so a doubling of energy prices for a full importer costs 0.05;
 * output lost and war deficits weigh as recessions and inflation do in economic-voting
 * studies (Lewis-Beck and Stegmaier 2000). Estimates.
 */
const ENERGY_PER_DOUBLING = 0.05;
const GDP_LOSS_WEIGHT = 0.5;
const DEFICIT_WEIGHT = 0.15;

/**
 * Marginal casualties: Gartner and Segura (1998) found the recent casualty rate moves opinion
 * on top of the cumulative toll, as US support for Vietnam fell fastest in the bloodiest months
 * of 1968. Per tenfold rise in monthly killed and wounded per 100k people, at full voice.
 * A people fighting off an invasion bears its losses and hardship far better (Gelpi, Feaver
 * and Reifler 2009 on stakes): Ukraine's public held through a 29% fall in GDP in 2022 and
 * losses that broke support for wars of choice, so an invaded nation feels INVADED_PAIN_SHARE
 * of both.
 */
const LOSS_PER_DECADE = 0.12;
const LOSS_WINDOW_DAYS = 30;
const INVADED_PAIN_SHARE = 0.3;

/**
 * Rally round the flag after enemy strikes on the homeland: Ukrainian resolve hardened under the
 * 2022-23 strike campaign (KIIS: those refusing any territorial concession stayed above 80%).
 * Small and fading, since diplomacy already gives the rally of being attacked at all.
 */
const RALLY_PER_STRIKE_DAY = 0.004;
const RALLY_CAP = 0.06;
const RALLY_HALF_LIFE_DAYS = 60;

/** Sheltering refugees worth 1% of the population costs this much support; Polish support for hosting Ukrainians fell from ~90% to ~50% between 2022 and 2025 (CBOS). */
const REFUGEE_PER_PERCENT = 0.02;
const REFUGEE_CAP = 0.1;

/**
 * Mobilisation the public bears, by whether the state votes, raised when the homeland is
 * invaded (Ukraine 2022, Israel 2023) and with war support. Russia's 'partial mobilisation' of
 * September 2022 brought protests and ~700k departures; the US drafted for Korea and Vietnam at
 * a cost in support. Beyond tolerance, each unit of mobilisation costs MOBILIZATION_COST.
 */
const BASE_TOLERANCE = { votes: 0.3, autocracy: 0.5 } as const;
const THREAT_TOLERANCE = 0.6;
const STRUCK_THREAT = 0.4;
const INVADED_POP_SHARE = 0.02;
/** A ground battle on home soil keeps a nation fighting for its homeland this long after. */
const HOME_FIGHT_MEMORY_DAYS = 30;
const MOBILIZATION_COST = 0.3;

/**
 * Regime stability: the base hold, less raw economic pain, losses, overreach and lost territory,
 * undamped by the stakes (an invaded autocracy still feels them). Below PROTEST_BELOW protests
 * start and elites begin to defect, which costs war support (Russia 1917, Argentina 1982).
 * Russia's 2024-25 war (~35k casualties a month, a 7% defence share) sits near 0.65. Estimates.
 */
const STABILITY_BASE: Record<Government, number> = {
  liberal_democracy: 0.9, flawed_democracy: 0.85, hybrid: 0.8, monarchy: 0.85,
  authoritarian: 0.85, military_junta: 0.75, theocracy: 0.8, totalitarian: 0.95,
};
const TERRITORY_PAIN = 0.5;
const PROTEST_BELOW = 0.5;
const DEFECTION_COST = 0.3;

/**
 * Elections. An incumbent's odds follow approval of the war (or of the aid) on a logistic curve;
 * a government voted out on it shifts support by ELECTION_SHIFT for good (the 2024 US vote paused
 * aid to Ukraine in March 2025). Estimates.
 */
const ELECTION_SLOPE = 8;
const ELECTION_SHIFT = 0.12;

/**
 * Arms aid needs a funded package. A renewal passes at RENEW_AT and, once lapsed, needs
 * RESTORE_MARGIN more to be restored, voted monthly. Aid fatigue: support falls FATIGUE_PER_YEAR;
 * a donor fighting its own war keeps its arms (DONOR_AT_WAR).
 */
const RENEW_AT = 0.45;
const RESTORE_MARGIN = 0.05;
const REVOTE_DAYS = 30;
const FATIGUE_PER_YEAR = 0.04;
const DONOR_AT_WAR = 0.2;
const AUTOCRATIC_AID_STABILITY = 0.3;

const DONORS = [...new Set(AID_FLOWS.map((f) => f.donor))].filter((d) => DONOR_POLITICS[d]) as NationId[];
const CALENDAR: readonly (Election & { at: number })[] = ELECTIONS.map((e) => ({ ...e, at: Date.parse(e.date) })).sort((a, b) => a.at - b.at);

function newEntry(): PoliticsNation {
  return { supportShift: 0, drivers: { economy: 0, losses: 0, rally: 0, refugees: 0, mobilization: 0, unrest: 0, election: 0 }, lossRate: 0, rally: 0, mobilizationTolerance: 1, stability: 1, protesting: false, mandate: 0, elections: [] };
}

/** The tick at which the next budget day `month`/`day` after the current date begins. */
function nextBudgetTick(world: World, month: number, day: number): number {
  const now = currentDate(world);
  let t = Date.UTC(now.getUTCFullYear(), month - 1, day);
  if (t <= now.getTime()) t = Date.UTC(now.getUTCFullYear() + 1, month - 1, day);
  return world.tick + Math.ceil((t - now.getTime()) / 3_600_000 / world.dtHours);
}

function init(world: World): void {
  const s: PoliticsState = { nations: {}, nextElection: 0 };
  const start = currentDate(world).getTime();
  while (s.nextElection < CALENDAR.length && CALENDAR[s.nextElection].at < start) s.nextElection++;
  for (const d of DONORS) {
    if (!world.nations[d]) continue;
    const p = (s.nations[d] = newEntry());
    const r = DONOR_POLITICS[d].renews;
    p.aid = { support: DONOR_POLITICS[d].support, continues: true, voteTick: nextBudgetTick(world, r.month, r.day) };
  }
  world.slices.politics = s;
}

interface TickInputs {
  losses: Map<NationId, number>;
  struck: Set<NationId>;
  /** Nations fighting a ground battle on their own soil this tick. */
  invaded: Set<NationId>;
}

function readEvents(world: World, ctx: SimContext): TickInputs {
  const t: TickInputs = { losses: new Map(), struck: new Set(), invaded: new Set() };
  const { map } = ctx;
  for (const e of world.events) {
    if (e.type === 'battle') {
      for (const [n, c] of Object.entries(e.casualties) as [NationId, number][]) t.losses.set(n, (t.losses.get(n) ?? 0) + c);
      const home = e.node < map.landCount && e.domain !== 'air' && e.domain !== 'sea' ? map.owner[e.node] : undefined;
      if (home && (home === e.attacker || home === e.defender)) t.invaded.add(home);
    } else if (e.type === 'strike' && e.target < map.landCount && e.fired > e.intercepted) {
      const victim = map.owner[e.target];
      if (world.control[e.target] === victim && atWar(world, e.by, victim)) t.struck.add(victim);
    }
  }
  return t;
}

function opinion(world: World, p: PoliticsNation, n: Nation, t: TickInputs, hosted: number, dtDays: number): void {
  const voice = VOICE[n.government];
  const a = world.slices.diplomacy?.assessment[n.id];
  if (t.invaded.has(n.id)) p.homeFightTick = world.tick;
  const invaded = (!!a && (a.popLost > INVADED_POP_SHARE || a.capitalThreatened)) || (p.homeFightTick !== undefined && (world.tick - p.homeFightTick) * dtDays < HOME_FIGHT_MEMORY_DAYS);
  const stakes = invaded ? INVADED_PAIN_SHARE : 1;
  const econ = world.slices.economy?.nations[n.id];
  const energyPrice = world.slices.economy?.energyPrice ?? 1;
  const importShare = Math.min(1, Math.max(0, (n.stats.energyImportPct ?? 0) / 100));
  const rawEconomy = ENERGY_PER_DOUBLING * importShare * Math.log2(Math.max(1, energyPrice))
    + GDP_LOSS_WEIGHT * Math.max(0, 1 - (econ?.gdpIndex ?? 1)) + DEFICIT_WEIGHT * Math.max(0, econ?.deficitPctGdp ?? 0);

  p.lossRate += ((t.losses.get(n.id) ?? 0) / dtDays - p.lossRate) * (1 - Math.exp(-dtDays / LOSS_WINDOW_DAYS));
  const monthlyPer100k = ((p.lossRate * 30) / Math.max(1, n.population)) * 1e5;

  p.rally *= 0.5 ** (dtDays / RALLY_HALF_LIFE_DAYS);
  if (t.struck.has(n.id)) p.rally = Math.min(RALLY_CAP, p.rally + RALLY_PER_STRIKE_DAY * dtDays);

  const threat = invaded ? 1 : p.rally > 0.01 ? STRUCK_THREAT : 0;
  const votes = VOTES.has(n.government);
  p.mobilizationTolerance = Math.min(1, Math.max(0.1, (votes ? BASE_TOLERANCE.votes : BASE_TOLERANCE.autocracy) + THREAT_TOLERANCE * threat + 0.3 * (n.warSupport - 0.5)));
  const overreach = Math.max(0, n.mobilization - p.mobilizationTolerance);
  const rawLosses = LOSS_PER_DECADE * Math.log10(1 + monthlyPer100k);

  p.stability = Math.min(1, Math.max(0, STABILITY_BASE[n.government] - rawEconomy - rawLosses - MOBILIZATION_COST * overreach - TERRITORY_PAIN * (a?.popLost ?? 0)));

  const d = p.drivers;
  d.economy = -voice * stakes * rawEconomy;
  d.losses = -voice * stakes * rawLosses;
  d.rally = p.rally;
  d.refugees = -Math.min(REFUGEE_CAP, REFUGEE_PER_PERCENT * ((hosted / Math.max(1, n.population)) * 100));
  d.mobilization = overreach > 0 ? -MOBILIZATION_COST * overreach : 0;
  d.unrest = votes ? 0 : -DEFECTION_COST * Math.max(0, (PROTEST_BELOW - p.stability) / PROTEST_BELOW);
  d.election = p.mandate;
  p.supportShift = d.economy + d.losses + d.rally + d.refugees + d.mobilization + d.unrest + d.election;
}

function protests(world: World, ctx: SimContext, p: PoliticsNation, n: Nation): void {
  const now = !VOTES.has(n.government) && p.stability < PROTEST_BELOW;
  if (now === p.protesting) return;
  p.protesting = now;
  ctx.emit({ type: 'message', tick: world.tick, nation: n.id, text: now ? `Protests against the war spread in ${n.name}` : `Protests in ${n.name} subside` });
}

function aidSupport(world: World, p: PoliticsNation, n: Nation, hosted: number): number {
  const base = DONOR_POLITICS[n.id].support;
  const years = (world.tick * world.dtHours) / 8760;
  const energyPrice = world.slices.economy?.energyPrice ?? 1;
  const burden = Math.min(REFUGEE_CAP, REFUGEE_PER_PERCENT * ((hosted / Math.max(1, n.population)) * 100));
  const ownWar = n.status === 'war' ? DONOR_AT_WAR : 0;
  return Math.min(1, Math.max(0, base + p.mandate - burden - ENERGY_PER_DOUBLING * Math.log2(Math.max(1, energyPrice)) - FATIGUE_PER_YEAR * years - ownWar));
}

function voteAid(world: World, ctx: SimContext, aid: AidPolitics, p: PoliticsNation, n: Nation): void {
  if (!VOTES.has(n.government)) {
    aid.continues = p.stability >= AUTOCRATIC_AID_STABILITY && n.status !== 'capitulated' && n.status !== 'collapsed';
    return;
  }
  if (world.tick < aid.voteTick) return;
  const passes = aid.support >= RENEW_AT + (aid.continues ? 0 : RESTORE_MARGIN);
  if (passes !== aid.continues)
    ctx.emit({ type: 'message', tick: world.tick, nation: n.id, text: passes ? `${n.name} restores funding for arms aid` : `${n.name}'s arms aid package lapses: the legislature does not renew it` });
  aid.continues = passes;
  const r = DONOR_POLITICS[n.id].renews;
  aid.voteTick = passes ? nextBudgetTick(world, r.month, r.day) : world.tick + Math.round((REVOTE_DAYS * 24) / world.dtHours);
}

function holdElections(world: World, ctx: SimContext, s: PoliticsState): void {
  const now = currentDate(world).getTime();
  while (s.nextElection < CALENDAR.length && CALENDAR[s.nextElection].at <= now) {
    const e = CALENDAR[s.nextElection++];
    const n = world.nations[e.nation as NationId];
    if (!n || !VOTES.has(n.government)) continue;
    const p = (s.nations[n.id] ??= newEntry());
    const aidOn = !!p.aid && AID_FLOWS.some((f) => f.donor === n.id && world.nations[f.recipient as NationId]?.status === 'war');
    if (n.status !== 'war' && !aidOn) continue;
    const approval = n.status === 'war' ? n.warSupport : p.aid!.support;
    const won = draw(world.seed, world.tick, keyOf(n.id)) < 1 / (1 + Math.exp(-ELECTION_SLOPE * (approval - 0.5)));
    p.elections.push({ date: e.date, kind: e.kind, approval, incumbentWon: won });
    if (!won) p.mandate -= ELECTION_SHIFT;
    ctx.emit({
      type: 'message', tick: world.tick, nation: n.id,
      text: won ? `${n.name} ${e.kind} election: the government holds on (approval ${Math.round(approval * 100)}%)` : `${n.name} ${e.kind} election: the government loses to opponents of the war effort (approval ${Math.round(approval * 100)}%)`,
    });
  }
}

/**
 * Domestic politics: public opinion on the war from its costs at home, elections on the real
 * calendar, protests and regime stability, and the legislative votes that keep arms aid
 * funded. Writes only its own slice; diplomacy adds `supportShift` to war support and the
 * economy ships aid only while `aid.continues`.
 */
export const politics: System = {
  id: 'politics',
  init,
  step(world, ctx) {
    const s = world.slices.politics;
    const dtDays = world.dtHours / 24;
    const t = readEvents(world, ctx);
    const hosted = world.slices.civil ? hostedBy(world.slices.civil) : new Map<NationId, number>();
    holdElections(world, ctx, s);
    for (const n of Object.values(world.nations)) {
      const p = s.nations[n.id] ?? (n.status === 'war' ? (s.nations[n.id] = newEntry()) : undefined);
      if (!p) continue;
      opinion(world, p, n, t, hosted.get(n.id) ?? 0, dtDays);
      protests(world, ctx, p, n);
      if (p.aid) {
        p.aid.support = aidSupport(world, p, n, hosted.get(n.id) ?? 0);
        voteAid(world, ctx, p.aid, p, n);
      }
    }
  },
};

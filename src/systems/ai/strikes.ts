import { relation } from '../../core/engine';
import type { GameMap } from '../../core/map';
import type { Formation, FormationId, FormationKind, Munition, MunitionId, NationId, NodeId, Order, PlatformId, TargetClass } from '../../core/types';
import { isOverseas } from '../../data/territories';
import { HOSTILE_OPINION } from '../diplomacy/escalation';
import { delegated } from '../orders';
import { rung } from '../diplomacy/wars';
import { aimKey, ATTRITABLE_COST_USD_M, dailyRounds, effectPk, futileAim } from '../air';
import { ANTISHIP_KINDS } from '../naval';
import type { HqLevel } from '../c2/state';
import { isGround, issue, sighted } from './forces';
import { CURRENT_CONFIDENCE } from '../intel/view';
import type { Plan } from './types';

export interface StrikeTarget {
  node: NodeId;
  cls: TargetClass;
  value: number;
  formation?: FormationId;
  /** A naval group away from its home port: only a weapon with a terminal seeker finds it (air strikeShips). */
  afloat?: boolean;
  /** Where a naval target lies within its sea zone (naval navalPosition); weapon range is measured to it. */
  at?: NodeId;
  assigned: number;
}

/**
 * Target values follow the order of the opening air campaign in 1991 Iraq
 * (Gulf War Air Power Survey) and the lessons of 2022 Ukraine: suppress air
 * defences first, then air bases and long-range fires, then the logistics
 * that sustain the front, then forces in contact. Air bases are struck for the
 * aircraft on them: CSIS's 2023 Taiwan wargames had most US aircraft losses on
 * the ground to PLARF missile salvos on the ramps.
 */
const VALUE_BY_KIND: Partial<Record<FormationKind, { value: number; cls: TargetClass }>> = {
  air_defense: { value: 5, cls: 'soft' },
  air_wing: { value: 4, cls: 'aircraft' },
  missile: { value: 3.5, cls: 'soft' },
  surface_group: { value: 3.5, cls: 'ship' },
  logistics: { value: 3, cls: 'soft' },
};
/**
 * A naval group or an air wing is worth what a salvo on it destroys. Hits on a group fall on its hulls one
 * at a time, so a group is worth its cost per hull, with the troops and vehicles embarked counted on the
 * hulls carrying them: a US carrier strike group runs about USD 4-5bn a hull with its air wing, a Taiwanese
 * frigate about 500m, a China Coast Guard cutter 30-120m (210 hulls in a bureau make it costly in all but
 * cheap to hit), and a ro-ro ferry full of a PLA brigade is worth the brigade. Aircraft on a ramp die in
 * proportion to how many are parked, so an air wing is worth its whole cost: a US F-35 wing at Kadena about
 * 5bn, a Taiwanese F-16 wing about 1.5bn. CSIS's 2023 Taiwan wargames had PLARF and PLAN salvos go after US
 * carriers, Aegis escorts and the ramps at Kadena and Guam, sinking 2 carriers and 7-20 major surface
 * combatants per iteration, with most US aircraft lost on the ground. The value grows with the square root
 * of the cost against a reference (a destroyer, a mid-sized wing), held within WORTH (judgment), so a carrier
 * group outranks an air defence site but not every other target together.
 */
const WORTH_REF_USD_M: Partial<Record<FormationKind, number>> = { surface_group: 1000, air_wing: 2000 };
const WORTH = { min: 0.5, max: 3 };
const FRONT_FORCES = { value: 2, cls: 'armor' as TargetClass };
const RAIL_HUB = { value: 1.5, cls: 'structure' as TargetClass, minRailKm: 50 };
const CAPITAL = { value: 2.5, cls: 'structure' as TargetClass };
/**
 * Field headquarters, struck as hardened aimpoints: Ukraine's HIMARS and Storm Shadow strikes on Russian army and
 * corps command posts in 2022-23 killed several generals and slowed Russian command for days at a time (RUSI,
 * "Preliminary Lessons", 2022). A destroyed army HQ is worth more than a SAM site and outranks a front's
 * (judgment); planners weigh that against the low kill probability of a salvo on a bunker, so the busiest rail
 * hubs draw the first salvo and HQs the next. An HQ for garrisons far from any fighting is not worth a salvo. The national command authority, and any HQ sharing its
 * cell, sits in the capital, which CAPITAL and the escalation ladder already govern.
 */
const HQ_VALUE: Partial<Record<HqLevel, number>> = { army: 6, front: 5 };
/** How far behind the battle area a field HQ still directs a fight worth striking it for: an army's depth (judgment). */
const HQ_REACH_KM = 150;
/**
 * Nations whose doctrine strikes the enemy's power grid as a campaign of its own. Russia did it
 * from October 2022: waves of Kh-101, Kalibr, Iskander and Shaheds on thermal and hydro plants and
 * the substations serving Kyiv, Kharkiv, Odesa, Dnipro and Lviv, about a third of its long-range
 * launches in the winter of 2022-23 and again from March 2024 (Ukrenergo; UN HRMMU). The grid
 * serving each of the enemy's largest cities is a target worth what is still standing (judgment).
 */
const GRID_CAMPAIGN: ReadonlySet<NationId> = new Set(['RUS' as NationId]);
const GRID = { value: 5, cls: 'power' as TargetClass, cities: 12 };
/** Leadership willing to risk deep strikes on a nuclear power's homeland before the ladder sanctions them. */
const DEEP_STRIKE_RISK = 0.7;

/**
 * A strategic formation flying aircraft is a bomber regiment on its ramp, struck like any air wing: Ukrainian drones
 * hit Tu-95s and Tu-22M3s at Engels and Olenya (December 2022, Operation Spiderweb in June 2025). Silos, mobile ICBMs
 * and SSBNs stay off the conventional target list.
 */
const isBomberForce = (p: Plan, f: Formation) =>
  f.kind === 'strategic' && Object.keys(f.equipment).some((id) => p.ctx.catalog.platform(id as PlatformId).domain === 'air');

function costUsdM(p: Plan, f: Formation): number {
  let usd = 0;
  for (const [id, n] of Object.entries(f.equipment)) usd += n * p.ctx.catalog.platform(id as PlatformId).unitCostUsdM;
  return usd;
}

function hulls(p: Plan, f: Formation): number {
  let n = 0;
  for (const [id, k] of Object.entries(f.equipment)) if (p.ctx.catalog.platform(id as PlatformId).domain === 'sea') n += k;
  return n;
}

/** Each enemy ship's embarked cargo, by cost. */
function cargoUsdM(p: Plan): Map<FormationId, number> {
  const out = new Map<FormationId, number>();
  for (const f of Object.values(p.world.formations))
    if (f.status === 'embarked' && f.embarkedOn && p.enemies.has(f.nation)) out.set(f.embarkedOn, (out.get(f.embarkedOn) ?? 0) + costUsdM(p, f));
  return out;
}

/**
 * Whether striking cells of `owner`'s metropolitan homeland outside the battle area is
 * politically allowed. A nuclear power weighs deep strikes on another nuclear
 * power's homeland against escalation and waits until the dyad has reached
 * strategic conventional war (cf. the 2024 US decision to let Ukraine use US
 * weapons near Kharkiv but not deeper). A non-nuclear belligerent has no such
 * ladder to climb and strikes deep from the start: Ukraine's drone campaign on
 * Russian refineries and airbases from 2023, Iran's salvos on Israel in 2024.
 */
function deepStrikeAllowed(p: Plan, owner: NationId): boolean {
  if (!p.enemies.has(owner)) return delegated(p.world, p.nation, 'strategic') && relation(p.world, p.nation, owner).opinion <= HOSTILE_OPINION;
  if (p.world.nations[owner].nuclear.warheads <= 0) return true;
  if (p.world.nations[p.nation].nuclear.warheads <= 0 || p.profile.riskTolerance >= DEEP_STRIKE_RISK) return true;
  return rung(relation(p.world, p.nation, owner).escalation) >= rung('strategic_conventional');
}

/**
 * Enemy forces on a neutral's soil are struck only when the host is already
 * hostile and inside the theatre, which brings the host into the war (see
 * diplomacy processEvents). CSIS "The First Battle of the Next War" (2023) has
 * China strike US bases on Okinawa, ~650 km from Taipei, in most iterations;
 * mainland Japan and Korea, 1,300-1,500 km out, stay unstruck in its base case.
 * A friendly or ambivalent host is never struck: China would not hit Al Udeid
 * over Taiwan, nor Russia its own ally Belarus. Widening the war is a strategic
 * decision, so a player's delegate never makes it for a player who kept those.
 */
const THEATRE_KM = 1000;

function nearEnemyCapital(p: Plan, node: NodeId): boolean {
  for (const e of p.enemies) if (withinKm(p.ctx.map, node, p.world.nations[e].capital, THEATRE_KM)) return true;
  return false;
}

export function battleAreaOf(p: Plan): Set<number> {
  const out = new Set<number>();
  for (const s of p.sectors) for (const n of s.battleArea) out.add(n);
  return out;
}

const CELL_DEG = 10;
const ROWS = 180 / CELL_DEG, COLS = 360 / CELL_DEG;

/** Strike targets bucketed by 10-degree cells, so each shooter only looks at what is near it. */
export class TargetGrid {
  private readonly cells = new Map<number, number[]>();

  /** `targets` must be sorted by value, descending. */
  constructor(readonly targets: StrikeTarget[], private readonly map: GameMap) {
    targets.forEach((t, i) => {
      const k = this.row(map.lat[t.node]) * COLS + this.col(map.lon[t.node]);
      (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(i);
    });
  }

  private row(lat: number) { return Math.min(ROWS - 1, Math.max(0, Math.floor((lat + 90) / CELL_DEG))); }
  private col(lon: number) { return ((Math.floor((lon + 180) / CELL_DEG) % COLS) + COLS) % COLS; }

  /** Targets in the cells overlapping a `km` radius around `node`, still sorted by value. */
  near(node: NodeId, km: number): StrikeTarget[] {
    const lat = this.map.lat[node], lon = this.map.lon[node];
    const dLat = km / 111;
    const worstLat = Math.min(89, Math.max(Math.abs(lat - dLat), Math.abs(lat + dLat)));
    const dLon = km / (111 * Math.cos((worstLat * Math.PI) / 180));
    const wide = dLon >= 180;
    const cols = wide ? COLS : Math.min(COLS, Math.floor((lon + dLon + 180) / CELL_DEG) - Math.floor((lon - dLon + 180) / CELL_DEG) + 1);
    const c0 = wide ? 0 : this.col(lon - dLon);
    const idx: number[] = [];
    for (let r = this.row(lat - dLat); r <= this.row(lat + dLat); r++)
      for (let c = 0; c < cols; c++) for (const i of this.cells.get(r * COLS + ((c0 + c) % COLS)) ?? []) idx.push(i);
    return idx.sort((a, b) => a - b).map((i) => this.targets[i]);
  }
}

export function strikeTargets(p: Plan, battleArea: Set<number>): TargetGrid {
  const { map } = p.ctx;
  const out: StrikeTarget[] = [];
  const cargo = cargoUsdM(p);
  const worth = (f: Formation) => {
    const ref = WORTH_REF_USD_M[isBomberForce(p, f) ? 'air_wing' : f.kind];
    if (!ref) return 1;
    const usd = (costUsdM(p, f) + (cargo.get(f.id) ?? 0)) / (f.kind === 'surface_group' ? Math.max(1, hulls(p, f)) : 1);
    return Math.min(WORTH.max, Math.max(WORTH.min, Math.sqrt(usd / ref)));
  };
  // Aimed where intelligence last fixed each formation, worth less as the fix goes stale.
  for (const e of p.enemies)
    for (const { f, node, confidence, contact } of sighted(p, e)) {
      const v = VALUE_BY_KIND[f.kind] ?? (isBomberForce(p, f) ? VALUE_BY_KIND.air_wing : isGround(f) && battleArea.has(node) ? FRONT_FORCES : undefined);
      if (!v) continue;
      const value = v.value * worth(f) * confidence;
      if (f.kind !== 'surface_group') out.push({ node, cls: v.cls, value, formation: f.id, assigned: 0 });
      else {
        const fresh = confidence === 1;
        out.push({ node, at: fresh ? (contact.inshore ?? node) : node, cls: v.cls, value, formation: f.id, afloat: node !== f.home || (fresh && !!contact.underway), assigned: 0 });
      }
    }
  const front = [...battleArea];
  for (const hq of Object.values(p.world.slices.c2?.hqs ?? {})) {
    const v = HQ_VALUE[hq.level];
    if (!v || hq.integrity <= 0 || !p.enemies.has(hq.nation) || hq.node === p.world.nations[hq.nation].capital) continue;
    // A field HQ is found with the troops it commands: one is struck only where a current contact of its nation stands.
    if (p.world.slices.intel && !p.view.contactsAt(hq.node).some((c) => c.nation === hq.nation && c.confidence >= CURRENT_CONFIDENCE)) continue;
    if (front.some((n) => map.distanceKm(n as NodeId, hq.node) <= HQ_REACH_KM)) out.push({ node: hq.node, cls: 'hardened', value: v * hq.integrity, assigned: 0 });
  }
  for (const n of battleArea)
    if (map.railKm[n] >= RAIL_HUB.minRailKm) out.push({ node: n as NodeId, cls: RAIL_HUB.cls, value: RAIL_HUB.value * Math.min(2, map.railKm[n] / 200), assigned: 0 });
  for (const e of p.enemies) {
    const cap = p.world.nations[e].capital;
    if (p.world.control[cap] === e) out.push({ node: cap, cls: CAPITAL.cls, value: CAPITAL.value, assigned: 0 });
    if (GRID_CAMPAIGN.has(p.nation)) for (const n of gridNodes(p, e)) out.push({ node: n, cls: GRID.cls, value: GRID.value * (p.world.theater.power?.[n] ?? 1), assigned: 0 });
  }
  const deep = new Map<NationId, boolean>();
  const allowed = (t: StrikeTarget) => {
    if (map.isSea(t.node) || battleArea.has(t.node)) return true;
    const owner = map.owner[t.node];
    // An enemy's overseas territory is theatre, not homeland: Guam's bases are struck alongside Okinawa's.
    if (p.enemies.has(owner) && isOverseas(map, t.node)) return true;
    let ok = deep.get(owner);
    if (ok === undefined) deep.set(owner, (ok = deepStrikeAllowed(p, owner)));
    return ok && (p.enemies.has(owner) || nearEnemyCapital(p, t.node));
  };
  // Aims recent raids could not touch wait for reassessment (air BDA).
  const live = (t: StrikeTarget) => !futileAim(p.world, p.nation, aimKey(t.node, t.formation, t.cls));
  return new TargetGrid(out.filter((t) => allowed(t) && live(t)).sort((a, b) => b.value - a.value || a.node - b.node), map);
}

/** The cells holding the enemy's largest cities it still controls, largest first. */
function gridNodes(p: Plan, e: NationId): NodeId[] {
  const nodes = new Set<NodeId>();
  for (const c of [...p.ctx.map.cities].filter((c) => c.nation === e && p.world.control[c.node] === e).sort((a, b) => b.pop - a.pop)) {
    nodes.add(c.node);
    if (nodes.size === GRID.cities) break;
  }
  return [...nodes];
}

/**
 * Conventional munitions in a formation's magazine that one of its platforms can
 * launch (an ORBAT's extra rounds for a launcher the formation lacks are dead stock).
 */
export function arsenal(p: Plan, f: Formation): Munition[] {
  const out: Munition[] = [];
  for (const [id, n] of Object.entries(f.magazine)) {
    const m = n > 0 ? p.ctx.catalog.munitions.get(id as MunitionId) : undefined;
    if (m && !m.yieldKt && launchable(p, f, m.id)) out.push(m);
  }
  return out;
}

function launchable(p: Plan, f: Formation, m: MunitionId): boolean {
  for (const [id, n] of Object.entries(f.equipment)) if (n > 0 && p.ctx.catalog.platform(id as PlatformId).loadout.some((l) => l.munition === m)) return true;
  return false;
}

/**
 * Days a nation spreads its precision-munition stocks over, on top of new
 * production. Against an enemy across a land front (a war of attrition), Russia's 2023-25 launches
 * tracked production plus a slow draw on reserves (Ukrainian GUR stock estimates vs
 * monthly launch tallies imply roughly a year held back). Against an enemy with no
 * shared front the war is a stand-off exchange decided by stocks and launcher attrition, and stocks
 * go fast: Iran fired ~550 ballistic missiles, a quarter or more of its force, in
 * the 12 days of June 2025. Both are judgments, not doctrine figures.
 */
const ATTRITION_HORIZON_DAYS = 365;
const STANDOFF_HORIZON_DAYS = 30;
/**
 * Rationed weapons go in massed salvos every few days, starting the day the war
 * does, to saturate defenses rather than trickle into them: Russia's combined
 * missile strikes on Ukraine came every 4-10 days in 2024-25; Iran's 2024 attacks
 * were single massed salvos (judgment). What the launchers cannot put up on the salvo
 * day goes on the days between: Iran fired waves on most nights of the June 2025 war,
 * ~550 ballistic missiles in 12 days from launchers that could not fire them at once.
 */
const SALVO_EVERY_DAYS = 3;

/**
 * A nation's daily firing budget per rationed munition: production plus stock
 * over the horizon. Planners propose strikes with the weapons that could do them,
 * cheapest per kill first; `settle` lets each proposal fire its first weapon whose
 * draw comes up, at probability budget / (what all proposals carrying it could
 * fire), and the rest hold on 'defend'.
 */
export class FireBudget {
  private readonly proposals: { f: Formation; options: Munition[]; t: StrikeTarget; order: Omit<Order, 'issuedTick'> }[] = [];

  constructor(private readonly p: Plan) {}

  /**
   * Strike now if the cheapest weapon for it is not rationed or the target is an enemy landing on
   * friendly soil, else queue it for `settle`. Coastal anti-ship batteries exist for the hours an
   * invasion fleet lies off the beaches; holding them back for a later salvo loses them to the
   * landing (CSIS 2023: Taiwan's shore-based Harpoons were among the main killers of PLA lift).
   */
  propose(f: Formation, options: Munition[], t: StrikeTarget, order: Omit<Order, 'issuedTick'>): void {
    if (!options.length || options[0].unitCostUsdM < ATTRITABLE_COST_USD_M || this.landingOnFriends(t)) return issue(this.p, f, order);
    this.proposals.push({ f, options, t, order });
  }

  settle(): void {
    const { world, nation, ctx } = this.p;
    const capacity = new Map<MunitionId, number>();
    for (const x of this.proposals) for (const m of x.options) capacity.set(m.id, (capacity.get(m.id) ?? 0) + dailyRounds(x.f, m.id, ctx.catalog));
    const front = new Set<NationId>();
    for (const sec of this.p.sectors) for (const n of sec.enemyNodes) front.add(world.control[n]);
    const salvoDay = this.salvoDay();
    const share = (m: MunitionId, horizon: number) => {
      const cap = capacity.get(m) ?? 0;
      if (cap <= 0) return 0;
      let stock = world.nations[nation].stockpile[m] ?? 0;
      for (const f of this.p.index.byNation.get(nation) ?? []) if (f.kind === 'air_wing' || f.kind === 'missile') stock += f.magazine[m] ?? 0;
      const produced = (world.slices.economy?.nations[nation]?.lines[m]?.capacityPerMonth ?? 0) / 30;
      const cycle = SALVO_EVERY_DAYS * (produced + stock / horizon);
      return Math.min(1, (salvoDay ? cycle : Math.max(0, cycle - cap) / (SALVO_EVERY_DAYS - 1)) / cap);
    };
    for (const x of this.proposals) {
      const horizon = front.has(world.control[x.t.node]) ? ATTRITION_HORIZON_DAYS : STANDOFF_HORIZON_DAYS;
      const m = x.options.find((m) => ctx.rng.chance(share(m.id, horizon)));
      if (m) issue(this.p, x.f, { ...x.order, munition: m.id });
      else {
        x.t.assigned--;
        issue(this.p, x.f, { posture: 'defend' });
      }
    }
    this.proposals.length = 0;
  }

  private landingOnFriends(t: StrikeTarget): boolean {
    const { world, ctx, friends } = this.p;
    return t.at !== undefined && !ctx.map.isSea(t.at) && friends.has(world.control[t.at]);
  }

  private salvoDay(): boolean {
    const { world, nation, enemies } = this.p;
    let since = world.tick;
    for (const e of enemies) since = Math.min(since, relation(world, nation, e).warSince ?? since);
    return Math.floor(((world.tick - since) * world.dtHours) / 24) % SALVO_EVERY_DAYS === 0;
  }
}

/** Kill probability of `m` against `t`; a weapon without a terminal seeker has none against a group at sea. */
export function pkAgainst(m: Munition, t: StrikeTarget): number {
  return t.afloat && !ANTISHIP_KINDS.has(m.kind) ? 0 : effectPk(m, t.cls);
}

/** Weapons in `stock` that can kill `t`, cheapest per expected kill first. */
export function strikeOptions(stock: readonly Munition[], t: StrikeTarget): Munition[] {
  const perKill = (m: Munition) => m.unitCostUsdM / pkAgainst(m, t);
  return stock.filter((m) => pkAgainst(m, t) > 0).sort((a, b) => perKill(a) - perKill(b));
}

const INTERCEPTOR_KINDS: ReadonlySet<Munition['kind']> = new Set(['sam', 'abm', 'shorad_missile']);
/**
 * How far a strike sortie will fly into a known SAM envelope before releasing.
 * Russian and Ukrainian strike aviation in 2023-25 released glide bombs and rockets
 * at or just inside the edge of known coverage, not over it (judgment).
 */
const TOLERATED_DEPTH_KM = 15;
const ROUTE_SAMPLE_KM = 50;
/**
 * Below this visibility (a stealth airframe) a package flies over the enemy's rear
 * without first winning the air there, as B-2s and F-35Is did over Iran in 2025.
 */
const PENETRATOR_VISIBILITY = 0.1;
/**
 * Air bases are the first thing a defender's short- and medium-range SAMs cover
 * (Ukraine's Starokostiantyniv and Myrhorod, Patriot at Kadena), whether or not the
 * order of battle lists a battery there, so planners treat each as ringed (judgment).
 */
const AIRBASE_DEFENSE_KM = 60;
/** The line between two 1-degree cells in contact runs about half a cell (~55 km) from each side's cell centres. */
const LINE_OFFSET_KM = 55;

/** Enemy SAM envelopes, for keeping strike aircraft out of coverage they cannot outrange. */
/** Longest interceptor range in a formation's magazine, memoised per tick: every enemy's planner asks. */
const reachMemo = new WeakMap<Formation, { tick: number; km: number }>();

function interceptorReach(p: Plan, f: Formation): number {
  const hit = reachMemo.get(f);
  if (hit?.tick === p.world.tick) return hit.km;
  let km = 0;
  for (const [id, n] of Object.entries(f.magazine)) {
    const m = n >= 1 ? p.ctx.catalog.munitions.get(id as MunitionId) : undefined;
    if (m && INTERCEPTOR_KINDS.has(m.kind)) km = Math.max(km, m.rangeKm);
  }
  reachMemo.set(f, { tick: p.world.tick, km });
  return km;
}

export class SamCover {
  /** Widest envelope per node; several batteries at one site cover no more ground than the longest-ranged. */
  private readonly reach = new Map<NodeId, number>();
  /** Sites sorted by latitude, so a query scans only the band an envelope can reach. */
  private sams: { node: NodeId; km: number; lat: number }[] = [];
  private maxKm = 0;
  /** Enemy-held cells touching a friendly front: the contact zone strike aviation may overfly. */
  private readonly contact = new Set<number>();
  /** Own front cells, and the enemies holding ground across from them. */
  private readonly front: NodeId[] = [];
  private readonly across = new Set<NationId>();
  constructor(private readonly p: Plan) {
    for (const s of p.sectors) {
      this.front.push(...s.nodes);
      for (const n of s.enemyNodes) {
        this.contact.add(n);
        this.across.add(p.world.control[n]);
      }
    }
    for (const e of p.enemies)
      for (const f of p.index.byNation.get(e) ?? []) {
        if (f.kind === 'air_wing') {
          this.cover(f.node, AIRBASE_DEFENSE_KM);
          continue;
        }
        if (f.kind !== 'air_defense' && f.kind !== 'surface_group') continue;
        const km = interceptorReach(p, f);
        if (km > 0) this.cover(f.node, km);
      }
    const { map } = p.ctx;
    this.sams = [...this.reach].map(([node, km]) => ({ node, km, lat: map.lat[node] })).sort((a, b) => a.lat - b.lat);
    for (const s of this.sams) this.maxKm = Math.max(this.maxKm, s.km);
  }

  /** Whether some site's envelope, scaled by `visibility` and shrunk by `marginKm`, reaches `at`. */
  private reaches(at: NodeId, visibility: number, marginKm: number): boolean {
    const { map } = this.p.ctx;
    const lat = map.lat[at], band = (this.maxKm * visibility - marginKm) / 111;
    if (band <= 0) return false;
    let lo = 0, hi = this.sams.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.sams[mid].lat < lat - band) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < this.sams.length && this.sams[i].lat <= lat + band; i++) {
      const s = this.sams[i];
      const need = s.km * visibility - marginKm;
      if (need > 0 && withinKm(map, s.node, at, need)) return true;
    }
    return false;
  }

  private cover(node: NodeId, km: number): void {
    this.reach.set(node, Math.max(km, this.reach.get(node) ?? 0));
  }

  /**
   * Whether an aircraft of `visibility` (1 = conventional; stealth shrinks the
   * range at which a SAM can engage it) flying from `from` with a weapon reaching
   * `standoffKm` can hit `node` without flying deeper than tolerated into an
   * envelope, either on the way to the release point (straight line) or at it
   * (SAMs taken to sit behind the target). Nor does a conventional package cross
   * the enemy's rear, past the cells in contact with the front, where it does not hold the
   * air: short-range air defenses and fighters there are not in the SAM list but kill as
   * surely. This keeps both air forces in Ukraine launching from their own side of the
   * front, as they have since 2022: Russian glide bombs reach 40-70 km past the line
   * (ISW, RUSI 2024), and Russian jets do not overfly Poltava 200 km behind it. A target
   * across a land front is reachable only from a release point at most TOLERATED_DEPTH_KM
   * past the line.
   */
  clear(from: NodeId, node: NodeId, standoffKm: number, visibility = 1): boolean {
    if (this.covered(node, standoffKm, visibility) || this.pastLine(node, standoffKm, visibility)) return false;
    const key = `${from}:${node}:${standoffKm}:${visibility}`;
    let ok = this.routes.get(key);
    if (ok === undefined) this.routes.set(key, (ok = this.route(from, node, standoffKm, visibility)));
    return ok;
  }

  private readonly routes = new Map<string, boolean>();
  private readonly lineKm = new Map<number, number>();

  /** A target across a land front that a conventional package reaches only by releasing deeper than tolerated past the line. */
  private pastLine(node: NodeId, standoffKm: number, visibility: number): boolean {
    const { map } = this.p.ctx;
    const { world, nation } = this.p;
    if (visibility < PENETRATOR_VISIBILITY || map.isSea(node) || !this.across.has(world.control[node]) || world.theater.airControl[node]?.nation === nation) return false;
    let km = this.lineKm.get(node);
    if (km === undefined) {
      km = Infinity;
      for (const f of this.front) km = Math.min(km, map.distanceKm(f, node));
      this.lineKm.set(node, (km -= LINE_OFFSET_KM));
    }
    return km > standoffKm + TOLERATED_DEPTH_KM;
  }

  private route(from: NodeId, node: NodeId, standoffKm: number, visibility: number): boolean {
    const { map } = this.p.ctx;
    const dist = map.distanceKm(from, node);
    const leg = dist - standoffKm;
    if (leg <= 0) return true;
    const lat0 = map.lat[from], lon0 = map.lon[from];
    const dLon = ((((map.lon[node] - lon0) % 360) + 540) % 360) - 180;
    for (let km = ROUTE_SAMPLE_KM; km <= leg; km += ROUTE_SAMPLE_KM) {
      const t = km / dist;
      const at = map.nodeAt(lat0 + (map.lat[node] - lat0) * t, lon0 + dLon * t);
      if (this.inside(at, visibility)) return false;
    }
    return true;
  }

  private readonly depth = new Map<string, boolean>();
  private readonly release = new Map<string, boolean>();

  private covered(node: NodeId, standoffKm: number, visibility: number): boolean {
    const key = `${node}:${standoffKm}:${visibility}`;
    let hit = this.release.get(key);
    if (hit === undefined) {
      hit = this.reaches(node, visibility, standoffKm + TOLERATED_DEPTH_KM);
      this.release.set(key, hit);
    }
    return hit;
  }

  private inside(at: NodeId, visibility: number): boolean {
    const key = `${at}:${visibility}`;
    let hit = this.depth.get(key);
    if (hit === undefined) {
      const { map } = this.p.ctx;
      const { world, enemies, nation } = this.p;
      const rear = !map.isSea(at) && enemies.has(world.control[at]) && !this.contact.has(at) && world.theater.airControl[at]?.nation !== nation;
      hit = (rear && visibility >= PENETRATOR_VISIBILITY) || this.reaches(at, visibility, TOLERATED_DEPTH_KM);
      this.depth.set(key, hit);
    }
    return hit;
  }
}

/** Great-circle test with a cheap latitude-band reject first; shooters test thousands of targets. */
export function withinKm(map: GameMap, a: NodeId, b: NodeId, km: number): boolean {
  return Math.abs(map.lat[a] - map.lat[b]) * 111 <= km && map.distanceKm(a, b) <= km;
}

/** Unrefuelled reach of a formation (combat radius for aircraft, range for ships): its shortest-legged type sets it. */
export function reachKm(p: Plan, f: Formation): number {
  let r = Infinity;
  for (const [id, n] of Object.entries(f.equipment)) if (n > 0) r = Math.min(r, p.ctx.catalog.platform(id as PlatformId).mobility.rangeKm);
  return Number.isFinite(r) ? r : 0;
}

/**
 * The target where a salvo is worth most: its value times `effect`, the shooter's kill probability
 * against it (0 out of reach). Each claim divides a target's attraction so strikes spread. `targets`
 * is sorted by value and effect is at most 1, so the scan stops once no later target could beat the
 * best found.
 */
export function pickTarget(targets: StrikeTarget[], effect: (t: StrikeTarget) => number): StrikeTarget | undefined {
  let best: StrikeTarget | undefined, bestScore = 0;
  for (const t of targets) {
    if (t.value <= bestScore) break;
    const most = t.value / (1 + t.assigned);
    if (most <= bestScore) continue;
    const score = most * effect(t);
    if (score > bestScore) { bestScore = score; best = t; }
  }
  if (best) best.assigned++;
  return best;
}


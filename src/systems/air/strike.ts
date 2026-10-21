/**
 * Strikes: formations on 'strike' posture (aircraft, missile brigades, drone
 * launchers) deliver munitions at order.target. Standoff weapons launch from outside
 * the defended envelope; penetrating aircraft face enemy fighters and SAMs first.
 * All weapons arriving at a node in a tick form one raid, so mass salvos saturate.
 */
import type { Catalog } from '../../core/catalog';
import type { SimContext } from '../../core/engine';
import type { Formation, FormationId, Munition, MunitionId, NationId, NodeId, Platform, PlatformId, StrikeEffect, TargetClass, World } from '../../core/types';
import { ANTISHIP_KINDS, navalPosition, shipValue, strikeNavalGroup } from '../naval';
import { defendRaid, envelopeExposure, hostileDefenders, overflightKm, samVsAircraft, type RaidStream } from './iads';
import { takeLosses, type LossTally } from './losses';
import { nodeDistance, type AirGroup, type AirPicture } from './picture';
import { visibility } from './combat';
import { emitBattle, hasSupport } from './superiority';
import { spaceSupport } from '../strategic/space';
import { jammedHits } from '../c2';
import { AIRFRAME, ATTRITABLE_COST_USD_M, DRONE_SITE_LAUNCHES_PER_DAY, isRoundOnRail, LAUNCHER, MOBILE_TARGETS, NON_STRIKE_KINDS, STRIKE_ROLES, TARGET_OF_CLASS, TUNING } from './tables';

export interface AirSlice {
  /** Runway capacity per airbase node after cratering, 0..1; absent = intact. */
  runway: Record<number, number>;
  /** Each attacker's battle damage assessment of what it aimed at, by aimKey; absent in older saves. */
  bda?: Record<NationId, Record<string, Assessment>>;
}

/** What a shooter's last raids on one aim achieved, as its sensors and reports show it. */
export interface Assessment {
  /** Tick of the last raid. */
  tick: number;
  /** Raids in a row, up to the last, that left nothing destroyed or damaged. */
  futile: number;
}

/**
 * Joint targeting (JP 3-60) re-attacks an aim only when assessment shows the effect was not
 * achieved and another strike is likely to achieve it. Two raids in a row that all but vanish
 * into the defences (Taiwan's HF-2E salvos on Shanghai; Russia's piecemeal 2022 strikes before
 * it massed them) end the mission; the aim is offered again after REASSESS_DAYS, when stocks of
 * interceptors may have run down (judgment). Raids of attritable weapons are not assessed: they
 * are meant to draw interceptors (ATTRITABLE_COST_USD_M).
 */
export const BDA = { futileRaids: 2, reassessDays: 3 };

/** The key a strike's aim is assessed under: the formation it aims at, else the cell. */
export function aimKey(target: NodeId, formation?: FormationId, tc?: TargetClass): string {
  return formation ?? `${tc === 'power' ? 'g' : 'n'}${target}`;
}

/** Whether `nation`'s assessment of an aim says to stop striking it now. */
export function futileAim(world: World, nation: NationId, key: string, since = -Infinity): boolean {
  const a = world.slices.air?.bda?.[nation]?.[key];
  return !!a && a.futile >= BDA.futileRaids && a.tick >= since && ((world.tick - a.tick) * world.dtHours) / 24 < BDA.reassessDays;
}

function assess(world: World, slice: AirSlice, nation: NationId, key: string, effective: boolean): void {
  const mine = ((slice.bda ??= {})[nation] ??= {});
  const prior = mine[key];
  // Assessment feeds the next day's tasking (the 24-hour ATO cycle), so the raids of one day on an aim count as one.
  const sameDay = !!prior && Math.floor((prior.tick * world.dtHours) / 24) === Math.floor((world.tick * world.dtHours) / 24);
  mine[key] = { tick: world.tick, futile: effective ? 0 : (prior?.futile ?? 0) + (sameDay ? 0 : 1) };
}

/** Sorties (aircraft) or launches (ground launchers) available this tick, and how far the carrier itself goes. */
interface Carrier { platform: Platform; n: number; reachKm: number; group?: AirGroup }

interface Package {
  f: Formation;
  /** Absent for a pure SEAD package (ARMs only). */
  strike?: { munition: Munition; targetClass: TargetClass; weapons: number };
  /** Aircraft that must fly into the defended area (penetrating strikers and SEAD); empty for missiles and standoff. */
  penetrators: AirGroup[];
  /** How far inside the outermost hostile envelope the penetrators release, km. */
  depthKm: number;
}

/** The pk that matters for a target class. Airbase attacks kill parked aircraft as soft targets. */
export function effectPk(m: Munition, tc: TargetClass): number {
  return (tc === 'aircraft' ? m.pk.soft ?? m.pk.structure : tc === 'power' ? m.pk.power ?? m.pk.structure : m.pk[tc]) ?? 0;
}

export function isStrikeMunition(m: Munition): boolean {
  return !NON_STRIKE_KINDS.has(m.kind) && m.yieldKt === undefined;
}

const loadOf = (p: Platform, m: MunitionId) => p.loadout.find((l) => l.munition === m)?.count ?? 0;

/**
 * Rounds of `m` a formation can put in the air per day at surge tempo: sorties x
 * load for aircraft, one round per launch for ground launchers. What a planner
 * budgets against; the tick's actual rate also depends on fuel, runway and fatigue.
 */
export function dailyRounds(f: Formation, m: MunitionId, catalog: Catalog): number {
  let rounds = 0;
  for (const [pid, n] of Object.entries(f.equipment) as [PlatformId, number][]) {
    const p = catalog.platform(pid);
    const load = loadOf(p, m);
    if (n <= 0 || load <= 0) continue;
    if (f.kind === 'air_wing') rounds += n * (AIRFRAME[p.class]?.surgePerDay ?? 0) * load;
    else if (isRoundOnRail(p)) rounds += DRONE_SITE_LAUNCHES_PER_DAY;
    else rounds += n * (LAUNCHER[p.class]?.launchesPerDay ?? 0);
  }
  return rounds * f.readiness;
}

/** Air groups or ground launchers of a striking formation, with how far each can put a weapon. */
function carriersOf(f: Formation, pic: AirPicture, ctx: SimContext, world: World): Carrier[] {
  if (f.kind === 'air_wing')
    return (pic.byFormation.get(f.id) ?? []).filter((g) => STRIKE_ROLES.has(g.profile.role) && g.sorties > 0).map((g) => ({ platform: g.platform, n: g.sorties, reachKm: g.radiusKm, group: g }));
  if (f.kind !== 'missile') return [];
  const out: Carrier[] = [];
  for (const [pid, n] of Object.entries(f.equipment) as [PlatformId, number][]) {
    const platform = ctx.catalog.platform(pid);
    const rate = LAUNCHER[platform.class];
    if (!rate || n <= 0) continue;
    const perDay = isRoundOnRail(platform) ? DRONE_SITE_LAUNCHES_PER_DAY : n * rate.launchesPerDay;
    const expected = perDay * f.readiness * (world.dtHours / 24);
    const launches = Math.floor(expected) + (ctx.rng.chance(expected % 1) ? 1 : 0);
    if (launches > 0) out.push({ platform, n: launches, reachKm: 0 });
  }
  return out;
}

/**
 * Pick the weapon: the order's munition if given, else the cheapest per expected
 * kill among those carried, in the magazine, and in reach. A weapon that does not
 * outrange the defended envelope is charged the share of the launching aircraft
 * the sortie risks (priced with TUNING.airframeLossAversion), so standoff missiles
 * win only where penetrating is dear:
 * Russia's KAB glide bombs (~USD 40k) did the front-line work in 2024-25 while
 * Kh-59/69s (~USD 1M) went to defended rear targets.
 */
function chooseMunition(f: Formation, carriers: Carrier[], tc: TargetClass, dist: number, ringKm: number, rearKm: number, ctx: SimContext): Munition | undefined {
  let best: Munition | undefined, bestCost = Infinity;
  for (const [mid, n] of Object.entries(f.magazine) as [MunitionId, number][]) {
    if (n < 1 || (f.order.munition && f.order.munition !== mid)) continue;
    const m = ctx.catalog.munitions.get(mid);
    const pk = m && isStrikeMunition(m) ? effectPk(m, tc) : 0;
    if (!m || pk <= 0) continue;
    for (const c of carriers) {
      const load = loadOf(c.platform, mid);
      if (load <= 0 || c.reachKm + m.rangeKm < dist) continue;
      if (c.group && rearKm - m.rangeKm > REAR_TOLERANCE_KM && visibility(c.platform.protection.stealth) >= PENETRATOR_VISIBILITY) continue;
      const exposure = TUNING.samExposure.strike * envelopeExposure(ringKm - m.rangeKm) * visibility(c.platform.protection.stealth) ** 2;
      const risk = c.group ? (exposure * c.platform.unitCostUsdM * TUNING.airframeLossAversion) / load : 0;
      const cost = (m.unitCostUsdM + risk) / pk;
      if (cost < bestCost) {
        best = m;
        bestCost = cost;
      }
    }
  }
  return best;
}

/**
 * How far short of the target a weapon must be released to stay out of every
 * hostile envelope, along the line from the shooter's base: a SAM behind the
 * target reaches out its range less its distance from the target, one in front
 * its range plus that distance. A KAB lobbed from 60 km at a front-line cell
 * stays clear of a Patriot battery 120 km behind the line. Enemy fighters holding
 * the target's airspace push the release point further out.
 */
/**
 * Strike aviation releases at most this far past a land front unless it holds the air there or is stealthy, as the
 * planner assumes (ai SamCover): short-range air defences and fighters in the enemy's rear are not in the SAM list but
 * kill as surely. Russian glide bombs reach 40-70 km past the line, and Russian jets do not overfly Poltava (ISW, RUSI 2024).
 */
const REAR_TOLERANCE_KM = 15;
const PENETRATOR_VISIBILITY = 0.1;
/** The line between two 1-degree cells in contact runs about half a cell (~55 km) from each side's cell centres. */
const LINE_OFFSET_KM = 55;
const frontMemo = new WeakMap<World, { tick: number; cells: Map<string, NodeId[]> }>();

/**
 * How far past the land front between `nation`'s side and the holder of `target` the target lies, km; 0 when the
 * target is not enemy ground across a land front (a war across a sea has no rear to cross) or `nation` holds the air over it.
 */
function behindLineKm(world: World, ctx: SimContext, pic: AirPicture, target: NodeId, nation: NationId): number {
  const { map } = ctx;
  const holder = world.control[target];
  if (map.isSea(target) || !holder || !pic.atWar(holder, nation) || world.theater.airControl[target]?.nation === nation) return 0;
  let memo = frontMemo.get(world);
  if (memo?.tick !== world.tick) frontMemo.set(world, (memo = { tick: world.tick, cells: new Map() }));
  const key = `${nation}|${holder}`;
  let front = memo.cells.get(key);
  if (!front) {
    front = [];
    for (let n = 0; n < map.landCount; n++) {
      const c = world.control[n];
      if (!c || pic.atWar(c, nation) || !pic.atWar(c, holder)) continue;
      for (let i = map.adjStart[n]; i < map.adjStart[n + 1]; i++)
        if (map.adj[i] < map.landCount && world.control[map.adj[i]] === holder) { front.push(n as NodeId); break; }
    }
    memo.cells.set(key, front);
  }
  if (!front.length) return 0;
  let km = Infinity;
  for (const n of front) km = Math.min(km, nodeDistance(ctx, n, target));
  return Math.max(0, km - LINE_OFFSET_KM);
}

function threatRingKm(world: World, ctx: SimContext, pic: AirPicture, from: NodeId, target: NodeId, nation: NationId): number {
  let ring = 0;
  const approach = nodeDistance(ctx, from, target);
  for (const d of hostileDefenders(world, ctx, pic, target, nation)) {
    const off = nodeDistance(ctx, d.f.node, target);
    ring = Math.max(ring, d.rangeKm + (nodeDistance(ctx, from, d.f.node) < approach ? off : -off));
  }
  const air = world.theater.airControl[target];
  if (air && pic.atWar(air.nation, nation)) ring = Math.max(ring, TUNING.standoffVsFightersKm);
  return ring;
}

const carriesArm = (g: AirGroup, ctx: SimContext) =>
  g.platform.loadout.some((l) => ctx.catalog.munition(l.munition).kind === 'arm' && (g.f.magazine[l.munition] ?? 0) >= 1);

function planPackage(world: World, ctx: SimContext, pic: AirPicture, f: Formation): Package | undefined {
  const target = f.order.target;
  if (target === undefined) return undefined;
  const carriers = carriersOf(f, pic, ctx, world);
  if (!carriers.length) return undefined;
  const tc = f.order.targetClass ?? 'structure';
  const ship = tc === 'ship' && f.order.targetFormation ? world.formations[f.order.targetFormation] : undefined;
  const dist = nodeDistance(ctx, f.node, ship?.node === target ? navalPosition(ctx.map, ship) : target);
  const ring = threatRingKm(world, ctx, pic, f.node, target, f.nation);
  const m = chooseMunition(f, carriers, tc, dist, ring, behindLineKm(world, ctx, pic, target, f.nation), ctx);
  let weapons = 0;
  const penetrators: AirGroup[] = [];
  for (const c of carriers) {
    // A sortie delivers the full load; a ground launch is one round (the loadout is the launcher's reload capacity).
    const per = !m ? 0 : c.group ? loadOf(c.platform, m.id) : Math.min(1, loadOf(c.platform, m.id));
    const strikes = m !== undefined && per > 0 && c.reachKm + m.rangeKm >= dist;
    if (strikes) weapons += c.n * per;
    const g = c.group;
    if (!g) continue;
    const sead = ring > 0 && dist <= g.radiusKm && carriesArm(g, ctx);
    if (sead || (strikes && m.rangeKm < ring)) penetrators.push(g);
    else if (strikes) g.sorties = 0;
  }
  weapons = m ? Math.min(weapons, Math.floor(f.magazine[m.id] ?? 0)) : 0;
  const strike = m && weapons > 0 ? { munition: m, targetClass: tc, weapons } : undefined;
  const depthKm = ring - (m && m.rangeKm < ring ? m.rangeKm : 0);
  return strike || penetrators.length ? { f, strike, penetrators, depthKm } : undefined;
}

export function resolveStrikes(world: World, ctx: SimContext, pic: AirPicture, slice: AirSlice): void {
  engageLandings(world, ctx, pic);
  const raids = new Map<string, Package[]>();
  for (const f of Object.values(world.formations)) {
    if (f.status !== 'active' || f.order.posture !== 'strike' || !hostileTarget(world, pic, f)) continue;
    if (futileAim(world, f.nation, aimKey(f.order.target!, f.order.targetFormation, f.order.targetClass), f.order.issuedTick)) continue;
    const p = planPackage(world, ctx, pic, f);
    if (!p) continue;
    const key = `${f.order.target}|${f.nation}`;
    const list = raids.get(key);
    if (list) list.push(p);
    else raids.set(key, [p]);
  }
  for (const [key, pkgs] of raids) {
    const [t, attacker] = key.split('|');
    resolveRaid(world, ctx, pic, slice, Number(t) as NodeId, attacker as NationId, pkgs);
  }
}

/**
 * A coastal anti-ship battery standing on 'defend' holds pre-delegated authority to fire on an
 * invasion fleet putting troops onto a friendly shore it can reach, without waiting for the
 * next tasking: the lift lies off the beaches for hours, not days (CSIS 2023: Taiwan's shore-based
 * anti-ship missiles were among the main killers of PLA lift; the delegation is judgment).
 */
function engageLandings(world: World, ctx: SimContext, pic: AirPicture): void {
  // Lift off a beach: a group with troops aboard whose position lies on a land cell. A warship
  // standing off a port it is bound for carries none.
  const laden = new Set<FormationId>();
  for (const e of Object.values(world.formations)) if (e.status === 'embarked' && e.embarkedOn) laden.add(e.embarkedOn);
  const landing: { g: Formation; at: NodeId }[] = [];
  for (const id of laden) {
    const g = world.formations[id];
    if (g?.kind !== 'surface_group' || g.status !== 'active') continue;
    const at = navalPosition(ctx.map, g);
    if (!ctx.map.isSea(at) && world.control[at]) landing.push({ g, at });
  }
  if (!landing.length) return;
  for (const f of Object.values(world.formations)) {
    if (f.kind !== 'missile' || f.status !== 'active' || f.order.posture !== 'defend') continue;
    let reach = 0;
    for (const [id, n] of Object.entries(f.magazine)) {
      const m = ctx.catalog.munition(id as MunitionId);
      if (n >= 1 && ANTISHIP_KINDS.has(m.kind)) reach = Math.max(reach, m.rangeKm);
    }
    if (!reach) continue;
    let best: Formation | undefined, bestKm = reach;
    for (const { g, at } of landing) {
      const shore = world.control[at];
      if (!pic.atWar(g.nation, f.nation) || !(shore === f.nation || (pic.atWar(shore, g.nation) && !pic.atWar(shore, f.nation)))) continue;
      const d = nodeDistance(ctx, f.node, at);
      if (d <= bestKm) { bestKm = d; best = g; }
    }
    if (best) f.order = { posture: 'strike', target: best.node, targetClass: 'ship', targetFormation: best.id, issuedTick: world.tick };
  }
}

/**
 * Whether a strike order still points at a nation its formation is at war with: the formation it
 * aims at, else whoever holds the target cell, else (at sea, or a wing on a third nation's base)
 * any enemy formation there. An order left standing after a peace or ceasefire fires nothing.
 */
function hostileTarget(world: World, pic: AirPicture, f: Formation): boolean {
  const aimed = f.order.targetFormation ? world.formations[f.order.targetFormation] : undefined;
  if (aimed) return pic.atWar(aimed.nation, f.nation);
  const t = f.order.target!;
  const owner = world.control[t];
  if (owner && pic.atWar(owner, f.nation)) return true;
  return (pic.atNode.get(t) ?? []).some((g) => pic.atWar(g.nation, f.nation));
}

function resolveRaid(world: World, ctx: SimContext, pic: AirPicture, slice: AirSlice, target: NodeId, attacker: NationId, pkgs: Package[]) {
  const tally: LossTally = {};
  const ew = hasSupport(ctx, pic, target, attacker, 'ew');
  for (const p of pkgs) if (p.penetrators.length) suppressDefenses(world, ctx, pic, target, p);

  for (const p of pkgs) {
    if (!p.penetrators.length) continue;
    const sent = p.penetrators.reduce((s, g) => s + g.sorties, 0);
    const air = world.theater.airControl[target];
    const flights = p.penetrators.map((g) => {
      let n = g.sorties;
      if (air && pic.atWar(air.nation, attacker)) {
        n -= ctx.rng.binomial(n, air.level * TUNING.enemyAirAbort);
        n -= takeLosses(world, ctx, g.f, g.pid, ctx.rng.binomial(n, air.level * TUNING.enemyAirLoss), TUNING.damagedShare, tally);
      }
      g.sorties = 0;
      return { g, n };
    });
    const lost = samVsAircraft(world, ctx, pic, target, attacker, flights, 'strike', ew, tally, envelopeExposure(p.depthKm));
    const delivered = flights.reduce((s, x, i) => s + x.n - lost[i], 0);
    if (p.strike) p.strike.weapons = sent ? Math.floor((p.strike.weapons * delivered) / sent) : 0;
  }

  const all = pkgs.flatMap((p) => (p.strike && p.strike.weapons > 0 ? [{ f: p.f, ...p.strike }] : []));
  const live = all.filter((p) => p.targetClass !== 'ship');
  for (const p of live) p.f.magazine[p.munition.id] -= p.weapons;
  strikeShips(world, ctx, pic, slice, target, attacker, all.filter((p) => p.targetClass === 'ship'));
  const streams: RaidStream[] = live.map((p) => ({ munition: p.munition, count: p.weapons, overflightKm: overflightKm(world, ctx, pic, p.f.node, target, attacker) }));
  const leaked = defendRaid(world, ctx, pic, target, attacker, streams);
  live.forEach((p, i) => {
    const flightMin = nodeDistance(ctx, p.f.node, target) / (Math.max(0.05, p.munition.speedMach) * MACH_KM_PER_MIN);
    const { effects, effective } = applyEffect(world, ctx, pic, slice, target, attacker, p.munition, p.targetClass, leaked[i], tally, flightMin, p.f.order.targetFormation);
    if (p.munition.unitCostUsdM >= ATTRITABLE_COST_USD_M) assess(world, slice, attacker, aimKey(target, p.f.order.targetFormation, p.targetClass), effective);
    ctx.emit({ type: 'strike', tick: world.tick, by: attacker, munition: p.munition.id, fired: p.weapons, intercepted: p.weapons - leaked[i], target, effects });
  });
  emitBattle(world, ctx, pic, target, attacker, tally);
}

/**
 * Weapons aimed at ships go through the naval salvo model (Hughes): the target task force's
 * pooled area defence, point defence and staying power, the same as ship-launched salvos.
 * Packages aimed at the same group with the same weapon arrive as one salvo. A weapon without
 * a terminal seeker can only hit a group lying in its home port; at sea it has moved on by
 * the time the weapon arrives (see naval ANTISHIP_KINDS). With nothing to hit, the shooter
 * holds its rounds.
 */
function strikeShips(world: World, ctx: SimContext, pic: AirPicture, slice: AirSlice, node: NodeId, attacker: NationId, pkgs: { f: Formation; munition: Munition; weapons: number }[]): void {
  const salvos = new Map<string, { target: Formation; munition: Munition; count: number }>();
  for (const p of pkgs) {
    const target = shipTarget(world, ctx, pic, node, attacker, p.f.order.targetFormation);
    if (!target) continue;
    if (!ANTISHIP_KINDS.has(p.munition.kind) && (target.node !== target.home || target.order.path?.length)) continue;
    p.f.magazine[p.munition.id] -= p.weapons;
    const key = `${target.id}|${p.munition.id}`;
    const s = salvos.get(key);
    if (s) s.count += p.weapons;
    else salvos.set(key, { target, munition: p.munition, count: p.weapons });
  }
  for (const s of salvos.values()) {
    const effective = !!strikeNavalGroup(world, ctx, attacker, s.munition.id, s.count, s.target.id)?.hits.length;
    if (s.munition.unitCostUsdM >= ATTRITABLE_COST_USD_M) assess(world, slice, attacker, aimKey(node, s.target.id), effective);
  }
}

/** The aimed surface group if it is still at the node, else the most valuable hostile surface group there. */
function shipTarget(world: World, ctx: SimContext, pic: AirPicture, node: NodeId, attacker: NationId, aimed: FormationId | undefined): Formation | undefined {
  const ok = (f: Formation | undefined): f is Formation => !!f && f.status === 'active' && f.kind === 'surface_group' && f.node === node && pic.atWar(f.nation, attacker);
  const a = aimed ? world.formations[aimed] : undefined;
  if (ok(a)) return a;
  let best: Formation | undefined, bestValue = 0;
  for (const f of pic.atNode.get(node) ?? []) {
    if (!ok(f)) continue;
    const v = shipValue(world, ctx, f);
    if (v > bestValue) { bestValue = v; best = f; }
  }
  return best;
}

/**
 * SEAD: aircraft carrying anti-radiation missiles fire them at the SAMs covering the
 * target before the strike goes in. Each ARM forces radars off the air for the raid
 * (suppression) and occasionally kills a launcher. Desert Storm: ~2,000 HARMs fired,
 * Iraqi SAM radar emissions fell ~90 % within days while few sites were destroyed.
 */
function suppressDefenses(world: World, ctx: SimContext, pic: AirPicture, target: NodeId, p: Package) {
  const defenders = hostileDefenders(world, ctx, pic, target, p.f.nation);
  if (!defenders.length) return;
  for (const [mid, have] of Object.entries(p.f.magazine) as [MunitionId, number][]) {
    const arm = ctx.catalog.munitions.get(mid);
    if (!arm || arm.kind !== 'arm' || have < 1) continue;
    const carried = p.penetrators.reduce((s, g) => s + g.sorties * loadOf(g.platform, mid), 0);
    const shots = Math.min(Math.floor(have), carried);
    if (!shots) continue;
    p.f.magazine[mid] -= shots;
    const each = Math.floor(shots / defenders.length), extra = shots % defenders.length;
    defenders.forEach((d, i) => {
      const n = each + (i < extra ? 1 : 0);
      if (!n) return;
      d.channels *= 1 - Math.min(TUNING.maxArmSuppression, n * TUNING.armSuppressionPerShot);
      const kills = ctx.rng.binomial(n, (arm.pk.soft ?? 0.5) * TUNING.armPkFactor);
      const radar = (Object.keys(d.f.equipment) as PlatformId[]).find((pid) => ctx.catalog.platform(pid).engagementChannels && d.f.equipment[pid] > 0);
      if (radar && kills) takeLosses(world, ctx, d.f, radar, kills);
    });
    ctx.emit({ type: 'strike', tick: world.tick, by: p.f.nation, munition: mid, fired: shots, intercepted: 0, target, effects: [{ kind: 'sam_suppressed', sites: defenders.length }] });
  }
}

const MACH_KM_PER_MIN = 20.4;

/**
 * Chance a weapon aimed at a mobile unit (SAM battery, launcher, troops) in a
 * 1-degree cell finds it: only a share of aimpoints is current, and the unit may
 * move while the weapon flies (shoot-and-scoot SAM and MLRS crews relocate within
 * the hour). A Shahed flying three hours rarely finds a battery; an Iskander
 * arriving in five minutes often does. Loitering munitions search with their own
 * seeker and are exempt. Fixed targets (structures, parked aircraft) are always
 * where they were.
 */
function stillThere(m: Munition, tc: TargetClass, flightMin: number): number {
  if (!MOBILE_TARGETS.has(tc) || m.kind === 'loitering') return 1;
  return TUNING.mobileTargetLocated * Math.exp(-flightMin / TUNING.mobileTargetDwellMin);
}

interface Victim { f: Formation; pid: PlatformId; /** Detectability relative to a vehicle in the open, 0..1. */ seen: number }

/**
 * Concealment below which a mobile platform is found as readily as any vehicle in the open:
 * tanks, IFVs, SP guns and SAM radars (stealth 0.1 in the catalog's land defaults).
 */
const OPEN_STEALTH = 0.1;

/**
 * Hostile platforms at the node a strike of class `tc` can kill. A strike on mobile forces aimed
 * at a formation hits only that formation: the aimpoints are its located vehicles, not the dug-in
 * or dispersed units elsewhere in a 1-degree cell, and a formation that has left the cell is
 * missed. Each mobile platform carries its detectability relative to a vehicle in the open; it
 * weights which platform a kill falls on and scales the kill chance, so a camouflaged TEL
 * (Neptune, stealth 0.35) survives more often than its radar. Parked aircraft and fixed sites
 * are not hidden by signature.
 */
function victims(ctx: SimContext, pic: AirPicture, target: NodeId, attacker: NationId, tc: TargetClass, aimed: FormationId | undefined): Victim[] {
  const mobile = MOBILE_TARGETS.has(tc);
  const out: Victim[] = [];
  for (const f of pic.atNode.get(target) ?? []) {
    if (f.status !== 'active' || !pic.atWar(f.nation, attacker) || (mobile && aimed && f.id !== aimed)) continue;
    if (tc === 'aircraft' && f.kind !== 'air_wing' && f.kind !== 'strategic') continue;
    for (const pid of Object.keys(f.equipment) as PlatformId[]) {
      const platform = ctx.catalog.platform(pid);
      if (f.equipment[pid] > 0 && TARGET_OF_CLASS[platform.class] === tc) out.push({ f, pid, seen: mobile ? visibility(Math.max(0, platform.protection.stealth - OPEN_STEALTH)) : 1 });
    }
  }
  return out;
}

/** Apply the weapons that got through. Returns what they did for the strike event, and whether anything was destroyed or damaged. */
function applyEffect(world: World, ctx: SimContext, pic: AirPicture, slice: AirSlice, target: NodeId, attacker: NationId, m: Munition, tc: TargetClass, hits: number, tally: LossTally, flightMin: number, aimed: FormationId | undefined): { effects: StrikeEffect[]; effective: boolean } {
  if (hits <= 0) return { effects: [{ kind: 'no_effect', why: 'all_intercepted' }], effective: false };
  hits = jammedHits(world, target, attacker, m, hits);
  if (tc === 'structure' || tc === 'hardened') {
    const owner = world.control[target];
    if (!owner || !pic.atWar(owner, attacker)) return { effects: [{ kind: 'no_effect', why: 'not_hostile' }], effective: false };
    const infra = world.theater.infrastructure;
    const before = infra[target];
    const perHit = TUNING.structurePerHit * effectPk(m, tc) * spaceSupport(world, attacker, m, false) * (m.warheadKg / 450) ** (2 / 3);
    infra[target] = before * (1 - Math.min(0.5, perHit)) ** hits;
    return { effects: [{ kind: 'infrastructure', before, after: infra[target] }], effective: infra[target] < before };
  }
  if (tc === 'power') {
    const owner = world.control[target];
    if (!owner || !pic.atWar(owner, attacker)) return { effects: [{ kind: 'no_effect', why: 'not_hostile' }], effective: false };
    const grid = (world.theater.power ??= {});
    const before = grid[target] ?? 1;
    const perHit = TUNING.powerPerHit * effectPk(m, tc) * spaceSupport(world, attacker, m, false) * (m.warheadKg / 450) ** (2 / 3);
    grid[target] = before * (1 - Math.min(0.5, perHit)) ** hits;
    return { effects: [{ kind: 'grid', before, after: grid[target] }], effective: grid[target] < before };
  }
  let cratered = false;
  let p = effectPk(m, tc) * stillThere(m, tc, flightMin) * spaceSupport(world, attacker, m, MOBILE_TARGETS.has(tc));
  const effects: StrikeEffect[] = [];
  if (tc === 'aircraft') {
    p = (1 - TUNING.shelteredShare) * p + TUNING.shelteredShare * (m.pk.hardened ?? 0);
    if (!ctx.map.isSea(target)) {
      const r = slice.runway[target] ?? 1;
      slice.runway[target] = Math.max(0, r * (1 - TUNING.runwayPerHit * (m.pk.structure ?? 0)) ** hits);
      cratered = slice.runway[target] < r;
      effects.push({ kind: 'runway', before: r, after: slice.runway[target] });
    }
  }
  const pool = victims(ctx, pic, target, attacker, tc, aimed);
  let left = pool.reduce((s, v) => s + v.f.equipment[v.pid], 0);
  if (tc === 'aircraft') p *= Math.min(1, left / TUNING.packedRampAircraft);
  if (MOBILE_TARGETS.has(tc) && left) p *= pool.reduce((s, v) => s + v.f.equipment[v.pid] * v.seen, 0) / left;
  const kills = ctx.rng.binomial(hits, p);
  const picked = new Map<Victim, number>();
  const weight = (v: Victim) => (v.f.equipment[v.pid] - (picked.get(v) ?? 0)) * v.seen;
  for (let k = 0; k < kills && left > 0; k++, left--) {
    let r = ctx.rng.next() * pool.reduce((s, v) => s + weight(v), 0), i = 0;
    while (i < pool.length - 1 && r >= weight(pool[i])) {
      r -= weight(pool[i]);
      i++;
    }
    picked.set(pool[i], (picked.get(pool[i]) ?? 0) + 1);
  }
  const killed: Partial<Record<PlatformId, number>> = {};
  for (const [v, n] of picked) killed[v.pid] = (killed[v.pid] ?? 0) + takeLosses(world, ctx, v.f, v.pid, n, TUNING.damagedShare, tally);
  const hit = Object.keys(killed).length > 0;
  effects.push(hit ? { kind: 'losses', platforms: killed } : { kind: 'no_effect', why: 'no_targets' });
  return { effects, effective: cratered || hit };
}

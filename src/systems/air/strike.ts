/**
 * Strikes: formations on 'strike' posture (aircraft, missile brigades, drone
 * launchers) deliver munitions at order.target. Standoff weapons launch from outside
 * the defended envelope; penetrating aircraft face enemy fighters and SAMs first.
 * All weapons arriving at a node in a tick form one raid, so mass salvos saturate.
 */
import type { SimContext } from '../../core/engine';
import type { Formation, Munition, MunitionId, NationId, NodeId, Platform, PlatformId, TargetClass, World } from '../../core/types';
import { defendRaid, hostileDefenders, samVsAircraft, type RaidStream } from './iads';
import { takeLosses, type LossTally } from './losses';
import { nodeDistance, type AirGroup, type AirPicture } from './picture';
import { emitBattle, hasSupport } from './superiority';
import { LAUNCHER, NON_STRIKE_KINDS, STRIKE_ROLES, TARGET_OF_CLASS, TUNING } from './tables';

export interface AirSlice {
  /** Runway capacity per airbase node after cratering, 0..1; absent = intact. */
  runway: Record<number, number>;
}

interface Carrier { platform: Platform; n: number; reachKm: number; group?: AirGroup }

interface Package {
  f: Formation;
  munition: Munition;
  targetClass: TargetClass;
  weapons: number;
  /** Delivering aircraft that must fly into the defended area; empty for missiles and standoff. */
  penetrators: AirGroup[];
}

/** The pk that matters for a target class. Airbase attacks kill parked aircraft as soft targets. */
export function effectPk(m: Munition, tc: TargetClass): number {
  return (tc === 'aircraft' ? m.pk.soft ?? m.pk.structure : m.pk[tc]) ?? 0;
}

export function isStrikeMunition(m: Munition): boolean {
  return !NON_STRIKE_KINDS.has(m.kind) && m.yieldKt === undefined;
}

const loadOf = (p: Platform, m: MunitionId) => p.loadout.find((l) => l.munition === m)?.count ?? 0;

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
    const expected = n * rate.launchesPerDay * f.readiness * (world.dtHours / 24);
    const launches = Math.floor(expected) + (ctx.rng.chance(expected % 1) ? 1 : 0);
    if (launches > 0) out.push({ platform, n: launches, reachKm: 0 });
  }
  return out;
}

/**
 * Pick the weapon: the order's munition if given, else the one with the best pk
 * against the target class among those carried, in the magazine, and in reach,
 * preferring weapons that outrange the defended envelope (standoff), then cheaper.
 */
function chooseMunition(f: Formation, carriers: Carrier[], tc: TargetClass, dist: number, ringKm: number, ctx: SimContext): Munition | undefined {
  let best: Munition | undefined, bestScore = 0;
  for (const [mid, n] of Object.entries(f.magazine) as [MunitionId, number][]) {
    if (n < 1 || (f.order.munition && f.order.munition !== mid)) continue;
    const m = ctx.catalog.munitions.get(mid);
    if (!m || !isStrikeMunition(m)) continue;
    if (!carriers.some((c) => loadOf(c.platform, mid) > 0 && c.reachKm + m.rangeKm >= dist)) continue;
    const score = effectPk(m, tc) * (m.rangeKm >= ringKm ? 1 : 0.6);
    if (score > bestScore || (score === bestScore && best && m.unitCostUsdM < best.unitCostUsdM)) {
      best = m;
      bestScore = score;
    }
  }
  return best;
}

/** Furthest a hostile defense reaches out from the target: SAM envelopes, or enemy fighters holding the air. */
function threatRingKm(world: World, ctx: SimContext, pic: AirPicture, target: NodeId, nation: NationId): number {
  let ring = 0;
  for (const d of hostileDefenders(world, ctx, pic, target, nation)) ring = Math.max(ring, d.rangeKm);
  const air = world.theater.airControl[target];
  if (air && pic.atWar(air.nation, nation)) ring = Math.max(ring, TUNING.standoffVsFightersKm);
  return ring;
}

function planPackage(world: World, ctx: SimContext, pic: AirPicture, f: Formation): Package | undefined {
  const target = f.order.target;
  if (target === undefined) return undefined;
  const carriers = carriersOf(f, pic, ctx, world);
  if (!carriers.length) return undefined;
  const tc = f.order.targetClass ?? 'structure';
  const dist = nodeDistance(ctx, f.node, target);
  const ring = threatRingKm(world, ctx, pic, target, f.nation);
  const m = chooseMunition(f, carriers, tc, dist, ring, ctx);
  if (!m) return undefined;
  let weapons = 0;
  const penetrators: AirGroup[] = [];
  for (const c of carriers) {
    const per = loadOf(c.platform, m.id);
    if (!per || c.reachKm + m.rangeKm < dist) continue;
    weapons += c.n * per;
    if (c.group) {
      if (m.rangeKm < ring) penetrators.push(c.group);
      else c.group.sorties = 0;
    }
  }
  weapons = Math.min(weapons, Math.floor(f.magazine[m.id] ?? 0));
  return weapons > 0 ? { f, munition: m, targetClass: tc, weapons, penetrators } : undefined;
}

export function resolveStrikes(world: World, ctx: SimContext, pic: AirPicture, slice: AirSlice): void {
  const raids = new Map<string, Package[]>();
  for (const f of Object.values(world.formations)) {
    if (f.status !== 'active' || f.order.posture !== 'strike') continue;
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
    const lost = samVsAircraft(world, ctx, pic, target, attacker, flights, 'strike', ew, tally);
    const delivered = flights.reduce((s, x, i) => s + x.n - lost[i], 0);
    p.weapons = sent ? Math.floor((p.weapons * delivered) / sent) : 0;
  }

  const live = pkgs.filter((p) => p.weapons > 0);
  for (const p of live) p.f.magazine[p.munition.id] -= p.weapons;
  const streams: RaidStream[] = live.map((p) => ({ munition: p.munition, count: p.weapons }));
  const leaked = defendRaid(world, ctx, pic, target, attacker, streams);
  live.forEach((p, i) => {
    const damage = applyEffect(world, ctx, pic, slice, target, attacker, p.munition, p.targetClass, leaked[i], tally);
    ctx.emit({ type: 'strike', tick: world.tick, by: attacker, munition: p.munition.id, fired: p.weapons, intercepted: p.weapons - leaked[i], target, damage });
  });
  emitBattle(world, ctx, target, attacker, world.control[target] || attacker, tally);
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
    ctx.emit({ type: 'strike', tick: world.tick, by: p.f.nation, munition: mid, fired: shots, intercepted: 0, target, damage: `SEAD on ${defenders.length} SAM sites` });
  }
}

/** Apply the weapons that got through. Returns a short damage report for the strike event. */
function applyEffect(world: World, ctx: SimContext, pic: AirPicture, slice: AirSlice, target: NodeId, attacker: NationId, m: Munition, tc: TargetClass, hits: number, tally: LossTally): string {
  if (hits <= 0) return 'no hits';
  if (tc === 'structure' || tc === 'hardened') {
    const owner = world.control[target];
    if (!owner || !pic.atWar(owner, attacker)) return 'no hostile infrastructure';
    const infra = world.theater.infrastructure;
    const before = infra[target];
    const perHit = TUNING.structurePerHit * effectPk(m, tc) * (m.warheadKg / 450) ** (2 / 3);
    infra[target] = before * (1 - Math.min(0.5, perHit)) ** hits;
    return `infrastructure ${before.toFixed(3)} -> ${infra[target].toFixed(3)}`;
  }
  const victims = (match: (f: Formation, pid: PlatformId) => boolean) => {
    const out: { f: Formation; pid: PlatformId }[] = [];
    for (const f of pic.atNode.get(target) ?? [])
      if (f.status === 'active' && pic.atWar(f.nation, attacker))
        for (const pid of Object.keys(f.equipment) as PlatformId[]) if (f.equipment[pid] > 0 && match(f, pid)) out.push({ f, pid });
    return out;
  };
  let p = effectPk(m, tc);
  const parts: string[] = [];
  if (tc === 'aircraft') {
    p = (1 - TUNING.shelteredShare) * p + TUNING.shelteredShare * (m.pk.hardened ?? 0);
    if (!ctx.map.isSea(target)) {
      const r = slice.runway[target] ?? 1;
      slice.runway[target] = Math.max(0, r * (1 - TUNING.runwayPerHit * (m.pk.structure ?? 0)) ** hits);
      parts.push(`runway ${r.toFixed(2)} -> ${slice.runway[target].toFixed(2)}`);
    }
  }
  const pool = victims((f, pid) => TARGET_OF_CLASS[ctx.catalog.platform(pid).class] === tc && (tc !== 'aircraft' || f.kind === 'air_wing'));
  const kills = ctx.rng.binomial(hits, p);
  const picked = new Map<{ f: Formation; pid: PlatformId }, number>();
  let left = pool.reduce((s, v) => s + v.f.equipment[v.pid], 0);
  for (let k = 0; k < kills && left > 0; k++, left--) {
    let r = ctx.rng.next() * left, i = 0;
    const remaining = (v: (typeof pool)[number]) => v.f.equipment[v.pid] - (picked.get(v) ?? 0);
    while (i < pool.length - 1 && r >= remaining(pool[i])) {
      r -= remaining(pool[i]);
      i++;
    }
    picked.set(pool[i], (picked.get(pool[i]) ?? 0) + 1);
  }
  const killed: Record<string, number> = {};
  for (const [v, n] of picked) killed[v.pid] = (killed[v.pid] ?? 0) + takeLosses(world, ctx, v.f, v.pid, n, TUNING.damagedShare, tally);
  const list = Object.entries(killed).map(([pid, n]) => `${pid} ${n}`);
  parts.push(list.length ? `hit ${list.join(', ')}` : `no ${tc} targets hit`);
  return parts.join('; ');
}

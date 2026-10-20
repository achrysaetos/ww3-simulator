/**
 * Integrated air defense: SAM and ship defenders cover every node within their
 * interceptor range, fighters on alert add an outer layer against air-breathing
 * threats, and every engagement runs through interceptSalvo so channels saturate
 * and magazines run dry.
 */
import type { SimContext } from '../../core/engine';
import type { Formation, Munition, MunitionId, NationId, NodeId, World } from '../../core/types';
import { visibility } from './combat';
import { interceptSalvo } from './intercept';
import { takeLosses, type LossTally } from './losses';
import { nodeDistance, type AirGroup, type AirPicture, type Defender } from './picture';
import { COUNTER_AIR_POSTURES, COVERAGE_SHARE, INTERCEPTOR_ENGAGES, THREAT_OF_KIND, TUNING, type ThreatCategory } from './tables';

interface Shot { m: Munition; pk: number }

function pkAgainst(m: Munition, cat: ThreatCategory): number {
  if (cat === 'aircraft') return m.pk.aircraft ?? 0;
  if (cat === 'air_breathing') return m.pk.missile ?? (m.pk.aircraft ?? 0) * 0.8;
  return m.pk.missile ?? 0;
}

/**
 * The interceptor a defender commits: the cheapest round with an effective pk of at
 * least 0.3, else the best it has. A battery with only PAC-3s spends them on drones,
 * which is how magazines run dry against Shahed raids.
 */
export function pickInterceptor(f: Formation, cat: ThreatCategory, difficulty: number, distKm: number, ctx: SimContext): Shot | undefined {
  let cheap: Shot | undefined, best: Shot | undefined;
  for (const [mid, n] of Object.entries(f.magazine)) {
    if (n < 1) continue;
    const m = ctx.catalog.munitions.get(mid as MunitionId);
    if (!m || !INTERCEPTOR_ENGAGES[m.kind]?.includes(cat) || m.rangeKm * COVERAGE_SHARE[cat] < distKm) continue;
    const pk = pkAgainst(m, cat);
    const eff = pk * (1 - difficulty);
    if (eff <= 0) continue;
    if (eff >= 0.3 && (!cheap || m.unitCostUsdM < cheap.m.unitCostUsdM)) cheap = { m, pk };
    if (!best || eff > best.pk * (1 - difficulty)) best = { m, pk };
  }
  return cheap ?? best;
}

/** Defenders hostile to `nation` whose envelope reaches `node`, outer layer (longest range) first. */
export function hostileDefenders(world: World, ctx: SimContext, pic: AirPicture, node: NodeId, nation: NationId): Defender[] {
  const key = `${node}|${nation}`;
  let inRange = pic.defendersInRange.get(key);
  if (!inRange) {
    inRange = pic.defenders.filter((d) => pic.atWar(d.f.nation, nation) && nodeDistance(ctx, d.f.node, node) <= d.rangeKm).sort((a, b) => b.rangeKm - a.rangeKm);
    pic.defendersInRange.set(key, inRange);
  }
  return inRange.filter((d) => d.f.status === 'active' && d.channels > 0);
}

/** One defender engages `count` threats; spends its channels and interceptors. Returns survivors. */
function engage(ctx: SimContext, d: Defender, node: NodeId, cat: ThreatCategory, threat: { count: number; speedMach: number; interceptDifficulty: number }): number {
  const dist = nodeDistance(ctx, d.f.node, node);
  const shot = pickInterceptor(d.f, cat, threat.interceptDifficulty, dist, ctx);
  if (!shot) return threat.count;
  const r = interceptSalvo(threat, { channels: d.channels, interceptors: d.f.magazine[shot.m.id], pk: shot.pk, rangeKm: shot.m.rangeKm * COVERAGE_SHARE[cat] }, ctx.rng);
  d.channels -= r.channelsUsed;
  d.f.magazine[shot.m.id] -= r.interceptorsUsed;
  return r.leaked;
}

/** Fighters of nations at war with `attacker` that can reach `node` and still have intercept sorties. */
function interceptorFighters(world: World, ctx: SimContext, pic: AirPicture, node: NodeId, attacker: NationId): AirGroup[] {
  return pic.groups.filter(
    (g) =>
      g.interceptLeft > 0 &&
      g.f.status === 'active' &&
      (g.f.order.posture === 'defend' || (COUNTER_AIR_POSTURES.has(g.f.order.posture) && g.f.order.target === node)) &&
      pic.atWar(g.f.nation, attacker) &&
      nodeDistance(ctx, g.f.node, node) <= g.radiusKm,
  );
}

export interface RaidStream { munition: Munition; count: number }

/**
 * Layered defense of `node` against one attacker's weapons arriving this tick.
 * Slow threats are engaged first: drones arrive with the missiles and soak up
 * channels and interceptors, the tactic Russia used against Ukraine from 2022.
 * Returns the number that leak, per stream.
 */
export function defendRaid(world: World, ctx: SimContext, pic: AirPicture, node: NodeId, attacker: NationId, streams: RaidStream[]): number[] {
  const leaked = streams.map((s) => s.count);
  const order = streams.map((_, i) => i).sort((a, b) => streams[a].munition.speedMach - streams[b].munition.speedMach);
  const sams = hostileDefenders(world, ctx, pic, node, attacker);
  const fighters = interceptorFighters(world, ctx, pic, node, attacker);
  for (const i of order) {
    const m = streams[i].munition;
    const cat = threatCategory(m);
    if (!cat) continue;
    const threat = { speedMach: m.speedMach, interceptDifficulty: m.interceptDifficulty };
    if (cat === 'air_breathing')
      for (const g of fighters) {
        if (!leaked[i]) break;
        const aam = pic.aamOf(g.f);
        if (!aam || g.interceptLeft <= 0) continue;
        const r = interceptSalvo({ ...threat, count: leaked[i] }, { channels: g.interceptLeft, interceptors: g.f.magazine[aam.id] ?? 0, pk: pkAgainst(aam, cat), rangeKm: aam.rangeKm }, ctx.rng);
        g.interceptLeft -= r.channelsUsed;
        g.f.magazine[aam.id] -= r.interceptorsUsed;
        leaked[i] = r.leaked;
      }
    for (const d of sams) {
      if (!leaked[i]) break;
      if (d.channels > 0) leaked[i] = engage(ctx, d, node, cat, { ...threat, count: leaked[i] });
    }
  }
  return leaked;
}

export function threatCategory(m: Munition): ThreatCategory | null {
  return THREAT_OF_KIND[m.kind];
}

export interface ExposedFlight { g: AirGroup; n: number }

/**
 * SAMs covering `node` engage aircraft of `nation` flying there. Only a share of
 * sorties ever gets inside a SAM's envelope with a firing solution; stealth shrinks
 * that share by visibility squared (detection area). Returns losses per flight.
 */
export function samVsAircraft(world: World, ctx: SimContext, pic: AirPicture, node: NodeId, nation: NationId, flights: ExposedFlight[], mission: 'strike' | 'counter_air', ewSupport: boolean, tally: LossTally): number[] {
  const sams = hostileDefenders(world, ctx, pic, node, nation);
  if (!sams.length) return flights.map(() => 0);
  const evasion = ewSupport ? TUNING.aircraftEvasionWithEw : TUNING.aircraftEvasion;
  return flights.map(({ g, n }) => {
    let exposed = ctx.rng.binomial(n, TUNING.samExposure[mission] * visibility(g.platform.protection.stealth) ** 2);
    const before = exposed;
    for (const d of sams) {
      if (!exposed) break;
      if (d.channels > 0) exposed = engage(ctx, d, node, 'aircraft', { count: exposed, speedMach: g.platform.mobility.speedKph / 1235, interceptDifficulty: evasion });
    }
    const killed = before - exposed;
    return takeLosses(world, ctx, g.f, g.pid, killed, TUNING.damagedShare, tally);
  });
}

/** How strongly hostile SAM coverage denies `nation` the air over `node`, 0..maxSamDenial. */
export function samDenial(world: World, ctx: SimContext, pic: AirPicture, node: NodeId, nation: NationId, meanStealth: number): number {
  let ch = 0;
  for (const d of hostileDefenders(world, ctx, pic, node, nation)) ch += d.channels;
  return Math.min(TUNING.maxSamDenial, (ch * visibility(meanStealth) ** 2) / TUNING.samDenialChannels);
}

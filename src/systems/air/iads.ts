/**
 * Integrated air defense: SAM and ship defenders cover every node within their
 * interceptor range, fighters on alert add an outer layer against air-breathing
 * threats, and every engagement runs through interceptSalvo so channels saturate
 * and magazines run dry.
 */
import type { SimContext } from '../../core/engine';
import type { Formation, Munition, MunitionId, NationId, NodeId, World } from '../../core/types';
import { visibility } from './combat';
import { interceptSalvo, type ShotDoctrine } from './intercept';
import { takeLosses, type LossTally } from './losses';
import { nodeDistance, type AirGroup, type AirPicture, type Defender } from './picture';
import { AAM_VS_DRONE_FACTOR, beltKillProbability, COUNTER_AIR_POSTURES, COUNTER_DRONE, coverageShare, engages, THREAT_OF_KIND, TUNING, type ThreatCategory } from './tables';

interface Shot { m: Munition; pk: number }

function pkAgainst(m: Munition, cat: ThreatCategory): number {
  if (cat === 'aircraft') return m.pk.aircraft ?? 0;
  if (cat === 'air_breathing') return m.pk.missile ?? Math.min(0.9, (m.pk.aircraft ?? 0) * (m.kind === 'aam' ? AAM_VS_DRONE_FACTOR() : 0.8));
  return m.pk.missile ?? 0;
}

/**
 * The interceptor a defender commits: the cheapest round with an effective pk of at
 * least 0.3, else the best it has, among rounds costing at most `maxCostUsdM`.
 */
function pickInterceptor(f: Formation, cat: ThreatCategory, difficulty: number, distKm: number, maxCostUsdM: number, ctx: SimContext): Shot | undefined {
  let cheap: Shot | undefined, best: Shot | undefined;
  for (const [mid, n] of Object.entries(f.magazine)) {
    if (n < 1) continue;
    const m = ctx.catalog.munitions.get(mid as MunitionId);
    if (!m || m.unitCostUsdM > maxCostUsdM || !engages(m, cat) || m.rangeKm * coverageShare(m.kind, cat) < distKm) continue;
    const pk = pkAgainst(m, cat);
    const eff = pk * (1 - difficulty);
    if (eff <= 0) continue;
    if (eff >= 0.3 && (!cheap || m.unitCostUsdM < cheap.m.unitCostUsdM)) cheap = { m, pk };
    if (!best || eff > best.pk * (1 - difficulty)) best = { m, pk };
  }
  return cheap ?? best;
}

/**
 * Whether `defender` engages `attacker` over ground `holder` holds: it is at war with the
 * attacker, or it gives air-defence aid to a holder that is (diplomacy `aid`), as the US, UK,
 * France and Jordan did over Israel on 13-14 Apr 2024 without being at war with Iran.
 */
function engagesOver(world: World, pic: AirPicture, defender: NationId, attacker: NationId, holder: NationId | undefined): boolean {
  if (pic.atWar(defender, attacker)) return true;
  return !!holder && pic.atWar(holder, attacker) && !!world.slices.diplomacy?.aid[defender]?.includes(holder);
}

/** Defenders hostile to `nation` whose envelope reaches `node`, longest range first. */
export function hostileDefenders(world: World, ctx: SimContext, pic: AirPicture, node: NodeId, nation: NationId): Defender[] {
  const key = `${node}|${nation}`;
  let inRange = pic.defendersInRange.get(key);
  if (!inRange) {
    const holder = world.control[node] || undefined;
    inRange = pic.defenders.filter((d) => engagesOver(world, pic, d.f.nation, nation, holder) && nodeDistance(ctx, d.f.node, node) <= d.rangeKm).sort((a, b) => b.rangeKm - a.rangeKm);
    pic.defendersInRange.set(key, inRange);
  }
  return inRange.filter((d) => d.f.status === 'active' && d.channels > 0);
}

/** One defender fires `shot` at `count` threats; spends its channels and interceptors. Returns survivors. */
function engage(ctx: SimContext, d: Defender, shot: Shot, cat: ThreatCategory, threat: { count: number; speedMach: number; interceptDifficulty: number }, doctrine?: ShotDoctrine): number {
  const r = interceptSalvo(threat, { channels: d.channels, interceptors: d.f.magazine[shot.m.id], pk: shot.pk, rangeKm: shot.m.rangeKm * coverageShare(shot.m.kind, cat), doctrine }, ctx.rng);
  d.channels -= r.channelsUsed;
  d.f.magazine[shot.m.id] -= r.interceptorsUsed;
  return r.leaked;
}

/** Each covering defender with the interceptor it would commit, cheapest layer first so PAC-3s are kept for what SHORAD cannot stop. */
function layers(ctx: SimContext, defenders: Defender[], node: NodeId, cat: ThreatCategory, difficulty: number, maxCostUsdM = Infinity): { d: Defender; shot: Shot }[] {
  const out: { d: Defender; shot: Shot }[] = [];
  for (const d of defenders) {
    const shot = d.channels > 0 ? pickInterceptor(d.f, cat, difficulty, nodeDistance(ctx, d.f.node, node), maxCostUsdM, ctx) : undefined;
    if (shot) out.push({ d, shot });
  }
  return out.sort((a, b) => a.shot.m.unitCostUsdM - b.shot.m.unitCostUsdM || b.d.rangeKm - a.d.rangeKm);
}

/** Fighters defending `node` against `attacker` (see engagesOver) that can reach it and still have intercept sorties. */
function interceptorFighters(world: World, ctx: SimContext, pic: AirPicture, node: NodeId, attacker: NationId): AirGroup[] {
  const holder = world.control[node] || undefined;
  return pic.groups.filter(
    (g) =>
      g.interceptLeft > 0 &&
      g.f.status === 'active' &&
      (g.f.order.posture === 'defend' || (COUNTER_AIR_POSTURES.has(g.f.order.posture) && g.f.order.target === node)) &&
      engagesOver(world, pic, g.f.nation, attacker, holder) &&
      nodeDistance(ctx, g.f.node, node) <= g.radiusKm,
  );
}

/** One attacker's weapons of one kind arriving together; `overflightKm` is how much defended ground they crossed. */
export interface RaidStream { munition: Munition; count: number; overflightKm: number }

/**
 * Km of the route from `from` to `to` that lies over land held by a nation defending
 * against `attacker` there (see engagesOver: Jordan over its own airspace, aiding
 * Israel), sampled every COUNTER_DRONE.sampleKm (straight line, which is close
 * enough at theater scale; real drones dog-leg around known defenses).
 */
export function overflightKm(world: World, ctx: SimContext, pic: AirPicture, from: NodeId, to: NodeId, attacker: NationId): number {
  const { map } = ctx;
  const target = world.control[to] || undefined;
  const dist = nodeDistance(ctx, from, to);
  const steps = Math.max(1, Math.round(dist / COUNTER_DRONE.sampleKm));
  const lat0 = map.lat[from], lon0 = map.lon[from];
  const dLon = ((((map.lon[to] - lon0) % 360) + 540) % 360) - 180;
  let km = 0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const n = i === steps ? to : map.nodeAt(lat0 + (map.lat[to] - lat0) * t, lon0 + dLon * t);
    const owner = map.isSea(n) ? undefined : world.control[n];
    if (owner && engagesOver(world, pic, owner, attacker, target)) km += dist / steps;
  }
  return km;
}

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
    if (streams[i].overflightKm > 0)
      leaked[i] -= ctx.rng.binomial(leaked[i], beltKillProbability(m.kind, streams[i].overflightKm, m.interceptDifficulty));
    if (cat === 'air_breathing' && leaked[i]) {
      // Each group flies its own sector, so a threat meets one group, not every fighter up in turn: the stream splits
      // evenly across the nations defending, and within a nation by intercept sorties up (13-14 Apr 2024: US, UK,
      // French and Jordanian jets each downed drones over their own areas, IDF and allied statements).
      const armed: { g: AirGroup; aam: Munition }[] = [];
      const upByNation = new Map<NationId, number>();
      for (const g of fighters) {
        const aam = pic.aamOf(g.f);
        if (!aam || g.interceptLeft <= 0 || (g.f.magazine[aam.id] ?? 0) < 1) continue;
        armed.push({ g, aam });
        upByNation.set(g.f.nation, (upByNation.get(g.f.nation) ?? 0) + g.interceptLeft);
      }
      const shares = splitBySorties(ctx.rng, leaked[i], armed.map(({ g }) => g.interceptLeft / upByNation.get(g.f.nation)! / upByNation.size));
      armed.forEach(({ g, aam }, k) => {
        if (!shares[k]) return;
        const r = interceptSalvo({ ...threat, count: shares[k] }, { channels: g.interceptLeft, interceptors: g.f.magazine[aam.id] ?? 0, pk: pkAgainst(aam, cat), rangeKm: aam.rangeKm }, ctx.rng);
        g.interceptLeft -= r.channelsUsed;
        g.f.magazine[aam.id] -= r.interceptorsUsed;
        leaked[i] -= r.intercepted;
      });
    }
    const maxCost = Math.max(TUNING.interceptorCostFloorUsdM, TUNING.interceptorCostRatio * m.unitCostUsdM);
    const ls = layers(ctx, sams, node, cat, m.interceptDifficulty, maxCost);
    const ready = (k: number) => ls[k].d.channels > 0 && ls[k].d.f.magazine[ls[k].shot.m.id] >= 1;
    for (let k = 0; k < ls.length && leaked[i]; k++) {
      if (!ready(k)) continue;
      // Layered missile defence shoots one round per warhead while another tier still stands behind it to take the
      // miss (Arrow 3 then Arrow 2 or THAAD, then David's Sling: MDA and IMDO shoot-look-shoot doctrine); only the last
      // tier ripples two.
      let backed = false;
      for (let j = k + 1; cat === 'ballistic' && !backed && j < ls.length; j++) backed = ready(j);
      leaked[i] = engage(ctx, ls[k].d, ls[k].shot, cat, { ...threat, count: leaked[i] }, backed ? 'shoot_look_shoot' : undefined);
    }
  }
  return leaked;
}

/**
 * Which group meets each of `n` threats: a weighted draw per threat (sequential binomials), so even a lone
 * drone can fall in a small contingent's sector, as often as its weight says.
 */
function splitBySorties(rng: SimContext['rng'], n: number, weights: number[]): number[] {
  let left = n, rest = weights.reduce((a, w) => a + w, 0);
  return weights.map((w) => {
    const k = rest > 0 && left > 0 ? rng.binomial(left, Math.min(1, w / rest)) : 0;
    left -= k;
    rest -= w;
    return k;
  });
}

export function threatCategory(m: Munition): ThreatCategory | null {
  return THREAT_OF_KIND[m.kind];
}

export interface ExposedFlight { g: AirGroup; n: number }

/**
 * Share of the full SAM exposure a sortie takes when it releases `depthKm` inside the
 * outermost hostile envelope: time under fire grows with depth. An Su-25 lofting
 * rockets a few km past the edge of a Patriot's reach is far safer than a B-52 over
 * Hanoi (estimate).
 */
export function envelopeExposure(depthKm: number): number {
  return Math.max(0, Math.min(1, depthKm / TUNING.fullExposureDepthKm));
}

/**
 * SAMs covering `node` engage aircraft of `nation` flying there. Only a share of
 * sorties ever gets inside a SAM's envelope with a firing solution, scaled by how deep
 * they go (`exposure`); stealth shrinks that share by visibility squared (detection
 * area). Returns losses per flight.
 */
export function samVsAircraft(world: World, ctx: SimContext, pic: AirPicture, node: NodeId, nation: NationId, flights: ExposedFlight[], mission: 'strike' | 'counter_air', ewSupport: boolean, tally: LossTally, exposure = 1): number[] {
  const sams = hostileDefenders(world, ctx, pic, node, nation);
  if (!sams.length) return flights.map(() => 0);
  const evasion = ewSupport ? TUNING.aircraftEvasionWithEw : TUNING.aircraftEvasion;
  return flights.map(({ g, n }) => {
    let exposed = ctx.rng.binomial(n, TUNING.samExposure[mission] * exposure * visibility(g.platform.protection.stealth) ** 2);
    const before = exposed;
    for (const { d, shot } of layers(ctx, sams, node, 'aircraft', evasion)) {
      if (!exposed) break;
      if (d.channels > 0 && d.f.magazine[shot.m.id] >= 1) exposed = engage(ctx, d, shot, 'aircraft', { count: exposed, speedMach: g.platform.mobility.speedKph / 1235, interceptDifficulty: evasion });
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

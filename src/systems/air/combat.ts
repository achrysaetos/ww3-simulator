import type { Rng } from '../../core/rng';
import type { Munition, Platform } from '../../core/types';
import { TUNING } from './tables';

/**
 * Detection range multiplier for a target of the given stealth. Radar range scales
 * with RCS^(1/4); stealth s maps to RCS x 10^(-4s), so range x 10^(-s). s = 0.9
 * (F-22/F-35, ~0.0001-0.001 m2 vs ~5 m2 for a Flanker) cuts detection ~8x.
 */
export function visibility(stealth: number): number {
  return 10 ** -stealth;
}

/**
 * Combat radius with tanker support. `tankers` is tanker aircraft available per
 * receiving aircraft. One tanker sortie tops up TUNING.tankerReceiversPerTanker once; one refuel adds
 * ~half a radius, an outbound plus recovery refuel roughly doubles it, which is the cap.
 */
export function combatRadiusKm(platform: Platform, tankers = 0): number {
  const refuels = Math.max(0, tankers) * TUNING.tankerReceiversPerTanker;
  return platform.mobility.rangeKm * (1 + Math.min(TUNING.maxTankerExtension, refuels * 0.5));
}

export interface Flight {
  platform: Platform;
  aircraft: number;
  /** Best air-to-air missile carried, if any. */
  aam?: Munition;
  missiles: number;
  experience: number;
}

export interface AirSide {
  flights: Flight[];
  /** Detection range of supporting AWACS against a non-stealthy target, km; 0 if none. */
  awacsKm: number;
}

export interface FlightOutcome {
  lost: number;
  missilesFired: number;
}

const skill = (experience: number) => 0.6 + 0.8 * experience;

/**
 * One air battle over a node: BVR first-shot volleys for the side that can engage
 * from further out (detection limited by enemy stealth, AWACS cueing via datalink),
 * an exchange volley, then a WVR merge unless the weaker side disengages.
 * Missile pk comes straight from the catalog; combat AIM-120 pk was ~0.46 and
 * AIM-7 ~0.34 (Higby 2005; RAND MG-749 "Air Combat Past, Present and Future").
 */
export function resolveAirBattle(a: AirSide, b: AirSide, rng: Rng): { a: FlightOutcome[]; b: FlightOutcome[] } {
  const sides = [a, b].map((s) => ({
    side: s,
    alive: s.flights.map((f) => f.aircraft),
    ammo: s.flights.map((f) => f.missiles),
    out: s.flights.map((): FlightOutcome => ({ lost: 0, missilesFired: 0 })),
  }));
  const total = (i: number) => sides[i].alive.reduce((x, y) => x + y, 0);
  const meanStealth = (i: number) => {
    const s = sides[i];
    let n = 0, w = 0;
    s.side.flights.forEach((f, k) => { n += s.alive[k]; w += s.alive[k] * f.platform.protection.stealth; });
    return n ? w / n : 0;
  };
  const engageKm = (i: number) => {
    const s = sides[i], vis = visibility(meanStealth(1 - i));
    let best = 0;
    s.side.flights.forEach((f, k) => {
      if (!s.alive[k] || !s.ammo[k] || !f.aam) return;
      best = Math.max(best, Math.min(Math.max(f.platform.sensors.detectionKm, s.side.awacsKm) * vis, f.aam.rangeKm));
    });
    return best;
  };

  const volleyKills = (i: number): number => {
    const s = sides[i], targets = total(1 - i);
    if (!targets) return 0;
    const seekerFactor = 1 - 0.3 * meanStealth(1 - i);
    let survive = 1;
    s.side.flights.forEach((f, k) => {
      const shots = Math.min(s.ammo[k], s.alive[k] * TUNING.shotsPerVolley);
      if (!shots || !f.aam) return;
      s.ammo[k] -= shots;
      s.out[k].missilesFired += shots;
      const pk = Math.min(0.95, (f.aam.pk.aircraft ?? 0) * skill(f.experience) * seekerFactor);
      survive *= (1 - pk) ** (shots / targets);
    });
    return rng.binomial(targets, 1 - survive);
  };

  const mergeKills = (i: number): number => {
    const s = sides[i], targets = total(1 - i);
    let k = 0;
    s.side.flights.forEach((f, j) => { k += s.alive[j] * (f.platform.firepower.aircraft ?? 0) * TUNING.wvrHours * skill(f.experience); });
    return targets ? rng.binomial(targets, Math.min(1, k / targets)) : 0;
  };

  /** Spread kills over the target side, weighted toward the more visible flights. */
  const applyKills = (i: number, kills: number) => {
    const s = sides[i];
    for (let n = 0; n < kills; n++) {
      const w = s.side.flights.map((f, k) => s.alive[k] * visibility(f.platform.protection.stealth));
      const sum = w.reduce((x, y) => x + y, 0);
      if (sum <= 0) return;
      let r = rng.next() * sum, k = 0;
      while (k < w.length - 1 && r >= w[k]) r -= w[k++];
      s.alive[k]--;
      s.out[k].lost++;
    }
  };

  const ra = engageKm(0), rb = engageKm(1);
  const [lead, lag] = ra >= rb ? [0, 1] : [1, 0];
  const rLead = Math.max(ra, rb), rLag = Math.min(ra, rb);
  const freeVolleys = rLead <= 0 ? 0 : rLag <= 0 || rLead >= 2 * rLag ? 2 : rLead >= 1.25 * rLag ? 1 : 0;
  for (let v = 0; v < freeVolleys && total(lag); v++) applyKills(lag, volleyKills(lead));

  if (rLag > 0 && total(0) && total(1)) {
    const k0 = volleyKills(0), k1 = volleyKills(1);
    applyKills(1, k0);
    applyKills(0, k1);
  }

  const n0 = total(0), n1 = total(1);
  if (n0 && n1 && Math.min(n0, n1) / Math.max(n0, n1) >= TUNING.disengageRatio) {
    const k0 = mergeKills(0), k1 = mergeKills(1);
    applyKills(1, k0);
    applyKills(0, k1);
  }
  return { a: sides[0].out, b: sides[1].out };
}

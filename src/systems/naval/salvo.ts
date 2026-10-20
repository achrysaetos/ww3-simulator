import type { Rng } from '../../core/rng';
import type { Munition, MunitionId } from '../../core/types';
import { CAP_PK, KIND_DAMAGE, MIN_INTERCEPTABLE_MACH, NOT_INTERCEPTABLE, REFERENCE_WARHEAD_KG } from './tables';

export interface InterceptorStock { munition: Munition; available: number }

export interface SalvoDefense {
  /** Fire-control channels: interceptors guided at once. */
  channels: number;
  /** Interceptor stocks, best first. */
  interceptors: InterceptorStock[];
  /** Final-layer kill chance per leaker before the difficulty discount. */
  pointDefense: number;
  /** Combat air patrol shots available against subsonic threats. */
  capShots: number;
}

export interface SalvoOutcome {
  fired: number;
  intercepted: number;
  leakers: number;
  /** Exocet-equivalent damage of each hit that landed. */
  hits: number[];
  interceptorsUsed: Map<MunitionId, number>;
}

/** Interceptors each channel can guide per engagement window (shoot-shoot). */
const SHOTS_PER_CHANNEL = 2;
/** Spread of defensive performance per salvo (Hughes' "defender alertness"); estimate. */
const ALERTNESS_SD = 0.15;

/**
 * Hughes' salvo model (Hughes, "Fleet Tactics and Coastal Combat", 2000): leakers =
 * offensive missiles fired minus the defense's interception capacity. Capacity is the
 * interceptor shots the fire-control channels can guide in the engagement window (two per
 * channel per window, two windows against a subsonic sea-skimmer, one against anything
 * faster) and the magazine allows, times per-shot kill probability, plus CAP against
 * subsonic threats. A salvo inside capacity leaks nothing; a saturating one leaks the excess.
 *
 * Per-shot kill probability is pk.missile x (1 - interceptDifficulty), so a DF-21D-class
 * ASBM (difficulty ~0.8) or a hypersonic (~0.9) mostly leaks. Interceptors spent are the shots
 * needed to kill what was killed, so expenditure per threat is ~1/pk: Red Sea 2023-24 ran
 * about two Standard Missiles per engaged threat. Point defense then rolls per leaker, and
 * each survivor hits with the missile's pk against the target class.
 */
export function resolveSalvo(rng: Rng, threat: Munition, fired: number, defense: SalvoDefense, target: 'ship' | 'submarine'): SalvoOutcome {
  const used = new Map<MunitionId, number>();
  const evade = 1 - threat.interceptDifficulty;
  const alertness = Math.max(0.5, rng.normal(1, ALERTNESS_SD));
  let killed = 0;

  const subsonicMissile = threat.speedMach < 1 && threat.speedMach >= MIN_INTERCEPTABLE_MACH;
  if (subsonicMissile && defense.capShots > 0) killed += Math.min(fired, Math.floor(defense.capShots * CAP_PK * evade * alertness));

  const interceptable = !NOT_INTERCEPTABLE.has(threat.kind) && threat.speedMach >= MIN_INTERCEPTABLE_MACH;
  if (interceptable && killed < fired) {
    const looks = threat.speedMach < 1 ? 2 : 1;
    let shots = defense.channels * SHOTS_PER_CHANNEL * looks;
    let capacity = 0;
    const plan: [InterceptorStock, number, number][] = [];
    for (const stock of defense.interceptors) {
      const p = (stock.munition.pk.missile ?? 0) * evade * alertness;
      const k = Math.min(stock.available, shots);
      if (k <= 0 || p <= 0) continue;
      plan.push([stock, k, p]);
      capacity += k * p;
      shots -= k;
    }
    let need = Math.min(fired - killed, Math.floor(capacity + 1e-9));
    killed += need;
    for (const [stock, k, p] of plan) {
      if (need <= 0) break;
      const take = Math.min(k, Math.ceil(need / p - 1e-9));
      stock.available -= take;
      used.set(stock.munition.id, take);
      need -= take * p;
    }
  }

  const leakers = fired - killed;
  const through = leakers - rng.binomial(leakers, defense.pointDefense * evade);
  const nHits = rng.binomial(through, threat.pk[target] ?? 0);
  return { fired, intercepted: killed, leakers, hits: new Array(nHits).fill(hitWeight(threat)), interceptorsUsed: used };
}

/** Damage of one hit in Exocet equivalents: blast damage scales roughly with charge^(2/3). */
export function hitWeight(m: Munition): number {
  return (m.warheadKg / REFERENCE_WARHEAD_KG) ** (2 / 3) * (KIND_DAMAGE[m.kind] ?? 1);
}

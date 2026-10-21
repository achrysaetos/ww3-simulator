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

/** Interceptors each channel can guide per engagement window. */
const SHOTS_PER_CHANNEL = 2;
/** Shoot-shoot: two interceptors at each threat per engagement window, fired before either hits. */
const SHOTS_PER_THREAT = 2;
/** Spread of defensive performance per salvo (Hughes' "defender alertness"); estimate. */
const ALERTNESS_SD = 0.15;

/**
 * Hughes' salvo model (Hughes, "Fleet Tactics and Coastal Combat", 2000) in its stochastic
 * form (Armstrong, "A Stochastic Salvo Model for Naval Surface Combat", Operations Research
 * 53(5), 2005). The fire-control channels guide two interceptors each per engagement window
 * (two windows against a subsonic threat, one against anything faster) while the magazine
 * lasts. Each window, every surviving threat the shots reach takes a shoot-shoot pair, and
 * each interceptor kills with pk.missile x (1 - interceptDifficulty). A salvo beyond the shots
 * leaks its excess unengaged (saturation); one inside them still leaks the threats both
 * interceptors miss, about one in eleven at a per-shot 0.7. Hughes' deterministic capacity is
 * the mean of this and leaks nothing below saturation, which no combat record supports: Stark
 * (1987), Hanit (2006) and Moskva (2022) were each hit by the first two missiles fired.
 *
 * A DF-21D-class ASBM (difficulty ~0.8) or a hypersonic (~0.9) mostly leaks. Expenditure is two
 * interceptors per engaged threat, as the US Navy ran in the Red Sea in 2023-24. CAP shots
 * against subsonic threats, then point defense per leaker, are rolled the same way, and each
 * survivor hits with the missile's pk against the target class.
 */
export function resolveSalvo(rng: Rng, threat: Munition, fired: number, defense: SalvoDefense, target: 'ship' | 'submarine'): SalvoOutcome {
  const used = new Map<MunitionId, number>();
  const evade = 1 - threat.interceptDifficulty;
  const alertness = Math.max(0.5, rng.normal(1, ALERTNESS_SD));
  let killed = 0;

  const subsonicMissile = threat.speedMach < 1 && threat.speedMach >= MIN_INTERCEPTABLE_MACH;
  if (subsonicMissile && defense.capShots > 0) killed += Math.min(fired, rng.binomial(Math.floor(defense.capShots), Math.min(1, CAP_PK * evade * alertness)));

  const interceptable = !NOT_INTERCEPTABLE.has(threat.kind) && threat.speedMach >= MIN_INTERCEPTABLE_MACH;
  const pk = (s: InterceptorStock) => Math.min(1, (s.munition.pk.missile ?? 0) * evade * alertness);
  const stocks = defense.interceptors.filter((s) => pk(s) > 0);
  const shoot = (): boolean => {
    const s = stocks.find((x) => x.available >= 1);
    if (!s) return false;
    s.available--;
    used.set(s.munition.id, (used.get(s.munition.id) ?? 0) + 1);
    return rng.chance(pk(s));
  };
  for (let look = threat.speedMach < 1 ? 2 : 1, alive = fired - killed; interceptable && look > 0 && alive > 0; look--) {
    const shots = defense.channels * SHOTS_PER_CHANNEL;
    const engaged = Math.min(alive, shots);
    const paired = Math.min(engaged, Math.floor((shots - engaged) / (SHOTS_PER_THREAT - 1)));
    for (let i = 0; i < engaged; i++) {
      let dead = false;
      for (let k = i < paired ? SHOTS_PER_THREAT : 1; k > 0; k--) if (shoot()) dead = true;
      if (dead) { killed++; alive--; }
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

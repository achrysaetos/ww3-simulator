import type { Rng } from '../../core/rng';
import { TUNING } from './tables';

export type ShotDoctrine = 'shoot_look_shoot' | 'salvo2' | 'auto';

export interface SalvoThreat {
  count: number;
  speedMach: number;
  /** 0 = trivially intercepted, 1 = unstoppable (Munition.interceptDifficulty). */
  interceptDifficulty: number;
  /** Seconds over which the raid arrives; 0 = perfect time-on-target. Defaults to TUNING.raidWindowS. */
  arrivalWindowS?: number;
}

export interface SalvoDefense {
  /** Fire-control channels still free for this raid. Fractional after engaging slow threats. */
  channels: number;
  /** Interceptor rounds available. */
  interceptors: number;
  /** Single-shot pk of the interceptor against this kind of threat, before interceptDifficulty. */
  pk: number;
  /** Engagement range against this threat, km. */
  rangeKm: number;
  /** 'auto' fires shoot-look-shoot when there is time for a second look, else a 2-round salvo. */
  doctrine?: ShotDoctrine;
}

export interface SalvoResult {
  intercepted: number;
  leaked: number;
  interceptorsUsed: number;
  channelsUsed: number;
}

const MACH_MS = 340;

/** Seconds a threat spends crossing the defended envelope. */
function crossingS(rangeKm: number, speedMach: number): number {
  return (rangeKm * 1000) / (Math.max(0.05, speedMach) * MACH_MS);
}

/**
 * Sequential engagements one channel gets against a raid: it can keep engaging for
 * as long as threats keep arriving plus one crossing time. A ballistic RV at Mach 6
 * crosses a 25 km footprint in ~12 s, so against a time-on-target salvo each channel
 * fires once; a Shahed at Mach 0.15 spends ~50 min inside a 150 km ring.
 */
export function engagementCycles(rangeKm: number, speedMach: number, arrivalWindowS: number = TUNING.raidWindowS): number {
  const s = arrivalWindowS + crossingS(rangeKm, speedMach);
  return Math.max(1, Math.min(TUNING.maxCycles, s / TUNING.engagementCycleS));
}

/**
 * Salvo math for one defender against one stream of identical incoming weapons.
 * Each engagement costs 1/cycles of a channel, so a time-on-target salvo of fast
 * threats saturates channels while a spread-out raid mostly drains magazines.
 * Per-shot pk = pk x (1 - interceptDifficulty). Shoot-look-shoot needs time for a
 * second look inside one threat's crossing, so against ballistic threats 'auto' fires
 * a 2-round salvo instead, which burns interceptors twice as fast.
 * Reused by the naval and strategic systems; pure apart from the rng draws.
 */
export function interceptSalvo(threat: SalvoThreat, defense: SalvoDefense, rng: Rng): SalvoResult {
  const none: SalvoResult = { intercepted: 0, leaked: threat.count, interceptorsUsed: 0, channelsUsed: 0 };
  const p = Math.max(0, Math.min(1, defense.pk * (1 - threat.interceptDifficulty)));
  if (threat.count <= 0 || p <= 0 || defense.interceptors < 1 || defense.channels <= 0 || defense.rangeKm <= 0) return none;
  const cycles = engagementCycles(defense.rangeKm, threat.speedMach, threat.arrivalWindowS);
  const slot = 1 / cycles;
  const slots = Math.floor(defense.channels / slot + 1e-9);
  const canLookAgain = crossingS(defense.rangeKm, threat.speedMach) >= 2 * TUNING.engagementCycleS;
  const doctrine = defense.doctrine === 'auto' || !defense.doctrine ? (canLookAgain ? 'shoot_look_shoot' : 'salvo2') : defense.doctrine;

  if (doctrine === 'salvo2') {
    const pairs = Math.min(threat.count, slots, Math.floor(defense.interceptors / 2));
    const single = pairs < threat.count && pairs < slots && defense.interceptors - 2 * pairs >= 1 ? 1 : 0;
    const killed = rng.binomial(pairs, 1 - (1 - p) ** 2) + rng.binomial(single, p);
    return { intercepted: killed, leaked: threat.count - killed, interceptorsUsed: 2 * pairs + single, channelsUsed: (pairs + single) * slot };
  }

  const first = Math.min(threat.count, slots, Math.floor(defense.interceptors));
  const k1 = rng.binomial(first, p);
  const second = canLookAgain ? Math.min(first - k1, slots - first, Math.floor(defense.interceptors) - first) : 0;
  const k2 = rng.binomial(Math.max(0, second), p);
  const shots = first + Math.max(0, second);
  return { intercepted: k1 + k2, leaked: threat.count - k1 - k2, interceptorsUsed: shots, channelsUsed: shots * slot };
}

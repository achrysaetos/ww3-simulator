import type { Rng } from '../../core/rng';
import { TUNING } from './tables';

export type ShotDoctrine = 'shoot_look_shoot' | 'salvo2' | 'auto';

export interface SalvoThreat {
  count: number;
  speedMach: number;
  /** 0 = trivially intercepted, 1 = unstoppable (Munition.interceptDifficulty). */
  interceptDifficulty: number;
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

/**
 * How many sequential engagements one channel gets against a threat crossing the
 * defended envelope. A Shahed at Mach 0.15 spends ~50 min inside a 150 km ring (many
 * cycles); a ballistic reentry vehicle at Mach 6 gives one ~70 s window.
 */
export function engagementCycles(rangeKm: number, speedMach: number): number {
  const windowS = (rangeKm * 1000) / (Math.max(0.05, speedMach) * MACH_MS);
  return Math.max(1, Math.min(TUNING.maxCycles, windowS / TUNING.engagementCycleS));
}

/**
 * Salvo math for one defender against one stream of identical incoming weapons.
 * Each threat costs 1/cycles of a channel per engagement, so fast threats saturate
 * channels and slow ones exhaust magazines. Per-shot pk = pk x (1 - interceptDifficulty).
 * Shoot-look-shoot needs a second cycle, so against ballistic threats it falls back to
 * one shot; 'salvo2' fires two rounds at once and burns interceptors twice as fast.
 * Reused by the naval and strategic systems; pure apart from the rng draws.
 */
export function interceptSalvo(threat: SalvoThreat, defense: SalvoDefense, rng: Rng): SalvoResult {
  const none: SalvoResult = { intercepted: 0, leaked: threat.count, interceptorsUsed: 0, channelsUsed: 0 };
  const p = Math.max(0, Math.min(1, defense.pk * (1 - threat.interceptDifficulty)));
  if (threat.count <= 0 || p <= 0 || defense.interceptors < 1 || defense.channels <= 0 || defense.rangeKm <= 0) return none;
  const cycles = engagementCycles(defense.rangeKm, threat.speedMach);
  const slot = 1 / cycles;
  const slots = Math.floor(defense.channels / slot + 1e-9);
  const doctrine = defense.doctrine === 'auto' || !defense.doctrine ? (cycles >= 2 ? 'shoot_look_shoot' : 'salvo2') : defense.doctrine;

  if (doctrine === 'salvo2') {
    const pairs = Math.min(threat.count, slots, Math.floor(defense.interceptors / 2));
    const single = pairs < threat.count && pairs < slots && defense.interceptors - 2 * pairs >= 1 ? 1 : 0;
    const killed = rng.binomial(pairs, 1 - (1 - p) ** 2) + rng.binomial(single, p);
    return { intercepted: killed, leaked: threat.count - killed, interceptorsUsed: 2 * pairs + single, channelsUsed: (pairs + single) * slot };
  }

  const first = Math.min(threat.count, slots, Math.floor(defense.interceptors));
  const k1 = rng.binomial(first, p);
  const canLookAgain = cycles >= 2;
  const second = canLookAgain ? Math.min(first - k1, slots - first, Math.floor(defense.interceptors) - first) : 0;
  const k2 = rng.binomial(Math.max(0, second), p);
  const shots = first + Math.max(0, second);
  return { intercepted: k1 + k2, leaked: threat.count - k1 - k2, interceptorsUsed: shots, channelsUsed: shots * slot };
}

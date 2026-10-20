import type { System } from '../core/engine';
import type { NationId } from '../core/types';
import { alliances, strategicProfile } from '../data/nations';
import type { Alliance, StrategicProfile as NationStrategy } from '../data/nations';
import { createAi } from './ai';
import { airWar, applyAirOrder } from './air';
import { createDiplomacy } from './diplomacy';
import { shiftOdds } from './diplomacy/wars';
import type { AllianceTreaty, StrategicProfile, TreatyMember } from './diplomacy/types';
import { economy } from './economy';
import { applyLandOrder, landCombat, landMovement } from './land';
import { logistics } from './logistics';
import { applyNavalOrder, isNavalOrder, navalWar } from './naval';
import { createOrderRouter } from './orders';
import { strategic } from './strategic';

/** Collapse a nation's doctrine-level profile to the four knobs diplomacy and AI read. */
export function decisionProfile(p: NationStrategy): StrategicProfile {
  const aims = p.warAims;
  const offensive = (aims.territorial_expansion ?? 0) + (aims.buffer_zone ?? 0) + (aims.regional_hegemony ?? 0) + (aims.regime_change ?? 0);
  const total = Object.values(aims).reduce((a, b) => a + (b ?? 0), 0) || 1;
  return {
    casualtyTolerance: p.casualtyTolerance,
    interventionism: (p.allianceReliability + (aims.alliance_defense ?? 0) / total + p.riskTolerance) / 2,
    riskTolerance: (p.riskTolerance + p.escalationPropensity) / 2,
    aggression: Math.min(1, 0.3 * p.riskTolerance + 0.7 * (offensive / total)),
  };
}

const KIND: Partial<Record<Alliance['obligation'], AllianceTreaty['kind']>> = {
  collective_defense: 'collective_defense',
  bilateral_defense: 'bilateral_defense',
  ambiguous: 'ambiguous',
};

/** Log-odds shift per unit of member reliability away from the 0.5 midpoint. Estimate: spans HUN (0.4) to SWE (0.85) by ~2.5x odds. */
const RELIABILITY_LOGIT = 4;

/**
 * Treaties that can pull a nation into a war; consultative and economic groupings never do.
 * A treaty's commitment is the typical member's odds of honouring it, and a member's own
 * record shifts those odds. Weak treaties stay weak: the Rio Treaty (0.3) was not honoured
 * for Argentina in 1982, the CSTO (0.4) refused Armenia in 2021-22, the Arab League
 * Joint Defence Treaty (0.1) has never brought its members into a member's war.
 */
export function warTreaties(table: readonly Alliance[], profiles: Readonly<Record<string, NationStrategy>>): AllianceTreaty[] {
  const out: AllianceTreaty[] = [];
  for (const a of table) {
    const kind = KIND[a.obligation];
    if (!kind) continue;
    const members: Record<NationId, TreatyMember> = {};
    const protectedOnly = new Set(a.protectedOnly ?? []);
    for (const m of a.members) {
      const reliability = shiftOdds(a.commitment, RELIABILITY_LOGIT * ((profiles[m]?.allianceReliability ?? 0.5) - 0.5));
      members[m] = {
        role: protectedOnly.has(m) ? 'protected' : protectedOnly.size ? 'guarantor' : 'mutual',
        reliability,
        // Political decision plus deployment order: days for a firm pact, weeks for a hesitant one.
        delayDays: Math.round(2 + (1 - reliability) * 14),
      };
    }
    out.push({ id: a.id, kind, members, guarantors: a.nuclearGuarantors ?? [] });
  }
  return out;
}

const decision = Object.fromEntries(Object.entries(strategicProfile).map(([k, p]) => [k, decisionProfile(p)]));

const orders = createOrderRouter([
  (w, c, ctx) => {
    if (!isNavalOrder(w, c)) return false;
    applyNavalOrder(w, c, ctx);
    return true;
  },
  applyAirOrder,
  applyLandOrder,
]);

/**
 * Tick order. Commands are applied first (by whichever system owns each type),
 * then every system steps in this order: the air picture is settled before
 * ground and sea combat read it, combat before logistics refills, economy before
 * diplomacy reads economic stress, and AI last so its orders queue for next tick.
 */
export const SYSTEMS: System[] = [
  orders,
  strategic,
  airWar,
  navalWar,
  landMovement,
  landCombat,
  logistics,
  economy,
  createDiplomacy({ alliances: warTreaties(alliances, strategicProfile), profiles: decision }),
  createAi(decision),
];


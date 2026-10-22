import type { System } from '../core/engine';
import type { NationId } from '../core/types';
import { airDefencePledges, alliances, peaceTreaties, strategicProfile } from '../data/nations';
import type { Alliance, StrategicProfile as NationStrategy } from '../data/nations';
import { adaptation } from './adaptation';
import { createAi } from './ai';
import { airWar, applyAirOrder } from './air';
import { civil } from './civil';
import { politics } from './politics';
import { c2 } from './c2';
import { createDiplomacy } from './diplomacy';
import { shiftOdds } from './diplomacy/wars';
import type { AllianceTreaty, StrategicProfile, TreatyMember, TreatyTrigger } from './diplomacy/types';
import { economy } from './economy';
import { intel } from './intel';
import { applyLandOrder, landCombat, landMovement } from './land';
import { logistics } from './logistics';
import { applyNavalOrder, isNavalOrder, navalWar } from './naval';
import { nonKinetic } from './nonkinetic';
import { createOrderRouter } from './orders';
import { operations } from './ops';
import { strategic } from './strategic';
import { weather } from './weather';
import { defineParam } from '../core/params';

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

/** Threats short of armed attack call only for consultation, which never brings a member into a war. */
const TRIGGER: Partial<Record<Alliance['triggers'][number], TreatyTrigger>> = {
  attack_on_territory: 'territory',
  attack_on_forces: 'forces',
};

/** Log-odds shift per unit of member reliability away from the 0.5 midpoint. Estimate: spans HUN (0.4) to SWE (0.85) by ~2.5x odds. */
const RELIABILITY_LOGIT = defineParam({ id: 'diplomacy.RELIABILITY_LOGIT', value: 4, range: [2, 6], tag: 'judgment',
  source: 'Estimate: spans HUN (0.4) to SWE (0.85) allies by ~2.5x odds',
  affects: 'who honours a treaty and how fast' });

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
      const record = profiles[m]?.allianceReliability ?? 0.5;
      // Treaties are built once at load, so the odds are read when diplomacy asks, under the run's params.
      const reliability = () => shiftOdds(a.commitment, RELIABILITY_LOGIT() * (record - 0.5));
      members[m] = {
        role: protectedOnly.has(m) ? 'protected' : protectedOnly.size ? 'guarantor' : 'mutual',
        get reliability() { return reliability(); },
        // Political decision plus deployment order: days for a firm pact, weeks for a hesitant one.
        get delayDays() { return Math.round(2 + (1 - reliability()) * 14); },
      };
    }
    // A guarantor extends its threshold to allies only if its doctrine says so (NuclearThreshold.coversAllies).
    const guarantors = (a.nuclearGuarantors ?? []).filter((g) => profiles[g]?.nuclearThreshold?.coversAllies);
    const triggers = a.triggers.flatMap((t) => TRIGGER[t] ?? []);
    out.push({ id: a.id, kind, members, triggers, ...(a.area ? { area: a.area } : {}), guarantors, ...(a.inForce ? { inForce: a.inForce } : {}) });
  }
  return out;
}

const decision = Object.fromEntries(Object.entries(strategicProfile).map(([k, p]) => [k, decisionProfile(p)]));

const orders = createOrderRouter([
  (w, c, ctx) => (isNavalOrder(w, c) ? applyNavalOrder(w, c, ctx) : undefined),
  applyAirOrder,
  applyLandOrder,
]);

/**
 * Tick order. Commands are applied first (by whichever system owns each type),
 * then every system steps in this order: today's weather first, since everything else reads it;
 * the air picture is settled before ground and sea combat read it, combat before logistics refills, the non-kinetic
 * war (cyber, sabotage, cable cuts, shipping fear, occupation resistance) after logistics so the economy reads its
 * effects, adaptation once every domain's losses for the tick are in (each side learns from what it lost), economy before
 * diplomacy reads economic stress, intelligence after every sensor has moved, command and
 * control once the tick's strikes and captures have hit its HQs, operations once the tick's
 * ground is settled, and AI last so its orders queue for next tick around the operations' forces.
 */
export const SYSTEMS: System[] = [
  weather,
  orders,
  strategic,
  airWar,
  navalWar,
  landMovement,
  landCombat,
  logistics,
  nonKinetic,
  adaptation,
  economy,
  civil,
  politics,
  createDiplomacy({ alliances: warTreaties(alliances, strategicProfile), profiles: decision, peace: peaceTreaties, aid: airDefencePledges }),
  intel,
  c2,
  operations,
  createAi(decision),
];


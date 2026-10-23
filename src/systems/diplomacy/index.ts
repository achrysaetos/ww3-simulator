import { currentDate, relationKey, type System } from '../../core/engine';
import type { FormationId, NationId, PlatformId } from '../../core/types';
import { grantAccess, pledgeAid, setAccess, setAid, treatyPartners } from './access';
import { assess, enemyMap } from './assess';
import { grantedAid, pactsOf, requestHelp } from './help';
import { processEvents } from './escalation';
import { trackWarGround } from './aims';
import { leaderChanges } from './leaders';
import { warOnset } from './onset';
import { checkCapitulation, negotiatedPeace, offerPeace, pursueAims, reviewOffers, updateSupport } from './support';
import type { DiplomacyInput } from './types';
import { openUmbrellaCases, resolveUmbrella } from './umbrella';
import { adoptWars, declareWar, invasions, neutralEntry, resolveJoins, treatyCalls, type Diplomacy } from './wars';

export * from './types';
export { enemyMap } from './assess';
export { helpAnswer, type HelpAnswer, type HelpBasis, type NoAsk } from './help';
export { peaceAnswer, warSupport, type NoDeal, type PeaceAnswer, type Terms } from './support';
export { members, sideOf } from './wars';
export { mayEnter, warAimsOf } from './aims';

/**
 * Wars, alliances, escalation and war support. Runs after the combat systems
 * so it sees this tick's strikes, battles and captures, and before AI so AI
 * plans on a fresh assessment.
 */
export function createDiplomacy(input: DiplomacyInput = {}): System {
  const alliances = input.alliances ?? [];
  const peace = input.peace ?? [];
  const partners = treatyPartners(alliances);
  // Treaties in force on a run's date: a historical case dated before a treaty does not have it.
  let today: { day: string; d: Diplomacy; pacts: Record<string, string> } | undefined;
  const treatiesOn = (day: string) => {
    if (today?.day !== day) {
      const inForce = (t: { inForce?: string }) => !t.inForce || t.inForce <= day;
      const treaties = alliances.filter(inForce);
      today = {
        day,
        d: { alliances: treaties, profiles: input.profiles ?? {}, peace: new Set(peace.filter(inForce).map((p) => relationKey(...p.between))) },
        pacts: pactsOf(treaties),
      };
    }
    return today;
  };
  const pledges = input.aid ?? [];
  return {
    id: 'diplomacy',
    commands: ['declare_war', 'offer_peace', 'grant_access', 'set_aid', 'request_help'],
    init(world) {
      world.slices.diplomacy = { wars: [], joins: [], records: {}, assessment: {}, pressure: {}, offers: {}, access: {}, aid: {}, rev: 0, ssbnFormations: [], invoked: [], umbrella: [] };
    },
    apply(world, cmd, ctx) {
      const s = world.slices.diplomacy;
      if (cmd.type === 'declare_war') declareWar(world, ctx, s, cmd.nation, cmd.target, cmd.reason ?? 'declaration of war', cmd.aim);
      else if (cmd.type === 'offer_peace') offerPeace(world, ctx, s, cmd.nation, cmd.target);
      else if (cmd.type === 'grant_access') setAccess(s, cmd.nation, cmd.target, cmd.on);
      else if (cmd.type === 'set_aid') setAid(s, cmd.nation, cmd.target, cmd.on);
      else if (cmd.type === 'request_help') requestHelp(world, ctx, s, cmd.nation, cmd.target);
    },
    step(world, ctx) {
      const s = world.slices.diplomacy;
      const { d, pacts } = treatiesOn(currentDate(world).toISOString().slice(0, 10));
      s.pacts = pacts;
      const enemies = enemyMap(world);
      adoptWars(world, s, enemies);
      const prevThreatened = new Set(Object.entries(s.assessment).filter(([, a]) => a.capitalThreatened).map(([n]) => n as NationId));
      const situation = assess(world, ctx.map, enemies);
      s.assessment = situation.nations;
      for (const [by, on] of processEvents(world, ctx, s, enemies, situation.lostTo, prevThreatened)) declareWar(world, ctx, s, by, on, `strike on ${on} territory`);
      openUmbrellaCases(world, ctx, s, d.alliances);
      resolveUmbrella(world, ctx, s);
      treatyCalls(world, ctx, s, d);
      s.ssbnFormations = [];
      for (const f of Object.values(world.formations)) {
        if (f.status === 'destroyed' || (f.kind !== 'submarine' && f.kind !== 'strategic')) continue;
        if (Object.keys(f.equipment).some((p) => ctx.catalog.platforms.get(p as PlatformId)?.class === 'ssbn')) s.ssbnFormations.push(f.id as FormationId);
      }
      invasions(world, ctx, s, d, situation.invadedBy);
      resolveJoins(world, ctx, s, d);
      const daily = world.tick % Math.max(1, Math.round(24 / world.dtHours)) === 0;
      if (daily) neutralEntry(world, ctx, s, d);
      trackWarGround(world, ctx, s);
      updateSupport(world, s, d.profiles);
      checkCapitulation(world, ctx, s);
      if (daily) {
        leaderChanges(world, ctx, s);
        pursueAims(world, ctx, s);
      }
      negotiatedPeace(world, ctx, s);
      if (daily) reviewOffers(world, ctx, s);
      if (daily) warOnset(world, ctx, s, d);
      grantAccess(world, s, partners);
      pledgeAid(world, s, [...pledges, ...grantedAid(s)]);
    },
  };
}

export const diplomacy = createDiplomacy();

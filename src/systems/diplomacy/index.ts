import type { System } from '../../core/engine';
import type { FormationId, NationId, PlatformId } from '../../core/types';
import { assess, enemyMap } from './assess';
import { processEvents } from './escalation';
import { checkCapitulation, negotiatedPeace, offerPeace, updateSupport } from './support';
import type { DiplomacyInput } from './types';
import { adoptWars, declareWar, neutralEntry, resolveJoins } from './wars';

export * from './types';
export { enemyMap } from './assess';
export { warSupport } from './support';

/**
 * Wars, alliances, escalation and war support. Runs after the combat systems
 * so it sees this tick's strikes, battles and captures, and before AI so AI
 * plans on a fresh assessment.
 */
export function createDiplomacy(input: DiplomacyInput = {}): System {
  const alliances = input.alliances ?? [];
  const profiles = input.profiles ?? {};
  return {
    id: 'diplomacy',
    commands: ['declare_war', 'offer_peace'],
    init(world) {
      world.slices.diplomacy = { wars: [], joins: [], records: {}, assessment: {}, pressure: {}, offers: {}, ssbnFormations: [] };
    },
    apply(world, cmd, ctx) {
      const s = world.slices.diplomacy;
      if (cmd.type === 'declare_war') declareWar(world, ctx, s, alliances, cmd.nation, cmd.target, cmd.reason ?? 'declaration of war');
      else if (cmd.type === 'offer_peace') offerPeace(world, ctx, s, cmd.nation, cmd.target);
    },
    step(world, ctx) {
      const s = world.slices.diplomacy;
      const enemies = enemyMap(world);
      adoptWars(world, s, enemies);
      const prevThreatened = new Set(Object.entries(s.assessment).filter(([, a]) => a.capitalThreatened).map(([n]) => n as NationId));
      const situation = assess(world, ctx.map, enemies);
      s.assessment = situation.nations;
      processEvents(world, ctx, s, enemies, situation.lostTo, prevThreatened);
      s.ssbnFormations = [];
      for (const f of Object.values(world.formations)) {
        if (f.status === 'destroyed' || (f.kind !== 'submarine' && f.kind !== 'strategic')) continue;
        if (Object.keys(f.equipment).some((p) => ctx.catalog.platforms.get(p as PlatformId)?.class === 'ssbn')) s.ssbnFormations.push(f.id as FormationId);
      }
      resolveJoins(world, ctx, s, alliances, profiles);
      if (world.tick % Math.max(1, Math.round(24 / world.dtHours)) === 0) neutralEntry(world, ctx, s, alliances, profiles);
      updateSupport(world, s, profiles);
      checkCapitulation(world, ctx, s);
      negotiatedPeace(world, ctx, s);
    },
  };
}

export const diplomacy = createDiplomacy();

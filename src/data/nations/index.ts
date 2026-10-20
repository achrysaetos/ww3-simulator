import type { NationProfile } from '../../core/world';
import { alliances } from './alliances';
import { governments } from './government';
import { nuclearForces } from './nuclear';
import { opinions } from './opinions';
import { strategicProfiles } from './strategic';

export type * from './types';
export { alliances, allianceById, defenseObligations } from './alliances';
export { nuclearForces } from './nuclear';
export { opinions } from './opinions';

/** AI personality knobs, nuclear thresholds and objectives for every nation in world.json. */
export const strategicProfile = strategicProfiles(governments);

/**
 * The createWorld input. `nuclear.warheads` is the FAS military stockpile (usable warheads);
 * retired warheads awaiting dismantlement are in `nuclearForces[id].inventory`.
 */
export const profiles: Record<string, NationProfile> = Object.fromEntries(
  Object.entries(governments).map(([id, government]) => {
    const nf = nuclearForces[id];
    const profile: NationProfile = {
      government,
      blocs: alliances.filter((a) => a.members.some((m) => m === id)).map((a) => a.id),
      nuclear: nf ? { warheads: nf.stockpile, deployed: nf.deployed, doctrine: nf.doctrine } : { warheads: 0, deployed: 0, doctrine: 'none' },
      opinions: opinions[id] ?? {},
    };
    return [id, profile];
  }),
);

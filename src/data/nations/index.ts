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
 * Groupings whose members station, transit and supply each other's forces in war: treaties with
 * a duty to fight. Political and economic groupings (SCO, BRICS, AU, ASEAN), consultation pacts,
 * and the Arab League's never-invoked 1950 treaty (commitment 0.1) open no doors to foreign troops.
 */
const MILITARY_BLOC_MIN_COMMITMENT = 0.25;
const militaryBlocs = alliances.filter(
  (a) => (a.obligation === 'collective_defense' || a.obligation === 'bilateral_defense' || a.obligation === 'ambiguous') && a.commitment >= MILITARY_BLOC_MIN_COMMITMENT,
);

/**
 * The createWorld input. `nuclear.warheads` is the FAS military stockpile (usable warheads);
 * retired warheads awaiting dismantlement are in `nuclearForces[id].inventory`.
 */
export const profiles: Record<string, NationProfile> = Object.fromEntries(
  Object.entries(governments).map(([id, government]) => {
    const nf = nuclearForces[id];
    const profile: NationProfile = {
      government,
      blocs: militaryBlocs.filter((a) => a.members.includes(id as never)).map((a) => a.id),
      nuclear: nf ? { warheads: nf.stockpile, deployed: nf.deployed, doctrine: nf.doctrine } : { warheads: 0, deployed: 0, doctrine: 'none' },
      opinions: opinions[id] ?? {},
    };
    return [id, profile];
  }),
);

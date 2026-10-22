/**
 * The opening situation as the player's staff sees it on day one: who we fight, what we have,
 * what intelligence holds of the enemy, and how the country stands. Built only from the
 * player's snapshot (own formations and intel contacts), never from world truth.
 */
import type { NationId } from '../../core/types';
import { DOMAIN_OF_KIND } from '../../systems/orders';
import type { ClientState, NationDetail } from '../snapshot';

export interface OpeningFacts {
  enemies: NationId[];
  own: { land: number; air: number; naval: number; strategic: number };
  /** Enemy formations the player's intelligence holds a fix on. */
  contacts: number;
  /** Cells where a battle for ground is under way. */
  contested: number;
  warSupport: number;
  mobilised: number;
  warheads: number;
  /** Warheads held by the nations the player fights. */
  enemyWarheads: number;
  /** Allies calling on the player to join their war. */
  treatyCalls: number;
}

export function openingFacts(state: ClientState, me: NationId, d: NationDetail | undefined): OpeningFacts {
  const enemies = d?.enemies ?? [];
  const foes = new Set<NationId>(enemies);
  const own = { land: 0, air: 0, naval: 0, strategic: 0 };
  let contacts = 0;
  for (const f of state.formations) {
    if (f.status === 'destroyed') continue;
    if (f.entry.nation === me) {
      const dom = DOMAIN_OF_KIND[f.entry.kind];
      if (dom === 'land' || dom === 'air' || dom === 'naval' || dom === 'strategic') own[dom]++;
    } else if (foes.has(f.entry.nation) && f.contact) contacts++;
  }
  const n = state.nations.get(me);
  return {
    enemies,
    own,
    contacts,
    contested: state.contest.length / 3,
    warSupport: n?.warSupport ?? 0,
    mobilised: n?.mobilization ?? 0,
    warheads: n?.warheads ?? 0,
    enemyWarheads: enemies.reduce((a, e) => a + (state.nations.get(e)?.warheads ?? 0), 0),
    treatyCalls: d?.treatyCalls.length ?? 0,
  };
}

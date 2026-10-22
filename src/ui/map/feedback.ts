/**
 * Which fights and strikes the map shows the player. The event stream carries every battle in the
 * world; the map shows only those the player would know of: ones their side fought, ones on ground
 * their side holds, and ones where their side has forces or a contact. A nuclear detonation and a
 * change of hands are seen by everyone.
 */
import type { NodeId, SimEvent } from '../../core/types';

export interface PlayerSight {
  /** The nation is the player's own or an ally's. */
  friend(nation: string): boolean;
  heldByFriend(node: NodeId): boolean;
  /** The player has forces at the node, or a contact on someone's. */
  forcesAt(node: NodeId): boolean;
}

export function seenOnMap(e: SimEvent, s: PlayerSight): boolean {
  switch (e.type) {
    case 'battle':
      return s.friend(e.attacker) || s.friend(e.defender) || s.heldByFriend(e.node) || s.forcesAt(e.node);
    case 'strike':
      return s.friend(e.by) || s.heldByFriend(e.target) || s.forcesAt(e.target);
    case 'nuclear_detonation':
    case 'node_captured':
      return true;
    default:
      return false;
  }
}

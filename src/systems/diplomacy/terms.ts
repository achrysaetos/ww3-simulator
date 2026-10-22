import type { GameMap } from '../../core/map';
import type { NationId, NodeId, World } from '../../core/types';
import { withinAim } from './aims';
import type { Settlement, War } from './types';

/**
 * The terms a war, or one member's part in it, ends on, applied to the ground and recorded. In a peace by agreement
 * (ceasefire, armistice, separate peace) each party gives back what it holds of the other side's soil beyond its own
 * aim: a punitive war crosses no line, a limited one keeps only its claim, and a war for everything stops on the line
 * where it stands. Only ground taken in this war goes back; what a party held before it stays where it was. The Karabakh statement of 10 Nov 2020 left Azerbaijan what it had taken of its own districts; the
 * Indo-Pakistani ceasefire of 10 May 2025 restored the Line of Control. A capitulation keeps what the victors hold.
 */
export function settle(world: World, map: GameMap, war: War, parties: [NationId[], NationId[]], kind: Settlement['kind'], text: string): Settlement {
  const sideOf = (n: NationId) => (parties[0].includes(n) ? 0 : parties[1].includes(n) ? 1 : -1);
  const returned: NodeId[] = [];
  const taken = new Set(war.taken ?? []);
  const line: Partial<Record<NationId, NodeId[]>> = {};
  for (let n = 0 as NodeId; n < map.landCount; n++) {
    const holder = world.control[n], owner = map.owner[n];
    const [h, o] = [sideOf(holder), sideOf(owner)];
    if (h === -1 || o === -1) continue;
    if (h === o) {
      if (taken.has(n)) (line[holder] ??= []).push(n);
      continue;
    }
    if (kind !== 'capitulation' && taken.has(n) && !withinAim(war.sides[h], owner, n) && world.nations[owner]?.status !== 'capitulated') {
      world.control[n] = owner;
      returned.push(n);
    } else (line[holder] ??= []).push(n);
  }
  const held = new Set<NodeId>();
  for (const cells of Object.values(line)) for (const n of cells ?? []) held.add(n);
  const dmz = new Set<NodeId>();
  for (const n of held)
    for (const m of map.neighbors(n)) {
      if (map.isSea(m) || held.has(m as NodeId)) continue;
      const [a, b] = [sideOf(world.control[n]), sideOf(world.control[m])];
      if (a !== -1 && b !== -1 && a !== b) dmz.add(n).add(m as NodeId);
    }
  return { war: war.id, name: war.name, tick: world.tick, kind, parties, line, returned, dmz: [...dmz].sort((a, b) => a - b), text };
}

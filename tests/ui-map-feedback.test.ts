import { describe, expect, it } from 'vitest';
import type { NationId, NodeId, SimEvent } from '../src/core/types';
import { createSession } from '../src/scenarios';
import { seenOnMap, type PlayerSight } from '../src/ui/map/feedback';

const UKR = 'UKR' as NationId;

describe('battle and strike feedback', () => {
  const sight = (friends: string[], held: number[], forces: number[]): PlayerSight => ({
    friend: (n) => friends.includes(n), heldByFriend: (n) => held.includes(n), forcesAt: (n) => forces.includes(n),
  });
  const battle = (attacker: string, defender: string, node: number): SimEvent => ({ type: 'battle', tick: 1, node: node as NodeId, attacker: attacker as NationId, defender: defender as NationId, losses: {}, casualties: {} });
  const strike = (by: string, target: number): SimEvent => ({ type: 'strike', tick: 1, by: by as NationId, munition: 'x' as never, fired: 1, intercepted: 0, target: target as NodeId, effects: [] });

  it('shows the fights the player would know of and no others', () => {
    const me = sight(['UKR', 'POL'], [10], [20]);
    expect(seenOnMap(battle('RUS', 'UKR', 99), me)).toBe(true);
    expect(seenOnMap(battle('POL', 'BLR', 99), me)).toBe(true);
    expect(seenOnMap(battle('CHN', 'TWN', 10), me)).toBe(true);
    expect(seenOnMap(battle('CHN', 'TWN', 20), me)).toBe(true);
    expect(seenOnMap(battle('CHN', 'TWN', 99), me)).toBe(false);
    expect(seenOnMap(strike('RUS', 10), me)).toBe(true);
    expect(seenOnMap(strike('UKR', 99), me)).toBe(true);
    expect(seenOnMap(strike('CHN', 99), me)).toBe(false);
    expect(seenOnMap({ type: 'nuclear_detonation', tick: 1, by: 'CHN' as NationId, node: 99 as NodeId, yieldKt: 100, casualties: 1 }, me)).toBe(true);
  });

  it('keeps a war the player has no part in off the map in a real game', () => {
    const s = createSession('ukraine-2026', 1);
    const events: SimEvent[] = [];
    for (let i = 0; i < 6; i++) events.push(...s.engine.step(s.world));
    const battles = events.filter((e) => e.type === 'battle');
    expect(battles.length).toBeGreaterThan(0);
    // Played as a nation out of the war, far from it, the map shows none of its fights.
    const far = sight(['BRA'], [], []);
    expect(battles.filter((e) => seenOnMap(e, far))).toEqual([]);
    const near = sight(['UKR'], [], []);
    expect(battles.filter((e) => seenOnMap(e, near)).length).toBe(battles.filter((e) => e.type === 'battle' && (e.attacker === UKR || e.defender === UKR)).length);
  }, 60_000);
});

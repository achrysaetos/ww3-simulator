import type { NationId, World } from '../../core/types';
import type { GameMap } from '../../core/map';
import { pointInRing } from '../../data/occupation';
import { createSession, type Session } from '../../scenarios';

/**
 * A scenario's world moved to the date of a historical case. Only the weather reads the date: it
 * spins up again for the new day on the first step, so the season matches the event.
 */
export function sessionOn(scenarioId: string, seed: number, startDate: string): Session {
  const s = createSession(scenarioId, seed);
  s.world.startDate = startDate;
  return s;
}

export function formationNamed(world: World, nation: string, name: string) {
  const f = Object.values(world.formations).find((x) => x.nation === nation && x.name === name);
  if (!f) throw new Error(`no ${nation} formation named ${name}`);
  return f;
}

/** Sends a formation to a place before the first tick, as scenario garrisons do. */
export function station(world: World, map: GameMap, nation: string, name: string, lat: number, lon: number) {
  const f = formationNamed(world, nation, name);
  f.node = map.nodeAt(lat, lon);
  return f;
}

/** Hands `holder` the cells of `owner` whose centre lies inside `ring` ([lon, lat] points), as OCCUPATIONS does. */
export function occupy(world: World, map: GameMap, holder: string, owner: string, ring: readonly [number, number][]): number {
  let cells = 0;
  for (let n = 0; n < map.landCount; n++) {
    if (map.owner[n] !== owner || !pointInRing(map.lon[n], map.lat[n], ring as [number, number][])) continue;
    world.control[n] = holder as NationId;
    cells++;
  }
  if (!cells) throw new Error(`no ${owner} cell inside the ring for ${holder}`);
  return cells;
}

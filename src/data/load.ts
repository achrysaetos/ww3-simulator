import worldJson from './generated/world.json';
import { GameMap, type WorldData } from '../core/map';

let cached: GameMap | undefined;

/** The real-world map, parsed once per process. */
export function loadMap(): GameMap {
  return (cached ??= new GameMap(worldJson as unknown as WorldData));
}

import { describe, expect, it } from 'vitest';
import { loadMap } from '../src/data/load';
import { fightToShow } from '../src/ui/map/fighting';

const map = loadMap();
const at = (lat: number, lon: number) => ({ lat, lon });
const kharkiv = map.nodeAt(49.99, 36.23), taipei = map.nodeAt(25.03, 121.56), donetsk = map.nodeAt(48.0, 37.8);

describe('the Front view goes to fighting the player knows of', () => {
  it('stays put with no fighting known, or with fighting already in view', () => {
    expect(fightToShow(map, [], at(33.6, 130.4), 150)).toBeNull();
    expect(fightToShow(map, [taipei, kharkiv], at(49.9, 36.4), 150), 'Kharkiv is in view').toBeNull();
  });

  it('otherwise goes to the nearest fighting: from Kyushu to Taiwan, not Ukraine; from Kyiv to the Kharkiv front, not Donetsk', () => {
    expect(fightToShow(map, [kharkiv, taipei], at(33.6, 130.4), 150)).toBe(taipei);
    expect(fightToShow(map, [donetsk, kharkiv], at(50.45, 30.52), 150)).toBe(kharkiv);
  });
});

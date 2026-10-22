import { describe, expect, it } from 'vitest';
import type { NationId, NodeId } from '../src/core/types';
import { loadMap } from '../src/data/load';
import { humanizeMessage, PlaceNamer, type Namer } from '../src/ui/events';
import { nationCards } from '../src/ui/snapshot';

const map = loadMap();

describe('player-facing text', () => {
  it('names nations in everyday form on every reader of the nation cards', () => {
    const cards = new Map(nationCards(map, {}).map((c) => [c.id, c.name]));
    expect(cards.get('KOR' as NationId)).toBe('South Korea');
    expect(cards.get('PRK' as NationId)).toBe('North Korea');
  });

  it('names the nation in a nuclear warning instead of its code', () => {
    const cards = new Map(nationCards(map, {}).map((c) => [c.id, c.name]));
    const n: Namer = { nation: (id) => cards.get(id) ?? id, formation: () => undefined, item: (id) => id, known: () => undefined, place: new PlaceNamer(map) };
    expect(humanizeMessage('RUS warns its enemies that it will use nuclear weapons if the attack on its territory goes on', n))
      .toBe('Russia warns its enemies that it will use nuclear weapons if the attack on its territory goes on');
    expect(humanizeMessage('PAK warns IND that it will use nuclear weapons if the attack on its territory goes on', n))
      .toBe('Pakistan warns India that it will use nuclear weapons if the attack on its territory goes on');
  });

  it('names open sea and empty ground by distance and bearing from a place, not by coordinates', () => {
    const places = new PlaceNamer(map);
    expect(places.name(map.nodeAt(26, 125))).toBe('300 km E of Keelung');
    expect(places.at(map.nodeAt(26, 125))).toBe('300 km E of Keelung');
    for (let n = 0; n < map.size; n++) expect(places.name(n as NodeId), `node ${n}`).not.toMatch(/sea zone/);
  });
});

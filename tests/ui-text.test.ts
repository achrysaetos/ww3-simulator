import { describe, expect, it } from 'vitest';
import type { NationId, NodeId } from '../src/core/types';
import { loadMap } from '../src/data/load';
import { describeEvent, humanizeMessage, PlaceNamer, type Namer } from '../src/ui/events';
import { EventFeed } from '../src/ui/feed';
import { activity } from '../src/ui/FormationPanel';
import { SimHost } from '../src/ui/host';
import { nationCards, type FormationDetail, type FromWorker } from '../src/ui/snapshot';
import { headlines } from '../src/ui/staff/ticker';

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

describe('a resumed game keeps its news', () => {
  it('sends the notable events from before the save with the first snapshot, so the log and ticker are not empty', () => {
    const posts: FromWorker[] = [];
    const host = new SimHost((m) => posts.push(m));
    host.handle({ type: 'start', scenario: 'ukraine-2026', nation: 'UKR' as NationId, seed: 1 });
    for (let i = 0; i < 16; i++) {
      host.handle({ type: 'ack' });
      host.handle({ type: 'step' });
    }
    host.handle({ type: 'save' });
    const saved = posts.find((m) => m.type === 'saved');
    if (saved?.type !== 'saved') throw new Error('no save');
    host.handle({ type: 'quit' });

    const after: FromWorker[] = [];
    const resumed = new SimHost((m) => after.push(m));
    resumed.handle({ type: 'load', text: saved.text });
    const ready = after.find((m) => m.type === 'ready');
    if (ready?.type !== 'ready') throw new Error('no ready');
    expect(ready.snapshot.events).toEqual([]);
    const history = ready.snapshot.history ?? [];
    expect(history.length).toBeGreaterThan(10);
    expect(history.some((e) => e.type === 'war_declared')).toBe(true);
    const n: Namer = { nation: (id) => id, formation: () => undefined, item: (id) => id, known: () => undefined, place: new PlaceNamer(map) };
    const feed = new EventFeed();
    feed.record(history, n);
    expect(headlines(feed, map).length).toBeGreaterThan(0);
    resumed.handle({ type: 'quit' });
  }, 300_000);

  it('describes a strike by the target class the order carries, in the words the strike dropdown uses', () => {
    const detail = { formation: { status: 'active', node: 0, order: { posture: 'strike', target: 0, targetClass: 'soft' } }, engaged: false, trackedBy: [] } as unknown as FormationDetail;
    expect(activity(detail, () => 'near St. Petersburg', (id) => id)).toBe('Striking near St. Petersburg: trucks and soft vehicles.');
  });

  it('counts only aircraft as aircraft in an air battle that also killed troops on the ground', () => {
    const domains: Record<string, string> = { f14a_irn: 'air', infantry_squad: 'land' };
    const n: Namer = { nation: (id) => id, formation: () => undefined, item: (id) => id, known: () => undefined, domain: (id) => domains[id], place: new PlaceNamer(map) };
    const battle = (losses: Record<string, number>, casualties: number) => describeEvent({
      type: 'battle', tick: 0, node: 0 as NodeId, attacker: 'USA' as NationId, defender: 'IRN' as NationId, domain: 'air',
      losses: { IRN: losses } as never, casualties: { IRN: casualties } as never,
    }, n);
    expect(battle({ infantry_squad: 1 }, 9)).toMatch(/Lost: IRN 1 platform, 9 casualties\./);
    expect(battle({ f14a_irn: 1, infantry_squad: 2 }, 20)).toMatch(/Lost: IRN 1 aircraft, 2 platforms, 20 casualties\./);
    expect(battle({ f14a_irn: 2 }, 4)).toMatch(/Lost: IRN 2 aircraft, 4 aircrew\./);
  });
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { NationId } from '../src/core/types';
import { createSession } from '../src/scenarios';
import { humanizeReason, PlaceNamer, type Namer } from '../src/ui/events';
import { Deploy } from '../src/ui/FormationPanel';
import { orderOptions } from '../src/ui/orders/options';
import { Routes } from '../src/ui/routes';
import { SnapshotEncoder } from '../src/ui/snapshot';

const CHN = 'CHN' as NationId;

describe('an amphibious brigade at D+0 of taiwan-2027, as China', () => {
  const s = createSession('taiwan-2027', 1);
  s.world.nations[CHN].controlledBy = 'human';
  const places = new PlaceNamer(s.map);
  const namer: Namer = { nation: (id) => id, formation: () => undefined, item: (id) => id, known: () => undefined, place: places };
  const brigade = Object.values(s.world.formations).find((f) => f.nation === CHN && f.name.startsWith('3rd Amphibious Combined Arms Brigade'))!;
  const detail = new SnapshotEncoder(s.map.nationIds, s.catalog, s.map.size).encode(s.world, s.map, { formation: brigade.id }).focusFormation!;

  it('does not name the cell it holds after the port it is told it is not in', () => {
    expect(detail.portZone).toBeNull();
    const port = new Routes(s.map).nearestPort(brigade.node, (p) => s.world.control[p] === CHN)!;
    expect(places.name(brigade.node)).not.toBe(places.name(port));
  });

  it('offers the amphibious lift it has when it has no cargo ships, instead of saying it has no lift', () => {
    expect(detail.lifts.length).toBeGreaterThan(0);
    expect(detail.deploy!.sealiftGroups).toBe(0);
    const html = renderToStaticMarkup(createElement(Deploy, { d: detail.deploy!, name: brigade.name, amphibious: detail.lifts.length, place: (n) => places.name(n), pendingLift: null, onPick: () => {} }));
    expect(html).not.toContain('Your nation has no cargo-ship groups');
    expect(html).toContain('amphibious lift');
  });

  it('greys Attack and Move across the strait with reasons that point to embarking, not to each other', () => {
    const taichung = s.map.nodeAt(24.15, 120.68);
    const { options } = orderOptions(s.world, s.engine, CHN, [brigade.id], taichung);
    const reason = (key: string) => {
      const o = options.find((x) => x.key === key)!;
      expect(o.ok, key).toEqual([]);
      return humanizeReason(o.refused[0].reason, namer);
    };
    for (const key of ['attack', 'move']) {
      const why = reason(key);
      expect(why, key).toContain('embark on amphibious lift');
      expect(why, key).not.toMatch(/or with a Move order|to embark at$/);
    }
  });
});

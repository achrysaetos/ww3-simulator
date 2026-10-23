import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { NationId } from '../src/core/types';
import { createSession } from '../src/scenarios';
import { pillText } from '../src/ui/drag/estimate';
import { aim } from '../src/ui/drag/gesture';
import { beliefOf, buildKit } from '../src/ui/drag/kit';
import { PlaceNamer } from '../src/ui/events';
import { Deploy } from '../src/ui/FormationPanel';
import { SnapshotEncoder } from '../src/ui/snapshot';
import { controlOf, engineAnswer } from './drag.fixture';

const CHN = 'CHN' as NationId;

describe('an amphibious brigade at D+0 of taiwan-2027, as China', () => {
  const s = createSession('taiwan-2027', 1);
  s.world.nations[CHN].controlledBy = 'human';
  const places = new PlaceNamer(s.map);
  const brigade = Object.values(s.world.formations).find((f) => f.nation === CHN && f.name.startsWith('3rd Amphibious Combined Arms Brigade'))!;
  const detail = new SnapshotEncoder(s.map.nationIds, s.catalog, s.map.size).encode(s.world, s.map, { formation: brigade.id }).focusFormation!;

  it('offers the amphibious lift it has when it has no cargo ships, instead of saying it has no lift', () => {
    expect(detail.lifts.length).toBeGreaterThan(0);
    expect(detail.deploy!.sealiftGroups).toBe(0);
    const html = renderToStaticMarkup(createElement(Deploy, { d: detail.deploy!, name: brigade.name, amphibious: detail.lifts.length, place: (n) => places.name(n) }));
    expect(html).not.toContain('Your nation has no cargo-ship groups');
    expect(html).toMatch(/\d amphibious groups? ha(s|ve) room for it/);
  });

  it('refuses an attack across the strait before release, pointing to amphibious lift, as the engine does', () => {
    s.engine.run(s.world, 1);
    const taichung = s.map.nodeAt(24.15, 120.68);
    const kit = buildKit(beliefOf(s.world, s.map, CHN, s.catalog), s.engine, CHN, [brigade.id])!;
    const a = aim(kit, { node: taichung, contact: null }, s.map, controlOf(s.world, s.map));
    expect(a.target.kind).toBe('enemy_ground');
    expect(a.commands).toEqual([]);
    expect(a.pill).toMatchObject({ kind: 'refused', code: 'no_route' });
    expect(pillText(a.pill).primary).toContain('amphibious lift');
    const engine = engineAnswer(s.world, s.engine, { type: 'order', nation: CHN, formation: brigade.id, order: { posture: 'attack', target: taichung }, byPlayer: true });
    expect(engine).toMatchObject({ ok: false, code: 'no_route' });
  });
});

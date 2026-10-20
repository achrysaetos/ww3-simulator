import { describe, expect, it } from 'vitest';
import type { FormationId, NationId, NodeId, SimEvent } from '../src/core/types';
import { id, testWorld } from '../src/testkit';
import { nationColor, Palette } from '../src/ui/colors';
import { applySnapshot, emptyClientState, nationCards, NO_NATION, SnapshotEncoder } from '../src/ui/snapshot';
import { baseProjection, pickNode, toLonLat, toScreen } from '../src/ui/view';

describe('snapshot codec', () => {
  const setup = () => {
    const t = testWorld();
    const enc = new SnapshotEncoder(t.map.nationIds, t.catalog, t.map.size);
    const client = emptyClientState(t.map.size);
    const cards = new Map(nationCards(t.map, {}).map((c) => [c.id, c]));
    const sync = () => {
      const snap = enc.encode(t.world, t.map);
      applySnapshot(client, snap, t.map.nationIds, cards);
      return snap;
    };
    const decodedControl = () => Array.from(client.control, (i) => (i === NO_NATION ? '' : t.map.nationIds[i]));
    return { ...t, enc, client, sync, decodedControl };
  };

  it('mirrors control exactly, sending a diff for few changes and nothing when unchanged', () => {
    const s = setup();
    const first = s.sync();
    expect(first.control).toBeDefined();
    expect(s.decodedControl()).toEqual(s.world.control);

    const kyiv = s.nodeAt(50.45, 30.52), kharkiv = s.nodeAt(50, 36.2), warsaw = s.nodeAt(52.2, 21);
    s.world.control[kyiv] = id.nation('RUS');
    s.world.control[kharkiv] = id.nation('RUS');
    s.world.control[warsaw] = id.nation('DEU');
    const diff = s.sync();
    expect(diff.control).toBeUndefined();
    expect(diff.controlDiff).toHaveLength(6);
    expect(s.decodedControl()).toEqual(s.world.control);
    expect(s.client.control[kyiv]).toBe(s.map.nationIds.indexOf(id.nation('RUS')));

    const versionBefore = s.client.controlVersion;
    const quiet = s.sync();
    expect(quiet.control).toBeUndefined();
    expect(quiet.controlDiff).toBeUndefined();
    expect(s.client.controlVersion).toBe(versionBefore);

    for (const n of s.map.nodesOf(id.nation('RUS'))) s.world.control[n] = id.nation('CHN');
    const bulk = s.sync();
    expect(bulk.control).toBeDefined();
    expect(s.decodedControl()).toEqual(s.world.control);
  });

  it('sends the roster only when membership changes and decodes strength, posture and target', () => {
    const s = setup();
    const tank = id.platform('t_mbt');
    const a = s.add({ nation: id.nation('POL'), name: 'Alpha', kind: 'maneuver', echelon: 'brigade', node: s.nodeAt(52.2, 21), equipment: { [tank]: 100 } });
    expect(s.sync().roster?.map((r) => r.name)).toEqual(['Alpha']);

    a.equipment[tank] = 25;
    a.order = { posture: 'attack', target: s.nodeAt(53.9, 27.6), issuedTick: 0 };
    expect(s.sync().roster).toBeUndefined();
    const view = s.client.formations[0];
    expect(view.entry.id).toBe(a.id);
    expect(view.strength).toBeCloseTo(0.25, 2);
    expect(view.posture).toBe('attack');
    expect(view.target).toBe(s.nodeAt(53.9, 27.6));

    s.add({ nation: id.nation('RUS'), name: 'Bravo', kind: 'artillery', echelon: 'brigade', node: s.nodeAt(54.8, 32), equipment: { [id.platform('t_spg')]: 18 } });
    expect(s.sync().roster?.map((r) => r.name)).toEqual(['Alpha', 'Bravo']);
    expect(s.client.formations.map((f) => [f.entry.name, f.target])).toEqual([['Alpha', s.nodeAt(53.9, 27.6)], ['Bravo', null]]);
  });

  it('delivers buffered events once, capped with a dropped count', () => {
    const s = setup();
    const msg = (i: number): SimEvent => ({ type: 'message', tick: 0, text: `m${i}` });
    s.enc.collect([msg(1), msg(2)]);
    expect(s.sync().events.map((e) => (e.type === 'message' ? e.text : ''))).toEqual(['m1', 'm2']);
    expect(s.sync().events).toEqual([]);
    s.enc.collect(Array.from({ length: 450 }, (_, i) => msg(i)));
    const capped = s.sync();
    expect(capped.events).toHaveLength(400);
    expect(capped.droppedEvents).toBe(50);
  });

  it('encodes sparse overlays only for affected nodes', () => {
    const s = setup();
    const n = s.nodeAt(55.75, 37.6);
    s.world.theater.infrastructure[n] = 0.4;
    s.world.theater.airControl[n] = { nation: id.nation('USA'), level: 0.8 };
    const snap = s.sync();
    expect(Array.from(snap.infra)).toEqual([n, expect.closeTo(0.4, 5)]);
    expect(Array.from(snap.air)).toEqual([n, s.map.nationIds.indexOf(id.nation('USA')), expect.closeTo(0.8, 5)]);
  });

  it('includes full detail only for the focused formation and nation', () => {
    const s = setup();
    const f = s.add({ nation: id.nation('USA'), name: 'Wing', kind: 'air_wing', echelon: 'wing', node: s.nodeAt(49.4, 7.6), equipment: { [id.platform('t_fighter')]: 24 } });
    expect(s.enc.encode(s.world, s.map).focusFormation).toBeUndefined();
    const snap = s.enc.encode(s.world, s.map, { nation: id.nation('USA'), formation: f.id as FormationId });
    expect(snap.focusFormation?.formation.magazine).toEqual(f.magazine);
    expect(snap.focusNation?.nodesHeld).toBe(s.map.nodesOf(id.nation('USA')).length);
    expect(snap.focusNation?.formations).toBe(1);
  });
});

describe('dashboard detail', () => {
  const nation = (n: string) => id.nation(n);

  it('totals munitions by family across depots and loaded magazines, with nuclear rounds kept apart', () => {
    const t = testWorld();
    const enc = new SnapshotEncoder(t.map.nationIds, t.catalog, t.map.size);
    const ddg = t.add({ nation: nation('USA'), name: 'DESRON', kind: 'surface_group', echelon: 'task_group', node: t.nodeAt(36.9, -76.3), equipment: { [id.platform('t_destroyer')]: 2 } });
    const silos = t.add({ nation: nation('USA'), name: 'Missile wing', kind: 'strategic', echelon: 'wing', node: t.nodeAt(41.1, -104.8), equipment: { [id.platform('t_icbm')]: 50 } });
    t.add({ nation: nation('RUS'), name: 'Not ours', kind: 'surface_group', echelon: 'task_group', node: t.nodeAt(69, 33), equipment: { [id.platform('t_destroyer')]: 4 } });
    t.world.nations[nation('USA')].stockpile = { [id.munition('t_sam')]: 300, [id.platform('t_mbt')]: 40 };
    const d = enc.encode(t.world, t.map, { nation: nation('USA') }).focusNation!;
    const group = (g: string) => d.munitions.find((m) => m.group === g);
    const mag = ddg.magazine as Record<string, number>;
    expect(group('interceptor')).toMatchObject({ warehoused: 300, loaded: mag.t_sam });
    expect(group('cruise')).toMatchObject({ warehoused: 0, loaded: mag.t_cruise + mag.t_asm });
    expect(group('nuclear')).toMatchObject({ loaded: (silos.magazine as Record<string, number>).t_nuke });
    expect(group('ballistic')).toBeUndefined();
    expect(d.nuclear.launchers).toBe(50);
    expect(d.formations).toBe(2);
  });

  it('records how each nation entered a war: its own casus belli, an attack on it, or the treaty that pulled it in', () => {
    const t = testWorld();
    const enc = new SnapshotEncoder(t.map.nationIds, t.catalog, t.map.size);
    const [RUS, POL, DEU, FRA] = ['RUS', 'POL', 'DEU', 'FRA'].map(nation);
    t.world.slices.diplomacy = {
      wars: [{ id: 'w1', aggressor: RUS, sides: [[RUS], [POL, DEU]], startTick: 0 }],
      joins: [{ nation: FRA, war: 'w1', side: 1, dueTick: 12, treaty: 'NATO', kind: 'collective_defense', victim: POL, aggressor: RUS }],
      records: {}, assessment: {}, pressure: {}, offers: {}, ssbnFormations: [], invoked: [],
    };
    enc.collect([
      { type: 'war_declared', tick: 0, by: RUS, on: POL, reason: 'NATO aggression' },
      { type: 'war_declared', tick: 8, by: DEU, on: RUS, reason: 'NATO: defence of POL' },
      { type: 'war_declared', tick: 9, by: DEU, on: RUS, reason: 'later duplicate' },
    ]);
    const [war] = enc.encode(t.world, t.map, { nation: POL }).focusNation!.wars;
    expect(war.sides[0]).toEqual([{ nation: RUS, reason: 'NATO aggression', tick: 0 }]);
    expect(war.sides[1]).toEqual([{ nation: POL, reason: 'attacked by RUS', tick: 0 }, { nation: DEU, reason: 'NATO: defence of POL', tick: 8 }]);
    expect(war.pending).toEqual([{ nation: FRA, treaty: 'NATO', side: 1, dueTick: 12 }]);
    expect(enc.encode(t.world, t.map, { nation: FRA }).focusNation!.wars).toEqual([]);
  });

  it('reports a focused formation as engaged and cut off from the land slice', () => {
    const t = testWorld();
    const enc = new SnapshotEncoder(t.map.nationIds, t.catalog, t.map.size);
    const f = t.add({ nation: nation('UKR'), name: 'Bde', kind: 'maneuver', echelon: 'brigade', node: t.nodeAt(48.5, 37.9), equipment: { [id.platform('t_mbt')]: 30 } });
    const quiet = enc.encode(t.world, t.map, { formation: f.id }).focusFormation!;
    expect(quiet).toMatchObject({ engaged: false, isolatedDays: 0, supplyFlow: null, trackedBy: [] });
    t.world.slices.land = { baseline: { [f.id]: 30 }, isolatedDays: { [f.id]: 3.5 }, contest: {}, fortified: {}, origin: [] };
    expect(enc.encode(t.world, t.map, { formation: f.id }).focusFormation).toMatchObject({ engaged: true, isolatedDays: 3.5 });
  });
});

describe('nation colors', () => {
  const hueDist = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

  it('is a pure function of id and blocs', () => {
    expect(nationColor('USA', ['NATO'])).toEqual(nationColor('USA', ['NATO']));
    const p1 = new Palette(() => ['NATO']), p2 = new Palette(() => ['NATO']);
    p2.of('POL');
    p2.of('DEU');
    expect(p1.of('USA')).toEqual(p2.of('USA'));
  });

  it('puts bloc members in one hue family and rivals far apart', () => {
    const nato = ['USA', 'GBR', 'POL', 'DEU', 'FRA', 'TUR'].map((n) => nationColor(n, ['NATO']).hsl[0]);
    const csto = ['RUS', 'BLR', 'KAZ'].map((n) => nationColor(n, ['CSTO']).hsl[0]);
    for (const h of nato) expect(hueDist(h, 214)).toBeLessThanOrEqual(13);
    for (const h of csto) expect(hueDist(h, 2)).toBeLessThanOrEqual(13);
    for (const a of nato) for (const b of csto) expect(hueDist(a, b)).toBeGreaterThan(120);
  });

  it('distinguishes nations within a bloc', () => {
    const css = ['USA', 'GBR', 'POL', 'DEU', 'FRA'].map((n) => nationColor(n, ['NATO']).css);
    expect(new Set(css).size).toBe(css.length);
  });
});

describe('map picking', () => {
  const { map } = testWorld();
  const proj = baseProjection(1400, 700);
  const city = (name: string) => map.cities.find((c) => c.name === name)!;

  it.each(['Paris', 'Kiev', 'Tokyo', 'Washington, D.C.', 'Canberra', 'Buenos Aires'])('a click on %s selects its cell at any pan and zoom', (name) => {
    const c = city(name);
    for (const t of [{ k: 1, x: 0, y: 0 }, { k: 6, x: -3500, y: -900 }, { k: 23, x: 12_000, y: -5_000 }]) {
      const [sx, sy] = toScreen(proj, t, c.lon, c.lat)!;
      expect(pickNode(map, proj, t, sx, sy)).toBe(c.node);
    }
  });

  it('distinguishes adjacent cells and ignores clicks off the globe', () => {
    const t = { k: 10, x: -6000, y: -2000 };
    const paris = city('Paris');
    const [sx, sy] = toScreen(proj, t, paris.lon + 1, paris.lat)!;
    const east = pickNode(map, proj, t, sx, sy) as NodeId;
    expect(east).not.toBe(paris.node);
    expect(map.lon[east] - map.lon[paris.node]).toBeCloseTo(1);
    expect(toLonLat(proj, { k: 1, x: 0, y: 0 }, 2, 2)).toBeNull();
    expect(map.owner[paris.node]).toBe('FRA' as NationId);
  });
});

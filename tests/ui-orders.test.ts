import { describe, expect, it } from 'vitest';
import type { FormationId, NodeId, RefusalCode, SimEvent } from '../src/core/types';
import { geography } from '../src/systems/naval/geography';
import { id, testWorld } from '../src/testkit';
import { describeEvent, humanizeMessage, PlaceNamer, type Namer } from '../src/ui/events';
import { EventFeed } from '../src/ui/feed';
import { Routes } from '../src/ui/routes';
import { SnapshotEncoder } from '../src/ui/snapshot';

const N = id.nation;
const t = testWorld();
const names: Record<string, string> = { USA: 'United States', CHN: 'China', RUS: 'Russia', UKR: 'Ukraine', TWN: 'Taiwan' };
const formations: Record<string, string> = { f264: '1st Armored Brigade Combat Team' };
const namer: Namer = {
  nation: (n) => names[n] ?? n,
  formation: (f) => formations[f],
  item: (i) => (i === 't_mbt' ? 'Main battle tank' : i),
  known: (i) => (i === 'f16v' ? 'F-16V' : undefined),
  place: new PlaceNamer(t.map),
};
const kyiv = t.nodeAt(50.45, 30.52), warsaw = t.nodeAt(52.2, 21), elPaso = t.nodeAt(31.8, -106.4);
const battle = (over: Partial<Extract<SimEvent, { type: 'battle' }>>): SimEvent => ({
  type: 'battle', tick: 4, node: kyiv, attacker: N('RUS'), defender: N('UKR'), losses: {}, casualties: {}, ...over,
});

const refusal = (tick: number, code: RefusalCode = 'no_route', reason = 'no sea route to node 17677'): SimEvent =>
  ({ type: 'command_result', tick, nation: N('USA'), command: 'order', formation: 'f264' as FormationId, byPlayer: true, ok: false, code, reason });

describe('event wording', () => {
  it('names nations and places, never prints "-0", and gives each fight its domain', () => {
    const ground = describeEvent(battle({ losses: { [N('RUS')]: { [id.platform('t_mbt')]: 3 }, [N('UKR')]: {} }, casualties: { [N('RUS')]: 120, [N('UKR')]: 0 } }), namer);
    expect(ground).toMatch(/^Ground battle (at|near) Kiev: Russia attacks Ukraine\. Lost: Russia 3 platforms, 120 casualties\.$/);
    expect(ground).not.toMatch(/-0|UKR|RUS/);
    const sea = describeEvent(battle({ domain: 'sea', attacker: N('CHN'), defender: N('TWN'), losses: { [N('TWN')]: { [id.platform('t_lst')]: 2 } }, casualties: { [N('TWN')]: 90 } }), namer);
    expect(sea).toMatch(/^Naval engagement .*China attacks Taiwan's ships\. Lost: Taiwan 2 ships, 90 sailors\.$/);
    const air = describeEvent(battle({ domain: 'air', losses: { [N('UKR')]: { [id.platform('t_fighter')]: 1 } }, casualties: { [N('UKR')]: 1 } }), namer);
    expect(air).toMatch(/^Air battle (over|near) Kiev: Russia against Ukraine\. Lost: Ukraine 1 aircraft, 1 aircrew\.$/);
  });

  it('names front-line towns the city list lacks, and a port\'s sea zone after the port', () => {
    const p = new PlaceNamer(t.map);
    expect(p.name(t.nodeAt(48.72, 37.56))).toMatch(/Kramatorsk|Pokrovsk/);
    expect(p.name(t.nodeAt(59.38, 28.19))).toMatch(/Narva/);
    expect(p.name(t.nodeAt(51.73, 36.19))).toMatch(/Kursk/);
    const busan = geography(t.map).portZone.get(t.map.cities.find((c) => c.name === 'Busan')!.node)!;
    expect(p.name(busan)).toMatch(/^off .*Busan/);
  });

  it('turns command results with internal ids into names, places, a reason or an arrival time', () => {
    const text = describeEvent(refusal(3, 'no_route', `no sea route to node ${warsaw}`), namer);
    expect(text).toBe('1st Armored Brigade Combat Team: order refused, no sea route to Warsaw');
    const land = describeEvent(refusal(3, 'no_route', `no land route to node ${warsaw}`), namer);
    expect(land).toMatch(/^1st Armored Brigade Combat Team: order refused, no land route to Warsaw\. .*embarking at a port/);
    const accepted: SimEvent = { type: 'command_result', tick: 3, nation: N('USA'), command: 'order', formation: 'f264' as FormationId, byPlayer: true, ok: true, code: 'accepted', reason: 'order accepted', etaHours: 60 };
    expect(describeEvent(accepted, namer)).toBe('1st Armored Brigade Combat Team: order accepted, there in about 3 days');
    expect(describeEvent({ ...accepted, code: 'relayed', etaHours: 12 }, namer)).toBe('1st Armored Brigade Combat Team: order relayed down a degraded chain of command, arrives in about 12 h');
    expect(humanizeMessage('USA offers peace to CHN', namer)).toBe('United States offers peace to China, which has not accepted');
    expect(humanizeMessage('USA declines to honour US-TWN-TRA for TWN', namer)).toBe('United States declines to honour the Taiwan Relations Act for Taiwan');
    for (const s of [text, land]) expect(s).not.toMatch(/\bf\d+\b|node \d+/);
  });

  it('names platforms in strike damage reports', () => {
    const e: SimEvent = { type: 'strike', tick: 1, by: N('CHN'), munition: id.munition('t_cruise'), fired: 6, intercepted: 2, target: kyiv, effects: [{ kind: 'runway', before: 1, after: 0.78 }, { kind: 'losses', platforms: { [id.platform('f16v')]: 1 } }] };
    expect(describeEvent(e, namer)).toMatch(/runway capacity cut from 100% to 78%; destroyed or damaged 1 F-16V$/);
  });
});

describe('event feed', () => {

  it('folds a repeated line into one row with a count, and starts a new row after a week', () => {
    const feed = new EventFeed();
    for (let tick = 0; tick < 22; tick++) feed.record([refusal(tick)], namer);
    expect(feed.rows.messages).toHaveLength(1);
    expect(feed.rows.messages[0]).toMatchObject({ repeats: 22, firstTick: 0 });
    feed.record([refusal(21 + 29)], namer);
    expect(feed.rows.messages).toHaveLength(2);
  });

  it('drops fights that cost nothing and keeps diplomacy when combat floods the log', () => {
    const feed = new EventFeed();
    feed.record([battle({ losses: { [N('RUS')]: { [id.platform('t_mbt')]: 0 } }, casualties: { [N('RUS')]: 0 } })], namer);
    expect(feed.counts.combat).toBe(0);
    feed.record([{ type: 'war_declared', tick: 0, by: N('RUS'), on: N('UKR'), reason: 'invasion' }], namer);
    for (let i = 0; i < 3_000; i++) feed.record([battle({ tick: i, casualties: { [N('RUS')]: i + 1 } })], namer);
    expect(feed.rows.diplomacy).toHaveLength(1);
    expect(feed.counts.combat).toBe(3_000);
    const newest = feed.newest(new Set(), null, 5);
    expect(newest.map((r) => r.seq)).toEqual([...newest.map((r) => r.seq)].sort((a, b) => b - a));
    expect(feed.newest(new Set(['combat']), null, 5).map((r) => r.event.type)).toEqual(['war_declared']);
  });
});

describe('order planning', () => {
  const routes = new Routes(t.map);

  it('knows a ground move from Texas to Warsaw crosses the sea and one from Kiev does not', () => {
    expect(routes.overseas(elPaso, warsaw)).toBe(true);
    expect(routes.overseas(kyiv, warsaw)).toBe(false);
  });

  it('finds the nearest port on the same land mass', () => {
    const port = routes.nearestPort(elPaso, (p) => t.map.owner[p] === 'USA')!;
    expect(geography(t.map).portZone.has(port)).toBe(true);
    expect(t.map.owner[port]).toBe('USA');
    expect(routes.overseas(elPaso, port)).toBe(false);
  });
});

describe('player decisions in the snapshot', () => {
  it('offers lift groups that can carry the unit, marking the one it can board in its port', () => {
    const w = testWorld();
    const enc = new SnapshotEncoder(w.map.nationIds, w.catalog, w.map.size);
    const ports = [...geography(w.map).portZone.entries()].filter(([p]) => w.map.owner[p] === 'POL');
    const [port, zone] = ports[0];
    const brigade = w.add({ nation: N('POL'), name: 'Bde', kind: 'maneuver', echelon: 'brigade', node: port as NodeId, equipment: { [id.platform('t_mbt')]: 30 } });
    const here = w.add({ nation: N('POL'), name: 'Lift here', kind: 'surface_group', echelon: 'task_group', node: zone, equipment: { [id.platform('t_lst')]: 4 } });
    const away = w.add({ nation: N('POL'), name: 'Lift away', kind: 'surface_group', echelon: 'task_group', node: zone, equipment: { [id.platform('t_lst')]: 1 } });
    away.node = ports[ports.length - 1][1];
    w.add({ nation: N('POL'), name: 'Ferries', kind: 'surface_group', echelon: 'task_group', node: zone, equipment: { [id.platform('t_ferry')]: 4 } });
    const d = enc.encode(w.world, w.map, { formation: brigade.id }).focusFormation!;
    expect(d.portZone).toBe(zone);
    expect(d.lifts.map((l) => l.name)).toContain('Lift here');
    expect(d.lifts.find((l) => l.id === here.id)).toMatchObject({ boardNow: true, share: 1 });
    expect(d.lifts.map((l) => l.name)).not.toContain('Ferries');
  });

  it("lists a human nation's pending treaty call, open peace offers and sanctions", () => {
    const w = testWorld();
    const enc = new SnapshotEncoder(w.map.nationIds, w.catalog, w.map.size);
    const [USA, CHN, TWN, RUS] = ['USA', 'CHN', 'TWN', 'RUS'].map(N);
    w.world.slices.diplomacy = {
      wars: [{
        id: 'w1', name: 'CHN-TWN war', since: 0, theatre: w.world.nations[TWN].capital,
        sides: [{ leader: CHN, members: { [CHN]: { joined: 0, via: 'declared' } } }, { leader: TWN, members: { [TWN]: { joined: 0, via: 'attacked' } } }],
      }],
      joins: [{ nation: USA, war: 'w1', side: 1, dueTick: 24, treaty: 'US-TWN-TRA', kind: 'ambiguous', victim: TWN, aggressor: CHN }],
      records: {}, assessment: {}, pressure: {}, offers: { 'CHN|USA': CHN }, access: {}, aid: {}, rev: 0, ssbnFormations: [], invoked: [], umbrella: [],
    };
    w.world.relations['RUS|USA'] = { ...w.world.relations['RUS|USA'], sanctions: true };
    const d = enc.encode(w.world, w.map, { nation: USA }).focusNation!;
    expect(d.treatyCalls).toEqual([{ war: 'w1', treaty: 'US-TWN-TRA', victim: TWN, aggressor: CHN, dueTick: 24, reconsidered: false }]);
    expect(d.peaceOffers).toEqual([{ from: CHN, to: USA }]);
    expect(d.sanctions).toEqual([RUS]);
    expect(d.authority.ai).toMatchObject({ land: true, strategic: false });
    expect(d.authority.held).toEqual([] as FormationId[]);
  });
});

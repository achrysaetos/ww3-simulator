import { afterAll, describe, expect, it } from 'vitest';
import type { Command, FormationId, NationId, NodeId } from '../src/core/types';
import { geography } from '../src/systems/naval/geography';
import { liftMode } from '../src/systems/land/strategic';
import { id, testWorld } from '../src/testkit';
import { createSession } from '../src/scenarios';
import { briefingFor, objectives, outcome } from '../src/ui/briefing';
import { checkCommand } from '../src/ui/commands';
import { SimHost } from '../src/ui/host';
import { CONTEST_STRIDE, emptyClientState, SnapshotEncoder, applySnapshot, type FromWorker, type ToWorker } from '../src/ui/snapshot';

const N = id.nation;

describe('command boundary', () => {
  const w = testWorld();
  const mine = w.add({ nation: N('UKR'), name: 'Bde', kind: 'maneuver', echelon: 'brigade', node: w.nodeAt(50.45, 30.52), equipment: { [id.platform('t_mbt')]: 30 } });
  const theirs = w.add({ nation: N('RUS'), name: 'Their Bde', kind: 'maneuver', echelon: 'brigade', node: w.nodeAt(55.75, 37.6), equipment: { [id.platform('t_mbt')]: 30 } });
  const check = (c: unknown) => checkCommand(w.world, w.map, w.catalog, N('UKR'), c);

  it("refuses commands for another nation, another nation's units, and unknown postures, numbers or items", () => {
    expect(check({ type: 'set_mobilization', nation: 'RUS', level: 1 })).toMatchObject({ ok: false });
    expect(check({ type: 'order', nation: 'UKR', formation: theirs.id, order: { posture: 'move', target: 5 } })).toMatchObject({ ok: false, reason: expect.stringMatching(/not yours/) });
    expect(check({ type: 'order', nation: 'UKR', formation: mine.id, order: { posture: 'teleport', target: 5 } })).toMatchObject({ ok: false, reason: expect.stringMatching(/posture/) });
    expect(check({ type: 'order', nation: 'UKR', formation: mine.id, order: { posture: 'move', target: w.map.size + 4 } })).toMatchObject({ ok: false });
    expect(check({ type: 'set_mobilization', nation: 'UKR', level: Number.NaN })).toMatchObject({ ok: false });
    expect(check({ type: 'produce', nation: 'UKR', item: 'death_star', ratePerMonth: 1 })).toMatchObject({ ok: false });
    expect(check({ type: 'nuclear_release', nation: 'UKR', target: 3, warheads: 1, munition: 't_cruise' })).toMatchObject({ ok: false });
    expect(check({ type: 'delegate', nation: 'UKR', domain: 'everything', ai: true })).toMatchObject({ ok: false });
    expect(check({ type: 'hold', nation: 'UKR', formations: [mine.id, theirs.id], held: true })).toMatchObject({ ok: false });
    expect(check({ type: 'self_destruct', nation: 'UKR' })).toMatchObject({ ok: false });
  });

  it('passes a nuclear alert for the own nation only', () => {
    expect(check({ type: 'nuclear_alert', nation: 'UKR' })).toEqual({ ok: true, command: { type: 'nuclear_alert', nation: 'UKR', reason: undefined } });
    expect(check({ type: 'nuclear_alert', nation: 'RUS' })).toMatchObject({ ok: false });
  });

  it('passes a valid order through rebuilt, keeping only known fields', () => {
    const r = check({ type: 'order', nation: 'UKR', formation: mine.id, order: { posture: 'move', target: 7, lift: 'sea', path: [1, 2, 3], issuedTick: -5 }, extra: 1 });
    expect(r).toEqual({ ok: true, command: { type: 'order', nation: 'UKR', formation: mine.id, order: { posture: 'move', target: 7, lift: 'sea' } } });
  });
});

describe('strategic lift choice', () => {
  it("sends an air-portable unit by sea when its order asks for ships, and by air otherwise", () => {
    const w = testWorld();
    w.add({ nation: N('USA'), name: 'Airlift wing', kind: 'logistics', echelon: 'wing', node: w.nodeAt(38.9, -77), equipment: { [id.platform('t_airlifter')]: 50 } });
    const light = w.add({ nation: N('USA'), name: 'Light Bde', kind: 'maneuver', echelon: 'brigade', node: w.nodeAt(35.1, -79), equipment: { [id.platform('t_inf')]: 300 } });
    light.order = { posture: 'move', target: w.nodeAt(52.2, 21), issuedTick: 0 };
    expect(liftMode(w.world, w.catalog, light)).toBe('air');
    light.order.lift = 'sea';
    expect(liftMode(w.world, w.catalog, light)).toBe('sea');
  });

  it('shows cargo ships and airlift under deployment, offers only troop-carrying groups for embarkation, and none to an airlift wing', () => {
    const w = testWorld();
    const enc = new SnapshotEncoder(w.map.nationIds, w.catalog, w.map.size);
    const [port, zone] = [...geography(w.map).portZone.entries()].find(([p]) => w.map.owner[p] === 'USA')!;
    const at = port as NodeId;
    const bde = w.add({ nation: N('USA'), name: 'Bde', kind: 'maneuver', echelon: 'brigade', node: at, equipment: { [id.platform('t_mbt')]: 30, [id.platform('t_inf')]: 300 } });
    const wing = w.add({ nation: N('USA'), name: 'Airlift wing', kind: 'logistics', echelon: 'wing', node: at, equipment: { [id.platform('t_airlifter')]: 50 } });
    w.add({ nation: N('USA'), name: 'Amphibs', kind: 'surface_group', echelon: 'task_group', node: zone, equipment: { [id.platform('t_lst')]: 4 } });
    w.add({ nation: N('USA'), name: 'RRF', kind: 'surface_group', echelon: 'task_group', node: zone, equipment: { [id.platform('t_lmsr')]: 4 } });
    w.add({ nation: N('USA'), name: 'Escorts', kind: 'surface_group', echelon: 'task_group', node: zone, equipment: { [id.platform('t_destroyer')]: 4 } });
    const d = enc.encode(w.world, w.map, { formation: bde.id }).focusFormation!;
    expect(d.lifts.map((l) => l.name)).toEqual(['Amphibs']);
    expect(d.deploy).toMatchObject({ airPortable: false, sealiftGroups: 1, sealiftSlots: 3600, atWar: false, deploying: null });
    expect(d.deploy!.airliftTonsPerDay).toBeGreaterThan(0);
    const wd = enc.encode(w.world, w.map, { formation: wing.id }).focusFormation!;
    expect(wd.lifts).toEqual([]);
    expect(wd.deploy).toBeNull();
  });

  it('counts room already taken aboard a lift group', () => {
    const w = testWorld();
    const enc = new SnapshotEncoder(w.map.nationIds, w.catalog, w.map.size);
    const [port, zone] = [...geography(w.map).portZone.entries()].find(([p]) => w.map.owner[p] === 'USA')!;
    const bde = w.add({ nation: N('USA'), name: 'Bde', kind: 'maneuver', echelon: 'brigade', node: port as NodeId, equipment: { [id.platform('t_inf')]: 10 } });
    bde.personnel = 100;
    const lift = w.add({ nation: N('USA'), name: 'Amphibs', kind: 'surface_group', echelon: 'task_group', node: zone, equipment: { [id.platform('t_lst')]: 1 } });
    const before = enc.encode(w.world, w.map, { formation: bde.id }).focusFormation!.lifts[0].share;
    const rider = w.add({ nation: N('USA'), name: 'Aboard', kind: 'maneuver', echelon: 'brigade', node: zone, equipment: { [id.platform('t_inf')]: 10 } });
    rider.personnel = 450;
    rider.status = 'embarked';
    rider.embarkedOn = lift.id;
    const after = enc.encode(w.world, w.map, { formation: bde.id }).focusFormation!.lifts;
    expect(before).toBe(1);
    expect(after.find((l) => l.id === lift.id)?.share).toBeCloseTo(0.5);
  });
});

describe('fronts inside a cell', () => {
  const contested = () => {
    const w = testWorld();
    w.war('RUS', 'UKR');
    const enc = new SnapshotEncoder(w.map.nationIds, w.catalog, w.map.size);
    const kharkiv = w.nodeAt(49.75, 36.25);
    w.world.control[w.nodeAt(50.25, 36.25)] = N('RUS');
    w.world.slices.land = { baseline: {}, isolatedDays: {}, contest: { [kharkiv]: { by: N('RUS'), km: 1e6 } }, fortified: {}, origin: [], shellsFired: {}, airlifted: {}, airheads: {} };
    return { w, enc, kharkiv };
  };

  it('sends how far an attacker has pushed across each contested cell, and which way, from the ground its side holds next door', () => {
    // Russia holds the cell north of Kharkiv, and only that one: the push runs due south.
    const { w, enc, kharkiv } = contested();
    const [node, by, share, east, north] = enc.encode(w.world, w.map).contest;
    expect(CONTEST_STRIDE).toBe(5);
    expect([node, by, share]).toEqual([kharkiv, w.map.nationIds.indexOf(N('RUS')), 1]);
    expect(east).toBeCloseTo(0, 5);
    expect(north).toBeCloseTo(-1, 5);
    w.world.slices.land.contest[kharkiv].km = 0;
    expect(enc.encode(w.world, w.map).contest[2]).toBe(0);
  });

  it('shows a contest to its two sides and keeps it from a nation that neither fights nor watches there', () => {
    const { w, enc, kharkiv } = contested();
    for (const viewer of ['UKR', 'RUS']) expect([...enc.encode(w.world, w.map, {}, N(viewer)).contest.subarray(0, 1)]).toEqual([kharkiv]);
    expect(enc.encode(w.world, w.map, {}, N('FRA')).contest).toHaveLength(0);
  });
});

describe('nuclear options', () => {
  it("lists only the nation's own loaded weapons, with each launcher's position and reach", () => {
    const w = testWorld();
    const enc = new SnapshotEncoder(w.map.nationIds, w.catalog, w.map.size);
    const silo = w.add({ nation: N('GBR'), name: 'Silo', kind: 'strategic', echelon: 'squadron', node: w.nodeAt(52, -1), equipment: { [id.platform('t_icbm')]: 10 } });
    silo.magazine = { [id.munition('t_nuke')]: 10 };
    w.add({ nation: N('RUS'), name: 'Their silo', kind: 'strategic', echelon: 'squadron', node: w.nodeAt(55, 37), equipment: { [id.platform('t_icbm')]: 10 } }).magazine = { [id.munition('t_nuke_tac')]: 4 };
    const weapons = enc.encode(w.world, w.map, { nation: N('GBR') }).focusNation!.nuclear.weapons;
    expect(weapons).toEqual([{ munition: 't_nuke', sites: [{ node: silo.node, reachKm: 12000, rounds: 10 }] }]);
  });
});

describe('nuclear alert and greenfield ceilings in the nation view', () => {
  it('shows stored versus mated warheads and the ceiling for items with no line, and an alert changes the view', () => {
    const s = createSession('south-asia-2027', 1);
    const PAK = N('PAK');
    const enc = new SnapshotEncoder(s.map.nationIds, s.catalog, s.map.size);
    const view = () => enc.encode(s.world, s.map, { nation: PAK }).focusNation!;
    const a = view().nuclear.alert;
    expect(a.stored).toBeGreaterThan(0);
    expect(a.mated).toBe(s.world.nations[PAK].nuclear.deployed);
    expect(a).toMatchObject({ canOrder: true, ordered: null });
    s.world.pending.push({ type: 'nuclear_alert', nation: PAK });
    s.engine.step(s.world);
    expect(view().nuclear.alert).toMatchObject({ canOrder: false, ordered: { of: a.stored } });
    const lines = view().economy!;
    const noLine = Object.keys(lines.greenfield);
    expect(noLine.length).toBeGreaterThan(0);
    expect(noLine.some((i) => lines.capacity[i])).toBe(false);
    expect(Object.values(lines.greenfield).every((v) => v > 0)).toBe(true);
  });
});

describe('objectives and the end of the game', () => {
  const w = testWorld();
  const ids = w.map.nationIds;
  const state = emptyClientState(w.map.size);
  const enc = new SnapshotEncoder(ids, w.catalog, w.map.size);
  const cards = new Map(ids.map((n) => [n, { id: n, name: n, blocs: [], doctrine: 'none' as const, gdpUsdB: 0 }]));
  const sync = () => applySnapshot(state, enc.encode(w.world, w.map), ids, cards);
  const b = briefingFor(w.map, 'taiwan-2027', N('TWN'));

  it('tracks the places to hold and declares defeat when the nation capitulates', () => {
    sync();
    const ever = new Set([N('CHN')]);
    const objs = objectives(state, ids, b, N('TWN'), [N('CHN')], ever);
    expect(objs.map((o) => o.label)).toEqual(['Hold Taipei', 'Hold Kaohsiung', 'Force CHN to capitulate or make peace']);
    expect(outcome(state, N('TWN'), [N('CHN')], ever, objs)).toBeNull();
    w.world.control[b.hold[0].node] = N('CHN');
    w.world.nations[N('TWN')].status = 'capitulated';
    sync();
    const lost = objectives(state, ids, b, N('TWN'), [N('CHN')], ever);
    expect(lost[0]).toEqual({ label: 'Hold Taipei', met: false });
    expect(outcome(state, N('TWN'), [N('CHN')], ever, lost)?.kind).toBe('defeat');
  });

  it('declares victory when every enemy fought has capitulated', () => {
    w.world.nations[N('TWN')].status = 'peace';
    w.world.nations[N('CHN')].status = 'capitulated';
    w.world.control[b.hold[0].node] = N('TWN');
    sync();
    const ever = new Set([N('CHN')]);
    const objs = objectives(state, ids, b, N('TWN'), [], ever);
    expect(outcome(state, N('TWN'), [], ever, objs)).toMatchObject({ kind: 'victory' });
  });
});

describe('worker host', () => {
  const posts: FromWorker[] = [];
  const host = new SimHost((m) => posts.push(m));
  const last = <T extends FromWorker['type']>(t: T) => posts.filter((m) => m.type === t).at(-1) as Extract<FromWorker, { type: T }> | undefined;
  const lastAnswer = () => posts.flatMap((m) => (m.type === 'snapshot' ? m.snapshot.events : [])).filter((e) => e.type === 'command_result').at(-1);
  afterAll(() => host.handle({ type: 'quit' }));

  it('starts, refuses a command for another nation, saves, quits and resumes the same war as the same nation', () => {
    host.handle({ type: 'start', scenario: 'korea-2027', nation: N('KOR'), seed: 3 });
    expect(last('ready')?.playing).toBe('KOR');
    const world = host.world!;
    host.handle({ type: 'command', command: { type: 'set_mobilization', nation: N('PRK'), level: 0 } });
    expect(lastAnswer()).toMatchObject({ command: 'set_mobilization', ok: false, code: 'not_yours', reason: expect.stringMatching(/you command KOR/) });
    expect(world.pending.some((c: Command) => c.type === 'set_mobilization' && c.nation === 'PRK' && c.level === 0)).toBe(false);
    host.handle({ type: 'command', command: { type: 'set_mobilization', nation: N('KOR'), level: 0.9 } });
    expect(world.pending.at(-1)).toEqual({ type: 'set_mobilization', nation: 'KOR', level: 0.9 });
    host.handle({ type: 'step' });
    host.handle({ type: 'ack' });
    host.handle({ type: 'save' });
    const saved = last('saved')!;
    expect(saved).toMatchObject({ scenario: 'korea-2027', tick: world.tick });
    host.handle({ type: 'quit' });
    expect(last('closed')).toBeDefined();
    expect(host.world).toBeNull();
    host.handle({ type: 'load', text: saved.text });
    expect(last('ready')?.playing).toBe('KOR');
    expect(host.world!.tick).toBe(saved.tick);
    expect(host.world!.nations[N('KOR')].controlledBy).toBe('human');
    host.handle({ type: 'load', text: '{"format":"not-a-save"}' });
    expect(last('load_failed')?.message).toMatch(/not a ww3 save/);
    expect(host.world!.tick).toBe(saved.tick);
  });

  it('keeps the player on the nation chosen at the start: the old switch message does nothing', () => {
    host.handle({ type: 'play_as', nation: N('PRK') as NationId } as ToWorker);
    host.handle({ type: 'command', command: { type: 'hold', nation: N('PRK'), formations: [] as FormationId[], held: true } });
    expect(lastAnswer()).toMatchObject({ command: 'hold', ok: false, code: 'not_yours', reason: expect.stringMatching(/you command KOR/) });
    expect(host.world!.nations[N('PRK')].controlledBy).toBe('ai');
  });
});

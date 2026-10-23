import { beforeAll, describe, expect, it } from 'vitest';
import type { Formation, FormationId, NodeId, SimEvent } from '../src/core/types';
import { saveRun } from '../src/scenarios/save';
import { checkCommand } from '../src/ui/commands';
import { pillText } from '../src/ui/drag/estimate';
import { aim, classify, frontage, INTENTS, ORDERS, type IntentKind, type TargetKind } from '../src/ui/drag/gesture';
import { SIDE, SUBJECT_OF_KIND, type DragKit, type SubjectClass } from '../src/ui/drag/kit';
import { SimHost } from '../src/ui/host';
import { OrderTracks } from '../src/ui/orders/tracks';
import { POSTURES, type FromWorker } from '../src/ui/snapshot';
import { controlOf, donbas, kitOf, russia, RUS, UKR, type Session } from './drag.fixture';

const TARGET_KINDS: readonly TargetKind[] = ['enemy_contact', 'enemy_ground', 'own_front', 'own_ground', 'neutral_ground', 'enemy_waters', 'sea'];
const CLASSES = Object.keys(ORDERS) as SubjectClass[];

let s: Session;
let control: Uint16Array;
let kit: DragKit;
/** One node of each target kind, found on the live map from the player's side of it. */
const at = {} as Record<TargetKind, { node: NodeId; contact: FormationId | null }>;

beforeAll(() => {
  s = russia();
  control = controlOf(s.world, s.map);
  kit = kitOf(s, donbas(s));
  const { map } = s;
  const side = (n: number) => kit.sides[control[n]];
  const touches = (n: number, want: number) => [...map.neighbors(n as NodeId)].some((m) => m < map.landCount && control[m] !== 0xffff && side(m) === want);
  const find = (pred: (n: number) => boolean, from = 0, to = map.size) => {
    for (let n = from; n < to; n++) if (pred(n)) return n as NodeId;
    throw new Error('no such node');
  };
  const contact = Object.values(kit.contacts).find((c) => c.domain === 'ground' && c.conf > 0.5)!;
  at.enemy_contact = { node: contact.node, contact: contact.id };
  at.enemy_ground = { node: map.nodeAt(50.45, 30.52), contact: null };
  at.own_front = { node: find((n) => control[n] !== 0xffff && side(n) === SIDE.own && touches(n, SIDE.hostile), 0, map.landCount), contact: null };
  at.own_ground = { node: map.nodeAt(55.75, 37.62), contact: null };
  at.neutral_ground = { node: find((n) => control[n] !== 0xffff && side(n) === SIDE.neutral, 0, map.landCount), contact: null };
  at.enemy_waters = { node: find((n) => touches(n, SIDE.hostile), map.landCount), contact: null };
  at.sea = { node: map.nodeAt(0, -150), contact: null };
}, 120_000);

/** One of the player's formations of each subject class, the strongest of its kind. */
function oneOf(cls: SubjectClass): FormationId | undefined {
  const fs = Object.values(s.world.formations).filter((f) => f.nation === RUS && f.status === 'active' && !f.embarkedOn && SUBJECT_OF_KIND[f.kind] === cls);
  const size = (f: Formation) => Object.values(f.equipment).reduce((a, b) => a + b, 0);
  return fs.sort((a, b) => size(b) - size(a) || (a.id < b.id ? -1 : 1))[0]?.id;
}

describe('the drag table', () => {
  it('names an intent row with a real posture for every cell', () => {
    for (const cls of CLASSES)
      for (const [kind, intent] of Object.entries(ORDERS[cls]) as [TargetKind, IntentKind][]) {
        expect(TARGET_KINDS, `${cls} -> ${kind}`).toContain(kind);
        expect(POSTURES).toContain(INTENTS[intent].posture);
      }
  });

  it('classifies a node of every target kind', () => {
    for (const kind of TARGET_KINDS) expect(classify(at[kind], s.map, control, kit).kind, kind).toBe(kind);
    expect(classify({ node: at.enemy_contact.node, contact: null }, s.map, control, kit).kind, 'the ground under a contact').not.toBe('enemy_contact');
  });

  it('refuses every missing cell before release and sends nothing, and takes every present one', () => {
    for (const cls of CLASSES) {
      const id = oneOf(cls);
      if (!id) continue;
      const k = kitOf(s, [id]);
      for (const kind of TARGET_KINDS) {
        const a = aim(k, at[kind], s.map, control);
        const want = (ORDERS[cls] as Partial<Record<TargetKind, IntentKind>>)[kind];
        if (want) {
          expect(a.intent, `${cls} on ${kind}`).toBe(want);
          continue;
        }
        expect(a.pill, `${cls} on ${kind}`).toMatchObject({ kind: 'refused', code: kind === 'neutral_ground' ? 'neutral_territory' : 'wrong_role' });
        expect(a.commands).toEqual([]);
        expect(pillText(a.pill).tone).toBe('refused');
      }
    }
  });
});

describe('aiming a stack', () => {
  it('builds orders the command boundary passes unchanged, with byPlayer left for the host', () => {
    let checked = 0;
    for (const kind of ['enemy_ground', 'own_front', 'own_ground', 'enemy_contact'] as const) {
      for (const cmd of aim(kit, at[kind], s.map, control).commands) {
        expect(cmd).not.toHaveProperty('byPlayer');
        const c = checkCommand(s.world, s.map, s.engine.catalog, RUS, cmd);
        expect(c, JSON.stringify(cmd)).toEqual({ ok: true, command: cmd });
        checked++;
      }
    }
    for (const cls of ['fires', 'air', 'fleet'] as const) {
      const k = kitOf(s, [oneOf(cls)!]);
      for (const kind of TARGET_KINDS)
        for (const cmd of aim(k, at[kind], s.map, control).commands) {
          expect(checkCommand(s.world, s.map, s.engine.catalog, RUS, cmd), JSON.stringify(cmd)).toEqual({ ok: true, command: cmd });
          checked++;
        }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('holds a front with one contiguous own-front cell per unit, each unit to its own cell', () => {
    const cells = frontage(s.map, control, kit, at.own_front.node, 4);
    expect(cells[0]).toBe(at.own_front.node);
    expect(new Set(cells).size).toBe(cells.length);
    expect(cells.length).toBeGreaterThan(1);
    cells.forEach((c, i) => {
      expect(classify({ node: c, contact: null }, s.map, control, kit).kind, `cell ${c}`).toBe('own_front');
      if (i) expect(cells.slice(0, i).some((p) => [...s.map.neighbors(p)].includes(c)), `cell ${c} joins the front`).toBe(true);
    });
    const a = aim(kit, at.own_front, s.map, control);
    expect(a.intent).toBe('hold_front');
    const targets = new Set(a.commands.map((c) => (c.type === 'order' ? c.order.target : undefined)));
    expect(targets.size).toBe(Math.min(a.going.length, a.cells.length));
    for (const t of targets) expect(a.cells).toContain(t);
  });

  it('sends the intent most of the stack’s power can do and says who stays', () => {
    const ad = oneOf('air_defense')!;
    const k = kitOf(s, [...donbas(s), ad]);
    const a = aim(k, at.enemy_ground, s.map, control);
    expect(a.intent).toBe('attack');
    expect(a.staying).toContain(ad);
    expect(a.going).not.toContain(ad);
    expect(a.pill.who.staying).toBeGreaterThanOrEqual(1);
    expect(pillText(a.pill).secondary).toMatch(/\d stays?/);
  });

  it('is followed on the map from sent to the engine’s answer when sent through the host', () => {
    const posts: FromWorker[] = [];
    const host = new SimHost((m) => posts.push(m));
    const events: SimEvent[] = [];
    const drain = () => {
      for (const m of posts.splice(0)) {
        if (m.type !== 'ready' && m.type !== 'snapshot') continue;
        events.push(...m.snapshot.events);
        host.handle({ type: 'ack' });
      }
    };
    host.handle({ type: 'load', text: saveRun('ukraine-2026', s.world) });
    drain();
    const next = [...s.map.neighbors(kit.units[0].node)].find((n) => s.world.control[n] === UKR)!;
    const a = aim(kit, { node: next, contact: null }, s.map, control);
    expect(a.intent).toBe('attack');
    const cmd = a.commands[0];
    const formation = cmd.type === 'order' ? cmd.formation : ('' as FormationId);
    const tracks = new OrderTracks();
    tracks.sent(formation, 'Attack', a.target.node, s.world.tick);
    host.handle({ type: 'command', command: cmd });
    for (let i = 0; i < 12 && !['accepted', 'refused'].includes(tracks.get(formation)?.state ?? ''); i++) {
      const seen = events.length;
      host.handle({ type: 'step' });
      drain();
      tracks.observe(events.slice(seen), host.world!.tick);
    }
    expect(tracks.get(formation)?.state).toBe('accepted');
    expect(host.world!.formations[formation].order).toMatchObject({ posture: 'attack', target: a.target.node });
  }, 120_000);
});

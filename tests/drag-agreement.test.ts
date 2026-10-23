import { expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { Command, Formation, FormationId, NodeId, RefusalCode } from '../src/core/types';
import { aim, INTENTS } from '../src/ui/drag/gesture';
import { SUBJECT_OF_KIND, type DragKit } from '../src/ui/drag/kit';
import { controlOf, engineAnswer, kitOf, russia, RUS } from './drag.fixture';

const WANT = 200;

it('refuses before release only orders the engine refuses for the same reason', () => {
  const s = russia();
  const { map } = s;
  const control = controlOf(s.world, map);
  const units = Object.values(s.world.formations)
    .filter((f) => f.nation === RUS && f.status === 'active' && !f.embarkedOn && SUBJECT_OF_KIND[f.kind])
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const kits = new Map<FormationId, DragKit>();
  const near = new Map<FormationId, NodeId[]>();
  const rng = new Rng(7);
  const codes = new Map<RefusalCode, number>();
  let refusals = 0, notReady = 0;
  for (let tries = 0; refusals < WANT && tries < 20_000; tries++) {
    const f: Formation = rng.pick(units);
    // Half the aims land within reach of a drag on screen, half anywhere on the map.
    const around = near.get(f.id) ?? near.set(f.id, map.nodesWithin(f.node, 2500)).get(f.id)!;
    const node = rng.chance(0.5) ? rng.pick(around) : (rng.int(0, map.size) as NodeId);
    const kit = kits.get(f.id) ?? kits.set(f.id, kitOf(s, [f.id])).get(f.id)!;
    const a = aim(kit, { node, contact: null }, map, control);
    if (a.pill.kind !== 'refused' || !a.intent) continue;
    const u = kit.units[0];
    const cmd: Command = { type: 'order', nation: RUS, formation: f.id, order: INTENTS[a.intent].order(u, a.target, a.target.node, kit, map), byPlayer: true };
    const answer = engineAnswer(s.world, s.engine, cmd)!;
    // A ship in a yard availability is refused before its route is looked at; that is the unit's state, not the aim.
    if (!answer.ok && answer.code === 'not_ready') {
      notReady++;
      continue;
    }
    expect(answer, `${f.name} (${f.kind}) ${a.intent} at ${node}: pill says ${a.pill.code} (${a.pill.reason})`).toMatchObject({ ok: false, code: a.pill.code });
    codes.set(a.pill.code, (codes.get(a.pill.code) ?? 0) + 1);
    refusals++;
  }
  expect(refusals).toBe(WANT);
  expect(notReady, 'yard-bound ships stay a small share of the sample').toBeLessThan(WANT / 4);
  expect(codes.size, JSON.stringify([...codes])).toBeGreaterThanOrEqual(2);
}, 300_000);

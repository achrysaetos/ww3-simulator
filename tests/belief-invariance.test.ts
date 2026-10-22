import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Command, Formation, NationId, NodeId, World } from '../src/core/types';
import { createSession } from '../src/scenarios';
import { resumeRun, saveRun } from '../src/scenarios/save';
import { assess, enemyMap } from '../src/systems/diplomacy/assess';
import { estimate } from '../src/systems/intel';
import { SnapshotEncoder } from '../src/ui/snapshot';

const UKR = 'UKR' as NationId, RUS = 'RUS' as NationId;
type Session = ReturnType<typeof resumeRun>;

const russian = (world: World) => Object.values(world.formations).filter((f) => f.nation === RUS && f.status === 'active' && !f.embarkedOn);
/** Russian formations Ukraine's intelligence holds no contact on. */
const hidden = (world: World) => russian(world).filter((f) => !estimate(world, UKR, f.id));

/**
 * Russian truth no Ukrainian sensor has seen since its last fix. Ground and missile formations move
 * next to Kyiv: a tracked one is believed where it was last fixed until the next intel pass. Formations
 * with no contact are also halved. Every Russian formation changes what a fix cannot see: its orders
 * (an assault toward Kyiv), readiness, morale, supply and magazines (CE-2's probes p5, p15).
 */
function mutate(s: Session, near: NodeId[]): number {
  const unseen = new Set(hidden(s.world));
  russian(s.world).forEach((f: Formation, i) => {
    if (f.kind === 'maneuver' || f.kind === 'artillery' || f.kind === 'missile') f.node = near[i % near.length];
    if (unseen.has(f))
      for (const k of Object.keys(f.equipment) as (keyof Formation['equipment'])[]) f.equipment[k] = Math.ceil(f.equipment[k] / 2);
    f.order = { posture: 'attack', target: near[(i + 1) % near.length], issuedTick: s.world.tick };
    f.magazine = {};
    f.supply = { fuel: 0, ammo: 0, food: 0 };
    f.readiness = 0.2;
    f.morale = 0.1;
  });
  return unseen.size;
}

/** One nation's AI orders over the next four planning ticks (strategy, land and tasking all come due). Only it plans, so no other nation's draws move the shared RNG. */
function ordersOf(s: Session, nation: NationId): Command[] {
  const ai = s.engine.systems.find((x) => x.id === 'ai')!;
  for (const n of Object.values(s.world.nations)) if (n.id !== nation) n.status = 'peace';
  const t0 = s.world.tick;
  const out: Command[] = [];
  for (let k = 0; k < 4; k++) {
    s.world.tick = t0 + k;
    s.world.pending = [];
    ai.step(s.world, s.engine.context(s.world));
    out.push(...s.world.pending.filter((c) => c.nation === nation));
  }
  s.world.tick = t0;
  return out;
}
const ukrainianOrders = (s: Session) => ordersOf(s, UKR);

describe('hidden truth changes nothing Ukraine decides or sees', () => {
  it('ukraine-2026 day 3: changing Russian truth no Ukrainian sensor has seen leaves its AI orders, its client snapshot and its diplomatic assessment unchanged', () => {
    const s = createSession('ukraine-2026', 1);
    s.engine.run(s.world, 12);
    const saved = saveRun('ukraine-2026', s.world);
    const control = resumeRun(saved), probe = resumeRun(saved);
    const kyiv = probe.world.nations[UKR].capital;
    const near = probe.map.nodesWithin(kyiv, 180).filter((n) => n < probe.map.landCount && n !== kyiv);
    expect(mutate(probe, near)).toBeGreaterThan(20);
    expect(hidden(probe.world).length).toBe(hidden(control.world).length);

    const snapshot = (x: Session) => {
      const enc = new SnapshotEncoder(x.map.nationIds, x.catalog, x.map.size);
      return [enc.encode(x.world, x.map, { nation: UKR }, UKR), enc.encode(x.world, x.map, { nation: RUS }, UKR)];
    };
    expect(snapshot(probe)).toEqual(snapshot(control));

    const situation = (x: Session) => assess(x.world, x.map, enemyMap(x.world)).nations[UKR];
    expect(situation(probe)).toEqual(situation(control));

    const orders = ukrainianOrders(control);
    expect(orders.length).toBeGreaterThan(0);
    expect(ukrainianOrders(probe)).toEqual(orders);
  }, 300_000);
});

describe('minefields a side has not charted change nothing it decides', () => {
  it('gulf-2027 day 6: Iranian mines sown unseen around the US fleet leave US AI orders unchanged; charted ones change them', () => {
    const USA = 'USA' as NationId, IRN = 'IRN' as NationId;
    const s = createSession('gulf-2027', 1);
    s.engine.run(s.world, 24);
    const saved = saveRun('gulf-2027', s.world);
    const control = resumeRun(saved), hidden = resumeRun(saved), charted = resumeRun(saved);
    const fleet = Object.values(control.world.formations).filter((f) => f.nation === USA && f.status === 'active' && (f.kind === 'surface_group' || f.kind === 'submarine'));
    expect(fleet.length, 'US naval groups').toBeGreaterThan(3);
    const known = new Set(control.world.slices.naval.charted[USA] ?? []);
    const sown = [...new Set(fleet.flatMap((f) => control.map.nodesWithin(f.node, 700)))].filter((z) => control.map.isSea(z) && !known.has(z));
    expect(sown.length, 'zones sown').toBeGreaterThan(5);
    for (const x of [hidden, charted]) for (const z of sown) (x.world.slices.naval.mines[z] ??= {})[IRN] = 200;
    for (const z of sown) (charted.world.slices.naval.charted[USA] ??= []).push(z);

    const orders = ordersOf(control, USA);
    expect(orders.length).toBeGreaterThan(0);
    expect(ordersOf(hidden, USA)).toEqual(orders);
    expect(ordersOf(charted, USA)).not.toEqual(orders);
  }, 300_000);

  it('no AI planner reads the true minefields: they go through View.minefields', () => {
    const dir = path.resolve(import.meta.dirname, '../src/systems/ai');
    const offenders = fs.readdirSync(dir).filter((f) => /slices\.naval\??\.mines/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});

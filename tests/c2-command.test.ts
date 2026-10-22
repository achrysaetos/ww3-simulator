import { beforeAll, describe, expect, it } from 'vitest';
import { Engine } from '../src/core/engine';
import { addFormation } from '../src/core/forces';
import type { FormationId, NationId, PlatformId, World } from '../src/core/types';
import { createSession, type Session } from '../src/scenarios';
import { SYSTEMS } from '../src/systems';

const UKR = 'UKR' as NationId, RUS = 'RUS' as NationId;

let s: Session;
beforeAll(() => {
  s = createSession('ukraine-2026', 1);
  s.engine.run(s.world, 8);
}, 300_000);

const fieldHqs = (w: World, n: NationId) => Object.values(w.slices.c2.hqs).filter((h) => h.nation === n && h.level !== 'national');
const directSubs = (w: World) => {
  const out = new Map<string, FormationId[]>();
  for (const [f, h] of Object.entries(w.slices.c2.chain)) (out.get(h) ?? out.set(h, []).get(h)!).push(f as FormationId);
  return out;
};

describe('ukraine-2026: a command tree that one strike cannot paralyse (Red Team CE-3)', () => {
  it('Ukraine fights through some twenty corps of a handful of brigades each, not five fronts', () => {
    const subs = directSubs(s.world);
    const ukr = fieldHqs(s.world, UKR).filter((h) => subs.has(h.id));
    // Main: five derived front HQs, one commanding 76 formations.
    expect(ukr.length).toBeGreaterThanOrEqual(15);
    for (const h of ukr) expect(subs.get(h.id)!.length, h.name).toBeLessThanOrEqual(8);
  });

  it('losing the busiest Ukrainian HQ degrades a few brigades, and its alternate CP keeps them fighting', () => {
    const w = structuredClone(s.world);
    const subs = directSubs(w);
    const busiest = fieldHqs(w, UKR).sort((a, b) => (subs.get(b.id)?.length ?? 0) - (subs.get(a.id)?.length ?? 0))[0];
    const calm = structuredClone(w);
    busiest.integrity = 0;
    new Engine(s.map, s.catalog, SYSTEMS).step(w);
    new Engine(s.map, s.catalog, SYSTEMS).step(calm);
    const ukr = Object.values(w.formations).filter((f) => f.nation === UKR && f.kind === 'maneuver' && w.slices.c2.formations[f.id] && calm.slices.c2.formations[f.id]);
    const hurt = ukr.filter((f) => w.slices.c2.formations[f.id].coordination < calm.slices.c2.formations[f.id].coordination - 0.02);
    // Main: the 76 formations of one front HQ, half the army, lose a quarter of their fire.
    expect(hurt.length / ukr.length).toBeLessThan(0.15);
    for (const id of subs.get(busiest.id)!) if (w.slices.c2.formations[id]) expect(w.slices.c2.formations[id].coordination).toBeGreaterThan(0.8);
  }, 300_000);
});

describe('ukraine-2026: command posts disperse and displace (Red Team CE-11)', () => {
  it('no more than three HQs of one nation share a cell', () => {
    for (const n of [UKR, RUS]) {
      const at = new Map<number, number>();
      for (const h of fieldHqs(s.world, n)) at.set(h.node, (at.get(h.node) ?? 0) + 1);
      // Main: nine Russian army HQs in one cell, so one salvo rolls against all of them.
      expect(Math.max(...at.values()), n).toBeLessThanOrEqual(3);
    }
  });

  it('a Russian army HQ hit by a strike its enemy aimed with eyes on it moves out of the cell it was hit in', () => {
    const w = structuredClone(s.world), calm = structuredClone(s.world);
    const e = new Engine(s.map, s.catalog, SYSTEMS);
    const hq = fieldHqs(w, RUS).find((h) => h.id.startsWith('RUS:army:') && s.map.nodesWithin(h.node, 110).some((n) => w.control[n] === UKR))!;
    const node = hq.node;
    const site = s.map.nodesWithin(node, 110).find((n) => w.control[n] === UKR)!;
    const battery = addFormation(w, s.catalog, { nation: UKR, name: 'test Tochka battalion', kind: 'missile', echelon: 'battalion', node: site, equipment: { ['tochka_tel' as PlatformId]: 240 } });
    battery.order = { posture: 'strike', target: node, targetClass: 'hardened', issuedTick: w.tick };
    const spotters = addFormation(w, s.catalog, { nation: UKR, name: 'test recon company', kind: 'maneuver', echelon: 'battalion', node: [...s.map.neighbors(node)].find((n) => !s.map.isSea(n))!, equipment: { ['infantry_squad' as PlatformId]: 10 } });
    spotters.order = { posture: 'defend', issuedTick: w.tick };
    e.step(w);
    e.step(calm);
    expect(w.slices.c2.hqs[hq.id].integrity).toBeLessThan(1);
    battery.order = { posture: 'reserve', issuedTick: w.tick };
    // Main: it stays in or comes back to the cell its subordinates make best, the target of the next salvo.
    let stayed = 0;
    for (let t = 0; t < 8; t++) {
      e.step(w);
      e.step(calm);
      expect(w.slices.c2.hqs[hq.id].node).not.toBe(node);
      if (calm.slices.c2.hqs[hq.id].node === node) stayed++;
    }
    // Unstruck, the same HQ keeps to that cell.
    expect(stayed).toBeGreaterThanOrEqual(4);
  }, 300_000);
});

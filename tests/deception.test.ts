import { beforeAll, describe, expect, it } from 'vitest';
import { platformCount } from '../src/core/forces';
import type { Command, Deception, Formation, NationId, NodeId, World } from '../src/core/types';
import { createSession, type Session } from '../src/scenarios';
import { warningOf } from '../src/systems/intel';

const PRK = 'PRK' as NationId, KOR = 'KOR' as NationId, RUS = 'RUS' as NationId, UKR = 'UKR' as NationId;

interface Attack { warnedTick: number; surprised: boolean; cas: Record<string, number> }

/**
 * peace-2027 with North Korea under the player's hand: ten second-echelon corps march to the DMZ over
 * ten days, then the North declares war and hands its army to the AI for three days.
 */
function attack(deception?: Deception): Attack {
  const s = createSession('peace-2027', 1);
  const { map } = s.engine;
  const w = s.world;
  w.nations[PRK].controlledBy = 'human';
  const dmz = [...Array(map.landCount).keys()].filter((n) => w.control[n] === PRK && [...map.neighbors(n as NodeId)].some((m) => w.control[m] === KOR)) as NodeId[];
  const second = Object.values(w.formations).filter((f) => f.nation === PRK && f.kind === 'maneuver' && !dmz.some((b) => map.distanceKm(b, f.node) < 120)).slice(0, 10);
  second.forEach((f, i) => w.pending.push({ type: 'order', nation: PRK, formation: f.id, byPlayer: true, order: { posture: 'move', target: dmz[i % dmz.length], ...(deception && { deception }) } }));
  let warnedTick = -1;
  for (let t = 0; t < 40; t++) {
    s.engine.step(w);
    if (warnedTick < 0 && warningOf(w, KOR)?.from === PRK) warnedTick = t;
  }
  w.pending.push({ type: 'declare_war', nation: PRK, target: KOR } as Command, { type: 'delegate', nation: PRK, domain: 'land', ai: true });
  const cas: Record<string, number> = {};
  let surprised = false;
  for (let t = 0; t < 12; t++) {
    for (const e of s.engine.step(w)) if (e.type === 'battle') for (const [n, c] of Object.entries(e.casualties)) cas[n] = (cas[n] ?? 0) + c;
    surprised ||= !!w.slices.c2.surprised[KOR];
  }
  return { warnedTick, surprised, cas };
}

describe('peace-2027: a build-up hidden by radio silence and dispersal buys surprise (Red Team CE-5)', () => {
  let open: Attack, hidden: Attack;
  beforeAll(() => {
    open = attack();
    hidden = attack({ emcon: true, disperse: true });
  }, 600_000);

  it('South Korea is warned of a build-up in the open, and not of a concealed one', () => {
    expect(open.warnedTick).toBeGreaterThanOrEqual(0);
    // Main: Order.deception does not exist, so the concealed corps are seen like the rest.
    expect(hidden.warnedTick).toBe(-1);
  });

  it('a war out of a concealed build-up catches the South unready, and the North trades better for it', () => {
    expect(open.surprised).toBe(false);
    expect(hidden.surprised).toBe(true);
    const exchange = (a: Attack) => (a.cas.KOR ?? 0) / (a.cas.PRK ?? 1);
    expect(exchange(hidden)).toBeGreaterThan(1.2 * exchange(open));
  });
});

describe('ukraine-2026: what overhead sensors make of feints and decoys', () => {
  let s: Session;
  /** A Russian formation in the rear, beyond the reach of Ukrainian troops' eyes, and a cell further back. */
  let deep: Formation, back: NodeId;
  const rearCell = (w: World, f: Formation) => s.map.nodesWithin(f.node, 200).find((n) => n !== f.node && w.control[n] === RUS && !s.map.nodesWithin(n as NodeId, 150).some((m) => w.control[m] === UKR)) as NodeId;
  beforeAll(() => {
    s = createSession('ukraine-2026', 1);
    // A player's Russia: the AI leaves formations the player has ordered alone.
    s.world.nations[RUS].controlledBy = 'human';
    s.engine.step(s.world);
    deep = Object.values(s.world.formations).find((f) => f.nation === RUS && f.kind === 'maneuver' && f.status === 'active' && !s.map.isSea(f.node) && !s.map.nodesWithin(f.node, 150).some((m) => s.world.control[m] === UKR) && rearCell(s.world, f) !== undefined)!;
    back = rearCell(s.world, deep);
  }, 300_000);

  it('a formation that leaves mock-ups behind is still placed by satellites and drones where it stood', () => {
    const w = structuredClone(s.world);
    const from = deep.node;
    w.pending.push({ type: 'order', nation: RUS, formation: deep.id, byPlayer: true, order: { posture: 'move', target: back, deception: { decoy: from } } });
    let fooled = 0, seen = 0;
    for (let t = 0; t < 24; t++) {
      s.engine.step(w);
      const c = w.slices.intel.pictures[UKR]?.[deep.id];
      if (!c || c.tick !== w.tick - 1 || w.formations[deep.id].node === from) continue;
      seen++;
      if (c.node === from) fooled++;
    }
    expect(seen).toBeGreaterThan(0);
    // Main: every fresh overhead fix finds it where it really is.
    expect(fooled).toBe(seen);
  }, 300_000);

  it('a feinting formation on the line reads as a far larger force', () => {
    const w = structuredClone(s.world);
    const line = Object.values(w.formations).find((f) => f.nation === RUS && f.kind === 'maneuver' && f.status === 'active' && w.control[f.node] === RUS && [...s.map.neighbors(f.node)].some((m) => Object.values(w.formations).some((g) => g.nation === UKR && g.node === m)))!;
    // Out of its garrison, where it is known for what it is, into the next cell along the line.
    const next = [...s.map.neighbors(line.node)].find((m) => w.control[m] === RUS && [...s.map.neighbors(m)].some((k) => w.control[k] === UKR))!;
    w.pending.push({ type: 'order', nation: RUS, formation: line.id, byPlayer: true, order: { posture: 'move', target: next, deception: { feint: true } } });
    const real = platformCount(line);
    let read = 0;
    for (let t = 0; t < 16 && !read; t++) {
      s.engine.step(w);
      const c = w.slices.intel.pictures[UKR]?.[line.id];
      if (c && c.tick === w.tick - 1 && c.source !== 'base' && c.source !== 'territory' && w.formations[line.id].order.deception?.feint) read = c.strength;
    }
    // Main: the fix is within its source's error of the true strength.
    expect(read).toBeGreaterThan(2 * real);
  }, 300_000);
});

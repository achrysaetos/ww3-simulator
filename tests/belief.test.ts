import { describe, expect, it } from 'vitest';
import type { Command, Formation, NationId, NodeId, World } from '../src/core/types';
import { createSession } from '../src/scenarios';
import { estimate, warningOf } from '../src/systems/intel';
import { CURRENT_CONFIDENCE } from '../src/systems/intel/view';
import { checkCommand } from '../src/ui/commands';
import { applySnapshot, emptyClientState, nationCards, SnapshotEncoder, type ClientState } from '../src/ui/snapshot';

const UKR = 'UKR' as NationId, RUS = 'RUS' as NationId, ISR = 'ISR' as NationId, IRN = 'IRN' as NationId, KOR = 'KOR' as NationId, PRK = 'PRK' as NationId;
const USA = 'USA' as NationId, MEX = 'MEX' as NationId;
type Session = ReturnType<typeof createSession>;

const live = (world: World, nation: NationId) => Object.values(world.formations).filter((f) => f.nation === nation && f.status === 'active' && !f.embarkedOn);

/** What the client of `viewer` holds after one snapshot. */
function clientOf(s: Session, viewer: NationId): ClientState {
  const enc = new SnapshotEncoder(s.map.nationIds, s.catalog, s.map.size);
  const client = emptyClientState(s.map.size);
  applySnapshot(client, enc.encode(s.world, s.map, {}, viewer), s.map.nationIds, new Map(nationCards(s.map, {}).map((c) => [c.id, c])));
  return client;
}

describe('CE-1: the player sees enemy forces only through its intelligence', () => {
  it('as Ukraine on day 1 of ukraine-2026, every Russian formation on the map is a contact estimate, and those without a contact are missing', () => {
    const s = createSession('ukraine-2026', 1);
    s.engine.run(s.world, 4);
    const russian = clientOf(s, UKR).formations.filter((f) => f.entry.nation === RUS);
    const truth = live(s.world, RUS);
    expect(russian.length).toBeGreaterThan(0);
    expect(russian.length).toBeLessThan(truth.length);
    for (const f of russian) {
      const fix = estimate(s.world, UKR, f.entry.id);
      expect(fix, f.entry.name).toBeDefined();
      expect(f.node).toBe(fix!.node);
      expect(f.posture).toBeNull();
      expect(f.target).toBeNull();
      expect(f.contact?.ageHours).toBe(Math.round(fix!.ageHours));
    }
    for (const f of clientOf(s, UKR).formations.filter((x) => x.entry.nation === UKR)) expect(f.contact).toBeNull();
  }, 120_000);

  it("as Israel in gulf-2027, Iran's missile and drone bases its intelligence has not found are not on the map", () => {
    const s = createSession('gulf-2027', 1);
    s.engine.run(s.world, 12);
    const hidden = live(s.world, IRN).filter((f) => f.kind === 'missile' && !estimate(s.world, ISR, f.id));
    expect(hidden.length).toBeGreaterThan(0);
    const shown = new Set(clientOf(s, ISR).formations.map((f) => f.entry.id));
    expect(hidden.filter((f) => shown.has(f.id)).map((f) => f.name)).toEqual([]);
  }, 120_000);
});

describe('a client reading Views between ticks', () => {
  it('leaves the run exactly as a headless one, though the Views and beliefs it builds are cached on the world', () => {
    const headless = createSession('ukraine-2026', 1), watched = createSession('ukraine-2026', 1);
    const enc = new SnapshotEncoder(watched.map.nationIds, watched.catalog, watched.map.size);
    for (let t = 0; t < 12; t++) {
      headless.engine.step(headless.world);
      enc.collect(watched.engine.step(watched.world));
      enc.encode(watched.world, watched.map, { nation: RUS }, UKR);
      enc.encode(watched.world, watched.map, { nation: UKR }, RUS);
    }
    expect(JSON.stringify(watched.world)).toBe(JSON.stringify(headless.world));
  }, 120_000);
});

describe('CE-1: a player strike needs a current fix', () => {
  it('refuses a strike on a Russian formation Ukraine has no contact on, with the same answer as an unknown id, and accepts one on a current contact', () => {
    const s = createSession('ukraine-2026', 1);
    s.engine.run(s.world, 4);
    const shooter = live(s.world, UKR).find((f) => f.kind === 'missile')!;
    const russian = live(s.world, RUS);
    const unseen = russian.find((f) => !estimate(s.world, UKR, f.id))!;
    const seen = russian.find((f) => (estimate(s.world, UKR, f.id)?.confidence ?? 0) >= CURRENT_CONFIDENCE)!;
    const strike = (target: Formation | { id: string; node: NodeId }) =>
      checkCommand(s.world, s.map, s.catalog, UKR, { type: 'order', nation: UKR, formation: shooter.id, order: { posture: 'strike', target: target.node, targetFormation: target.id } });

    const refused = strike(unseen);
    expect(refused.ok).toBe(false);
    expect(refused).toEqual(strike({ id: 'f-no-such-formation', node: unseen.node }));
    expect(strike(seen)).toEqual({ ok: true, command: { type: 'order', nation: UKR, formation: shooter.id, order: { posture: 'strike', target: seen.node, targetFormation: seen.id } } });
  }, 120_000);
});

describe('CE-5: indications and warning', () => {
  /** peace-2027 for four days, with every KPA manoeuvre formation marched to the DMZ in the build-up branch. */
  function korea(buildUp: boolean) {
    const s = createSession('peace-2027', 1);
    const { world, map } = s;
    const dmz: NodeId[] = [];
    for (let n = 0; n < map.landCount; n++)
      if (world.control[n] === PRK && [...map.neighbors(n as NodeId)].some((m) => m < map.landCount && world.control[m] === KOR)) dmz.push(n as NodeId);
    if (buildUp)
      live(world, PRK)
        .filter((f) => f.kind === 'maneuver')
        .forEach((f, i) => world.pending.push({ type: 'order', nation: PRK, formation: f.id, order: { posture: 'move', target: dmz[i % dmz.length] } }));
    const warnings: string[] = [];
    const korOrders: Command[] = [];
    for (let t = 0; t < 16; t++) {
      for (const e of s.engine.step(world)) if (e.type === 'message' && e.nation === KOR && e.text.startsWith('warning')) warnings.push(e.text);
      korOrders.push(...world.pending.filter((c) => c.nation === KOR));
    }
    const defending = live(world, KOR).filter((f) => f.kind === 'maneuver' && f.order.posture === 'defend' && f.order.target !== undefined);
    return { warning: warningOf(world, KOR), warnings, korOrders, defending };
  }

  it('a KPA build-up on the DMZ in peacetime warns South Korea, whose army deploys to the border before any shot', () => {
    const b = korea(true);
    expect(b.warning?.from).toBe(PRK);
    expect(b.warnings.length).toBeGreaterThan(0);
    expect(b.warnings[0]).toContain('PRK forces massing');
    expect(b.korOrders.some((c) => c.type === 'order' && c.order.posture === 'defend')).toBe(true);
    expect(b.defending.length).toBeGreaterThan(5);
  }, 120_000);

  it('US forces that never left the Mexican border, lost from view and then seen again, do not read as massing (X1 M11)', () => {
    // peace-2027: the US units next to Mexico shift one cell along the border, dispersed and silent, so Mexico's contacts
    // go stale for a week; then they stand down in the open and are re-fixed. Base warned "about 1967 platforms against 756".
    const s = createSession('peace-2027', 1);
    const { world, map } = s;
    const near = (n: NodeId) => world.control[n] === MEX || [...map.neighbors(n)].some((m) => m < map.landCount && world.control[m] === MEX);
    const border = live(world, USA).filter((f) => (f.kind === 'maneuver' || f.kind === 'artillery') && f.node < map.landCount && near(f.node));
    expect(border.length).toBeGreaterThan(4);
    const warnings: string[] = [];
    const days = (n: number) => {
      for (let t = 0; t < (n * 24) / world.dtHours; t++) for (const e of s.engine.step(world)) if (e.type === 'message' && e.nation === MEX && e.text.startsWith('warning')) warnings.push(e.text);
    };
    days(2);
    for (const f of border) {
      const to = [...map.neighbors(f.node)].find((m) => m < map.landCount && world.control[m] === USA && near(m as NodeId));
      if (to !== undefined) world.pending.push({ type: 'order', nation: USA, formation: f.id, order: { posture: 'move', target: to as NodeId, deception: { disperse: true, emcon: true } } });
    }
    days(6);
    for (const f of border) world.pending.push({ type: 'order', nation: USA, formation: f.id, order: { posture: 'defend' } });
    days(3);
    expect(border.every((f) => near(world.formations[f.id].node)), 'every unit is still on the border').toBe(true);
    expect(warnings).toEqual([]);
    expect(warningOf(world, MEX)).toBeUndefined();
  }, 240_000);

  it('with the KPA in its garrisons there is no warning and South Korea stays put', () => {
    const q = korea(false);
    expect(q.warning).toBeUndefined();
    expect(q.warnings).toEqual([]);
    expect(q.korOrders).toEqual([]);
  }, 120_000);
});

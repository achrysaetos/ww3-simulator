import { describe, expect, it } from 'vitest';
import type { Formation, NationId, World } from '../src/core/types';
import type { GameMap } from '../src/core/map';
import { createSession } from '../src/scenarios';
import { exposureOf } from '../src/systems/land/tables';

type Session = ReturnType<typeof createSession>;
const days = (s: Session, n: number) => {
  for (let i = 0; i < (n * 24) / s.world.dtHours; i++) s.engine.step(s.world);
};
const live = (w: World, n: string) => Object.values(w.formations).filter((f) => f.nation === n && f.status !== 'destroyed' && f.kind === 'maneuver');
const touchesEnemy = (w: World, map: GameMap, f: Formation, enemy: string) =>
  w.control[f.node] === enemy || [...map.neighbors(f.node)].some((m) => m < map.landCount && w.control[m] === enemy);

describe('land AI allocation', () => {
  it('ukraine-2026: Ukraine does not keep brigades in reserve behind the line while Russia masses 3:1 inside one of its cells', () => {
    const s = createSession('ukraine-2026', 1);
    const exposed = (f: Formation) => Object.entries(f.equipment).reduce((t, [pid, n]) => t + n * exposureOf(s.catalog.platform(pid as never).class), 0);
    days(s, 20);
    const { world, map } = s;
    const at = new Map<number, Record<string, number>>();
    for (const f of [...live(world, 'RUS'), ...live(world, 'UKR')]) {
      const c = at.get(f.node) ?? {};
      c[f.nation] = (c[f.nation] ?? 0) + exposed(f);
      at.set(f.node, c);
    }
    const outnumbered = [...at].filter(([n, c]) => world.control[n] === ('UKR' as NationId) && (c.RUS ?? 0) > 3 * (c.UKR ?? 0) && (c.RUS ?? 0) > 500).map(([n]) => n);
    const idle = live(world, 'UKR').filter((f) => !f.territorial && f.order.posture === 'reserve' && !touchesEnemy(world, map, f, 'RUS'));
    const share = idle.reduce((t, f) => t + exposed(f), 0) / live(world, 'UKR').reduce((t, f) => t + exposed(f), 0);
    // The operational reserve the AI keeps back for the enemy's main effort is about 3% of the force (SHORT_LINE_RESERVE).
    // On integration 6f449c3, cells 6737 and 6995 held one brigade each against 5 and 10 Russian ones while 21 brigades,
    // a quarter of the force, waited in reserve at 6991.
    expect(outnumbered.length && share, `reserve share with cells ${outnumbered.join(', ')} outnumbered 3:1`).toBeLessThan(0.05);
  }, 300_000);

  it('ukraine-2026: Ukraine screens every cell of its Belarus border before any Russian unit stands across it', () => {
    const s = createSession('ukraine-2026', 1);
    days(s, 10);
    const { world, map } = s;
    const border: number[] = [];
    for (let n = 0; n < map.landCount; n++)
      if (world.control[n] === ('UKR' as NationId) && [...map.neighbors(n as never)].some((m) => m < map.landCount && world.control[m] === ('BLR' as NationId))) border.push(n);
    const held = new Set<number>();
    for (const f of Object.values(world.formations).filter((g) => g.nation === ('UKR' as NationId) && g.status !== 'destroyed')) {
      held.add(f.node);
      if (f.order.posture === 'defend' && f.order.target !== undefined) held.add(f.order.target);
    }
    // Russia drove on Kyiv from Belarus in February 2022 across a thinly held border; Ukraine has kept Operational Command North on it
    // since. On integration 8dd0f1e no Ukrainian unit stood on or marched to six of its seven cells (only 6362, which also borders Russia,
    // was held), and a Russian operation launched from Belarus on day 42 of one
    // ensemble run took a whole cell in three days (38,657 km2/yr).
    expect(border.length).toBeGreaterThan(3);
    expect(border.filter((n) => !held.has(n)), 'unscreened Belarus-border cells').toEqual([]);
  }, 300_000);

  it('ukraine-2026: the Belarus border starts fortified', () => {
    const s = createSession('ukraine-2026', 1);
    const { world, map } = s;
    const border: number[] = [];
    for (let n = 0; n < map.landCount; n++)
      if (world.control[n] === ('UKR' as NationId) && [...map.neighbors(n as never)].some((m) => m < map.landCount && world.control[m] === ('BLR' as NationId))) border.push(n);
    expect(border.filter((n) => !world.slices.land.fortified[n]), 'unfortified Belarus-border cells').toEqual([]);
  }, 300_000);

  it('baltic-2027: the divisions nearest Narva lead the main effort on Tallinn', () => {
    const s = createSession('baltic-2027', 1);
    days(s, 3);
    const tallinn = s.map.nodeAt(59.44, 24.75);
    const op = Object.values(s.world.slices.ops?.byId ?? {}).find((o) => o.nation === ('RUS' as NationId) && o.objectives.includes(tallinn as never));
    expect(op, 'a Russian operation on Tallinn').toBeDefined();
    const names = op!.formations.map((id) => s.world.formations[id]?.name ?? '');
    expect(names.some((n) => n.startsWith('69th Guards Motor Rifle Division'))).toBe(true);
    expect(names.some((n) => n.startsWith('25th Guards Motor Rifle Brigade'))).toBe(true);
  }, 300_000);
});

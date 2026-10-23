import { afterEach, describe, expect, it } from 'vitest';
import type { NationId, NodeId } from '../src/core/types';
import { loadMap } from '../src/data/load';
import { advise, isDecision, type Card, type Situation } from '../src/ui/staff/advice';
import { NEW_DECISIONS_PER_DAY } from '../src/ui/staff/desk';
import { playWithStaff } from './staff-mirror';

const map = loadMap();
type Game = ReturnType<typeof playWithStaff>;
const open: Game[] = [];
const start = (scenario: string, nation: string) => {
  const g = playWithStaff(scenario, nation, 1, 'cinc');
  open.push(g);
  return g;
};
afterEach(() => {
  for (const g of open.splice(0)) g.quit();
});

/**
 * Run `days` game days as a player who takes the staff's advice: each decision is approved the
 * tick it is put on the table, the way the brief's Approve all does. Records each one.
 */
function decisionsOver(g: Game, days: number): { card: Card; tick: number }[] {
  const seen = new Map<string, { card: Card; tick: number }>();
  for (let i = 0; i < days * 4; i++) {
    g.step();
    for (const c of g.desk.cards) {
      if (!isDecision(c) || seen.has(c.key) || c.primary?.kind !== 'command') continue;
      seen.set(c.key, { card: c, tick: g.state.tick });
      g.desk.act(c, c.primary);
      g.send(c.primary.command);
    }
  }
  return [...seen.values()];
}

function situation(g: Game, over: Partial<Situation> = {}): Situation {
  return {
    me: g.desk.me, ongoing: new Set(), tick: g.state.tick, dtHours: 6, map, nationIds: map.nationIds, control: g.state.control, formations: g.state.formations,
    nations: g.state.nations, d: g.state.focusNation!, recent: g.desk.recent, namer: g.namer, ammoPerDay: null, burnPerDay: {}, ops: g.state.ops, contest: g.state.contest, known: () => undefined,
    munitionKind: () => undefined, unitCostUsdM: () => 10, ...over,
  };
}

function expectPaced(found: { card: Card; tick: number }[], me: string) {
  for (const { card } of found) {
    expect(card.primary?.kind, card.key).toBe('command');
    if (card.primary?.kind === 'command') expect(card.primary.command.nation, card.key).toBe(me);
    expect(card.ask, `${card.key} says what it recommends`).toBeTruthy();
    expect(card.cost?.text, `${card.key} says what it costs`).toBeTruthy();
  }
  const perDay = new Map<number, number>();
  for (const { card, tick } of found) if (!card.urgent) perDay.set(Math.floor(tick / 4), (perDay.get(Math.floor(tick / 4)) ?? 0) + 1);
  expect(Math.max(...perDay.values()), 'new decisions in one game day').toBeLessThanOrEqual(NEW_DECISIONS_PER_DAY);
}

describe('a Commander-in-Chief has decisions to make (P1 H8)', () => {
  it('ukraine-2026 as Ukraine: a new decision at least every four game days over a month, never more than the daily allowance', () => {
    const g = start('ukraine-2026', 'UKR');
    const found = decisionsOver(g, 30);
    expect(found.length, found.map((x) => x.card.title).join(' | ')).toBeGreaterThanOrEqual(8);
    expectPaced(found, 'UKR');
    const second = found.filter((x) => x.tick >= 15 * 4);
    expect(second.length, 'decisions keep coming in the second half of the month').toBeGreaterThanOrEqual(3);
  }, 240_000);

  it('gulf-2027 as Iran: a new decision at least every four game days over ten days', () => {
    const g = start('gulf-2027', 'IRN');
    const found = decisionsOver(g, 10);
    expect(found.length, found.map((x) => x.card.title).join(' | ')).toBeGreaterThanOrEqual(3);
    expectPaced(found, 'IRN');
  }, 240_000);
});

describe('initiative decisions read the player\'s view and their commands work', () => {
  it('a counter-offensive goes where the player\'s own contacts show the enemy thinnest, and moves when the contacts do', () => {
    const g = start('ukraine-2026', 'UKR');
    g.step(8);
    const offer = advise(situation(g)).find((c) => c.key.startsWith('offensive|'));
    expect(offer, 'a rested reserve and a front give a counter-offensive').toBeDefined();
    const target = offer!.node!;
    const enemyAt = (n: NodeId) => g.state.formations.filter((f) => f.entry.nation === 'RUS' && f.contact && f.node === n).length;
    expect(enemyAt(target)).toBeLessThanOrEqual(2);
    const decoy = g.state.formations.filter((f) => f.entry.nation === 'RUS' && f.contact && f.entry.kind === 'maneuver').slice(0, 3);
    const moved = g.state.formations.map((f) => (decoy.includes(f) ? { ...f, node: target } : f));
    const again = advise(situation(g, { formations: moved })).find((c) => c.key.startsWith('offensive|'));
    expect(again?.node, 'three contacts seen in the cell take it off the table').not.toBe(target);
  }, 120_000);

  it('Begin sabotage passes the command boundary and starts the campaign in the engine', () => {
    const g = start('ukraine-2026', 'UKR');
    g.step(2);
    const card = g.desk.cards.find((c) => c.key === 'sabotage|RUS');
    expect(card).toBeDefined();
    if (card?.primary?.kind !== 'command') throw new Error('no command');
    g.desk.act(card, card.primary);
    g.send(card.primary.command);
    g.step(2);
    expect(g.world.slices.nonKinetic.sabotage['UKR>RUS']).toBeDefined();
    expect(g.state.focusNation!.covert.sabotage).toEqual(['RUS' as NationId]);
    expect(g.desk.answered.find((s) => s.card.key === 'sabotage|RUS')?.answer?.ok).toBe(true);
  }, 120_000);
});

describe('a pocket is ground cut off from the capital, not an island (P1 H8)', () => {
  it('ww3-2027 as the United States: Hawaii is not encircled; ukraine-2026 as Ukraine: a brigade whose neighbours fall is', () => {
    const usa = start('ww3-2027', 'USA');
    usa.step(4);
    for (const c of usa.state.focusNation?.treatyCalls ?? []) usa.send({ type: 'answer_treaty', nation: 'USA' as NationId, war: c.war, treaty: c.treaty, join: true });
    usa.step(2);
    expect(advise(situation(usa)).filter((c) => c.key.startsWith('pocket|')).map((c) => c.title)).toEqual([]);

    const g = start('ukraine-2026', 'UKR');
    g.step(2);
    const [ukr, rus] = [map.nationIds.indexOf('UKR' as NationId), map.nationIds.indexOf('RUS' as NationId)];
    const kyiv = map.data.nations[ukr].capital!.cell as NodeId;
    const f = g.state.formations.find((x) => x.entry.nation === 'UKR' && x.entry.kind === 'maneuver' && x.status === 'active' && x.node < map.landCount
      && map.owner[x.node] === 'UKR' && map.distanceKm(x.node, kyiv) > 300)!;
    const control = g.state.control.slice();
    for (let i = map.adjStart[f.node]; i < map.adjStart[f.node + 1]; i++) if (map.adj[i] < map.landCount && map.adj[i] !== f.node) control[map.adj[i]] = rus;
    const card = advise(situation(g, { control, ops: [] })).find((c) => c.key.startsWith('pocket|'));
    expect(card?.title).toMatch(/cut off near/);
  }, 240_000);
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { Command, CommandDomain, FormationId, NationId, SimEvent } from '../src/core/types';
import { loadMap } from '../src/data/load';
import { orderDelayHours } from '../src/systems/c2';
import { authority } from '../src/systems/orders';
import { describeEvent } from '../src/ui/events';
import { advise, answerOf, type Card, type CommandAction, type Situation } from '../src/ui/staff/advice';
import { advisorOf, ROLES } from '../src/ui/staff/advisors';
import type { Sent } from '../src/ui/staff/desk';
import { COMMAND_ROLES, delegateCommands, roleOf } from '../src/ui/staff/StaffPanel';
import { StaffCard } from '../src/ui/staff/WarRoom';
import { playWithStaff } from './staff-mirror';

const N = (s: string) => s as NationId;
const map = loadMap();
type Game = ReturnType<typeof playWithStaff>;
const open: Game[] = [];
const start = (scenario: string, nation: string) => {
  const g = playWithStaff(scenario, nation);
  open.push(g);
  return g;
};
afterEach(() => {
  for (const g of open.splice(0)) g.quit();
});

/** Press a card's recommended button the way the War Room does: the desk records it and the command goes to the host. */
function approve(g: Game, card: Card): CommandAction {
  const a = card.primary;
  if (a?.kind !== 'command') throw new Error(`${card.key} has no command to approve`);
  g.desk.act(card, a);
  g.send(a.command);
  return a;
}

const sentFor = (g: Game, key: string): Sent | undefined => g.desk.answered.find((s) => s.card.key === key);

/** Step until the desk has a final answer for the card, for at most `ticks`. */
function settle(g: Game, key: string, ticks = 40): Sent {
  for (let i = 0; i < ticks; i++) {
    const s = sentFor(g, key);
    if (s?.answer?.final) return s;
    g.step();
  }
  throw new Error(`no final answer for ${key}`);
}

const shown = (g: Game, s: Sent) => renderToStaticMarkup(createElement(StaffCard, { card: s.card, me: g.desk.me, sent: s, paused: false, onAct: () => {} }));

/** The player's view, built the way the desk builds it, for sources that need a figure the test sets. */
function situation(g: Game, over: Partial<Situation> = {}): Situation {
  const d = g.state.focusNation!;
  return {
    me: g.desk.me, tick: g.state.tick, dtHours: 6, map, nationIds: map.nationIds, control: g.state.control, formations: g.state.formations,
    nations: g.state.nations, d, recent: g.desk.recent, namer: g.namer, ammoPerDay: null,
    munitionKind: () => undefined, unitCostUsdM: () => 10, ...over,
  };
}

describe('advisor cards: the recommended button issues the command, and the answer comes back and shows', () => {
  it('treaty calls (ww3-2027 as the United States): Go to war answers each call in the engine', () => {
    const g = start('ww3-2027', 'USA');
    g.step();
    const calls = g.desk.cards.filter((c) => c.key.startsWith('treaty|'));
    const aggressors = g.state.focusNation!.treatyCalls.map((c) => c.aggressor);
    // A treaty calls only on a war inside its area (A4), so how many arrive on day one is the scenario's, not the card's.
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(advisorOf(N('USA'), c.role!).title).toBe('Foreign Minister');
      expect(c.urgent).toBe(true);
      const a = approve(g, c);
      expect(a.command).toMatchObject({ type: 'answer_treaty', nation: 'USA', join: true });
    }
    g.step();
    for (const c of calls) {
      const s = sentFor(g, c.key)!;
      expect(s.answer).toEqual({ ok: true, text: 'Treaty answer: will honour the treaty', final: true });
      const cmd = s.action.command as Extract<Command, { type: 'answer_treaty' }>;
      expect(cmd.join).toBe(true);
      expect(shown(g, s)).toContain('will honour the treaty');
    }
    expect(g.desk.recent.filter((e) => e.type === 'command_result' && e.command === 'answer_treaty')).toHaveLength(calls.length);
    expect(g.desk.cards.some((c) => calls.some((x) => x.key === c.key))).toBe(false);
    g.step(4);
    for (const a of aggressors) expect(g.state.focusNation!.enemies, 'the engine took the United States into each war it answered').toContain(a);
  }, 300_000);

  it('a build-up (ukraine-2026 as Ukraine): Reinforce moves the nearest reserve brigade, and its order answer shows', () => {
    const g = start('ukraine-2026', 'UKR');
    let card: Card | undefined;
    for (let i = 0; i < 24 && !card; i++) {
      g.step();
      card = g.desk.cards.find((c) => c.key.startsWith('massing|') && c.primary?.kind === 'command');
    }
    expect(card).toBeDefined();
    const a = approve(g, card!);
    const cmd = a.command as Extract<Command, { type: 'order' }>;
    expect(cmd).toMatchObject({ type: 'order', nation: 'UKR', order: { posture: 'move', target: card!.node } });
    expect(g.world.formations[cmd.formation].order.posture).toBe('reserve');
    const s = settle(g, card!.key);
    const result = g.desk.recent.find((e) => e.type === 'command_result' && e.formation === cmd.formation && e.code !== 'relayed');
    expect(result).toMatchObject({ command: 'order', nation: 'UKR', byPlayer: true });
    expect(s.answer!.ok).toBe(result!.type === 'command_result' && result!.ok);
    const f = g.world.formations[cmd.formation];
    // On the way, or already there and dug in: a reserve one cell back can arrive inside a tick.
    if (s.answer!.ok) expect(f.node === card!.node ? f.order.posture : f.order).toEqual(f.node === card!.node ? 'defend' : expect.objectContaining({ posture: 'move', target: card!.node }));
    expect(shown(g, s)).toContain(s.answer!.text.replace(/&/g, '&amp;'));
  }, 300_000);

  it('thin reserves (ukraine-2026 as Ukraine): Mobilise raises the call-up target in the engine', () => {
    const g = start('ukraine-2026', 'UKR');
    g.step(8);
    g.world.nations[N('UKR')].reserves = 5_000;
    g.step();
    const card = g.desk.cards.find((c) => c.key.startsWith('mobilise|'));
    expect(card, 'the chief asks for mobilisation once reserves cannot refill the front').toBeDefined();
    const a = approve(g, card!);
    const level = (a.command as Extract<Command, { type: 'set_mobilization' }>).level;
    expect(level).toBeGreaterThan(g.world.nations[N('UKR')].mobilization);
    const s = settle(g, card!.key, 4);
    expect(s.answer).toMatchObject({ ok: true, text: `Mobilisation ordered to ${Math.round(level * 100)}%` });
    expect(shown(g, s)).toContain('Mobilisation ordered');
  }, 300_000);

  it('shells running out (ukraine-2026 as Ukraine): Order more shells sets the shell line to its surge rate', () => {
    const g = start('ukraine-2026', 'UKR');
    g.step(4);
    const d = g.state.focusNation!;
    const card = advise(situation(g, { ammoPerDay: d.bulk.ammo / 21 })).find((c) => c.key.startsWith('shells|'));
    expect(card?.title).toBe('Artillery shells run out in 3 weeks');
    const a = approve(g, card!);
    const cmd = a.command as Extract<Command, { type: 'produce' }>;
    expect(cmd.item).toMatch(/^shell_/);
    expect(cmd.ratePerMonth).toBe(Math.round(d.economy!.capacity[cmd.item].surge));
    g.step();
    expect(g.world.slices.economy.nations[N('UKR')].lines[cmd.item].orderPerMonth).toBe(cmd.ratePerMonth);
    const answer = answerOf(cmd, g.state.tick - 1, situation(g));
    expect(answer).toMatchObject({ ok: true, final: true });
  }, 300_000);

  it('an enemy nuclear alert (south-asia-2027 as India): Raise our alert mates Indian warheads', () => {
    const g = start('south-asia-2027', 'IND');
    g.step(2);
    expect(g.state.focusNation!.enemies).toContain('PAK');
    g.world.pending.push({ type: 'nuclear_alert', nation: N('PAK'), reason: 'test: Pakistan readies its forces' });
    g.step();
    const card = g.desk.cards.find((c) => c.key.startsWith('nalert|PAK'));
    expect(card).toBeDefined();
    const a = approve(g, card!);
    expect(a.command).toMatchObject({ type: 'nuclear_alert', nation: 'IND' });
    const s = settle(g, card!.key, 4);
    expect(s.answer).toMatchObject({ ok: true, text: 'Warheads are being mated to launchers' });
    expect(g.desk.recent.some((e) => e.type === 'nuclear_alert' && e.nation === 'IND')).toBe(true);
  }, 300_000);
});

describe('"Your staff runs" (ukraine-2026 as Ukraine)', () => {
  /** Ticks at which each of Ukraine's land formations last got an order, so a new order shows. */
  const landOrders = (g: Game) => Object.fromEntries(Object.values(g.world.formations).filter((f) => f.nation === 'UKR' && ['maneuver', 'artillery'].includes(f.kind)).map((f) => [f.id, f.order.issuedTick]));
  const changed = (a: Record<string, number>, b: Record<string, number>) => Object.keys(a).filter((k) => a[k] !== b[k]).length;

  it('taking land back stops the AI staff ordering any land formation; leaving it delegated does not', () => {
    const kept = start('ukraine-2026', 'UKR');
    const ai = authority(kept.world, N('UKR')).ai;
    const cmds = delegateCommands(N('UKR'), ai, { ...ai, land: false });
    expect(cmds).toEqual([{ type: 'delegate', nation: 'UKR', domain: 'land', ai: false }]);
    for (const c of cmds) kept.send(c);
    kept.step();
    expect(kept.desk.recent.find((e) => e.type === 'command_result' && e.command === 'delegate')).toMatchObject({ ok: true, nation: 'UKR' });
    expect(authority(kept.world, N('UKR')).ai.land).toBe(false);
    expect(kept.state.focusNation!.authority.ai.land).toBe(false);
    const before = landOrders(kept);
    kept.step(16);
    expect(changed(before, landOrders(kept)), 'no land order changes while the player holds land').toBe(0);

    const delegated = start('ukraine-2026', 'UKR');
    delegated.step();
    const was = landOrders(delegated);
    delegated.step(16);
    expect(changed(was, landOrders(delegated)), 'the AI staff orders land formations when it runs land').toBeGreaterThan(0);
  }, 300_000);

  it('roles are delegation presets, and switching role sends one delegate command per domain that differs', () => {
    expect(roleOf({ land: true, air: true, naval: true, homefront: true, strategic: false })?.name).toBe('Commander-in-Chief');
    const brigade = COMMAND_ROLES.find((r) => r.id === 'brigade')!;
    const cinc = COMMAND_ROLES.find((r) => r.id === 'cinc')!;
    const cmds = delegateCommands(N('UKR'), cinc.ai, brigade.ai);
    expect(cmds.map((c) => (c as { domain: CommandDomain }).domain)).toEqual(['land', 'air', 'naval', 'homefront']);
    expect(roleOf({ land: false, air: true, naval: true, homefront: true, strategic: false })).toBeNull();
  });
});

describe('the staff reads only what the player is told', () => {
  it('never sees the enemy\'s command answers (BA-12), and says when an order is in transit (CE-9)', () => {
    const g = start('ukraine-2026', 'UKR');
    let slow: FormationId | undefined;
    const seen: SimEvent[] = [];
    for (let i = 0; i < 40 && !slow; i++) {
      g.step();
      seen.push(...g.desk.recent);
      slow = Object.values(g.world.formations).find((f) => f.nation === 'UKR' && f.kind === 'maneuver' && f.status === 'active' && orderDelayHours(g.world, f.id) >= 2 * g.world.dtHours)?.id;
    }
    expect(slow).toBeDefined();
    g.send({ type: 'order', nation: N('UKR'), formation: slow!, order: { posture: 'defend' } });
    g.step();
    seen.push(...g.desk.recent);
    const results = seen.filter((e) => e.type === 'command_result');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((e) => e.type === 'command_result' && e.nation === 'UKR' && e.byPlayer)).toBe(true);
    expect(g.desk.inTransit.get(slow!)).toBeGreaterThan(0);
    const card = g.desk.cards.find((c) => c.key.startsWith(`relayed|${slow}`));
    expect(card?.text).toMatch(/reaches .+ in about \d+ h/);
  }, 300_000);
});

describe('advisors', () => {
  it('are fictional and stable: every seat has a name and title, the same each game', () => {
    for (const n of ['UKR', 'RUS', 'USA', 'CHN', 'ISR', 'ZWE']) {
      const names = ROLES.map((r) => advisorOf(N(n), r).name);
      expect(new Set(names).size).toBe(ROLES.length);
      expect(ROLES.map((r) => advisorOf(N(n), r))).toEqual(ROLES.map((r) => advisorOf(N(n), r)));
    }
  });
});

describe('display errors (BA-14)', () => {
  it('words a strike that barely dents infrastructure with a decimal, not "from 100% to 100%"', () => {
    const g = start('ukraine-2026', 'UKR');
    const text = describeEvent({ type: 'strike', tick: 1, by: N('RUS'), munition: 'kh101' as never, fired: 2, intercepted: 1, target: map.nodeAt(50.45, 30.52), effects: [{ kind: 'infrastructure', before: 1, after: 0.996 }] }, g.namer);
    expect(text).toContain('infrastructure cut from 100.0% to 99.6%');
    expect(text).not.toContain('100% to 100%');
  });
});

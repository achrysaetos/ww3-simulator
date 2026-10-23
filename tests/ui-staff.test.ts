import { afterEach, describe, expect, it } from 'vitest';
import type { Command, CommandDomain, NationId, SimEvent } from '../src/core/types';
import { loadMap } from '../src/data/load';
import { orderDelayHours } from '../src/systems/c2';
import { authority } from '../src/systems/orders';
import { describeEvent } from '../src/ui/events';
import type { Card, CommandAction } from '../src/ui/staff/advice';
import { advisorOf, ROLES } from '../src/ui/staff/advisors';
import type { Sent } from '../src/ui/staff/desk';
import { COMMAND_ROLES, delegateCommands, roleOf } from '../src/ui/staff/roles';
import { EventFeed } from '../src/ui/feed';
import { SCENARIO_CARDS } from '../src/ui/host';
import { headlines } from '../src/ui/staff/ticker';
import { crisisOf } from '../src/ui/crisis/crisis';
import { degradeChain } from './c2.fixture';
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

/** Press a card's recommended button the way a crisis does: the desk records it and the command goes to the host. */
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

describe('advisor cards: the recommended button issues the command, and the answer comes back and shows', () => {
  it('treaty calls (ww3-2027 as the United States): Go to war answers each call in the engine', () => {
    const g = start('ww3-2027', 'USA');
    g.step();
    const calls = g.desk.cards.filter((c) => c.key.startsWith('treaty|'));
    const aggressors = g.state.focusNation!.treatyCalls.map((c) => c.aggressor);
    // A treaty calls only on a war inside its area (A4), so how many arrive on day one is the scenario's, not the card's.
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
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
    }
    expect(g.desk.recent.filter((e) => e.type === 'command_result' && e.command === 'answer_treaty')).toHaveLength(calls.length);
    expect(g.desk.cards.some((c) => calls.some((x) => x.key === c.key))).toBe(false);
    g.step(4);
    for (const a of aggressors) expect(g.state.focusNation!.enemies, 'the engine took the United States into each war it answered').toContain(a);
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
  // A routed unit's retreat is ordered by the land engine, not the staff, so it does not count.
  const landOrders = (g: Game) => Object.fromEntries(Object.values(g.world.formations).filter((f) => f.nation === 'UKR' && ['maneuver', 'artillery'].includes(f.kind) && f.status !== 'routed').map((f) => [f.id, f.order.issuedTick]));
  const changed = (a: Record<string, number>, b: Record<string, number>) => Object.keys(a).filter((k) => k in b && a[k] !== b[k]).length;

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
  it('never sees the enemy\'s command answers (BA-12), and knows when an order is in transit (CE-9)', () => {
    const g = start('ukraine-2026', 'UKR');
    const seen: SimEvent[] = [];
    for (let i = 0; i < 8; i++) {
      g.step();
      seen.push(...g.desk.recent);
    }
    const slow = degradeChain(g.world, N('UKR')).id;
    g.step();
    seen.push(...g.desk.recent);
    expect(orderDelayHours(g.world, slow)).toBeGreaterThanOrEqual(2 * g.world.dtHours);
    g.send({ type: 'order', nation: N('UKR'), formation: slow, order: { posture: 'defend' } });
    g.step();
    seen.push(...g.desk.recent);
    const results = seen.filter((e) => e.type === 'command_result');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((e) => e.type === 'command_result' && e.nation === 'UKR' && e.byPlayer)).toBe(true);
    expect(g.desk.inTransit.get(slow)).toBeGreaterThan(0);
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

  it('words an escalation as what happens, not the rung id', () => {
    const g = start('ukraine-2026', 'UKR');
    const text = describeEvent({ type: 'escalation', tick: 1, a: N('RUS'), b: N('UKR'), level: 'strategic_conventional' }, g.namer);
    expect(text).toBe("Russia and Ukraine begin striking deep into each other's homelands");
  });
});

describe('what the staff says is true to the nation and the war (P1 H9, M6)', () => {
  it('ukraine-2026: the war that began in 2022 is not news of a declaration on day one; a new war still is', () => {
    const run = (scenario: string, nation: string) => {
      const g = start(scenario, nation);
      const feed = new EventFeed();
      for (let i = 0; i < 2; i++) {
        g.step();
        feed.record(g.state.latestEvents, g.namer);
      }
      const ongoing = new Set(SCENARIO_CARDS.find((s) => s.id === scenario)!.ongoing);
      return { g, news: headlines(feed, map, ongoing).map((h) => h.text) };
    };
    const ukr = run('ukraine-2026', 'UKR');
    expect(ukr.news.join(' | ')).not.toMatch(/declares war on Ukraine/);
    expect(ukr.news).toContain('Russia and Ukraine remain at war');
    expect(ukr.g.desk.cards.filter((c) => c.key.startsWith('wire|war|'))).toEqual([]);
    const gulf = run('gulf-2027', 'IRN');
    expect(gulf.news.join(' | ')).toMatch(/Iran declares war on Israel/);
  }, 240_000);

  it('the United States table has a Secretary of State and a Chairman of the Joint Chiefs, under invented names', () => {
    expect(advisorOf(N('USA'), 'foreign')).toMatchObject({ title: 'Secretary of State', name: 'Elena Marsh' });
    expect(advisorOf(N('USA'), 'chief')).toMatchObject({ title: 'Chairman of the Joint Chiefs of Staff', name: 'Gen. Margaret Hale' });
    expect(advisorOf(N('GBR'), 'navy').title).toBe('First Sea Lord');
    expect(advisorOf(N('UKR'), 'chief').title).toBe('Chief of the General Staff');
  });

  it('ww3-2027 as the United States: Taiwan asks for help under the Taiwan Relations Act, which binds no one to fight; a NATO ally invokes its treaty', () => {
    const g = start('ww3-2027', 'USA');
    g.step(2);
    const calls = g.desk.cards.filter((c) => c.key.startsWith('treaty|'));
    const tra = calls.find((c) => c.key.includes('US-TWN-TRA'));
    expect(tra, 'a call under the Taiwan Relations Act').toBeDefined();
    expect(tra!.title).toBe('Taiwan asks us to fight');
    expect(tra!.text).not.toMatch(/invoke|Our word is our deterrent/);
    expect(tra!.text).toContain('does not bind us');
    const ctx = {
      me: g.desk.me, tick: g.state.tick, dtHours: 6, d: g.state.focusNation!, nations: g.state.nations, name: (id: NationId) => g.namer.nation(id),
      capital: () => undefined,
    };
    const crisis = crisisOf(tra!, ctx)!;
    expect(crisis.headline).toBe('Call for help');
    expect(crisis.options[0].button).toBe('Enter the war');
    const pact = calls.find((c) => c.key.includes('|NATO|'))!;
    expect(pact.title).toMatch(/invokes the/);
    expect(crisisOf(pact, ctx)!.headline).toBe('Treaty invoked');
  }, 120_000);
});

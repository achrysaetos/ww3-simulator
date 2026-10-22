import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { atWar } from '../src/core/engine';
import type { Command, CommandDomain, FormationId, NationId, NodeId, SimEvent } from '../src/core/types';
import { loadMap } from '../src/data/load';
import { orderDelayHours } from '../src/systems/c2';
import { authority } from '../src/systems/orders';
import { describeEvent } from '../src/ui/events';
import { advise, answerOf, type Card, type CommandAction, type Situation } from '../src/ui/staff/advice';
import { advisorOf, ROLES } from '../src/ui/staff/advisors';
import type { Sent } from '../src/ui/staff/desk';
import { COMMAND_ROLES, delegateCommands, roleOf } from '../src/ui/staff/roles';
import { operations } from '../src/ui/staff/operations';
import { StaffCard, WarRoom } from '../src/ui/staff/WarRoom';
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
    me: g.desk.me, ongoing: new Set(), tick: g.state.tick, dtHours: 6, map, nationIds: map.nationIds, control: g.state.control, formations: g.state.formations,
    nations: g.state.nations, d, recent: g.desk.recent, namer: g.namer, ammoPerDay: null, burnPerDay: {}, ops: g.state.ops, contest: g.state.contest, known: () => undefined,
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
      expect(advisorOf(N('USA'), c.role!).title).toBe('Secretary of State');
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

  it('a warned build-up (peace-2027 as South Korea): Reinforce sends a brigade to the DMZ before any shot, and only when warned', () => {
    const korea = (buildUp: boolean) => {
      const g = start('peace-2027', 'KOR');
      const { world } = g;
      const [kor, prk] = [N('KOR'), N('PRK')];
      const dmz = new Set<NodeId>();
      for (let n = 0 as NodeId; n < map.landCount; n++)
        if (world.control[n] === kor && [...map.neighbors(n)].some((m) => m < map.landCount && world.control[m] === prk)) dmz.add(n);
      // The CE-5 build-up (tests/belief.test.ts): every KPA manoeuvre formation marched to the DMZ.
      const kpa = Object.values(world.formations).filter((f) => f.nation === prk && f.kind === 'maneuver' && f.status === 'active');
      const across = [...map.nodesOf(prk)].filter((n) => world.control[n] === prk && [...map.neighbors(n)].some((m) => dmz.has(m)));
      if (buildUp) kpa.forEach((f, i) => world.pending.push({ type: 'order', nation: prk, formation: f.id, order: { posture: 'move', target: across[i % across.length] } }));
      let card: Card | undefined;
      for (let i = 0; i < 16 && !card; i++) {
        g.step();
        card = g.desk.cards.find((c) => c.key === 'warning|PRK');
      }
      return { g, card, dmz };
    };
    const quiet = korea(false);
    expect(quiet.card, 'no warning, no card').toBeUndefined();
    const { g, card, dmz } = korea(true);
    expect(card).toBeDefined();
    expect(atWar(g.world, N('KOR'), N('PRK'))).toBe(false);
    expect(card!.text).toMatch(/North Korea|PRK/);
    const a = approve(g, card!);
    const cmd = a.command as Extract<Command, { type: 'order' }>;
    expect(cmd).toMatchObject({ type: 'order', nation: 'KOR', order: { posture: 'move', target: card!.node } });
    expect(dmz.has(card!.node!)).toBe(true);
    expect(dmz.has(g.world.formations[cmd.formation].node)).toBe(false);
    const s = settle(g, card!.key);
    expect(s.answer!.ok).toBe(true);
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

  it('names each sector Ukraine holds after a town on its own side of the line, never a Russian city across it', () => {
    const g = start('ukraine-2026', 'UKR');
    g.step();
    const mine = map.nationIds.indexOf(N('UKR'));
    const enemyIdx = new Set(g.state.focusNation!.enemies.map((e) => map.nationIds.indexOf(e)));
    // Kharkiv taken, so the cells around it hold the line facing a city the enemy holds.
    const control = Uint16Array.from(g.state.control);
    const kharkiv = map.cities.find((c) => c.name === 'Kharkiv')!;
    control[map.nodeAt(kharkiv.lat, kharkiv.lon)] = map.nationIds.indexOf(N('RUS'));
    const cityCells = new Map<string, NodeId[]>();
    for (const c of map.cities) cityCells.set(c.name, [...(cityCells.get(c.name) ?? []), map.nodeAt(c.lat, c.lon)]);
    const enemyCity = (name: string) => (cityCells.get(name.replace(/^near /, '')) ?? []).some((n) => enemyIdx.has(control[n]));
    // A Ukrainian cell on the line whose nearest place is a city Russia holds, such as Bryansk across from Chernihiv and Sumy oblasts.
    let cell: NodeId | undefined;
    for (let n = 0 as NodeId; n < map.landCount && cell === undefined; n++)
      if (control[n] === mine && [...map.neighbors(n)].some((m) => enemyIdx.has(control[m])) && enemyCity(g.namer.place.name(n))) cell = n;
    expect(cell, 'a held cell the plain place name would name after an enemy city').toBeDefined();
    // Enough brigades there that it is the biggest sector held, the one the panel always lists.
    const moved = new Set(g.state.formations.filter((f) => f.entry.nation === 'UKR' && f.entry.kind === 'maneuver' && f.status === 'active').slice(0, 40));
    const brigade = [...moved][0];
    const formations = g.state.formations.map((f) => (moved.has(f) ? { ...f, node: cell!, posture: 'defend' as const, target: null } : f));
    const ops = operations({
      me: N('UKR'), map, nationIds: map.nationIds, control, contest: new Float32Array(0), formations, planned: [], tick: 0,
      enemies: g.state.focusNation!.enemies, places: g.namer.place, commandOf: () => 'delegate',
    });
    const there = ops.find((o) => o.formations.includes(brigade.entry.id));
    expect(there, 'the brigade on that cell holds a sector').toBeDefined();
    expect(enemyCity(there!.name.replace(/^Hold /, '')), there!.name).toBe(false);
  });

  it('words an escalation as what happens, not the rung id', () => {
    const g = start('ukraine-2026', 'UKR');
    const text = describeEvent({ type: 'escalation', tick: 1, a: N('RUS'), b: N('UKR'), level: 'strategic_conventional' }, g.namer);
    expect(text).toBe("Russia and Ukraine begin striking deep into each other's homelands");
  });
});

describe('the War Room after the player answers (P1 M7)', () => {
  const treaty = (i: number): Card => ({
    key: `treaty|${i}|nato`, topic: 'diplomacy', role: 'foreign', tone: 'advice', tick: 0, urgent: true, title: `Call ${i}`, text: '',
    chip: 'Answer within 3 days', primary: { kind: 'command', label: 'Go to war', command: { type: 'answer_treaty', nation: 'USA' as NationId, war: String(i), treaty: 'nato', join: true } },
  });
  const answeredCall = (i: number): Sent => ({ card: treaty(i), action: treaty(i).primary as CommandAction, tick: 1, answer: { ok: true, text: 'will honour the treaty', final: true }, silent: false });
  const fresh: Card = { key: 'reserve|1', topic: 'command', role: 'chief', tone: 'advice', tick: 2, title: 'Commit the reserve', text: '', primary: { kind: 'later', label: 'Later' } };
  const room = (cards: Card[], answered: Sent[]) => renderToStaticMarkup(createElement(WarRoom, { cards, answered, me: 'USA' as NationId, paused: false, onAct: () => {}, onDismiss: () => {} }));

  it('an answered card drops its deadline badge, so the dismiss mark has the corner to itself', () => {
    const html = room([], [answeredCall(1)]);
    expect(html).not.toContain('Answer within');
    expect(html).toContain('aria-label="Dismiss"');
  });

  it('a new decision is shown ahead of a full record of answered calls', () => {
    const html = room([fresh], [1, 2, 3, 4, 5, 6, 7].map(answeredCall));
    expect(html).toContain('Commit the reserve');
    expect(html.indexOf('Commit the reserve')).toBeLessThan(html.indexOf('Call 1'));
  });
});

describe('the Operations panel at war with no land front (P1 H4)', () => {
  const rows = (g: Game) => operations({
    me: g.desk.me, map, nationIds: map.nationIds, control: g.state.control, contest: g.state.contest, formations: g.state.formations, planned: g.state.ops,
    tick: g.state.tick, enemies: g.state.focusNation!.enemies, places: g.namer.place, commandOf: () => 'delegate',
  });

  it('gulf-2027 as Iran: the missile strikes and the fleet at sea are rows, not "No front yet"', () => {
    const g = start('gulf-2027', 'IRN');
    g.step(8);
    const ops = rows(g);
    expect(ops.map((o) => o.kind)).toEqual(expect.arrayContaining(['strike', 'naval']));
    const strike = ops.find((o) => o.kind === 'strike')!;
    expect(strike.detail).toMatch(/^On /);
    for (const id of strike.formations) expect(g.world.formations[id].nation).toBe('IRN');
  }, 240_000);

  it('ww3-2027 as the United States: campaigns keep a place beside the land sectors', () => {
    const g = start('ww3-2027', 'USA');
    for (let i = 0; i < 12; i++) {
      g.step();
      for (const c of g.state.focusNation?.treatyCalls ?? []) g.send({ type: 'answer_treaty', nation: N('USA'), war: c.war, treaty: c.treaty, join: true });
    }
    const ops = rows(g);
    expect(ops.length).toBeLessThanOrEqual(4);
    expect(ops.filter((o) => o.kind === 'strike' || o.kind === 'air' || o.kind === 'naval').length).toBeGreaterThanOrEqual(1);
  }, 300_000);
});

describe('what the staff says is true to the nation and the war (P1 H9, M6)', () => {
  it('ukraine-2026 as Ukraine: the reserves card counts the reservists mobilisation would recall, not the empty replacement pool', () => {
    const g = start('ukraine-2026', 'UKR');
    g.step();
    const card = g.desk.cards.find((c) => c.key.startsWith('mobilise|'));
    expect(card, 'Ukraine at war with an empty replacement pool is told to mobilise').toBeDefined();
    const reservists = g.world.nations[N('UKR')].reservists;
    expect(reservists).toBeGreaterThan(1000);
    expect(card!.figure).toMatchObject({ value: String(Math.round(reservists / 1000)), caption: 'reservists to recall' });
    expect(card!.text).toContain(`${Math.round(reservists / 1000).toLocaleString('en-US')}k trained reservists`);
  }, 120_000);

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

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { FormationId, NationId, NodeId, SimEvent } from '../src/core/types';
import { loadMap } from '../src/data/load';
import { NUCLEAR_ALERT, profiles } from '../src/data/nations';
import { authority } from '../src/systems/orders';
import { coachDue, markCoachDone, resetCoach } from '../src/ui/coach/coach';
import { SCENARIO_CARDS, SimHost } from '../src/ui/host';
import { crisesOn, setCrises, type KeyValue } from '../src/ui/prefs';
import { nationCards, type FromWorker } from '../src/ui/snapshot';
import { featuredNations, scenarioInfo, threatOf } from '../src/ui/start/scenarioInfo';
import { COMMAND_ROLES } from '../src/ui/staff/roles';
import { CrisisScreen } from '../src/ui/crisis/CrisisScreen';
import { answered, crisisOf, nextCrisis, type CrisisContext } from '../src/ui/crisis/crisis';
import type { Card } from '../src/ui/staff/advice';
import { momentsOf } from '../src/ui/moments/moments';
import { playWithStaff } from './staff-mirror';

const map = loadMap();
const cards = new Map(nationCards(map, profiles).map((c) => [c.id, c]));
const N = (s: string) => s as NationId;

const memory = (): KeyValue & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};
const broken: KeyValue = {
  getItem: () => { throw new Error('storage blocked'); },
  setItem: () => { throw new Error('storage blocked'); },
};

describe('start screen', () => {
  it('lists every registered scenario with a title, year, one-line premise and a theatre on the map', () => {
    expect(SCENARIO_CARDS.length).toBeGreaterThanOrEqual(8);
    for (const s of SCENARIO_CARDS) {
      const info = scenarioInfo(s, map, cards);
      expect(info.title, s.id).not.toMatch(/\d{4}$/);
      expect(info.year).toBe(new Date(s.startDate).getUTCFullYear());
      expect(info.premise.split(/\.\s/).length, `${s.id}: one sentence`).toBe(1);
      expect(info.theatre, s.id).not.toBeNull();
    }
    const ukraine = scenarioInfo(SCENARIO_CARDS.find((s) => s.id === 'ukraine-2026')!, map, cards);
    expect(ukraine).toMatchObject({ title: 'Russo-Ukrainian War continues', year: 2026, sides: ['RUS ▸ UKR'], theatre: { name: 'Ukraine' } });
  });

  it('rates peace lowest and a war among nuclear powers above one with none', () => {
    expect(threatOf({ wars: [], belligerents: [] }, cards).label).toBe('Tension');
    const conventional = threatOf({ wars: [[N('ARM'), N('AZE')]], belligerents: [N('ARM'), N('AZE')] }, cards);
    const nuclear = threatOf({ wars: [[N('IND'), N('PAK')]], belligerents: [N('IND'), N('PAK')] }, cards);
    expect(nuclear.level).toBeGreaterThan(conventional.level);
    expect(threatOf(SCENARIO_CARDS.find((s) => s.id === 'ww3-2027')!, cards).label).toBe('Critical');
  });

  it('offers the suggested nation first and keeps a nation found by search on the strip', () => {
    const s = SCENARIO_CARDS.find((x) => x.id === 'ukraine-2026')!;
    expect(featuredNations(s, cards, null)[0]).toBe('UKR');
    const withPeru = featuredNations(s, cards, N('PER'));
    expect(withPeru).toHaveLength(6);
    expect(withPeru).toContain('PER');
  });

  it('starts a session as the chosen nation, with the chosen role as its delegation once the first turn runs', () => {
    for (const role of COMMAND_ROLES) {
      const sent: FromWorker[] = [];
      const host = new SimHost((m) => sent.push(m));
      host.handle({ type: 'start', scenario: 'ukraine-2026', nation: N('UKR'), seed: 1, role: role.id });
      const ready = sent.find((m) => m.type === 'ready');
      expect(ready && ready.type === 'ready' && ready.playing).toBe('UKR');
      expect(host.world!.nations[N('UKR')].controlledBy).toBe('human');
      host.handle({ type: 'ack' });
      host.handle({ type: 'step' });
      expect(authority(host.world!, N('UKR')).ai, role.id).toEqual(role.ai);
      host.handle({ type: 'quit' });
    }
  }, 300_000);

  it('ignores a role it does not know and leaves the default delegation', () => {
    const host = new SimHost(() => {});
    host.handle({ type: 'start', scenario: 'ukraine-2026', nation: N('UKR'), seed: 1, role: 'dictator' });
    host.handle({ type: 'ack' });
    host.handle({ type: 'step' });
    expect(authority(host.world!, N('UKR')).ai).toEqual(COMMAND_ROLES[0].ai);
    host.handle({ type: 'quit' });
  }, 300_000);
});

describe('settings that persist', () => {
  it('coach marks show once, can be asked for again, and never throw when storage is blocked', () => {
    const store = memory();
    expect(coachDue(store)).toBe(true);
    markCoachDone(store);
    expect(coachDue(store)).toBe(false);
    resetCoach(store);
    expect(coachDue(store)).toBe(true);
    expect(() => markCoachDone(broken)).not.toThrow();
    expect(coachDue(broken)).toBe(true);
  });

  it('crises are on until the player turns them off', () => {
    const store = memory();
    expect(crisesOn(store)).toBe(true);
    setCrises(false, store);
    expect(crisesOn(store)).toBe(false);
    expect(crisesOn(broken)).toBe(true);
  });
});

type Game = ReturnType<typeof playWithStaff>;
const games: Game[] = [];
const play = (scenario: string, nation: string) => {
  const g = playWithStaff(scenario, nation);
  games.push(g);
  return g;
};
afterEach(() => {
  for (const g of games.splice(0)) g.quit();
});

const contextOf = (g: Game): CrisisContext => ({
  me: g.desk.me, tick: g.state.tick, dtHours: 6, d: g.state.focusNation!, nations: g.state.nations,
  name: (id) => g.namer.nation(id),
  capital: (id) => {
    const i = map.nationIds.indexOf(id);
    const cell = i < 0 ? undefined : map.data.nations[i].capital?.cell;
    return cell === undefined ? undefined : (cell as NodeId);
  },
});

/** Choose a crisis option the way the page does: the desk records it and its command goes to the host. */
function choose(g: Game, card: Card, i: number, c = crisisOf(card, contextOf(g))!) {
  const o = c.options[i];
  g.desk.act(card, o.action);
  if (o.action.kind === 'command') g.send(o.action.command);
  return { crisis: c, option: o };
}

const shown = (g: Game, c: NonNullable<ReturnType<typeof crisisOf>>, chosen: number | null) =>
  renderToStaticMarkup(createElement(CrisisScreen, {
    crisis: c, me: g.desk.me, nation: 'Test', scenario: 'Test', date: new Date(g.state.date), defcon: 3, chosen,
    sent: g.desk.answered.find((s) => s.card.key === c.key), paused: true, onChoose: () => {}, onClose: () => {},
  }));

describe('crises stop the clock with one decision', () => {
  it('a treaty call (ww3-2027 as the United States): Go to war answers the call in the engine, and the result shows on the crisis', () => {
    const g = play('ww3-2027', 'USA');
    g.step();
    const c = nextCrisis(g.desk.cards, new Set(), contextOf(g));
    expect(c?.kind).toBe('treaty');
    expect(c!.options.map((o) => o.title)).toEqual(['Go to war', 'Wait and consult', 'Stand aside']);
    expect(c!.hoursLeft).toBeGreaterThan(0);
    const call = g.state.focusNation!.treatyCalls.find((x) => c!.key.startsWith(`treaty|${x.war}|${x.treaty}`))!;
    const { option } = choose(g, c!.card, 0, c!);
    expect(option.action).toMatchObject({ kind: 'command', command: { type: 'answer_treaty', nation: 'USA', war: call.war, treaty: call.treaty, join: true } });
    g.step();
    const sent = g.desk.answered.find((s) => s.card.key === c!.key)!;
    expect(sent.answer).toEqual({ ok: true, text: 'Treaty answer: will honour the treaty', final: true });
    const html = shown(g, c!, 0);
    expect(html).toContain('data-testid="crisis-result"');
    expect(html).toContain('will honour the treaty');
    g.step(4);
    expect(g.state.focusNation!.enemies).toContain(call.aggressor);
  }, 300_000);

  it('Stand aside refuses the call, and a crisis already shown does not come back', () => {
    const g = play('ww3-2027', 'USA');
    g.step();
    const c = nextCrisis(g.desk.cards, new Set(), contextOf(g))!;
    const { option } = choose(g, c.card, 2, c);
    expect(option.action).toMatchObject({ kind: 'command', command: { type: 'answer_treaty', join: false } });
    g.step();
    expect(g.desk.answered.find((s) => s.card.key === c.key)!.answer).toMatchObject({ ok: true, final: true });
    const again = nextCrisis(g.desk.cards, new Set([c.key]), contextOf(g));
    expect(again?.key).not.toBe(c.key);
  }, 300_000);

  it('Wait and consult leaves the call on the table to answer later', () => {
    const g = play('ww3-2027', 'USA');
    g.step();
    const c = nextCrisis(g.desk.cards, new Set(), contextOf(g))!;
    expect(c.options[1].defer).toBe(true);
    g.step();
    expect(g.desk.cards.some((x) => x.key === c.key), 'deferring sends nothing and keeps the card').toBe(true);
  }, 300_000);

  it('an enemy nuclear alert (south-asia-2027 as India): Raise the alert mates Indian warheads', () => {
    const g = play('south-asia-2027', 'IND');
    g.step(2);
    g.world.pending.push({ type: 'nuclear_alert', nation: N('PAK'), reason: 'test: Pakistan readies its forces' });
    g.step();
    const c = nextCrisis(g.desk.cards, new Set(), contextOf(g));
    expect(c?.kind).toBe('nuclear');
    expect(c!.options[0]).toMatchObject({ title: 'Raise our alert', recommended: true, action: { kind: 'command', command: { type: 'nuclear_alert', nation: 'IND' } } });
    choose(g, c!.card, 0, c!);
    for (let i = 0; i < 4 && !g.desk.answered.find((s) => s.card.key === c!.key)?.answer; i++) g.step();
    expect(g.desk.answered.find((s) => s.card.key === c!.key)!.answer).toMatchObject({ ok: true, text: 'Warheads are being mated to launchers' });
    expect(shown(g, c!, 0)).toContain('Warheads are being mated to launchers');
  }, 300_000);

  it('an armistice offer becomes a crisis with Accept issuing offer_peace', () => {
    const g = play('ukraine-2026', 'UKR');
    g.step();
    const card: Card = { key: 'peace|RUS', topic: 'diplomacy', role: 'foreign', tone: 'advice', tick: g.state.tick, title: '', text: '', primary: { kind: 'later', label: 'Fight on' } };
    const c = crisisOf(card, contextOf(g))!;
    expect(c.kind).toBe('peace');
    expect(c.options[0].action).toEqual({ kind: 'command', label: 'Accept peace', command: { type: 'offer_peace', nation: 'UKR', target: 'RUS' } });
    expect(c.options[1]).toMatchObject({ title: 'Fight on', recommended: true });
  }, 300_000);

  it('ordinary advice never stops the clock', () => {
    const g = play('ukraine-2026', 'UKR');
    g.step(4);
    const routine = g.desk.cards.filter((c) => !/^(treaty|nalert|peace|capital)\|/.test(c.key));
    expect(routine.length).toBeGreaterThan(0);
    expect(nextCrisis(routine, new Set(), contextOf(g))).toBeNull();
  }, 300_000);
});

describe('moments land only when the player would know them', () => {
  const capital = map.data.nations[map.nationIds.indexOf(N('UKR'))].capital!.cell as NodeId;
  const ctx = {
    me: N('UKR'), enemies: new Set([N('RUS')]), capitals: new Map([[capital, N('UKR')]]), isSea: (n: NodeId) => map.isSea(n),
    platformClass: (id: string) => (id === 'cvn' ? 'carrier' : 'destroyer'), place: () => 'Kyiv', at: () => 'at Kyiv', name: (id: NationId) => id as string,
    formation: (id: FormationId) => fleet.get(id), opening: new Set(['RUS>UKR']), capitalOf: (id: NationId) => (id === N('RUS') ? (5 as NodeId) : undefined),
  };
  const sea = [...Array(map.size).keys()].find((n) => map.isSea(n as NodeId)) as NodeId;
  const fleet = new Map<FormationId, { name: string; nation: NationId; kind: string; strength: number; node: NodeId }>([
    ['ukr-boats' as FormationId, { name: 'Odesa patrol group', nation: N('UKR'), kind: 'surface_group', strength: 0, node: sea }],
    ['rus-bsf' as FormationId, { name: 'Black Sea Fleet', nation: N('RUS'), kind: 'surface_group', strength: 0.6, node: sea }],
    ['tur-fleet' as FormationId, { name: 'Turkish fleet', nation: N('TUR'), kind: 'surface_group', strength: 0, node: sea }],
  ]);
  const land = (k: number) => [...Array(map.landCount).keys()].filter((n) => !map.isSea(n as NodeId)).slice(1000, 1000 + k) as NodeId[];

  it('a nuclear detonation anywhere, the fall of a capital we fight over, and a breakthrough', () => {
    expect(momentsOf([{ type: 'nuclear_detonation', tick: 5, by: N('IND'), node: 10 as NodeId, yieldKt: 15, casualties: 1000 }], ctx)).toMatchObject([{ kind: 'nuclear', title: 'Nuclear detonation' }]);
    expect(momentsOf([{ type: 'node_captured', tick: 5, node: capital, from: N('UKR'), to: N('RUS') }], ctx)).toMatchObject([{ kind: 'capital', tone: 'dread', title: 'Our capital has fallen' }]);
    const taken = land(3).map((node) => ({ type: 'node_captured' as const, tick: 5, node, from: N('RUS'), to: N('UKR') }));
    expect(momentsOf(taken, ctx)).toMatchObject([{ kind: 'breakthrough', tone: 'triumph' }]);
    expect(momentsOf(taken.slice(0, 2), ctx), 'two cells in a turn is not a breakthrough').toEqual([]);
  });

  it('a war declared on us lands (P1 H5), the opening war does not, and a war between others is not ours', () => {
    expect(momentsOf([{ type: 'war_declared', tick: 9, by: N('RUS'), on: N('UKR'), reason: 'x' }], ctx), 'the opening war has its cinematic').toEqual([]);
    expect(momentsOf([{ type: 'war_declared', tick: 9, by: N('RUS'), on: N('UKR'), reason: 'x' }], { ...ctx, opening: new Set() })).toMatchObject([{ kind: 'war', tone: 'dread', title: 'RUS declares war on us', node: 5 }]);
    expect(momentsOf([{ type: 'war_declared', tick: 9, by: N('USA'), on: N('CHN'), reason: 'x' }], ctx)).toEqual([]);
  });

  it('a naval group of ours sunk in port by a strike (P1 H5, the ferry group at Xiamen) is a moment, an enemy one a triumph, a neutral one nothing', () => {
    const hit = (formation: string, hits: number) => ({ type: 'strike' as const, tick: 7, by: N('RUS'), munition: 'kalibr' as never, fired: hits, intercepted: 0, target: 3 as NodeId, effects: [{ kind: 'ship_hits' as const, formation: formation as FormationId, hits }] });
    expect(momentsOf([hit('ukr-boats', 24)], ctx)).toMatchObject([{ kind: 'fleet', tone: 'dread', title: 'We have lost the Odesa patrol group' }]);
    expect(momentsOf([hit('rus-bsf', 3)], ctx), 'a group still afloat is a card, not a moment').toEqual([]);
    expect(momentsOf([{ type: 'formation_destroyed', tick: 7, formation: 'rus-bsf' as FormationId, nation: N('RUS') }], ctx)).toMatchObject([{ kind: 'fleet', tone: 'triumph' }]);
    expect(momentsOf([hit('tur-fleet', 9)], ctx)).toEqual([]);
  });

  it('a naval group wrecked by a nuclear detonation at its cell is part of that one moment, not a second flash', () => {
    const lost = { type: 'formation_destroyed' as const, tick: 7, formation: 'ukr-boats' as FormationId, nation: N('UKR') };
    const burst = (node: NodeId) => ({ type: 'nuclear_detonation' as const, tick: 7, by: N('RUS'), node, yieldKt: 150, casualties: 1000 });
    expect(momentsOf([burst(sea), lost], ctx)).toMatchObject([{ kind: 'nuclear' }]);
    expect(momentsOf([burst(10 as NodeId), lost], ctx), 'a group lost elsewhere that turn is its own moment').toMatchObject([{ kind: 'nuclear' }, { kind: 'fleet' }]);
  });

  it('a capital changing hands in a war we are not in, and a carrier lost in a battle we did not fight, are not ours to see', () => {
    expect(momentsOf([{ type: 'node_captured', tick: 5, node: capital, from: N('PER'), to: N('BOL') }], { ...ctx, capitals: new Map([[capital, N('PER')]]) })).toEqual([]);
    const battle = (attacker: string, defender: string, loser: string) => ({ type: 'battle' as const, tick: 5, node: 3 as NodeId, attacker: N(attacker), defender: N(defender), domain: 'sea' as const, losses: { [loser]: { cvn: 1 } }, casualties: {} });
    expect(momentsOf([battle('USA', 'CHN', 'CHN')], ctx)).toEqual([]);
    expect(momentsOf([battle('RUS', 'UKR', 'RUS')], ctx)).toMatchObject([{ kind: 'carrier', tone: 'triumph', title: 'Enemy carrier sunk' }]);
    expect(momentsOf([battle('RUS', 'UKR', 'UKR')], ctx)).toMatchObject([{ kind: 'carrier', tone: 'dread' }]);
  });
});

describe('the biggest events reach the War Room (P1 H5)', () => {
  it('gulf-2027 as Iran: the United States entering the war is a live War Room card and a moment, not a line in the ticker only', () => {
    const g = play('gulf-2027', 'IRN');
    let card: Card | undefined;
    const events: SimEvent[] = [];
    for (let i = 0; i < 28 && !card; i++) {
      g.step();
      events.push(...g.state.latestEvents);
      card = g.desk.cards.find((c) => c.key.startsWith('wire|war|') && c.title.includes('United States'));
    }
    expect(card, 'a war card for the United States entering').toMatchObject({ tone: 'live', topic: 'threat' });
    const opening = new Set(SCENARIO_CARDS.find((s) => s.id === 'gulf-2027')!.wars.map(([a, b]) => `${a}>${b}`));
    const capitalOf = (id: NationId) => map.data.nations[map.nationIds.indexOf(id)]?.capital?.cell as NodeId | undefined;
    const found = momentsOf(events, {
      me: N('IRN'), enemies: new Set(g.state.focusNation!.enemies), capitals: new Map(), isSea: (n) => map.isSea(n), platformClass: () => undefined,
      place: () => '', at: () => '', name: (id) => g.namer.nation(id), formation: () => undefined, opening, capitalOf,
    });
    expect(found.filter((m) => m.kind === 'war').map((m) => m.title)).toContain('United States declares war on us');
  }, 240_000);

  it('ww3-2027 as the United States: a naval group hit in port is a live card that opens the unit', () => {
    const g = play('ww3-2027', 'USA');
    let card: Card | undefined;
    for (let i = 0; i < 24 && !card; i++) {
      g.step();
      for (const c of g.state.focusNation?.treatyCalls ?? []) g.send({ type: 'answer_treaty', nation: N('USA'), war: c.war, treaty: c.treaty, join: true });
      card = g.desk.cards.find((c) => c.key.startsWith('shiphit|'));
    }
    expect(card).toMatchObject({ tone: 'live', primary: { kind: 'unit' } });
    const id = card!.key.split('|')[1] as FormationId;
    expect(g.world.formations[id].nation).toBe('USA');
    expect(['surface_group', 'submarine']).toContain(g.world.formations[id].kind);
  }, 300_000);
});

describe('a crisis tells the player what they hold and what they face (P1 H2, M4, M8, M9)', () => {
  it('ww3-2027 as the United States, Russia readies nuclear weapons: we can raise our own alert, the clock counts down to Russia fully armed, and Look first marks launchers', () => {
    const g = play('ww3-2027', 'USA');
    for (let i = 0; i < 8 && !g.state.focusNation?.enemies.includes(N('RUS')); i++) {
      g.step();
      for (const c of g.state.focusNation?.treatyCalls ?? []) g.send({ type: 'answer_treaty', nation: N('USA'), war: c.war, treaty: c.treaty, join: true });
    }
    g.world.pending.push({ type: 'nuclear_alert', nation: N('RUS'), reason: 'test: Russia readies its forces' });
    g.step();
    const card = g.desk.cards.find((c) => c.key.startsWith('nalert|RUS|'))!;
    expect(card.text).not.toMatch(/no nuclear answer/i);
    // The US hedge can now be uploaded (NUCLEAR_ALERT.USA), so the answer is an order, not only standing firm.
    expect(card.text).toMatch(/warheads in storage/);
    expect(card.primary).toMatchObject({ kind: 'command', command: { type: 'nuclear_alert', nation: 'USA' } });
    const c = crisisOf(card, contextOf(g))!;
    expect(c.options.map((o) => o.title)).toEqual(['Raise our alert', 'Hold readiness', 'Look first']);
    expect(c.options[0].recommended).toBe(true);
    const look = c.options[2].action;
    expect(look.kind === 'show' && look.marks?.length, 'Look first marks the launchers on the map').toBeGreaterThan(0);
    const spec = NUCLEAR_ALERT.RUS!;
    expect(c.windowHours).toBe(spec.fullHours);
    expect(c.hoursLeft).toBe(spec.fullHours - (g.state.tick - card.tick) * 6);
    expect(c.hoursLeft).toBeGreaterThan(0);
    const html = shown(g, c, null);
    expect(html).toContain('Russia fully armed in');
    expect(html).not.toContain('Stopped');
    expect(c.facts.find((f) => f.label === 'Our posture')?.value).toBe('Deployed on launchers');
  }, 300_000);

  it('ww3-2027 as the United States: after Go to war the crisis reads as answered, with the war we joined', () => {
    const g = play('ww3-2027', 'USA');
    g.step();
    const c = nextCrisis(g.desk.cards, new Set(), contextOf(g))!;
    expect(c.kind).toBe('treaty');
    choose(g, c.card, 0, c);
    g.step(4);
    const now = answered(c, contextOf(g));
    expect(now.hoursLeft).toBeNull();
    expect(now.facts.find((f) => f.label === 'Our wars now')?.value).toMatch(/^At war with/);
    const html = shown(g, now, 0);
    expect(html).toContain('Answered');
    expect(html).not.toContain('Answer due');
    expect(html).not.toContain('At peace');
  }, 300_000);

  it('ukraine-2026 as Ukraine: Show me on a raid draws each track from the attacker\'s ground to where it landed', () => {
    const g = play('ukraine-2026', 'UKR');
    let card: Card | undefined;
    for (let i = 0; i < 16 && !card; i++) {
      g.step();
      card = g.desk.cards.find((c) => c.key.startsWith('raid|'));
    }
    expect(card?.text).toMatch(/in the last 6 hours/);
    const show = card!.primary!;
    expect(show.kind).toBe('show');
    const marks = show.kind === 'show' ? show.marks ?? [] : [];
    expect(marks.length).toBeGreaterThan(0);
    const rus = map.nationIds.indexOf(N('RUS')), ukr = map.nationIds.indexOf(N('UKR'));
    for (const m of marks) {
      expect(g.state.control[m.from!], 'the track starts on Russian-held ground').toBe(rus);
      expect(g.state.control[m.to], 'and lands on ours').toBe(ukr);
    }
  }, 300_000);
});

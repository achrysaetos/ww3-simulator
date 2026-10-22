import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { NationId, NodeId } from '../src/core/types';
import { loadMap } from '../src/data/load';
import { profiles } from '../src/data/nations';
import { authority } from '../src/systems/orders';
import { coachDue, markCoachDone, resetCoach } from '../src/ui/coach/coach';
import { SCENARIO_CARDS, SimHost } from '../src/ui/host';
import { crisesOn, setCrises, type KeyValue } from '../src/ui/prefs';
import { nationCards, type FromWorker } from '../src/ui/snapshot';
import { featuredNations, scenarioInfo, threatOf } from '../src/ui/start/scenarioInfo';
import { COMMAND_ROLES } from '../src/ui/staff/roles';
import { CrisisScreen } from '../src/ui/crisis/CrisisScreen';
import { crisisOf, nextCrisis, type CrisisContext } from '../src/ui/crisis/crisis';
import type { Card } from '../src/ui/staff/advice';
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

const shown = (g: Game, c: NonNullable<ReturnType<typeof crisisOf>>, chosen: number) =>
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

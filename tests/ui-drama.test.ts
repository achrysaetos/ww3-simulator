import { describe, expect, it } from 'vitest';
import type { NationId } from '../src/core/types';
import { loadMap } from '../src/data/load';
import { profiles } from '../src/data/nations';
import { authority } from '../src/systems/orders';
import { coachDue, markCoachDone, resetCoach } from '../src/ui/coach/coach';
import { SCENARIO_CARDS, SimHost } from '../src/ui/host';
import { crisesOn, setCrises, type KeyValue } from '../src/ui/prefs';
import { nationCards, type FromWorker } from '../src/ui/snapshot';
import { featuredNations, scenarioInfo, threatOf } from '../src/ui/start/scenarioInfo';
import { COMMAND_ROLES } from '../src/ui/staff/roles';

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

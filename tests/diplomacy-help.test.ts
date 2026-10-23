import { describe, expect, it } from 'vitest';
import { atWar, relationMut } from '../src/core/engine';
import type { NationId, SimEvent } from '../src/core/types';
import { createDiplomacy, helpAnswer, type AllianceTreaty, type HelpAnswer } from '../src/systems/diplomacy';
import { id, testWorld } from '../src/testkit';

const N = id.nation;
const RUS = N('RUS'), UKR = N('UKR'), POL = N('POL'), USA = N('USA'), DEU = N('DEU'), BLR = N('BLR'), ROU = N('ROU'), FRA = N('FRA');
const pact = (tid: string, ...ms: NationId[]): AllianceTreaty =>
  ({ id: tid, kind: 'bilateral_defense', triggers: ['territory'], members: Object.fromEntries(ms.map((m) => [m, { role: 'mutual', reliability: 1, delayDays: 30 }])) });

/** `by` at war with `on`, opinions of the two set for `friends`, warheads as given; one step so the war has a coalition record. */
function war(by: NationId, on: NationId, opts: { alliances?: AllianceTreaty[]; nuclear?: boolean; opinions?: [NationId, NationId, number][] } = {}) {
  const t = testWorld([createDiplomacy({ alliances: opts.alliances ?? [] })]);
  for (const n of Object.values(t.world.nations)) n.nuclear.warheads = 0;
  if (opts.nuclear) t.world.nations[RUS].nuclear.warheads = 1500;
  for (const [a, b, o] of opts.opinions ?? []) relationMut(t.world, a, b).opinion = o;
  t.world.pending.push({ type: 'declare_war', nation: by, target: on });
  t.engine.step(t.world);
  return t;
}

const answer = (t: ReturnType<typeof war>, asker: NationId, helper: NationId) => helpAnswer(t.world, t.map, t.world.slices.diplomacy, asker, helper);

/** What the engine did when `asker` asked `helper`: whether the helper is now in the war, covers the asker with air defence, and the message. */
function ask(t: ReturnType<typeof war>, asker: NationId, helper: NationId) {
  const seen: SimEvent[] = [];
  t.world.pending.push({ type: 'request_help', nation: asker, target: helper });
  t.engine.step(t.world);
  seen.push(...t.world.events);
  const s = t.world.slices.diplomacy;
  return {
    joined: s.wars.some((w) => Object.keys(w.sides[0].members).includes(asker) ? helper in w.sides[0].members : helper in w.sides[1].members),
    aid: !!s.aid[helper]?.includes(asker),
    said: seen.flatMap((e) => (e.type === 'message' && e.text.includes(`asks ${helper} for help`) ? [e.text] : [])),
  };
}

const friendly = (helper: NationId, foe = RUS): [NationId, NationId, number][] => [[helper, UKR, 70], [helper, foe, -40]];

describe('asking for help', () => {
  it('brings a treaty ally into the war, even against a nuclear power', () => {
    const t = war(RUS, UKR, { nuclear: true, alliances: [pact('UKR-POL', UKR, POL)], opinions: friendly(POL) });
    expect(answer(t, UKR, POL)).toEqual({ give: 'join', basis: 'treaty', foe: RUS, treaty: 'UKR-POL' });
    const did = ask(t, UKR, POL);
    expect(did.joined).toBe(true);
    expect(atWar(t.world, POL, RUS)).toBe(true);
    expect(did.said).toEqual(['UKR asks POL for help: POL enters the war (treaty ally)']);
  });

  it('gets air defence, not troops, from a friend with no treaty when the enemy is nuclear-armed', () => {
    const t = war(RUS, UKR, { nuclear: true, opinions: friendly(USA) });
    expect(answer(t, UKR, USA)).toMatchObject({ give: 'aid', basis: 'nuclear', foe: RUS });
    const did = ask(t, UKR, USA);
    expect(did).toMatchObject({ joined: false, aid: true });
    expect(atWar(t.world, USA, RUS)).toBe(false);
    t.engine.run(t.world, 8);
    expect(t.world.slices.diplomacy.aid[USA]).toContain(UKR);
  });

  it('brings a close friend on the enemy border into a war with a non-nuclear enemy', () => {
    const t = war(BLR, UKR, { opinions: [[POL, UKR, 80], [POL, BLR, -40]] });
    expect(answer(t, UKR, POL)).toMatchObject({ give: 'join', basis: 'friend', foe: BLR });
    expect(ask(t, UKR, POL).joined).toBe(true);
  });

  it('gets only air defence from a treaty ally when the asker started the war', () => {
    const t = war(UKR, RUS, { alliances: [pact('UKR-POL', UKR, POL)], opinions: friendly(POL) });
    expect(answer(t, UKR, POL)).toMatchObject({ give: 'aid', basis: 'offensive' });
    expect(ask(t, UKR, POL)).toMatchObject({ joined: false, aid: true });
  });

  it('gets only air defence from a friend whose public would not back a war', () => {
    const t = war(BLR, UKR, { alliances: [pact('UKR-POL', UKR, POL)], opinions: friendly(POL, BLR) });
    t.world.nations[POL].warSupport = 0.3;
    expect(answer(t, UKR, POL)).toMatchObject({ give: 'aid', basis: 'weary' });
  });

  it('is refused by a friend fighting a war of its own', () => {
    const t = war(RUS, UKR, { opinions: friendly(POL) });
    t.world.pending.push({ type: 'declare_war', nation: BLR, target: POL });
    t.engine.step(t.world);
    expect(answer(t, UKR, POL)).toMatchObject({ give: 'refuse', basis: 'committed' });
  });

  it('is refused by a state tied to the enemy, and by one with no stake', () => {
    const t = war(RUS, UKR, { alliances: [pact('RUS-BLR', RUS, BLR)], opinions: [...friendly(BLR), [DEU, UKR, 10], [DEU, RUS, 0]] });
    expect(answer(t, UKR, BLR)).toEqual({ give: 'refuse', basis: 'other_side', foe: RUS, treaty: 'RUS-BLR' });
    expect(answer(t, UKR, DEU)).toMatchObject({ give: 'refuse', basis: 'no_stake' });
    expect(ask(t, UKR, DEU)).toMatchObject({ joined: false, aid: false, said: ['UKR asks DEU for help: DEU declines (no stake in the war)'] });
  });

  it('cannot be pressed again within the week, and does nothing if it is', () => {
    const t = war(RUS, UKR, { opinions: [[DEU, UKR, 10], [DEU, RUS, 0]] });
    ask(t, UKR, DEU);
    const again = answer(t, UKR, DEU);
    expect(again).toMatchObject({ give: 'none', no: { why: 'asked' } });
    expect(ask(t, UKR, DEU).said).toEqual([]);
    const due = (again as Extract<HelpAnswer, { give: 'none' }>).no as { again: number };
    t.engine.run(t.world, due.again - t.world.tick);
    expect(answer(t, UKR, DEU)).toMatchObject({ give: 'refuse' });
  });

  it('cannot ask an enemy, a co-belligerent, or anyone at peace', () => {
    const t = war(RUS, UKR, { alliances: [pact('UKR-POL', UKR, POL)], opinions: friendly(POL) });
    ask(t, UKR, POL);
    expect(answer(t, UKR, RUS)).toEqual({ give: 'none', no: { why: 'enemy' } });
    expect(answer(t, UKR, POL)).toEqual({ give: 'none', no: { why: 'fighting' } });
    expect(answer(t, ROU, FRA)).toBeUndefined();
  });

  it('agrees with the engine for every nation asked', () => {
    const t = war(RUS, UKR, { nuclear: true, alliances: [pact('UKR-POL', UKR, POL), pact('RUS-BLR', RUS, BLR)], opinions: [...friendly(USA), ...friendly(POL), [DEU, UKR, 10], [FRA, UKR, 90], [FRA, RUS, -20]] });
    t.world.nations[FRA].nuclear.warheads = 290;
    for (const helper of [POL, USA, BLR, DEU, FRA, ROU]) {
      const before = answer(t, UKR, helper)!;
      const did = ask(t, UKR, helper);
      const give = before.give;
      expect({ helper, joined: did.joined, aid: did.aid }).toEqual({ helper, joined: give === 'join', aid: give === 'aid' });
    }
  });
});

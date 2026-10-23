import { describe, expect, it } from 'vitest';
import { atWar, relationMut, type System } from '../src/core/engine';
import type { NationId } from '../src/core/types';
import { createDiplomacy, peaceAnswer, type AllianceTreaty } from '../src/systems/diplomacy';
import { id, testWorld } from '../src/testkit';
import { aimFlag, flagRow, peaceNeedle, VERB_OF, type FlagContext, type Stance } from '../src/ui/diplomacy/flags';
import { SnapshotEncoder, type NationDetail } from '../src/ui/snapshot';

const N = id.nation;
const RUS = N('RUS'), UKR = N('UKR'), POL = N('POL'), USA = N('USA');
const ctx: FlagContext = { name: (n) => `<${n}>`, dayOf: (t) => Math.floor(t / 4) };

/** RUS at war with UKR, RUS's war support settled from `baseline` by one diplomacy step. */
function war(baseline: number) {
  const t = testWorld([createDiplomacy()]);
  t.world.pending.push({ type: 'declare_war', nation: RUS, target: UKR });
  t.engine.step(t.world);
  t.world.slices.diplomacy.records[RUS].baseline = baseline;
  t.engine.step(t.world);
  return t;
}

function detailOf(t: ReturnType<typeof testWorld>, me: NationId): NationDetail {
  const enc = new SnapshotEncoder(t.map.nationIds, t.catalog, t.map.size);
  return enc.encode(t.world, t.map, { nation: me }, me).focusNation!;
}

const nationsOf = (t: ReturnType<typeof testWorld>) => new Map(Object.values(t.world.nations).map((n) => [n.id, { id: n.id, status: n.status, warheads: n.nuclear.warheads, gdpUsdB: 0 }]));

describe('peace answers', () => {
  it.each([0.9, 0.2])('say what offering peace then does (RUS baseline %s)', (baseline) => {
    const t = war(baseline);
    const a = peaceAnswer(t.world, t.map, t.world.slices.diplomacy, UKR, RUS);
    if (!a || a.deal === 'none') throw new Error(`no deal: ${JSON.stringify(a)}`);
    t.world.pending.push({ type: 'offer_peace', nation: UKR, target: RUS });
    t.engine.step(t.world);
    expect(atWar(t.world, UKR, RUS)).toBe(!a.terms.takes);
    expect(a.terms.takes).toBe(baseline < 0.5);
  });

  it('take a standing offer from the other side at once', () => {
    const t = war(0.9);
    t.world.slices.diplomacy.offers['RUS|UKR'] = RUS;
    expect(peaceAnswer(t.world, t.map, t.world.slices.diplomacy, UKR, RUS)).toMatchObject({ deal: 'war', terms: { takes: true, basis: 'offered' } });
  });

  it('are undefined between nations not at war', () => {
    const t = war(0.9);
    expect(peaceAnswer(t.world, t.map, t.world.slices.diplomacy, UKR, POL)).toBeUndefined();
  });
});

describe('the flag drag', () => {
  it('rows enemies first and leaves the player out', () => {
    const t = war(0.9);
    t.world.nations[USA].nuclear.warheads = 3700;
    const row = flagRow(detailOf(t, UKR), nationsOf(t));
    expect(row[0]).toEqual({ nation: RUS, stance: 'enemy' });
    expect(row.some((r) => r.nation === UKR)).toBe(false);
    expect(row.filter((r) => r.stance === 'neutral').map((r) => r.nation)).toContain(USA);
  });

  it('offers peace to an enemy that refuses, and says the offer stays', () => {
    const t = war(0.9);
    const a = aimFlag(detailOf(t, UKR), { nation: RUS, stance: 'enemy' }, ctx);
    expect(a.send?.command).toEqual({ type: 'offer_peace', nation: UKR, target: RUS });
    expect(a.words).toMatchObject({ primary: 'They refuse for now', tone: 'bad' });
    expect(a.words.secondary).toMatch(/takes terms below 40% · war support \d+%.*stays on the table/);
  });

  it('says an exhausted enemy accepts', () => {
    const a = aimFlag(detailOf(war(0.2), UKR), { nation: RUS, stance: 'enemy' }, ctx);
    expect(a.words).toMatchObject({ primary: 'They accept: the war ends', tone: 'good' });
    expect(a.send?.command.type).toBe('offer_peace');
  });

  it('sends nothing while the player’s own offer is on the table', () => {
    const t = war(0.9);
    t.world.pending.push({ type: 'offer_peace', nation: UKR, target: RUS });
    t.engine.step(t.world);
    const a = aimFlag(detailOf(t, UKR), { nation: RUS, stance: 'enemy' }, ctx);
    expect(a.send).toBeNull();
    expect(a.words).toMatchObject({ primary: 'your offer is already on the table', tone: 'refused' });
  });

  it('refuses a separate peace for a coalition member whose allies fight on, and sends nothing', () => {
    const NATO: AllianceTreaty = { id: 'NATO', kind: 'collective_defense', triggers: ['territory', 'forces'], members: { [POL]: { role: 'mutual', reliability: 1, delayDays: 0 }, [USA]: { role: 'mutual', reliability: 1, delayDays: 0 } } };
    const assault: System = { id: 'assault', step: (w, c) => atWar(w, RUS, POL) && c.emit({ type: 'battle', tick: w.tick, node: w.nations[POL].capital, attacker: RUS, defender: POL, losses: {}, casualties: {} }) };
    const t = testWorld([assault, createDiplomacy({ alliances: [NATO] })]);
    t.world.pending.push({ type: 'declare_war', nation: RUS, target: POL });
    t.engine.run(t.world, 8);
    expect(atWar(t.world, RUS, USA)).toBe(true);
    const a = aimFlag(detailOf(t, POL), { nation: RUS, stance: 'enemy' }, ctx);
    expect(a.send).toBeNull();
    expect(a.words).toMatchObject({ primary: 'you cannot make a separate peace while your allies fight on', tone: 'refused' });
  });

  it('asks a friend outside the war for help, shows the engine’s answer, and the engine gives it on release', () => {
    const t = war(0.9);
    t.world.nations[RUS].nuclear.warheads = 1500;
    relationMut(t.world, USA, UKR).opinion = 70;
    relationMut(t.world, USA, RUS).opinion = -40;
    t.engine.step(t.world);
    const d = detailOf(t, UKR);
    expect(flagRow(d, nationsOf(t))).toContainEqual({ nation: USA, stance: 'friend' });
    const a = aimFlag(d, { nation: USA, stance: 'friend' }, ctx);
    expect(VERB_OF.friend).toBe('ask');
    expect(a.words).toEqual({ kicker: 'Ask <USA> for help', primary: 'Air defence, not troops', secondary: '<RUS> is nuclear-armed and no treaty binds <USA> to you', tone: 'even' });
    t.world.pending.push(a.send!.command);
    t.engine.step(t.world);
    expect(t.world.slices.diplomacy.aid[USA]).toContain(UKR);
    expect(atWar(t.world, USA, RUS)).toBe(false);
    const again = aimFlag(detailOf(t, UKR), { nation: USA, stance: 'friend' }, ctx);
    expect(again.send).toBeNull();
    expect(again.words).toMatchObject({ primary: 'you asked <USA> this week', tone: 'refused' });
  });

  it('cannot ask a co-belligerent, presses no treaty call, and sends nothing at peace', () => {
    const NATO: AllianceTreaty = { id: 'NATO', kind: 'collective_defense', triggers: ['territory', 'forces'], members: { [POL]: { role: 'mutual', reliability: 1, delayDays: 0 }, [USA]: { role: 'mutual', reliability: 1, delayDays: 0 }, [N('DEU')]: { role: 'mutual', reliability: 1, delayDays: 3 } } };
    const assault: System = { id: 'assault', step: (w, c) => atWar(w, RUS, POL) && c.emit({ type: 'battle', tick: w.tick, node: w.nations[POL].capital, attacker: RUS, defender: POL, losses: {}, casualties: {} }) };
    const t = testWorld([assault, createDiplomacy({ alliances: [NATO] })]);
    t.world.pending.push({ type: 'declare_war', nation: RUS, target: POL });
    t.engine.run(t.world, 2);
    const d = detailOf(t, POL);
    const words = (nation: NationId, stance: Stance) => {
      const a = aimFlag(d, { nation, stance }, ctx);
      expect(a.send).toBeNull();
      return a.words.primary;
    };
    expect(words(USA, 'ally')).toBe('<USA> already fights beside you');
    expect(words(N('DEU'), 'pending')).toMatch(/^<DEU> answers its NATO call by D\+\d+$/);
    expect(aimFlag(detailOf(testWorld([createDiplomacy()]), UKR), { nation: USA, stance: 'neutral' }, ctx).words).toMatchObject({ primary: 'you are at war with no one', tone: 'refused' });
  });

  it('moves the peace needle toward peace as the enemy’s war support falls, full once it would take terms', () => {
    const at = (b: number) => peaceNeedle(detailOf(war(b), UKR), ctx)!;
    const [high, mid, low] = [at(0.95), at(0.7), at(0.2)];
    expect(high.value!).toBeLessThan(mid.value!);
    expect(mid.ready).toBe(false);
    expect(low).toMatchObject({ value: 1, ready: true, nation: RUS });
  });

  it('has no needle at peace', () => {
    const t = testWorld([createDiplomacy()]);
    expect(peaceNeedle(detailOf(t, UKR), ctx)).toBeNull();
  });
});

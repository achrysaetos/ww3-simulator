import { describe, expect, it } from 'vitest';
import { atWar, type System } from '../src/core/engine';
import type { NationId } from '../src/core/types';
import { createDiplomacy, peaceAnswer, type AllianceTreaty } from '../src/systems/diplomacy';
import { id, testWorld } from '../src/testkit';
import { aimFlag, flagRow, peaceNeedle, VERB_OF, type FlagContext, type FlagTarget, type Stance } from '../src/ui/diplomacy/flags';
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

const nationsOf = (t: ReturnType<typeof testWorld>) => new Map(Object.values(t.world.nations).map((n) => [n.id, { id: n.id, status: n.status, warheads: n.nuclear.warheads }]));

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

  it.each(['ally', 'pending', 'neutral'] as Stance[])('asks a %s for help only to explain why it cannot, and sends nothing', (stance) => {
    const t = war(0.9);
    const target: FlagTarget = { nation: USA, stance, ...(stance === 'pending' ? { call: { treaty: 'NATO', dueTick: 48 } } : {}) };
    const a = aimFlag(detailOf(t, UKR), target, ctx);
    expect(VERB_OF[stance]).toBe('ask');
    expect(a.send).toBeNull();
    expect(a.words.tone).toBe('refused');
    expect(a.words.primary).toBe({
      ally: '<USA> already fights beside you',
      pending: '<USA> answers its NATO call by D+12',
      neutral: 'no way to ask: <USA> enters a war only by treaty or by its own choice',
    }[stance as 'ally' | 'pending' | 'neutral']);
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

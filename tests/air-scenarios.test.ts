import { describe, expect, it } from 'vitest';
import type { Formation, MunitionId, NationId, NodeId, SimEvent } from '../src/core/types';
import { createSession } from '../src/scenarios';

const SCENARIO_MS = 300_000;
const N = (s: string) => s as NationId;
const BALLISTIC = new Set(['srbm', 'mrbm', 'irbm']);

type Session = ReturnType<typeof createSession>;

function steps(s: Session, ticks: number, each: (e: SimEvent) => void = () => {}): void {
  for (let i = 0; i < ticks; i++) for (const e of s.engine.step(s.world)) each(e);
}

const strikesBy = (s: Session, e: SimEvent, by: string, on: string): e is Extract<SimEvent, { type: 'strike' }> =>
  e.type === 'strike' && e.by === by && s.world.control[e.target] === on;

function order(s: Session, f: Formation, target: NodeId, extra: Record<string, unknown> = {}): void {
  s.world.pending.push({ type: 'order', nation: f.nation, formation: f.id, order: { posture: 'strike', target, ...extra }, byPlayer: true });
}

describe('precision weapons are stocked and produced (AS-1)', () => {
  // June 2025: Israel and the US stopped 80-90 % of ~550 Iranian ballistic missiles in 12 days (IDF 86 %; Ynet 84-87 %),
  // drawing Arrow, David's Sling and THAAD rounds from depots well past the first load on the launchers (WSJ, CSIS 2025).
  // The floor sits under the observed band because the model engages every missile, those falling on open ground too.
  it("Israel's missile defence reloads from its depots and stops most of Iran's ballistic missiles over 12 days of gulf-2027", () => {
    const s = createSession('gulf-2027', 1);
    const UPPER = ['arrow2', 'arrow3', 'stunner'] as MunitionId[];
    const loaded = () => Object.values(s.world.formations).reduce((a, f) => a + (f.nation === 'ISR' ? UPPER.reduce((b, m) => b + (f.magazine[m] ?? 0), 0) : 0), 0);
    const depot = () => UPPER.reduce((a, m) => a + (s.world.nations[N('ISR')].stockpile[m] ?? 0), 0);
    const atStart = { loaded: loaded(), depot: depot() };
    let fired = 0, intercepted = 0;
    steps(s, (12 * 24) / s.world.dtHours, (e) => {
      if (!strikesBy(s, e, 'IRN', 'ISR') || !BALLISTIC.has(s.catalog.munition(e.munition).kind)) return;
      fired += e.fired;
      intercepted += e.intercepted;
    });
    expect(atStart.depot).toBeGreaterThan(0);
    expect(depot()).toBeLessThan(atStart.depot);
    expect(fired).toBeGreaterThan(300);
    expect(intercepted / fired).toBeGreaterThanOrEqual(0.7);
  }, SCENARIO_MS);
});

describe('missile brigades mass their salvos (AS-2)', () => {
  // 1 October 2024: Iran put ~180-200 ballistic missiles on Israel in one wave (IDF, CSIS). The IDF put Iran's launchers
  // destroyed in June 2025 at about half its force, and the scenario's order of battle has those losses taken off: ~84
  // MRBM launchers reach Nevatim at 0.6 readiness, two rounds ready on each, so a full wave is now ~100.
  it('Iran masses a wave of about 100 ballistic missiles in one tick when every brigade in reach fires on Nevatim', () => {
    const s = createSession('gulf-2027', 1);
    s.world.nations[N('IRN')].controlledBy = 'human';
    const nevatim = s.map.nodeAt(31.21, 35.01);
    for (const f of Object.values(s.world.formations))
      if (f.nation === 'IRN' && f.kind === 'missile' && Object.keys(f.equipment).some((p) => s.catalog.platform(p as never).class === 'tel_mrbm'))
        order(s, f, nevatim, { targetClass: 'aircraft' });
    let most = 0;
    for (let t = 0; t < 4; t++) {
      let wave = 0;
      steps(s, 1, (e) => {
        if (e.type === 'strike' && e.by === 'IRN' && BALLISTIC.has(s.catalog.munition(e.munition).kind)) wave += e.fired;
      });
      most = Math.max(most, wave);
    }
    expect(most).toBeGreaterThanOrEqual(80);
    expect(most).toBeLessThanOrEqual(130);
  }, SCENARIO_MS);
});

describe('guided weapons behave like guided weapons (AS-3)', () => {
  // Operation Sindoor, 7-10 May 2025: India's SCALP and BrahMos strikes hit nine sites and eleven air bases in Pakistan
  // (Indian MoD; Maxar and Planet imagery); Pakistan's claims of intercepts were few and unverified.
  it("Pakistan stops well under all of India's cruise missiles in a week of south-asia-2027", () => {
    const s = createSession('south-asia-2027', 1);
    let fired = 0, intercepted = 0;
    steps(s, (7 * 24) / s.world.dtHours, (e) => {
      if (!strikesBy(s, e, 'IND', 'PAK') || !['cruise', 'antiship_cruise'].includes(s.catalog.munition(e.munition).kind)) return;
      fired += e.fired;
      intercepted += e.intercepted;
    });
    expect(fired).toBeGreaterThan(10);
    expect(intercepted / fired).toBeLessThan(0.6);
  }, SCENARIO_MS);
});

describe('strikes cut supply lines (AS-8)', () => {
  // October 2022 and July 2023: two attacks dropped Kerch bridge road spans and closed it for weeks to months
  // (Ukrainska Pravda, ISW); Storm Shadow hits closed the Chonhar bridge in June 2023.
  it("Ukraine's Storm Shadows and Neptunes cut the Kerch bridge in ukraine-2026", () => {
    const s = createSession('ukraine-2026', 1);
    s.world.nations[N('UKR')].controlledBy = 'human';
    const kerch = s.map.chokepoints.find((c) => c.id === 'kerch')!;
    const shooters = Object.values(s.world.formations).filter((f) => f.nation === 'UKR' && ((f.magazine['storm_shadow' as MunitionId] ?? 0) >= 1 || (f.magazine['neptune' as MunitionId] ?? 0) >= 1));
    expect(shooters.length).toBeGreaterThan(0);
    for (const f of shooters) order(s, f, kerch.edges[0][0], { targetClass: 'structure' });
    let lowest = 1;
    for (let t = 0; t < 24; t++) {
      steps(s, 1);
      lowest = Math.min(lowest, s.world.theater.chokepoints?.kerch ?? 1);
    }
    expect(lowest).toBeLessThan(0.05);
  }, SCENARIO_MS);
});

describe('stealth and tanking (AS-10)', () => {
  // June 2025: Israeli F-35Is struck Tehran, ~1,600 km from Nevatim, with tanker support and over Iran's air defences (IDF).
  it("Israel's F-35Is reach Tehran from Nevatim in gulf-2027", () => {
    const s = createSession('gulf-2027', 1);
    s.world.nations[N('ISR')].controlledBy = 'human';
    const tehran = s.map.nodeAt(35.69, 51.39);
    const wing = Object.values(s.world.formations).find((f) => f.nation === 'ISR' && f.kind === 'air_wing' && (f.equipment['f35a' as never] ?? 0) > 0)!;
    order(s, wing, tehran, { targetClass: 'structure' });
    let hits = 0;
    steps(s, 8, (e) => {
      if (e.type === 'strike' && e.by === 'ISR' && e.target === tehran) hits += e.fired;
    });
    expect(hits).toBeGreaterThan(0);
  }, SCENARIO_MS);
});

describe('idle strike orders do not tire a wing (AS-7, AS-13)', () => {
  // A wing tires from flying at surge tempo (RAND MG-1028), not from holding an order its tankers cannot carry it to.
  it("Nevatim's F-35Is stay fresh for three days on an order to strike Bandar Abbas, past what Israel's tankers reach", () => {
    const s = createSession('gulf-2027', 1);
    s.world.nations[N('ISR')].controlledBy = 'human';
    const bandarAbbas = s.map.nodeAt(27.19, 56.27);
    const wing = Object.values(s.world.formations).find((f) => f.nation === 'ISR' && f.kind === 'air_wing' && (f.equipment['f35a' as never] ?? 0) > 0)!;
    order(s, wing, bandarAbbas, { targetClass: 'structure' });
    const before = wing.fatigue;
    let fired = 0;
    steps(s, (3 * 24) / s.world.dtHours, (e) => {
      if (e.type === 'strike' && e.by === 'ISR' && e.target === bandarAbbas) fired += e.fired;
    });
    expect(wing.order.posture).toBe('strike');
    expect(fired).toBe(0);
    expect(wing.fatigue).toBeLessThanOrEqual(before);
  }, SCENARIO_MS);
});

describe("Iran's launchers are hunted (gulf-2027 launcher attrition)", () => {
  // June 2025: the IAF hunted Iran's missile launchers from the first night and the IDF claimed about half destroyed or
  // disabled within twelve days (IDF; CSIS Missile Defense Project). The floor is a sixth over a month: the model's
  // Israel strikes Iran with its F-35Is alone, its other wings held off by Iran's air defences.
  it('Israel destroys at least a sixth of Iran\'s ballistic missile launchers in 30 days', () => {
    const s = createSession('gulf-2027', 1);
    const TEL = new Set(['tel_srbm', 'tel_mrbm', 'tel_irbm']);
    const launchers = () => {
      let n = 0;
      for (const f of Object.values(s.world.formations))
        if (f.nation === 'IRN' && f.kind === 'missile') for (const [pid, k] of Object.entries(f.equipment)) if (TEL.has(s.catalog.platform(pid as never).class)) n += k;
      return n;
    };
    const start = launchers();
    steps(s, (30 * 24) / s.world.dtHours);
    expect(start - launchers()).toBeGreaterThanOrEqual(start / 6);
  }, SCENARIO_MS);
});

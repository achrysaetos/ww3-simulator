import { describe, expect, it } from 'vitest';
import { atWar } from '../src/core/engine';
import type { Formation, MunitionId, NationId, NodeId, SimEvent } from '../src/core/types';
import { createSession, type Session } from '../src/scenarios';
import { canEnter } from '../src/systems/land';

/**
 * Coalition war on the real world: who fights whom, where, and who may make peace or march
 * through whose land. Each case is a Red Team III finding (CD-*, XP-*), replayed on a full scenario.
 */

const N = (s: string) => s as NationId;
const perDay = (s: Session) => 24 / s.world.dtHours;

function runDays(s: Session, days: number, each?: (events: SimEvent[]) => void): void {
  for (let i = 0; i < days * perDay(s); i++) {
    const events = s.engine.step(s.world);
    each?.(events);
  }
}

/** A nation the player commands and whose strategic decisions it keeps: its AI delegate never makes war or peace for it. */
function playerRuns(s: Session, n: string): void {
  s.world.nations[N(n)].controlledBy = 'human';
}

describe('XP-1: armies do not march through neutral states', () => {
  it('no nation may move troops onto a state it is not fighting with or against, and has no grant from', () => {
    const s = createSession('peace-2027', 1);
    const { map, world } = s;
    const cellOf = new Map<NationId, NodeId>();
    for (let n = 0 as NodeId; n < map.landCount; n++) if (world.control[n] && !cellOf.has(world.control[n])) cellOf.set(world.control[n], n);
    const open: string[] = [];
    for (const a of Object.keys(world.nations) as NationId[])
      for (const [b, cell] of cellOf) if (a !== b && canEnter(world, map, a, cell)) open.push(`${a}>${b}`);
    expect(open).toEqual([]);
  });

  it('Turkey at war with Greece cannot route its armour through Bulgaria or North Macedonia, by order or by its AI', () => {
    const s = createSession('peace-2027', 1);
    const { map, world } = s;
    playerRuns(s, 'TUR');
    world.pending.push({ type: 'declare_war', nation: N('TUR'), target: N('GRC'), reason: 'flank' });
    const thessaloniki = map.nodeAt(40.7, 22.9);
    const brigades = Object.values(world.formations).filter((f) => f.nation === 'TUR' && f.kind === 'maneuver' && !f.territorial).slice(0, 6);
    runDays(s, 1);
    world.pending.push({ type: 'hold', nation: N('TUR'), formations: brigades.map((f) => f.id), held: true });
    for (const f of brigades) world.pending.push({ type: 'order', nation: N('TUR'), formation: f.id, order: { posture: 'attack', target: thessaloniki } });
    const transit = new Set<string>();
    const neutralSoil = (f: Formation) => f.node < map.landCount && !['TUR', 'GRC'].includes(world.control[f.node]);
    const turks = () => Object.values(world.formations).filter((f) => f.nation === 'TUR' && f.status === 'active' && (f.kind === 'maneuver' || f.kind === 'artillery'));
    const startedAbroad = new Set(turks().filter(neutralSoil).map((f) => f.id));
    runDays(s, 1);
    for (const f of brigades) for (const n of f.order.path ?? []) if (['BGR', 'MKD'].includes(world.control[n])) transit.add(`${f.name} path`);
    runDays(s, 14, () => {
      for (const f of turks()) if (!startedAbroad.has(f.id) && neutralSoil(f)) transit.add(`${f.name} on ${world.control[f.node]}`);
    });
    expect([...transit]).toEqual([]);
    expect(atWar(world, N('TUR'), N('BGR')) || atWar(world, N('TUR'), N('MKD'))).toBe(false);
  }, 180_000);
});

describe('CD-2: treaties apply where the attack lands', () => {
  it('Iran declaring war on the US does not bring Japan, Korea or the Philippines in', () => {
    const s = createSession('peace-2027', 1);
    s.world.pending.push({ type: 'declare_war', nation: N('IRN'), target: N('USA'), reason: 'strike on US Fifth Fleet' });
    runDays(s, 8);
    expect(atWar(s.world, N('IRN'), N('USA'))).toBe(true);
    for (const n of ['JPN', 'KOR', 'PHL']) expect(atWar(s.world, N('IRN'), N(n)), n).toBe(false);
  }, 180_000);
});

describe('CD-1: no separate peace while allies fight on', () => {
  it("Russia's day-10 offer cannot take Estonia out of a war NATO is fighting for it", () => {
    const s = createSession('baltic-2027', 1);
    playerRuns(s, 'RUS');
    runDays(s, 10);
    expect(atWar(s.world, N('RUS'), N('USA'))).toBe(true);
    for (const n of ['EST', 'LVA', 'LTU']) s.world.pending.push({ type: 'offer_peace', nation: N('RUS'), target: N(n) });
    runDays(s, 4);
    for (const n of ['EST', 'LVA', 'LTU']) expect(atWar(s.world, N('RUS'), N(n)), n).toBe(true);
  }, 300_000);
});

/** Interceptors (SAMs, ABMs, SHORAD and air-to-air missiles) each nation fires per tick, read off its magazines. */
function interceptorsSpent(s: Session, nations: readonly string[]): () => Record<string, number> {
  const kinds = new Set(['sam', 'abm', 'shorad_missile', 'aam']);
  const interceptor = (m: string) => kinds.has(s.catalog.munitions.get(m as MunitionId)?.kind ?? '');
  const last = new Map<string, number>();
  const spent: Record<string, number> = Object.fromEntries(nations.map((n) => [n, 0]));
  return () => {
    for (const f of Object.values(s.world.formations)) {
      if (!nations.includes(f.nation)) continue;
      for (const [m, n] of Object.entries(f.magazine)) {
        if (!interceptor(m)) continue;
        const k = `${f.id}|${m}`;
        const before = last.get(k);
        if (before !== undefined && n < before) spent[f.nation] += before - n;
        last.set(k, n);
      }
    }
    return spent;
  };
}

/**
 * Move `nation`'s first active formation of `kind` that carries an interceptor of one of `kinds`
 * to (lat, lon): the April 2024 coalition posture, which the gulf-2027 order of battle does not hold.
 */
function station(s: Session, nation: string, kind: Formation['kind'], kinds: readonly string[], lat: number, lon: number): void {
  const f = Object.values(s.world.formations).find((x) => x.nation === nation && x.kind === kind && x.status === 'active'
    && Object.entries(x.magazine).some(([m, n]) => n > 0 && kinds.includes(s.catalog.munitions.get(m as MunitionId)?.kind ?? '')));
  if (!f) throw new Error(`no ${nation} ${kind} to station`);
  f.node = s.map.nodeAt(lat, lon);
  if (kind === 'surface_group') f.home = f.node;
  f.order = { posture: kind === 'surface_group' ? 'patrol' : 'defend', issuedTick: 0 };
}

describe('CD-4: helping a side without joining it', () => {
  it('the US, UK, France and Jordan intercept for Israel from the first days without going to war with Iran', () => {
    const s = createSession('gulf-2027', 1);
    // 13-14 Apr 2024: US destroyers in the eastern Mediterranean and F-15Es in Jordan, RAF Typhoons at Akrotiri,
    // French fighters from Jordan (US DoD, UK MoD and Elysee statements, 14 Apr 2024). Jordan's own forces are in place.
    station(s, 'USA', 'surface_group', ['sam', 'abm'], 33.5, 33.5);
    station(s, 'USA', 'air_wing', ['aam'], 31.83, 36.78);
    station(s, 'GBR', 'air_wing', ['aam'], 34.9, 33.0);
    station(s, 'FRA', 'air_wing', ['aam'], 32.16, 37.15);
    const donors = ['USA', 'GBR', 'FRA', 'JOR'];
    const tally = interceptorsSpent(s, donors);
    const atPeace = Object.fromEntries(donors.map((n) => [n, 0]));
    tally();
    for (let i = 0; i < 3 * perDay(s); i++) {
      const before = { ...tally() };
      s.engine.step(s.world);
      const after = tally();
      for (const n of donors) if (!atWar(s.world, N(n), N('IRN'))) atPeace[n] += after[n] - before[n];
    }
    for (const n of donors) expect(atPeace[n], n).toBeGreaterThan(0);
  }, 180_000);
});

describe('CD-5: a limited war stays limited', () => {
  it('a Korean war with a ROK counteroffensive does not have the US striking Russians in Belarus', () => {
    const s = createSession('korea-2027', 1);
    const { map, world } = s;
    // The ROK holds the southern tenth of the DPRK's people: a counteroffensive that calls in Russia and China.
    const cells = map.nodesOf(N('PRK')).sort((a, b) => map.lat[a] - map.lat[b]);
    let pop = 0;
    for (const n of cells) {
      if (pop >= 0.1) break;
      world.control[n] = N('KOR');
      pop += map.popShare[n];
    }
    const outOfTheatre: string[] = [];
    runDays(s, 10, (events) => {
      for (const e of events)
        if (e.type === 'strike' && !map.isSea(e.target) && map.owner[e.target] === 'BLR') outOfTheatre.push(`${e.by} ${e.munition}`);
    });
    expect(outOfTheatre).toEqual([]);
    for (const n of ['USA', 'KOR', 'JPN']) expect(atWar(world, N(n), N('BLR')), n).toBe(false);
  }, 300_000);
});

describe('XP-4: peace treaties hold', () => {
  it('an Israeli war on Lebanon does not pull Egypt, Jordan or Morocco in under the Arab League', () => {
    const s = createSession('peace-2027', 1);
    s.world.pending.push({ type: 'declare_war', nation: N('ISR'), target: N('LBN'), reason: 'Hezbollah' });
    const entered: string[] = [];
    runDays(s, 24, (events) => {
      for (const e of events)
        if (e.type === 'war_declared' && [e.by, e.on].includes(N('ISR')) && ['EGY', 'JOR', 'MAR'].some((n) => [e.by, e.on].includes(N(n)))) entered.push(`${e.by}>${e.on}: ${e.reason}`);
    });
    expect(entered).toEqual([]);
  }, 300_000);
});

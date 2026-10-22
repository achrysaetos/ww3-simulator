import { describe, expect, it } from 'vitest';
import type { Formation, NationId, NodeId, PlatformClass, PlatformId } from '../src/core/types';
import { createSession, type Session } from '../src/scenarios';
import { allied } from '../src/systems/land/state';
import { computeTradeBlocked } from '../src/systems/naval/blockade';
import { applyHits } from '../src/systems/naval/combat';
import { tickEnv } from '../src/systems/naval/env';
import { geography, nearestSea } from '../src/systems/naval/geography';
import { mineWarfare } from '../src/systems/naval/mines';
import { minedClosed } from '../src/systems/naval/movement';
import { isSealift } from '../src/systems/naval/sealift';
import { compose } from '../src/systems/naval/state';

const nation = (n: string) => n as NationId;
const USA = nation('USA'), CHN = nation('CHN'), IRN = nation('IRN'), UKR = nation('UKR');

/** Steps a session `days` days, handing each tick's events to `on`. */
function runDays(s: Session, days: number, on?: (events: ReturnType<Session['engine']['step']>) => void): void {
  const perDay = Math.round(24 / s.world.dtHours);
  for (let i = 0; i < days * perDay; i++) {
    const events = s.engine.step(s.world);
    on?.(events);
  }
}

const named = (s: Session, prefix: string) => Object.values(s.world.formations).find((f) => f.name.startsWith(prefix))!;
const naval = (f: Formation) => f.kind === 'surface_group' || f.kind === 'submarine';
const classOf = (s: Session, pid: string) => s.catalog.platform(pid as PlatformId).class;

/** A human nation that leaves every domain to its AI delegate, so that single formations can be held and ordered. */
function delegateAll(s: Session, n: NationId): void {
  s.world.nations[n].controlledBy = 'human';
  for (const domain of ['land', 'air', 'naval', 'homefront', 'strategic'] as const) s.world.pending.push({ type: 'delegate', nation: n, domain, ai: true });
}

describe('a submarine blockade is fought, not presence (NV-1)', () => {
  // On main five SSNs at Malacca cut 45.7% of China's trade for 60 days without firing, and China never contested them.
  it('Malacca: the squadron spends torpedoes on the shipping it interdicts, and China sends hunters', () => {
    const s = createSession('peace-2027', 1);
    const { world, map } = s;
    world.nations[USA].controlledBy = 'human';
    world.pending.push({ type: 'delegate', nation: USA, domain: 'strategic', ai: true });
    world.pending.push({ type: 'declare_war', nation: USA, target: CHN, reason: 'distant blockade' });
    const malacca = geography(map).chokepoints.find((c) => c.def.name === 'Strait of Malacca')!.nodes;
    const sq = named(s, 'Submarine Squadron 15');
    const loaded = sq.magazine['mk48' as never] as number;
    world.pending.push({ type: 'hold', nation: USA, formations: [sq.id], held: true });
    world.pending.push({ type: 'order', nation: USA, formation: sq.id, order: { posture: 'blockade', target: nearestSea(map, 4.5, 99) } });
    let blocked = 0, contested = false;
    runDays(s, 25, () => {
      blocked = Math.max(blocked, world.theater.tradeBlocked[CHN] ?? 0);
      for (const f of Object.values(world.formations)) if (f.nation === CHN && f.status === 'active' && naval(f) && malacca.includes(f.node)) contested = true;
    });
    expect(blocked, 'the blockade bites').toBeGreaterThan(0.2);
    expect(loaded - (sq.magazine['mk48' as never] as number), 'torpedoes fired at merchant shipping').toBeGreaterThan(30);
    expect(contested, 'a Chinese hunter reaches the strait').toBe(true);
  }, 300_000);
});

describe('submarines in the Gulf (NV-5, NV-6)', () => {
  // On main US SSNs fired 652 Mk 48s at Iranian speedboats in 30 days and lost 8 boats parked in Iran's Hormuz minefield.
  it('gulf-2027: no heavyweight torpedoes at speedboats, no attack submarine stationed in a minefield', () => {
    const s = createSession('gulf-2027', 1);
    const { world } = s;
    const small: ReadonlySet<PlatformClass> = new Set(['patrol', 'usv']);
    const usSubs = Object.values(world.formations).filter((f) => f.nation === USA && f.kind === 'submarine');
    const wasted: string[] = [], mined: string[] = [];
    let worthy = new Map<string, boolean>();
    const perDay = Math.round(24 / world.dtHours);
    for (let i = 0; i < 30 * perDay; i++) {
      worthy = new Map(Object.values(world.formations).filter((f) => f.nation === IRN && naval(f)).map((f) => [f.id, Object.keys(f.equipment).some((p) => !small.has(classOf(s, p)))]));
      const hulls = new Map(usSubs.map((f) => [f.id, Object.values(f.equipment).reduce((a, n) => a + n, 0)]));
      for (const e of s.engine.step(world)) {
        if (e.type !== 'strike' || e.by !== USA || e.munition !== 'mk48') continue;
        for (const fx of e.effects ?? []) if (fx.kind === 'ship_hits' && worthy.get(fx.formation) === false) wasted.push(`tick ${world.tick} ${world.formations[fx.formation].name}`);
      }
      for (const f of usSubs) {
        const now = Object.values(f.equipment).reduce((a, n) => a + n, 0);
        if (now < hulls.get(f.id)! && minedClosed(world, f.node, USA)) mined.push(`tick ${world.tick} ${f.name} lost a boat in a minefield`);
        if (f.status === 'active' && !f.order.path?.length && f.order.target !== undefined && minedClosed(world, f.order.target, USA)) mined.push(`tick ${world.tick} ${f.name} on station in a minefield`);
      }
    }
    expect(Object.keys(world.slices.naval.mines).length, 'Iran mines Hormuz').toBeGreaterThan(0);
    expect(wasted).toEqual([]);
    expect(mined).toEqual([]);
  }, 300_000);

  it('a torpedo spread at a mixed group lands on its warships, not the speedboats around them', () => {
    const s = createSession('gulf-2027', 1);
    const env = tickEnv(s.world, s.engine.context(s.world), true);
    const group = named(s, 'IRGCN 1st Naval District');
    const before = new Map(Object.entries(group.equipment));
    applyHits(env, group, [], USA, [2, 2, 2, 2]);
    const hit = [...before].filter(([pid, n]) => (group.equipment[pid as PlatformId] ?? 0) < n).map(([pid]) => classOf(s, pid));
    expect(hit.length).toBeGreaterThan(0);
    for (const c of hit) expect(['patrol', 'usv']).not.toContain(c);
  }, 180_000);
});

describe('escorts and convoys (NV-4)', () => {
  // On main escorts lowered only their own flag's interdiction, so US destroyers at Hormuz did nothing for Qatar.
  it('gulf-2027: US warships in a contested strait protect neutral shipping from Iran', () => {
    const s = createSession('gulf-2027', 1);
    runDays(s, 10);
    const { world } = s;
    const qat = nation('QAT');
    const env = () => tickEnv(world, s.engine.context(world), true);
    const hormuz = geography(s.map).chokepoints.find((c) => c.def.name === 'Strait of Hormuz')!.nodes;
    const iranAt = hormuz.find((n) => Object.values(world.formations).some((f) => f.nation === IRN && f.status === 'active' && f.node === n && f.order.posture === 'blockade'));
    expect(iranAt, 'an Iranian group blockades the strait').toBeDefined();
    computeTradeBlocked(env());
    const unescorted = world.theater.tradeBlocked[qat];
    const des = named(s, 'Destroyer Squadron 60');
    des.node = iranAt!;
    des.order = { posture: 'patrol', target: iranAt!, path: [], issuedTick: world.tick };
    computeTradeBlocked(env());
    expect(world.theater.tradeBlocked[qat]).toBeLessThan(unescorted - 0.01);
  }, 300_000);

  // On main the AI never escorted sealift: five US cargo ships were sunk crossing to Europe in baltic-2027.
  it('baltic-2027: the US AI escorts its loaded sealift convoys', () => {
    const s = createSession('baltic-2027', 1);
    const { world, catalog } = s;
    let sailing = 0, escorted = 0;
    runDays(s, 18, () => {
      for (const c of Object.values(world.formations)) {
        if (c.nation !== USA || c.status !== 'active' || c.order.posture !== 'move' || !c.order.path?.length || !isSealift(compose(c, catalog))) continue;
        sailing++;
        if (Object.values(world.formations).some((g) => g.status === 'active' && g.order.posture === 'escort' && g.order.targetFormation === c.id)) escorted++;
      }
    });
    expect(sailing).toBeGreaterThan(0);
    expect(escorted / sailing).toBeGreaterThan(0.5);
  }, 300_000);
});

describe('mine countermeasures (NV-3)', () => {
  // On main all four US minehunters were mined within two days of entering Iran's Hormuz field, having swept half a mine.
  it('gulf-2027: minehunters working the Hormuz field survive it and clear mines', () => {
    const s = createSession('gulf-2027', 1);
    runDays(s, 10);
    const { world } = s;
    const field = Number(Object.keys(world.slices.naval.mines)[0]) as NodeId;
    const mcm = named(s, 'Commander Task Force 55');
    const hulls = () => Object.values(mcm.equipment).reduce((a, n) => a + n, 0);
    const start = hulls();
    const laid = Object.values(world.slices.naval.mines[field]).reduce((a, n) => a + n, 0);
    expect(laid).toBeGreaterThan(100);
    mcm.node = field;
    mcm.order = { posture: 'patrol', target: field, path: [], issuedTick: world.tick };
    // Mine warfare alone, so that only the mines can touch the sweepers.
    for (let i = 0; i < 30 * 4; i++) {
      world.tick++;
      mineWarfare(tickEnv(world, s.engine.context(world), true));
    }
    expect(hulls(), 'hulls still sweeping').toBeGreaterThanOrEqual(start - 1);
    expect(world.slices.naval.ledger[USA].minesSwept).toBeGreaterThan(40);
  }, 300_000);
});

describe('fleets fight within reach of their bases (NV-7)', () => {
  // On main, with the US Pacific Fleet held in San Diego, the whole PLAN and the coast guard crossed the Pacific in 12 days.
  it('peace-2027: China does not send its fleet across the Pacific to a fleet in being', () => {
    const s = createSession('peace-2027', 1);
    const { world, map } = s;
    world.nations[USA].controlledBy = 'human';
    world.pending.push({ type: 'delegate', nation: USA, domain: 'strategic', ai: true });
    world.pending.push({ type: 'declare_war', nation: USA, target: CHN, reason: 'fleet in being' });
    const sanDiego = Object.values(world.formations).filter((f) => f.nation === USA && f.kind === 'surface_group' && map.lon[f.home] < -110 && map.lon[f.home] > -125);
    world.pending.push({ type: 'hold', nation: USA, formations: sanDiego.map((f) => f.id), held: true });
    const far = new Set<string>();
    runDays(s, 18, () => {
      for (const f of Object.values(world.formations)) if (f.nation === CHN && f.status === 'active' && naval(f) && (map.lon[f.node] > 165 || map.lon[f.node] < -100)) far.add(f.name);
    });
    expect([...far]).toEqual([]);
  }, 300_000);
});

describe('Ukraine orders a drone-boat raid (NV-11)', () => {
  // On main an order sent the crewless boats home at once (no food aboard), and nothing located a ship off Novorossiysk.
  it('ukraine-2026: GUR strike USVs ordered on the 197th Landing Ship Brigade raid it', () => {
    const s = createSession('ukraine-2026', 1);
    const { world } = s;
    delegateAll(s, UKR);
    const usv = named(s, 'GUR Group 13');
    const target = named(s, 'Black Sea Fleet 197th Landing Ship');
    world.pending.push({ type: 'hold', nation: UKR, formations: [usv.id], held: true });
    world.pending.push({ type: 'order', nation: UKR, formation: usv.id, order: { posture: 'attack', targetFormation: target.id } });
    const raids: string[] = [];
    runDays(s, 30, (events) => {
      for (const e of events) if (e.type === 'message' && e.nation === UKR && e.text.includes(usv.name) && e.text.includes('197th')) raids.push(e.text);
    });
    expect(raids.length).toBeGreaterThan(0);
    expect(usv.order.posture).toBe('attack');
  }, 300_000);
});

describe('fleets lie in port (NV-8) and ports weigh by their cargo (NV-13)', () => {
  // On main 41 of 311 fleets were based on a sea zone, so subs sank San Diego's amphibious ships at their pier.
  it('fleets whose base fell on open water lie in a port of their own or a host ally', () => {
    const s = createSession('peace-2027', 1);
    const { world, map } = s;
    for (const name of ['Expeditionary Strike Group 3', 'Destroyer Squadron 60', 'Black Sea Fleet 197th Landing Ship']) {
      const f = named(s, name);
      expect(map.isSea(f.home), name).toBe(false);
      expect(map.ports[f.home], name).toBeGreaterThan(0);
      expect(allied(world, f.nation, world.control[f.home]!), name).toBe(true);
    }
    expect(world.control[named(s, 'Expeditionary Strike Group 3').home]).toBe('USA');
  }, 180_000);

  // On main Gwadar weighed as much as Karachi, so a blockade of Karachi cut half of Pakistan's trade.
  it("Karachi carries most of Pakistan's seaborne trade", () => {
    const s = createSession('south-asia-2027', 1);
    const ports = geography(s.map).ports.filter((p) => s.map.owner[p.node] === 'PAK');
    const total = ports.reduce((a, p) => a + p.weight, 0);
    const karachi = ports.find((p) => s.map.cities.some((c) => c.node === p.node && c.name === 'Karachi'))!;
    expect(karachi.weight / total).toBeGreaterThan(0.8);
  }, 180_000);
});

import { describe, expect, it } from 'vitest';
import { relationMut, type SimContext } from '../src/core/engine';
import { COMMAND_DOMAINS, type CommandResult, type Formation, type MunitionId, type NationId, type Order, type PlatformId, type SimEvent } from '../src/core/types';
import { createSession } from '../src/scenarios';
import { strikeNavalGroup } from '../src/systems/naval';
import { applyHits } from '../src/systems/naval/combat';
import { tickEnv } from '../src/systems/naval/env';
import { compose } from '../src/systems/naval/state';

const N = (s: string) => s as NationId;
type Session = ReturnType<typeof createSession>;

/** `nation` played by a human who commands every domain itself (the Every Brigade role). */
function playAs(scenario: string, nation: string): Session {
  const s = createSession(scenario, 1);
  for (const n of Object.values(s.world.nations)) n.controlledBy = n.id === nation ? 'human' : 'ai';
  for (const domain of COMMAND_DOMAINS) s.world.pending.push({ type: 'delegate', nation: N(nation), domain, ai: false });
  return s;
}

const named = (s: Session, name: string): Formation => {
  const f = Object.values(s.world.formations).find((x) => x.name === name);
  if (!f) throw new Error(`no formation ${name}`);
  return f;
};

/** The player's order, answered on the next step. */
function order(s: Session, f: Formation, o: Omit<Order, 'issuedTick'>): CommandResult {
  s.world.pending.push({ type: 'order', nation: f.nation, formation: f.id, order: o, byPlayer: true });
  const r = s.engine.step(s.world).find((e): e is CommandResult => e.type === 'command_result' && e.formation === f.id);
  if (!r) throw new Error(`no answer for ${f.name}`);
  return r;
}

/** A context whose events land in `events`, for driving a system function between steps. */
function context(s: Session, events: SimEvent[]): SimContext {
  return { ...s.engine.context(s.world), emit: (e) => events.push(e) };
}

/** Many light hits spread over every hull: each ship is mission-killed, none sinks. */
function disable(s: Session, g: Formation, by: string): SimEvent[] {
  const events: SimEvent[] = [];
  applyHits(tickEnv(s.world, context(s, events), true), g, new Array(2000).fill(0.01), N(by));
  expect(compose(g, s.catalog).crippled).toBe(true);
  return events;
}

const refusals = (events: SimEvent[], f: Formation) => events.filter((e): e is CommandResult => e.type === 'command_result' && e.formation === f.id && !e.ok && !!e.byPlayer);
const aboard = (s: Session, lift: Formation) => Object.values(s.world.formations).filter((e) => e.status === 'embarked' && e.embarkedOn === lift.id);

/** The 1st Marine Brigade boards the Southern Theatre amphibious flotilla alongside at Zhanjiang, out of Taiwan's reach. */
function embarkMarines(): { s: Session; lift: Formation; team: Formation } {
  const s = playAs('taiwan-2027', 'CHN');
  const lift = named(s, 'Southern TC Navy Amphibious Flotilla');
  const marines = named(s, '1st Marine Brigade');
  expect(order(s, marines, { posture: 'embark', targetFormation: lift.id }).ok).toBe(true);
  const [team] = aboard(s, lift);
  expect(team).toBeDefined();
  return { s, lift, team };
}

describe('a lift group disabled with troops aboard (P1 C1)', () => {
  it('puts the troops ashore when it is disabled in port, and tells the player its order is gone', () => {
    const { s, lift, team } = embarkMarines();
    const port = lift.node;
    const men = team.personnel;
    const events = disable(s, lift, 'TWN');
    expect(refusals(events, lift).map((e) => e.reason).join()).toMatch(/troops aboard go ashore/);
    s.engine.step(s.world);
    expect(aboard(s, lift)).toEqual([]);
    expect(team.status).toBe('active');
    expect(team.node).toBe(port);
    expect(team.personnel).toBe(men);
  }, 120_000);

  it('answers the player when it is disabled at sea on its way to land, carries the troops home and puts them ashore there', () => {
    const { s, lift, team } = embarkMarines();
    const taichung = s.map.nodeAt(24.15, 120.65);
    expect(order(s, lift, { posture: 'attack', target: taichung }).ok).toBe(true);
    for (let i = 0; i < 20 && !s.map.isSea(lift.node); i++) s.engine.step(s.world);
    expect(s.map.isSea(lift.node)).toBe(true);
    const events = disable(s, lift, 'TWN');
    const [why] = refusals(events, lift);
    expect(why?.code).toBe('not_ready');
    expect(why?.reason).toMatch(/with the troops aboard/);
    expect(lift.order.posture).toBe('reserve');
    for (let i = 0; i < 40 && lift.node !== lift.home; i++) s.engine.step(s.world);
    expect(lift.node).toBe(lift.home);
    s.engine.step(s.world);
    expect(aboard(s, lift)).toEqual([]);
    expect(team.status).toBe('active');
    expect(team.node).toBe(lift.home);
  }, 120_000);
});

describe("the naval system overriding a player's order (P1 H6)", () => {
  it('answers the player with the reason when it sends a carrier group home', () => {
    const s = playAs('ww3-2027', 'USA');
    const csg = named(s, 'Carrier Strike Group 5 (George Washington, CVW-5)');
    const zone = s.map.nodeAt(26, 125);
    expect(order(s, csg, { posture: 'move', target: zone }).ok).toBe(true);
    for (let i = 0; i < 8 && csg.node === csg.home; i++) s.engine.step(s.world);
    expect(csg.node).not.toBe(csg.home);
    // The escorts burn down to the fuel they need to get home.
    csg.supply.fuel = 0.2 * csg.supplyCapacity.fuel;
    const events = s.engine.step(s.world);
    expect(csg.order.posture).toBe('reserve');
    const [why] = refusals(events, csg);
    expect(why?.reason).toMatch(/fuel/);
  }, 180_000);

  it("leaves a cargo group the player took under command where the player sent it, instead of sealift sending it home", () => {
    const s = playAs('ww3-2027', 'USA');
    s.engine.step(s.world);
    Object.assign(relationMut(s.world, N('USA'), N('RUS')), { atWar: true, escalation: 'conventional', warSince: s.world.tick - 400 });
    const cargo = Object.values(s.world.formations).find((f) => f.nation === 'USA' && f.kind === 'surface_group' && f.status === 'active' && Object.keys(f.equipment).every((p) => s.catalog.platform(p as PlatformId).class === 'cargo_ship'));
    expect(cargo).toBeDefined();
    const g = cargo!;
    const zone = [...s.map.neighbors(g.node)].find((n) => s.map.isSea(n))!;
    expect(order(s, g, { posture: 'patrol', target: zone }).ok).toBe(true);
    for (let i = 0; i < 4; i++) s.engine.step(s.world);
    expect(g.order.posture).toBe('patrol');
    expect(g.order.target).toBe(zone);
  }, 180_000);
});

describe('ordering a brigade across the strait onto a hostile shore (P1 H7)', () => {
  it('names the amphibious route instead of a missing embarkation port or a Move order that is refused too', () => {
    const s = playAs('taiwan-2027', 'CHN');
    const brigade = named(s, '3rd Amphibious Combined Arms Brigade (73rd GA)');
    const taichung = s.map.nodeAt(24.15, 120.65);
    const move = order(s, brigade, { posture: 'move', target: taichung });
    const attack = order(s, brigade, { posture: 'attack', target: taichung });
    for (const r of [move, attack]) {
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/amphibious group/);
      expect(r.reason).not.toMatch(/to embark at|order a move/);
    }
  }, 120_000);
});

describe('ships in port under shore air defences (P1 M14)', () => {
  it("lets the Fujian SAM brigade engage Hsiung Feng IIIs fired at the ferry group in Xiamen, and not once it sails", () => {
    const s = playAs('taiwan-2027', 'CHN');
    const ferry = named(s, 'Fujian strategic projection support ferry group');
    const sams = named(s, 'Fujian Coast SAM Brigade South');
    const rounds = () => Object.values(sams.magazine).reduce((a, n) => a + n, 0);
    expect(s.map.isSea(ferry.node)).toBe(false);
    const before = rounds();
    const inPort = strikeNavalGroup(s.world, context(s, []), N('TWN'), 'hf3' as MunitionId, 24, ferry.id);
    expect(inPort?.intercepted).toBeGreaterThan(0);
    expect(rounds()).toBeLessThan(before);

    const zone = [...s.map.neighbors(ferry.node)].find((n) => s.map.isSea(n))!;
    expect(order(s, ferry, { posture: 'patrol', target: zone }).ok).toBe(true);
    for (let i = 0; i < 4 && ferry.node !== zone; i++) s.engine.step(s.world);
    expect(ferry.node).toBe(zone);
    const left = rounds();
    strikeNavalGroup(s.world, context(s, []), N('TWN'), 'hf3' as MunitionId, 24, ferry.id);
    expect(rounds()).toBe(left);
  }, 120_000);
});

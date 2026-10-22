import { describe, expect, it } from 'vitest';
import { atWar, type System } from '../src/core/engine';
import type { MunitionId, NationId, NodeId, SimEvent } from '../src/core/types';
import { createSession } from '../src/scenarios';
import { createDiplomacy, enemyMap, warAimsOf, type AllianceTreaty } from '../src/systems/diplomacy';
import { mayEnter } from '../src/systems/diplomacy/aims';
import { fallChance, newLeadership } from '../src/systems/diplomacy/leaders';
import { meansToFight } from '../src/systems/diplomacy/support';
import { targetList } from '../src/systems/strategic';
import { testWorld } from '../src/testkit';

const N = (s: string) => s as NationId;
const days = (d: number) => d * 4;
const runDays = (s: ReturnType<typeof createSession>, d: number) => {
  const out: SimEvent[] = [];
  for (let i = 0; i < days(d); i++) out.push(...s.engine.step(s.world));
  return out;
};

describe('a nuclear exchange stays between the parties to it', () => {
  it('a US counterforce strike on Russia and the Russian launch on warning land only on the parties to the war; North Korea is not struck into it', () => {
    const s = createSession('peace-2027', 1);
    const w = s.world;
    w.nations[N('USA')].controlledBy = 'human';
    s.engine.step(w);
    for (const t of targetList(w, s, N('USA'), N('RUS'), 'counterforce').slice(0, 200))
      for (const munition of ['minuteman3', 'trident2_d5'] as MunitionId[]) w.pending.push({ type: 'nuclear_release', nation: N('USA'), target: t.node, warheads: 2, munition });
    const detonations: Extract<SimEvent, { type: 'nuclear_detonation' }>[] = [];
    const strayed: string[] = [];
    for (let t = 0; t < 40; t++) {
      // A party to the exchange: the two of them, or a state already at war with the striker when it fires.
      const foes = enemyMap(w);
      for (const e of s.engine.step(w)) {
        if (e.type !== 'nuclear_detonation') continue;
        detonations.push(e);
        const owner = s.map.isSea(e.node) ? undefined : s.map.owner[e.node];
        if (owner && owner !== 'USA' && owner !== 'RUS' && !foes.get(e.by)?.has(owner)) strayed.push(`${e.by}>${owner}`);
      }
    }
    expect(detonations.filter((e) => e.by === 'RUS').length).toBeGreaterThan(200);
    expect(strayed).toEqual([]);
    // North Korea may still answer its 2024 treaty with Russia, a decision of its own days later; no strike drags it in.
    const prkEntries = w.history.filter((e) => e.type === 'war_declared' && (e.by === 'PRK' || e.on === 'PRK'));
    expect(prkEntries.every((e) => e.type === 'war_declared' && e.by === 'PRK' && e.reason.startsWith('RUS-PRK'))).toBe(true);
  }, 240_000);
});

describe('treaties in force on the run date', () => {
  // Turkey and Azerbaijan signed the Shusha Declaration in June 2021; in September 2020 Turkey owed Azerbaijan nothing.
  const SHUSHA: AllianceTreaty = {
    id: 'TUR-AZE', kind: 'bilateral_defense', triggers: ['territory', 'forces'], inForce: '2021-06-15',
    members: { [N('TUR')]: { role: 'mutual', reliability: 1, delayDays: 1 }, [N('AZE')]: { role: 'mutual', reliability: 1, delayDays: 1 } },
  };
  const assault: System = {
    id: 'assault',
    step: (world, ctx) => {
      if (atWar(world, N('ARM'), N('AZE'))) ctx.emit({ type: 'battle', tick: world.tick, node: world.nations[N('AZE')].capital, attacker: N('ARM'), defender: N('AZE'), losses: {}, casualties: {} });
    },
  };
  const turkeyJoins = (startDate: string) => {
    const t = testWorld([assault, createDiplomacy({ alliances: [SHUSHA] })]);
    t.world.startDate = startDate;
    t.world.pending.push({ type: 'declare_war', nation: N('ARM'), target: N('AZE') });
    t.engine.run(t.world, days(5));
    return atWar(t.world, N('TUR'), N('ARM'));
  };

  it('a treaty signed after the run date is not called', () => {
    expect(turkeyJoins('2020-09-27T00:00:00Z')).toBe(false);
  });

  it('the same treaty is called once it is in force', () => {
    expect(turkeyJoins('2022-09-27T00:00:00Z')).toBe(true);
  });
});

describe('war aims bound what the AI may order', () => {
  it("south-asia-2027 opens as India's punitive war: the AI is refused ground and naval moves past the line, and a player's order widens the war", () => {
    const s = createSession('south-asia-2027', 1);
    const { world, map } = s;
    s.engine.step(world);
    const war = world.slices.diplomacy.wars[0];
    expect(warAimsOf(world, N('IND'), war)).toEqual({ kind: 'punitive' });
    expect(warAimsOf(world, N('PAK'), war)).toEqual({ kind: 'punitive' });
    const lahore = map.nodeAt(31.55, 74.35);
    expect(world.control[lahore]).toBe('PAK');
    expect(mayEnter(world, map, N('IND'), lahore)).toBe(false);

    const brigade = Object.values(world.formations).find((f) => f.nation === 'IND' && f.kind === 'maneuver' && f.status === 'active')!;
    world.pending.push({ type: 'order', nation: N('IND'), formation: brigade.id, order: { posture: 'attack', target: lahore } });
    const refused = s.engine.step(world).reverse().find((e) => e.type === 'command_result' && e.formation === brigade.id);
    expect(refused, JSON.stringify(refused)).toMatchObject({ ok: false, code: 'beyond_war_aims' });

    const fleet = Object.values(world.formations).find((f) => f.nation === 'IND' && f.kind === 'surface_group' && f.status === 'active')!;
    const karachiSea = [...map.neighbors(map.nodeAt(24.85, 67.0))].find((n) => map.isSea(n))!;
    world.pending.push({ type: 'order', nation: N('IND'), formation: fleet.id, order: { posture: 'blockade', target: karachiSea as NodeId } });
    const naval = s.engine.step(world).reverse().find((e) => e.type === 'command_result' && e.formation === fleet.id);
    expect(naval, JSON.stringify(naval)).toMatchObject({ ok: false, code: 'beyond_war_aims' });

    world.nations[N('IND')].controlledBy = 'human';
    world.pending.push({ type: 'order', nation: N('IND'), formation: brigade.id, order: { posture: 'attack', target: lahore }, byPlayer: true });
    s.engine.step(world);
    expect(world.slices.diplomacy.wars[0].sides.map((x) => x.aim.kind)).toEqual(['total', 'total']);
  }, 120_000);
});

describe('wars end for their aims, on recorded terms', () => {
  it('south-asia-2027: the punitive exchange ends in a ceasefire within days, with no ground taken and no naval battle', () => {
    const s = createSession('south-asia-2027', 2);
    const events = runDays(s, 6);
    const peace = events.find((e) => e.type === 'peace');
    expect(peace).toBeDefined();
    expect(peace!.tick * s.world.dtHours).toBeLessThanOrEqual(5 * 24);
    expect(events.some((e) => e.type === 'node_captured')).toBe(false);
    expect(events.some((e) => e.type === 'battle' && e.domain === 'sea')).toBe(false);
    expect(atWar(s.world, N('IND'), N('PAK'))).toBe(false);
    const [settlement] = s.world.slices.diplomacy.settlements ?? [];
    expect(settlement).toMatchObject({ kind: 'ceasefire', parties: [['IND'], ['PAK']], returned: [] });
  }, 180_000);

  it('a ceasefire in a limited war hands back ground taken past the claim and keeps the claim', () => {
    let capture: { claim: NodeId; beyond: NodeId } | undefined;
    const captures: System = {
      id: 'captures',
      step: (world, ctx) => {
        if (!capture) return;
        for (const node of [capture.claim, capture.beyond]) {
          world.control[node] = N('AZE');
          ctx.emit({ type: 'node_captured', tick: world.tick, node, from: N('ARM'), to: N('AZE') });
        }
        capture = undefined;
      },
    };
    const t = testWorld([captures, createDiplomacy()]);
    const { world, map } = t;
    const claim = map.nodesOf(N('AZE'))[0], beyond = map.nodesOf(N('ARM'))[0];
    world.control[claim] = N('ARM');
    world.pending.push({ type: 'declare_war', nation: N('AZE'), target: N('ARM') });
    t.engine.step(world);
    expect(world.slices.diplomacy.wars[0].sides[0].aim).toEqual({ kind: 'limited', claim: [claim] });
    capture = { claim, beyond };
    t.engine.run(world, days(2));
    expect(atWar(world, N('AZE'), N('ARM'))).toBe(false);
    const done = world.slices.diplomacy.settlements!.at(-1)!;
    expect(done.kind).toBe('ceasefire');
    expect(done.returned).toEqual([beyond]);
    expect(done.line[N('AZE')]).toEqual([claim]);
    expect(world.control[beyond]).toBe('ARM');
    expect(world.control[claim]).toBe('AZE');
  });
});

describe('war onset from beliefs', () => {
  it('peace-2027 stays at peace: no government believes a claim can be taken', () => {
    const s = createSession('peace-2027', 1);
    s.world.params = { 'diplomacy.CRISIS_RATE': 365 };
    const events = runDays(s, 6);
    expect(events.filter((e) => e.type === 'war_declared')).toEqual([]);
  }, 120_000);

  it('a government that believes it holds the edge issues an ultimatum and mobilises before it goes to war', () => {
    const s = createSession('peace-2027', 1);
    s.world.params = { 'diplomacy.CRISIS_RATE': 365, 'diplomacy.CRISIS_DAYS': 2, 'diplomacy.WAR_IN_CRISIS': 1, 'diplomacy.ONSET_RATIO': 2 };
    const events = runDays(s, 5);
    const ultimatum = events.find((e) => e.type === 'message' && e.text.startsWith('AZE issues an ultimatum to ARM'));
    const war = events.find((e) => e.type === 'war_declared' && e.by === 'AZE' && e.on === 'ARM');
    expect(ultimatum).toBeDefined();
    expect(war).toMatchObject({ reason: expect.stringContaining('ultimatum rejected') });
    expect(war!.tick - ultimatum!.tick).toBeGreaterThanOrEqual(days(2));
    expect(s.world.slices.economy.nations[N('AZE')].mobilizationTarget).toBeGreaterThan(0.3);
    // A state under a nuclear-armed defender's treaty is never pressed: China's claim on Taiwan stays a claim.
    expect(events.some((e) => e.type === 'message' && e.text.startsWith('CHN issues an ultimatum'))).toBe(false);
  }, 120_000);
});

describe('leaders and the means to fight', () => {
  it('a beaten government is far likelier to fall, and its successor narrows its aims to what it holds', () => {
    const s = createSession('south-asia-2027', 1);
    const { world } = s;
    s.engine.step(world);
    const d = world.slices.diplomacy;
    const calm = fallChance(world, d, N('PAK'));
    d.assessment[N('PAK')] = { areaLost: 0.4, popLost: 0.5, capitalLost: true, capitalThreatened: true };
    expect(fallChance(world, d, N('PAK'))).toBeGreaterThan(10 * calm);

    d.wars[0].sides[0].aim = { kind: 'total' };
    newLeadership(world, { map: s.map, catalog: s.catalog, emit: () => {} } as never, d, N('IND'));
    expect(d.wars[0].sides[0].aim).toEqual({ kind: 'limited', claim: [] });
  }, 60_000);

  it('forces count for less once the economy behind them breaks', () => {
    expect(meansToFight(1, undefined, false, 0)).toBeLessThan(meansToFight(1, undefined, false, 1));
  });
});

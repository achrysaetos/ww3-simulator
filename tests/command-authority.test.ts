import { describe, expect, it } from 'vitest';
import { atWar } from '../src/core/engine';
import type { Command, CommandDomain, NodeId } from '../src/core/types';
import { createAi } from '../src/systems/ai';
import { createDiplomacy, type AllianceTreaty } from '../src/systems/diplomacy';
import { aiMayIssue, createOrderRouter } from '../src/systems/orders';
import { id, testWorld } from '../src/testkit';

const N = id.nation;
type T = ReturnType<typeof testWorld>;
const days = (d: number) => d * 4;

const brigade = (t: T, nation: string, node: NodeId) =>
  t.add({ nation: N(nation), name: `${nation} armoured brigade`, kind: 'maneuver', echelon: 'brigade', node, equipment: { [id.platform('t_mbt')]: 30 } });

function border(t: T, a: string, b: string): NodeId[] {
  return t.map.nodesOf(N(a)).filter((n) => [...t.map.neighbors(n)].some((m) => !t.map.isSea(m) && t.world.control[m] === b));
}

function ordersOver(t: T, ticks: number): Extract<Command, { type: 'order' }>[] {
  const out: Command[] = [];
  t.engine.run(t.world, ticks, (w) => out.push(...w.pending));
  return out.filter((c): c is Extract<Command, { type: 'order' }> => c.type === 'order');
}

/** Estonia, played by a human, at war with Russia: three brigades at Tallinn, Russians on the border. */
function estoniaAtWar() {
  const t = testWorld([createOrderRouter([]), createAi()]);
  t.war('EST', 'RUS');
  t.world.nations[N('EST')].controlledBy = 'human';
  const tallinn = t.world.nations[N('EST')].capital;
  const mine = [brigade(t, 'EST', tallinn), brigade(t, 'EST', tallinn), brigade(t, 'EST', tallinn)];
  for (const n of border(t, 'RUS', 'EST').slice(0, 2)) brigade(t, 'RUS', n);
  return { t, mine };
}

describe('AI delegate for a human nation', () => {
  it('commands the forces of a player who gives no orders', () => {
    const { t, mine } = estoniaAtWar();
    const ordered = new Set(ordersOver(t, 4).filter((o) => o.nation === 'EST').map((o) => o.formation));
    expect(mine.some((f) => ordered.has(f.id))).toBe(true);
  });

  it('leaves alone a formation the player holds', () => {
    const { t, mine } = estoniaAtWar();
    t.world.pending.push({ type: 'hold', nation: N('EST'), formations: [mine[0].id], held: true });
    const ordered = ordersOver(t, 8).filter((o) => o.nation === 'EST').map((o) => o.formation);
    expect(ordered).not.toContain(mine[0].id);
    expect(ordered.some((f) => f === mine[1].id || f === mine[2].id)).toBe(true);
  });

  it('gives no orders in a domain the player keeps, and resumes when it is handed back', () => {
    const { t, mine } = estoniaAtWar();
    t.world.pending.push({ type: 'delegate', nation: N('EST'), domain: 'land', ai: false });
    expect(ordersOver(t, 8).filter((o) => o.nation === 'EST')).toEqual([]);
    t.world.pending.push({ type: 'delegate', nation: N('EST'), domain: 'land', ai: true });
    const ordered = new Set(ordersOver(t, 4).filter((o) => o.nation === 'EST').map((o) => o.formation));
    expect(mine.some((f) => ordered.has(f.id))).toBe(true);
  });

  it('keeps war, peace and nuclear release for the player unless strategic decisions are delegated', () => {
    const { t } = estoniaAtWar();
    const strategic: Command[] = [
      { type: 'offer_peace', nation: N('EST'), target: N('RUS') },
      { type: 'declare_war', nation: N('EST'), target: N('BLR') },
      { type: 'nuclear_release', nation: N('EST'), target: 0 as NodeId, warheads: 1, munition: id.munition('t_nuke') },
    ];
    const homeFront: Command = { type: 'set_mobilization', nation: N('EST'), level: 0.5 };
    expect(strategic.filter((c) => aiMayIssue(t.world, c))).toEqual([]);
    expect(aiMayIssue(t.world, homeFront)).toBe(true);
    const delegate = (domain: CommandDomain, ai: boolean) => t.world.pending.push({ type: 'delegate', nation: N('EST'), domain, ai });
    delegate('strategic', true);
    delegate('homefront', false);
    t.engine.step(t.world);
    expect(strategic.every((c) => aiMayIssue(t.world, c))).toBe(true);
    expect(aiMayIssue(t.world, homeFront)).toBe(false);
    expect(aiMayIssue(t.world, { type: 'offer_peace', nation: N('RUS'), target: N('EST') })).toBe(true);
  });
});

describe('treaty calls to a human nation', () => {
  const NATO: AllianceTreaty = {
    id: 'NATO',
    kind: 'collective_defense',
    members: {
      [N('POL')]: { role: 'mutual', reliability: 1, delayDays: 1 },
      [N('USA')]: { role: 'mutual', reliability: 1, delayDays: 3 },
    },
  };
  const attackOnPoland = () => {
    const t = testWorld([createOrderRouter([]), createDiplomacy({ alliances: [NATO] })]);
    t.world.nations[N('USA')].controlledBy = 'human';
    t.world.pending.push({ type: 'declare_war', nation: N('RUS'), target: N('POL') });
    t.engine.step(t.world);
    const join = t.world.slices.diplomacy.joins.find((j) => j.nation === 'USA')!;
    return { t, join };
  };

  it('waits for the player instead of declaring war on its behalf', () => {
    const { t, join } = attackOnPoland();
    expect(join).toBeDefined();
    t.engine.run(t.world, days(5));
    expect(atWar(t.world, N('USA'), N('RUS'))).toBe(false);
    expect(t.world.history.some((e) => e.type === 'message' && e.nation === 'USA' && e.text.includes('deadline'))).toBe(true);
  });

  it('goes to war at once when the player answers yes before the deadline', () => {
    const { t, join } = attackOnPoland();
    t.world.pending.push({ type: 'answer_treaty', nation: N('USA'), war: join.war, treaty: join.treaty, join: true });
    t.engine.step(t.world);
    expect(atWar(t.world, N('USA'), N('RUS'))).toBe(true);
    expect(t.world.tick).toBeLessThan(join.dueTick);
  });

  it('stays out when the player answers no', () => {
    const { t, join } = attackOnPoland();
    t.world.pending.push({ type: 'answer_treaty', nation: N('USA'), war: join.war, treaty: join.treaty, join: false });
    t.engine.run(t.world, days(5));
    expect(atWar(t.world, N('USA'), N('RUS'))).toBe(false);
  });

  it('lets the delegate decide at the deadline when strategic decisions are delegated', () => {
    const { t } = attackOnPoland();
    t.world.pending.push({ type: 'delegate', nation: N('USA'), domain: 'strategic', ai: true });
    t.engine.run(t.world, days(5));
    expect(atWar(t.world, N('USA'), N('RUS'))).toBe(true);
  });
});

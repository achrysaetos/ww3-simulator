import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { atWar } from '../src/core/engine';
import type { Command, CommandDomain, Formation, NodeId, Order, PlatformId } from '../src/core/types';
import { createAi } from '../src/systems/ai';
import { airWar, applyAirOrder } from '../src/systems/air';
import { createDiplomacy, type AllianceTreaty } from '../src/systems/diplomacy';
import { applyLandOrder, landCombat, landMovement } from '../src/systems/land';
import { aiMayIssue, createOrderRouter, playerCommands } from '../src/systems/orders';
import { checkCommand } from '../src/ui/commands';
import { id, testWorld } from '../src/testkit';
import { airWorld, launchers } from './air.fixture';

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
    triggers: ['territory', 'forces'],
    members: {
      [N('POL')]: { role: 'mutual', reliability: 1, delayDays: 1 },
      [N('USA')]: { role: 'mutual', reliability: 1, delayDays: 3 },
    },
  };
  const attackOnPoland = () => {
    const t = testWorld([createOrderRouter([]), {
      id: 'assault',
      step: (world, ctx) => {
        const [rus, pol] = [N('RUS'), N('POL')];
        if (atWar(world, rus, pol)) ctx.emit({ type: 'battle', tick: world.tick, node: world.nations[pol].capital, attacker: rus, defender: pol, losses: {}, casualties: {} });
      },
    }, createDiplomacy({ alliances: [NATO] })]);
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

/** UKR and RUS both played by humans, at war on the Kherson steppe (cells as in land.test.ts). */
function steppeWar(seed = 1) {
  const t = testWorld([createOrderRouter([applyLandOrder]), landMovement, landCombat], seed);
  t.war('RUS', 'UKR');
  for (const n of ['RUS', 'UKR']) t.world.nations[N(n)].controlledBy = 'human';
  const order = (f: Formation, o: Omit<Order, 'issuedTick'>) => {
    t.world.pending.push({ type: 'order', nation: f.nation, formation: f.id, order: o, byPlayer: true });
    t.engine.step(t.world);
  };
  /** Whether the delegate may order `f` now. */
  const delegateMay = (f: Formation) => aiMayIssue(t.world, { type: 'order', nation: f.nation, formation: f.id, order: { posture: 'defend' } });
  return { ...t, order, delegateMay };
}

const PLAIN_UKR = 0, PLAIN_RUS = 1, HILLS_UKR = 2, BORDER_RUS = 3;
function cells(t: T): NodeId[] {
  return [t.nodeAt(46.25, 33.75), t.nodeAt(45.75, 33.75), t.nodeAt(48.25, 38.75), t.nodeAt(47.75, 38.75)];
}
const mech = (k: number): Record<PlatformId, number> => ({
  [id.platform('t_mbt')]: Math.round(90 * k),
  [id.platform('t_ifv')]: Math.round(130 * k),
  [id.platform('t_inf')]: Math.round(120 * k),
  [id.platform('t_spg')]: Math.round(18 * k),
});

describe('the player commands a unit while its order runs, then the delegate has it back', () => {
  it('a move holds the unit on the march and after it arrives, until the player hands it back', () => {
    const t = steppeWar();
    const kyiv = t.world.nations[N('UKR')].capital;
    const to = [...t.map.neighbors(kyiv)].find((n) => !t.map.isSea(n) && t.world.control[n] === 'UKR')!;
    const f = brigade(t, 'UKR', kyiv);
    expect(t.delegateMay(f)).toBe(true);
    t.order(f, { posture: 'move', target: to });
    expect(f.order).toMatchObject({ posture: 'move', byPlayer: true });
    expect(t.delegateMay(f)).toBe(false);
    for (let i = 0; i < days(10) && f.node !== to; i++) t.engine.step(t.world);
    expect(f.node).toBe(to);
    expect(f.order).toMatchObject({ posture: 'defend', byPlayer: true });
    expect(t.delegateMay(f)).toBe(false);
    t.world.pending.push({ type: 'hold', nation: N('UKR'), formations: [f.id], held: false });
    t.engine.step(t.world);
    expect(f.order.byPlayer).toBeUndefined();
    expect(t.delegateMay(f)).toBe(true);
  });

  it('an attack that takes the cell releases the attacker, and the defender that falls back is released too', () => {
    const t = steppeWar();
    const [plainUkr, plainRus] = [cells(t)[PLAIN_UKR], cells(t)[PLAIN_RUS]];
    const def = t.add({ nation: N('UKR'), name: 'def', kind: 'maneuver', echelon: 'brigade', node: plainUkr, equipment: mech(1), entrenchment: 0 });
    const att = t.add({ nation: N('RUS'), name: 'att', kind: 'maneuver', echelon: 'brigade', node: plainRus, equipment: mech(8) });
    t.order(def, { posture: 'defend' });
    t.order(att, { posture: 'attack', target: plainUkr });
    expect([playerCommands(t.world, att), playerCommands(t.world, def)]).toEqual([true, true]);
    for (let i = 0; i < days(7) && t.world.control[plainUkr] !== 'RUS'; i++) {
      t.engine.step(t.world);
      if (t.world.control[plainUkr] !== 'RUS') expect(att.order.byPlayer, 'attacking').toBe(true);
    }
    expect(t.world.control[plainUkr]).toBe('RUS');
    expect(att.order).toEqual({ posture: 'defend', issuedTick: expect.any(Number) });
    expect(t.delegateMay(att)).toBe(true);
    expect(def.node).not.toBe(plainUkr);
    expect(def.order.byPlayer).toBeUndefined();
    expect(t.delegateMay(def)).toBe(true);
  });

  it('an assault that is beaten off releases the attacker', () => {
    const t = steppeWar();
    const [hills, border] = [cells(t)[HILLS_UKR], cells(t)[BORDER_RUS]];
    t.add({ nation: N('UKR'), name: 'def', kind: 'maneuver', echelon: 'brigade', node: hills, equipment: mech(10), entrenchment: 1 });
    const att = t.add({ nation: N('RUS'), name: 'att', kind: 'maneuver', echelon: 'brigade', node: border, equipment: mech(1) });
    t.order(att, { posture: 'attack', target: hills });
    for (let i = 0; i < days(14) && att.order.posture === 'attack'; i++) t.engine.step(t.world);
    expect(t.world.control[hills]).toBe('UKR');
    expect(att.order.posture).not.toBe('attack');
    expect(att.order.byPlayer).toBeUndefined();
    expect(t.delegateMay(att)).toBe(true);
  });

  it('a strike is a standing task: the battery stays the player’s while it keeps firing', () => {
    const t = airWorld(42, [createOrderRouter([applyAirOrder]), airWar]);
    t.war('RUS', 'UKR');
    t.world.nations[N('RUS')].controlledBy = 'human';
    const kyiv = t.node(50.45, 30.5);
    const f = launchers(t, 'RUS', t.node(53.9, 27.6), { x_mrbm_tel: 3 });
    t.world.pending.push({ type: 'order', nation: N('RUS'), formation: f.id, order: { posture: 'strike', target: kyiv, targetClass: 'structure' }, byPlayer: true });
    const strikes = t.strikes(t.tick(days(3)));
    expect(strikes.length).toBeGreaterThan(0);
    expect(f.order).toMatchObject({ posture: 'strike', target: kyiv, byPlayer: true });
    expect(aiMayIssue(t.world, { type: 'order', nation: N('RUS'), formation: f.id, order: { posture: 'defend' } })).toBe(false);
  });

  it('only the host stamps an order as the player’s: the page cannot forge it, and the delegate’s orders never carry it', () => {
    const t = steppeWar();
    const f = brigade(t, 'UKR', t.world.nations[N('UKR')].capital);
    const checked = checkCommand(t.world, t.map, t.catalog, N('UKR'), { type: 'order', nation: 'UKR', formation: f.id, order: { posture: 'defend', byPlayer: true } });
    expect(checked).toMatchObject({ ok: true });
    expect(checked.ok && checked.command.type === 'order' && 'byPlayer' in checked.command.order).toBe(false);
    t.world.pending.push({ type: 'order', nation: N('UKR'), formation: f.id, order: { posture: 'reserve', byPlayer: true } });
    t.engine.step(t.world);
    expect(f.order.posture).toBe('reserve');
    expect(f.order.byPlayer).toBeUndefined();
    expect(t.delegateMay(f)).toBe(true);
  });

  it('a standing hold from Take command outlasts any order, and handing back releases it', () => {
    const t = steppeWar();
    const f = brigade(t, 'UKR', t.world.nations[N('UKR')].capital);
    t.world.pending.push({ type: 'hold', nation: N('UKR'), formations: [f.id], held: true });
    t.engine.step(t.world);
    expect(f.order.byPlayer).toBeUndefined();
    expect(t.delegateMay(f)).toBe(false);
    t.world.pending.push({ type: 'hold', nation: N('UKR'), formations: [f.id], held: false });
    t.engine.step(t.world);
    expect(t.delegateMay(f)).toBe(true);
  });
});

/**
 * Every place the engine writes a formation's order, and whether the write carries the player's order on (the stamp
 * stays) or ends it (the stamp drops and the delegate has the unit back). A new site fails here until it is decided.
 */
const ORDER_WRITES: Record<string, [site: string, keeps: boolean][]> = {
  'systems/orders.ts': [['{ ...cmd.order, issuedTick', true]],
  'systems/land/movement.ts': [
    ['f.order = order;', true], // the land handler's own order
    ["{ posture: 'defend', issuedTick: world.tick, ...keepDeception(f.order) };", false], // the route ahead closed
    ["...(f.order.posture === 'attack' ? {} : keepPlayer(f.order))", true], // a move arrives; an attack that arrives is done
  ],
  'systems/land/combat.ts': [
    ["f.order = { posture: 'defend', issuedTick: world.tick };\n  f.progressKm = 0;", false], // retreat
    ["else f.order = { posture: 'defend'", false], // assault beaten off
    ["for (const f of stillIn) if (!f.order.path?.length) f.order", false], // cell taken
  ],
  'systems/land/airborne.ts': [['...stamp };', true]], // the player's air assault lands and fights on
  'systems/land/strategic.ts': [['...keepPlayer(f.order) };', true]], // an airlifted move lands and marches on
  'systems/naval/orders.ts': [
    ["boarding.order = { posture: 'embark', targetFormation: lift.id", true],
    ['f.order = { ...order, path: [] };\n    return { ok: true };\n  }\n  const goal', true],
    ['f.order = { ...order, path: [] };\n    return { ok: true };\n  }\n  const dest', true],
    ['f.order = { ...order, target: goal, path };', true],
    ['f.order = own;', false], // the naval system overrules: crippled, or out of fuel or weapons
  ],
  'systems/naval/sealift.ts': [
    ['g.order = { posture, target: to, path', false], // cargo groups the player does not command
    ["boarding.order = { posture: 'embark', targetFormation: g.id", true], // a sealifted move boards
    ["g.order = { posture: 'patrol', target: g.node", false],
    ["g.order = { posture: 'reserve'", false],
  ],
  'systems/naval/amphibious.ts': [
    ["lift.order = { posture: 'patrol'", false], // the lift group's landing is done
    ["f.order = { posture: loss > 0 ? 'attack' : 'defend', target: node", true], // embarked troops come ashore
  ],
  'systems/naval/combat.ts': [["e.order = { posture: 'defend', target: port", false]], // the lift sank; survivors ashore at port
  'systems/air/index.ts': [
    ["f.order = { posture: 'defend', issuedTick: world.tick, ...keepPlayer(order) };", true], // a rebase arrives at once
    ['f.order = { ...order, issuedTick: world.tick };', true], // strikes and patrols stand until re-ordered
  ],
  'systems/air/strike.ts': [["f.order = { posture: 'strike', target: best.node", true]], // a defending battery's own shot at a landing
};

describe('engine rewrites of an order', () => {
  it('every write to a formation order is listed, and keeps the player stamp exactly where listed', () => {
    const root = join(__dirname, '../src');
    const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []));
    const found: string[] = [];
    for (const path of files(join(root, 'systems'))) {
      const file = relative(root, path);
      const src = readFileSync(path, 'utf8');
      const writes = [...src.matchAll(/\b\w+\.order = /g)].map((m) => m.index!);
      const listed = ORDER_WRITES[file] ?? [];
      for (const at of writes) {
        const start = src.lastIndexOf('\n', at) + 1, end = src.indexOf('\n', at);
        const line = src.slice(start, end).trim();
        const hits = listed.filter(([site]) => {
          const p = src.indexOf(site);
          return p >= start && p <= end;
        });
        expect(hits.length, `${file}: ${line} matches one ORDER_WRITES entry`).toBe(1);
        const [site, keeps] = hits[0];
        expect(src.split(site).length, `${file}: ${site} is unique`).toBe(2);
        const statement = src.slice(at, src.indexOf(';', at) + 1);
        expect(/keepPlayer\(|\.\.\.stamp\b|\.\.\.(cmd\.)?order\b|= order;/.test(statement), `${file}: ${line} keeps the stamp`).toBe(keeps);
        found.push(`${file}|${site}`);
      }
    }
    const expected = Object.entries(ORDER_WRITES).flatMap(([file, sites]) => sites.map(([site]) => `${file}|${site}`));
    expect(found.sort()).toEqual(expected.sort());
  });
});

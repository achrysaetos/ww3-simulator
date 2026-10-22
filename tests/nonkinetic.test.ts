import { describe, expect, it } from 'vitest';
import { relationMut } from '../src/core/engine';
import type { GameMap } from '../src/core/map';
import type { NationId, NodeId } from '../src/core/types';
import { createSession } from '../src/scenarios';
import { nonKinetic } from '../src/systems/nonkinetic';
import { dataConnectivityLost, maritimeDeterred, nonKineticState } from '../src/systems/nonkinetic/reads';
import { accessKey } from '../src/systems/nonkinetic/state';
import { id, testWorld } from '../src/testkit';

const UKR = id.nation('UKR'), RUS = id.nation('RUS');

/** A nation's most-populated home cells it still holds, as a grid payload picks them. */
function topHeldCells(map: GameMap, control: readonly NationId[], nation: NationId, n: number): NodeId[] {
  const held: NodeId[] = [];
  for (let c = 0; c < map.landCount; c++) if (map.owner[c] === nation && control[c] === nation && map.popShare[c] > 0) held.push(c as NodeId);
  return held.sort((a, b) => map.popShare[b] - map.popShare[a]).slice(0, n);
}
const infraSum = (world: { theater: { infrastructure: number[] } }, cells: NodeId[]) => cells.reduce((a, c) => a + world.theater.infrastructure[c], 0);

describe('cyber operations need access', () => {
  it('a grid payload with prior access degrades Ukraine; without access it is refused and changes nothing', () => {
    const withAccess = createSession('ukraine-2026');
    const none = createSession('ukraine-2026');
    for (const s of [withAccess, none]) s.engine.step(s.world);
    const cells = topHeldCells(withAccess.map, withAccess.world.control, UKR, 8);
    // Pre-positioned, firing-ready access (Volt Typhoon pre-positioning; Sandworm grid campaigns).
    nonKineticState(withAccess.world)!.access[accessKey(RUS, UKR, 'grid')] = { by: RUS, on: UKR, sector: 'grid', stage: 'persistent', building: false, progressDays: 0, dwellDays: 400 };
    const beforeA = infraSum(withAccess.world, cells);
    const beforeN = infraSum(none.world, cells);
    for (const s of [withAccess, none]) s.world.pending.push({ type: 'cyber_op', nation: RUS, target: UKR, sector: 'grid', action: 'attack' });
    withAccess.engine.step(withAccess.world);
    none.engine.step(none.world);

    const hit = withAccess.world.events.find((e) => e.type === 'command_result' && e.command === 'cyber_op');
    const miss = none.world.events.find((e) => e.type === 'command_result' && e.command === 'cyber_op');
    expect(hit?.type === 'command_result' && hit.ok).toBe(true);
    expect(miss?.type === 'command_result' && miss.ok).toBe(false);
    // Grid at the main load centres (which the economy's integrity and C2's fibre comms both read) falls hard with access.
    expect(infraSum(withAccess.world, cells)).toBeLessThan(beforeA * 0.8);
    // Without access, firing does nothing to those cells (a point of standing-cyber noise aside).
    expect(infraSum(none.world, cells)).toBeGreaterThan(beforeN * 0.97);
  });

  it('access takes months to build, and a payload fired before it is built does nothing', () => {
    const t = testWorld([nonKinetic]);
    t.war('RUS', 'UKR');
    const cells = topHeldCells(t.map, t.world.control, UKR, 8);
    t.world.pending.push({ type: 'cyber_op', nation: RUS, target: UKR, sector: 'grid', action: 'build' });
    t.engine.run(t.world, 10 * 4); // ten days in: nowhere near built
    expect(nonKineticState(t.world)!.access[accessKey(RUS, UKR, 'grid')]?.stage).toBe('none');
    const before = infraSum(t.world, cells);
    t.world.pending.push({ type: 'cyber_op', nation: RUS, target: UKR, sector: 'grid', action: 'attack' });
    t.engine.step(t.world);
    const miss = t.world.events.find((e) => e.type === 'command_result');
    expect(miss?.type === 'command_result' && miss.ok).toBe(false);
    expect(infraSum(t.world, cells)).toBe(before);
    // Keep building; months on, access reaches persistent and a payload now bites.
    let reached = false;
    for (let d = 0; d < 600 && !reached; d += 20) {
      t.world.pending.push({ type: 'cyber_op', nation: RUS, target: UKR, sector: 'grid', action: 'build' });
      t.engine.run(t.world, 20 * 4);
      reached = nonKineticState(t.world)!.access[accessKey(RUS, UKR, 'grid')]?.stage === 'persistent';
    }
    expect(reached).toBe(true);
    const armed = infraSum(t.world, cells);
    t.world.pending.push({ type: 'cyber_op', nation: RUS, target: UKR, sector: 'grid', action: 'attack' });
    t.engine.step(t.world);
    expect(infraSum(t.world, cells)).toBeLessThan(armed * 0.9);
  });
});

describe('undersea cable cuts', () => {
  it('cutting a data cable cuts the target economy, and the cut lasts months until a repair ship mends it', () => {
    const s = createSession('peace-2027');
    s.engine.step(s.world);
    const FIN = id.nation('FIN');
    const base = s.world.slices.economy.nations[FIN].gdpIndex;
    s.world.pending.push({ type: 'cut_cable', nation: RUS, cable: 'c_lion1' });
    s.engine.run(s.world, 4 * 10);
    expect(dataConnectivityLost(nonKineticState(s.world)!, FIN)).toBeGreaterThan(0.4);
    expect(s.world.slices.economy.nations[FIN].gdpIndex).toBeLessThan(base);
    // Still cut a month in: repair ships are few and the splice takes months.
    s.engine.run(s.world, 4 * 25);
    expect(nonKineticState(s.world)!.cables['c_lion1']).toBeDefined();
  });

  it('the repair completes after months, restoring connectivity; a power cable cut hits its landing cell', () => {
    const t = testWorld([nonKinetic]);
    t.war('RUS', 'EST');
    const EST = id.nation('EST');
    const landing = t.map.nodeAt(59.46, 24.64) as NodeId;
    const before = t.world.theater.infrastructure[landing];
    t.world.pending.push({ type: 'cut_cable', nation: RUS, cable: 'estlink2' });
    t.world.pending.push({ type: 'cut_cable', nation: RUS, cable: 'c_lion1' });
    t.engine.step(t.world);
    expect(t.map.owner[landing]).toBe(EST);
    expect(t.world.theater.infrastructure[landing]).toBeLessThan(before); // power cable -> landing infrastructure
    expect(nonKineticState(t.world)!.cables['c_lion1']).toBeDefined();
    // Both cuts are in the Baltic, where one repair ship mends them one after another, so clearing both takes many months.
    t.engine.run(t.world, 4 * 30 * 9);
    expect(nonKineticState(t.world)!.cables['c_lion1']).toBeUndefined();
    expect(dataConnectivityLost(nonKineticState(t.world)!, id.nation('FIN'))).toBe(0);
  });
});

describe('shipping deterred by fear', () => {
  it('Gulf fighting deters shipping through the war zone even with few sinkings', () => {
    const s = createSession('gulf-2027');
    s.engine.run(s.world, 4 * 40);
    const nk = nonKineticState(s.world)!;
    expect(Object.values(nk.maritime).filter((z) => z.refusing > 0.05).length).toBeGreaterThan(0);
    expect(Math.max(...Object.values(nk.maritime).map((z) => z.premiumPct))).toBeGreaterThan(0.1);
    const deterred = (['JPN', 'KOR', 'IND', 'IRN', 'ARE', 'SAU'] as const).map((n) => maritimeDeterred(s.world, s.map, id.nation(n)));
    expect(Math.max(...deterred)).toBeGreaterThan(0);
    // The deterrence runs on fear, not sunk hulls: few formations are actually destroyed.
    expect(s.world.history.filter((e) => e.type === 'formation_destroyed').length).toBeLessThan(40);
  });
});

describe('occupation breeds resistance', () => {
  function occupy(garrisonTroops: number) {
    const t = testWorld([nonKinetic]);
    t.war('RUS', 'UKR');
    relationMut(t.world, RUS, UKR).opinion = -95;
    const node = t.map.nodeAt(46.85, 35.37) as NodeId; // Melitopol, occupied south
    t.world.control[node] = RUS;
    const f = t.add({ nation: RUS, name: 'RUS garrison', kind: 'maneuver', echelon: 'brigade', node, equipment: { [id.platform('t_inf')]: Math.max(1, Math.round(garrisonTroops / 9)) } });
    f.personnel = garrisonTroops;
    return { t, f, node };
  }

  it('resistance ties down garrisons and raises the occupier\'s costs; a dense garrison suppresses it', () => {
    const thin = occupy(300);
    const treasuryBefore = thin.t.world.nations[RUS].treasuryUsdB;
    const readinessBefore = thin.f.readiness;
    thin.t.engine.run(thin.t.world, 4 * 120);
    const ledger = nonKineticState(thin.t.world)!.occupation[RUS];
    expect(ledger.resistanceActs).toBeGreaterThan(0);
    expect(ledger.costUsdB).toBeGreaterThan(0);
    expect(thin.t.world.nations[RUS].treasuryUsdB).toBeLessThan(treasuryBefore);
    expect(thin.f.readiness).toBeLessThan(readinessBefore);

    const dense = occupy(300_000);
    dense.t.engine.run(dense.t.world, 4 * 120);
    const denseActs = nonKineticState(dense.t.world)!.occupation[RUS]?.resistanceActs ?? 0;
    expect(denseActs).toBeLessThan(ledger.resistanceActs);
  });
});

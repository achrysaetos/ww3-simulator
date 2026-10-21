import { describe, expect, it } from 'vitest';
import { atWar } from '../src/core/engine';
import type { NationId } from '../src/core/types';
import { createSession } from '../src/scenarios';
import { geography } from '../src/systems/naval/geography';
import { recordFleetLoss } from '../src/systems/naval/state';

const run = (scenario: string, days: number) => {
  const s = createSession(scenario, 1);
  for (let i = 0; i < (days * 24) / s.world.dtHours; i++) s.engine.step(s.world);
  return s;
};

describe('naval AI amphibious assault', () => {
  it('China stages troops at a Fujian port, embarks them as landing teams and puts them ashore on Taiwan within six days', () => {
    const s = run('taiwan-2027', 6);
    const chn = s.world.slices.naval.ledger['CHN' as NationId];
    expect(chn.assaultLandings).toBeGreaterThan(0);
    expect(chn.troopsLanded).toBeGreaterThan(2000);
    const teams = Object.values(s.world.formations).filter((f) => f.nation === 'CHN' && f.name.endsWith('landing team'));
    expect(teams.length).toBeGreaterThan(0);
    expect(teams.some((f) => f.node < s.map.landCount && s.map.owner[f.node] === 'TWN')).toBe(true);
  }, 120_000);

  it('a nation with a land front and no enemy across the sea never embarks troops', () => {
    const s = run('ukraine-2026', 5);
    expect(Object.values(s.world.formations).some((f) => f.status === 'embarked')).toBe(false);
    expect(s.world.slices.naval.ledger['RUS' as NationId]?.assaultLandings ?? 0).toBe(0);
  }, 120_000);
});

describe('naval AI pre-war surge', () => {
  it('a nation weighing a treaty call surges its submarines toward the war before it enters, and fires nothing while at peace', () => {
    const s = createSession('taiwan-2027', 1);
    const strait = s.map.nodeAt(24, 120);
    const subs = () => Object.values(s.world.formations).filter((f) => f.nation === 'USA' && f.kind === 'submarine' && f.status === 'active' && f.name.startsWith('Submarine Squadron'));
    const start = new Map(subs().map((f) => [f.id, s.map.distanceKm(f.node, strait)]));
    let usFired = 0;
    for (let i = 0; i < (4 * 24) / s.world.dtHours; i++) for (const e of s.engine.step(s.world)) if (e.type === 'strike' && e.by === 'USA') usFired++;
    expect(s.world.relations['CHN|USA']?.atWar ?? false).toBe(false);
    expect(usFired).toBe(0);
    expect(s.world.slices.naval.ledger['USA' as NationId]?.minesLaid ?? 0).toBe(0);
    const closed = subs().filter((f) => s.map.distanceKm(f.node, strait) < start.get(f.id)! - 1000);
    expect(closed.length).toBeGreaterThanOrEqual(4);
  }, 120_000);
});

describe('coastal defence against a landing', () => {
  it("Taiwan's coastal missile brigade fires on the PLA lift off its beaches instead of holding its rounds for a later salvo", () => {
    const s = createSession('taiwan-2027', 1);
    const battery = Object.values(s.world.formations).find((f) => f.name.startsWith('Coastal Defense Command'))!;
    const rounds = () => Object.values(battery.magazine).reduce((a, n) => a + n, 0);
    const start = rounds();
    let atLift = 0;
    for (let i = 0; i < (14 * 24) / s.world.dtHours; i++) {
      s.engine.step(s.world);
      const t = battery.order.targetFormation ? s.world.formations[battery.order.targetFormation] : undefined;
      if (battery.order.posture === 'strike' && t?.nation === 'CHN' && t.kind === 'surface_group') atLift++;
    }
    expect(atLift).toBeGreaterThan(0);
    expect(start - rounds()).toBeGreaterThanOrEqual(150);
  }, 120_000);
});

describe('naval AI fleet readiness', () => {
  it('carriers in a shipyard stay there when the US goes to war; a carrier between deployments sails', () => {
    const s = createSession('taiwan-2027', 2);
    const named = (prefix: string) => Object.values(s.world.formations).find((f) => f.name.startsWith(prefix))!;
    const yard = [named('USS John C. Stennis'), named('USS Ronald Reagan')];
    const ike = named('Carrier Strike Group 8');
    const perDay = 24 / s.world.dtHours;
    for (let i = 0; i < 30 * perDay && !atWar(s.world, 'USA' as NationId, 'CHN' as NationId); i++) s.engine.step(s.world);
    for (let i = 0; i < 10 * perDay; i++) s.engine.step(s.world);
    expect(yard.map((f) => f.node)).toEqual(yard.map((f) => f.home));
    expect(s.map.distanceKm(ike.node, ike.home)).toBeGreaterThan(1000);
  }, 120_000);
});

describe('naval AI coercive closure', () => {
  it('Iran, at war with Israel and the US with US warships in the Gulf of Oman, mines and blockades the Strait of Hormuz', () => {
    const s = createSession('gulf-2027', 1);
    const hormuz = new Set(geography(s.map).chokepoints.find((c) => c.def.name === 'Strait of Hormuz')!.nodes);
    for (let i = 0; i < (20 * 24) / s.world.dtHours; i++) s.engine.step(s.world);
    const mined = [...hormuz].reduce((a, n) => a + (s.world.slices.naval.mines[n]?.['IRN' as NationId] ?? 0), 0);
    const blockading = Object.values(s.world.formations).filter((f) => f.nation === 'IRN' && f.order.posture === 'blockade' && hormuz.has(f.order.target!));
    expect(mined + blockading.length).toBeGreaterThan(0);
    expect(s.world.theater.tradeBlocked['JPN' as NationId]).toBeGreaterThan(0.05);
  }, 120_000);
});

describe('naval AI fleet in being', () => {
  const blackSeaFleet = (s: ReturnType<typeof createSession>) =>
    Object.values(s.world.formations).filter((f) => f.nation === 'RUS' && f.status === 'active' && (f.kind === 'surface_group' || f.kind === 'submarine') && f.name.startsWith('Black Sea Fleet'));

  it('a fleet that keeps losing ships with no enemy fleet at sea to fight stays in its home waters', () => {
    const fresh = createSession('ukraine-2026', 1);
    const battered = createSession('ukraine-2026', 1);
    const home = blackSeaFleet(battered)[0].home;
    recordFleetLoss(battered.world, blackSeaFleet(battered)[0], 3);
    for (const s of [fresh, battered]) for (let i = 0; i < 4; i++) s.engine.step(s.world);
    expect(blackSeaFleet(fresh).some((f) => f.order.target !== home)).toBe(true);
    expect(blackSeaFleet(battered).every((f) => f.order.target === home)).toBe(true);
  }, 120_000);
});

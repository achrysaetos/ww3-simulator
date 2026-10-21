import { describe, expect, it } from 'vitest';
import { atWar } from '../src/core/engine';
import type { NationId, NodeId } from '../src/core/types';
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
    // The 120 HF-3s reach the lift where it stages, 300-400 km out; HF-2s (160 km) only once it closes the beach.
    expect(start - rounds()).toBeGreaterThanOrEqual(100);
  }, 120_000);
});

describe('naval AI standoff', () => {
  it('US surface groups take station and blockade outside the reach of Chinese shore missiles, not in the strait', () => {
    const s = createSession('taiwan-2027', 2);
    const shore = s.map.nodesOf('CHN' as NationId).filter((n) => [...s.map.neighbors(n)].some((m) => s.map.isSea(m)));
    const clearance = (z: NodeId) => Math.min(...shore.map((n) => s.map.distanceKm(n, z)));
    const perDay = 24 / s.world.dtHours;
    const close = new Set<string>();
    for (let i = 0; i < 25 * perDay; i++) {
      s.engine.step(s.world);
      for (const f of Object.values(s.world.formations)) {
        const t = f.order.target;
        if (f.nation !== 'USA' || f.kind !== 'surface_group' || f.status !== 'active' || (f.order.posture !== 'patrol' && f.order.posture !== 'blockade') || t === undefined) continue;
        if (clearance(t) < 300) close.add(`${f.name} ${f.order.posture} ${Math.round(clearance(t))} km`);
      }
    }
    expect(atWar(s.world, 'USA' as NationId, 'CHN' as NationId)).toBe(true);
    expect([...close]).toEqual([]);
  }, 180_000);
});

describe('naval AI rearming', () => {
  it('a US group that has fired off its area-defence missiles at sea goes home to reload and is not sent back out empty', () => {
    const s = createSession('taiwan-2027', 1);
    const perDay = 24 / s.world.dtHours;
    const atSea = () => Object.values(s.world.formations).find((f) => f.nation === 'USA' && f.kind === 'surface_group' && f.status === 'active' && f.node !== f.home && f.order.posture === 'patrol' && Object.keys(f.magazine).some((m) => m.startsWith('sm')));
    let g = atSea();
    for (let i = 0; i < 15 * perDay && !g; i++) {
      s.engine.step(s.world);
      g = atSea();
    }
    expect(g).toBeDefined();
    const group = g!;
    for (const m of Object.keys(group.magazine)) if (m.startsWith('sm')) group.magazine[m as keyof typeof group.magazine] = 0;
    const away: string[] = [];
    for (let i = 0; i < 3 * perDay; i++) {
      s.engine.step(s.world);
      if (group.status !== 'active') break;
      if (group.order.posture !== 'reserve' || group.order.target !== group.home) away.push(`${group.order.posture} -> ${group.order.target}`);
    }
    expect(away).toEqual([]);
  }, 180_000);
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

describe('naval AI reachable tasking', () => {
  it('every order the naval AI gives a fleet is one the fleet can sail, from closed seas and coarsely mapped bases alike', () => {
    const s = createSession('ww3-2027', 1);
    const naval = new Set(['surface_group', 'submarine']);
    let given = 0;
    const refused: string[] = [];
    for (let i = 0; i < (10 * 24) / s.world.dtHours; i++) {
      const cmds = s.world.pending.filter((c) => c.type === 'order' && naval.has(s.world.formations[c.formation]?.kind) && c.order.posture !== 'embark');
      const tick = s.world.tick;
      s.engine.step(s.world);
      for (const c of cmds) {
        if (c.type !== 'order') continue;
        const f = s.world.formations[c.formation];
        if (f.status !== 'active') continue;
        given++;
        if (f.order.issuedTick !== tick) refused.push(`${f.name} ${c.order.posture} -> ${c.order.target ?? c.order.targetFormation}`);
      }
    }
    expect(given).toBeGreaterThan(100);
    expect(refused).toEqual([]);
    const caspian = Object.values(s.world.formations).find((f) => f.name === 'Caspian Flotilla')!;
    expect(s.map.lon[caspian.node]).toBeGreaterThan(46);
    expect(s.map.lon[caspian.node]).toBeLessThan(55);
  }, 120_000);
});

describe('naval AI mine countermeasures', () => {
  it("the 5th Fleet's sweepers go to work on Iran's Hormuz minefield once Iran's surface navy is gone, and not before", () => {
    const s = createSession('gulf-2027', 1);
    const sweepers = Object.values(s.world.formations).find((f) => f.name.startsWith('Commander Task Force 55'))!;
    const perDay = 24 / s.world.dtHours;
    const iranAfloat = () => Object.values(s.world.formations).some((f) => f.nation === 'IRN' && f.kind === 'surface_group' && f.status === 'active');
    let sentEarly = false, sent = false;
    for (let i = 0; i < 40 * perDay && !sent; i++) {
      s.engine.step(s.world);
      const target = sweepers.order.target;
      const toField = target !== undefined && String(target) in s.world.slices.naval.mines;
      if (toField && iranAfloat()) sentEarly = true;
      if (toField) sent = true;
    }
    expect(sentEarly).toBe(false);
    expect(sent).toBe(true);
  }, 240_000);
});

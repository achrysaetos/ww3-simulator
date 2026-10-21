import { describe, expect, it } from 'vitest';
import { relationMut } from '../src/core/engine';
import type { Command, NodeId } from '../src/core/types';
import { createAi } from '../src/systems/ai';
import { createDiplomacy } from '../src/systems/diplomacy';
import { estimate, estimates, intel, STALENESS } from '../src/systems/intel';
import { id, testWorld } from '../src/testkit';

const N = id.nation;
type T = ReturnType<typeof testWorld>;

const brigade = (t: T, nation: string, node: NodeId) =>
  t.add({ nation: N(nation), name: `${nation} brigade`, kind: 'maneuver', echelon: 'brigade', node, equipment: { [id.platform('t_mbt')]: 30 } });
const tels = (t: T, nation: string, node: NodeId, home: NodeId) => {
  const f = t.add({ nation: N(nation), name: `${nation} TELs`, kind: 'missile', echelon: 'brigade', node, equipment: { [id.platform('t_tel')]: 12 } });
  f.home = home;
  return f;
};

describe('intelligence picture', () => {
  it('knows garrisons and what friendly troops touch, keeps a lost contact where it was last seen, and lets it go stale', () => {
    const t = testWorld([intel]);
    t.war('RUS', 'UKR');
    const kyiv = t.nodeAt(50.45, 30.5), belgorod = t.nodeAt(50.6, 36.6), voronezh = t.nodeAt(51.7, 39.2);
    const garrison = brigade(t, 'UKR', kyiv);
    const launchers = tels(t, 'RUS', voronezh, t.nodeAt(55.75, 37.6));
    t.engine.step(t.world);
    expect(estimate(t.world, N('RUS'), garrison.id)?.source).toBe('base');
    expect(estimate(t.world, N('UKR'), launchers.id)).toBeUndefined();

    const scouts = brigade(t, 'UKR', [...t.map.neighbors(voronezh)].find((n) => !t.map.isSea(n))!);
    scouts.home = kyiv;
    t.engine.step(t.world);
    const fix = estimate(t.world, N('UKR'), launchers.id)!;
    expect(fix).toMatchObject({ node: voronezh, source: 'contact' });
    expect(fix.ageHours).toBeLessThanOrEqual(t.world.dtHours);

    scouts.node = kyiv;
    launchers.node = belgorod;
    const half = STALENESS.missile.halfLifeHours / t.world.dtHours;
    for (let i = 0; i < half; i++) t.engine.step(t.world);
    const stale = estimate(t.world, N('UKR'), launchers.id)!;
    expect(stale.node).toBe(voronezh);
    expect(stale.confidence).toBeCloseTo(fix.confidence / 2, 5);
    expect(stale.errorKm).toBeGreaterThan(fix.errorKm + 50);
    for (let i = 0; i < 6 * half; i++) t.engine.step(t.world);
    expect(estimate(t.world, N('UKR'), launchers.id)).toBeUndefined();
  });

  it('pools what co-belligerents see, and tells a nation at war with no one nothing', () => {
    const t = testWorld([intel]);
    t.war('CHN', 'USA');
    t.war('CHN', 'JPN');
    const fuzhou = t.nodeAt(26.1, 119.3);
    const launchers = tels(t, 'CHN', fuzhou, t.nodeAt(39.9, 116.4));
    const us = brigade(t, 'USA', [...t.map.neighbors(fuzhou)].find((n) => !t.map.isSea(n))!);
    us.home = t.nodeAt(38.9, -77);
    t.engine.step(t.world);
    expect(estimate(t.world, N('USA'), launchers.id)?.source).toBe('contact');
    expect(estimate(t.world, N('JPN'), launchers.id)?.source).toBe('contact');
    expect(estimates(t.world, N('FRA'))).toEqual([]);
  });
});

describe('strike AI under the fog of war', () => {
  /**
   * Strike orders China's missile brigade gives against a US air wing at Yonaguni that moved, unseen,
   * to a road strip in southern Taiwan (no airfield, so not a base fix) after the first tick.
   */
  const strikesOn = (systems: 'intel' | 'perfect') => {
    const t = testWorld(systems === 'intel' ? [createDiplomacy(), intel, createAi()] : [createDiplomacy(), createAi()]);
    const base = t.nodeAt(24.45, 123.0), dispersal = t.nodeAt(23.1, 120.4);
    const launch = t.map.nodesOf(N('CHN')).sort((a, b) => t.map.distanceKm(a, base) - t.map.distanceKm(b, base))[0];
    const wing = t.add({ nation: N('USA'), name: 'US air wing', kind: 'air_wing', echelon: 'wing', node: base, equipment: { [id.platform('t_fighter')]: 24 } });
    tels(t, 'CHN', launch, launch);
    relationMut(t.world, N('CHN'), N('JPN')).opinion = -55;
    t.world.nations[N('CHN')].stockpile[id.munition('t_srbm')] = 10_000;
    t.war('CHN', 'TWN');
    t.war('CHN', 'USA');
    t.engine.step(t.world);
    wing.node = dispersal;
    const out: Command[] = [];
    t.engine.run(t.world, 24, (w) => out.push(...w.pending));
    return { strikes: out.filter((c): c is Extract<Command, { type: 'order' }> => c.type === 'order' && c.nation === 'CHN' && c.order.posture === 'strike' && c.order.targetFormation === wing.id), base, dispersal };
  };

  it('aims where its intelligence last placed the target, not where the target is', () => {
    const fogged = strikesOn('intel');
    expect(fogged.base).not.toBe(fogged.dispersal);
    expect(fogged.strikes.length).toBeGreaterThan(0);
    expect(fogged.strikes.every((c) => c.order.target === fogged.base)).toBe(true);
    const perfect = strikesOn('perfect');
    expect(perfect.strikes.some((c) => c.order.target === perfect.dispersal)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import type { NationId } from '../src/core/types';
import { createSession } from '../src/scenarios';

const run = (scenario: string, days: number) => {
  const s = createSession(scenario, 1);
  for (let i = 0; i < (days * 24) / s.world.dtHours; i++) s.engine.step(s.world);
  return s;
};

describe('naval AI amphibious assault', () => {
  it('China stages troops at a Fujian port, embarks them as landing teams and puts them ashore on Taiwan within five days', () => {
    const s = run('taiwan-2027', 5);
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

import { describe, expect, it } from 'vitest';
import { atWar, relation, type System } from '../src/core/engine';
import type { NodeId, SimEvent, StrikeEffect } from '../src/core/types';
import { createDiplomacy } from '../src/systems/diplomacy';
import { id, testWorld } from '../src/testkit';

const N = id.nation;
const days = (d: number) => d * 4;

/** Stands in for the strike systems: `effects` on Ryazan every tick until `until`, then nothing. */
function strikes(until: number, effects: StrikeEffect[]): System {
  let node = 0 as NodeId;
  return {
    id: 'strikes',
    init: (world) => { node = (world.nations[N('RUS')].capital + 0) as NodeId; },
    step: (world, ctx) => {
      if (world.tick >= until) return;
      const e: SimEvent = { type: 'strike', tick: world.tick, by: N('USA'), munition: id.munition('t_cruise'), fired: 4, intercepted: 0, target: node, effects };
      ctx.emit(e);
    },
  };
}

describe('outward escalation', () => {
  it('is tracked apart from the rung, and a dyad steps back down from strategic conventional war once the strikes stop', () => {
    const t = testWorld([strikes(days(3), [{ kind: 'grid', before: 1, after: 0.8 }]), createDiplomacy()]);
    t.war('USA', 'RUS');
    t.world.nations[N('RUS')].nuclear = { warheads: 10, deployed: 10, doctrine: 'escalate_to_deescalate' };
    t.engine.run(t.world, days(3));
    expect(relation(t.world, N('USA'), N('RUS')).escalation).toBe('strategic_conventional');
    const steps = t.world.slices.diplomacy.outward?.['USA>RUS'];
    expect(Object.keys(steps ?? {}).sort()).toEqual(['capital', 'civilian', 'nuclear_homeland']);
    expect(steps?.capital?.count).toBe(days(3));
    t.engine.run(t.world, days(90));
    expect(atWar(t.world, N('USA'), N('RUS'))).toBe(true);
    expect(relation(t.world, N('USA'), N('RUS')).escalation).toBe('conventional');
  });

  it('a strike that destroys nuclear-capable launchers is a dual-use step, and presses harder than one on a city', () => {
    const rung = (effects: StrikeEffect[]) => {
      const t = testWorld([strikes(2, effects), createDiplomacy()]);
      t.war('USA', 'RUS');
      t.engine.run(t.world, 2);
      return { pressure: t.world.slices.diplomacy.pressure['RUS|USA'] ?? 0, steps: t.world.slices.diplomacy.outward?.['USA>RUS'] ?? {} };
    };
    const silo = rung([{ kind: 'losses', platforms: { [id.platform('t_icbm')]: 2 } }]);
    const town = rung([{ kind: 'losses', platforms: { [id.platform('t_mbt')]: 2 } }]);
    expect(silo.steps.dual_use?.count).toBe(2);
    expect(town.steps.dual_use).toBeUndefined();
    expect(silo.pressure).toBeGreaterThan(town.pressure);
  });
});

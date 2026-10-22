import { beforeAll, describe, expect, it } from 'vitest';
import type { Formation, NationId } from '../src/core/types';
import { forecastInput, forecastOperation, type OperationForecast, type OperationPlan } from '../src/forecast/operation';
import { createSession } from '../src/scenarios';
import { resumeRun, saveRun } from '../src/scenarios/save';
import { estimate } from '../src/systems/intel';

const RUS = 'RUS' as NationId, UKR = 'UKR' as NationId;
const RUNS = 2, DAYS = 3;

const outcome = (f: OperationForecast) => ({ pObjectiveByDay: f.pObjectiveByDay, losses: f.losses, casualties: f.casualties, advance: f.advance });
const power = (f: Formation) => Object.values(f.equipment).reduce((t, n) => t + n, 0);

// Each case forecasts from its own resumed copy of one saved day-2 game, so no View cached for one world is served to another.
describe('an operation forecast reads the planner\'s beliefs, not the truth', () => {
  let saved: string;
  let plan: OperationPlan;
  let control: OperationForecast;
  const copy = () => resumeRun(saved);
  const forecast = (s: ReturnType<typeof copy>) => forecastOperation(forecastInput(s.world, s.engine.map, s.engine.catalog, plan, DAYS), RUNS);

  beforeAll(() => {
    const s = createSession('ukraine-2026', 1);
    s.engine.run(s.world, 8);
    saved = saveRun('ukraine-2026', s.world);
    const force = ['3rd Motor Rifle Division', '2nd Guards Motor Rifle Brigade', '4th Guards Motor Rifle Brigade', '20th Guards Motor Rifle Division']
      .map((n) => Object.values(s.world.formations).find((f) => f.nation === RUS && f.name.startsWith(n))!.id);
    plan = { nation: RUS, kind: 'offensive', objectives: [s.engine.map.nodeAt(48.72, 37.56)], formations: force };
    control = forecast(copy());
  }, 120_000);

  it('briefs odds by day, the spread of losses and ground, the drivers and the age of its intelligence', () => {
    expect(control.runs).toBe(RUNS);
    expect(control.pObjectiveByDay).toHaveLength(DAYS);
    expect(control.axis[control.axis.length - 1]).toBe(plan.objectives[0]);
    expect(control.losses.p10).toBeLessThanOrEqual(control.losses.p90);
    expect(control.losses.p50).toBeGreaterThan(0);
    expect(control.drivers.length).toBeGreaterThan(0);
    expect(control.enemyContacts).toBeGreaterThan(0);
    expect(control.intelAgeHours!.min).toBeLessThanOrEqual(control.intelAgeHours!.max);
    expect(forecast(copy())).toEqual(control);
  });

  it('changing Ukrainian truth Russia has not seen (where its forces stand now, their morale and readiness, the strength of the ones it never fixed) leaves the forecast exactly as it was', () => {
    const s = copy();
    const { world } = s;
    const ukrainian = Object.values(world.formations).filter((f) => f.nation === UKR && f.status === 'active');
    const unseen = new Set(ukrainian.filter((f) => !estimate(world, RUS, f.id)));
    expect(unseen.size).toBeGreaterThan(0);
    for (const f of ukrainian) {
      if (f.kind === 'maneuver') f.node = control.axis[1];
      if (unseen.has(f)) for (const k of Object.keys(f.equipment) as (keyof Formation['equipment'])[]) f.equipment[k] *= 3;
      f.morale = 1;
      f.readiness = 1;
    }
    expect(forecast(s)).toEqual(control);
  }, 120_000);

  it('hiding the strongest Ukrainian contact on the axis from Russia\'s picture changes the forecast', () => {
    const s = copy();
    const { world } = s;
    const picture = world.slices.intel!.pictures[RUS]!;
    const onAxis = new Set<number>(control.axis);
    const target = Object.values(world.formations)
      .filter((f) => f.nation === UKR && f.kind === 'maneuver' && picture[f.id] && onAxis.has(picture[f.id]!.node))
      .sort((a, b) => power(b) - power(a) || (a.id < b.id ? -1 : 1))[0];
    expect(target).toBeDefined();
    delete picture[target.id];
    const hidden = forecast(s);
    expect(hidden.enemyContacts).toBe(control.enemyContacts - 1);
    expect(outcome(hidden)).not.toEqual(outcome(control));
  }, 120_000);
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Command, CommandResult, Formation, NationId, NodeId, World } from '../src/core/types';
import { loadMap } from '../src/data/load';
import { forecastOperation, runOperation, type OperationForecast, type OperationForecastInput, type OperationPlan } from '../src/forecast/operation';
import { createSession } from '../src/scenarios';
import { resumeRun, saveRun } from '../src/scenarios/save';
import { estimate } from '../src/systems/intel';
import { SimHost } from '../src/ui/host';
import { Forecaster, type DrawReply, type DrawRequest, type DrawWorker } from '../src/ui/orders/forecaster';
import { ForecastView } from '../src/ui/orders/PlanPanel';
import { orderOptions, type OrderOption } from '../src/ui/orders/options';
import { posturesOf } from '../src/ui/orders/postures';
import type { FromWorker } from '../src/ui/snapshot';

const power = (f: Formation) => Object.values(f.equipment).reduce((t, n) => t + n, 0);

type Session = ReturnType<typeof createSession>;

function war(scenario: string, player: string, ticks: number): Session {
  const s = createSession(scenario, 1);
  s.world.nations[player as NationId].controlledBy = 'human';
  for (let i = 0; i < ticks; i++) s.engine.step(s.world);
  return s;
}

/** The engine's final answer to `cmd` sent for real, on a copy of the world: through the chain of command if it is relayed. */
function realAnswer(s: Session, cmd: Command): CommandResult {
  const w: World = structuredClone(s.world);
  w.pending.push(cmd);
  for (let t = 0; t < 40; t++) {
    for (const e of s.engine.step(w)) {
      if (e.type !== 'command_result' || e.command !== cmd.type || e.code === 'relayed') continue;
      if (cmd.type === 'order' && e.formation !== cmd.formation) continue;
      return e;
    }
  }
  throw new Error(`no answer to ${JSON.stringify(cmd)}`);
}

function frontBrigade(s: Session, nation: string, enemy: string): { f: Formation; target: NodeId } {
  for (const f of Object.values(s.world.formations)) {
    if (f.nation !== nation || f.kind !== 'maneuver' || f.status !== 'active') continue;
    const target = [...s.map.neighbors(f.node)].find((n) => s.world.control[n] === enemy);
    if (target !== undefined) return { f, target };
  }
  throw new Error('no brigade on the line');
}

const UKR = 'UKR' as NationId, RUS = 'RUS' as NationId;
const RUNS = 3, DAYS = 3;

/** Stands in for the page's Web Workers: each draw runs on a later turn of the event loop, as a worker's reply would arrive. */
const inThread = (): DrawWorker => {
  const w: DrawWorker = {
    onmessage: null,
    postMessage(m: DrawRequest) {
      setTimeout(() => {
        if (m.input) cache.set(w, m.input);
        w.onmessage?.({ data: { job: m.job, index: m.index, run: runOperation(cache.get(w)!, m.spec) } } as MessageEvent<DrawReply>);
      }, 0);
    },
  };
  return w;
};
const cache = new Map<DrawWorker, OperationForecastInput>();

/** A game played as `nation` through the worker host, the page's way in: what the host posts back is kept. */
function hosted(text: string) {
  const posts: FromWorker[] = [];
  const host = new SimHost((m) => posts.push(m));
  host.handle({ type: 'load', text });
  return {
    host,
    get world() { return host.world!; },
    forecastInput(plan: OperationPlan, days: number): OperationForecastInput {
      host.handle({ type: 'forecast', seq: 7, plan, days });
      const reply = [...posts].reverse().find((m) => m.type === 'forecast_input');
      if (reply?.type !== 'forecast_input' || !reply.input) throw new Error(`no forecast input: ${reply?.type === 'forecast_input' ? reply.reason : 'no reply'}`);
      return reply.input;
    },
  };
}

describe('staff forecast panel', () => {
  let saved: string;
  let plan: OperationPlan;
  let shown: OperationForecast;

  beforeAll(async () => {
    const s = createSession('ukraine-2026', 1);
    s.world.nations[RUS].controlledBy = 'human';
    s.engine.run(s.world, 8);
    saved = saveRun('ukraine-2026', s.world);
    const force = ['3rd Motor Rifle Division', '2nd Guards Motor Rifle Brigade', '4th Guards Motor Rifle Brigade']
      .map((n) => Object.values(s.world.formations).find((f) => f.nation === RUS && f.name.startsWith(n))!.id);
    plan = { nation: RUS, kind: 'offensive', objectives: [s.map.nodeAt(48.72, 37.56)!], formations: force };
    const input = hosted(saved).forecastInput(plan, DAYS);
    shown = await new Forecaster(loadMap(), inThread, 2).run(input, RUNS);
  }, 180_000);

  it('shows the same numbers forecastOperation gives for the same input', () => {
    const input = hosted(saved).forecastInput(plan, DAYS);
    expect(shown).toEqual(forecastOperation(input, RUNS));
    const html = renderToStaticMarkup(createElement(ForecastView, { forecast: shown, objective: "Kramatorsk", dayOf: (d: number) => `D+${d}` }));
    const last = shown.pObjectiveByDay[DAYS - 1];
    expect(html).toContain(`${Math.round(last * 100)}%`);
    expect(html).toContain(`${Math.round(shown.losses.p10)}`);
    expect(html).toContain(`${Math.round(shown.losses.p50)}`);
    expect(html).toContain(`${Math.round(shown.losses.p90)}`);
    expect(html).toContain(`${shown.enemyContacts} enemy`);
    expect((html.match(/data-day=/g) ?? []).length).toBe(DAYS);
  });

  it('changes when a contact on the axis is hidden from the player, and not when truth the player has not seen changes', () => {
    const outcome = (f: OperationForecast) => ({ p: f.pObjectiveByDay, losses: f.losses, casualties: f.casualties, advance: f.advance, contacts: f.enemyContacts });
    // Each case changes the saved game before the host loads it, as if the war had run that way.
    const edited = (change: (w: World) => void) => {
      const s = resumeRun(saved);
      change(s.world);
      return hosted(saveRun('ukraine-2026', s.world));
    };
    let unseen = 0;
    const unseenChanged = edited((w) => {
      for (const f of Object.values(w.formations)) {
        if (f.nation !== UKR || f.status !== 'active' || estimate(w, RUS, f.id)) continue;
        unseen++;
        for (const k of Object.keys(f.equipment) as (keyof Formation['equipment'])[]) f.equipment[k] *= 3;
        f.morale = 1;
        f.readiness = 1;
      }
    });
    expect(unseen).toBeGreaterThan(0);
    expect(outcome(forecastOperation(unseenChanged.forecastInput(plan, DAYS), RUNS))).toEqual(outcome(shown));

    const hidden = edited((w) => {
      const picture = w.slices.intel!.pictures[RUS]!;
      const onAxis = new Set<number>(shown.axis);
      const target = Object.values(w.formations)
        .filter((f) => f.nation === UKR && f.kind === 'maneuver' && picture[f.id] && onAxis.has(picture[f.id]!.node))
        .sort((a, b) => power(b) - power(a) || (a.id < b.id ? -1 : 1))[0];
      expect(target).toBeDefined();
      delete picture[target.id];
    });
    const after = forecastOperation(hidden.forecastInput(plan, DAYS), RUNS);
    expect(after.enemyContacts).toBe(shown.enemyContacts - 1);
    expect(outcome(after)).not.toEqual(outcome(shown));
  }, 180_000);
});

/** The command a radial option issues for one formation, as the page sends it. */
function sent(o: OrderOption, f: Formation, node: NodeId): Command {
  if (o.key === 'plan') return { type: 'plan_operation', nation: f.nation, kind: 'offensive', objectives: [node], formations: [f.id], launch: true, byPlayer: true };
  const needsTarget = o.key !== 'defend' && o.key !== 'reserve';
  return { type: 'order', nation: f.nation, formation: f.id, byPlayer: true, order: { posture: o.key, ...(needsTarget ? { target: node } : {}), ...(o.targetClass ? { targetClass: o.targetClass } : {}) } };
}

describe('radial order menu', () => {
  it('offers only the orders a brigade takes, greys the ones the engine refuses with its reason, and never writes the live world', () => {
    const s = war('ukraine-2026', 'UKR', 4);
    const { f, target } = frontBrigade(s, 'UKR', 'RUS');
    const ankara = s.map.nodeAt(39.9, 32.85)!;
    const before = JSON.stringify(s.world);
    let greyed = 0, offered = 0;
    for (const node of [target, f.node, ankara]) {
      const { options } = orderOptions(s.world, s.engine, UKR, [f.id], node);
      expect(options.map((o) => o.key).sort()).toEqual([...posturesOf(f), 'plan'].sort());
      for (const o of options) {
        const real = realAnswer(s, sent(o, f, node));
        if (o.ok.length) {
          offered++;
          expect(real.ok, `${o.key} at ${node}: ${real.reason}`).toBe(true);
        } else {
          greyed++;
          expect(real.ok, `${o.key} at ${node} greyed but accepted`).toBe(false);
          expect(o.refused[0].code).toBe(real.ok ? '' : real.code);
          expect(o.refused[0].reason).toBe(real.reason);
        }
      }
    }
    expect(offered).toBeGreaterThan(5);
    expect(greyed).toBeGreaterThan(1);
    expect(JSON.stringify(s.world)).toBe(before);
  });

  it('offers a bare cell the nearest units that can attack, strike and plan for it', () => {
    const s = war('ukraine-2026', 'UKR', 4);
    const { target } = frontBrigade(s, 'UKR', 'RUS');
    const { options } = orderOptions(s.world, s.engine, UKR, [], target);
    expect(options.map((o) => o.key)).toEqual(['attack', 'strike', 'plan']);
    for (const o of options) {
      expect(o.ok.length, o.key).toBeGreaterThan(0);
      for (const id of o.ok) expect(s.world.formations[id].nation).toBe(UKR);
    }
    expect(s.world.formations[options[0].ok[0]].kind).toBe('maneuver');
    expect(['artillery', 'missile', 'air_wing']).toContain(s.world.formations[options[1].ok[0]].kind);
    const real = realAnswer(s, options[1].commands[0]);
    expect(real.ok).toBe(true);
  });

  it('asking for options does not change the war: a run with the menu open every tick matches one without', () => {
    const a = war('ukraine-2026', 'UKR', 2), b = war('ukraine-2026', 'UKR', 2);
    for (let t = 0; t < 6; t++) {
      const { f, target } = frontBrigade(a, 'UKR', 'RUS');
      orderOptions(a.world, a.engine, UKR, [f.id], target);
      orderOptions(a.world, a.engine, UKR, [], target);
      a.engine.step(a.world);
      b.engine.step(b.world);
    }
    expect(JSON.stringify(a.world)).toBe(JSON.stringify(b.world));
  });
});

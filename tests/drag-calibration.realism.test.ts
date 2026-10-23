import { writeFileSync } from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import type { FormationId, NodeId, World } from '../src/core/types';
import { calibrateQuick, QUICK_DAYS, scale } from '../src/forecast/calibrate-quick';
import { MAX_FORECAST_DAYS } from '../src/ui/host';
import { forecastInput } from '../src/forecast/operation';
import { OperationForecastPool } from '../src/forecast/operation-pool';
import { QUICK } from '../src/forecast/quick';
import { aim } from '../src/ui/drag/gesture';
import { assaultPath } from '../src/ui/drag/kit';
import { controlOf, kitOf, russia, RUS, UKR } from './drag.fixture';

const pool = new OperationForecastPool();
/** Every comparison any test here made, for DRAG_CALIBRATION_LOG. */
const logged: string[] = [];

/** `world` with every platform, stock and store of `ids` times `k`. */
function grown(world: World, ids: FormationId[], k: number): World {
  const w = structuredClone(world);
  for (const id of ids) scale(w.formations[id], k);
  return w;
}
afterAll(() => pool.close());

it('regenerates the checked-in QUICK table exactly', async () => {
  expect(await calibrateQuick((input, runs) => pool.forecast(input, runs))).toEqual(QUICK);
}, 1_800_000);

/** Every Russian stack of manoeuvre units against every Ukrainian cell next to it, a week into ukraine-2026. */
function front() {
  const s = russia();
  const control = controlOf(s.world, s.map);
  const stacks = new Map<NodeId, FormationId[]>();
  for (const f of Object.values(s.world.formations).sort((a, b) => (a.id < b.id ? -1 : 1)))
    if (f.nation === RUS && f.kind === 'maneuver' && f.status === 'active' && !f.embarkedOn) (stacks.get(f.node) ?? stacks.set(f.node, []).get(f.node)!).push(f.id);
  const attacks = [...stacks].flatMap(([node, ids]) => [...s.map.neighbors(node)].filter((n) => s.world.control[n] === UKR).map((target) => ({ node, ids, target })));
  const pill = (world: World, ids: FormationId[], target: NodeId) => aim(kitOf(s, ids, world), { node: target, contact: null }, s.map, control).pill;
  const rows: string[] = [];
  /** The pill's middle odds less the 8-draw staff forecast's, with the comparison logged. */
  const gap = async (world: World, ids: FormationId[], target: NodeId, label: string) => {
    const p = pill(world, ids, target);
    expect(p.kind, `${label} -> ${target}`).toBe('take');
    if (p.kind !== 'take') return 0;
    // The pill's odds run a week from contact; the staff's from launch, so it is asked for the march as well.
    const days = Math.min(MAX_FORECAST_DAYS, QUICK_DAYS + Math.ceil(p.etaHours / 24));
    // The drag's attack fights through each enemy cell on its assault route (land/movement), where a staff would pick its own axis, so the staff is given that route.
    const kit = kitOf(s, ids, world);
    const way = assaultPath(kit, kit.units[0], target).filter((c) => kit.field.hostile[c]).reverse();
    const plan = { nation: RUS, kind: 'offensive' as const, objectives: [...way, target], formations: ids };
    const staff = (await pool.forecast(forecastInput(world, s.map, s.engine.catalog, plan, days), 8)).pObjectiveByDay[days - 1];
    rows.push(`${label} -> ${[...way, target].join(' > ')}: pill ${p.p.mid.toFixed(2)}, staff ${staff.toFixed(2)} over ${days} days`);
    logged.push(rows[rows.length - 1]);
    if (process.env.DRAG_CALIBRATION_LOG) writeFileSync(process.env.DRAG_CALIBRATION_LOG, logged.join('\n'));
    return p.p.mid - staff;
  };
  return { s, attacks, pill, gap, rows };
}

const spread = <T>(xs: T[], n: number) => Array.from({ length: Math.min(n, xs.length) }, (_, i) => xs[Math.floor((i * xs.length) / Math.min(n, xs.length))]);

it('puts the pill within 15 points of the 8-draw staff forecast on 10 Russian attacks in ukraine-2026, and on every one it gives a chance', async () => {
  const { s, attacks, pill, gap, rows } = front();
  expect(attacks.length).toBeGreaterThanOrEqual(10);
  const hi = (a: (typeof attacks)[number]) => {
    const p = pill(s.world, a.ids, a.target);
    return p.kind === 'take' ? p.p.hi : 0;
  };
  // Most of a static front is a stalemate both agree on, so the attacks the pill gives any chance are added to the even spread.
  const sample = [...new Set([...spread(attacks, 10), ...attacks.filter((a) => hi(a) > 0)])];
  let worst = 0;
  for (const { ids, target } of sample) worst = Math.max(worst, Math.abs(await gap(s.world, ids, target, `${ids.length} units`)));
  expect(worst, rows.join('\n')).toBeLessThanOrEqual(0.15);
}, 600_000);

// Known gap: grown 4-fold, the stack at 7483 has 7461 across the Dnipro at about 40% where every staff draw fails. The duel
// world's week is dry in some draws, so its river crossings finish; the front's week is wet in all of them, and the line
// next to the cell covers it once the garrison falls, which the river duels have no neighbour to do.
it.fails('puts the pill within 15 points of the staff when stacks on their own ground are grown until the odds are open', async () => {
  const { s, attacks, pill, gap, rows } = front();
  let worst = 0;
  for (const { node, ids, target } of attacks.filter((a) => s.world.control[a.node] === RUS)) {
    const k = [2, 4, 8, 16, 32].find((k) => {
      const p = pill(grown(s.world, ids, k), ids, target);
      return p.kind === 'take' && p.p.mid > 0.15;
    });
    if (!k) continue;
    const w = grown(s.world, ids, k);
    const p = pill(w, ids, target);
    if (p.kind === 'take' && p.p.mid < 0.85) worst = Math.max(worst, Math.abs(await gap(w, ids, target, `${ids.length} units at ${node} x${k}`)));
  }
  expect(rows.length, 'grown stacks with open odds').toBeGreaterThanOrEqual(2);
  expect(worst, rows.join('\n')).toBeLessThanOrEqual(0.15);
}, 600_000);

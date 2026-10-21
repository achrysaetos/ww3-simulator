import { atWar } from '../../core/engine';
import type { MunitionId, NationId } from '../../core/types';
import { applyHits } from './combat';
import type { TickEnv } from './env';
import { ledger } from './state';
import { LAY_PER_HULL, MINE_DENSITY, SWEEP_PER_HULL_DAY } from './tables';

/** Damage of one mine strike in Exocet equivalents. Princeton and Tripoli (1991) and Samuel B. Roberts (1988) each survived one mine; small craft do not. */
const MINE_HIT = 1.5;
/** MCM hulls hunt deliberately and suffer fewer strikes (Wonsan 1950 still cost four sweepers). */
const MCM_STRIKE_FACTOR = 0.3;

/**
 * A dived submarine passes under moored mines and below most ground mines' influence fields: the
 * generic influence mine's kill chance is 0.1 against a submarine and 0.35 against a surface ship
 * (catalog sea_mine; NWP 3-15 mine warfare; estimate).
 */
const SUBMERGED_STRIKE_FACTOR = 0.3;

/** Lay, sweep, then roll strikes on every hull sitting in a hostile minefield. */
export function mineWarfare(env: TickEnv): void {
  const { world, ctx } = env;
  const mines = world.slices.naval.mines;
  for (const f of env.naval) {
    if (f.order.path?.length || !ctx.map.isSea(f.node)) continue;
    const c = env.comp(f);
    if (f.order.posture === 'blockade') {
      for (const [id, n] of Object.entries(f.magazine) as [MunitionId, number][]) {
        if (n < 1 || ctx.catalog.munition(id).kind !== 'mine') continue;
        const laid = Math.min(Math.floor(n), LAY_PER_HULL * c.hullCount);
        f.magazine[id] -= laid;
        const at = (mines[f.node] ??= {});
        at[f.nation] = (at[f.nation] ?? 0) + laid;
        ledger(world, f.nation).minesLaid += laid;
      }
    }
    const mcm = c.hulls.filter((h) => h.platform.class === 'mine_warfare').reduce((s, h) => s + h.count, 0);
    const laid = mines[f.node];
    if (mcm && laid) {
      let capacity = mcm * SWEEP_PER_HULL_DAY * (world.dtHours / 24) * f.readiness;
      for (const layer of Object.keys(laid) as NationId[]) {
        if (layer === f.nation || !atWar(world, layer, f.nation) || capacity <= 0) continue;
        const swept = Math.min(laid[layer], capacity);
        laid[layer] -= swept;
        capacity -= swept;
        ledger(world, f.nation).minesSwept += swept;
        if (laid[layer] <= 1e-6) delete laid[layer];
      }
      if (!Object.keys(laid).length) delete mines[f.node];
    }
  }
  for (const f of [...env.naval]) {
    const laid = mines[f.node];
    if (!laid || f.status !== 'active') continue;
    let hostile = 0;
    for (const [layer, n] of Object.entries(laid)) if (atWar(world, layer as NationId, f.nation)) hostile += n;
    if (!hostile) continue;
    const p = (1 - Math.exp(-hostile / MINE_DENSITY)) * (env.comp(f).submerged ? SUBMERGED_STRIKE_FACTOR : 1);
    let strikes = 0;
    for (const h of env.comp(f).hulls) strikes += ctx.rng.binomial(h.count, h.platform.class === 'mine_warfare' ? p * MCM_STRIKE_FACTOR : p);
    if (strikes) applyHits(env, f, new Array(strikes).fill(MINE_HIT), Object.keys(laid)[0] as NationId);
  }
}

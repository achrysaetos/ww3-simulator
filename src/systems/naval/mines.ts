import { atWar } from '../../core/engine';
import { allied } from '../land/state';
import type { Formation, FormationId, MunitionId, NationId, World } from '../../core/types';
import { applyHits } from './combat';
import type { TickEnv } from './env';
import { chart, ledger } from './state';
import { LAY_PER_HULL, MINE_DENSITY, SWEEP_PER_HULL_DAY } from './tables';

/** Damage of one mine strike in Exocet equivalents. Princeton and Tripoli (1991) and Samuel B. Roberts (1988) each survived one mine; small craft do not. */
const MINE_HIT = 1.5;
/**
 * A minehunter works a field deliberately: it finds mines with high-frequency sonar ahead of the hull and
 * destroys them with remote vehicles, on a glass-fibre or non-magnetic hull with a low acoustic signature,
 * and the LCS package hunts from MH-60S helicopters and unmanned boats with no crew in the field.
 * Calibration: in 1991 some 30 coalition MCM vessels hunted the Kuwaiti fields (~1,200 mines cleared) for
 * about two months and none was mined; the ships struck, Tripoli and Princeton, were not hunting. In the
 * model's terms that is ~7,000 hull-ticks at an average ~600 mines (strike chance ~0.33 a tick, MINE_DENSITY),
 * ~2,300 unscaled strikes against none seen, so the factor is at most ~3/2,300 = 0.0013 at 95% (rule of
 * three). The European and US hunters clearing Iran's mines in 1987-88 (Earnest Will; Operations Calendar
 * and Cleaver) were not mined either, while Bridgeton and Samuel B. Roberts were. Wonsan 1950 cost four
 * sweepers that swept mechanically through an uncharted field, the upper end for older methods
 * (Melia, "Damn the Torpedoes", 1991). 0.003 allows for hulls not all on task at once.
 */
// param: tag=estimated range=[0.001,0.02] source=Gulf 1991 MCM operations (no hunter mined); Earnest Will 1987-88; Melia 1991
const MCM_STRIKE_FACTOR = 0.003;

/**
 * A dived submarine passes under moored mines and below most ground mines' influence fields: the
 * generic influence mine's kill chance is 0.1 against a submarine and 0.35 against a surface ship
 * (catalog sea_mine; NWP 3-15 mine warfare; estimate).
 */
const SUBMERGED_STRIKE_FACTOR = 0.3;

/** Lay, sweep, then roll strikes on every hull sitting in a hostile minefield. Returns the groups that laid this tick. */
export function mineWarfare(env: TickEnv): Formation[] {
  const layers: Formation[] = [];
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
        chart(world, f.nation, f.node);
        if (!layers.includes(f)) layers.push(f);
      }
    }
    const mcm = c.hulls.filter((h) => h.platform.class === 'mine_warfare').reduce((s, h) => s + h.count, 0);
    const laid = mines[f.node];
    if (mcm && laid) {
      chart(world, f.nation, f.node);
      let capacity = mcm * SWEEP_PER_HULL_DAY * (world.dtHours / 24) * f.readiness;
      for (const layer of Object.keys(laid) as NationId[]) {
        // Sweeping clears a sea lane, not an act of war: in 1987-88 Belgian, Dutch, British, French and Italian
        // minehunters cleared Iran's Gulf mines without being at war with Iran (Operations Calendar and Cleaver).
        if (layer === f.nation || allied(world, f.nation, layer) || capacity <= 0) continue;
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
    if (!strikes) continue;
    chart(world, f.nation, f.node);
    applyHits(env, f, new Array(strikes).fill(MINE_HIT), Object.keys(laid)[0] as NationId);
  }
  return layers;
}

/**
 * A minelayer tracked in the act gives the field away: USS Jarrett's helicopters caught Iran Ajr laying in 1987. Read
 * from this tick's tracks: a layer lays on the tick it arrives, before the last tick's tracks had it on station.
 */
export function chartWatchedLaying(world: World, layers: readonly Formation[], tracks: ReadonlyMap<FormationId, ReadonlySet<NationId>>): void {
  for (const f of layers) for (const n of tracks.get(f.id) ?? []) chart(world, n, f.node);
}

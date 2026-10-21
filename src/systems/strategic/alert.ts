import type { SimContext } from '../../core/engine';
import type { MunitionId, NationId, PlatformId, World } from '../../core/types';
import type { AlertSpec } from '../../data/nations';
import { isLive } from './nuclear';

/** Share of the stored warheads mated `hours` after the order. */
export function matedShare(spec: AlertSpec, hours: number): number {
  if (hours < spec.firstHours) return 0;
  if (hours >= spec.fullHours) return 1;
  return spec.firstShare + ((1 - spec.firstShare) * (hours - spec.firstHours)) / (spec.fullHours - spec.firstHours);
}

/**
 * Order `n`'s stored warheads mated to its launchers. The decision is the leadership's: the AI
 * orders it per doctrine (ai/strategy.ts) and a human player orders it with the `nuclear_alert`
 * command. A state whose warheads are all on launchers, or that already alerted, has nothing to do.
 */
export function orderAlert(world: World, ctx: SimContext, specs: Readonly<Record<string, AlertSpec>>, n: NationId, reason: string): void {
  const nuclear = world.nations[n]?.nuclear;
  const s = world.slices.strategic;
  if (!nuclear || !specs[n] || s.alerts[n] || nuclear.warheads <= nuclear.deployed) return;
  s.alerts[n] = { orderedTick: world.tick, stored: nuclear.warheads - nuclear.deployed, mated: 0, reason };
  ctx.emit({ type: 'nuclear_alert', tick: world.tick, nation: n, stage: 'ordered', ready: nuclear.deployed, of: nuclear.warheads, reason });
}

/**
 * Progress ordered alerts: each step mates the warheads the timeline allows, raising
 * `nuclear.deployed`, the ceiling on what the state can release. Where the spec names
 * dual-capable launchers, the mated rounds are loaded into their magazines.
 */
export function stepAlerts(world: World, ctx: SimContext, specs: Readonly<Record<string, AlertSpec>>): void {
  const s = world.slices.strategic;
  for (const [n, alert] of Object.entries(s.alerts) as [NationId, (typeof s.alerts)[NationId]][]) {
    const nuclear = world.nations[n]?.nuclear;
    const spec = specs[n];
    if (!nuclear || !spec || alert.mated >= alert.stored) continue;
    const want = Math.round(alert.stored * matedShare(spec, (world.tick - alert.orderedTick) * world.dtHours));
    const add = Math.min(want - alert.mated, nuclear.warheads - nuclear.deployed);
    if (add <= 0) continue;
    const first = alert.mated === 0;
    alert.mated += add;
    nuclear.deployed += add;
    if (spec.loads) loadDualCapable(world, ctx, n, spec.loads, add);
    const complete = alert.mated >= alert.stored || nuclear.deployed >= nuclear.warheads;
    if (first || complete) ctx.emit({ type: 'nuclear_alert', tick: world.tick, nation: n, stage: complete ? 'complete' : 'ready', ready: nuclear.deployed, of: nuclear.warheads, reason: alert.reason });
    if (complete) alert.mated = alert.stored;
  }
}

/** Put up to `count` nuclear rounds on `n`'s dual-capable launchers, filling each to its allowance in formation order. */
function loadDualCapable(world: World, ctx: SimContext, n: NationId, loads: NonNullable<AlertSpec['loads']>, count: number): void {
  let left = count;
  const formations = Object.values(world.formations).filter((f) => f.nation === n && isLive(f)).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const f of formations) {
    for (const [pid, load] of Object.entries(loads)) {
      const launchers = f.equipment[pid as PlatformId] ?? 0;
      if (!launchers || !ctx.catalog.munitions.has(load.munition as MunitionId)) continue;
      const mid = load.munition as MunitionId;
      const take = Math.min(left, launchers * load.perLauncher - (f.magazine[mid] ?? 0));
      if (take <= 0) continue;
      f.magazine[mid] = (f.magazine[mid] ?? 0) + take;
      left -= take;
      if (left === 0) return;
    }
  }
}

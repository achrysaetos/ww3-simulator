import type { SimContext } from '../../core/engine';
import type { Formation, NationId, PlatformId, World } from '../../core/types';
import { TUNING } from './tables';

/** Running tally of platform losses by nation, for 'battle' events. */
export type LossTally = Record<NationId, Record<PlatformId, number>>;

/**
 * Take `hits` platforms of one type out of a formation: most destroyed, a share
 * damaged (logistics repairs them), crews lost with the destroyed share.
 * Returns the number actually removed.
 */
export function takeLosses(world: World, ctx: SimContext, f: Formation, pid: PlatformId, hits: number, damagedShare = TUNING.damagedShare, tally?: LossTally): number {
  const n = Math.min(hits, f.equipment[pid] ?? 0);
  if (n <= 0) return 0;
  const damaged = Math.round(n * damagedShare);
  f.equipment[pid] -= n;
  if (damaged) f.damaged[pid] = (f.damaged[pid] ?? 0) + damaged;
  f.personnel = Math.max(0, f.personnel - (n - damaged) * ctx.catalog.platform(pid).crew);
  if (tally) {
    const t = (tally[f.nation] ??= {});
    t[pid] = (t[pid] ?? 0) + n;
  }
  if (Object.values(f.equipment).every((c) => c <= 0) && Object.values(f.damaged).every((c) => c <= 0)) {
    f.status = 'destroyed';
    ctx.emit({ type: 'formation_destroyed', tick: world.tick, formation: f.id, nation: f.nation });
  }
  return n;
}

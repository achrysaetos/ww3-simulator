import { atWar } from '../../core/engine';
import type { SimContext } from '../../core/engine';
import type { Formation, NationId, World } from '../../core/types';
import { cellPopulation } from '../civil';
import type { NonKineticState, OccupationLedger } from './state';
import { GARRISON_PER_1000, GARRISON_READINESS_PER_DAY, OCCUPATION_COST_USD_M_DAY, RESISTANCE_PER_MILLION_DAY } from './tables';

function ledger(s: NonKineticState, occupier: NationId): OccupationLedger {
  return (s.occupation[occupier] ??= { resistanceActs: 0, costUsdB: 0 });
}

/**
 * Armed resistance in hostile-occupied territory. Resistance rises with the occupied population and
 * falls as the occupier packs the ground with troops (the Quinlivan/RAND force-ratio rule). A thin
 * garrison faces ambushes that wear it down and a bill for security operations it cannot avoid, so
 * holding restive land ties troops down and costs the occupier (Iraq 2003-07; Ukraine's south, ISW).
 */
export function stepOccupation(world: World, ctx: SimContext, s: NonKineticState): void {
  const { map } = ctx;
  const dtDays = world.dtHours / 24;

  // Occupier personnel and garrison formations present, per cell.
  const garrison = new Map<number, number>();
  const formationsAt = new Map<number, Formation[]>();
  for (const f of Object.values(world.formations)) {
    if (f.status === 'destroyed' || f.kind !== 'maneuver') continue;
    const owner = map.owner[f.node];
    if (!owner || world.control[f.node] !== f.nation || f.nation === owner) continue;
    if (!atWar(world, owner, f.nation)) continue;
    garrison.set(f.node, (garrison.get(f.node) ?? 0) + f.personnel);
    (formationsAt.get(f.node) ?? formationsAt.set(f.node, []).get(f.node)!).push(f);
  }

  for (let c = 0; c < map.landCount; c++) {
    const owner = map.owner[c];
    const occupier = world.control[c];
    if (!owner || !occupier || occupier === owner || !atWar(world, owner, occupier)) continue;
    const people = cellPopulation(world, map, c);
    if (people <= 0) continue;
    const troops = garrison.get(c) ?? 0;
    const density = troops / (people / 1000);
    const suppression = Math.min(1, density / GARRISON_PER_1000());
    const exposure = 1 - suppression;
    if (exposure <= 0) continue;

    const rate = RESISTANCE_PER_MILLION_DAY() * (people / 1e6) * exposure;
    const l = ledger(s, occupier);
    if (ctx.rng.chance(1 - Math.exp(-rate * dtDays))) l.resistanceActs++;

    for (const f of formationsAt.get(c) ?? []) f.readiness = Math.max(0, f.readiness - GARRISON_READINESS_PER_DAY() * exposure * dtDays);

    const cost = (OCCUPATION_COST_USD_M_DAY() / 1000) * exposure * dtDays * Math.min(1, people / 1e6);
    l.costUsdB += cost;
    world.nations[occupier].treasuryUsdB -= cost;
  }
}

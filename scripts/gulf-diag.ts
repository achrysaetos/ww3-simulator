/**
 * Ballistic-missile exchange in the Iran-Israel war: rounds fired per side by
 * weapon kind and the escalation rung each warring dyad ends on.
 * npx tsx scripts/gulf-diag.ts <days> [seed]
 */
import type { SimEvent } from '../src/core/types';
import { createSession } from '../src/scenarios';

const [days = '30', seed = '1'] = process.argv.slice(2);
const { world, map, engine, catalog } = createSession('gulf-2027', Number(seed));
const fired: Record<string, number> = {};
const firstDay: Record<string, number> = {};
for (let i = 0; i < Math.round((Number(days) * 24) / world.dtHours); i++) {
  const day = Math.round(((world.tick * world.dtHours) / 24) * 10) / 10;
  for (const e of engine.step(world) as SimEvent[]) {
    if (e.type !== 'strike' || map.isSea(e.target)) continue;
    const kind = catalog.munitions.get(e.munition)?.kind;
    if (!kind || !['srbm', 'mrbm', 'irbm', 'hgv'].includes(kind)) continue;
    const k = `${e.by}->${world.control[e.target]} ${e.munition}`;
    fired[k] = (fired[k] ?? 0) + e.fired;
    firstDay[k] ??= day;
  }
}
const rungs = Object.fromEntries(Object.entries(world.relations).filter(([, r]) => r.atWar).map(([k, r]) => [k, r.escalation]));
console.log(JSON.stringify({ seed: Number(seed), days: Number(days), ballisticFired: fired, firstDay, rungs }));

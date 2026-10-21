/**
 * The inputs to a nation's first-use threshold, every `step` days: population lost, land and air
 * forces lost, output lost, and the AI's nuclear ladder.
 * npx tsx scripts/nuclear-pressure.ts <scenario> <days> <seed> <nation> [step]
 */
import { platformCount } from '../src/core/forces';
import type { NationId } from '../src/core/types';
import { createSession } from '../src/scenarios';

const [scenario = 'south-asia-2027', days = '60', seed = '1', nation = 'PAK', step = '5'] = process.argv.slice(2);
const n = nation as NationId;
const s = createSession(scenario, Number(seed));
const perDay = 24 / s.world.dtHours;
const base = new Map<string, number>();
const forcesLost = () => {
  let b = 0, lost = 0;
  for (const f of Object.values(s.world.formations)) {
    if (f.nation !== n || !['maneuver', 'artillery', 'air_wing'].includes(f.kind)) continue;
    const now = platformCount(f);
    if (!base.has(f.id)) base.set(f.id, now);
    b += base.get(f.id)!;
    lost += Math.max(0, base.get(f.id)! - now);
  }
  return b ? lost / b : 0;
};
forcesLost();
for (let day = 0; day <= Number(days); day++) {
  if (day % Number(step) === 0) {
    const a = s.world.slices.diplomacy.assessment[n];
    const e = s.world.slices.economy?.nations[n];
    console.log(JSON.stringify({
      day, status: s.world.nations[n].status, popLost: +(a?.popLost ?? 0).toFixed(3), areaLost: +(a?.areaLost ?? 0).toFixed(3),
      forcesLost: +forcesLost().toFixed(3), gdpIndex: +(e?.gdpIndex ?? 1).toFixed(3), tradeLoss: +(e?.tradeLoss ?? 0).toFixed(3),
      deployed: s.world.nations[n].nuclear.deployed, ladder: s.world.slices.ai.nuclear[n],
    }));
  }
  for (let i = 0; i < perDay; i++) s.engine.step(s.world);
}

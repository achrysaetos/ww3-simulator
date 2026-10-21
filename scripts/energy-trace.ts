/**
 * Weekly trace of the energy market for calibration: world price, share of world energy
 * exports lost, and chosen nations' blockade, energy supply, reserves, GDP and military fuel.
 * npx tsx scripts/energy-trace.ts <scenario> <days> [seed] [nations,comma,separated] [stepDays]
 */
import type { NationId } from '../src/core/types';
import { createSession } from '../src/scenarios';

const [scenario = 'gulf-2027', days = '60', seed = '1', who = '', stepDays = '7'] = process.argv.slice(2);
const s = createSession(scenario, Number(seed));
const w = s.world;
const every = Math.round((Number(stepDays) * 24) / w.dtHours);
const ticks = Math.round((Number(days) * 24) / w.dtHours);
const r2 = (x: number) => Math.round(x * 100) / 100;
const ids = who.split(',').filter(Boolean) as NationId[];
for (let t = 0; t <= ticks; t++) {
  if (t % every === 0) {
    const eco = w.slices.economy;
    const row: Record<string, unknown> = {};
    for (const id of ids) {
      const e = eco.nations[id];
      row[id] = { blocked: r2(w.theater.tradeBlocked[id] ?? 0), energy: r2(e.supply.energy), buffers: e.buffers.energy.map(r2), gdp: r2(e.gdpIndex), fuelKt: Math.round(w.nations[id].bulk.fuel / 1000), ammoKt: Math.round(w.nations[id].bulk.ammo / 1000), semis: r2(e.supply.semiconductors), tradeLoss: r2(e.tradeLoss) };
    }
    console.log(`d${Math.round((t * w.dtHours) / 24)} price=${r2(eco.energyPrice)} lost=${r2(eco.energyExportsLost * 100)}% ${JSON.stringify(row)}`);
  }
  if (t < ticks) s.engine.step(w);
}

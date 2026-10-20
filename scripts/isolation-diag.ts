/**
 * Measure land isolation and deep-strike outcomes in a real run: formations that
 * surrender encircled (with the long-range SAM launchers they take with them),
 * strikes landing on Guam and on the rest of the US, and when the China-US dyad
 * reaches strategic conventional war.
 * npx tsx scripts/isolation-diag.ts <scenario> <days> [seed] [--list]
 */
import { rung } from '../src/systems/diplomacy/wars';
import type { NationId, PlatformId, SimEvent } from '../src/core/types';
import { createSession } from '../src/scenarios';

const args = process.argv.slice(2);
const list = args.includes('--list');
const [scenario = 'taiwan-2027', days = '30', seed = '1'] = args.filter((a) => !a.startsWith('--'));
const { world, map, engine, catalog } = createSession(scenario, Number(seed));
const ticks = Math.round((Number(days) * 24) / world.dtHours);
const inGuam = (n: number) => map.lat[n] >= 13 && map.lat[n] <= 21 && map.lon[n] >= 144 && map.lon[n] <= 146.5;
const samLong = (eq: Record<string, number>) =>
  Object.entries(eq).reduce((a, [id, k]) => a + (catalog.platform(id as PlatformId).class === 'sam_long' ? k : 0), 0);

const fielded = (nation: NationId) => Object.values(world.formations).filter((f) => f.nation === nation && f.status !== 'destroyed').reduce((a, f) => a + samLong(f.equipment), 0);
const start = { USA: fielded('USA' as NationId), RUS: fielded('RUS' as NationId) };
const surrenders: Record<string, number> = {};
const samLongSurrendered: Record<string, number> = {};
const strikes = { guam: 0, usaElsewhere: 0, firstGuamDay: -1 };
let strategicDay = -1;
for (let i = 0; i < ticks; i++) {
  const day = (world.tick * world.dtHours) / 24;
  for (const e of engine.step(world) as SimEvent[]) {
    if (e.type === 'strike' && !map.isSea(e.target) && map.owner[e.target] === 'USA' && e.by !== 'USA') {
      if (inGuam(e.target)) {
        strikes.guam += e.fired;
        if (strikes.firstGuamDay < 0) strikes.firstGuamDay = Math.round(day * 10) / 10;
      } else strikes.usaElsewhere += e.fired;
    }
    if (e.type !== 'message' || !e.text.includes('surrendered after')) continue;
    const f = Object.values(world.formations).find((g) => g.nation === e.nation && g.status === 'destroyed' && e.text.startsWith(g.name));
    const nation = e.nation ?? '?';
    surrenders[nation] = (surrenders[nation] ?? 0) + 1;
    if (!f) continue;
    samLongSurrendered[nation] = (samLongSurrendered[nation] ?? 0) + samLong(f.equipment);
    if (list) {
      const n = f.node;
      console.log(`day ${day.toFixed(1)} ${f.nation} ${f.name} kind=${f.kind} (${map.lat[n]},${map.lon[n]}) owner=${map.owner[n]} holder=${world.control[n]} sam_long=${samLong(f.equipment)}`);
    }
  }
  const r = world.relations['CHN|USA'];
  if (strategicDay < 0 && r && rung(r.escalation) >= rung('strategic_conventional')) strategicDay = Math.round(day * 10) / 10;
}
const samLongLost = { USA: start.USA - fielded('USA' as NationId), RUS: start.RUS - fielded('RUS' as NationId) };
console.log(JSON.stringify({ scenario, days: Number(days), seed: Number(seed), surrenders, samLongSurrendered, samLongLost, strikesOnUSA: strikes, chnUsaStrategicDay: strategicDay }));

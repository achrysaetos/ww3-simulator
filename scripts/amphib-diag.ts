/**
 * Measure a cross-strait invasion in a real run: amphibious hulls the invader loses and to
 * which weapons, troops ashore, surrenders, how long the capital holds, the defender's GDP.
 * npx tsx scripts/amphib-diag.ts [scenario] [days] [seed] [invader] [defender]
 */
import type { MunitionId, NationId, PlatformId, SimEvent } from '../src/core/types';
import { createSession } from '../src/scenarios';

const [scenario = 'taiwan-2027', days = '60', seed = '1', invader = 'CHN', defender = 'TWN'] = process.argv.slice(2);
const { world, map, engine, catalog } = createSession(scenario, Number(seed));
const ticksPerDay = 24 / world.dtHours;
const isAmphib = (pid: string) => catalog.platform(pid as PlatformId).class === 'amphibious';
const isFerry = (pid: string) => catalog.platform(pid as PlatformId).class === 'cargo_ship';
const amphibs = () => {
  let fit = 0, damaged = 0, ferries = 0;
  for (const f of Object.values(world.formations)) {
    if (f.nation !== invader || f.status === 'destroyed') continue;
    for (const [pid, n] of Object.entries(f.equipment)) if (isAmphib(pid)) fit += n; else if (isFerry(pid)) ferries += n;
    for (const [pid, n] of Object.entries(f.damaged)) if (isAmphib(pid)) damaged += n;
  }
  return { fit, damaged, ferries };
};
const start = amphibs();
const capital = world.nations[defender as NationId].capital;
const amphibGroupNames = new Set(Object.values(world.formations).filter((f) => f.nation === invader && Object.keys(f.equipment).some(isAmphib)).map((f) => f.name));

const byWeapon: Record<string, { fired: number; intercepted: number; hits: number }> = {};
const sunkBy: Record<string, number> = {};
let surrenders = 0, capitalLostDay = -1, peakAshore = 0;
const daily: string[] = [];
for (let t = 0; t < Number(days) * ticksPerDay; t++) {
  for (const e of engine.step(world) as SimEvent[]) {
    if (e.type === 'strike' && e.by !== invader) {
      const m = /^(\d+) hits on (.*)$/.exec(e.damage);
      if (m && amphibGroupNames.has(m[2])) {
        const k = `${e.by}:${e.munition as MunitionId}`;
        const w = (byWeapon[k] ??= { fired: 0, intercepted: 0, hits: 0 });
        w.fired += e.fired; w.intercepted += e.intercepted; w.hits += Number(m[1]);
      }
    }
    if (e.type === 'battle' && e.defender === invader && map.isSea(e.node))
      for (const [pid, n] of Object.entries(e.losses[invader as NationId] ?? {})) if (isAmphib(pid)) sunkBy[e.attacker] = (sunkBy[e.attacker] ?? 0) + n;
    if (e.type === 'message' && e.nation === invader && e.text.includes('surrendered after')) surrenders++;
  }
  if (capitalLostDay < 0 && world.control[capital] !== defender) capitalLostDay = Math.round((world.tick / ticksPerDay) * 10) / 10;
  if ((t + 1) % (ticksPerDay * 5) === 0) {
    let troops = 0, formations = 0;
    for (const f of Object.values(world.formations))
      if (f.nation === invader && f.status === 'active' && !map.isSea(f.node) && map.owner[f.node] === defender) { troops += f.personnel; formations++; }
    peakAshore = Math.max(peakAshore, troops);
    const a = amphibs();
    daily.push(`d${(t + 1) / ticksPerDay}: amphib ${a.fit}+${a.damaged}dmg ferries ${a.ferries} ashore ${formations}f/${troops} gdp ${(world.slices.economy?.nations[defender as NationId]?.gdpIndex ?? 1).toFixed(2)}`);
  }
}
const end = amphibs();
const led = world.slices.naval.ledger[invader as NationId];
console.log(daily.join('\n'));
console.log(JSON.stringify({
  scenario, seed: Number(seed), days: Number(days),
  amphib: { start: start.fit, fitEnd: end.fit, damagedEnd: end.damaged, sunkBy }, ferries: [start.ferries, end.ferries],
  troopsLanded: led?.troopsLanded, troopsLostLanding: led?.troopsLostLanding, peakAshore, surrenders,
  capitalHeldDays: capitalLostDay < 0 ? Number(days) : capitalLostDay,
  gdpIndex: world.slices.economy?.nations[defender as NationId]?.gdpIndex,
  byWeapon: Object.fromEntries(Object.entries(byWeapon).sort((a, b) => b[1].fired - a[1].fired)),
}, null, 1));

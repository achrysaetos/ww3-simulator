/**
 * Where a navy's losses come from in a real run: surface hulls lost (sunk or mission-killed) by
 * the weapon that hit them, the range from the enemy coast, and the age and source of the
 * striker's intel fix on the group; submarines lost; and the classes the realism bands count.
 * npx tsx scripts/naval-diag.ts [scenario] [days] [seed] [victim] [striker]
 */
import type { FormationId, MunitionId, NationId, NodeId, PlatformClass, PlatformId, SimEvent } from '../src/core/types';
import { createSession } from '../src/scenarios';
import { estimate } from '../src/systems/intel';

const [scenario = 'taiwan-2027', days = '30', seed = '1', victim = 'USA', striker = 'CHN'] = process.argv.slice(2);
const { world, map, engine, catalog } = createSession(scenario, Number(seed));
const SURFACE = new Set<PlatformClass>(['cruiser', 'destroyer', 'frigate', 'corvette', 'carrier', 'amphibious']);
const SUBS = new Set<PlatformClass>(['ssn', 'ssgn']);
const coast: NodeId[] = [];
for (let n = 0 as NodeId; n < map.landCount; n++) if (map.owner[n] === striker && [...map.neighbors(n)].some((m) => map.isSea(m))) coast.push(n);
const coastKm = (node: NodeId) => Math.min(...coast.map((c) => map.distanceKm(c, node)));
const hulls = (id: FormationId, cls: Set<PlatformClass>) => {
  let k = 0;
  for (const [pid, n] of Object.entries(world.formations[id]?.equipment ?? {})) if (cls.has(catalog.platform(pid as PlatformId).class)) k += n;
  return k;
};
const ours = () => Object.values(world.formations).filter((f) => f.nation === victim && f.status !== 'destroyed' && (f.kind === 'surface_group' || f.kind === 'submarine')).map((f) => f.id);
const fielded = () => {
  const out: Record<string, number> = {};
  for (const f of Object.values(world.formations)) {
    if (f.nation !== victim || f.status === 'destroyed') continue;
    for (const [pid, n] of Object.entries(f.equipment)) {
      const c = catalog.platform(pid as PlatformId).class;
      out[c] = (out[c] ?? 0) + n;
    }
  }
  return out;
};
const start = fielded();

const rows: Record<string, { fired: number; intercepted: number; hits: number; lost: number; km: number[]; fixAge: number[]; sources: Record<string, number> }> = {};
let subsLost = 0;
const subsBy: Record<string, number> = {};
for (let t = 0; t < (Number(days) * 24) / world.dtHours; t++) {
  const before = new Map(ours().map((id) => {
    const est = estimate(world, striker as NationId, id);
    return [id, { s: hulls(id, SURFACE), u: hulls(id, SUBS), age: est?.ageHours, source: est?.source ?? 'none' }];
  }));
  const events = engine.step(world) as SimEvent[];
  const hitsOn = new Map<FormationId, { key: string; hits: number }[]>();
  for (const e of events) {
    if (e.type !== 'strike' || e.by === victim) continue;
    const h = e.effects.find((x) => x.kind === 'ship_hits');
    if (!h || world.formations[h.formation]?.nation !== victim) continue;
    const key = `${e.by}:${e.munition as MunitionId}`;
    const r = (rows[key] ??= { fired: 0, intercepted: 0, hits: 0, lost: 0, km: [], fixAge: [], sources: {} });
    r.fired += e.fired; r.intercepted += e.intercepted; r.hits += h.hits;
    if (h.hits) (hitsOn.get(h.formation) ?? hitsOn.set(h.formation, []).get(h.formation)!).push({ key, hits: h.hits });
    r.km.push(Math.round(coastKm(e.target)));
    const b = before.get(h.formation);
    r.fixAge.push(b?.age ?? -1);
    r.sources[b?.source ?? 'none'] = (r.sources[b?.source ?? 'none'] ?? 0) + 1;
  }
  for (const [id, b] of before) {
    const ds = b.s - hulls(id, SURFACE), du = b.u - hulls(id, SUBS);
    const hs = hitsOn.get(id) ?? [];
    const total = hs.reduce((a, x) => a + x.hits, 0);
    if (ds > 0) for (const x of hs) rows[x.key].lost += (ds * x.hits) / total;
    if (du > 0) {
      subsLost += du;
      for (const x of hs) subsBy[x.key] = (subsBy[x.key] ?? 0) + (du * x.hits) / total;
      if (!hs.length) subsBy['(unattributed)'] = (subsBy['(unattributed)'] ?? 0) + du;
    }
  }
}
const q = (a: number[], p: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(p * (a.length - 1))] : NaN);
console.log(`${scenario} seed ${seed}: ${victim} surface hulls lost by ${striker}'s weapon (sunk or mission-killed)`);
for (const [k, r] of Object.entries(rows).sort((a, b) => b[1].lost - a[1].lost))
  console.log(`${k.padEnd(22)} fired ${String(r.fired).padStart(5)} intercepted ${String(r.intercepted).padStart(5)} hits ${String(r.hits).padStart(4)} lost ${r.lost.toFixed(1).padStart(5)}  coast km p10/50/90 ${q(r.km, 0.1)}/${q(r.km, 0.5)}/${q(r.km, 0.9)}  fix age h p50/90 ${q(r.fixAge, 0.5)}/${q(r.fixAge, 0.9)} by ${JSON.stringify(r.sources)}`);
console.log(`${victim} submarines lost ${subsLost}; by salvo weapon ${JSON.stringify(subsBy)}`);
const end = fielded();
const lost = (c: string) => Math.max(0, (start[c] ?? 0) - (end[c] ?? 0));
console.log(`${victim} band classes lost: carrier ${lost('carrier')} cruiser+destroyer+frigate ${lost('cruiser') + lost('destroyer') + lost('frigate')} ssn ${lost('ssn')}`);

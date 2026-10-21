/**
 * Lists ORBAT equipment ids the catalog does not know, with unit counts and the
 * closest catalog ids by normalized name. Run: npx tsx scripts/reconcile-ids.ts [--json]
 */
import { loadCatalog } from '../src/data/catalog';
import { loadMap } from '../src/data/load';
import { allOrbat } from '../src/data/orbat';
import { ALIASES } from '../src/data/orbat/aliases';

const catalog = loadCatalog();
const norm = (s: string) => s.toLowerCase().replace(/_(launcher|tel|silo|section|battery|mobile)$/g, '').replace(/[^a-z0-9]/g, '');
const byNorm = new Map<string, string[]>();
for (const id of [...catalog.platforms.keys()]) byNorm.set(norm(id), [...(byNorm.get(norm(id)) ?? []), id]);

const missing = new Map<string, { count: number; nations: Set<string>; munition: boolean }>();
for (const e of allOrbat(loadMap())) {
  for (const [id, n] of Object.entries(e.equipment)) {
    const pid = ALIASES[id] ?? id;
    if (catalog.platforms.has(pid as never)) continue;
    const m = missing.get(id) ?? { count: 0, nations: new Set(), munition: false };
    m.count += n;
    m.nations.add(e.nation);
    missing.set(id, m);
  }
  for (const [id, n] of Object.entries(e.extraMagazine ?? {})) {
    const mid = ALIASES[id] ?? id;
    if (catalog.munitions.has(mid as never)) continue;
    const m = missing.get(id) ?? { count: 0, nations: new Set(), munition: true };
    m.count += n;
    m.nations.add(e.nation);
    missing.set(id, m);
  }
}
const rows = [...missing].sort((a, b) => b[1].count - a[1].count).map(([id, m]) => ({
  id, count: m.count, munition: m.munition, nations: [...m.nations].sort().join(' '),
  exact: byNorm.get(norm(id)) ?? [],
  near: [...catalog.platforms.keys()].filter((c) => { const a = norm(c), b = norm(id); return a !== b && (a.startsWith(b) || b.startsWith(a)) && Math.min(a.length, b.length) >= 3; }).slice(0, 4),
}));
if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 1));
else for (const r of rows) console.log(`${r.id.padEnd(28)} ${String(r.count).padStart(7)} ${r.munition ? 'M' : 'P'} ${r.nations.slice(0, 40).padEnd(40)} exact:${r.exact.join(',')} near:${r.near.join(',')}`);
console.error(`${rows.length} missing ids, ${rows.filter((r) => r.exact.length).length} with an exact normalized match`);

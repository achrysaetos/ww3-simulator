/**
 * Per-nation order-of-battle totals in the merged world, against the IISS headline figures the
 * gate test checks. Usage: npx tsx scripts/orbat-inventory.ts [ISO3,...]
 */
import { createSession } from '../src/scenarios';
import { HEADLINE_FIELDS, IISS_HEADLINES, nationTotals } from '../src/data/orbat/headlines';

const s = createSession('peace-2027', 1);
const only = process.argv[2]?.split(',');
const totals = nationTotals(s.world, s.catalog);
const rows: Record<string, Record<string, string>> = {};
for (const [n, t] of [...totals].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
  if (only && !only.includes(n)) continue;
  const ref = IISS_HEADLINES[n];
  if (!only && !ref) continue;
  const row: Record<string, string> = { formations: String(t.formations) };
  for (const k of HEADLINE_FIELDS) row[k] = ref ? `${t[k]}/${ref[k]}` : String(t[k]);
  rows[n] = row;
}
console.table(rows);

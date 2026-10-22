import type { NationId } from '../core/types';
import type { ItemRace, Outputs, Workaround } from '../outputs';

export function count(x: number): string {
  if (!Number.isFinite(x)) return 'none';
  const a = Math.abs(x);
  if (a >= 1e6) return `${(x / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${Math.round(x / 1e3)}k`;
  return Math.round(x).toLocaleString('en-US');
}

const share = (x: number) => `${Math.round(x * 100)}%`;

function raceLine(r: ItemRace, day: number): string {
  const unit = r.unit === 'tons' ? ' t' : '';
  const parts = [
    r.stock === null ? null : `stock ${count(r.stock)}${unit}`,
    `made ${count(r.producedPerMonth)}${unit}/mo`,
    r.aidPerMonth ? `aid ${r.aidPerMonth > 0 ? '+' : ''}${count(r.aidPerMonth)}${unit}/mo` : null,
    `${r.item === 'shells' ? 'fired' : 'used'} ${count(r.usedPerMonth)}${unit}/mo`,
  ].filter(Boolean);
  const end = r.ranOutDay !== null ? `RAN OUT day ${Math.round(r.ranOutDay)}` : r.zeroDay !== null ? `empty by day ${Math.round(r.zeroDay)} (${Math.round(r.zeroDay - day)} days) at this rate` : r.stock === null ? '' : 'not falling';
  return `    ${r.item.padEnd(13)} ${parts.join(', ')}${end ? `; ${end}` : ''}`;
}

const workaroundLine = (w: Workaround) => `    ${w.id.replace(/_/g, ' ').padEnd(17)} ${w.status.toUpperCase().padEnd(8)} ${w.detail}`;

/**
 * The after-action report: what the war has cost each nation it touched, the production race,
 * and the workarounds keeping cut-off economies going. `nations` orders and filters the report.
 */
export function formatOutputs(o: Outputs, nations: readonly NationId[], name: (n: NationId) => string): string[] {
  const lines = [`WAR COST AND PRODUCTION RACE, day ${Math.round(o.day)}`];
  for (const id of nations) {
    const n = o.nations[id];
    if (!n) continue;
    const h = n.humanitarian;
    lines.push(`  ${name(id)} (${id})`);
    if (h.militaryCasualties + h.civiliansKilled + h.civiliansInjured >= 1)
      lines.push(`    military killed and wounded ${count(h.militaryCasualties)}; civilians killed ${count(h.civiliansKilled)}, injured ${count(h.civiliansInjured)}`);
    if (h.idps + h.refugees + h.underOccupation >= 1)
      lines.push(`    displaced ${count(h.idps)} at home, ${count(h.refugees)} abroad; ${count(h.underOccupation)} under occupation`);
    if (h.hosting >= 1) lines.push(`    shelters ${count(h.hosting)} refugees`);
    if (Math.min(h.infrastructure, h.power, h.food, h.energy, h.fuel) < 0.995)
      lines.push(`    infrastructure ${share(h.infrastructure)} intact, grid ${share(h.power)}; needs met: food ${share(h.food)}, energy ${share(h.energy)}, fuel ${share(h.fuel)}`);
    for (const r of n.race) if (r.producedPerMonth || r.aidPerMonth || r.usedPerMonth || r.ranOutDay !== null) lines.push(raceLine(r, o.day));
    for (const w of n.workarounds) lines.push(workaroundLine(w));
  }
  if (o.hosts.length) lines.push(`  largest refugee hosts: ${o.hosts.map((h) => `${name(h.nation)} ${count(h.refugees)}`).join(', ')}`);
  lines.push('  Casualties count killed and wounded (UK MoD convention); civilian tolls compare with OHCHR verified counts, displacement with UNHCR and IOM.');
  return lines;
}

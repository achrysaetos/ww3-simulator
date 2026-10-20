/**
 * Who goes to war, when and why, and how far each belligerent mobilizes.
 * npx tsx scripts/wars.ts <scenario> <days> [seed]
 */
import type { NationId } from '../src/core/types';
import { createSession } from '../src/scenarios';
import { defenseShare } from '../src/systems/economy';

const [scenario = 'ukraine-2026', days = '90', seed = '1'] = process.argv.slice(2);
const s = createSession(scenario, Number(seed));
const ticks = Math.round((Number(days) * 24) / s.world.dtHours);
const entries: string[] = [];
for (let i = 0; i < ticks; i++) {
  const day = ((s.world.tick + 1) * s.world.dtHours) / 24;
  for (const e of s.engine.step(s.world)) if (e.type === 'war_declared') entries.push(`d${day.toFixed(1)} ${e.by}>${e.on} ${e.reason}`);
}
const belligerents = (Object.keys(s.world.nations) as NationId[]).filter((n) => s.world.nations[n].status === 'war').sort();
const a = s.world.slices.diplomacy.assessment;
console.log(JSON.stringify({
  scenario, days: Number(days), seed: Number(seed), belligerents, entries,
  mobilization: Object.fromEntries(belligerents.map((n) => {
    const nat = s.world.nations[n];
    return [n, { mob: +nat.mobilization.toFixed(3), target: s.world.slices.economy.nations[n]?.mobilizationTarget ?? null, defense: +defenseShare(nat).toFixed(3), popLost: +(a[n]?.popLost ?? 0).toFixed(3), capThreat: a[n]?.capitalThreatened ?? false }];
  })),
}));

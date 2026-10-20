/**
 * Who went to war, when and why: the calibration view behind realism-politics tests.
 * npx tsx tests/realism-politics.lever.ts <scenario> <days> <seed,seed,...>
 */
import { runPolitics } from './realism-politics.fixture';

const [scenario = 'ukraine-2026', days = '30', seeds = '1'] = process.argv.slice(2);
for (const seed of seeds.split(',').map(Number)) {
  const r = runPolitics(scenario, seed, Number(days));
  const first = new Map<string, string>();
  for (const e of r.entries) {
    const k = `${e.by}:${e.reason}`;
    if (!first.has(k)) first.set(k, `${e.by}@${e.day.toFixed(1)}(${e.reason} vs ${e.on})`);
  }
  const pairs = Object.values(r.world.relations).filter((x) => x.atWar).length;
  const nukes = r.nukes.map((n) => `${n.by}@${n.day.toFixed(1)}${n.thresholdCrossed ? '' : '!NO-THRESHOLD'}`);
  console.log(`${scenario} seed ${seed} ${days}d: ${pairs} pairs at war, nukes [${nukes.join(' ')}]`);
  console.log('  ' + [...first.values(), ...r.declined].join('\n  '));
}

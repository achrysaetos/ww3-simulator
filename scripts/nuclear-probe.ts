/**
 * Nuclear release attempts, refusals and releases per nation.
 * npx tsx scripts/nuclear-probe.ts <scenario> <days> <seed...>
 */
import { createSession } from '../src/scenarios';

const [scenario = 'south-asia-2027', days = '60', ...seeds] = process.argv.slice(2);
for (const seed of seeds.length ? seeds : ['1']) {
  const s = createSession(scenario, Number(seed));
  const ticks = Math.round((Number(days) * 24) / s.world.dtHours);
  const tally: Record<string, { attempts: number; refused: Record<string, number>; salvos: number; warheads: number; days: number[] }> = {};
  const get = (n: string) => (tally[n] ??= { attempts: 0, refused: {}, salvos: 0, warheads: 0, days: [] });
  for (let i = 0; i < ticks; i++) {
    const day = +(((s.world.tick + 1) * s.world.dtHours) / 24).toFixed(1);
    for (const c of s.world.pending) if (c.type === 'nuclear_release') { get(c.nation).attempts++; get(c.nation).days.push(day); }
    for (const e of s.engine.step(s.world)) {
      if (e.type === 'message' && e.nation && e.text.startsWith('nuclear release refused')) {
        const t = get(e.nation);
        const why = e.text.replace('nuclear release refused: ', '');
        t.refused[why] = (t.refused[why] ?? 0) + 1;
      }
      if (e.type === 'strike' && e.damage?.includes('nuclear detonations')) {
        const t = get(e.by);
        t.salvos++;
        t.warheads += e.fired;
      }
    }
  }
  for (const t of Object.values(tally)) if (t.days.length > 12) t.days = [...t.days.slice(0, 6), -1, ...t.days.slice(-3)];
  console.log(JSON.stringify({ scenario, seed: Number(seed), days: Number(days), tally }));
}

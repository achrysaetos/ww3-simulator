/** Prints a year of simulated weather at named places, month by month, to check the climate against its sources. Usage: npx tsx scripts/weather-probe.ts [seed] [year] */
import type { World } from '../src/core/types';
import { bringUpToDate, regionOf } from '../src/systems/weather';

const PLACES: [string, number, number][] = [
  ['Kyiv', 50.4, 30.5], ['Kharkiv', 50, 36.2], ['Moscow', 55.7, 37.6], ['Riga', 56.9, 24.1], ['Berlin', 52.5, 13.4],
  ['Delhi', 28.6, 77.2], ['Taiwan Strait', 24.5, 119.5], ['N Atlantic', 57, -20], ['Baltic Sea', 56, 18], ['Tel Aviv', 32, 34.8],
];
const seed = Number(process.argv[2] ?? 1);
const year = process.argv[3] ?? '2026';
const world = { seed, tick: 0, dtHours: 24, startDate: `${year}-01-01T00:00:00Z`, slices: {} } as unknown as World;
const COLS = ['tempC', 'snowCm', 'frozen', 'mud', 'cloud', 'waveM', 'cyclone', 'soilMm'];
const months = Array.from({ length: 12 }, () => new Map<string, number[]>());
for (let d = 0; d < 365; d++) {
  world.tick = d;
  const s = bringUpToDate(world);
  const m = new Date(Date.parse(world.startDate) + d * 86_400_000).getUTCMonth();
  for (const [name, lat, lon] of PLACES) {
    const r = regionOf(lat, lon);
    const row = [s.tempC[r], s.snowMm[r] / 3, s.frozen[r], s.mud[r], s.cloud[r], s.waveM[r], s.cyclone[r], s.soilMm[r]];
    const acc = months[m].get(name);
    if (acc) row.forEach((v, i) => (acc[i] += v));
    else months[m].set(name, row);
  }
}
for (const [name] of PLACES) {
  console.log(`\n${name}: month ${COLS.map((c) => c.padStart(7)).join('')}`);
  months.forEach((mm, i) => {
    const days = new Date(Date.UTC(Number(year), i + 1, 0)).getUTCDate();
    console.log(`  ${String(i + 1).padStart(2)}       ` + mm.get(name)!.map((v) => (v / days).toFixed(2).padStart(7)).join(''));
  });
}

import type { World } from '../../core/types';
import { CLIMATE_LAG_MONTHS, SOOT_LIFE_YEARS, SOOT_RESPONSE } from './tables';

const HOURS_PER_YEAR = 8766;

export function addSoot(world: World, tg: number): void {
  if (tg > 0) world.slices.strategic.sootTg += tg;
}

/** Soot rains out over years; the climate relaxes toward the current soot level over a season. */
export function stepClimate(world: World): void {
  const s = world.slices.strategic;
  const years = world.dtHours / HOURS_PER_YEAR;
  s.climateTg += (s.sootTg - s.climateTg) * (1 - Math.exp(-(years * 12) / CLIMATE_LAG_MONTHS));
  s.sootTg *= Math.exp(-years / SOOT_LIFE_YEARS);
}

function response(world: World, key: 'food' | 'coolingC'): number {
  const tg = world.slices.strategic.climateTg;
  if (tg <= 0) return 0;
  const t = SOOT_RESPONSE;
  let i = 1;
  while (i < t.length - 1 && t[i].tg < tg) i++;
  const a = t[i - 1], b = t[i];
  return a[key] + ((b[key] - a[key]) * (tg - a.tg)) / (b.tg - a.tg);
}

/** Fraction of global food (calorie) output lost to nuclear-winter cooling, 0..0.95. Read by the economy. */
export function globalFoodShock(world: World): number {
  return Math.min(0.95, response(world, 'food'));
}

/** Global-mean surface cooling from stratospheric soot, degrees C. */
export function globalCoolingC(world: World): number {
  return response(world, 'coolingC');
}

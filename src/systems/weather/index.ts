/**
 * Weather and seasons. Once per simulated day the system draws the weather of every 5-degree region
 * around its climatological normal (climate.ts) and carries the ground forward: snow lies and
 * melts, the ground freezes and thaws, and the soil wets and dries. Mud is wet, unfrozen soil, so
 * the rasputitsa arrives with the autumn rains and again when the snow melts onto frozen ground,
 * and a dry autumn shortens it, as no calendar rule would.
 *
 * Sole writer of slices.weather; runs first each tick. The draws hash (seed, region, day) and
 * never touch the shared RNG stream, so adding weather leaves every other system's draws where
 * they were. Readers go through effects.ts. A world run without this system (unit tests of other
 * systems) has no slice, and every effect reads as fair weather.
 */
import type { System } from '../../core/engine';
import { currentDate } from '../../core/engine';
import type { World } from '../../core/types';
import { globalCoolingC } from '../strategic/climate';
import { dayOfYear, nightHours, normalAt, zoneAt } from './climate';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Regions are 5-degree squares: row from the north pole times 72 plus column from 180W. */
const REGION_DEG = 5;
const COLS = 360 / REGION_DEG;
const REGIONS = (180 / REGION_DEG) * COLS;

export const regionOf = (lat: number, lon: number): number =>
  Math.min(180 / REGION_DEG - 1, Math.floor((90 - lat) / REGION_DEG)) * COLS + ((Math.floor((lon + 180) / REGION_DEG) % COLS) + COLS) % COLS;

const regionLat = (r: number) => 90 - (Math.floor(r / COLS) + 0.5) * REGION_DEG;
const regionLon = (r: number) => -180 + ((r % COLS) + 0.5) * REGION_DEG;
const ZONE_OF = Array.from({ length: REGIONS }, (_, r) => zoneAt(regionLat(r), regionLon(r)));

/** Today's weather and ground state, one entry per region. Plain arrays so a save holds them as JSON. */
export interface WeatherState {
  /** Days since 1970-01-01 UTC that the arrays describe. */
  day: number;
  /** Mean temperature today, C. */
  tempC: number[];
  /** Today's departure from normal, C; it persists for days, as a cold spell does. */
  anomalyC: number[];
  precipMm: number[];
  /** Snow on the ground as water equivalent, mm; settled snow lies about 3 mm deep per mm of water. */
  snowMm: number[];
  /** Water in the top metre of soil, mm (SOIL_MM is field capacity). */
  soilMm: number[];
  /** Frost in the ground, degree-days below zero not yet thawed out. */
  frost: number[];
  /** 1 when the surface is frozen hard enough to carry vehicles. */
  frozen: number[];
  /** Share of today under a low overcast, 0..1. */
  cloud: number[];
  windKt: number[];
  waveM: number[];
  /** 1 when a tropical cyclone is over the region today. */
  cyclone: number[];
  /** Mud severity 0..1 on susceptible open ground, before terrain. */
  mud: number[];
}

declare module '../../core/types' {
  interface Slices {
    weather: WeatherState;
  }
}

/** Field capacity of the soil column, mm. */
const SOIL_MM = 150;
/** Frost index above which the ground is frozen hard enough to carry vehicles, degree-days. */
const FROZEN_DEGREE_DAYS = 15;
/** Frost penetrates only so deep: about a metre on the East European plain (degree-days). */
const MAX_FROST = 150;
/** Days of weather run before the start date so snow, frost and soil water start where the season has them. */
const SPIN_UP_DAYS = 150;
const DAY_MS = 86_400_000;
/** Day-to-day persistence of a temperature anomaly: an e-folding time of about four days. */
const PERSIST = 0.78;

function weatherDay(world: World): number {
  return Math.floor(currentDate(world).getTime() / DAY_MS);
}

/** A deterministic draw in [0, 1) per region, day and stream, mixed with the world seed. */
function draw(seed: number, region: number, day: number, stream: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(region + 1, 0xc2b2ae35) ^ Math.imul(day, 0x27d4eb2f) ^ Math.imul(stream + 7, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** A standard normal draw, near enough for weather: the sum of three uniforms (Irwin-Hall), scaled to unit variance. Takes streams `stream` to `stream + 2`. */
function gauss(seed: number, region: number, day: number, stream: number): number {
  return (draw(seed, region, day, stream) + draw(seed, region, day, stream + 1) + draw(seed, region, day, stream + 2) - 1.5) * 2;
}

function emptyState(day: number): WeatherState {
  const zeros = () => new Array<number>(REGIONS).fill(0);
  return {
    day, tempC: zeros(), anomalyC: zeros(), precipMm: zeros(), snowMm: zeros(), soilMm: new Array<number>(REGIONS).fill(SOIL_MM * 0.5),
    frost: zeros(), frozen: zeros(), cloud: zeros(), windKt: zeros(), waveM: zeros(), cyclone: zeros(), mud: zeros(),
  };
}

/** Advance every region by one day, to `day`. */
function advance(s: WeatherState, seed: number, day: number, coolingC: number): void {
  const doy = dayOfYear(new Date(day * DAY_MS));
  const dayLength = Array.from({ length: 180 / REGION_DEG }, (_, row) => 24 - nightHours(regionLat(row * COLS), doy));
  for (let r = 0; r < REGIONS; r++) {
    const lat = regionLat(r);
    const n = normalAt(lat, ZONE_OF[r], doy);
    const anomaly = PERSIST * s.anomalyC[r] + n.tempSdC * Math.sqrt(1 - PERSIST * PERSIST) * gauss(seed, r, day, 0);
    const t = n.tempC + anomaly - coolingC;
    // Wet days are commoner where it rains more; the day's total is exponential about the wet-day mean.
    const pWet = Math.min(0.85, 0.05 + (n.precipMm * 30) / (n.precipMm * 30 + 90));
    const wet = draw(seed, r, day, 3) < pWet;
    const storm = draw(seed, r, day, 4) < n.cyclone;
    let rain = wet ? (n.precipMm / pWet) * -Math.log(1 - draw(seed, r, day, 5)) : 0;
    if (storm) rain += 80;

    // Snow is kept as water equivalent; a degree-day melt of 3 mm per degree above zero.
    let swe = s.snowMm[r], water = 0;
    if (t < 0.5) swe += rain;
    else water += rain;
    if (t > 0 && swe > 0) {
      const melt = Math.min(swe, 3 * t);
      swe -= melt;
      water += melt;
    }
    // Frost works into the ground with degree-days below zero (slower under deep snow, and only so
    // deep) and thaws out from the surface faster. The surface holds vehicles while it is frozen and
    // the air stays below freezing; once the surface thaws over still-frozen subsoil, nothing drains.
    let frost = s.frost[r];
    if (t < 0) frost = Math.min(MAX_FROST, frost - t * (swe > 60 ? 0.4 : 1));
    else frost = Math.max(0, frost - 6 * t);
    const frozen = frost > FROZEN_DEGREE_DAYS && t <= 0.5;
    // Wet days are overcast and dry days clearer, keeping the month's mean at the normal.
    const cloud = storm ? 1 : clamp01(n.cloud + 0.45 * (wet ? 1 - pWet : -pWet) + 0.15 * gauss(seed, r, day, 9));
    // Evaporative demand grows with warmth and day length (a Thornthwaite-style estimate) and falls in a cloudy season.
    const dayLen = dayLength[Math.floor(r / COLS)] / 12;
    const pet = 0.15 * Math.max(0, t) * dayLen * dayLen * (1 - 0.6 * n.cloud);
    let soil = s.soilMm[r] + water;
    if (!frozen) soil -= pet * Math.min(1, soil / SOIL_MM);
    if (frost === 0) soil -= Math.max(0, soil - SOIL_MM) * 0.1;
    soil = Math.max(0, Math.min(SOIL_MM * 1.4, soil));

    const swell = gauss(seed, r, day, 6);
    s.tempC[r] = t;
    s.anomalyC[r] = anomaly;
    s.precipMm[r] = rain;
    s.snowMm[r] = swe;
    s.frost[r] = frost;
    s.frozen[r] = frozen ? 1 : 0;
    s.soilMm[r] = soil;
    s.cloud[r] = cloud;
    s.windKt[r] = storm ? 64 : n.windKt * Math.exp(0.3 * swell);
    s.waveM[r] = storm ? 7 : n.waveM * Math.exp(0.35 * swell);
    s.cyclone[r] = storm ? 1 : 0;
    // Mud: wet, unfrozen soil that the air is too cool or the days too short to dry out.
    s.mud[r] = frozen ? 0 : n.mudSoil * clamp01((soil / SOIL_MM - 0.55) / 0.35) * clamp01(1.2 - pet / 3.5);
  }
  s.day = day;
}

/** Bring the weather to `world`'s current day: one day forward in a running sim, a full spin-up after a jump or at the start. */
export function bringUpToDate(world: World): WeatherState {
  const today = weatherDay(world);
  let s = world.slices.weather;
  if (s && s.day === today) return s;
  const cooling = world.slices.strategic ? globalCoolingC(world) : 0;
  if (s && s.day === today - 1) {
    advance(s, world.seed, today, cooling);
    return s;
  }
  s = world.slices.weather = emptyState(today - SPIN_UP_DAYS);
  for (let d = today - SPIN_UP_DAYS + 1; d <= today; d++) advance(s, world.seed, d, cooling);
  return s;
}

export const weather: System = {
  id: 'weather',
  init(world) {
    bringUpToDate(world);
  },
  step(world) {
    bringUpToDate(world);
  },
};

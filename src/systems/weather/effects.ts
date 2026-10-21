/**
 * What the weather does to operations. The pure functions take today's conditions and return a
 * multiplier in 0..1 (1 = no effect); the `*At` helpers read the conditions at a node from the
 * weather slice for the owning systems' hooks, and return 1 when the world has no weather.
 */
import type { GameMap } from '../../core/map';
import type { Formation, NodeId, Terrain, World } from '../../core/types';
import { dayOfYear, nightHours } from './climate';
import { regionOf } from '.';

/** One node's weather today. */
export interface Conditions {
  sea: boolean;
  tempC: number;
  precipMm: number;
  snowCm: number;
  frozen: boolean;
  /** Mud severity on this cell's ground, 0..1. */
  mud: number;
  cloud: number;
  windKt: number;
  waveM: number;
  cyclone: boolean;
  nightHours: number;
}

/**
 * How much of a cell's open ground turns to mud when the soil is saturated: farmland and steppe
 * fully, forest floors and hills less, rock, sand and paved towns hardly at all. Judgment.
 */
const MUD_SUSCEPTIBILITY: Record<Terrain, number> = { plain: 1, marsh: 1, forest: 0.8, jungle: 0.8, hills: 0.6, arctic: 0.5, mountain: 0.3, desert: 0.1, urban: 0.15 };
/** Mean temperature offset of high ground from its region, C: about 6.5 C per km of lapse rate over a cell's typical height. */
const ELEVATION_C: Partial<Record<Terrain, number>> = { mountain: -6, hills: -2.5 };
/** Settled snow lies about 3 mm deep per mm of water equivalent. */
const SNOW_DEPTH_PER_MM = 0.3;
/** Rail and road km in a cell that counts as a full road net (as RAIL_KM_FULL in land/tables.ts). */
const ROAD_KM_FULL = 300;
/** Share of a formation's movement that keeps to roads even where the net is dense: tactical moves go cross-country. */
const MAX_ROAD_SHARE = 0.5;

export function conditionsAt(world: World, map: GameMap, node: NodeId): Conditions | undefined {
  const s = world.slices.weather;
  if (!s) return undefined;
  const lat = map.lat[node], r = regionOf(lat, map.lon[node]);
  const sea = map.isSea(node);
  const terrain = map.terrain[node];
  return {
    sea,
    tempC: s.tempC[r] + (sea ? 0 : (ELEVATION_C[terrain] ?? 0)),
    precipMm: s.precipMm[r],
    snowCm: sea ? 0 : s.snowMm[r] * SNOW_DEPTH_PER_MM,
    frozen: !sea && s.frozen[r] === 1,
    mud: sea ? 0 : s.mud[r] * MUD_SUSCEPTIBILITY[terrain],
    cloud: s.cloud[r],
    windKt: s.windKt[r],
    waveM: s.waveM[r],
    cyclone: s.cyclone[r] === 1,
    nightHours: nightHours(lat, dayOfYear(new Date(s.day * 86_400_000))),
  };
}

// ---------------------------------------------------------------- ground

/**
 * Speed multiplier for ground movement, on roads and across country. Mud: in October 1941 Army
 * Group Centre's advance fell from 20-30 km a day to a few once the autumn rains set in, and wheeled
 * supply stopped off the paved roads (US Army DA Pam 20-290, "Terrain Factors in the Russian
 * Campaign", 1951; DA Pam 20-291, "Effects of Climate on Combat in European Russia", 1952; Glantz,
 * "When Titans Clashed"). In March 2022 Russian columns north of Kyiv were bound to the roads by
 * mud, and in spring 2023 both sides waited out the rasputitsa (RUSI, "Preliminary Military
 * Lessons", 2022; ISW, 2023). Snow: up to ~15 cm hardly slows tracked vehicles; at 70 cm and more
 * cross-country movement roughly halves and roads need clearing (DA Pam 20-291).
 */
export function groundFactor(c: Pick<Conditions, 'mud' | 'snowCm'>, roadShare: number): number {
  const snowCross = c.snowCm <= 15 ? 1 : Math.max(0.45, 1 - (c.snowCm - 15) / 100);
  const snowRoad = 1 - 0.3 * Math.min(1, c.snowCm / 60);
  const cross = (1 - 0.7 * c.mud) * snowCross;
  const road = (1 - 0.25 * c.mud) * snowRoad;
  return roadShare * road + (1 - roadShare) * cross;
}

/** Ground movement multiplier at a land node today, the cell's road net weighed against its open ground. */
export function groundFactorAt(world: World, map: GameMap, node: NodeId): number {
  const s = world.slices.weather;
  if (!s || map.isSea(node)) return 1;
  const r = regionOf(map.lat[node], map.lon[node]);
  const mud = s.mud[r] * MUD_SUSCEPTIBILITY[map.terrain[node]];
  const snowCm = s.snowMm[r] * SNOW_DEPTH_PER_MM;
  if (mud === 0 && snowCm <= 15) return 1;
  return groundFactor({ mud, snowCm }, MAX_ROAD_SHARE * Math.min(1, map.railKm[node] / ROAD_KM_FULL));
}

// ---------------------------------------------------------------- air

/**
 * Share of planned sorties that fly from a base under today's weather. Low ceilings and rain cancel
 * and abort sorties: weather cancelled roughly 15% of attack sorties in Desert Storm's first ten
 * days, the worst Gulf weather in 14 years (Gulf War Air Power Survey, 1993), and NATO had good
 * weather on only about a third of Allied Force's 78 days (DoD, "Kosovo/Operation Allied Force
 * After-Action Report", 2000). A fully overcast day costs 40% here. Crosswinds past ~30 kt close
 * runways; at sea, deck motion stops carrier flight operations as seas pass ~4 m (sea state 6).
 */
export function airSortieFactor(c: Pick<Conditions, 'cloud' | 'windKt' | 'waveM' | 'cyclone'>, atSea: boolean): number {
  if (c.cyclone) return 0.1;
  const ceiling = 1 - 0.4 * c.cloud * c.cloud;
  const wind = c.windKt <= 30 ? 1 : Math.max(0.3, 1 - (c.windKt - 30) / 40);
  return ceiling * wind * (atSea ? carrierFactor(c.waveM) : 1);
}

/** Carrier flight operations against significant wave height: full to 3.5 m, 15% by 6.5 m. */
export function carrierFactor(waveM: number): number {
  return waveM <= 3.5 ? 1 : Math.max(0.15, 1 - (0.85 * (waveM - 3.5)) / 3);
}

/**
 * Effectiveness of precision-guided weapons under cloud: laser- and electro-optically guided
 * bombs need the target in sight and lost about half their missions to cloud in Desert Storm and
 * Allied Force (GWAPS; Allied Force AAR), while GPS/INS weapons (JDAM) are unaffected. A mixed
 * modern load loses up to 30%.
 */
export function pgmFactor(c: Pick<Conditions, 'cloud'>): number {
  return 1 - 0.3 * c.cloud;
}

/** Sortie multiplier for an air wing based at `node`. */
export function sortieFactorAt(world: World, map: GameMap, node: NodeId): number {
  const s = world.slices.weather;
  if (!s) return 1;
  const r = regionOf(map.lat[node], map.lon[node]);
  return airSortieFactor({ cloud: s.cloud[r], windKt: s.windKt[r], waveM: s.waveM[r], cyclone: s.cyclone[r] === 1 }, map.isSea(node));
}

// ---------------------------------------------------------------- sea

/**
 * Amphibious landing against significant wave height. Landing craft, amphibious armour and
 * beached ro-ro ferries work to sea state 3 (1.25 m) and stop by sea state 5 (2.5-4 m): off
 * Omaha in 1944, 27 of 32 DD tanks launched into ~1.5-2 m seas foundered. The Taiwan Strait's
 * northeast monsoon keeps mean seas above 2 m from November to March (ERA5), so a crossing waits
 * for April or October (CSIS 2023).
 */
export function amphibiousFactor(c: Pick<Conditions, 'waveM' | 'cyclone'>): number {
  if (c.cyclone) return 0;
  return c.waveM <= 1.25 ? 1 : Math.max(0, 1 - (c.waveM - 1.25) / 1.5);
}

/** Small boats and USVs (Magura V5, Sea Baby, fast attack craft) against wave height: full to 1 m, nothing past 2.5 m. */
export function smallCraftFactor(c: Pick<Conditions, 'waveM' | 'cyclone'>): number {
  if (c.cyclone) return 0;
  return c.waveM <= 1 ? 1 : Math.max(0, 1 - (c.waveM - 1) / 1.5);
}

export function amphibiousFactorAt(world: World, map: GameMap, node: NodeId): number {
  const s = world.slices.weather;
  const r = regionOf(map.lat[node], map.lon[node]);
  return s ? amphibiousFactor({ waveM: s.waveM[r], cyclone: s.cyclone[r] === 1 }) : 1;
}

export function smallCraftFactorAt(world: World, map: GameMap, node: NodeId): number {
  const s = world.slices.weather;
  const r = regionOf(map.lat[node], map.lon[node]);
  return s ? smallCraftFactor({ waveM: s.waveM[r], cyclone: s.cyclone[r] === 1 }) : 1;
}

// ---------------------------------------------------------------- exposure

/**
 * Non-battle losses from cold and heat, share of personnel per day in the field. Cold: the German
 * army in the east took ~228,000 frostbite casualties in the winter of 1941-42, about 0.06% of its
 * strength a day at -15 to -30 C without winter clothing (DA Pam 20-291); an equipped modern army
 * loses a fraction of that, 0.02% a day per 10 C below -10. Heat: heat injuries rise with daily
 * means above 32 C, 0.01% a day per 5 C. Estimates.
 */
export function exposureRate(tempC: number): number {
  if (tempC < -10) return 0.0002 * Math.min(3, (-10 - tempC) / 10);
  if (tempC > 32) return 0.0001 * Math.min(3, (tempC - 32) / 5);
  return 0;
}

/**
 * Personnel a land formation loses to exposure this tick. Troops in their home garrison have
 * shelter. The fractional part is settled by a draw hashed from formation and tick, so the shared
 * RNG stream does not move.
 */
export function exposureLosses(world: World, map: GameMap, f: Formation): number {
  const s = world.slices.weather;
  if (!s || f.node === f.home || f.personnel <= 0) return 0;
  const tempC = s.tempC[regionOf(map.lat[f.node], map.lon[f.node])] + (ELEVATION_C[map.terrain[f.node]] ?? 0);
  const expected = f.personnel * exposureRate(tempC) * (world.dtHours / 24);
  if (expected <= 0) return 0;
  return Math.min(f.personnel, Math.floor(expected) + (hash(f.id, world.tick ^ world.seed) < expected % 1 ? 1 : 0));
}

function hash(s: string, n: number): number {
  let h = 2166136261 ^ n;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- map layer

/** Layer codes for the map: the integer part is the kind, the fraction its severity. */
export const LAYER = { mud: 1, snow: 2, roughSea: 3, cyclone: 4 } as const;

/**
 * Flat (node, code) pairs for nodes where the weather matters to operations today: mud past 0.3,
 * snow past 15 cm, seas too rough for landing craft (past 2 m), and tropical cyclones.
 */
export function weatherLayer(world: World, map: GameMap): Float32Array {
  const s = world.slices.weather;
  if (!s) return new Float32Array(0);
  const out: number[] = [];
  for (let n = 0 as NodeId; n < map.size; n++) {
    const r = regionOf(map.lat[n], map.lon[n]);
    if (s.cyclone[r] === 1) out.push(n, LAYER.cyclone);
    else if (map.isSea(n)) {
      if (s.waveM[r] > 2) out.push(n, LAYER.roughSea + Math.min(0.99, (s.waveM[r] - 2) / 4));
    } else {
      const mud = s.mud[r] * MUD_SUSCEPTIBILITY[map.terrain[n]], snowCm = s.snowMm[r] * SNOW_DEPTH_PER_MM;
      if (mud > 0.3) out.push(n, LAYER.mud + Math.min(0.99, mud));
      else if (snowCm > 15) out.push(n, LAYER.snow + Math.min(0.99, snowCm / 100));
    }
  }
  return Float32Array.from(out);
}

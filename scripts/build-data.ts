/**
 * Builds src/data/generated/*.json from open data:
 *  - Natural Earth country polygons (world-atlas npm package, public domain)
 *  - Natural Earth geography regions, populated places, ports, airports, railroads (public domain)
 *  - World Bank World Development Indicators API (CC BY 4.0)
 *
 * Run: npm run data   (downloads are cached in .cache/)
 */
import fs from 'node:fs';
import path from 'node:path';
import { feature } from 'topojson-client';
import { geoContains, geoBounds, geoCentroid, geoArea } from 'd3-geo';
import isoCountries from 'i18n-iso-countries';
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from 'geojson';
import { MANUAL_STATS, SOVEREIGN_OF } from './manual-stats';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, '.cache');
const OUT = path.join(ROOT, 'src/data/generated');
fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const NE_BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';

async function cached(name: string, url: string): Promise<string> {
  const file = path.join(CACHE, name);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return fs.readFileSync(file, 'utf8');
  console.log('fetching', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const text = await res.text();
  fs.writeFileSync(file, text);
  return text;
}

async function naturalEarth(name: string): Promise<FeatureCollection> {
  return JSON.parse(await cached(`${name}.geojson`, `${NE_BASE}${name}.geojson`));
}

const WB_INDICATORS = {
  gdp: 'NY.GDP.MKTP.CD',
  gdpPpp: 'NY.GDP.MKTP.PP.CD',
  population: 'SP.POP.TOTL',
  milexPctGdp: 'MS.MIL.XPND.GD.ZS',
  milexUsd: 'MS.MIL.XPND.CD',
  armedForces: 'MS.MIL.TOTL.P1',
  manufacturing: 'NV.IND.MANF.CD',
  exportsPctGdp: 'NE.EXP.GNFS.ZS',
  importsPctGdp: 'NE.IMP.GNFS.ZS',
  energyImportPct: 'EG.IMP.CONS.ZS',
  oilRentsPct: 'NY.GDP.PETR.RT.ZS',
  gasRentsPct: 'NY.GDP.NGAS.RT.ZS',
  foodImportPct: 'TM.VAL.FOOD.ZS.UN',
  urbanPct: 'SP.URB.TOTL.IN.ZS',
  workingAgePct: 'SP.POP.1564.TO.ZS',
  govDebtPctGdp: 'GC.DOD.TOTL.GD.ZS',
  railKm: 'IS.RRS.TOTL.KM',
  highTechExportsUsd: 'TX.VAL.TECH.CD',
} as const;
type StatKey = keyof typeof WB_INDICATORS;

async function worldBank(): Promise<Map<string, Partial<Record<StatKey, number>>>> {
  const out = new Map<string, Partial<Record<StatKey, number>>>();
  for (const [key, code] of Object.entries(WB_INDICATORS) as [StatKey, string][]) {
    const text = await cached(
      `wb_${code}.json`,
      `https://api.worldbank.org/v2/country/all/indicator/${code}?format=json&date=2012:2025&per_page=20000`,
    );
    const [, rows] = JSON.parse(text) as [unknown, { countryiso3code: string; date: string; value: number | null }[]];
    const latestYear = new Map<string, number>();
    for (const r of rows ?? []) {
      if (r.value == null || !r.countryiso3code) continue;
      const y = Number(r.date);
      if ((latestYear.get(r.countryiso3code) ?? 0) >= y) continue;
      latestYear.set(r.countryiso3code, y);
      const rec = out.get(r.countryiso3code) ?? {};
      rec[key] = r.value;
      out.set(r.countryiso3code, rec);
    }
  }
  return out;
}

// ---------- terrain ----------
export const TERRAIN = ['plain', 'forest', 'jungle', 'hills', 'mountain', 'desert', 'marsh', 'arctic', 'urban'] as const;
type Terrain = (typeof TERRAIN)[number];

const JUNGLE_BOXES: [number, number, number, number][] = [
  // [latMin, latMax, lonMin, lonMax]
  [-15, 6, -78, -47], // Amazon
  [-6, 6, 10, 31], // Congo basin
  [-9, 7, 95, 120], // Sumatra / Borneo / Malaya
  [-10, -1, 130, 151], // New Guinea
  [8, 22, 92, 110], // Indochina
  [5, 12, -84, -76], // Darien / Central America
];
const BOREAL_BOXES: [number, number, number, number][] = [
  [50, 66, 25, 180], // Russian taiga
  [48, 66, -170, -52], // Canadian boreal
  [58, 70, 5, 32], // Scandinavia / Finland
];
const inBoxes = (lat: number, lon: number, boxes: [number, number, number, number][]) =>
  boxes.some(([a, b, c, d]) => lat >= a && lat <= b && lon >= c && lon <= d);

// ---------- main ----------
async function main() {
  const topo = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/world-atlas/countries-50m.json'), 'utf8'));
  const countries = feature(topo, topo.objects.countries) as unknown as FeatureCollection<Polygon | MultiPolygon, { name: string }>;
  const wb = await worldBank();
  const regions = await naturalEarth('ne_50m_geography_regions_polys');
  const places = await naturalEarth('ne_50m_populated_places_simple');
  const ports = await naturalEarth('ne_10m_ports');
  const airports = await naturalEarth('ne_10m_airports');
  const rail = await naturalEarth('ne_10m_railroads');

  const NAME_FALLBACK: Record<string, string> = {
    Somaliland: 'SOM', Kosovo: 'XKX', 'N. Cyprus': 'CYP', 'Indian Ocean Ter.': 'AUS', 'Siachen Glacier': 'IND',
  };
  // Resolve each polygon to the sovereign nation that would field its forces.
  type Poly = { f: Feature<Polygon | MultiPolygon>; iso3: string; bounds: [[number, number], [number, number]] };
  const polys: Poly[] = [];
  for (const f of countries.features) {
    let iso3 = f.id ? isoCountries.numericToAlpha3(String(f.id)) : NAME_FALLBACK[f.properties.name];
    if (!iso3) iso3 = NAME_FALLBACK[f.properties.name];
    if (!iso3) { console.warn('unmapped polygon', f.id, f.properties.name); continue; }
    iso3 = SOVEREIGN_OF[iso3] ?? iso3;
    if (f.properties.name === 'Antarctica' || iso3 === 'ATA') continue;
    polys.push({ f, iso3, bounds: geoBounds(f) as Poly['bounds'] });
  }

  // 1-degree land grid, row 0 = lat 89.5, col 0 = lon -179.5
  const RES = 1;
  const ROWS = 180 / RES, COLS = 360 / RES;
  const cellOwner = new Map<number, string>();
  const samples = [[0, 0], [-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]];
  for (let r = 0; r < ROWS; r++) {
    const lat = 90 - (r + 0.5) * RES;
    if (lat < -56) continue; // no Antarctica
    for (let c = 0; c < COLS; c++) {
      const lon = -180 + (c + 0.5) * RES;
      const votes = new Map<string, number>();
      for (const [dy, dx] of samples) {
        const p: [number, number] = [lon + dx * RES, lat + dy * RES];
        for (const poly of polys) {
          const [[w, s], [e, n]] = poly.bounds;
          if (p[1] < s || p[1] > n) continue;
          if (w <= e ? p[0] < w || p[0] > e : p[0] < w && p[0] > e) continue;
          if (geoContains(poly.f, p)) { votes.set(poly.iso3, (votes.get(poly.iso3) ?? 0) + 1); break; }
        }
      }
      let best: string | undefined, bestV = 0;
      for (const [k, v] of votes) if (v > bestV) { best = k; bestV = v; }
      if (best && bestV >= 2) cellOwner.set(r * COLS + c, best);
    }
  }
  // Small states get the cell holding their centroid if it is sea, or if they
  // are strategically relevant enough to displace a larger neighbour's cell.
  const MAY_DISPLACE = new Set(['SGP', 'BHR', 'QAT', 'LUX', 'MLT', 'BRN', 'DJI', 'PSE', 'LBN']);
  const owned = new Set(cellOwner.values());
  for (const poly of polys) {
    if (owned.has(poly.iso3)) continue;
    const [lon, lat] = geoCentroid(poly.f);
    const id = Math.floor((90 - lat) / RES) * COLS + Math.floor((lon + 180) / RES);
    if (cellOwner.has(id) && !MAY_DISPLACE.has(poly.iso3)) continue;
    cellOwner.set(id, poly.iso3);
    owned.add(poly.iso3);
  }
  // Islands too small to win a cell's majority vote still host bases that matter
  // (Guam, Okinawa, Oahu, Rhodes, the Canaries), so every island part above
  // ISLAND_MIN_KM2 claims its centroid cell when that cell is still open water.
  const ISLAND_MIN_KM2 = 200;
  const EARTH_KM2 = 4 * Math.PI * 6371 ** 2;
  let islands = 0;
  for (const poly of polys) {
    const parts = poly.f.geometry.type === 'MultiPolygon' ? poly.f.geometry.coordinates : [poly.f.geometry.coordinates];
    for (const coordinates of parts) {
      const part: Feature<Polygon> = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates } };
      if ((geoArea(part) / (4 * Math.PI)) * EARTH_KM2 < ISLAND_MIN_KM2) continue;
      const [lon, lat] = geoCentroid(part);
      if (lat < -56) continue;
      const id = Math.floor((90 - lat) / RES) * COLS + Math.floor((lon + 180) / RES);
      if (cellOwner.has(id)) continue;
      cellOwner.set(id, poly.iso3);
      islands++;
    }
  }
  console.log('land cells', cellOwner.size, 'nations with territory', owned.size, 'island cells added', islands);

  const cellIds = [...cellOwner.keys()].sort((a, b) => a - b);
  const indexOf = new Map(cellIds.map((id, i) => [id, i]));
  const latOf = (id: number) => 90 - (Math.floor(id / COLS) + 0.5) * RES;
  const lonOf = (id: number) => -180 + ((id % COLS) + 0.5) * RES;
  const cellAt = (lat: number, lon: number) => {
    const r = Math.floor((90 - lat) / RES), c = Math.floor((((lon + 180) % 360) + 360) % 360 / RES);
    return r * COLS + c;
  };

  // terrain
  const terrain = new Map<number, Terrain>();
  const regionClass: Record<string, Terrain> = {
    'Range/mtn': 'mountain', Desert: 'desert', Tundra: 'arctic', Plateau: 'hills', Foothills: 'hills',
    Wetlands: 'marsh', Delta: 'marsh',
  };
  const regionPolys = regions.features
    .filter((f) => regionClass[(f.properties as any).FEATURECLA])
    .map((f) => ({ f, t: regionClass[(f.properties as any).FEATURECLA], b: geoBounds(f as any) }));
  // smaller regions (e.g. a range inside a plateau) take precedence
  regionPolys.sort((a, b) => geoArea(b.f as any) - geoArea(a.f as any));
  for (const id of cellIds) {
    const lat = latOf(id), lon = lonOf(id);
    let t: Terrain = 'plain';
    if (inBoxes(lat, lon, JUNGLE_BOXES)) t = 'jungle';
    else if (inBoxes(lat, lon, BOREAL_BOXES)) t = 'forest';
    for (const rp of regionPolys) {
      const [[w, s], [e, n]] = rp.b;
      if (lat < s || lat > n || lon < w || lon > e) continue;
      if (geoContains(rp.f as any, [lon, lat])) t = rp.t;
    }
    if (Math.abs(lat) > 66) t = 'arctic';
    terrain.set(id, t);
  }

  // cities
  type City = { name: string; iso3: string; lat: number; lon: number; pop: number; capital: boolean };
  const cities: City[] = [];
  for (const f of places.features) {
    const p = f.properties as any;
    const id = cellAt(p.latitude, p.longitude);
    const owner = cellOwner.get(id);
    if (!owner) continue;
    cities.push({ name: p.nameascii ?? p.name, iso3: owner, lat: p.latitude, lon: p.longitude, pop: p.pop_max ?? 0, capital: p.adm0cap === 1 });
  }
  const cityPopByCell = new Map<number, number>();
  for (const c of cities) {
    const id = cellAt(c.lat, c.lon);
    cityPopByCell.set(id, (cityPopByCell.get(id) ?? 0) + c.pop);
    if (c.pop >= 1_000_000) terrain.set(id, 'urban');
  }

  const countPoints = (fc: FeatureCollection) => {
    const m = new Map<number, number>();
    for (const f of fc.features) {
      if (f.geometry.type !== 'Point') continue;
      const [lon, lat] = f.geometry.coordinates;
      const id = cellAt(lat, lon);
      if (cellOwner.has(id)) m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  };
  const portCount = countPoints(ports);
  const airCount = countPoints(airports);

  // rail km per cell (approximate: segment length attributed to the cell of its midpoint)
  const railKm = new Map<number, number>();
  const hav = (a: number[], b: number[]) => {
    const R = 6371, toR = Math.PI / 180;
    const dLat = (b[1] - a[1]) * toR, dLon = (b[0] - a[0]) * toR;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toR) * Math.cos(b[1] * toR) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  for (const f of rail.features) {
    const g = f.geometry as Geometry;
    const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    for (const line of lines)
      for (let i = 1; i < line.length; i++) {
        const id = cellAt((line[i - 1][1] + line[i][1]) / 2, (line[i - 1][0] + line[i][0]) / 2);
        if (cellOwner.has(id)) railKm.set(id, (railKm.get(id) ?? 0) + hav(line[i - 1], line[i]));
      }
  }

  // sea zones: 3-degree ocean grid, only zones with no land-majority
  const SZ = 3, SROWS = 180 / SZ, SCOLS = 360 / SZ;
  const isLand = (lat: number, lon: number) => cellOwner.has(cellAt(lat, lon));
  const seaZones: { id: number; lat: number; lon: number }[] = [];
  const seaIndex = new Map<number, number>();
  for (let r = 0; r < SROWS; r++) {
    const lat = 90 - (r + 0.5) * SZ;
    if (lat < -66 || lat > 82) continue;
    for (let c = 0; c < SCOLS; c++) {
      const lon = -180 + (c + 0.5) * SZ;
      let water = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!isLand(lat + dy, lon + dx)) water++;
      if (water >= 2) { seaIndex.set(r * SCOLS + c, seaZones.length); seaZones.push({ id: r * SCOLS + c, lat, lon }); }
    }
  }
  const seaZoneAt = (lat: number, lon: number) => {
    const r = Math.floor((90 - lat) / SZ), c = Math.floor((((lon + 180) % 360) + 360) % 360 / SZ);
    return seaIndex.get(r * SCOLS + c) ?? -1;
  };
  const seaNeighbors: number[][] = seaZones.map((z) => {
    const r = Math.floor(z.id / SCOLS), c = z.id % SCOLS, out: number[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dy && !dx) continue;
      const rr = r + dy, cc = (c + dx + SCOLS) % SCOLS;
      const j = seaIndex.get(rr * SCOLS + cc);
      if (j !== undefined) out.push(j);
    }
    return out;
  });
  // coastal land cells -> adjacent sea zone
  const coastZone = new Map<number, number>();
  for (const id of cellIds) {
    const lat = latOf(id), lon = lonOf(id);
    for (let dy = -1; dy <= 1 && !coastZone.has(id); dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!isLand(lat + dy, lon + dx)) {
        const z = seaZoneAt(lat + dy, lon + dx);
        if (z >= 0) { coastZone.set(id, z); break; }
      }
    }
  }

  // nations
  const iso3s = [...owned].sort();
  const cellCountBy = new Map<string, number>();
  for (const o of cellOwner.values()) cellCountBy.set(o, (cellCountBy.get(o) ?? 0) + 1);

  const nations = iso3s.map((iso3) => {
    const stats = { ...(wb.get(iso3) ?? {}), ...(MANUAL_STATS[iso3] ?? {}) } as Partial<Record<StatKey, number>>;
    const name = MANUAL_STATS[iso3]?.name ?? isoCountries.getName(iso3, 'en', { select: 'alias' }) ?? iso3;
    const capital = cities.filter((c) => c.iso3 === iso3 && c.capital).sort((a, b) => b.pop - a.pop)[0]
      ?? cities.filter((c) => c.iso3 === iso3).sort((a, b) => b.pop - a.pop)[0];
    return { iso3, name, stats, capital: capital ? { name: capital.name, cell: indexOf.get(cellAt(capital.lat, capital.lon)) ?? -1 } : null };
  });
  const nationIndex = new Map(iso3s.map((n, i) => [n, i]));
  for (const n of nations) {
    if (!n.stats.population) console.warn('no population for', n.iso3, n.name);
    if (!n.stats.gdp) console.warn('no gdp for', n.iso3, n.name);
    if (!n.capital || n.capital.cell < 0) {
      const any = cellIds.findIndex((id) => cellOwner.get(id) === n.iso3);
      n.capital = { name: n.name, cell: any };
    }
  }

  // population/industry weights per cell
  const habit: Record<Terrain, number> = { plain: 1, forest: 0.4, jungle: 0.35, hills: 0.6, mountain: 0.2, desert: 0.08, marsh: 0.4, arctic: 0.02, urban: 3 };
  const weightBy = new Map<string, number>();
  const rawW = cellIds.map((id) => {
    const w = habit[terrain.get(id)!] + (cityPopByCell.get(id) ?? 0) / 250_000 + (railKm.get(id) ?? 0) / 400;
    const o = cellOwner.get(id)!;
    weightBy.set(o, (weightBy.get(o) ?? 0) + w);
    return w;
  });

  const cells = {
    res: RES,
    cols: COLS,
    id: cellIds,
    owner: cellIds.map((id) => nationIndex.get(cellOwner.get(id)!)!),
    terrain: cellIds.map((id) => TERRAIN.indexOf(terrain.get(id)!)),
    popShare: cellIds.map((id, i) => +(rawW[i] / weightBy.get(cellOwner.get(id)!)!).toFixed(5)),
    railKm: cellIds.map((id) => Math.round(railKm.get(id) ?? 0)),
    ports: cellIds.map((id) => portCount.get(id) ?? 0),
    airports: cellIds.map((id) => airCount.get(id) ?? 0),
    coastZone: cellIds.map((id) => coastZone.get(id) ?? -1),
  };

  const bigCities = cities
    .filter((c) => c.pop >= 300_000 || c.capital)
    .map((c) => ({ name: c.name, nation: nationIndex.get(c.iso3)!, cell: indexOf.get(cellAt(c.lat, c.lon)) ?? -1, pop: c.pop, capital: c.capital, lat: +c.lat.toFixed(2), lon: +c.lon.toFixed(2) }))
    .filter((c) => c.cell >= 0);

  const world = {
    generated: new Date().toISOString().slice(0, 10),
    sources: [
      'Natural Earth (public domain) via world-atlas and nvkelso/natural-earth-vector',
      'World Bank World Development Indicators (CC BY 4.0)',
    ],
    terrainTypes: TERRAIN,
    nations,
    cells,
    cities: bigCities,
    sea: {
      res: SZ,
      lat: seaZones.map((z) => z.lat),
      lon: seaZones.map((z) => z.lon),
      neighbors: seaNeighbors,
    },
  };
  fs.writeFileSync(path.join(OUT, 'world.json'), JSON.stringify(world));
  console.log('wrote world.json', (fs.statSync(path.join(OUT, 'world.json')).size / 1e6).toFixed(2), 'MB;',
    nations.length, 'nations,', cellIds.length, 'cells,', seaZones.length, 'sea zones,', bigCities.length, 'cities');
}

main().catch((e) => { console.error(e); process.exit(1); });

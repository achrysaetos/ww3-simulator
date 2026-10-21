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
import type { FeatureCollection, Geometry, MultiPolygon, Polygon } from 'geojson';
import { MANUAL_STATS, SOVEREIGN_OF } from './manual-stats';
import { LandLabels, Raster } from './land-grid';
import { SquareIndex, squareKey } from '../src/core/map';

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

// ---------- map refinements ----------
/**
 * Squares drawn finer than 1 degree, as [south, north, west, east] in whole degrees and cells per degree.
 * At 1 degree Taiwan was four cells with Taipei at sea; at 1/4 degree its coast, the Taipei basin, Taoyuan,
 * Taichung, Tainan, Kaohsiung, Hualien and Taitung each have a cell. At 1 degree Kerch and Taman share a
 * square, which would carry armies across the strait inside one cell, Sevastopol is at sea, and Baltiysk,
 * the Baltic Fleet's base, is Polish.
 */
const REFINE: { name: string; box: [number, number, number, number]; k: number }[] = [
  { name: 'Taiwan and Penghu', box: [21, 25, 119, 122], k: 4 },
  { name: 'northern Taiwan', box: [25, 26, 120, 122], k: 4 },
  { name: 'Crimea and the Kerch Strait', box: [44, 46, 32, 37], k: 2 },
  { name: 'Kaliningrad', box: [54, 56, 19, 23], k: 2 },
];

/**
 * Ports and airfields Natural Earth's 1:10m layers omit, on the islands and coasts the war turns on
 * (DoD Base Structure Report FY2023; ROC Ministry of National Defense; Japan Ministry of Defense).
 */
const EXTRA_FACILITIES: { name: string; kind: 'port' | 'airport'; lat: number; lon: number }[] = [
  { name: 'Taipei Songshan', kind: 'airport', lat: 25.07, lon: 121.55 },
  { name: 'Hsinchu Air Base', kind: 'airport', lat: 24.82, lon: 120.94 },
  { name: 'Chiayi Air Base', kind: 'airport', lat: 23.46, lon: 120.39 },
  { name: 'Pingtung Air Base', kind: 'airport', lat: 22.7, lon: 120.48 },
  { name: 'Hualien Air Base', kind: 'airport', lat: 24.02, lon: 121.62 },
  { name: 'Chihhang Air Base, Taitung', kind: 'airport', lat: 22.79, lon: 121.18 },
  { name: 'Hualien harbour', kind: 'port', lat: 23.98, lon: 121.63 },
  { name: 'Su-ao naval base', kind: 'port', lat: 24.59, lon: 121.87 },
  { name: 'Zuoying naval base', kind: 'port', lat: 22.69, lon: 120.27 },
  { name: 'Magong Air Base, Penghu', kind: 'airport', lat: 23.57, lon: 119.63 },
  { name: 'Magong harbour, Penghu', kind: 'port', lat: 23.56, lon: 119.57 },
  { name: 'Kinmen Shangyi airport', kind: 'airport', lat: 24.43, lon: 118.36 },
  { name: 'Liaoluo harbour, Kinmen', kind: 'port', lat: 24.41, lon: 118.43 },
  { name: 'Matsu Nangan airport', kind: 'airport', lat: 26.16, lon: 119.96 },
  { name: 'Fuao harbour, Matsu', kind: 'port', lat: 26.16, lon: 119.94 },
  { name: 'Kadena Air Base', kind: 'airport', lat: 26.36, lon: 127.77 },
  { name: 'Naha airport', kind: 'airport', lat: 26.2, lon: 127.65 },
  { name: 'Naha military port', kind: 'port', lat: 26.21, lon: 127.67 },
  { name: 'White Beach naval facility', kind: 'port', lat: 26.3, lon: 127.9 },
  { name: 'Andersen Air Force Base', kind: 'airport', lat: 13.58, lon: 144.93 },
  { name: 'Apra Harbor naval base', kind: 'port', lat: 13.44, lon: 144.65 },
  { name: 'Diego Garcia airfield', kind: 'airport', lat: -7.31, lon: 72.41 },
  { name: 'Diego Garcia naval support facility', kind: 'port', lat: -7.29, lon: 72.4 },
  { name: 'Baltiysk naval base', kind: 'port', lat: 54.64, lon: 19.91 },
  { name: "Izmail, Ukraine's Danube port", kind: 'port', lat: 45.34, lon: 28.84 },
];

/** Small islands whose garrisons, ports and airfields matter more than their area: each holds the cell at this point. */
const STRATEGIC_ISLANDS: { name: string; iso3: string; lat: number; lon: number }[] = [
  { name: 'Kinmen', iso3: 'TWN', lat: 24.44, lon: 118.37 },
  { name: 'Matsu', iso3: 'TWN', lat: 26.16, lon: 119.95 },
  { name: 'Penghu', iso3: 'TWN', lat: 23.57, lon: 119.6 },
  { name: 'Okinawa', iso3: 'JPN', lat: 26.35, lon: 127.77 },
  { name: 'Guam', iso3: 'USA', lat: 13.45, lon: 144.78 },
  { name: 'Diego Garcia', iso3: 'GBR', lat: -7.32, lon: 72.42 },
];

/** Taiwanese islands that Natural Earth's 1:50m countries omit, as coarse rings around the main islands. */
const EXTRA_ISLANDS: { name: string; iso3: string; ring: [number, number][] }[] = [
  { name: 'Penghu', iso3: 'TWN', ring: [[119.52, 23.52], [119.7, 23.53], [119.69, 23.66], [119.62, 23.72], [119.52, 23.68], [119.52, 23.52]] },
  { name: 'Matsu (Nangan, Beigan)', iso3: 'TWN', ring: [[119.9, 26.13], [120.02, 26.14], [120.03, 26.26], [119.95, 26.27], [119.9, 26.19], [119.9, 26.13]] },
];

/**
 * Bridges and tunnels that carry an army across water. Each endpoint is a [lat, lon] on land, one per shore.
 * Every other crossing of open water is a sea move.
 */
const FIXED_LINKS: { name: string; a: [number, number]; b: [number, number] }[] = [
  { name: 'Channel Tunnel', a: [51.09, 1.14], b: [50.93, 1.8] },
  { name: 'Oresund Bridge', a: [55.62, 12.65], b: [55.57, 12.93] },
  { name: 'Great Belt Fixed Link', a: [55.33, 11.14], b: [55.31, 10.8] },
  { name: 'Crimean Bridge', a: [45.35, 36.47], b: [45.22, 36.7] },
  { name: 'Bosporus bridges and Marmaray', a: [41.04, 28.98], b: [41.03, 29.06] },
  { name: '1915 Canakkale Bridge', a: [40.36, 26.62], b: [40.33, 26.69] },
  { name: 'King Fahd Causeway', a: [26.2, 50.2], b: [26.16, 50.47] },
  { name: 'Johor-Singapore Causeway', a: [1.5, 103.75], b: [1.4, 103.8] },
  { name: 'Seikan Tunnel', a: [41.17, 140.38], b: [41.42, 140.12] },
  { name: 'Confederation Bridge', a: [46.24, -63.66], b: [46.17, -63.78] },
];

/** States with polygons that the game leaves out: none fields forces, and each would need a profile and an order of battle. */
const OUT_OF_PLAY = new Set(['AND', 'LIE', 'SMR']);

/** Capitals Natural Earth's 1:50m places do not flag as such. */
const CAPITAL_FALLBACK: Record<string, string> = { SSD: 'Juba', PSE: 'Ramallah' };

/** Natural Earth adm0_a3 codes that are not ISO 3166 alpha-3. */
const NE_ADM0: Record<string, string> = { KOS: 'XKX', SDS: 'SSD', PSX: 'PSE', SOL: 'SOM', CYN: 'CYP', SAH: 'MAR', KAB: 'KAZ' };

const VOTE_SAMPLES = [[0, 0], [-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]];
/** Islands too small to win a cell's majority vote still claim an open-water cell above this area. */
const ISLAND_MIN_KM2 = 200;
const EARTH_KM2 = 4 * Math.PI * 6371 ** 2;
const LAT_MIN = -56;
const LAT_MAX = 84;

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
  // Every polygon part, resolved to the sovereign nation that would field its forces.
  type PartInfo = { iso3: string; poly: Polygon };
  const partInfo: PartInfo[] = [];
  for (const f of countries.features) {
    let iso3 = f.id ? isoCountries.numericToAlpha3(String(f.id)) : NAME_FALLBACK[f.properties.name];
    if (!iso3) iso3 = NAME_FALLBACK[f.properties.name];
    if (!iso3) { console.warn('unmapped polygon', f.id, f.properties.name); continue; }
    iso3 = SOVEREIGN_OF[iso3] ?? iso3;
    if (f.properties.name === 'Antarctica' || iso3 === 'ATA') continue;
    const coords = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
    for (const c of coords) partInfo.push({ iso3, poly: { type: 'Polygon', coordinates: c } });
  }
  for (const e of EXTRA_ISLANDS) partInfo.push({ iso3: e.iso3, poly: { type: 'Polygon', coordinates: [e.ring] } });
  const owners = [...new Set(partInfo.map((p) => p.iso3))].sort();
  const ownerIndex = new Map(owners.map((o, i) => [o, i]));
  const raster = Raster.build(partInfo.map((p) => ({ owner: ownerIndex.get(p.iso3)!, rings: p.poly.coordinates })));
  const ownerAt = (lat: number, lon: number) => { const o = raster.ownerAt(lat, lon); return o < 0 ? undefined : owners[o]; };

  const vote = (lat: number, lon: number, size: number): string | undefined => {
    const votes = new Map<string, number>();
    for (const [dy, dx] of VOTE_SAMPLES) {
      const o = ownerAt(lat + dy * size, lon + dx * size);
      if (o) votes.set(o, (votes.get(o) ?? 0) + 1);
    }
    let best: string | undefined, bestV = 0;
    for (const [k, v] of votes) if (v > bestV) { best = k; bestV = v; }
    return bestV >= 2 ? best : undefined;
  };
  const squareCentre = (key: number) => [89.5 - Math.floor(key / 360), (key % 360) - 179.5];
  const squareVote = new Map<number, string>();
  for (let r = 90 - LAT_MAX; r < 90 - LAT_MIN; r++)
    for (let c = 0; c < 360; c++) {
      const o = vote(89.5 - r, c - 179.5, 1);
      if (o) squareVote.set(r * 360 + c, o);
    }

  // Hard claims: every capital, the strategic islands, and any state too small to win a 1-degree square.
  const placeIso = (p: any): string | undefined => {
    const a2 = p.iso_a2 && p.iso_a2 !== '-99' ? isoCountries.alpha2ToAlpha3(p.iso_a2) : undefined;
    return a2 ?? NE_ADM0[p.adm0_a3] ?? p.adm0_a3;
  };
  const capitalPlace = new Map<string, any>();
  for (const f of places.features) {
    const p = f.properties as any;
    [p.latitude, p.longitude] = [+p.latitude.toFixed(4), +p.longitude.toFixed(4)];
  }
  for (const f of places.features) {
    const p = f.properties as any, iso = placeIso(p);
    const capital = p.adm0cap === 1 || CAPITAL_FALLBACK[iso ?? ''] === p.nameascii;
    if (!capital || !iso || !ownerIndex.has(iso) || SOVEREIGN_OF[iso] || OUT_OF_PLAY.has(iso)) continue;
    if ((capitalPlace.get(iso)?.pop_max ?? -1) < p.pop_max) capitalPlace.set(iso, p);
  }
  type Claim = { iso3: string; lat: number; lon: number; pop: number; why: string };
  const claims: Claim[] = [...capitalPlace].map(([iso3, p]) => ({ iso3, lat: p.latitude, lon: p.longitude, pop: p.pop_max, why: `capital ${p.nameascii}` }));
  const capitalClaim = new Map(claims.map((c) => [c.iso3, c]));
  claims.push(...STRATEGIC_ISLANDS.map((s) => ({ ...s, pop: 0, why: s.name })));
  const voted = new Set(squareVote.values()), claimed = new Set(claims.map((c) => c.iso3));
  const partKm2 = (p: Polygon) => (geoArea(p) / (4 * Math.PI)) * EARTH_KM2;
  for (const iso3 of owners) {
    if (voted.has(iso3) || claimed.has(iso3) || OUT_OF_PLAY.has(iso3)) continue;
    const largest = partInfo.filter((p) => p.iso3 === iso3).sort((a, b) => partKm2(b.poly) - partKm2(a.poly))[0];
    const [lon, lat] = geoCentroid(largest.poly);
    claims.push({ iso3, lat, lon, pop: 0, why: 'small state' });
  }

  // Squares to refine: the explicit regions, then any square where a claim meets another nation's land.
  const foreignLand = (key: number, iso3: string) => {
    const [clat, clon] = squareCentre(key);
    for (let j = 0; j < 10; j++) for (let i = 0; i < 10; i++) {
      const o = ownerAt(clat + 0.45 - j / 10, clon - 0.45 + i / 10);
      if (o && o !== iso3) return true;
    }
    return false;
  };
  const squareK = new Map<number, number>();
  for (const { box: [s, n, w, e], k } of REFINE)
    for (let lat = s; lat < n; lat++) for (let lon = w; lon < e; lon++) squareK.set(squareKey(lat + 0.5, lon + 0.5), k);
  const claimsBySquare = new Map<number, Claim[]>();
  for (const c of claims) {
    const key = squareKey(c.lat, c.lon);
    (claimsBySquare.get(key) ?? claimsBySquare.set(key, []).get(key)!).push(c);
    if (squareVote.get(key) !== c.iso3 && foreignLand(key, c.iso3)) squareK.set(key, Math.max(4, squareK.get(key) ?? 1));
  }
  const subOf = (lat: number, lon: number, k: number) => {
    const [clat, clon] = squareCentre(squareKey(lat, lon));
    const j = Math.min(k - 1, Math.floor((clat + 0.5 - lat) * k)), i = Math.min(k - 1, Math.floor((lon - clon + 0.5) * k));
    return { lat: clat + 0.5 - (j + 0.5) / k, lon: clon - 0.5 + (i + 0.5) / k };
  };
  // Two nations' claims in one cell: refine to 1/8 degree, then the smaller claim (the Vatican beside Rome)
  // takes the nearest sub-cell no other nation claims.
  for (const [key, list] of claimsBySquare) {
    let k = squareK.get(key) ?? 1;
    const same = (a: Claim, b: Claim) => { const p = subOf(a.lat, a.lon, k), q = subOf(b.lat, b.lon, k); return p.lat === q.lat && p.lon === q.lon; };
    while (k < 8 && list.some((a) => list.some((b) => a.iso3 !== b.iso3 && same(a, b)))) k *= 2;
    if (k > 1) squareK.set(key, k);
    if (k > 2) console.log(`square ${squareCentre(key)} at 1/${k} degree for ${list.map((c) => c.why).join(', ')}`);
    for (const a of [...list].sort((x, y) => x.pop - y.pop)) {
      if (!list.some((b) => b.iso3 !== a.iso3 && b.pop >= a.pop && same(a, b))) continue;
      const [clat, clon] = squareCentre(key);
      let best: { lat: number; lon: number } | undefined, bestD = Infinity;
      for (let j = 0; j < k; j++)
        for (let i = 0; i < k; i++) {
          const lat = clat + 0.5 - (j + 0.5) / k, lon = clon - 0.5 + (i + 0.5) / k, d = Math.hypot(lat - a.lat, lon - a.lon);
          if (d < bestD && !list.some((b) => b.iso3 !== a.iso3 && same(b, { ...a, lat, lon }))) [best, bestD] = [{ lat, lon }, d];
        }
      if (!best) throw new Error(`no free cell for ${a.why}`);
      console.log(`${a.why} (${a.iso3}) shares its cell with a larger claim; moved to ${best.lat},${best.lon}`);
      Object.assign(a, best);
    }
  }

  // Cells: a majority vote per square or sub-square, then claims take their cell outright.
  type CellInfo = { lat: number; lon: number; half: number; iso3: string };
  const cellAt = new Map<string, CellInfo>();
  const posKey = (lat: number, lon: number) => `${lat.toFixed(4)},${lon.toFixed(4)}`;
  for (let r = 90 - LAT_MAX; r < 90 - LAT_MIN; r++)
    for (let c = 0; c < 360; c++) {
      const key = r * 360 + c, k = squareK.get(key) ?? 1;
      if (k === 1) {
        const o = squareVote.get(key);
        if (o) cellAt.set(posKey(89.5 - r, c - 179.5), { lat: 89.5 - r, lon: c - 179.5, half: 0.5, iso3: o });
        continue;
      }
      for (let j = 0; j < k; j++)
        for (let i = 0; i < k; i++) {
          const lat = 90 - r - (j + 0.5) / k, lon = c - 180 + (i + 0.5) / k;
          const o = vote(lat, lon, 1 / k);
          if (o) cellAt.set(posKey(lat, lon), { lat, lon, half: 0.5 / k, iso3: o });
        }
    }
  const take = (lat: number, lon: number, iso3: string, force: boolean) => {
    const k = squareK.get(squareKey(lat, lon)) ?? 1, s = subOf(lat, lon, k), key = posKey(s.lat, s.lon);
    if (!force && cellAt.has(key)) return false;
    cellAt.set(key, { lat: s.lat, lon: s.lon, half: 0.5 / k, iso3 });
    return true;
  };
  for (const c of claims) take(c.lat, c.lon, c.iso3, true);
  let islands = 0;
  for (const p of partInfo) {
    if (partKm2(p.poly) < ISLAND_MIN_KM2) continue;
    const [lon, lat] = geoCentroid(p.poly);
    if (lat >= LAT_MIN && take(lat, lon, p.iso3, false)) islands++;
  }
  // In refined squares a coastal city, port or airfield can sit on land that loses its small cell's vote
  // (Xiamen island, Hualien, Baltiysk). Each one keeps a cell for the nation whose land it stands on.
  const sites = [
    ...places.features.filter((f) => (f.properties as any).pop_max >= 300_000).map((f) => f.geometry),
    ...ports.features.map((f) => f.geometry), ...airports.features.map((f) => f.geometry),
    ...EXTRA_FACILITIES.map((f) => ({ type: 'Point', coordinates: [f.lon, f.lat] }) as Geometry),
  ];
  for (const g of sites) {
    if (g.type !== 'Point') continue;
    const [lon, lat] = g.coordinates;
    if (!squareK.has(squareKey(lat, lon))) continue;
    for (let d = 0; d <= 0.1; d += 0.025) {
      const o = [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d]].map(([dy, dx]) => ownerAt(lat + dy, lon + dx)).find((x) => x);
      if (o) { take(lat, lon, o, false); break; }
    }
  }
  const cellList = [...cellAt.values()].sort((a, b) => b.lat - a.lat || a.lon - b.lon);
  const grid = new SquareIndex(cellList.map((c) => c.lat), cellList.map((c) => c.lon), cellList.map((c) => c.half));
  const L = cellList.length;
  const iso3Of = (n: number) => cellList[n].iso3;
  console.log('land cells', L, 'refined squares', squareK.size, 'claims', claims.length, 'island cells added', islands);

  // Land adjacency: pixel contacts between cells, plus fixed links.
  const labels = new LandLabels(raster, grid, cellList.map((c) => ({ ...c, owner: ownerIndex.get(c.iso3)! })));
  const landAdj: Set<number>[] = cellList.map(() => new Set());
  for (const key of labels.contacts) {
    const a = Math.floor(key / L), b = key % L;
    landAdj[a].add(b);
    landAdj[b].add(a);
  }
  for (const link of FIXED_LINKS) {
    const [a, b] = [link.a, link.b].map(([lat, lon]) => labels.pointLabel(lat, lon, 4));
    if (a < 0 || b < 0) throw new Error(`${link.name}: endpoint off the land grid`);
    if (a === b) { console.log(`fixed link ${link.name} lies inside one cell (${iso3Of(a)})`); continue; }
    landAdj[a].add(b);
    landAdj[b].add(a);
    console.log(`fixed link ${link.name}: ${iso3Of(a)} ${cellList[a].lat},${cellList[a].lon} - ${iso3Of(b)} ${cellList[b].lat},${cellList[b].lon}`);
  }

  // Points (cities, ports, airports, rail) belong to the cell owning the land at or next to them.
  const pointCell = (lat: number, lon: number) => labels.pointLabel(lat, lon, 4);

  // terrain
  const terrain: Terrain[] = [];
  const regionClass: Record<string, Terrain> = {
    'Range/mtn': 'mountain', Desert: 'desert', Tundra: 'arctic', Plateau: 'hills', Foothills: 'hills',
    Wetlands: 'marsh', Delta: 'marsh',
  };
  const regionPolys = regions.features
    .filter((f) => regionClass[(f.properties as any).FEATURECLA])
    .map((f) => ({ f, t: regionClass[(f.properties as any).FEATURECLA], b: geoBounds(f as any) }));
  // smaller regions (e.g. a range inside a plateau) take precedence
  regionPolys.sort((a, b) => geoArea(b.f as any) - geoArea(a.f as any));
  for (const { lat, lon } of cellList) {
    let t: Terrain = 'plain';
    if (inBoxes(lat, lon, JUNGLE_BOXES)) t = 'jungle';
    else if (inBoxes(lat, lon, BOREAL_BOXES)) t = 'forest';
    for (const rp of regionPolys) {
      const [[w, s], [e, n]] = rp.b;
      if (lat < s || lat > n || lon < w || lon > e) continue;
      if (geoContains(rp.f as any, [lon, lat])) t = rp.t;
    }
    if (Math.abs(lat) > 66) t = 'arctic';
    terrain.push(t);
  }

  // cities
  type City = { name: string; iso3: string; cell: number; lat: number; lon: number; pop: number; capital: boolean };
  const cities: City[] = [];
  for (const f of places.features) {
    const p = f.properties as any, iso = placeIso(p);
    const isCapital = !!iso && capitalPlace.get(iso) === p;
    const claim = isCapital ? capitalClaim.get(iso) : undefined;
    const cell = claim ? grid.at(claim.lat, claim.lon) : pointCell(p.latitude, p.longitude);
    if (cell < 0) continue;
    cities.push({ name: p.nameascii ?? p.name, iso3: iso3Of(cell), cell, lat: p.latitude, lon: p.longitude, pop: p.pop_max ?? 0, capital: isCapital && iso3Of(cell) === iso });
  }
  const cityPopByCell = new Map<number, number>();
  for (const c of cities) {
    cityPopByCell.set(c.cell, (cityPopByCell.get(c.cell) ?? 0) + c.pop);
    if (c.pop >= 1_000_000) terrain[c.cell] = 'urban';
  }

  const countPoints = (fc: FeatureCollection) => {
    const m = new Map<number, number>();
    for (const f of fc.features) {
      if (f.geometry.type !== 'Point') continue;
      const [lon, lat] = f.geometry.coordinates;
      const cell = pointCell(lat, lon);
      if (cell >= 0) m.set(cell, (m.get(cell) ?? 0) + 1);
    }
    return m;
  };
  const extra = (kind: 'port' | 'airport') => ({ type: 'FeatureCollection', features: EXTRA_FACILITIES.filter((f) => f.kind === kind).map((f) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [f.lon, f.lat] } })) }) as FeatureCollection;
  const portCount = countPoints({ ...ports, features: [...ports.features, ...extra('port').features] });
  const airCount = countPoints({ ...airports, features: [...airports.features, ...extra('airport').features] });

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
        const cell = pointCell((line[i - 1][1] + line[i][1]) / 2, (line[i - 1][0] + line[i][0]) / 2);
        if (cell >= 0) railKm.set(cell, (railKm.get(cell) ?? 0) + hav(line[i - 1], line[i]));
      }
  }

  // sea zones: 3-degree ocean grid, only zones with no land-majority
  const SZ = 3, SROWS = 180 / SZ, SCOLS = 360 / SZ;
  const isLand = (lat: number, lon: number) => grid.at(lat, lon) >= 0;
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
  // A coastal cell links to the sea zone past open water one cell (then one degree) away, else to the zone
  // over water inside its own square (Copenhagen on the Oresund). A cell with no land neighbour is an island
  // and always gets its nearest zone, so every cell can be reached.
  const coastZone = cellList.map(({ lat, lon, half }, n) => {
    for (const step of [2 * half, 1])
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dy && !dx) continue;
        const la = lat + dy * step, lo = lon + dx * step;
        if (isLand(la, lo)) continue;
        const z = seaZoneAt(la, lo);
        if (z >= 0) return z;
      }
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      const la = lat + (j - 1) * half * 0.8, lo = lon + (i - 1) * half * 0.8;
      const z = raster.ownerAt(la, lo) < 0 ? seaZoneAt(la, lo) : -1;
      if (z >= 0) return z;
    }
    if (landAdj[n].size) return -1;
    let best = -1, bestD = Infinity;
    seaZones.forEach((z, j) => {
      const d = (z.lat - lat) ** 2 + ((((z.lon - lon + 540) % 360) - 180) * Math.cos((lat * Math.PI) / 180)) ** 2;
      if (d < bestD) [best, bestD] = [j, d];
    });
    return best;
  });

  // nations
  const iso3s = [...new Set(cellList.map((c) => c.iso3))].sort();
  const nations = iso3s.map((iso3) => {
    const stats = { ...(wb.get(iso3) ?? {}), ...(MANUAL_STATS[iso3] ?? {}) } as Partial<Record<StatKey, number>>;
    const name = MANUAL_STATS[iso3]?.name ?? isoCountries.getName(iso3, 'en', { select: 'alias' }) ?? iso3;
    const capital = cities.find((c) => c.iso3 === iso3 && c.capital)
      ?? cities.filter((c) => c.iso3 === iso3).sort((a, b) => b.pop - a.pop)[0];
    return { iso3, name, stats, capital: capital ? { name: capital.name, cell: capital.cell } : { name, cell: cellList.findIndex((c) => c.iso3 === iso3) } };
  });
  const nationIndex = new Map(iso3s.map((n, i) => [n, i]));
  for (const n of nations) {
    if (!n.stats.population) console.warn('no population for', n.iso3, n.name);
    if (!n.stats.gdp) console.warn('no gdp for', n.iso3, n.name);
    if (!cities.some((c) => c.iso3 === n.iso3 && c.capital)) console.warn('no Natural Earth capital for', n.iso3, '- using', n.capital.name);
  }

  // Population and industry weights per cell; the terrain term scales with the cell's area.
  const habit: Record<Terrain, number> = { plain: 1, forest: 0.4, jungle: 0.35, hills: 0.6, mountain: 0.2, desert: 0.08, marsh: 0.4, arctic: 0.02, urban: 3 };
  const weightBy = new Map<string, number>();
  const rawW = cellList.map((c, n) => {
    const w = habit[terrain[n]] * (2 * c.half) ** 2 + (cityPopByCell.get(n) ?? 0) / 250_000 + (railKm.get(n) ?? 0) / 400;
    weightBy.set(c.iso3, (weightBy.get(c.iso3) ?? 0) + w);
    return w;
  });

  const cells = {
    lat: cellList.map((c) => c.lat),
    lon: cellList.map((c) => c.lon),
    half: cellList.map((c) => c.half),
    owner: cellList.map((c) => nationIndex.get(c.iso3)!),
    terrain: terrain.map((t) => TERRAIN.indexOf(t)),
    popShare: cellList.map((c, n) => +(rawW[n] / weightBy.get(c.iso3)!).toFixed(5)),
    railKm: cellList.map((_, n) => Math.round(railKm.get(n) ?? 0)),
    ports: cellList.map((_, n) => portCount.get(n) ?? 0),
    airports: cellList.map((_, n) => airCount.get(n) ?? 0),
    coastZone,
    adj: landAdj.map((s) => [...s].sort((a, b) => a - b)),
  };

  const bigCities = cities
    .filter((c) => c.pop >= 300_000 || c.capital)
    .map((c) => ({ name: c.name, nation: nationIndex.get(c.iso3)!, cell: c.cell, pop: c.pop, capital: c.capital, lat: +c.lat.toFixed(4), lon: +c.lon.toFixed(4) }));

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
    nations.length, 'nations,', L, 'cells,', seaZones.length, 'sea zones,', bigCities.length, 'cities');
}

main().catch((e) => { console.error(e); process.exit(1); });

import { describe, expect, it } from 'vitest';
import { haversineKm } from '../src/core/map';
import { loadMap } from '../src/data/load';
import type { NationId, NodeId } from '../src/core/types';

const map = loadMap();
type Point = [number, number];
const at = ([lat, lon]: Point) => map.nodeAt(lat, lon);
const landNeighbors = (n: NodeId) => [...map.neighbors(n)].filter((m) => !map.isSea(m));
const where = (n: NodeId) => `${map.owner[n]} ${map.lat[n]},${map.lon[n]}`;

function landEdges(a: string, b: string): string[] {
  const out: string[] = [];
  for (let n = 0 as NodeId; n < map.landCount; n++)
    if (map.owner[n] === a) for (const m of landNeighbors(n)) if (map.owner[m] === b) out.push(`${where(n)} - ${where(m)}`);
  return out;
}

/** Land-only hops between two points, Infinity when no land route exists. */
function landHops(from: Point, to: Point): number {
  const a = at(from), b = at(to);
  expect(map.isSea(a) || map.isSea(b), `${from} and ${to} are on land`).toBe(false);
  const dist = new Map([[a, 0]]), queue = [a];
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i];
    if (n === b) return dist.get(n)!;
    for (const m of landNeighbors(n)) if (!dist.has(m)) { dist.set(m, dist.get(n)! + 1); queue.push(m); }
  }
  return Infinity;
}

const TALLINN: Point = [59.44, 24.75], HELSINKI: Point = [60.17, 24.94], BUSAN: Point = [35.1, 129.04], FUKUOKA: Point = [33.59, 130.4];
const TAIPEI: Point = [25.04, 121.56], TAICHUNG: Point = [24.15, 120.68], KAOHSIUNG: Point = [22.63, 120.27], FUZHOU: Point = [26.07, 119.3];
const KINMEN: Point = [24.44, 118.37], MATSU: Point = [26.16, 119.95], PENGHU: Point = [23.57, 119.6];

describe('land adjacency follows land, bridges and tunnels', () => {
  // Each pair is two shores of open water with no fixed link: an army needs a ship.
  it.each([
    ['Gulf of Finland', 'EST', 'FIN'], ['Korea Strait', 'KOR', 'JPN'], ['Strait of Hormuz', 'IRN', 'OMN'], ['Taiwan Strait', 'CHN', 'TWN'],
    ['Strait of Gibraltar', 'ESP', 'MAR'], ['Bab-el-Mandeb', 'YEM', 'DJI'], ['Bab-el-Mandeb', 'YEM', 'ERI'], ['Bering Strait', 'RUS', 'USA'],
    ['Palk Strait', 'IND', 'LKA'], ['Strait of Otranto', 'ITA', 'ALB'], ['La Perouse Strait', 'RUS', 'JPN'], ['Torres Strait', 'AUS', 'PNG'],
    ['Strait of Malacca', 'MYS', 'IDN'],
  ])('%s does not join %s and %s by land', (_, a, b) => {
    const edges = landEdges(a, b);
    // Malaysia and Indonesia do share a land border, on Borneo; none of it may cross the Strait of Malacca.
    expect(a === 'MYS' ? edges.filter((e) => !/ [1-7]\.\d+,11\d/.test(e)) : edges).toEqual([]);
  });

  it('crosses the Strait of Dover only through the Channel Tunnel', () => {
    expect(landEdges('GBR', 'FRA')).toEqual([`${where(at([51.15, 0.87]))} - ${where(at([50.93, 1.8]))}`]);
  });

  it('sends Tallinn to Helsinki round the Gulf of Finland through Russia', () => {
    expect(landHops(TALLINN, HELSINKI)).toBeGreaterThanOrEqual(6);
  });

  it.each([
    ['Busan to Fukuoka', BUSAN, FUKUOKA], ['Taipei to Fuzhou', TAIPEI, FUZHOU],
  ])('has no land route %s', (_, a, b) => {
    expect(landHops(a, b)).toBe(Infinity);
  });

  it.each([
    ['Oresund Bridge', [55.68, 12.57], [55.6, 13.0], 1],
    ['Crimean Bridge', [45.35, 36.47], [45.22, 36.7], 1],
    ['King Fahd Causeway', [26.22, 50.58], [26.28, 50.2], 2],
    ['Johor-Singapore Causeway', [1.35, 103.82], [1.49, 103.74], 2],
    ['Great Belt Fixed Link', [55.68, 12.57], [55.4, 10.39], 4],
    ['Bosporus bridges', [41.68, 26.56], [39.93, 32.86], 10],
    ['Seikan Tunnel', [35.68, 139.69], [43.06, 141.35], 12],
    ['Kanmon tunnels', [35.68, 139.69], [33.59, 130.4], 12],
  ] as [string, Point, Point, number][])('carries armies over the %s', (_, a, b, hops) => {
    expect(landHops(a, b)).toBeLessThanOrEqual(hops);
  });

  it('keeps Kaliningrad reachable by land from Poland and Lithuania', () => {
    expect(landEdges('RUS', 'POL').length).toBeGreaterThan(0);
    expect(landEdges('RUS', 'LTU').length).toBeGreaterThan(0);
    expect(landHops([54.71, 20.51], [52.23, 21.01])).toBeLessThanOrEqual(6);
    expect(map.owner[at([54.64, 19.91])]).toBe('RUS');
    expect(map.ports[at([54.64, 19.91])]).toBeGreaterThan(0);
  });
});

describe('capitals', () => {
  const capitalCity = (nation: string) => map.cities.find((c) => c.capital && c.nation === nation);

  it('sits in a cell its own nation owns for all 193 nations', () => {
    expect(map.nationIds.length).toBe(193);
    const wrong = map.data.nations.filter((n, i) => map.owner[n.capital!.cell] !== map.nationIds[i]).map((n) => `${n.iso3} ${n.capital!.name}`);
    expect(wrong).toEqual([]);
  });

  it('is the cell holding the capital city, unless a larger capital holds that cell', () => {
    const wrong: string[] = [];
    for (const [i, n] of map.data.nations.entries()) {
      const city = capitalCity(map.nationIds[i]);
      if (!city) continue;
      const cell = map.nodeAt(city.lat, city.lon);
      if (cell === n.capital!.cell) continue;
      const larger = map.cities.find((c) => c.capital && c.node === cell && c.pop > city.pop);
      if (!larger || map.distanceKm(cell, n.capital!.cell as NodeId) > 30) wrong.push(`${n.iso3} ${city.name}`);
    }
    expect(wrong).toEqual([]);
  });

  it.each([
    ['TWN', 'Taipei'], ['DNK', 'Kobenhavn'], ['GRC', 'Athens'], ['LTU', 'Vilnius'], ['PRT', 'Lisbon'], ['CUB', 'Havana'], ['PER', 'Lima'],
    ['SVN', 'Ljubljana'], ['MKD', 'Skopje'], ['ISR', 'Jerusalem'], ['SSD', 'Juba'], ['PSE', 'Ramallah'], ['LKA', 'Colombo'], ['TKM', 'Ashgabat'],
  ])('%s is governed from %s', (nation, name) => {
    expect(map.data.nations.find((n) => n.iso3 === nation)!.capital!.name).toBe(name);
    expect(capitalCity(nation)?.name).toBe(name);
  });
});

describe('Taiwan and the strategic islands', () => {
  it('draws Taiwan finely enough for a northern, central and southern front', () => {
    const taipei = at(TAIPEI), taichung = at(TAICHUNG), kaohsiung = at(KAOHSIUNG);
    expect([taipei, taichung, kaohsiung].map((n) => map.owner[n])).toEqual(['TWN', 'TWN', 'TWN']);
    expect(new Set([taipei, taichung, kaohsiung]).size).toBe(3);
    expect(map.data.nations.find((n) => n.iso3 === 'TWN')!.capital!.cell).toBe(taipei);
    const main = map.nodesOf('TWN' as NationId).filter((n) => map.lon[n] > 120);
    expect(main.length).toBeGreaterThanOrEqual(30);
  });

  it.each([
    ['Keelung', [25.13, 121.74], 'port'], ['Songshan', [25.07, 121.55], 'airport'], ['Taoyuan', [25.08, 121.23], 'airport'],
    ['Taichung', [24.26, 120.5], 'port'], ['Kaohsiung', [22.57, 120.31], 'port'], ['Kaohsiung', [22.57, 120.35], 'airport'],
    ['Hualien', [23.98, 121.63], 'port'], ['Hualien', [24.02, 121.62], 'airport'],
  ] as [string, Point, 'port' | 'airport'][])('puts the %s %s in a Taiwanese land cell that has one', (_, p, kind) => {
    const n = at(p);
    expect(map.owner[n]).toBe('TWN');
    expect((kind === 'port' ? map.ports : map.airports)[n]).toBeGreaterThan(0);
  });

  it.each([
    ['Kinmen', KINMEN, 'TWN'], ['Matsu', MATSU, 'TWN'], ['Penghu', PENGHU, 'TWN'], ['Okinawa', [26.35, 127.77] as Point, 'JPN'],
    ['Guam', [13.45, 144.78] as Point, 'USA'], ['Diego Garcia', [-7.32, 72.42] as Point, 'GBR'],
  ])('holds %s as its own island cell with a port and an airfield', (_, p, owner) => {
    const n = at(p);
    expect(map.owner[n]).toBe(owner);
    expect(landNeighbors(n)).toEqual([]);
    expect(map.isCoastal(n)).toBe(true);
    expect(map.ports[n]).toBeGreaterThan(0);
    expect(map.airports[n]).toBeGreaterThan(0);
  });

  it('keeps Xiamen Chinese next to Kinmen', () => {
    expect(map.owner[at([24.48, 118.09])]).toBe('CHN');
    expect(at([24.48, 118.09])).not.toBe(at(KINMEN));
  });

  it.each([
    ['Singapore', [1.29, 103.85] as Point, 'SGP'], ['Bahrain', [26.22, 50.58] as Point, 'BHR'], ['Sevastopol', [44.62, 33.54] as Point, 'RUS'],
    ['Kerch', [45.35, 36.47] as Point, 'RUS'],
  ])('holds %s on a land cell with a port', (_, p, owner) => {
    const n = at(p);
    expect(map.owner[n]).toBe(owner);
    expect(map.ports[at(p)] + landNeighbors(n).reduce((s, m) => s + (map.owner[m] === owner ? map.ports[m] : 0), 0)).toBeGreaterThan(0);
  });
});

it('finds every land cell at its own centre', () => {
  const wrong: number[] = [];
  for (let n = 0 as NodeId; n < map.landCount; n++) if (map.nodeAt(map.lat[n], map.lon[n]) !== n) wrong.push(n);
  expect(wrong).toEqual([]);
});

it('maps a point outside every cell and sea zone to the nearest node by great-circle km', () => {
  let seed = 12345;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const points: Point[] = [];
  for (let i = 0; i < 1500; i++) points.push([Math.asin(2 * rand() - 1) * (180 / Math.PI), rand() * 360 - 180]);
  for (let i = 0; i < 100; i++) points.push([90 - rand() * 3, rand() * 360 - 180], [-90 + rand() * 3, rand() * 360 - 180], [rand() * 160 - 80, 180 - rand() * 2]);
  const inside = (n: NodeId, [lat, lon]: Point) => Math.abs(lat - map.lat[n]) <= map.halfDeg[n] && Math.abs(((lon - map.lon[n] + 540) % 360) - 180) <= map.halfDeg[n];
  const nearest = ([lat, lon]: Point) => {
    let best = 0, bestD = Infinity;
    for (let n = 0; n < map.size; n++) {
      const d = haversineKm(lat, lon, map.lat[n], map.lon[n]);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  };
  const outside = points.filter((p) => !inside(at(p), p));
  expect(outside.length).toBeGreaterThan(100);
  expect(outside.filter((p) => at(p) !== nearest(p))).toEqual([]);
});

describe('terrain follows relief', () => {
  it.each([
    ['the Central Range at Yushan', [23.47, 120.96]], ['the Central Range at Hehuan', [24.14, 121.27]], ['the Taebaek range', [37.6, 128.7]],
    ['the Japanese Alps', [36.29, 137.65]], ['the Swiss Alps', [46.5, 8.5]], ['the Zagros', [33.5, 48.5]],
  ] as [string, Point][])('makes %s mountain', (_, p) => {
    expect(map.terrain[at(p)]).toBe('mountain');
  });

  it.each([
    ['the Chianan plain', [23.38, 120.3]], ['the Hungarian plain', [47.0, 20.5]], ['Kansas', [38.5, -98.5]], ['the Netherlands', [52.6, 5.5]],
  ] as [string, Point][])('keeps %s flat', (_, p) => {
    expect(map.terrain[at(p)]).toBe('plain');
  });

  it('gives each land cell its mean elevation and local relief', () => {
    const tibet = at([32.5, 88.5]), alps = at([46.5, 8.5]), netherlands = at([52.6, 5.5]);
    expect(map.elevation[tibet]).toBeGreaterThan(4000);
    expect(map.elevation[netherlands]).toBeLessThan(50);
    expect(map.ruggedness[alps]).toBeGreaterThan(500);
    expect(map.ruggedness[netherlands]).toBeLessThan(30);
  });

  it('leaves inland Taiwan off the coast', () => {
    const main = map.nodesOf('TWN' as NationId).filter((n) => map.lon[n] > 120);
    expect(map.isCoastal(at([23.47, 120.96]))).toBe(false);
    expect(main.filter((n) => !map.isCoastal(n)).length).toBeGreaterThanOrEqual(10);
  });
});

describe('fronts drawn finer than 1 degree', () => {
  it.each([
    ['Pokrovsk, Kramatorsk and Bakhmut', [[48.28, 37.18], [48.72, 37.56], [48.6, 38.0]]],
    ['Seoul, Kaesong and Chuncheon', [[37.57, 126.98], [37.97, 126.55], [37.88, 127.73]]],
    ['Zaporizhzhia and Huliaipole', [[47.84, 35.14], [47.66, 36.26]]],
    ['Kursk and Belgorod', [[51.73, 36.19], [50.6, 36.59]]],
    ['the two ends of the Suwalki gap', [[54.1, 22.93], [54.0, 23.6]]],
  ] as [string, Point[]][])('gives %s each a cell', (_, points) => {
    const cells = points.map(at);
    expect(cells.some((n) => map.isSea(n))).toBe(false);
    expect(new Set(cells).size).toBe(points.length);
  });
});

describe('land inside one nation crosses water only by bridge or tunnel', () => {
  it.each([
    ['Sicily from Calabria', [37.6, 14.2], [38.11, 15.65]], ['Hainan from Leizhou', [19.6, 110.0], [21.27, 110.36]],
    ['Sakhalin from the mainland', [50.9, 142.16], [49.09, 140.25]], ['Northern Ireland from Scotland', [54.6, -5.93], [55.86, -4.25]],
    ['the North Island from the South Island', [-41.29, 174.78], [-43.53, 172.64]],
  ] as [string, Point, Point][])('parts %s', (_, a, b) => {
    expect(landHops(a, b)).toBe(Infinity);
  });

  it.each([['POL', 'HUN'], ['TJK', 'PAK']])('joins %s and %s only through the country between them', (a, b) => {
    expect(landEdges(a, b)).toEqual([]);
  });

  it('lists the fixed links so their capacity can be limited', () => {
    const tunnel = map.fixedLinks.find((l) => l.name === 'Channel Tunnel')!;
    expect([map.owner[tunnel.a], map.owner[tunnel.b]].sort()).toEqual(['FRA', 'GBR']);
    expect([...map.neighbors(tunnel.a)]).toContain(tunnel.b);
  });
});

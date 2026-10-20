/**
 * Territory held by a nation other than its internationally recognised owner,
 * as of late 2025. Polygons are coarse [lon, lat] rings; at 1-degree resolution
 * a cell changes hands when its centre falls inside.
 */
export interface Occupation {
  holder: string;
  owner: string;
  name: string;
  ring: [number, number][];
  source: string;
}

export const OCCUPATIONS: Occupation[] = [
  {
    holder: 'RUS', owner: 'UKR', name: 'Crimea',
    ring: [[32.4, 46.2], [36.7, 45.5], [36.7, 44.3], [33.2, 44.3], [32.4, 45.3]],
    source: 'annexed 2014',
  },
  {
    // Front line approximated through Kupiansk, Siversk, Kostiantynivka, Pokrovsk, Huliaipole, Orikhiv, then the Dnipro.
    holder: 'RUS', owner: 'UKR', name: 'Occupied east and south',
    ring: [
      [37.7, 50.4], [40.2, 49.6], [40.2, 47.1], [38.2, 46.9], [36.5, 46.6], [35.0, 46.2], [33.5, 46.4], [32.6, 46.5],
      [33.0, 46.8], [34.3, 47.3], [35.6, 47.5], [36.4, 47.7], [37.1, 48.2], [37.8, 48.6], [38.0, 48.9], [37.7, 49.6],
    ],
    source: 'ISW / DeepState front-line maps, late 2025 (coarse)',
  },
  {
    holder: 'RUS', owner: 'GEO', name: 'Abkhazia and South Ossetia',
    ring: [[40.0, 43.6], [42.2, 42.9], [44.5, 42.7], [44.5, 42.1], [43.6, 42.1], [41.6, 42.6], [40.2, 43.2]],
    source: 'Russian-recognised since 2008',
  },
];

export function pointInRing(lon: number, lat: number, ring: readonly [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

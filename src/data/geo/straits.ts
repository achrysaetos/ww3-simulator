/**
 * Corrections to the sea graph the 3-degree zones get wrong. A strait narrower than a zone
 * leaves the seas on either side unjoined, and a zone centred on a peninsula joins coasts that
 * ships must sail round. Each point resolves to the sea zone that contains it.
 */

type Point = readonly [lat: number, lon: number];

/** Who may pass. 'montreux': the Turkish Straits, closed in wartime to the warships of belligerents the holder is not fighting beside. */
export type StraitRegime = 'transit' | 'montreux';

export interface Strait {
  name: string;
  /** Zones on either side, joined by the strait. */
  a: Point;
  b: Point;
  regime: StraitRegime;
  /** A land cell on the strait whose controller applies the regime. */
  holder?: Point;
}

export const STRAITS: readonly Strait[] = [
  // 14 km wide, about 300 transits a day; transit passage under UNCLOS Part III, never closed in the wars since 1945.
  { name: 'Strait of Gibraltar', a: [37.5, -7.5], b: [37.5, -1.5], regime: 'transit' },
  // The Dardanelles, the Sea of Marmara and the Bosporus as one passage, Aegean to Black Sea (about 360 km).
  // Montreux Convention 1936, arts. 19-21: in a war in which Turkey is neutral, belligerents' warships may not pass;
  // Turkey closed the Straits to Russian and Ukrainian warships on 28 February 2022.
  { name: 'Turkish Straits', a: [37.5, 25.5], b: [43.5, 28.5], regime: 'montreux', holder: [41.1, 29.0] },
];

/**
 * Zone pairs the generated graph joins across land. The zone centred on Kerala (10.5N 76.5E) touched the
 * Coromandel coast, and the Gulf of Mannar zone touched Palk Bay and the Bay of Bengal across Adam's Bridge
 * and Sri Lanka; Vizag to Karachi is about 3,300 km round Cape Comorin and Dondra Head, not across the peninsula.
 */
export const SEA_CUTS: readonly (readonly [Point, Point])[] = [
  [[10.5, 76.5], [13.5, 79.5]],
  [[10.5, 76.5], [10.5, 79.5]],
  [[10.5, 76.5], [7.5, 79.5]],
  [[7.5, 76.5], [10.5, 79.5]],
  [[7.5, 79.5], [10.5, 79.5]],
  [[7.5, 79.5], [10.5, 82.5]],
  [[7.5, 79.5], [7.5, 82.5]],
  [[7.5, 79.5], [4.5, 82.5]],
];

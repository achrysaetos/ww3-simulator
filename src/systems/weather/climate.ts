/**
 * Climatological normals: what an average day looks like at a place and date. The weather system
 * draws each day's weather around these.
 *
 * Land normals are monthly means for one representative station per climate zone, rounded from
 * the NOAA 1991-2020 Global Climate Normals and ERA5 monthly means (Copernicus C3S): mean daily
 * temperature, precipitation, and the share of days with a low overcast (ceiling under ~3,000 ft).
 * Sea normals are ERA5 monthly mean significant wave height and 10 m wind for the zone's waters.
 * A zone is a lat/lon box; the first that holds a point wins, and anything outside every zone
 * falls back to a latitude-only climate. Rounded to what the 5-degree weather regions can resolve.
 */

type Monthly = readonly [number, number, number, number, number, number, number, number, number, number, number, number];

export interface Zone {
  id: string;
  /** Box: [south, north) latitude and [west, east) longitude, degrees. */
  lat: readonly [number, number];
  lon: readonly [number, number];
  /** Latitude of the station the land normals come from; temperatures shift with distance north or south of it. */
  stationLat: number;
  tempC: Monthly;
  precipMm: Monthly;
  /** Share of days under a low overcast. */
  cloud: Monthly;
  /** Mean significant wave height of the zone's waters, m. */
  waveM: Monthly;
  /** Mean 10 m wind over the zone's waters, knots. */
  windKt: Monthly;
  /** Chance per day that a tropical cyclone is over a given region of the zone. */
  cyclone?: Monthly;
  /**
   * How readily saturated ground turns to impassable mud, 0..1. 1 for the loess and chernozem of
   * the East European plain, where the rasputitsa stopped the Wehrmacht in October 1941 and
   * confined Russian and Ukrainian armour to roads in March 2022 and spring 2023.
   */
  mudSoil: number;
}

const z = (id: string, lat: readonly [number, number], lon: readonly [number, number], stationLat: number, mudSoil: number, m: Omit<Zone, 'id' | 'lat' | 'lon' | 'stationLat' | 'mudSoil'>): Zone => ({ id, lat, lon, stationLat, mudSoil, ...m });

const ZONES: readonly Zone[] = [
  // Kyiv; Black Sea and Azov waters. Moscow and Belarus are the same climate shifted colder by latitude.
  z('east_european_plain', [44, 62], [23, 60], 50.4, 1, {
    tempC: [-3.5, -2.9, 1.6, 9.1, 15.3, 18.8, 20.8, 20, 14.4, 8.3, 2.3, -2],
    precipMm: [41, 40, 37, 43, 59, 70, 78, 57, 55, 44, 45, 44],
    cloud: [0.75, 0.7, 0.6, 0.5, 0.45, 0.4, 0.35, 0.35, 0.45, 0.6, 0.8, 0.8],
    waveM: [1.5, 1.4, 1.2, 0.9, 0.7, 0.6, 0.6, 0.7, 0.9, 1.1, 1.4, 1.5],
    windKt: [14, 14, 13, 11, 9, 9, 9, 9, 10, 12, 13, 14],
  }),
  // Stockholm; Baltic Proper waters.
  z('nordic_baltic', [54, 72], [4, 32], 59.3, 0.6, {
    tempC: [-1.6, -1.7, 1, 5.8, 11.2, 15.7, 18.6, 17.4, 12.8, 7.4, 3.4, 0.2],
    precipMm: [39, 27, 29, 30, 40, 58, 64, 71, 52, 52, 50, 44],
    cloud: [0.8, 0.7, 0.6, 0.5, 0.45, 0.45, 0.45, 0.5, 0.55, 0.7, 0.85, 0.85],
    waveM: [1.6, 1.5, 1.2, 0.9, 0.7, 0.7, 0.7, 0.8, 1.1, 1.4, 1.6, 1.7],
    windKt: [17, 16, 14, 12, 10, 10, 10, 11, 13, 15, 17, 17],
  }),
  // London; North Atlantic waters, where winter storms keep mean waves above 4 m.
  z('north_atlantic', [45, 72], [-60, 4], 51.5, 0.4, {
    tempC: [5.2, 5.3, 7.6, 9.9, 13.3, 16.5, 18.7, 18.5, 15.7, 12, 8, 5.5],
    precipMm: [55, 41, 42, 44, 49, 45, 45, 50, 49, 69, 59, 55],
    cloud: [0.8, 0.75, 0.7, 0.6, 0.55, 0.55, 0.55, 0.55, 0.6, 0.7, 0.8, 0.85],
    waveM: [4.2, 4, 3.5, 2.8, 2.3, 2, 1.9, 2.1, 2.7, 3.3, 3.8, 4.2],
    windKt: [26, 25, 23, 19, 16, 15, 14, 15, 18, 21, 24, 26],
  }),
  // Berlin; North Sea waters.
  z('central_europe', [43, 60], [-5, 23], 52.5, 0.4, {
    tempC: [0.6, 1.4, 4.8, 9.6, 14.2, 17.3, 19.5, 19.1, 14.9, 10, 5.1, 1.7],
    precipMm: [43, 37, 40, 33, 56, 62, 70, 63, 46, 40, 45, 50],
    cloud: [0.75, 0.7, 0.6, 0.5, 0.5, 0.45, 0.45, 0.45, 0.5, 0.6, 0.75, 0.8],
    waveM: [2.6, 2.4, 2, 1.5, 1.2, 1.1, 1.1, 1.2, 1.6, 2, 2.4, 2.6],
    windKt: [20, 19, 18, 15, 13, 12, 12, 13, 15, 17, 19, 20],
  }),
  // Tel Aviv; eastern Mediterranean waters.
  z('mediterranean', [28, 45], [-10, 36], 32.1, 0.2, {
    tempC: [14, 14.5, 16.5, 19.5, 22.5, 25.5, 27.5, 28, 27, 24, 20, 15.5],
    precipMm: [140, 100, 60, 15, 3, 0, 0, 0, 1, 30, 90, 140],
    cloud: [0.5, 0.45, 0.4, 0.25, 0.1, 0.05, 0.05, 0.05, 0.1, 0.2, 0.35, 0.5],
    waveM: [1.3, 1.3, 1.2, 1, 0.8, 0.7, 0.7, 0.7, 0.8, 1, 1.2, 1.3],
    windKt: [13, 13, 12, 11, 10, 10, 11, 11, 10, 10, 12, 13],
  }),
  // Baghdad; Persian Gulf waters under the summer shamal.
  z('arabia_iran', [12, 40], [36, 65], 33.3, 0.05, {
    tempC: [10, 12.5, 17, 23, 29, 33.5, 35.5, 35, 31, 25, 17, 11.5],
    precipMm: [26, 28, 28, 17, 7, 0, 0, 0, 0, 3, 21, 26],
    cloud: [0.3, 0.3, 0.3, 0.2, 0.1, 0.02, 0.02, 0.02, 0.02, 0.08, 0.2, 0.3],
    waveM: [0.8, 0.9, 0.9, 0.8, 0.7, 0.9, 0.9, 0.8, 0.7, 0.7, 0.8, 0.8],
    windKt: [11, 12, 12, 11, 11, 14, 14, 12, 10, 9, 10, 11],
  }),
  // New Delhi; Arabian Sea and Bay of Bengal waters, rough under the southwest monsoon.
  z('south_asia', [5, 37], [60, 92], 28.6, 0.8, {
    tempC: [14, 17.5, 23, 29, 33, 33.5, 31, 30, 29.5, 26, 20.5, 15.5],
    precipMm: [19, 20, 15, 10, 28, 75, 210, 230, 125, 15, 4, 8],
    cloud: [0.15, 0.15, 0.12, 0.1, 0.15, 0.5, 0.85, 0.85, 0.6, 0.15, 0.08, 0.12],
    waveM: [1.2, 1.1, 1, 1.1, 1.8, 3, 3.5, 3.2, 2.2, 1.2, 1.1, 1.2],
    windKt: [10, 10, 10, 11, 14, 20, 22, 20, 15, 10, 10, 10],
    cyclone: [0, 0, 0, 0.005, 0.02, 0.01, 0, 0, 0.005, 0.015, 0.02, 0.01],
  }),
  // Taipei; Taiwan Strait waters. The northeast monsoon raises 2-3 m seas from October to March and
  // typhoons come from July to September, which leaves April and October as the windows for a
  // crossing (CSIS, "The First Battle of the Next War", 2023; Ian Easton, "The Chinese Invasion
  // Threat", 2017). May and June bring the plum rains: low cloud over calmer water.
  z('taiwan_east_china', [18, 32], [110, 128], 25, 0.3, {
    tempC: [16.1, 16.5, 18.5, 22, 25.2, 27.8, 29.6, 29.2, 27.4, 24.5, 21.5, 17.9],
    precipMm: [83, 170, 180, 177, 230, 325, 245, 322, 360, 148, 83, 73],
    cloud: [0.75, 0.75, 0.7, 0.6, 0.7, 0.65, 0.4, 0.4, 0.45, 0.5, 0.6, 0.7],
    waveM: [2.4, 2.2, 1.8, 1.3, 1.1, 1.2, 1.2, 1.3, 1.6, 1.6, 2.2, 2.5],
    windKt: [20, 19, 16, 12, 10, 11, 12, 12, 14, 17, 20, 21],
    cyclone: [0, 0, 0, 0, 0.01, 0.03, 0.08, 0.1, 0.08, 0.03, 0.01, 0],
  }),
  // Yangon; South China Sea and Andaman waters.
  z('southeast_asia', [-10, 28], [92, 128], 16.8, 0.7, {
    tempC: [25, 26.5, 28.5, 30, 28.5, 27, 26.5, 26.5, 27, 27.5, 27, 25.5],
    precipMm: [5, 3, 10, 30, 300, 550, 560, 560, 370, 190, 60, 10],
    cloud: [0.1, 0.1, 0.15, 0.25, 0.6, 0.9, 0.9, 0.9, 0.8, 0.5, 0.25, 0.12],
    waveM: [1.8, 1.5, 1.2, 1, 1, 1.6, 1.8, 1.8, 1.4, 1.4, 1.8, 2],
    windKt: [15, 13, 11, 9, 10, 14, 15, 15, 12, 12, 15, 16],
    cyclone: [0, 0, 0, 0, 0.01, 0.01, 0.03, 0.04, 0.04, 0.04, 0.03, 0.01],
  }),
  // Seoul; Yellow Sea and Sea of Japan waters.
  z('korea_japan_north_china', [32, 46], [105, 146], 37.6, 0.4, {
    tempC: [-2, 0.6, 6.3, 12.8, 18.4, 22.8, 25.3, 26.1, 21.6, 14.8, 7.2, 0.4],
    precipMm: [16, 28, 37, 72, 103, 134, 415, 348, 141, 52, 52, 22],
    cloud: [0.35, 0.35, 0.45, 0.5, 0.5, 0.6, 0.8, 0.7, 0.5, 0.35, 0.4, 0.35],
    waveM: [1.8, 1.7, 1.4, 1.1, 0.9, 0.9, 1, 1.1, 1.3, 1.4, 1.7, 1.9],
    windKt: [17, 16, 14, 12, 10, 10, 11, 11, 12, 14, 16, 17],
    cyclone: [0, 0, 0, 0, 0, 0.01, 0.03, 0.04, 0.03, 0.01, 0, 0],
  }),
  // Guam; open western Pacific.
  z('west_pacific', [0, 32], [128, 180], 13.5, 0.3, {
    tempC: [26.5, 26.5, 27, 27.5, 28, 28, 27.5, 27.5, 27.5, 27.5, 27.5, 27],
    precipMm: [120, 100, 80, 100, 130, 180, 300, 400, 380, 320, 220, 150],
    cloud: [0.4, 0.35, 0.3, 0.3, 0.35, 0.45, 0.6, 0.65, 0.65, 0.6, 0.5, 0.45],
    waveM: [2.2, 2.1, 1.9, 1.6, 1.4, 1.4, 1.5, 1.6, 1.8, 2, 2.2, 2.3],
    windKt: [17, 17, 16, 15, 13, 12, 12, 12, 12, 13, 15, 17],
    cyclone: [0.005, 0, 0, 0.005, 0.01, 0.02, 0.04, 0.05, 0.05, 0.04, 0.02, 0.01],
  }),
  // Novosibirsk; Kazakhstan and Siberia, with a spring and autumn rasputitsa of their own.
  z('siberia', [46, 75], [60, 180], 55, 0.8, {
    tempC: [-16.5, -14.5, -6.5, 4, 11.5, 17.5, 19.5, 16.5, 10.5, 3, -7.5, -14],
    precipMm: [20, 15, 15, 25, 40, 60, 70, 60, 45, 35, 30, 25],
    cloud: [0.6, 0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 0.6, 0.65, 0.75, 0.8, 0.65],
    waveM: [2.5, 2.4, 2, 1.6, 1.3, 1.2, 1.2, 1.4, 1.8, 2.2, 2.5, 2.6],
    windKt: [18, 18, 16, 14, 12, 11, 11, 12, 14, 16, 18, 18],
  }),
  // Chicago; western North Atlantic hurricane track along the US coast.
  z('north_america', [25, 60], [-130, -60], 41.9, 0.4, {
    tempC: [-4.6, -2.5, 3.2, 9.6, 15.6, 21, 23.8, 22.9, 18.8, 12, 4.9, -1.2],
    precipMm: [50, 48, 63, 92, 105, 103, 94, 102, 85, 86, 72, 55],
    cloud: [0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4, 0.4, 0.45, 0.5, 0.65, 0.7],
    waveM: [2.8, 2.7, 2.4, 2, 1.6, 1.4, 1.3, 1.4, 1.8, 2.2, 2.5, 2.8],
    windKt: [20, 20, 19, 17, 14, 13, 12, 12, 15, 17, 19, 20],
    cyclone: [0, 0, 0, 0, 0, 0.005, 0.01, 0.03, 0.04, 0.02, 0.005, 0],
  }),
];

/** Day of the year, 0-based (1 January is 0). */
export function dayOfYear(date: Date): number {
  return Math.floor((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86_400_000);
}

const MONTH_DAYS = 365.25 / 12;

/** A monthly normal at a day of the year, linear between mid-months. */
function monthly(m: Monthly, doy: number): number {
  const x = doy / MONTH_DAYS - 0.5;
  const i = Math.floor(x), f = x - i;
  return m[(i + 12) % 12] * (1 - f) + m[(i + 13) % 12] * f;
}

export function zoneAt(lat: number, lon: number): Zone | undefined {
  for (const zn of ZONES) if (lat >= zn.lat[0] && lat < zn.lat[1] && lon >= zn.lon[0] && lon < zn.lon[1]) return zn;
  return undefined;
}

/** One day's climatological normal at a place. */
interface Normal {
  tempC: number;
  /** Day-to-day spread of temperature, degrees C: wide in a continental winter, narrow in the tropics. */
  tempSdC: number;
  precipMm: number;
  cloud: number;
  waveM: number;
  windKt: number;
  cyclone: number;
  mudSoil: number;
}

/** 0 in high summer, 1 in deep winter, for the hemisphere of `lat`. The seasons lag the solstices by about four weeks. */
function winterness(lat: number, doy: number): number {
  const w = (1 + Math.cos((2 * Math.PI * (doy - 15)) / 365.25)) / 2;
  return lat >= 0 ? w : 1 - w;
}

/**
 * Normal weather at a latitude in a zone (zoneAt) and day of the year. Inside a zone: the station's normals, with
 * temperature shifted by distance from the station (0.8 C per degree of latitude in winter,
 * 0.35 in summer: the meridional gradient of ERA5 monthly means over Eurasia). Elsewhere: a
 * latitude-only climate, annual mean 27 C at the equator falling with the square of latitude and
 * a seasonal swing growing toward the poles, with mid-ocean waves that rise toward the stormy
 * 50s in winter.
 */
export function normalAt(lat: number, zn: Zone | undefined, doy: number): Normal {
  const winter = winterness(lat, doy);
  const tempSdC = 1 + Math.min(1, Math.abs(lat) / 60) * (1.5 + 3 * winter);
  if (zn) {
    const lapse = 0.35 + 0.45 * winter;
    return {
      tempC: monthly(zn.tempC, doy) - lapse * (Math.abs(lat) - Math.abs(zn.stationLat)),
      tempSdC,
      precipMm: monthly(zn.precipMm, doy) / MONTH_DAYS,
      cloud: monthly(zn.cloud, doy),
      waveM: monthly(zn.waveM, doy),
      windKt: monthly(zn.windKt, doy),
      cyclone: zn.cyclone ? monthly(zn.cyclone, doy) : 0,
      mudSoil: zn.mudSoil,
    };
  }
  const a = Math.abs(lat);
  const storm = Math.min(1, Math.max(0, (a - 25) / 30));
  return {
    tempC: 27 - 0.0085 * a * a + 0.25 * a * (0.5 - winter) * 2,
    tempSdC,
    precipMm: 2.3,
    cloud: 0.35 + 0.3 * storm * (0.5 + 0.5 * winter),
    waveM: 1.4 + 2.6 * storm * (0.6 + 0.4 * winter),
    windKt: 12 + 12 * storm * (0.6 + 0.4 * winter),
    cyclone: 0,
    mudSoil: 0.3,
  };
}

/** Hours from sunset to sunrise at a latitude on a day of the year (solar declination; no twilight). */
export function nightHours(lat: number, doy: number): number {
  const decl = (23.44 * Math.PI) / 180 * Math.sin((2 * Math.PI * (284 + doy + 1)) / 365);
  const cosH = -Math.tan((lat * Math.PI) / 180) * Math.tan(decl);
  const day = cosH <= -1 ? 24 : cosH >= 1 ? 0 : (2 * Math.acos(cosH) * 180) / Math.PI / 15;
  return 24 - day;
}

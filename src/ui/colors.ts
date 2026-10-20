/**
 * Nation colors. A nation's color depends only on its id and blocs, so it never
 * shifts between runs or when other nations change. Members of a bloc share a
 * hue family (NATO blues, CSTO reds); unaligned nations get muted, low-saturation
 * hues so the blocs stand out.
 */

export type Rgb = readonly [number, number, number];

/** First matching bloc wins, so a nation in NATO and the EU reads as NATO. */
const BLOC_HUES: readonly [bloc: string, hue: number][] = [
  ['NATO', 214],
  ['CSTO', 2],
  ['AUKUS', 196],
  ['EU', 228],
  ['SCO', 22],
  ['QUAD', 180],
  ['ANZUS', 200],
  ['AXIS_OF_RESISTANCE', 300],
  ['GCC', 140],
  ['ASEAN', 160],
  ['AU', 46],
];

const HUE_SPREAD = 26;

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export interface NationColor {
  hsl: readonly [number, number, number];
  rgb: Rgb;
  css: string;
}

export function nationColor(id: string, blocs: readonly string[]): NationColor {
  const h = hash(id);
  const bloc = BLOC_HUES.find(([b]) => blocs.includes(b));
  const jitter = ((h & 0xff) / 255 - 0.5) * HUE_SPREAD;
  const light = 40 + ((h >>> 8) % 18);
  const hsl: [number, number, number] = bloc
    ? [(bloc[1] + jitter + 360) % 360, 52 + ((h >>> 16) % 20), light]
    : [h % 360, 14 + ((h >>> 16) % 14), light - 4];
  const rgb = hslToRgb(...hsl);
  return { hsl, rgb, css: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` };
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

export function rgba([r, g, b]: Rgb, a: number): string {
  return `rgba(${r},${g},${b},${a})`;
}

/** Cache keyed by id; blocs are fixed for a session. */
export class Palette {
  private readonly cache = new Map<string, NationColor>();
  constructor(private readonly blocsOf: (id: string) => readonly string[]) {}
  of(id: string): NationColor {
    let c = this.cache.get(id);
    if (!c) this.cache.set(id, (c = nationColor(id, this.blocsOf(id))));
    return c;
  }
}

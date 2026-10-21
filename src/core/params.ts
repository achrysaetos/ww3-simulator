/**
 * Calibration knobs as tagged parameters. A knob that decides outcomes is declared
 * once with its default, a plausible range, how well the evidence pins it down, and
 * where the number comes from. Systems read it through the getter `defineParam`
 * returns. The engine wraps each step in `withParams(world.params)`, so a World can
 * carry its own overrides and a saved run replays with them; the forecast runner
 * sweeps the ranges.
 */

/**
 * How well the evidence pins a number down (issue #2, section 2):
 * - observed: measured directly in the cited source
 * - estimated: derived from published figures with stated arithmetic
 * - judgment: set by the modeller, usually tuned to land a realism band
 * - contested: published sources or schools disagree on it
 * - scenario: an assumption about the situation rather than about how war works
 */
export type ParamTag = 'observed' | 'estimated' | 'judgment' | 'contested' | 'scenario';

export interface ParamDef {
  /** `<domain>.<CONSTANT_NAME>`, e.g. `land.KILL_ZONE_COMMIT`. */
  id: string;
  value: number;
  /** Plausible low and high, inclusive. */
  range: [number, number];
  tag: ParamTag;
  /** Citation, or 'judgment' with the reason. */
  source: string;
  /** What it moves, in a few words. */
  affects: string;
}

const defs: ParamDef[] = [];
const slot = new Map<string, number>();
/** The value each getter returns: the defaults, or the overrides of the step in progress. */
const active: number[] = [];
let activeOverrides: Readonly<Record<string, number>> | undefined;

export function defineParam(def: ParamDef): () => number {
  const [lo, hi] = def.range;
  if (!(lo <= def.value && def.value <= hi)) throw new Error(`param ${def.id}: default ${def.value} outside its range [${lo}, ${hi}]`);
  // A module evaluated again (hot reload) redefines its params in place; tests/params.test.ts keeps ids unique across the source.
  const i = slot.get(def.id) ?? defs.length;
  const own: ParamDef = { ...def, range: [lo, hi] };
  defs[i] = Object.freeze(own);
  slot.set(def.id, i);
  active[i] = activeOverrides?.[def.id] ?? def.value;
  return () => active[i];
}

export function paramRegistry(): readonly ParamDef[] {
  return defs;
}

export function paramDef(id: string): ParamDef | undefined {
  const i = slot.get(id);
  return i === undefined ? undefined : defs[i];
}

/** Names the first override that is not a known param set to a finite number, or null. */
export function overrideProblem(overrides: Readonly<Record<string, number>>): string | null {
  for (const [id, v] of Object.entries(overrides)) {
    if (!slot.has(id)) return `unknown param ${id}`;
    if (typeof v !== 'number' || !Number.isFinite(v)) return `param ${id} must be a finite number, got ${JSON.stringify(v)}`;
  }
  return null;
}

function apply(overrides: Readonly<Record<string, number>> | undefined): void {
  const problem = overrides && overrideProblem(overrides);
  if (problem) throw new Error(problem);
  activeOverrides = overrides;
  for (let i = 0; i < defs.length; i++) active[i] = defs[i].value;
  for (const id in overrides) active[slot.get(id)!] = overrides[id];
}

/** Runs `fn` with `overrides` in force for every param getter, then restores what was in force before. */
export function withParams<T>(overrides: Readonly<Record<string, number>> | undefined, fn: () => T): T {
  const outer = activeOverrides;
  if (overrides === outer) return fn();
  apply(overrides);
  try {
    return fn();
  } finally {
    apply(outer);
  }
}

const TABLE_PARAM: unique symbol = Symbol('table param');
/** A tagged param written inline in a table of constants; `paramTable` gives it an id from its key. */
export interface TableParam extends Omit<ParamDef, 'id'> {
  readonly [TABLE_PARAM]: true;
}
export const tableParam = (def: Omit<ParamDef, 'id'>): TableParam => ({ ...def, [TABLE_PARAM]: true });

export type ParamTable<T> = { readonly [K in keyof T]: T[K] extends TableParam ? number : T[K] };

/**
 * A table whose `tableParam` entries become `<prefix>.<key>` params, read through property getters,
 * so `TABLE.key` stays the read at every call site. Other entries are copied as they are.
 */
export function paramTable<T extends object>(prefix: string, table: T): ParamTable<T> {
  const out = {};
  for (const [key, v] of Object.entries(table)) {
    if (typeof v === 'object' && v !== null && TABLE_PARAM in v) {
      const { value, range, tag, source, affects } = v as TableParam;
      Object.defineProperty(out, key, { get: defineParam({ id: `${prefix}.${key}`, value, range, tag, source, affects }), enumerable: true });
    } else Object.defineProperty(out, key, { value: v, enumerable: true });
  }
  return Object.freeze(out) as ParamTable<T>;
}

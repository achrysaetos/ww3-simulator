/**
 * Saving and resuming a run. A save is the World as JSON plus the scenario it came
 * from; runtime caches (supply searches, AI front pictures) are rebuilt from the
 * World on first use, so a resumed run steps exactly as the uninterrupted one would.
 */
import { Engine } from '../core/engine';
import type { World } from '../core/types';
import { loadCatalog } from '../data/catalog';
import { loadMap } from '../data/load';
import { SYSTEMS } from '../systems';
import { SCENARIOS, type Session } from '.';

const FORMAT = 'ww3-save';
// 2: land airheads and AI airborne operations.
// 3: the AI remembers the last order it sent each formation.
const VERSION = 3;

export interface SaveFile {
  format: typeof FORMAT;
  version: typeof VERSION;
  scenario: string;
  world: World;
}

export type ResumedSession = Omit<Session, 'placement'>;

/**
 * Paths under `value` that JSON would not give back as they are: class instances
 * (Set, Map, typed arrays), functions, non-finite numbers, and holes or undefined in
 * arrays. An undefined object property is allowed, since JSON drops it and reading
 * it gives undefined either way.
 */
export function jsonViolations(value: unknown, path = 'world', out: string[] = [], limit = 20): string[] {
  if (out.length >= limit || value === null || typeof value === 'string' || typeof value === 'boolean') return out;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) out.push(`${path}: ${value}`);
    return out;
  }
  if (typeof value !== 'object') {
    out.push(`${path}: ${typeof value}`);
    return out;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (value[i] === undefined) out.push(`${path}[${i}]: undefined`);
      else jsonViolations(value[i], `${path}[${i}]`, out, limit);
    }
    return out;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    out.push(`${path}: ${proto?.constructor?.name ?? 'object'} instance`);
    return out;
  }
  for (const k in value) {
    const v = (value as Record<string, unknown>)[k];
    if (v !== undefined) jsonViolations(v, `${path}.${k}`, out, limit);
  }
  return out;
}

export function saveRun(scenario: string, world: World): string {
  const bad = jsonViolations(world);
  if (bad.length) throw new Error(`world is not plain JSON, so it cannot be saved:\n  ${bad.join('\n  ')}`);
  return JSON.stringify({ format: FORMAT, version: VERSION, scenario, world } satisfies SaveFile);
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Names the first thing wrong with a save's World, or null when its shape and JSON invariants hold. */
function worldProblem(w: unknown, mapSize: number): string | null {
  if (!isRecord(w)) return 'save has no world';
  for (const k of ['seed', 'rngState', 'tick', 'dtHours', 'nextId'])
    if (typeof w[k] !== 'number' || !Number.isFinite(w[k])) return `world.${k} must be a finite number, got ${JSON.stringify(w[k])}`;
  if (!Number.isInteger(w.tick) || (w.tick as number) < 0) return `world.tick must be a whole number of at least 0, got ${w.tick}`;
  if ((w.dtHours as number) <= 0 || 24 % (w.dtHours as number) !== 0) return `world.dtHours must divide 24, got ${w.dtHours}`;
  if (typeof w.startDate !== 'string' || Number.isNaN(Date.parse(w.startDate))) return `world.startDate must be an ISO date, got ${JSON.stringify(w.startDate)}`;
  for (const k of ['nations', 'formations', 'relations', 'theater', 'slices'])
    if (!isRecord(w[k])) return `world.${k} is missing or not an object`;
  for (const k of ['control', 'pending', 'events', 'history'])
    if (!Array.isArray(w[k])) return `world.${k} is missing or not an array`;
  if ((w.control as unknown[]).length !== mapSize) return `save was made on a different map (${(w.control as unknown[]).length} nodes, this build has ${mapSize})`;
  const bad = jsonViolations(w);
  if (bad.length) return `world is not plain JSON:\n  ${bad.join('\n  ')}`;
  return rangeProblem(w as unknown as World);
}

/**
 * The richest state's treasury is a few trillion dollars; a war chest a hundred times that
 * is a tampered or corrupt save, not a strategy.
 */
const TREASURY_LIMIT_USD_B = 1e5;

/** Names the first count, share or reference in the World that no run can produce, or null. */
function rangeProblem(w: World): string | null {
  const count = (v: unknown) => typeof v === 'number' && v >= 0;
  const share = (v: unknown) => typeof v === 'number' && v >= 0 && v <= 1;
  const counts = (where: string, r: unknown): string | null => {
    if (!isRecord(r)) return `${where} is not an object`;
    for (const [k, v] of Object.entries(r)) if (!count(v)) return `${where}.${k} must be a count of at least 0, got ${JSON.stringify(v)}`;
    return null;
  };
  for (const [id, f] of Object.entries(w.formations)) {
    if (!isRecord(f)) return `formation ${id} is not an object`;
    const at = `formation ${id}`;
    const problem = counts(`${at} equipment`, f.equipment) ?? counts(`${at} damaged`, f.damaged) ?? counts(`${at} magazine`, f.magazine) ?? counts(`${at} supply`, f.supply) ?? counts(`${at} supplyCapacity`, f.supplyCapacity);
    if (problem) return problem;
    if (!count(f.personnel)) return `${at} personnel must be at least 0, got ${f.personnel}`;
    for (const k of ['readiness', 'morale', 'experience', 'fatigue', 'entrenchment'] as const) if (!share(f[k])) return `${at} ${k} must lie in 0..1, got ${f[k]}`;
    if (!(f.nation in w.nations)) return `${at} belongs to unknown nation ${f.nation}`;
    if (!Number.isInteger(f.node) || f.node < 0 || f.node >= w.control.length) return `${at} stands on no node of this map (${f.node})`;
  }
  for (const [id, n] of Object.entries(w.nations)) {
    if (!isRecord(n)) return `nation ${id} is not an object`;
    const at = `nation ${id}`;
    for (const k of ['population', 'reserves', 'reservists'] as const) if (!count(n[k])) return `${at} ${k} must be at least 0, got ${n[k]}`;
    for (const k of ['mobilization', 'warSupport'] as const) if (!share(n[k])) return `${at} ${k} must lie in 0..1, got ${n[k]}`;
    const problem = counts(`${at} stockpile`, n.stockpile) ?? counts(`${at} bulk`, n.bulk);
    if (problem) return problem;
    if (typeof n.treasuryUsdB !== 'number' || Math.abs(n.treasuryUsdB) > TREASURY_LIMIT_USD_B) return `${at} treasury of ${n.treasuryUsdB} billion USD is beyond any state's`;
  }
  for (let i = 0; i < w.control.length; i++) if (w.control[i] && !(w.control[i] in w.nations)) return `node ${i} is held by unknown nation ${w.control[i]}`;
  return null;
}

/** Parses a save and builds an engine around it. No system is re-initialised: the World carries every system's state. */
export function resumeRun(text: string): ResumedSession {
  let save: Partial<SaveFile>;
  try {
    save = JSON.parse(text) as Partial<SaveFile>;
  } catch {
    throw new Error('not a ww3 save file (not valid JSON)');
  }
  if (!isRecord(save) || save.format !== FORMAT) throw new Error('not a ww3 save file');
  if (save.version !== VERSION) throw new Error(`save format version ${save.version} is not supported; this build reads version ${VERSION}`);
  const scenario = SCENARIOS.find((s) => s.id === save.scenario);
  if (!scenario) throw new Error(`save is from unknown scenario ${save.scenario}`);
  const map = loadMap();
  const problem = worldProblem(save.world, map.size);
  if (problem) throw new Error(problem);
  const catalog = loadCatalog();
  return { map, catalog, engine: new Engine(map, catalog, SYSTEMS), world: save.world as World, scenario };
}

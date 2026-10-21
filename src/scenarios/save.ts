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

/** Parses a save and builds an engine around it. No system is re-initialised: the World carries every system's state. */
export function resumeRun(text: string): ResumedSession {
  const save = JSON.parse(text) as Partial<SaveFile>;
  if (save.format !== FORMAT) throw new Error('not a ww3 save file');
  if (save.version !== VERSION) throw new Error(`save format version ${save.version} is not supported; this build reads version ${VERSION}`);
  const scenario = SCENARIOS.find((s) => s.id === save.scenario);
  if (!scenario) throw new Error(`save is from unknown scenario ${save.scenario}`);
  const map = loadMap();
  const world = save.world!;
  if (world?.control?.length !== map.size) throw new Error(`save was made on a different map (${world?.control?.length} nodes, this build has ${map.size})`);
  const catalog = loadCatalog();
  return { map, catalog, engine: new Engine(map, catalog, SYSTEMS), world, scenario };
}

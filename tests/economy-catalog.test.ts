import { describe, expect, it } from 'vitest';
import type { ItemId, MunitionId, PlatformId } from '../src/core/types';
import { createWorld } from '../src/core/world';
import { loadCatalog } from '../src/data/catalog';
import { AID_FLOWS, ITEMS, LINES, initialStockpiles } from '../src/data/industry';
import { loadMap } from '../src/data/load';
import { allOrbat } from '../src/data/orbat';
import { ALIASES } from '../src/data/orbat/aliases';
import { placeOrbat } from '../src/scenarios/build';

/**
 * Lines whose output no formation of that nation fields at the start. Each is deliberate:
 * the item goes to a stockpile for export or a future formation, or the ORBAT has no carrier yet.
 */
// UKR:fpv: Ukraine's ORBAT has no FPV drone teams yet, though FPVs caused most 2024-25 front-line losses (RUSI).
const NOT_FIELDED = new Set(['GBR:storm_shadow', 'CHN:shahed136', 'UKR:fpv']);

describe('industry against the catalog and the orders of battle', () => {
  const catalog = loadCatalog();
  const map = loadMap();
  const world = createWorld(map);
  placeOrbat(world, map, catalog, allOrbat(map), ALIASES);
  const fielded = new Set<string>();
  for (const f of Object.values(world.formations)) for (const k of [...Object.keys(f.equipment), ...Object.keys(f.magazine)]) fielded.add(`${f.nation}:${k}`);
  const known = (id: ItemId) => catalog.platforms.has(id as PlatformId) || catalog.munitions.has(id as MunitionId);

  it('produces only items the catalog knows, so output is never silently dropped', () => {
    const unknown = Object.values(ITEMS).filter((s) => s.sink.kind === 'stockpile' && !known(s.id)).map((s) => s.id);
    expect(unknown).toEqual([]);
  });

  it('delivers every stockpiled line to an item that nation actually fields', () => {
    const orphan: string[] = [];
    for (const [nation, lines] of Object.entries(LINES))
      for (const l of lines) {
        const spec = ITEMS[l.item];
        const key = `${nation}:${spec.id}`;
        if (spec.sink.kind === 'stockpile' && !fielded.has(key) && !NOT_FIELDED.has(key)) orphan.push(key);
      }
    expect(orphan).toEqual([]);
  });

  it('ships aid only in items the recipient fields', () => {
    const orphan = AID_FLOWS.filter((f) => ITEMS[f.item].sink.kind === 'stockpile' && !fielded.has(`${f.recipient}:${ITEMS[f.item].id}`)).map((f) => `${f.donor}>${f.recipient}:${f.item}`);
    expect(orphan).toEqual([]);
  });

  it('keeps every initial war-reserve item when the scenario builder filters by catalog', () => {
    const dropped: string[] = [];
    for (const n of Object.values(world.nations)) for (const id of Object.keys(initialStockpiles(n).stockpile)) if (!known(id as ItemId)) dropped.push(`${n.id}:${id}`);
    expect(dropped).toEqual([]);
  });
});

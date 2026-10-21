import type { Catalog } from './catalog';
import { newId } from './engine';
import type { Formation, FormationId, NodeId, PlatformId, World } from './types';

export type FormationSpec = Pick<Formation, 'nation' | 'name' | 'kind' | 'echelon' | 'node' | 'equipment'> & Partial<Formation>;

/** Create a formation at full strength with supply sized to its equipment, and add it to the world. */
export function addFormation(world: World, catalog: Catalog, spec: FormationSpec): Formation {
  const id = spec.id ?? newId<FormationId>(world, 'f');
  const cap = supplyCapacityOf(catalog, spec.equipment);
  const magazine: Formation['magazine'] = {};
  for (const [pid, n] of Object.entries(spec.equipment))
    for (const l of catalog.platform(pid as PlatformId).loadout) magazine[l.munition] = (magazine[l.munition] ?? 0) + l.count * n;
  const f: Formation = {
    id,
    home: spec.node,
    damaged: {},
    personnel: personnelOf(catalog, spec.equipment),
    magazine,
    supply: { ...cap },
    supplyCapacity: cap,
    readiness: 0.8,
    morale: 0.7,
    experience: 0.5,
    fatigue: 0,
    entrenchment: 0,
    progressKm: 0,
    order: { posture: 'defend', issuedTick: world.tick },
    status: 'active',
    ...spec,
  };
  world.formations[id] = f;
  return f;
}

/** Three days of fuel at full operation and a basic load of ammunition, the usual unit-level stockage. */
export function supplyCapacityOf(catalog: Catalog, equipment: Record<PlatformId, number>): Formation['supplyCapacity'] {
  let fuel = 0, ammo = 0, crew = 0;
  for (const [pid, n] of Object.entries(equipment)) {
    const p = catalog.platform(pid as PlatformId);
    fuel += p.mobility.fuelTonsPerHour * 72 * n;
    const fp = Object.values(p.firepower).reduce((a, b) => a + (b ?? 0), 0);
    ammo += (0.5 + fp * 2) * n;
    crew += p.crew * n;
  }
  return { fuel: Math.round(fuel), ammo: Math.round(ammo), food: Math.round(crew * 0.002 * 10) };
}

export function personnelOf(catalog: Catalog, equipment: Record<PlatformId, number>): number {
  let crew = 0;
  for (const [pid, n] of Object.entries(equipment)) crew += catalog.platform(pid as PlatformId).crew * n;
  // Support tail: roughly two support troops per crewman/rifleman in a modern force.
  return Math.round(crew * 3);
}

export function formationsAt(world: World, node: NodeId): Formation[] {
  return Object.values(world.formations).filter((f) => f.node === node && f.status !== 'destroyed');
}

export function platformCount(f: Formation): number {
  let n = 0;
  for (const v of Object.values(f.equipment)) n += v;
  return n;
}
